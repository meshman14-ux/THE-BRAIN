/**
 * THE FLOOR — BODY · EMPIRE · MIND, one thing each, every day.
 *
 * From the onboarding profile (18 Aug), now binding: the daily floor never
 * flexes, whatever the season, and the headline metric Jay chose is
 * CONSISTENCY — floor hit n/7 — not scores and not streaks.
 *
 * The profile's readiness plan said "define the floor in data: three rows".
 * This deliberately goes one better, in the direction the same document's
 * own R2 points: the floor is DERIVED from rows the system already collects,
 * so hitting it requires no new input act at all.
 *
 *   BODY   — the Training habit ticked, or any workout logged that day
 *   EMPIRE — any venture-attached task completed that day
 *   MIND   — Read a page or Nightly reflection ticked, or a journal entry
 *
 * A new table would have been the thirty-first never-written table. The
 * taps that feed these already exist on /life and /planner; the photographed
 * sheet reaches the same rows through the capture engine. People are
 * deliberately OUTSIDE the floor — Jay's own onboarding answer.
 */

export type FloorSlot = "body" | "empire" | "mind";

export const FLOOR_SLOTS: { slot: FloorSlot; name: string; what: string }[] = [
  { slot: "body", name: "BODY", what: "Train — a session or the Training tick" },
  { slot: "empire", name: "EMPIRE", what: "One venture task finished" },
  { slot: "mind", name: "MIND", what: "Read a page, reflect, or write the journal" },
];

/**
 * The evidence, as day-sets. The caller maps rows to ISO dates; everything
 * here is pure so it can be tested without a database.
 */
export type FloorSignals = {
  /** Days the Training habit was ticked. */
  trainingDays: ReadonlySet<string>;
  /** Days with a workout row. */
  workoutDays: ReadonlySet<string>;
  /** Days a venture-attached task was completed. */
  empireDays: ReadonlySet<string>;
  /** Days Read a page / Nightly reflection was ticked. */
  mindHabitDays: ReadonlySet<string>;
  /** Days with a journal entry. */
  journalDays: ReadonlySet<string>;
};

export function slotHit(slot: FloorSlot, day: string, s: FloorSignals): boolean {
  switch (slot) {
    case "body":
      return s.trainingDays.has(day) || s.workoutDays.has(day);
    case "empire":
      return s.empireDays.has(day);
    case "mind":
      return s.mindHabitDays.has(day) || s.journalDays.has(day);
  }
}

/** All three, or nothing: a floor is a floor. */
export function floorHit(day: string, s: FloorSignals): boolean {
  return FLOOR_SLOTS.every((f) => slotHit(f.slot, day, s));
}

function lastNDays(todayIso: string, n: number): string[] {
  const out: string[] = [];
  const t = new Date(`${todayIso.slice(0, 10)}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t.getTime() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export type FloorWeek = {
  /** Days (of the trailing 7, today included) where all three landed. */
  hits: number;
  of: 7;
  /** Per-slot counts over the same window. */
  perSlot: Record<FloorSlot, number>;
  /** Today's three, individually — the sheet's tick boxes. */
  today: Record<FloorSlot, boolean>;
  days: { day: string; hit: boolean }[];
};

export function floorWeek(todayIso: string, s: FloorSignals): FloorWeek {
  const days = lastNDays(todayIso, 7);
  const perSlot: Record<FloorSlot, number> = { body: 0, empire: 0, mind: 0 };
  let hits = 0;
  const dayRows = days.map((day) => {
    for (const f of FLOOR_SLOTS) if (slotHit(f.slot, day, s)) perSlot[f.slot]++;
    const hit = floorHit(day, s);
    if (hit) hits++;
    return { day, hit };
  });
  return {
    hits,
    of: 7,
    perSlot,
    today: {
      body: slotHit("body", todayIso, s),
      empire: slotHit("empire", todayIso, s),
      mind: slotHit("mind", todayIso, s),
    },
    days: dayRows,
  };
}

/**
 * The headline, in Jay's chosen shape: "Floor hit 5/7 · Body 6 · Empire 4 ·
 * Mind 3". A week with nothing at all says so plainly rather than printing
 * a row of zeros dressed as a score.
 */
export function floorLine(w: FloorWeek): string {
  if (w.perSlot.body + w.perSlot.empire + w.perSlot.mind === 0) {
    return "Floor unmeasured this week — nothing has landed yet";
  }
  return `Floor hit ${w.hits}/${w.of} · Body ${w.perSlot.body} · Empire ${w.perSlot.empire} · Mind ${w.perSlot.mind}`;
}
