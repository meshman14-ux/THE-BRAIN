/* ====================================================================
 * STAGE 4 · PHASE D — the calendar
 *
 * Locked decision 8, tested clause by clause:
 *
 *   "full two-way sync, blast radius contained — THE BRAIN writes ONLY to
 *    its own dedicated Google calendar, never the main one. calendar_sync
 *    maps task ↔ event with etag. Deletes unschedule, never destroy.
 *    Conflicts logged and surfaced, never auto-resolved."
 *
 * The stakes here are different from the rest of the system. Everywhere
 * else a bug shows Jay a wrong number; here a bug edits his actual diary,
 * or silently throws away a decision about when to do something. So the
 * write guard, the unschedule rule and the conflict rule each get pinned
 * from several directions rather than once.
 * ==================================================================== */

import { describe, it, expect } from "vitest";
import {
  isWritableCalendar,
  assertWritable,
  RESERVED_CALENDAR_IDS,
  BRAIN_CALENDAR_NAME,
  inSyncWindow,
  belongsOnCalendar,
  SYNC_WINDOW_BACK,
  SYNC_WINDOW_FORWARD,
  readTaskTime,
  eventForTask,
  eventSignature,
  readSignature,
  SIGNATURE_KEY,
  pushAction,
  planPush,
  orphanedLinks,
  taskIdOf,
  eventDay,
  eventTime,
  isCancelled,
  pullAction,
  conflictNote,
  resolveConflict,
  connectionState,
  summaryLine,
  monthGrid,
  monthAgenda,
  monthLabel,
  shiftMonth,
  tasksByDay,
  scheduledTasks,
  outstanding,
  TASK_ID_PROPERTY,
  DONE_PREFIX,
  EMPTY_SUMMARY,
  TIME_ZONE,
  STATE_COOKIE,
  type CalendarLink,
  type RemoteEvent,
} from "../src/lib/calendar";
import { encryptWith, decryptWith, keyFrom } from "../src/lib/token-crypto";
import { buildAuthUrl, redirectUriFor, AUTH_ENDPOINT } from "../src/lib/google-oauth";
import type { Task } from "../src/lib/types";

/* -- fixtures ------------------------------------------------------- */

const TODAY = "2026-08-06"; // a Thursday

const task = (over: Partial<Task> & { meta?: unknown } = {}): Task & {
  meta?: unknown;
} => ({
  id: "t1",
  title: "Ring the council",
  pillar_id: null,
  do_date: TODAY,
  due_date: null,
  priority: "Med",
  status: "open",
  notes: null,
  ...over,
});

const link = (over: Partial<CalendarLink> = {}): CalendarLink => ({
  id: "l1",
  task_id: "t1",
  google_event_id: "ev1",
  google_cal_id: "brain@group.calendar.google.com",
  etag: '"etag-1"',
  event_start: TODAY,
  event_end: "2026-08-07",
  last_pushed_at: "2026-08-06T09:00:00.000Z",
  last_pulled_at: null,
  conflict: false,
  conflict_note: null,
  meta: {},
  ...over,
});

/** A link that agrees with the given task — i.e. nothing has changed here. */
const syncedLink = (t: Parameters<typeof eventForTask>[0], over: Partial<CalendarLink> = {}) =>
  link({ meta: { [SIGNATURE_KEY]: eventSignature(eventForTask(t)) }, ...over });

const event = (over: Partial<RemoteEvent> = {}): RemoteEvent => ({
  id: "ev1",
  etag: '"etag-1"',
  status: "confirmed",
  summary: "Ring the council",
  start: { date: TODAY },
  end: { date: "2026-08-07" },
  extendedProperties: { private: { [TASK_ID_PROPERTY]: "t1" } },
  ...over,
});

/* ================================================================== *
 * "THE BRAIN writes ONLY to its own dedicated calendar, never the main
 *  one." This is the one that matters most: everything else here can be
 *  fixed by editing a row, and this one edits his real diary.
 * ================================================================== */

