/* ------------------------------------------------------------------ *
 * RESTART — training for someone who is not training yet
 *
 * WHY THIS EXISTS, said plainly because the answer is unusual.
 *
 * Jay scored Training & Fitness **2 out of 10** — the lowest of all
 * thirteen areas — and, asked directly on 2026-08-14, said Body is empty
 * because *"I want it to be a priority but it isn't yet."* Not a logging
 * problem. Not a wearable problem. `workouts` has never held a row and
 * `habit_logs` holds exactly one, ever.
 *
 * Everything already built for Body assumes the opposite. HYBRID scores
 * readiness against a rolling 60-day baseline and needs 14 readings.
 * `bodyContract` measures a floor of four sessions a week. The Body page
 * says *"nothing on this page needs typing, which is why it will still be
 * true in December"* — true, and the reason it says nothing at all, since
 * the watch that was going to fill it is not connected.
 *
 * So this module is the missing rung. It is not a smaller version of the
 * training engine; it answers a different question. The engine asks *how
 * hard should today be*. This asks *is anything happening at all, and how
 * do I make the next one likelier*.
 *
 * THREE RULES, and each is a refusal.
 *
 *   1. **One session is a win, and the system says so.** At zero, the
 *      only number shown is the one you just made non-zero.
 *   2. **The floor stays hidden until it is nearly in reach.** Opening on
 *      "0 of 4 this week" is four failures before breakfast — the exact
 *      argument that took the habit board from six tracked habits to one.
 *      `FLOOR_VISIBLE_AT` is where it appears, and it is not zero.
 *   3. **Coming back is never a broken streak.** A gap produces "first
 *      one back", never a reset counter and never a number that was
 *      higher last month. Nothing in this file can render a fall.
 *
 * Pure. No clock, no database. Everything takes `todayIso`.
 * ------------------------------------------------------------------ */

import { daysUntil } from "./logic";

/* ------------------------------------------------------------------ *
 * 1 · What counts
 * ------------------------------------------------------------------ */

/**
 * `workouts.kind` is text with no check constraint and defaults to
 * `other`. These are the four the button offers — chosen from Jay's own
 * answer, which was "all of these": a walk counts, bodyweight counts, the
 * gym counts, and so does something he does not want to categorise.
 *
 * **The kind is never required.** It is a ceiling, not a gate — decision
 * 12's rule, applied to the one module that had no floor at all. Logging
 * with no kind writes `other` and is a complete, valid session.
 */
export const SESSION_KINDS = ["walk", "home", "gym", "other"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const KIND_LABEL: Record<SessionKind, string> = {
  walk: "Walk",
  home: "At home",
  gym: "Gym",
  other: "Something",
};

/** A row read back may carry anything; show it rather than hide it. */
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind as SessionKind] ?? kind;
}

/* ------------------------------------------------------------------ *
 * 2 · The window and the floor
 * ------------------------------------------------------------------ */

/** A fortnight, matching `TRAINING_WINDOW_DAYS` so the two modules cannot
 *  disagree about what "recently" means. */
export const WINDOW_DAYS = 14;

/** Jay's own standard, from `TRAINING_FLOOR_PER_WEEK`. Restated here only
 *  so this module can decide when to SHOW it. */
export const FLOOR_PER_WEEK = 4;

/**
 * Sessions in the last fortnight before the weekly floor is mentioned at
 * all. Four — one week's worth spread over two — because that is the
 * point where "four a week" stops being a rebuke and starts being a
 * target you can see from where you are standing.
 *
 * Below it the module never names the floor, never shows a fraction of
 * it, and never renders a progress bar against it. There is a test for
 * each of those, because this is the rule most likely to be softened by
 * someone adding "just a small progress hint".
 */
export const FLOOR_VISIBLE_AT = 4;

/* ------------------------------------------------------------------ *
 * 3 · Where you actually are
 * ------------------------------------------------------------------ */

export type Stage =
  /** Nothing has ever been logged. */
  | "cold"
  /** Exactly one session, ever. The most fragile state there is. */
  | "first"
  /** Something is happening, but the floor is not in view yet. */
  | "going"
  /** Near or at the standard. The floor may now be shown. */
  | "holding";

