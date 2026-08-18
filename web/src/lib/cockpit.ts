/**
 * The MARK-VII cockpit's own pure layer — gamification and small display
 * derivations that sit ALONGSIDE the HYBRID engine rather than inside it.
 *
 * Everything here is DERIVED from the same logs HYBRID already reads
 * (`workouts`, `skill_attempts`) on every load, never stored. That is the
 * same discipline `masteryOf`/`treeProgress` already hold in
 * `hybrid/skills.ts` — a rank or an XP total written once and never
 * revisited is a claim that quietly stops being true, and this module
 * exists to add flavour, not a second source of truth.
 *
 * Two rules from the brief, both enforced structurally rather than by
 * convention:
 *
 *   - **Rank is gated on PROVED standards, not XP totals.** `rankFor`
 *     takes the count of owned rungs across the skill trees — the same
 *     number `treeProgress` already reports — never the XP figure.
 *   - **A red-day restore session pays the same XP as a full one.**
 *     `SESSION_XP` is a flat constant with no readiness multiplier
 *     anywhere near it; the system must never pay you to ignore your own
 *     recovery data. `xpForSessions` takes only a COUNT of closed
 *     sessions, not their kind, so there is no readiness-shaped branch
 *     for a multiplier to hide inside.
 */

/* ------------------------------------------------------------------ *
 * XP and level
 * ------------------------------------------------------------------ */

/** Flat per session, regardless of kind — see the header note. */
export const SESSION_XP = 120;
/** A strict, standard-meeting attempt is worth double a soft one. */
export const ATTEMPT_XP_STRICT = 20;
export const ATTEMPT_XP_SOFT = 10;

export type Attempt = { strict: boolean };

/** A session counts once it has been closed — `finish()` in SessionLogger. */
export type ClosedSession = { closed: boolean };

export function xpForSessions(sessions: ClosedSession[]): number {
  return sessions.filter((s) => s.closed).length * SESSION_XP;
}

export function xpForAttempts(attempts: Attempt[]): number {
  return attempts.reduce(
    (sum, a) => sum + (a.strict ? ATTEMPT_XP_STRICT : ATTEMPT_XP_SOFT),
    0
  );
}

export function totalXp(sessions: ClosedSession[], attempts: Attempt[]): number {
  return xpForSessions(sessions) + xpForAttempts(attempts);
}

/**
 * A level curve, not a lookup table — level N needs N × LEVEL_STEP more
 * than the one before it, so the climb visibly slows without a table to
 * keep in step by hand. Level 1 starts at 0 XP.
 */
export const LEVEL_STEP = 400;

export function xpForLevel(level: number): number {
  // Triangular: cumulative XP to REACH `level` is STEP × (1+2+...+(level-1)).
  const n = Math.max(0, level - 1);
  return (LEVEL_STEP * n * (n + 1)) / 2;
}

export type LevelState = {
  level: number;
  /** XP earned since the current level started. */
  into: number;
  /** XP the current level needs in total. */
  span: number;
  xp: number;
};

export function levelFor(xp: number): LevelState {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  const into = xp - xpForLevel(level);
  const span = xpForLevel(level + 1) - xpForLevel(level);
  return { level, into, span, xp };
}

/* ------------------------------------------------------------------ *
 * Rank — gated on proved standards, never on XP
 * ------------------------------------------------------------------ */

export type Rank = { name: string; chevrons: number };

/**
 * Ordered worst-first. `rankFor` walks it looking for the highest
 * threshold met, so a rank name always means "at least this many owned
 * rungs" rather than an XP figure nobody can audit against their own log.
 */
export const RANK_TIERS: (Rank & { minOwned: number })[] = [
  { name: "RECRUIT", chevrons: 1, minOwned: 0 },
  { name: "OPERATIVE", chevrons: 2, minOwned: 3 },
  { name: "SPECIALIST", chevrons: 3, minOwned: 8 },
  { name: "ELITE", chevrons: 4, minOwned: 15 },
];

export function rankFor(ownedRungs: number): Rank {
  let best = RANK_TIERS[0];
  for (const t of RANK_TIERS) if (ownedRungs >= t.minOwned) best = t;
  return { name: best.name, chevrons: best.chevrons };
}

/* ------------------------------------------------------------------ *
 * The week hex strip — real calendar days, not a rotation guess
 *
 * The engine's session rotation (`weekShape`) is a CURSOR, not a calendar
 * — it advances on what has actually been trained, so there is no honest
 * way to say in advance which weekday a future slot lands on. The hex
 * strip therefore shows the current Mon–Sun week AS LOGGED, which is a
 * fact rather than a forecast.
 * ------------------------------------------------------------------ */

export type HexState = "done" | "today" | "future" | "pending";
export type HexDay = { label: string; iso: string; state: HexState };

/** Monday of the week containing `iso`, as an ISO date. */
export function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday
  const back = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export function hexWeek(trainedIsoDates: string[], todayIso: string): HexDay[] {
  const trained = new Set(trainedIsoDates);
  const monday = mondayOf(todayIso);
  const out: HexDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const state: HexState =
      iso === todayIso
        ? "today"
        : trained.has(iso)
          ? "done"
          : iso > todayIso
            ? "future"
            : "pending";
    out.push({ label: DAY_LABELS[i], iso, state });
  }
  return out;
}

/** "3 / 5 sessions complete · on pace" — never claims a target it cannot see. */
export function weekProgressLine(days: HexDay[], targetPerWeek: number | null): string {
  const done = days.filter((d) => d.state === "done" || d.state === "today").length;
  if (targetPerWeek == null) return `${done} session${done === 1 ? "" : "s"} this week`;
  const onPace = done >= Math.floor((targetPerWeek * dayOfWeekIndex(days)) / 7);
  return `${done} / ${targetPerWeek} sessions this week${onPace ? " · on pace" : ""}`;
}

function dayOfWeekIndex(days: HexDay[]): number {
  const i = days.findIndex((d) => d.state === "today" || d.state === "future");
  return i === -1 ? 7 : i + 1;
}

/* ------------------------------------------------------------------ *
 * Confidence, worded for the ring's sub-label
 * ------------------------------------------------------------------ */

export function confidenceLine(confidence: number): string {
  return `CONF ${Math.round(confidence * 100)}%`;
}