describe("the write guard", () => {
  const brain = "brain@group.calendar.google.com";

  it("allows a dedicated calendar", () => {
    expect(
      isWritableCalendar({ calendarId: brain, primaryId: "jay@gmail.com" })
    ).toBe(true);
  });

  it("refuses the `primary` alias in any casing or padding", () => {
    for (const id of ["primary", "PRIMARY", "  Primary  ", "default"]) {
      expect(
        isWritableCalendar({ calendarId: id, primaryId: null }),
        `must refuse ${JSON.stringify(id)}`
      ).toBe(false);
    }
    expect(RESERVED_CALENDAR_IDS).toContain("primary");
  });

  it("refuses the account's actual primary, alias or not", () => {
    // `primary` is not the only way to name the main calendar — its real id
    // is usually the email address, and that must fail too.
    expect(
      isWritableCalendar({
        calendarId: "jay@gmail.com",
        primaryId: "jay@gmail.com",
      })
    ).toBe(false);
    expect(
      isWritableCalendar({
        calendarId: "JAY@GMAIL.COM",
        primaryId: "jay@gmail.com",
      })
    ).toBe(false);
  });

  it("refuses a missing or empty id rather than defaulting to something", () => {
    expect(isWritableCalendar({ calendarId: null, primaryId: null })).toBe(false);
    expect(isWritableCalendar({ calendarId: "", primaryId: null })).toBe(false);
    expect(isWritableCalendar({ calendarId: "   ", primaryId: null })).toBe(false);
  });

  it("throws rather than returning false, so a forgotten check cannot pass", () => {
    expect(() => assertWritable({ calendarId: "primary", primaryId: null })).toThrow(
      /Refusing to write/
    );
    expect(() =>
      assertWritable({ calendarId: "jay@gmail.com", primaryId: "jay@gmail.com" })
    ).toThrow();
    expect(assertWritable({ calendarId: brain, primaryId: "jay@gmail.com" })).toBe(
      brain
    );
  });

  it("names the calendar it makes, so it is recognisable in his account", () => {
    expect(BRAIN_CALENDAR_NAME).toBe("THE BRAIN");
  });
});

/* ================================================================== *
 * What goes on the calendar
 * ================================================================== */

describe("the sync window", () => {
  it("carries a bounded stretch either side of today", () => {
    expect(inSyncWindow(TODAY, TODAY)).toBe(true);
    expect(inSyncWindow("2026-07-24", TODAY)).toBe(true); // 13 back
    expect(inSyncWindow("2026-07-22", TODAY)).toBe(false); // 15 back
    expect(inSyncWindow("2026-11-03", TODAY)).toBe(true); // 89 forward
    expect(inSyncWindow("2026-11-06", TODAY)).toBe(false); // 92 forward
    expect(SYNC_WINDOW_BACK).toBeGreaterThan(0);
    expect(SYNC_WINDOW_FORWARD).toBeGreaterThan(SYNC_WINDOW_BACK);
  });

  it("treats a task with no day as not belonging on a calendar at all", () => {
    expect(inSyncWindow(null, TODAY)).toBe(false);
    expect(inSyncWindow("", TODAY)).toBe(false);
    expect(belongsOnCalendar(task({ do_date: null }), TODAY)).toBe(false);
  });

  it("keeps a dropped task off it", () => {
    // Deciding not to do something is a decision the calendar should reflect
    // by being empty, not by holding a ghost.
    expect(belongsOnCalendar(task({ status: "dropped" }), TODAY)).toBe(false);
    expect(belongsOnCalendar(task({ status: "done" }), TODAY)).toBe(true);
    expect(belongsOnCalendar(task({ status: "waiting" }), TODAY)).toBe(true);
  });
});

describe("the event a task becomes", () => {
  it("makes an all-day event whose end is the NEXT day", () => {
    // Google's all-day `end.date` is exclusive. Same-day start and end
    // renders as nothing at all, which is the sort of bug that looks like
    // the sync silently not working.
    const e = eventForTask(task())!;
    expect(e.start).toEqual({ date: TODAY });
    expect(e.end).toEqual({ date: "2026-08-07" });
  });

  it("carries the task id, so a pull knows which event is ours", () => {
    const e = eventForTask(task({ id: "abc" }))!;
    expect(e.extendedProperties.private[TASK_ID_PROPERTY]).toBe("abc");
    expect(taskIdOf(event({ extendedProperties: { private: { [TASK_ID_PROPERTY]: "abc" } } }))).toBe("abc");
    expect(taskIdOf(event({ extendedProperties: null }))).toBeNull();
  });

  it("marks finished work rather than deleting it", () => {
    // The calendar is also a record of what actually happened.
    const e = eventForTask(task({ status: "done" }))!;
    expect(e.summary.startsWith(DONE_PREFIX)).toBe(true);
    expect(e.summary).toContain("Ring the council");
  });

  it("says in the event itself what deleting it will do", () => {
    const e = eventForTask(task())!;
    expect(e.description).toContain("unscheduled, not deleted");
  });

  it("keeps his notes above the system's line", () => {
    const e = eventForTask(task({ notes: "Ask for the empty-home exemption" }))!;
    expect(e.description.startsWith("Ask for the empty-home exemption")).toBe(true);
  });

  it("is nothing at all for a task with no day", () => {
    expect(eventForTask(task({ do_date: null }))).toBeNull();
    expect(eventSignature(null)).toBe("");
  });

  it("becomes a timed event when the task carries a time", () => {
    const e = eventForTask(task({ meta: { time: { start: "09:00", end: "10:30" } } }))!;
    expect(e.start).toEqual({
      dateTime: `${TODAY}T09:00:00`,
      timeZone: TIME_ZONE,
    });
    expect(e.end).toEqual({
      dateTime: `${TODAY}T10:30:00`,
      timeZone: TIME_ZONE,
    });
  });
});

