import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { addDays, toIso, toTextOrNull } from "./logic";
import {
  EMPTY_SUMMARY,
  SIGNATURE_KEY,
  SYNC_WINDOW_BACK,
  conflictNote,
  eventForTask,
  eventSignature,
  orphanedLinks,
  planPush,
  pullAction,
  resolveConflict,
  taskIdOf,
  type CalendarLink,
  type RemoteEvent,
  type Resolution,
  type SyncSummary,
  type TaskTime,
} from "./calendar";
import {
  decryptToken,
  deleteEvent,
  encryptToken,
  getEvent,
  insertEvent,
  isExpiredSyncToken,
  listChangedEvents,
  patchEvent,
  refreshAccess,
} from "./google";
import type { Task } from "./types";

/**
 * The sync run itself.
 *
 * Every decision it makes comes from `calendar.ts`, which is pure and
 * tested. This file is the part that cannot be: it moves the bytes. Keeping
 * the split sharp is what lets the rules — especially "deletes unschedule,
 * never destroy" and "conflicts are never auto-resolved" — be verified
 * without a Google account.
 */

export type Integration = {
  id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  calendar_id: string | null;
  calendar_name: string | null;
  sync_token: string | null;
  connected_at: string;
  last_sync_at: string | null;
  last_error: string | null;
  meta: Record<string, unknown> | null;
};

export const PROVIDER = "google_calendar";

export async function loadIntegration(
  supabase: SupabaseClient
): Promise<Integration | null> {
  const { data } = await supabase
    .from("integrations")
    .select(
      "id, provider, access_token, refresh_token, expires_at, scope, calendar_id, calendar_name, sync_token, connected_at, last_sync_at, last_error, meta"
    )
    .eq("provider", PROVIDER)
    .maybeSingle();
  return (data as Integration | null) ?? null;
}

/** The primary calendar id, kept so the write guard has something to compare. */
export function primaryIdOf(i: Integration | null): string | null {
  const m = (i?.meta ?? {}) as Record<string, unknown>;
  return toTextOrNull(m.primary_calendar_id);
}

/**
 * A usable access token, refreshed if it has expired.
 *
 * The refreshed token is written back encrypted, so the next sync does not
 * pay for another round trip.
 */
export async function accessTokenFor(
  supabase: SupabaseClient,
  integration: Integration
): Promise<string> {
  const expires = integration.expires_at
    ? Date.parse(integration.expires_at)
    : 0;
  const current = decryptToken(integration.access_token);
  if (current && expires > Date.now()) return current;

  const refresh = decryptToken(integration.refresh_token);
  if (!refresh) {
    throw new Error(
      "No usable refresh token — reconnect the calendar. (If CALENDAR_TOKEN_SECRET changed, the stored tokens can no longer be read and reconnecting is the only fix.)"
    );
  }

  const set = await refreshAccess(refresh);
  await supabase
    .from("integrations")
    .update({
      access_token: encryptToken(set.accessToken),
      refresh_token: encryptToken(set.refreshToken ?? refresh),
      expires_at: set.expiresAt,
      last_error: null,
    })
    .eq("id", integration.id);
  return set.accessToken;
}

type SyncTask = Pick<Task, "id" | "title" | "notes" | "do_date" | "status"> & {
  meta?: unknown;
};

const TASK_COLUMNS = "id, title, notes, do_date, status, meta";

/**
 * One full two-way pass.
 *
 * Pull first, then push. That order matters: a pull can unschedule a task
 * or flag a conflict, and both of those change what the push should do.
 * Pushing first would send an event Google had already deleted, and then
 * dutifully delete it again on the next run.
 */
