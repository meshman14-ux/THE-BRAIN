/* ------------------------------------------------------------------ *
 * Metrics — a number that moves
 *
 * `metrics` and `metric_readings` shipped with the v1 schema on
 * 2026-07-30. Seven metrics exist. `metric_readings` has never held a
 * row, because until now nothing in the app could write one: the four
 * pages that read a metric all look it up BY NAME and render whatever
 * readings happen to be there, which has always been none.
 *
 * THE LAW THIS MODULE IS BUILT AGAINST is the one `lifeos.ts` states:
 *
 *   > TRUTH MUST BE FREE. A measurement that costs a manual entry will
 *   > not survive contact with a busy season.
 *
 * Taken seriously, that is not an argument against a metrics module —
 * it is the argument for the shape of this one. Two consequences, and
 * they are the whole design:
 *
 * 1 · **A number with a home elsewhere is never typed here.** Steps,
 *     sleep and weight are columns on `health_days`. Debt remaining is
 *     the sum of `debts`. Those metrics are DERIVED — this module shows
 *     their trend and refuses to accept a reading against them, because
 *     a second writer is a second answer, and §A2 says every record has
 *     exactly one home.
 *
 *     This is not hypothetical. `metric_readings` was seeded once with
 *     a debt figure of £8,317; the dashboard presented it as a total
 *     and it was only ever partial. The reading was deleted and
 *     `metrics.meta` still carries the note saying why.
 *     `DERIVED_METRICS` is that note turned into a guard.
 *
 * 2 · **What genuinely cannot be derived gets the cheapest possible
 *     entry and an honest staleness report.** Nobody but Jay knows his
 *     monthly income. So: one number, one tap, once a month, and the
 *     page says how long it has been rather than nagging.
 *
 * Everything else follows the rules the rest of the system already
 * keeps. Absence is not zero — no readings means no trend, not a flat
 * line at nothing. One reading is a value and not a trend. A target
 * that was never set produces null, never 100%.
 * ------------------------------------------------------------------ */

import type { Metric, MetricReading } from "./types";
import { addDays, daysUntil, formatGBP } from "./logic";

/* ------------------------------------------------------------------ *
 * 1 · The metrics that may not be typed
 * ------------------------------------------------------------------ */

/**
 * Where a derived metric's truth actually lives, and why it may not be
 * written here.
 *
 * Keyed by `metrics.name` because that is how the four existing readers
 * already find them, and because the name is the only stable handle: the
 * ids differ per user and the rows are seeded, not migrated.
 */
export type DerivedSource = {
  /** The table that owns the number. */
  home: string;
  /** Said on screen, beside the metric, in place of the entry box. */
  why: string;
  /** Where to go to change it. */
  href: string;
};

export const DERIVED_METRICS: Record<string, DerivedSource> = {
  "Debt remaining": {
    home: "debts",
    why: "Summed from your creditors, and reported as incomplete while any balance is unknown. A figure typed here was partial once and read as a total.",
    href: "/life/money",
  },
  Steps: {
    home: "health_days",
    why: "Comes from Health Connect on your phone. Typing it would give the same day two answers.",
    href: "/life/body",
  },
  Sleep: {
    home: "health_days",
    why: "Comes from Health Connect on your phone. Typing it would give the same day two answers.",
    href: "/life/body",
  },
  Weight: {
    home: "health_days",
    why: "Recorded on the health page, where it sits beside the rest of the day.",
    href: "/life/body",
  },
};

/**
 * Whether this metric's number is owned by another table.
 *
 * Fails OPEN — an unknown name is recordable. That direction is
 * deliberate: the registry exists to protect four known numbers from a
 * second writer, and the point of the module is that Jay can add metrics
 * of his own. A closed default would make every new metric read-only,
 * which is the module not working.
 */
export function derivedSource(name: string): DerivedSource | null {
  return DERIVED_METRICS[name] ?? null;
}

export function canRecord(metric: Pick<Metric, "name">): boolean {
  return derivedSource(metric.name) == null;
}

/* ------------------------------------------------------------------ *
 * 2 · Cadence — how often this number is worth asking for
 * ------------------------------------------------------------------ */

export const CADENCES = ["daily", "weekly", "monthly", "quarterly"] as const;
export type Cadence = (typeof CADENCES)[number];

/**
 * Monthly, because it is the cheapest cadence that still produces a
 * trend within a season. A metric asked for daily that nobody answers
 * daily reports as permanently overdue, which trains you to ignore it.
 */