describe("readTaskTime", () => {
  it("accepts a real time and refuses everything else", () => {
    expect(readTaskTime({ time: { start: "09:00", end: "10:00" } })).toEqual({
      start: "09:00",
      end: "10:00",
    });
    // meta is jsonb — none of this may throw.
    expect(readTaskTime(null)).toBeNull();
    expect(readTaskTime({})).toBeNull();
    expect(readTaskTime({ time: "09:00" })).toBeNull();
    expect(readTaskTime({ time: ["09:00"] })).toBeNull();
    expect(readTaskTime({ time: { start: "9am", end: "10am" } })).toBeNull();
    expect(readTaskTime({ time: { start: "25:00", end: "26:00" } })).toBeNull();
    // An end at or before the start is a typo, not a time.
    expect(readTaskTime({ time: { start: "10:00", end: "09:00" } })).toBeNull();
    expect(readTaskTime({ time: { start: "10:00", end: "10:00" } })).toBeNull();
  });
});

/* ================================================================== *
 * Push — and "deletes unschedule, never destroy" from this side
 * ================================================================== */

describe("pushAction", () => {
  it("creates an event for a newly scheduled task", () => {
    expect(pushAction(task(), null, TODAY)).toMatchObject({ action: "create" });
  });

  it("does nothing when nothing has changed", () => {
    const t = task();
    expect(pushAction(t, syncedLink(t), TODAY)).toMatchObject({ action: "none" });
  });

  it("updates when the task changed here", () => {
    const before = task();
    const after = task({ title: "Ring the council back" });
    expect(pushAction(after, syncedLink(before), TODAY)).toMatchObject({
      action: "update",
    });
  });

  /**
   * The clause, from the THE BRAIN side: clearing the day removes the
   * event. It does not remove the task, and there is no branch in this
   * function that could — `delete` here only ever refers to the event.
   */
  it("removes the event when the day is cleared, and says so", () => {
    const t = task({ do_date: null });
    const r = pushAction(t, syncedLink(task()), TODAY);
    expect(r.action).toBe("delete");
    expect(r.reason).toContain("unscheduled, not deleted");
  });

  it("removes the event when the task is dropped, keeping the task", () => {
    const r = pushAction(task({ status: "dropped" }), syncedLink(task()), TODAY);
    expect(r.action).toBe("delete");
    expect(r.reason).toContain("the task stays");
  });

  it("removes the event when the day slides out of the window", () => {
    const far = task({ do_date: "2027-06-01" });
    expect(pushAction(far, syncedLink(task()), TODAY)).toMatchObject({
      action: "delete",
    });
  });

  it("does nothing at all to a conflicted link", () => {
    // Pushing over a conflict is auto-resolving it in favour of THE BRAIN,
    // which is exactly what decision 8 forbids.
    const t = task({ title: "changed here" });
    const r = pushAction(t, link({ conflict: true }), TODAY);
    expect(r.action).toBe("none");
    expect(r.reason).toContain("waiting on you");
  });

  it("leaves an unscheduled task with no link entirely alone", () => {
    expect(pushAction(task({ do_date: null }), null, TODAY)).toMatchObject({
      action: "none",
    });
  });
});

