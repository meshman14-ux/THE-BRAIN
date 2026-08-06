/**
 * Two-way calendar sync — the rules, as pure functions.
 *
 * Locked decision 8, which every function here exists to honour:
 *
 *   - **THE BRAIN writes ONLY to its own dedicated Google calendar.** Never
 *     the main one. `assertWritable` is that guarantee written down, and it
 *     is the first thing every write path calls.
 *   - **`calendar_sync` maps task ↔ event with etag.**
 *   - **Deletes unschedule, never destroy.** An event deleted in Google
 *     clears the task's `do_date`. It never deletes the task. A calendar is
 *     somewhere you decide *when*; it is not where work goes to die.
 *   - **Conflicts are logged and surfaced, never auto-resolved.** When both
 *     sides moved, the system stops and asks. Picking a winner silently is
 *     how a sync quietly eats a decision.
 *
 * Nothing here talks to Google or Supabase — that is `google.ts` and the
 * route handlers. Everything here is decided from plain data so the rules
 * can be tested without a network, which matters more than usual: the
 * consequence of getting them wrong is a mangled calendar.
 */

import type { Task, TaskStatus } from "./types";
import { addDays, isOpenWork, toTextOrNull } from "./logic";

/* ------------------------------------------------------------------ *
 * The dedicated calendar
 * ------------------------------------------------------------------ */

/** What THE BRAIN calls the calendar it makes for itself. */
export const BRAIN_CALENDAR_NAME = "THE BRAIN";

export const BRAIN_CALENDAR_DESCRIPTION =
  "Created and written to by THE BRAIN OS. Tasks with a do-date appear here. Deleting an event here unschedules the task rather than deleting it.";

/**
 * Ids that are never a legitimate write target.
 *
 * `primary` is Google's alias for whichever calendar is the account's main
 * one, so it is the single most dangerous string that could end up in
 * `calendar_id` — one bad write and THE BRAIN is scribbling on his real
 * diary. It is refused by name, and the account's primary id is refused
 * alongside it because the alias is not the only way to name it.
 */
export const RESERVED_CALENDAR_IDS = ["primary", "default"];

export type CalendarTarget = {
  /** The id we intend to write to. */
  calendarId: string | null;
  /** The account's primary calendar id, which is usually the email address. */
  primaryId: string | null;
};

/**
 * Whether a calendar id may be written to.
 *
 * Deliberately a whitelist-of-shape rather than a blacklist of one string:
 * an empty id, a missing id, the `primary` alias and the account's actual
 * primary all fail, and so does any casing or padding variant of them.
 */
export function isWritableCalendar(t: CalendarTarget): boolean {
  const id = toTextOrNull(t.calendarId);
  if (id == null) return false;
  const key = id.toLowerCase();
  if (RESERVED_CALENDAR_IDS.includes(key)) return false;
  const primary = toTextOrNull(t.primaryId)?.toLowerCase();
  if (primary != null && key === primary) return false;
  return true;
}

/**
 * The guard every write goes through. Throws rather than returning false,
 * because a caller that forgets to check the boolean is exactly the bug
 * this is here to prevent.
 */
export function assertWritable(t: CalendarTarget): string {
  if (!isWritableCalendar(t)) {
    throw new Error(
      `Refusing to write to calendar "${t.calendarId ?? "(none)"}". THE BRAIN writes only to its own dedicated calendar (locked decision 8).`
    );
  }
  return t.calendarId as string;
}

/* ------------------------------------------------------------------ *
 * What is in scope
 * ------------------------------------------------------------------ */

/**
 * How far either side of today the sync reaches.
 *
 * Bounded on purpose. An unbounded sync would re-push years of finished
 * work every time, and the calendar is for deciding what to do next — not
 * an archive.
 */
export const SYNC_WINDOW_BACK = 14;
export const SYNC_WINDOW_FORWARD = 90;

