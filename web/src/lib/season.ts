import type { Venture } from "./types";
import { daysUntil } from "./logic";

/* ------------------------------------------------------------------ *
 * Seasons — the annual shape the week never had
 *
 * Jay's work is seasonal: busy months and quiet months. Every system built
 * on "this week" is therefore correct for part of the year and wrong for
 * the rest, and a system that is wrong for half the year is one you stop
 * trusting in the half where it accuses you.
 *
 * The whole point is this: **in a busy season, an untouched venture is not
 * a failure — it is correctly parked.** Without a season the watchtower
 * cannot tell the difference between dropped and deliberately deferred, so
 * it cries wolf for months and is then ignored when it matters.
 *
 * Three kinds, one control:
 *
 *   quiet   — the building window. Peak hours are free; the full system
 *             runs and 3 ventures can be genuinely active.
 *   busy    — paid work owns the peak hours. One active venture, and no
 *             expectation of anything beyond the floor.
 *   minimum — the declared reset. Two obligations, everything else stops
 *             counting. Jay's answer to overload was "push through and pay
 *             later", which means there is no recovery phase — only a
 *             deferred bill. This makes the reset a state you can DECLARE
 *             rather than one you fall into, which is the difference
 *             between reducing deliberately and quietly dropping things.
 * ------------------------------------------------------------------ */

export const SEASON_KINDS = ["quiet", "busy", "minimum"] as const;
export type SeasonKind = (typeof SEASON_KINDS)[number];

export type Season = {
  id: string;
  kind: SeasonKind;
  started_on: string;
  ended_on: string | null;
  note?: string | null;
};

export const SEASON_LABEL: Record<SeasonKind, string> = {
  quiet: "Quiet season",
  busy: "Busy season",
  minimum: "Minimum mode",
};

export const SEASON_ICON: Record<SeasonKind, string> = {
  quiet: "◔",
  busy: "◕",
  minimum: "◌",
};

/** What each season is FOR, in Jay's own terms. Shown on the switch. */
export const SEASON_MEANING: Record<SeasonKind, string> = {
  quiet:
    "The building window. Peak hours are free, so venture work happens now — not squeezed into evenings later in the year.",
  busy:
    "Paid work owns the best hours. One venture stays warm, the rest are parked on purpose, and nothing here counts as slipping.",
  minimum:
    "Declared reset. Training and the daily close, nothing else. Not a collapse — a decision, and the system stops counting the rest.",
};

/** The neutral position when nothing has ever been declared. */
export const DEFAULT_SEASON: SeasonKind = "quiet";

/* ------------------------------------------------------------------ *
 * Expectations — what the system asks of you in each season
 * ------------------------------------------------------------------ */

export type Expectations = {
  /** How many ventures may be genuinely active. The empire's real cap. */
  activeVentureSlots: number;
  /** How many focus slots the week offers per system. */
  focusSlots: number;
  /** Whether unworked ventures should be flagged at all. */
  flagsUnworkedVentures: boolean;
  /** Whether area scoring is expected this season. */
  expectsAreaScores: boolean;
  /** Whether the weekly review is asked for. */
  expectsWeeklyReview: boolean;
  /** The obligations that survive, whatever else goes. */
  floor: string[];
};

/**
 * Deliberately austere as the seasons narrow. The floor never changes —
 * training and the daily close survive every season, because the keystone
 * habit is the first thing sacrificed under load and the last thing that
 * should be.
 */
export function expectationsFor(kind: SeasonKind): Expectations {
  switch (kind) {
    case "quiet":
      return {
        activeVentureSlots: 3,
        focusSlots: 5,
        flagsUnworkedVentures: true,
        expectsAreaScores: true,
        expectsWeeklyReview: true,
        floor: ["Training ×4", "Daily close"],
      };
    case "busy":
      return {
        activeVentureSlots: 1,
        focusSlots: 3,
        // The whole point of declaring a busy season.
        flagsUnworkedVentures: false,
        expectsAreaScores: false,
        expectsWeeklyReview: true,
        floor: ["Training ×4", "Daily close"],
      };
    case "minimum":
      return {
        activeVentureSlots: 0,
        focusSlots: 1,
        flagsUnworkedVentures: false,
        expectsAreaScores: false,
        expectsWeeklyReview: false,
        floor: ["Training ×4", "Daily close"],
      };
  }
}

/** The open season, or null when none has ever been declared. */
export function currentSeason(rows: Season[]): Season | null {
  const open = rows.filter((s) => s.ended_on == null);
  if (open.length === 0) return null;
  // The unique index guarantees one, but reading defensively costs nothing.
  return [...open].sort((a, b) => b.started_on.localeCompare(a.started_on))[0];
}

/** The kind in force — never null, so callers never branch on absence. */
export function seasonKind(rows: Season[]): SeasonKind {
  return currentSeason(rows)?.kind ?? DEFAULT_SEASON;
}