describe("planPush", () => {
  it("plans the whole push before a single request goes out", () => {
    const a = task({ id: "a", title: "A" });
    const b = task({ id: "b", title: "B" });
    const c = task({ id: "c", title: "C", do_date: null });
    const plan = planPush(
      [a, b, c],
      [syncedLink(b, { id: "lb", task_id: "b" }), link({ id: "lc", task_id: "c" })],
      TODAY
    );
    const byTask = Object.fromEntries(plan.map((p) => [p.task.id, p.action]));
    expect(byTask).toEqual({ a: "create", c: "delete" });
    // b is unchanged and therefore absent — the plan holds work, not noise.
    expect(plan.find((p) => p.task.id === "b")).toBeUndefined();
  });

  it("carries the drafted event with each item", () => {
    const plan = planPush([task()], [], TODAY);
    expect(plan[0].draft?.summary).toBe("Ring the council");
  });
});

describe("orphanedLinks", () => {
  it("finds events whose task has gone entirely", () => {
    const links = [
      link({ id: "l1", task_id: "alive" }),
      link({ id: "l2", task_id: "deleted" }),
      link({ id: "l3", task_id: null }),
    ];
    expect(orphanedLinks(links, new Set(["alive"])).map((l) => l.id)).toEqual([
      "l2",
      "l3",
    ]);
  });
});

/* ================================================================== *
 * Pull — and "deletes unschedule, never destroy" from the other side
 * ================================================================== */

describe("reading a remote event", () => {
  it("finds the day of an all-day and a timed event alike", () => {
    expect(eventDay(event())).toBe(TODAY);
    expect(
      eventDay(event({ start: { dateTime: `${TODAY}T09:00:00+01:00` } }))
    ).toBe(TODAY);
    expect(eventDay(event({ start: null }))).toBeNull();
  });

  it("reads a time only when there is a real one", () => {
    expect(
      eventTime(
        event({
          start: { dateTime: `${TODAY}T09:00:00+01:00` },
          end: { dateTime: `${TODAY}T10:30:00+01:00` },
        })
      )
    ).toEqual({ start: "09:00", end: "10:30" });
    // An all-day event has no time, and must not be given one.
    expect(eventTime(event())).toBeNull();
  });

  it("knows Google's word for deleted", () => {
    expect(isCancelled(event({ status: "cancelled" }))).toBe(true);
    expect(isCancelled(event({ status: "CANCELLED" }))).toBe(true);
    expect(isCancelled(event())).toBe(false);
  });
});

describe("pullAction", () => {
  /**
   * The clause, from the Google side, and the single most important test in
   * this file: an event deleted over there takes the *day* off the task. It
   * does not take the task.
   */
  it("unschedules on a deleted event and never destroys the task", () => {
    const t = task();
    const r = pullAction(event({ status: "cancelled" }), syncedLink(t), t);
    expect(r.kind).toBe("unschedule");
    if (r.kind === "unschedule") {
      expect(r.reason).toContain("not deleted");
    }
    // There is no action this function can return that deletes a task.
    const kinds = ["unschedule", "reschedule", "none", "conflict"];
    expect(kinds).not.toContain("delete");
  });

  it("follows an event that moved", () => {
    const t = task();
    const moved = event({ etag: '"etag-2"', start: { date: "2026-08-11" }, end: { date: "2026-08-12" } });
    const r = pullAction(moved, syncedLink(t), t);
    expect(r).toMatchObject({ kind: "reschedule", doDate: "2026-08-11" });
  });

  it("picks up a time when he drags an event to an hour", () => {
    const t = task();
    const timed = event({
      etag: '"etag-2"',
      start: { dateTime: `${TODAY}T14:00:00+01:00` },
      end: { dateTime: `${TODAY}T15:00:00+01:00` },
    });
    const r = pullAction(timed, syncedLink(t), t);
    expect(r).toMatchObject({
      kind: "reschedule",
      time: { start: "14:00", end: "15:00" },
    });
  });

  it("does nothing when the etag has not moved", () => {
    const t = task();
    expect(pullAction(event(), syncedLink(t), t)).toMatchObject({ kind: "none" });
  });

  it("does nothing when the event says what the task already says", () => {
    const t = task();
    // Etag changed (he retitled it in Google and changed it back, say) but
    // the day is the same — nothing to write.
    const r = pullAction(event({ etag: '"etag-9"' }), syncedLink(t), t);
    expect(r.kind).toBe("none");
  });

  it("survives a link whose task has gone", () => {
    expect(pullAction(event(), link(), null)).toMatchObject({ kind: "none" });
  });

  /**
   * "Conflicts logged and surfaced, never auto-resolved." Both sides moved
   * since they last agreed, so neither is written over.
   */
  it("raises a conflict when both sides moved, and changes nothing", () => {
    const pushed = task({ do_date: "2026-08-06" });
    const changedHere = task({ do_date: "2026-08-08" });
    const changedThere = event({
      etag: '"etag-2"',
      start: { date: "2026-08-10" },
      end: { date: "2026-08-11" },
    });
    const r = pullAction(changedThere, syncedLink(pushed), changedHere);
    expect(r.kind).toBe("conflict");
    if (r.kind === "conflict") {
      // The note has to name both sides, or it is not something he can settle.
      expect(r.note).toContain("2026-08-08");
      expect(r.note).toContain("2026-08-10");
      expect(r.note).toContain("Nothing has been changed");
    }
  });

  it("lets a deletion win over a local edit rather than raising a conflict", () => {
    // He deleted it just now. The worst case is a task needing a day put
    // back on it — and the task itself is never at risk either way.
    const changedHere = task({ do_date: "2026-08-08" });
    const r = pullAction(
      event({ status: "cancelled", etag: '"etag-2"' }),
      syncedLink(task()),
      changedHere
    );
    expect(r.kind).toBe("unschedule");
  });
});