export function inSyncWindow(
  doDate: string | null | undefined,
  todayIso: string
): boolean {
  const d = toTextOrNull(doDate);
  if (d == null) return false;
  return (
    d >= addDays(todayIso, -SYNC_WINDOW_BACK) &&
    d <= addDays(todayIso, SYNC_WINDOW_FORWARD)
  );
}

/**
 * A task belongs on the calendar when it has a *do* date inside the window.
 *
 * `do_date`, never `due_date`: due is a fact about the world, do is a
 * decision, and a calendar is a record of decisions. Putting due dates on
 * it would fill the week with things he never agreed to do that day.
 *
 * A dropped task is out — that decision was to not do it at all.
 */
export function belongsOnCalendar(
  task: Pick<Task, "do_date" | "status">,
  todayIso: string
): boolean {
  if (task.status === "dropped") return false;
  return inSyncWindow(task.do_date, todayIso);
}

/* ------------------------------------------------------------------ *
 * Times — optional, and read defensively out of jsonb
 * ------------------------------------------------------------------ */

export type TaskTime = { start: string; end: string };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * A task's time of day, if it has one.
 *
 * Nothing in THE BRAIN sets this yet — it exists because Google does. Drag
 * an event to 2pm over there and the pull writes `meta.time` here, so the
 * time he chose survives the next push instead of being flattened back to
 * an all-day block. `meta` is jsonb, so every field is validated.
 */
export function readTaskTime(meta: unknown): TaskTime | null {
  const m = (meta ?? {}) as Record<string, unknown>;
  const t = m.time;
  if (t == null || typeof t !== "object" || Array.isArray(t)) return null;
  const o = t as Record<string, unknown>;
  const start = typeof o.start === "string" ? o.start.trim() : "";
  const end = typeof o.end === "string" ? o.end.trim() : "";
  if (!HHMM.test(start) || !HHMM.test(end)) return null;
  // An end before the start is not a time, it is a typo somebody's API made.
  if (end <= start) return null;
  return { start, end };
}

/** Jay is in the UK, and an event without a zone is an event that drifts. */
export const TIME_ZONE = "Europe/London";

/**
 * The cookie the OAuth callback checks against the `state` Google returns,
 * so a link someone else crafted cannot start a connection on his account.
 */
export const STATE_COOKIE = "brain-cal-state";

/* ------------------------------------------------------------------ *
 * The event a task should be
 * ------------------------------------------------------------------ */

export type EventDate = { date: string } | { dateTime: string; timeZone: string };

export type EventDraft = {
  summary: string;
  description: string;
  start: EventDate;
  end: EventDate;
  extendedProperties: { private: Record<string, string> };
};

/** The key that marks an event as ours, so a pull can tell them apart. */
export const TASK_ID_PROPERTY = "brain_task_id";

/** Finished work keeps its slot and says so, rather than vanishing. */
export const DONE_PREFIX = "✓ ";

/**
 * The event body for a task.
 *
 * All-day unless the task carries a time. Google's all-day `end.date` is
 * **exclusive**, so a one-day event ends the following day — get that wrong
 * and every task renders as a two-day block, or as nothing at all.
 */
export function eventForTask(
  task: Pick<Task, "id" | "title" | "notes" | "do_date" | "status"> & {
    meta?: unknown;
  }
): EventDraft | null {
  const day = toTextOrNull(task.do_date);
  if (day == null) return null;

  const time = readTaskTime(task.meta);
  const start: EventDate = time
    ? { dateTime: `${day}T${time.start}:00`, timeZone: TIME_ZONE }
    : { date: day };
  const end: EventDate = time
    ? { dateTime: `${day}T${time.end}:00`, timeZone: TIME_ZONE }
    : { date: addDays(day, 1) };

  const done = task.status === "done";
  const notes = toTextOrNull(task.notes);

  return {
    summary: `${done ? DONE_PREFIX : ""}${task.title}`.trim(),
    description: [
      notes,
      "Scheduled by THE BRAIN. Move it and the task moves with it; delete it and the task is unscheduled, not deleted.",
    ]
      .filter((s): s is string => s != null)
      .join("\n\n"),
    start,
    end,
    extendedProperties: { private: { [TASK_ID_PROPERTY]: task.id } },
  };
}

