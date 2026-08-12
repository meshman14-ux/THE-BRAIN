/* ------------------------------------------------------------------ *
 * The quarterly reset — the third ritual, and the longest lens
 *
 * Decision 7: daily 2 minutes, weekly 20, quarterly an hour. Monthly
 * deliberately absent. The daily close ships the day, the weekly review
 * ships the week — the quarterly hour is where the system's longest
 * memory gets read back: a season's worth of finishes, scores moved or
 * not moved since the LAST quarter's snapshot, the obstacles that kept
 * costing weeks, and one honest focus per system for the next quarter.
 *
 * Everything here is assembled, never generated — arithmetic over data
 * the database already holds, the advisor's own rule. The evidence is
 * shown FIRST, because a reset scored from memory is a mood; scored
 * from the record it is a measurement.
 * ------------------------------------------------------------------ */

import { endOfQuarter, quarterOf, toIso } from "./logic";

export type QuarterBounds = {
  /** First day of the quarter, ISO. Doubles as the review's period_start. */
  start: string;
  /** Last day, ISO. */
  end: string;
  /** "Q3 2026" — the name the empire's horizons already use. */
  label: string;
  /** Days from `today` to the boundary, 0 on the last day. Never negative. */
  daysLeft: number;
};

export function quarterBounds(todayIso: string): QuarterBounds {
  const year = Number(todayIso.slice(0, 4));
  const q = quarterOf(todayIso);
  const start = toIso(new Date(year, (q - 1) * 3, 1));
  const end = endOfQuarter(todayIso);
  const daysLeft = Math.max(
    0,
    Math.round(
      (Date.parse(end + "T00:00:00") - Date.parse(todayIso + "T00:00:00")) /
        86_400_000
    )
  );
  return { start, end, label: `Q${q} ${year}`, daysLeft };
}

/** How many Monday-anchored weeks the quarter holds — the honest
 *  denominator for "weekly reviews done". */
export function mondaysIn(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  let count = 0;
  const d = new Date(start);
  // Walk to the first Monday, then step by sevens.
  while (d.getDay() !== 1 && d <= end) d.setDate(d.getDate() + 1);
  while (d <= end) {
    count++;
    d.setDate(d.getDate() + 7);
  }
  return count;
}

/**
 * `reviews.pillar_scores` is jsonb — validate, never trust (§A7). Keys
 * must look like ids, values must be 0–10 numbers; everything else is
 * discarded rather than crashing a page Jay opened to reflect in.
 */
export function readPillarScores(raw: unknown): Record<string, number> {
  if (typeof raw !== "object" || raw == null) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length < 8) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (v < 0 || v > 10) continue;
    out[k] = Math.round(v);
  }
  return out;
}

export type ScoreDelta = {
  id: string;
  name: string;
  now: number | null;
  then: number | null;
  /** Null unless BOTH ends are known — a delta from a guess is a guess. */
  delta: number | null;
};

/**
 * Each area's movement since the last quarterly snapshot. The delta only
 * exists when both ends were actually scored: "unknown then, 6 now" is
 * a first measurement, not an improvement of six.
 */
export function scoreDeltas(
  pillars: { id: string; name: string; score?: number | null }[],
  previous: Record<string, number>
): ScoreDelta[] {
  return pillars.map((p) => {
    const now = typeof p.score === "number" ? p.score : null;
    const then = previous[p.id] ?? null;
    return {
      id: p.id,
      name: p.name,
      now,
      then,
      delta: now != null && then != null ? now - then : null,
    };
  });
}

/**
 * Days a season occupied inside the quarter. A season that started in
 * June and ended in August still only credits the quarter its July and
 * August days; an open season runs to `today`, never to the boundary —
 * the future has not happened yet.
 */
export function seasonDaysInQuarter(
  season: { kind: string; started_on: string; ended_on: string | null },
  bounds: Pick<QuarterBounds, "start" | "end">,
  todayIso: string
): number {
  const from = season.started_on > bounds.start ? season.started_on : bounds.start;
  const openTo = season.ended_on ?? todayIso;
  const to = openTo < bounds.end ? openTo : bounds.end;
  if (to < from) return 0;
  return (
    Math.round(
      (Date.parse(to + "T00:00:00") - Date.parse(from + "T00:00:00")) /
        86_400_000
    ) + 1
  );
}