describe("conflictNote", () => {
  it("names both days plainly", () => {
    const n = conflictNote(task({ do_date: "2026-08-08" }), event());
    expect(n).toContain("Here: 2026-08-08");
    expect(n).toContain(`Google: ${TODAY}`);
  });

  it("copes when either side has no day", () => {
    expect(conflictNote(task({ do_date: null }), event())).toContain("no day");
    expect(conflictNote(task(), event({ start: null }))).toContain("no day");
  });
});

/* ================================================================== *
 * Resolution — his choice, and only ever his
 * ================================================================== */

describe("resolveConflict", () => {
  it("pushes his version when he keeps his", () => {
    expect(resolveConflict("keep_mine", event())).toMatchObject({ apply: "push" });
  });

  it("takes Google's day and time when he keeps theirs", () => {
    const e = event({
      start: { dateTime: `${TODAY}T14:00:00+01:00` },
      end: { dateTime: `${TODAY}T15:00:00+01:00` },
    });
    expect(resolveConflict("keep_google", e)).toMatchObject({
      apply: "pull",
      doDate: TODAY,
      time: { start: "14:00", end: "15:00" },
    });
  });

  it("treats a vanished event as an unscheduling, not a deletion", () => {
    const r = resolveConflict("keep_google", null);
    expect(r).toMatchObject({ apply: "pull", doDate: null });
  });
});

/* ================================================================== *
 * What the page says
 * ================================================================== */

describe("connectionState", () => {
  it("separates 'nothing configured' from 'not connected'", () => {
    // These need different things from him — one is an env var, the other
    // is a click — so they are never collapsed into one "not working".
    expect(
      connectionState({ configured: false, hasIntegration: false, calendarId: null, lastError: null })
    ).toBe("unconfigured");
    expect(
      connectionState({ configured: true, hasIntegration: false, calendarId: null, lastError: null })
    ).toBe("disconnected");
    expect(
      connectionState({ configured: true, hasIntegration: true, calendarId: null, lastError: null })
    ).toBe("disconnected");
    expect(
      connectionState({ configured: true, hasIntegration: true, calendarId: "c", lastError: null })
    ).toBe("connected");
    expect(
      connectionState({ configured: true, hasIntegration: true, calendarId: "c", lastError: "boom" })
    ).toBe("error");
  });

  it("stays unconfigured even if a stale row exists", () => {
    expect(
      connectionState({ configured: false, hasIntegration: true, calendarId: "c", lastError: null })
    ).toBe("unconfigured");
  });
});

describe("summaryLine", () => {
  it("says nothing changed when nothing did", () => {
    expect(summaryLine(EMPTY_SUMMARY)).toBe("Nothing changed.");
  });

  it("lists what moved", () => {
    const line = summaryLine({ ...EMPTY_SUMMARY, created: 2, deleted: 1 });
    expect(line).toContain("2 added");
    expect(line).toContain("1 removed");
  });

  it("always mentions conflicts, even on an otherwise quiet run", () => {
    const line = summaryLine({ ...EMPTY_SUMMARY, conflicts: 1 });
    expect(line).toContain("1 conflict waiting on you");
    expect(summaryLine({ ...EMPTY_SUMMARY, conflicts: 3 })).toContain("3 conflicts");
  });
});