export const DEFAULT_CADENCE: Cadence = "monthly";

export const CADENCE_DAYS: Record<Cadence, number> = {
  daily: 1,
  weekly: 7,
  monthly: 31,
  quarterly: 92,
};

export const CADENCE_LABEL: Record<Cadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

/**
 * Read the cadence out of `metrics.meta`.
 *
 * `meta` is jsonb, so nothing that comes out of it can be trusted —
 * the same discipline `readHours` and `readObstacles` keep. Anything
 * unrecognised degrades to the default rather than throwing: a page Jay
 * opened to read must not fall over because a row holds a number where
 * a string was expected.
 */
export function readCadence(meta: unknown): Cadence {
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return DEFAULT_CADENCE;
  const raw = (meta as Record<string, unknown>).cadence;
  if (typeof raw !== "string") return DEFAULT_CADENCE;
  const found = CADENCES.find((c) => c === raw);
  return found ?? DEFAULT_CADENCE;
}

/** The note a seeded metric carries about itself, if it carries one. */
export function readMetricNote(meta: unknown): string | null {
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  for (const key of ["note", "why"]) {
    const v = m[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 3 · Freshness
 * ------------------------------------------------------------------ */

export type Freshness = {
  /** Days since the last reading. Null when there has never been one. */
  daysSince: number | null;
  /** Past its own cadence. False when never read — see below. */
  overdue: boolean;
  /** Never read at all. Different from overdue, and ranked differently. */
  never: boolean;
};

/**
 * How stale this metric is, against its own cadence.
 *
 * `never` is kept separate from `overdue` on purpose, and the ranking
 * below relies on it: a metric with history that has lapsed is a habit
 * breaking, which is worth surfacing; a metric never read is unknown,
 * not failing. That is the same call `pillars.score` makes when it ranks
 * unscored areas below scored ones.
 */
export function freshness(
  readings: Pick<MetricReading, "taken_on">[],
  cadence: Cadence,
  todayIso: string
): Freshness {
  if (readings.length === 0) return { daysSince: null, overdue: false, never: true };
  const last = [...readings].sort((a, b) => b.taken_on.localeCompare(a.taken_on))[0];
  // daysUntil is signed from today, so a past date is negative.
  const ago = daysUntil(last.taken_on, todayIso);
  const daysSince = ago == null ? null : Math.max(0, -ago);
  if (daysSince == null) return { daysSince: null, overdue: false, never: true };
  return { daysSince, overdue: daysSince > CADENCE_DAYS[cadence], never: false };
}

/* ------------------------------------------------------------------ *
 * 4 · Trend
 * ------------------------------------------------------------------ */

/**
 * `better` / `worse` are judged against the metric's own `direction`,
 * which is why a falling debt is good and a falling income is not.
 * Null means there is nothing to say — never "flat".
 */
export type Verdict = "better" | "worse" | "flat" | null;

export type Trend = {
  /** Change across the window, in the metric's own unit. */
  change: number | null;
  /** As a share of the earliest value. Null when that value is zero. */
  pct: number | null;
  verdict: Verdict;
  /** How many readings the verdict rests on. Shown, so it can be judged. */
  basis: number;
};

/**
 * Movement across a window.
 *
 * TWO READINGS IS THE FLOOR and it is not arbitrary: one reading is a
 * value, and drawing a trend through one point is the system inventing
 * a direction it cannot see. Below two, everything is null and `basis`
 * says how close it is.
 */
export function trend(
  readings: Pick<MetricReading, "taken_on" | "value">[],
  todayIso: string,
  windowDays: number,
  direction: string
): Trend {
  const from = addDays(todayIso, -windowDays);
  const inWindow = readings
    .filter((r) => r.taken_on >= from && r.taken_on <= todayIso)
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on));

  if (inWindow.length < 2) {
    return { change: null, pct: null, verdict: null, basis: inWindow.length };
  }

  const first = inWindow[0].value;
  const last = inWindow[inWindow.length - 1].value;
  const change = last - first;
  const pct = first === 0 ? null : (change / Math.abs(first)) * 100;

  let verdict: Verdict = "flat";
  if (change !== 0) {
    const up = change > 0;
    const wantsUp = direction !== "down";
    verdict = up === wantsUp ? "better" : "worse";
  }

  return { change, pct, verdict, basis: inWindow.length };
}

/* ------------------------------------------------------------------ *
 * 5 · Target
 * ------------------------------------------------------------------ */

/**
 * How far along the target is, 0–1, or null when it cannot be said.
 *
 * Null when there is no target, no reading, or no baseline to measure
 * from — a target with nothing to compare it to is not 0% done, it is
 * unknown, and showing an empty bar would say the opposite.
 *
 * A `down` metric measures from where it STARTED, so paying £8,000 of a
 * £10,000 debt reads as 80% and not as 20%. That needs the first
 * reading, which is why this takes the whole series rather than the
 * latest value.
 */
export function targetProgress(
  readings: Pick<MetricReading, "taken_on" | "value">[],
  target: number | null | undefined,
  direction: string
): number | null {
  if (target == null || !Number.isFinite(target)) return null;
  if (readings.length === 0) return null;
  const sorted = [...readings].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  const latest = sorted[sorted.length - 1].value;

  if (direction === "down") {
    const start = sorted[0].value;
    const span = start - target;
    // Started at or below the target already: there is no journey to
    // report a percentage of.
    if (span <= 0) return latest <= target ? 1 : null;
    return clamp01((start - latest) / span);
  }

  if (target === 0) return latest >= 0 ? 1 : 0;
  return clamp01(latest / target);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Whether the target has actually been met, which a clamped bar hides. */
export function targetMet(
  latest: number | null,
  target: number | null | undefined,
  direction: string
): boolean | null {
  if (target == null || latest == null || !Number.isFinite(target)) return null;
  return direction === "down" ? latest <= target : latest >= target;
}

/* ------------------------------------------------------------------ *
 * 6 · The sparkline
 * ------------------------------------------------------------------ */

export type SparkPoint = { x: number; y: number };

/**
 * Points for a sparkline, in an `w × h` box, oldest on the left.
 *
 * Null below two readings, for the same reason `trend` is: a single dot
 * suggests a line. A FLAT series draws down the middle rather than
 * dividing by a zero range — every value equal is a real and readable
 * fact, and it must not become a NaN path that renders as nothing.
 *
 * Y is inverted for SVG (0 at the top), so a rising number rises.
 */
export function sparkPoints(
  readings: Pick<MetricReading, "taken_on" | "value">[],
  w: number,
  h: number,
  pad = 2
): SparkPoint[] | null {
  const sorted = [...readings].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  if (sorted.length < 2) return null;

  const values = sorted.map((r) => r.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo;
  const innerW = Math.max(0, w - pad * 2);
  const innerH = Math.max(0, h - pad * 2);

  return sorted.map((r, i) => ({
    x: pad + (innerW * i) / (sorted.length - 1),
    y: range === 0 ? pad + innerH / 2 : pad + innerH * (1 - (r.value - lo) / range),
  }));
}

/** The same points as an SVG `points` attribute. Null when there are none. */
export function sparkPath(points: SparkPoint[] | null): string | null {
  if (!points || points.length < 2) return null;
  return points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(" ");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * 7 · One metric's whole state
 * ------------------------------------------------------------------ */

export type MetricSummary = {
  metric: Metric;
  cadence: Cadence;
  /** Null when this metric owns its own number. */
  derived: DerivedSource | null;
  /** Whether a reading may be typed against it. */
  recordable: boolean;
  readings: Pick<MetricReading, "taken_on" | "value">[];
  latest: { taken_on: string; value: number } | null;
  fresh: Freshness;
  trend: Trend;
  progress: number | null;
  met: boolean | null;
  note: string | null;
};

/** The window every trend on the board is read over. Ninety days is one
 *  season, which is the shortest span a monthly metric can say anything
 *  over: three readings. */
export const TREND_WINDOW_DAYS = 90;

export function summarise(
  metric: Metric,
  readings: Pick<MetricReading, "taken_on" | "value">[],
  todayIso: string,
  windowDays = TREND_WINDOW_DAYS
): MetricSummary {
  const sorted = [...readings].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  const cadence = readCadence(metric.meta);
  const derived = derivedSource(metric.name);
  const latest = sorted.length ? sorted[sorted.length - 1] : null;

  return {
    metric,
    cadence,
    derived,
    recordable: derived == null,
    readings: sorted,
    latest: latest ? { taken_on: latest.taken_on, value: latest.value } : null,
    fresh: freshness(sorted, cadence, todayIso),
    trend: trend(sorted, todayIso, windowDays, metric.direction),
    progress: targetProgress(sorted, metric.target ?? null, metric.direction),
    met: targetMet(latest ? latest.value : null, metric.target ?? null, metric.direction),
    note: readMetricNote(metric.meta),
  };
}

/* ------------------------------------------------------------------ *
 * 8 · The order they appear in
 * ------------------------------------------------------------------ */

/**
 * Four bands, and the ordering between them is the argument:
 *
 *   1 · **Lapsed.** Has history, and the cadence has passed. A habit
 *       breaking is the only thing on this page worth interrupting for.
 *   2 · **Never read.** The module cannot say anything at all yet — but
 *       unknown is not failing, exactly as an unscored area ranks below
 *       every scored one.
 *   3 · **Current.** Working. Most recently read last, so the board does
 *       not reshuffle every time something is entered.
 *   4 · **Derived.** Nothing to do here by definition, so it goes last
 *       however stale it looks. A wearable that has not synced is the
 *       health page's problem, not this page's.
 */
export function metricBand(s: MetricSummary): 1 | 2 | 3 | 4 {
  if (s.derived) return 4;
  if (s.fresh.overdue) return 1;
  if (s.fresh.never) return 2;
  return 3;
}

export function rankMetrics(items: MetricSummary[]): MetricSummary[] {
  return [...items].sort((a, b) => {
    const ba = metricBand(a);
    const bb = metricBand(b);
    if (ba !== bb) return ba - bb;
    // Most overdue first inside band 1; everything else alphabetical, so
    // the board is stable and findable rather than moving under the thumb.
    if (ba === 1) {
      const da = a.fresh.daysSince ?? 0;
      const db = b.fresh.daysSince ?? 0;
      if (da !== db) return db - da;
    }
    return a.metric.name.localeCompare(b.metric.name);
  });
}

/* ------------------------------------------------------------------ *
 * 9 · Entry and display
 * ------------------------------------------------------------------ */

/**
 * What was typed, or why it cannot be stored.
 *
 * Unlike `parseInline`, an empty box is an ERROR rather than a null.
 * A reading is an event — it happened, at a value, on a day — so there
 * is no such thing as clearing it to unknown. Deleting the reading is
 * the operation that means that, and it is a different button.
 */
export function parseReading(
  raw: string
): { ok: true; value: number } | { ok: false; error: string } {
  const s = raw.trim();
  if (s === "") return { ok: false, error: "Needs a number." };
  // Number("") is 0 and Number(" ") is 0; both are already handled above,
  // but the guard stays because this is the same trap `toNumberOrNull`
  // exists for and a blank must never become a zero reading.
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: "Needs a number." };
  return { ok: true, value: n };
}

/** A reading in its own unit. `£` goes through formatGBP; nothing else
 *  gets a currency symbol it did not ask for. */
export function formatReading(value: number | null, unit: string | null): string {
  if (value == null || !Number.isFinite(value)) return unit === "£" ? "£—" : "—";
  if (unit === "£") return formatGBP(value);
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const grouped = rounded.toLocaleString("en-GB");
  return unit ? `${grouped} ${unit}` : grouped;
}

/** The signed change, written the way a person would say it. */
export function formatChange(change: number | null, unit: string | null): string | null {
  if (change == null) return null;
  if (change === 0) return "no change";
  const sign = change > 0 ? "+" : "−";
  return `${sign}${formatReading(Math.abs(change), unit)}`;
}

/**
 * The one line the board leads with, or null when it has nothing to say.
 *
 * Null rather than an encouraging sentence: a page that congratulates
 * you for being up to date is a page you learn to skim, and the same
 * reasoning already keeps `setupLine` quiet once every gap is filled.
 */
export function metricsLine(items: MetricSummary[]): string | null {
  const lapsed = items.filter((s) => metricBand(s) === 1);
  if (lapsed.length === 1) {
    const s = lapsed[0];
    return `${s.metric.name} was last recorded ${s.fresh.daysSince} days ago.`;
  }
  if (lapsed.length > 1) {
    return `${lapsed.length} metrics are past their own cadence.`;
  }
  const never = items.filter((s) => metricBand(s) === 2);
  if (never.length > 0) {
    return `${never.length} ${never.length === 1 ? "metric has" : "metrics have"} never been recorded, so ${
      never.length === 1 ? "it has" : "they have"
    } no trend yet.`;
  }
  return null;
}