/**
 * A stable fingerprint of what we last pushed.
 *
 * This is how "did the task change since the last push?" gets answered
 * without a `tasks.updated_at` column — compare the fingerprint of the task
 * now against the one stored on the link. It has to be stable across runs,
 * so it is built from the fields and never from object key order.
 */
export function eventSignature(draft: EventDraft | null): string {
  if (draft == null) return "";
  const at = (d: EventDate) => ("date" in d ? d.date : d.dateTime);
  return [draft.summary, at(draft.start), at(draft.end), draft.description].join(
    "␟"
  );
}

/* ------------------------------------------------------------------ *
 * The link row
 * ------------------------------------------------------------------ */

export type CalendarLink = {
  id: string;
  task_id: string | null;
  google_event_id: string;
  google_cal_id: string;
  etag: string | null;
  event_start: string | null;
  event_end: string | null;
  last_pushed_at: string | null;
  last_pulled_at: string | null;
  conflict: boolean;
  conflict_note: string | null;
  meta?: Record<string, unknown> | null;
};

/** Where the last-pushed fingerprint lives on the link row. */
export const SIGNATURE_KEY = "signature";

export function readSignature(link: Pick<CalendarLink, "meta">): string {
  const m = (link.meta ?? {}) as Record<string, unknown>;
  return typeof m[SIGNATURE_KEY] === "string" ? (m[SIGNATURE_KEY] as string) : "";
}

/* ------------------------------------------------------------------ *
 * Push — what THE BRAIN should do to Google
 * ------------------------------------------------------------------ */

export type PushAction = "create" | "update" | "delete" | "none";

export type PushPlanItem = {
  action: PushAction;
  task: Pick<Task, "id" | "title" | "notes" | "do_date" | "status"> & {
    meta?: unknown;
  };
  link: CalendarLink | null;
  draft: EventDraft | null;
  /** Why, in one line — shown in the sync log so nothing happens invisibly. */
  reason: string;
};

/**
 * What one task needs doing to it.
 *
 * `delete` here means *the event*, never the task. That is the whole of
 * "deletes unschedule, never destroy" from this direction: taking the day
 * off a task takes it off the calendar and leaves the task exactly where it
 * was, still open, still his to reschedule.
 */
export function pushAction(
  task: Pick<Task, "id" | "title" | "notes" | "do_date" | "status"> & {
    meta?: unknown;
  },
  link: CalendarLink | null,
  todayIso: string
): { action: PushAction; reason: string } {
  const belongs = belongsOnCalendar(task, todayIso);

  if (!belongs) {
    if (link == null) return { action: "none", reason: "no day set" };
    return {
      action: "delete",
      reason:
        task.status === "dropped"
          ? "task dropped — the event goes, the task stays"
          : toTextOrNull(task.do_date) == null
            ? "day cleared — unscheduled, not deleted"
            : "day is outside the sync window",
    };
  }

  if (link == null) return { action: "create", reason: "newly scheduled" };

  // A link the pull marked as conflicted is not pushed over. That is the
  // rule: the system stops and asks rather than picking a side.
  if (link.conflict) {
    return { action: "none", reason: "conflict — waiting on you" };
  }

  const draft = eventForTask(task);
  if (eventSignature(draft) === readSignature(link)) {
    return { action: "none", reason: "unchanged" };
  }
  return { action: "update", reason: "task changed here" };
}

/** The whole push side of a sync, decided before a single request goes out. */
export function planPush(
  tasks: (Pick<Task, "id" | "title" | "notes" | "do_date" | "status"> & {
    meta?: unknown;
  })[],
  links: CalendarLink[],
  todayIso: string
): PushPlanItem[] {
  const byTask = new Map<string, CalendarLink>();
  for (const l of links) if (l.task_id) byTask.set(l.task_id, l);

  return tasks
    .map((task) => {
      const link = byTask.get(task.id) ?? null;
      const { action, reason } = pushAction(task, link, todayIso);
      return { action, task, link, draft: eventForTask(task), reason };
    })
    .filter((p) => p.action !== "none");
}