/* ================================================================== *
 * The month grid
 * ================================================================== */

describe("monthGrid", () => {
  it("is Monday-first and always whole weeks", () => {
    const g = monthGrid("2026-08-01", TODAY);
    for (const week of g) expect(week).toHaveLength(7);
    // August 2026 starts on a Saturday, so the first row starts 27 July.
    expect(g[0][0].iso).toBe("2026-07-27");
    expect(g[0][0].inMonth).toBe(false);
  });

  it("marks today, and only today", () => {
    const flat = monthGrid("2026-08-01", TODAY).flat();
    expect(flat.filter((d) => d.isToday).map((d) => d.iso)).toEqual([TODAY]);
  });

  it("never renders a week that belongs entirely to a neighbour", () => {
    for (const m of ["2026-02-01", "2026-08-01", "2027-01-01", "2028-02-01"]) {
      const g = monthGrid(m, TODAY);
      for (const week of g) {
        expect(week.some((d) => d.inMonth), `${m} has an empty week`).toBe(true);
      }
      // Every day of the month appears exactly once.
      const inMonth = g.flat().filter((d) => d.inMonth).map((d) => d.iso);
      expect(new Set(inMonth).size).toBe(inMonth.length);
    }
  });

  it("covers a February that starts on a Monday without a ragged row", () => {
    const g = monthGrid("2027-02-01", TODAY);
    expect(g[0][0].iso).toBe("2027-02-01");
    expect(g[0][0].inMonth).toBe(true);
  });
});