/** How long the current season has run. Null when nothing is declared. */
export function daysInSeason(rows: Season[], todayIso: string): number | null {
  const s = currentSeason(rows);
  if (!s) return null;
  const d = daysUntil(s.started_on, todayIso);
  return d == null ? null : Math.max(0, -d);
}

/**
 * "Busy season · 23 days" — the dashboard's top line.
 * Never renders a duration it cannot evidence.
 */
export function seasonLine(rows: Season[], todayIso: string): string {
  const kind = seasonKind(rows);
  const days = daysInSeason(rows, todayIso);
  const label = SEASON_LABEL[kind];
  if (days == null) return `${label} · not yet declared`;
  return `${label} · day ${days + 1}`;
}

/* ------------------------------------------------------------------ *
 * Venture dormancy — the attention tax, removed
 *
 * Eighteen ventures is not scatter; it is the identity, and narrowing Jay
 * to three would be a cage he abandons. But an idle venture still charges
 * background attention every time it appears in a list, a count or an
 * alert. Dormancy removes the tax without removing the ambition.
 *
 * Same discipline as task dormancy: DERIVED at read time, nothing written,
 * nothing deleted. Waking a venture is doing something with it — running a
 * diagnostic, moving its stage — never un-setting a flag.
 * ------------------------------------------------------------------ */

export const VENTURE_DORMANT_AFTER_DAYS = 30;

/** What the system knows about when a venture was last genuinely touched. */
export type VentureTouch = {
  /** Most recent diagnostic run start, if any. */
  lastRunAt?: string | null;
};

type Dormable = Pick<Venture, "id" | "status"> & {
  created_at?: string | null;
};

/**
 * Three rules, and the first is the important one.
 *
 * - **A venture Jay has already parked is not dormant — it is parked.**
 *   `backlog`, `paused` and `exited` are deliberate declarations, and
 *   calling a deliberate choice "dormant" would be the system telling him
 *   off for a decision he made on purpose. Dormancy is only ever about
 *   drift: something *called* active that has gone quiet.
 * - **A touch is a diagnostic run.** It is the only per-venture action the
 *   schema timestamps, so it is the only honest evidence of attention.
 * - **No date, no dormancy.** A venture with nothing to date cannot be
 *   shown to have gone quiet, and hiding must fail closed — the same rule
 *   the nav uses for a missing attribute.
 */
export function isVentureDormant(
  v: Dormable,
  touch: VentureTouch,
  todayIso: string,
  afterDays: number = VENTURE_DORMANT_AFTER_DAYS
): boolean {
  if (v.status !== "active") return false;
  const stamps = [touch.lastRunAt, v.created_at].filter(
    (s): s is string => typeof s === "string" && s.length >= 10
  );
  if (stamps.length === 0) return false;
  const sinceEach = stamps.map((s) => {
    const d = daysUntil(s.slice(0, 10), todayIso);
    // A future stamp is negative-since, which keeps the venture awake.
    return d == null ? null : -d;
  });
  if (sinceEach.some((d) => d == null)) return false;
  // The most recent touch wins: the smallest "days since".
  return Math.min(...(sinceEach as number[])) > afterDays;
}

export type VentureSplit<T> = {
  /** Active and recently touched — what the empire is actually running. */
  live: T[];
  /** Active on paper, silent in practice. Out of the counts, not deleted. */
  dormant: T[];
  /** Deliberately shelved by Jay. Never confused with dormant. */
  parked: T[];
};

/** One pass, three buckets — so no screen can count a venture twice. */
export function splitVentures<T extends Dormable>(
  ventures: T[],
  touches: Map<string, VentureTouch>,
  todayIso: string
): VentureSplit<T> {
  const out: VentureSplit<T> = { live: [], dormant: [], parked: [] };
  for (const v of ventures) {
    if (v.status !== "active") {
      out.parked.push(v);
    } else if (isVentureDormant(v, touches.get(v.id) ?? {}, todayIso)) {
      out.dormant.push(v);
    } else {
      out.live.push(v);
    }
  }
  return out;
}

/**
 * Whether the active set is over the season's cap.
 *
 * Reported, never enforced — the system's job is to say "you have four
 * things warm in a season that supports one", not to pick which three to
 * drop. That decision belongs to Jay, the same rule the calendar holds for
 * conflicts.
 */
export function activeSetStatus(
  liveCount: number,
  kind: SeasonKind
): { slots: number; over: boolean; line: string } {
  const slots = expectationsFor(kind).activeVentureSlots;
  const over = liveCount > slots;
  if (slots === 0) {
    return {
      slots,
      over,
      line: over
        ? `${liveCount} venture${liveCount === 1 ? "" : "s"} still warm in minimum mode — the floor is training and the close, nothing else.`
        : "Minimum mode. Nothing is expected of the empire this month.",
    };
  }
  return {
    slots,
    over,
    line: over
      ? `${liveCount} active in a season that supports ${slots}. Not an error — but something here is being run on hours that do not exist.`
      : `${liveCount} of ${slots} active. Room for ${slots - liveCount} more.`,
  };
}