/**
 * Links whose task has gone entirely.
 *
 * `calendar_sync.task_id` cascades on delete, so a deleted task takes its
 * link with it and leaves the event orphaned in Google. These are the events
 * to tidy up — the only case where deleting an event is not an unscheduling.
 */
export function orphanedLinks(
  links: CalendarLink[],
  taskIds: Set<string>
): CalendarLink[] {
  return links.filter((l) => l.task_id == null || !taskIds.has(l.task_id));
}

/* ------------------------------------------------------------------ *
 * Pull — what Google should do to THE BRAIN
 * ------------------------------------------------------------------ */

/** The bit of a Google event this file cares about. */
export type RemoteEvent = {
  id: string;
  etag?: string | null;
  status?: string | null;
  summary?: string | null;
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
};

export type PullAction =
  /** The event is gone. Clear the day; keep the task. */
  | { kind: "unschedule"; reason: string }
  /** It moved. Follow it. */
  | { kind: "reschedule"; doDate: string; time: TaskTime | null; reason: string }
  | { kind: "none"; reason: string }
  /** Both sides moved. Log it, show it, change nothing. */
  | { kind: "conflict"; note: string };

/** The task id an event claims, if it is one of ours. */
export function taskIdOf(event: RemoteEvent): string | null {
  return toTextOrNull(event.extendedProperties?.private?.[TASK_ID_PROPERTY]);
}

/** The day an event sits on, all-day or timed. */
export function eventDay(event: RemoteEvent): string | null {
  const d = toTextOrNull(event.start?.date);
  if (d != null) return d.slice(0, 10);
  const dt = toTextOrNull(event.start?.dateTime);
  return dt == null ? null : dt.slice(0, 10);
}

/** The time of day an event runs, when it is not an all-day block. */
export function eventTime(event: RemoteEvent): TaskTime | null {
  const s = toTextOrNull(event.start?.dateTime);
  const e = toTextOrNull(event.end?.dateTime);
  if (s == null || e == null) return null;
  const start = s.slice(11, 16);
  const end = e.slice(11, 16);
  if (!HHMM.test(start) || !HHMM.test(end) || end <= start) return null;
  return { start, end };
}

/** Google marks a deleted event `cancelled` rather than dropping it. */
export function isCancelled(event: RemoteEvent): boolean {
  return (event.status ?? "").toLowerCase() === "cancelled";
}

/**
 * What one changed event means for its task.
 *
 * The conflict test is the important half. "The task changed here" is
 * answered by comparing the task's current fingerprint against the one
 * stored when it was last pushed; "the event changed there" is answered by
 * the etag. Both true means both sides moved since they last agreed, and
 * the only honest response is to say so.
 */
export function pullAction(
  event: RemoteEvent,
  link: CalendarLink,
  task: (Pick<Task, "id" | "title" | "notes" | "do_date" | "status"> & {
    meta?: unknown;
  }) | null
): PullAction {
  if (task == null) {
    return { kind: "none", reason: "no task on this link" };
  }

  const remoteChanged =
    toTextOrNull(event.etag) != null && event.etag !== link.etag;
  const localChanged =
    eventSignature(eventForTask(task)) !== readSignature(link);

  if (isCancelled(event)) {
    // A deletion wins over a local edit rather than raising a conflict: he
    // deleted it *just now*, and the worst case is a task that needs a day
    // putting back on it. Nothing is lost either way — the task survives.
    return {
      kind: "unschedule",
      reason: "event deleted in Google — task unscheduled, not deleted",
    };
  }

  if (!remoteChanged) return { kind: "none", reason: "etag unchanged" };

  if (localChanged) {
    return {
      kind: "conflict",
      note: conflictNote(task, event),
    };
  }

  const day = eventDay(event);
  if (day == null) {
    return { kind: "none", reason: "event has no usable date" };
  }
  if (day === toTextOrNull(task.do_date) && sameTime(eventTime(event), readTaskTime(task.meta))) {
    return { kind: "none", reason: "already where the event says" };
  }
  return {
    kind: "reschedule",
    doDate: day,
    time: eventTime(event),
    reason: "moved in Google",
  };
}