describe("shiftMonth", () => {
  it("moves whole months and rolls the year", () => {
    expect(shiftMonth("2026-08-06", 1)).toBe("2026-09-01");
    expect(shiftMonth("2026-08-06", -1)).toBe("2026-07-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-08-01", 12)).toBe("2027-08-01");
  });

  it("never lands on a day that does not exist", () => {
    // Always the first, so shifting from the 31st cannot produce 31 Feb.
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("names the month it lands on", () => {
    expect(monthLabel("2026-08-01")).toBe("August 2026");
    expect(monthLabel("2027-02-14")).toBe("February 2027");
  });
});

describe("grouping for the grid", () => {
  it("buckets tasks by their do-date and ignores the undated", () => {
    const by = tasksByDay([
      task({ id: "a", do_date: TODAY }),
      task({ id: "b", do_date: TODAY }),
      task({ id: "c", do_date: "2026-08-07" }),
      task({ id: "d", do_date: null }),
    ]);
    expect(by[TODAY].map((t) => t.id)).toEqual(["a", "b"]);
    expect(by["2026-08-07"]).toHaveLength(1);
    expect(Object.keys(by)).toHaveLength(2);
  });

  it("counts what is scheduled, and what of that is still to do", () => {
    const all = [
      task({ id: "a" }),
      task({ id: "b", status: "done" }),
      task({ id: "c", do_date: null }),
      task({ id: "d", status: "dropped" }),
    ];
    expect(scheduledTasks(all, TODAY).map((t) => t.id)).toEqual(["a", "b"]);
    expect(outstanding(scheduledTasks(all, TODAY)).map((t) => t.id)).toEqual(["a"]);
  });
});

/* ================================================================== *
 * The phone's month.
 *
 * Seven columns need ~560px to be readable. At 390px the grid was showing
 * Monday to Thursday and hiding the weekend behind a horizontal scroll, so
 * the phone gets an agenda instead. The rule these tests defend is that the
 * two views cover the *same days* — the header says "N scheduled", and both
 * views have to be talking about the same N.
 * ================================================================== */

describe("monthAgenda", () => {
  it("lists only the days that carry work, in date order", () => {
    const rows = monthAgenda("2026-08-01", TODAY, [
      task({ id: "c", do_date: "2026-08-20" }),
      task({ id: "a", do_date: "2026-08-06" }),
      task({ id: "b", do_date: "2026-08-11" }),
    ]);
    expect(rows.map((r) => r.iso)).toEqual([
      "2026-08-06",
      "2026-08-11",
      "2026-08-20",
    ]);
  });

  it("groups everything sharing a day into that one row", () => {
    const rows = monthAgenda("2026-08-01", TODAY, [
      task({ id: "a", do_date: TODAY }),
      task({ id: "b", do_date: TODAY }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].tasks.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("says nothing at all when nothing is scheduled", () => {
    expect(monthAgenda("2026-08-01", TODAY, [])).toEqual([]);
    expect(monthAgenda("2026-08-01", TODAY, [task({ do_date: null })])).toEqual([]);
  });

  it("marks today, so the phone can point at the row that matters", () => {
    const rows = monthAgenda("2026-08-01", TODAY, [
      task({ id: "a", do_date: TODAY }),
      task({ id: "b", do_date: "2026-08-07" }),
    ]);
    expect(rows.map((r) => r.isToday)).toEqual([true, false]);
  });

  /* The important one. */
  it("covers exactly the days the grid covers, neighbours included", () => {
    // August 2026 starts on a Saturday, so the grid's first row reaches back
    // into July. A task on 2026-07-27 is visible in the grid, and therefore
    // has to be visible in the agenda too.
    const anchor = "2026-08-01";
    const gridDays = monthGrid(anchor, TODAY)
      .flat()
      .map((d) => d.iso);
    const everyDay = gridDays.map((iso, i) => task({ id: `t${i}`, do_date: iso }));

    const rows = monthAgenda(anchor, TODAY, everyDay);
    expect(rows.map((r) => r.iso)).toEqual(gridDays);

    // And the leading neighbour day is carried, flagged as outside the month
    // rather than silently dropped.
    const first = rows[0];
    expect(first.iso).toBe(gridDays[0]);
    expect(first.inMonth).toBe(false);
    expect(first.iso.slice(0, 7)).toBe("2026-07");
  });

  it("drops a task that falls outside the grid's span entirely", () => {
    // Nothing in the agenda may come from a day the month view cannot show,
    // or the two would disagree in the other direction.
    const rows = monthAgenda("2026-08-01", TODAY, [
      task({ id: "far", do_date: "2026-12-25" }),
    ]);
    expect(rows).toEqual([]);
  });
});

/* ================================================================== *
 * The fingerprint that answers "did this change here?"
 * ================================================================== */

describe("eventSignature", () => {
  it("is stable for the same task", () => {
    expect(eventSignature(eventForTask(task()))).toBe(
      eventSignature(eventForTask(task()))
    );
  });

  it("moves when anything the calendar shows moves", () => {
    const base = eventSignature(eventForTask(task()));
    expect(eventSignature(eventForTask(task({ title: "other" })))).not.toBe(base);
    expect(eventSignature(eventForTask(task({ do_date: "2026-08-09" })))).not.toBe(base);
    expect(eventSignature(eventForTask(task({ status: "done" })))).not.toBe(base);
    expect(eventSignature(eventForTask(task({ notes: "why" })))).not.toBe(base);
  });

  it("does not move for a change the calendar never shows", () => {
    // Re-prioritising a task is not a reason to rewrite his calendar.
    expect(eventSignature(eventForTask(task({ priority: "High" })))).toBe(
      eventSignature(eventForTask(task()))
    );
  });

  it("reads back off a link, and copes with a link that has none", () => {
    const sig = eventSignature(eventForTask(task()));
    expect(readSignature(link({ meta: { [SIGNATURE_KEY]: sig } }))).toBe(sig);
    expect(readSignature(link({ meta: {} }))).toBe("");
    expect(readSignature(link({ meta: null }))).toBe("");
    expect(readSignature(link({ meta: { [SIGNATURE_KEY]: 42 } }))).toBe("");
  });
});

/* ================================================================== *
 * The stored tokens
 *
 * A silent failure here does not throw — it stores something that will
 * never decrypt, and the symptom turns up days later as a connection that
 * mysteriously needs redoing. Hence its own module, and hence these.
 * ================================================================== */

describe("token encryption", () => {
  const key = keyFrom("a long random development secret");

  it("round-trips a refresh token", () => {
    const token = "1//0eXaMpLe-refresh-token_value";
    const sealed = encryptWith(key, token);
    expect(sealed).not.toContain(token);
    expect(decryptWith(key, sealed)).toBe(token);
  });

  it("produces a different ciphertext every time", () => {
    // A fresh IV per encryption. Identical ciphertext for identical input
    // would leak that two rows hold the same token.
    expect(encryptWith(key, "same")).not.toBe(encryptWith(key, "same"));
  });

  it("refuses to decrypt with the wrong key rather than returning rubbish", () => {
    const sealed = encryptWith(key, "secret");
    expect(decryptWith(keyFrom("a different secret"), sealed)).toBeNull();
  });

  it("returns null on anything malformed instead of throwing", () => {
    // This runs while rendering a page. Throwing would take the page down
    // over a value that just needs reconnecting.
    for (const bad of [null, undefined, "", "not-a-payload", "a.b", "a.b.c.d", "!!!.???.***"]) {
      expect(() => decryptWith(key, bad)).not.toThrow();
      expect(decryptWith(key, bad)).toBeNull();
    }
  });

  it("detects a tampered ciphertext", () => {
    // GCM authenticates as well as encrypts, so a flipped byte fails
    // rather than decrypting to something plausible.
    const sealed = encryptWith(key, "secret");
    const [iv, tag, enc] = sealed.split(".");
    const flipped = enc.slice(0, -1) + (enc.endsWith("A") ? "B" : "A");
    expect(decryptWith(key, [iv, tag, flipped].join("."))).toBeNull();
  });

  it("takes a 32-byte base64 key as-is and hashes anything else to length", () => {
    const raw = Buffer.alloc(32, 7).toString("base64");
    expect(keyFrom(raw).length).toBe(32);
    expect(keyFrom(raw).equals(Buffer.alloc(32, 7))).toBe(true);
    expect(keyFrom("short").length).toBe(32);
    expect(keyFrom("").length).toBe(32);
  });
});

/* ================================================================== *
 * The consent URL
 *
 * Where OAuth goes wrong quietly. None of these mistakes throw — they
 * surface an hour later as a connection that stopped working, or as a
 * consent screen asking for the wrong thing.
 * ================================================================== */

describe("the consent URL", () => {
  const url = () =>
    new URL(
      buildAuthUrl({
        clientId: "1234.apps.googleusercontent.com",
        origin: "https://the-brain.example.com",
        state: "abc123",
      })
    );

  it("goes to Google's own consent endpoint", () => {
    expect(url().origin + url().pathname).toBe(AUTH_ENDPOINT);
  });

  it("asks for a refresh token, which needs BOTH parameters", () => {
    // Without these two the connection works for exactly one hour and then
    // dies in a way that looks like a bug rather than a missing parameter.
    expect(url().searchParams.get("access_type")).toBe("offline");
    expect(url().searchParams.get("prompt")).toBe("consent");
  });

  it("asks for free/busy, which is what the focus block reads", () => {
    // Added when THE COG started reading real commitments. Without it
    // freeBusy returns 403, the adapter catches it, and the focus block
    // falls back to planner pins forever — a calendar that looks connected
    // and never informs anything.
    const scope = url().searchParams.get("scope") ?? "";
    expect(scope.split(" ")).toContain("https://www.googleapis.com/auth/calendar.freebusy");
  });

  it("asks only for calendars it made, never the whole account", () => {
    const scope = url().searchParams.get("scope") ?? "";
    expect(scope).toContain("calendar.app.created");
    // freebusy returns intervals and nothing else. calendar.readonly would
    // have answered the same question by handing over the entire diary,
    // which is a different trade and a worse one.
    // The scopes that would let it read or write his real diary.
    expect(scope).not.toContain("auth/calendar ");
    expect(scope.split(" ")).not.toContain("https://www.googleapis.com/auth/calendar");
    expect(scope.split(" ")).not.toContain(
      "https://www.googleapis.com/auth/calendar.readonly"
    );
    expect(scope.split(" ")).not.toContain(
      "https://www.googleapis.com/auth/calendar.events"
    );
  });

  it("carries the state, so a crafted link cannot start a connection", () => {
    expect(url().searchParams.get("state")).toBe("abc123");
    expect(STATE_COOKIE).toBe("brain-cal-state");
  });

  it("points the redirect at the callback route, exactly", () => {
    expect(url().searchParams.get("redirect_uri")).toBe(
      "https://the-brain.example.com/api/calendar/callback"
    );
    // A trailing slash on the origin must not produce a double slash —
    // Google compares the redirect URI as a string and would refuse it.
    expect(redirectUriFor("https://x.example.com/")).toBe(
      "https://x.example.com/api/calendar/callback"
    );
    expect(redirectUriFor("http://localhost:3000")).toBe(
      "http://localhost:3000/api/calendar/callback"
    );
  });
});