export type Restart = {
  stage: Stage;
  /** Sessions inside the fortnight. */
  recent: number;
  /** Sessions ever. Distinguishes "new" from "back". */
  total: number;
  /** Days since the last session. Null when there has never been one. */
  daysSince: number | null;
  /**
   * Whether the weekly floor may be named on screen. False below
   * `FLOOR_VISIBLE_AT`, and the UI must obey it rather than deciding for
   * itself — that is the whole rule.
   */
  showFloor: boolean;
  /** Sessions per week across the fortnight, and only when shown. */
  perWeek: number | null;
  /** True on a return after a gap of a full window or more. */
  returning: boolean;
};

export function restart(
  sessions: { on_date: string }[],
  todayIso: string
): Restart {
  const ago = (d: string) => {
    const n = daysUntil(d, todayIso);
    return n == null ? null : -n;
  };

  const dated = sessions
    .map((s) => ({ on_date: s.on_date, ago: ago(s.on_date) }))
    .filter((s): s is { on_date: string; ago: number } => s.ago != null)
    // A session dated in the future is a typo, not a session.
    .filter((s) => s.ago >= 0)
    .sort((a, b) => a.ago - b.ago);

  const total = dated.length;
  const recent = dated.filter((s) => s.ago < WINDOW_DAYS).length;
  const daysSince = total === 0 ? null : dated[0].ago;

  const stage: Stage =
    total === 0
      ? "cold"
      : total === 1
        ? "first"
        : recent >= FLOOR_VISIBLE_AT
          ? "holding"
          : "going";

  const showFloor = recent >= FLOOR_VISIBLE_AT;

  return {
    stage,
    recent,
    total,
    daysSince,
    showFloor,
    // Never computed when it would not be shown — a per-week figure of
    // 0.5 is a true number and a discouraging one, and there is nothing
    // to do with it at this stage.
    perWeek: showFloor ? Math.round((recent / (WINDOW_DAYS / 7)) * 10) / 10 : null,
    // "Back after a gap" needs history AND a real absence. One session
    // ever, three weeks ago, is still `first` — it was never a run.
    returning: total > 1 && daysSince != null && daysSince >= WINDOW_DAYS,
  };
}

/* ------------------------------------------------------------------ *
 * 4 · What the page says
 * ------------------------------------------------------------------ */

/**
 * The one line Body leads with.
 *
 * Never a nag, never a fraction of a target that has not been met, and
 * never a comparison with a better past. At `cold` it does not mention
 * training frequency at all — it says what one session would do, because
 * at zero the only useful fact is that the first one counts.
 */
export function restartLine(r: Restart): string {
  if (r.stage === "cold") {
    return "Nothing logged yet. One session is the whole target — it is what turns every other number here on.";
  }
  if (r.stage === "first") {
    return r.daysSince === 0
      ? "One logged today. That is the hardest one done."
      : `One logged, ${r.daysSince} ${r.daysSince === 1 ? "day" : "days"} ago. A second is what makes it a pattern.`;
  }
  if (r.returning) {
    return `${r.total} logged in total, and the last was ${r.daysSince} days ago. The next one is a restart, not a repair.`;
  }
  if (r.stage === "going") {
    return `${r.recent} in the last fortnight. It is happening.`;
  }
  return `${r.perWeek} a week across the fortnight, against a floor of ${FLOOR_PER_WEEK}.`;
}

/**
 * The button's own words. It changes exactly once — at zero it is an
 * invitation, and after that it is a verb.
 */
export function logLabel(r: Restart): string {
  return r.stage === "cold" ? "Log the first one" : "Log a session";
}

/**
 * Whether Body should lead with the logger rather than with readiness.
 *
 * Readiness needs 14 days of wearable readings and there are none. Until
 * something is being logged, a readiness panel is a large well-built box
 * that says "not yet" — which is honest, and is also the whole reason
 * nobody has opened this page.
 */
export function leadWithLogger(r: Restart): boolean {
  return r.stage === "cold" || r.stage === "first" || r.returning;
}

/**
 * Whether the keystone claim is currently true.
 *
 * `habits.keystone` marks Training as the one habit the dashboard leads
 * with, and THE COG protects it with two rules. Jay's own answer is that
 * this is aspirational. A claim the data contradicts should be visible as
 * a claim rather than presented as a fact, so this returns false while
 * the fortnight is empty and the page says which it is.
 */
export function keystoneEarned(r: Restart): boolean {
  return r.recent > 0;
}