function sameTime(a: TaskTime | null, b: TaskTime | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.start === b.start && a.end === b.end;
}

/**
 * The line he reads when both sides moved. It names both versions, because
 * a conflict he cannot see the two sides of is not something he can settle.
 */
export function conflictNote(
  task: Pick<Task, "do_date">,
  event: RemoteEvent
): string {
  const here = toTextOrNull(task.do_date) ?? "no day";
  const there = eventDay(event) ?? "no day";
  return `Both moved. Here: ${here}. Google: ${there}. Nothing has been changed — pick one.`;
}

/* ------------------------------------------------------------------ *
 * Resolving a conflict — his choice, never the system's
 * ------------------------------------------------------------------ */

export type Resolution = "keep_mine" | "keep_google";

export type ResolutionEffect =
  | { apply: "push"; reason: string }
  | { apply: "pull"; doDate: string | null; time: TaskTime | null; reason: string };

/**
 * What settling a conflict does. Note that neither branch is reachable
 * without him choosing — this function is only ever called from a button.
 */
export function resolveConflict(
  choice: Resolution,
  event: RemoteEvent | null
): ResolutionEffect {
  if (choice === "keep_mine") {
    return { apply: "push", reason: "kept the day THE BRAIN had" };
  }
  return {
    apply: "pull",
    doDate: event ? eventDay(event) : null,
    time: event ? eventTime(event) : null,
    reason: "kept the day Google had",
  };
}

/* ------------------------------------------------------------------ *
 * What the page says about the connection
 * ------------------------------------------------------------------ */

export type ConnectionState =
  /** No Google client configured on the server — nothing can be connected. */
  | "unconfigured"
  /** Configured, but he has never authorised it. */
  | "disconnected"
  /** Authorised, with a dedicated calendar. */
  | "connected"
  /** Authorised, but the last sync failed. */
  | "error";

export function connectionState(input: {
  configured: boolean;
  hasIntegration: boolean;
  calendarId: string | null;
  lastError: string | null;
}): ConnectionState {
  if (!input.configured) return "unconfigured";
  if (!input.hasIntegration || toTextOrNull(input.calendarId) == null) {
    return "disconnected";
  }
  return toTextOrNull(input.lastError) != null ? "error" : "connected";
}

/** A sync run, summarised for the log he actually reads. */
export type SyncSummary = {
  created: number;
  updated: number;
  deleted: number;
  unscheduled: number;
  rescheduled: number;
  conflicts: number;
  skipped: number;
};

export const EMPTY_SUMMARY: SyncSummary = {
  created: 0,
  updated: 0,
  deleted: 0,
  unscheduled: 0,
  rescheduled: 0,
  conflicts: 0,
  skipped: 0,
};

/**
 * The one line under the Sync button.
 *
 * "Nothing changed" is a real and common result and says so plainly, rather
 * than inventing activity to look busy.
 */
export function summaryLine(s: SyncSummary): string {
  const parts: string[] = [];
  if (s.created) parts.push(`${s.created} added`);
  if (s.updated) parts.push(`${s.updated} updated`);
  if (s.deleted) parts.push(`${s.deleted} removed`);
  if (s.rescheduled) parts.push(`${s.rescheduled} moved here`);
  if (s.unscheduled) parts.push(`${s.unscheduled} unscheduled`);
  if (parts.length === 0 && s.conflicts === 0) return "Nothing changed.";
  const head = parts.length > 0 ? parts.join(" · ") : "Nothing changed";
  return s.conflicts > 0
    ? `${head}. ${s.conflicts} conflict${s.conflicts === 1 ? "" : "s"} waiting on you.`
    : `${head}.`;
}