export async function runSync(): Promise<{
  summary: SyncSummary;
  errors: string[];
}> {
  const supabase = await createClient();
  const integration = await loadIntegration(supabase);
  if (!integration || !integration.calendar_id) {
    throw new Error("Calendar is not connected.");
  }

  const target = {
    calendarId: integration.calendar_id,
    primaryId: primaryIdOf(integration),
  };
  const accessToken = await accessTokenFor(supabase, integration);
  const today = toIso(new Date());
  const summary: SyncSummary = { ...EMPTY_SUMMARY };
  const errors: string[] = [];

  const [{ data: taskRows }, { data: linkRows }] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS),
    supabase
      .from("calendar_sync")
      .select(
        "id, task_id, google_event_id, google_cal_id, etag, event_start, event_end, last_pushed_at, last_pulled_at, conflict, conflict_note, meta"
      ),
  ]);

  const tasks = (taskRows ?? []) as SyncTask[];
  const links = (linkRows ?? []) as CalendarLink[];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const linkByEvent = new Map(links.map((l) => [l.google_event_id, l]));

  /* -- 1. pull ---------------------------------------------------- */

  let nextSyncToken: string | null = integration.sync_token;
  let remote: RemoteEvent[] = [];
  try {
    const page = await listChangedEvents(
      accessToken,
      target,
      integration.sync_token,
      addDays(today, -SYNC_WINDOW_BACK)
    );
    remote = page.items;
    nextSyncToken = page.nextSyncToken;
  } catch (e) {
    if (isExpiredSyncToken(e)) {
      // Documented recovery: drop the cursor and take the window instead.
      const page = await listChangedEvents(
        accessToken,
        target,
        null,
        addDays(today, -SYNC_WINDOW_BACK)
      );
      remote = page.items;
      nextSyncToken = page.nextSyncToken;
    } else {
      throw e;
    }
  }

  for (const event of remote) {
    const link = linkByEvent.get(event.id) ?? null;
    // An event nobody here made is none of our business, even on our own
    // calendar — he is allowed to put things in it himself.
    if (link == null) {
      if (taskIdOf(event) != null) summary.skipped += 1;
      continue;
    }
    const task = link.task_id ? (taskById.get(link.task_id) ?? null) : null;
    const action = pullAction(event, link, task);

    try {
      if (action.kind === "unschedule" && task) {
        // The rule, in one statement: the day comes off, the task stays.
        await supabase
          .from("tasks")
          .update({ do_date: null })
          .eq("id", task.id);
        await supabase.from("calendar_sync").delete().eq("id", link.id);
        linkByEvent.delete(event.id);
        summary.unscheduled += 1;
      } else if (action.kind === "reschedule" && task) {
        await supabase
          .from("tasks")
          .update({
            do_date: action.doDate,
            meta: withTime(task.meta, action.time),
          })
          .eq("id", task.id);
        const fresh = {
          ...task,
          do_date: action.doDate,
          meta: withTime(task.meta, action.time),
        };
        await supabase
          .from("calendar_sync")
          .update({
            etag: event.etag ?? null,
            event_start: event.start?.dateTime ?? event.start?.date ?? null,
            event_end: event.end?.dateTime ?? event.end?.date ?? null,
            last_pulled_at: new Date().toISOString(),
            meta: { ...(link.meta ?? {}), [SIGNATURE_KEY]: eventSignature(eventForTask(fresh)) },
          })
          .eq("id", link.id);
        taskById.set(task.id, fresh);
        summary.rescheduled += 1;
      } else if (action.kind === "conflict") {
        // Logged and surfaced. Nothing is changed on either side.
        await supabase
          .from("calendar_sync")
          .update({
            conflict: true,
            conflict_note: action.note,
            last_pulled_at: new Date().toISOString(),
          })
          .eq("id", link.id);
        summary.conflicts += 1;
      }
    } catch (e) {
      errors.push(`pull ${event.id}: ${(e as Error).message}`);
    }
  }

  /* -- 2. push ---------------------------------------------------- */

  const freshTasks = [...taskById.values()];
  const { data: linkRows2 } = await supabase
    .from("calendar_sync")
    .select(
      "id, task_id, google_event_id, google_cal_id, etag, event_start, event_end, last_pushed_at, last_pulled_at, conflict, conflict_note, meta"
    );
  const links2 = (linkRows2 ?? []) as CalendarLink[];

  for (const item of planPush(freshTasks, links2, today)) {
    try {
      if (item.action === "create" && item.draft) {
        const created = await insertEvent(accessToken, target, item.draft);
        await supabase.from("calendar_sync").insert({
          task_id: item.task.id,
          google_event_id: created.id,
          google_cal_id: target.calendarId,
          etag: created.etag ?? null,
          event_start: created.start?.dateTime ?? created.start?.date ?? null,
          event_end: created.end?.dateTime ?? created.end?.date ?? null,
          last_pushed_at: new Date().toISOString(),
          meta: { [SIGNATURE_KEY]: eventSignature(item.draft) },
        });
        summary.created += 1;
      } else if (item.action === "update" && item.draft && item.link) {
        const updated = await patchEvent(
          accessToken,
          target,
          item.link.google_event_id,
          item.draft
        );
        await supabase
          .from("calendar_sync")
          .update({
            etag: updated.etag ?? null,
            event_start: updated.start?.dateTime ?? updated.start?.date ?? null,
            event_end: updated.end?.dateTime ?? updated.end?.date ?? null,
            last_pushed_at: new Date().toISOString(),
            meta: { ...(item.link.meta ?? {}), [SIGNATURE_KEY]: eventSignature(item.draft) },
          })
          .eq("id", item.link.id);
        summary.updated += 1;
      } else if (item.action === "delete" && item.link) {
        await deleteEvent(accessToken, target, item.link.google_event_id);
        await supabase.from("calendar_sync").delete().eq("id", item.link.id);
        summary.deleted += 1;
      }
    } catch (e) {
      errors.push(`push ${item.task.title}: ${(e as Error).message}`);
    }
  }

  /* -- 3. events whose task has gone entirely --------------------- */

  const ids = new Set(freshTasks.map((t) => t.id));
  for (const link of orphanedLinks(links2, ids)) {
    try {
      await deleteEvent(accessToken, target, link.google_event_id);
      await supabase.from("calendar_sync").delete().eq("id", link.id);
      summary.deleted += 1;
    } catch (e) {
      errors.push(`orphan ${link.google_event_id}: ${(e as Error).message}`);
    }
  }

  await supabase
    .from("integrations")
    .update({
      sync_token: nextSyncToken,
      last_sync_at: new Date().toISOString(),
      last_error: errors.length > 0 ? errors.slice(0, 3).join(" · ") : null,
    })
    .eq("id", integration.id);

  return { summary, errors };
}