/* ------------------------------------------------------------------ *
 * The month grid
 * ------------------------------------------------------------------ */

export type GridDay = {
  iso: string;
  /** False for the leading and trailing days that belong to a neighbour. */
  inMonth: boolean;
  isToday: boolean;
};

/**
 * A Monday-first month grid.
 *
 * Always whole weeks, so the grid is rectangular and the columns line up
 * under their day names — a month that starts on a Sunday otherwise leaves
 * a ragged first row that reads as a rendering bug.
 */
export function monthGrid(anchorIso: string, todayIso: string): GridDay[][] {
  const first = `${anchorIso.slice(0, 7)}-01`;
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  const start = addDays(first, -dow);

  const weeks: GridDay[][] = [];
  let cursor = start;
  // Six weeks covers every possible month shape; trailing empty weeks are
  // dropped below so a short month does not render a blank row.
  for (let w = 0; w < 6; w += 1) {
    const week: GridDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push({
        iso: cursor,
        inMonth: cursor.slice(0, 7) === anchorIso.slice(0, 7),
        isToday: cursor === todayIso,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks.filter((w) => w.some((d) => d.inMonth));
}

/** The month label, e.g. "August 2026". */
export function monthLabel(anchorIso: string): string {
  return new Date(`${anchorIso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString(
    "en-GB",
    { month: "long", year: "numeric", timeZone: "UTC" }
  );
}

/** Move a month anchor by `n` months, staying on the first of the month. */
export function shiftMonth(anchorIso: string, n: number): string {
  const [y, m] = anchorIso.slice(0, 7).split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Tasks grouped by the day they are set to be done. */
export function tasksByDay<T extends Pick<Task, "do_date">>(
  tasks: T[]
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const t of tasks) {
    const d = toTextOrNull(t.do_date);
    if (d == null) continue;
    (out[d] ??= []).push(t);
  }
  return out;
}

export type AgendaDay<T> = {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  tasks: T[];
};

/**
 * The same month, as a list of the days that actually have something on them.
 *
 * A seven-column month needs about 560px to be readable — below that a day
 * cell is 45px, which fits a date and nothing else, so the phone was showing
 * Monday to Thursday and hiding the weekend behind a sideways scroll nobody
 * would think to try. A calendar that hides Saturday is not a calendar.
 *
 * So the phone gets this instead: the days that carry work, in order. It is
 * built from `monthGrid` rather than from the tasks directly, which is the
 * part that matters — both views then cover exactly the same span of days,
 * including the neighbouring-month days at either end. Derive them
 * separately and the month header's count would eventually disagree with
 * what one of the two views is showing, and nobody would know which lied.
 *
 * Empty days are dropped on purpose. On a phone a run of blank rows is just
 * scrolling; the month grid is the view that shows shape, and this is the
 * view that shows content.
 */
export function monthAgenda<T extends Pick<Task, "do_date">>(
  anchorIso: string,
  todayIso: string,
  tasks: T[]
): AgendaDay<T>[] {
  const byDay = tasksByDay(tasks);
  const out: AgendaDay<T>[] = [];
  for (const week of monthGrid(anchorIso, todayIso)) {
    for (const day of week) {
      const on = byDay[day.iso];
      if (on == null || on.length === 0) continue;
      out.push({
        iso: day.iso,
        inMonth: day.inMonth,
        isToday: day.isToday,
        tasks: on,
      });
    }
  }
  return out;
}

/** Tasks that are open and scheduled — what the calendar page counts. */
export function scheduledTasks<
  T extends Pick<Task, "do_date" | "status">
>(tasks: T[], todayIso: string): T[] {
  return tasks.filter((t) => belongsOnCalendar(t, todayIso));
}

/** Of those, the ones still to do. A done task keeps its slot as a record. */
export function outstanding<T extends { status: TaskStatus }>(tasks: T[]): T[] {
  return tasks.filter((t) => isOpenWork(t));
}