/** Merge a time into a task's jsonb without disturbing anything else in it. */
function withTime(meta: unknown, time: TaskTime | null): Record<string, unknown> {
  const m = { ...((meta ?? {}) as Record<string, unknown>) };
  if (time == null) delete m.time;
  else m.time = time;
  return m;
}

/**
 * Settle one conflict, the way he chose.
 *
 * Reachable only from the two buttons on `/calendar`. There is no path that
 * calls this without a choice having been made, which is the code-level
 * form of "never auto-resolved".
 */
export async function applyResolution(
  linkId: string,
  choice: Resolution
): Promise<void> {
  const supabase = await createClient();
  const integration = await loadIntegration(supabase);
  if (!integration || !integration.calendar_id) {
    throw new Error("Calendar is not connected.");
  }
  const target = {
    calendarId: integration.calendar_id,
    primaryId: primaryIdOf(integration),
  };
  const accessToken = await accessTokenFor(supabase, integration);

  const { data: linkRow } = await supabase
    .from("calendar_sync")
    .select(
      "id, task_id, google_event_id, google_cal_id, etag, event_start, event_end, last_pushed_at, last_pulled_at, conflict, conflict_note, meta"
    )
    .eq("id", linkId)
    .maybeSingle();
  const link = linkRow as CalendarLink | null;
  if (!link || !link.task_id) throw new Error("That conflict no longer exists.");

  const { data: taskRow } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("id", link.task_id)
    .maybeSingle();
  const task = taskRow as SyncTask | null;
  if (!task) throw new Error("That task no longer exists.");

  const event = await getEvent(accessToken, target, link.google_event_id);
  const effect = resolveConflict(choice, event);

  if (effect.apply === "push") {
    const draft = eventForTask(task);
    if (draft == null) {
      // He resolved in favour of a task that no longer has a day at all.
      await deleteEvent(accessToken, target, link.google_event_id);
      await supabase.from("calendar_sync").delete().eq("id", link.id);
      return;
    }
    const updated = await patchEvent(
      accessToken,
      target,
      link.google_event_id,
      draft
    );
    await supabase
      .from("calendar_sync")
      .update({
        etag: updated.etag ?? null,
        conflict: false,
        conflict_note: null,
        last_pushed_at: new Date().toISOString(),
        meta: { ...(link.meta ?? {}), [SIGNATURE_KEY]: eventSignature(draft) },
      })
      .eq("id", link.id);
    return;
  }

  // Keep Google's version. A missing event means it was deleted while the
  // conflict sat there — which unschedules, and still never deletes.
  const nextMeta = withTime(task.meta, effect.time);
  await supabase
    .from("tasks")
    .update({ do_date: effect.doDate, meta: nextMeta })
    .eq("id", task.id);

  if (event == null || effect.doDate == null) {
    await supabase.from("calendar_sync").delete().eq("id", link.id);
    return;
  }

  await supabase
    .from("calendar_sync")
    .update({
      etag: event.etag ?? null,
      conflict: false,
      conflict_note: null,
      last_pulled_at: new Date().toISOString(),
      meta: {
        ...(link.meta ?? {}),
        [SIGNATURE_KEY]: eventSignature(
          eventForTask({ ...task, do_date: effect.doDate, meta: nextMeta })
        ),
      },
    })
    .eq("id", link.id);
}

/** Re-derive the note for a conflict row, for the panel. */
export function noteFor(task: Pick<Task, "do_date">, event: RemoteEvent): string {
  return conflictNote(task, event);
}
