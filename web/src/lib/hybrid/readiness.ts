/* ------------------------------------------------------------------ *
 * The readiness engine
 *
 * Four kinds of input were chosen — wearable, CSV import, self-report and
 * pure inference from training load — which means the engine cannot assume
 * any particular one is present. That is the design constraint that shapes
 * everything here, and it is a better constraint than it looks: a score
 * that silently changes meaning as inputs come and go is worse than no
 * score, so this engine reports HOW MUCH IT KNOWS alongside what it thinks.
 *
 * The method:
 *
 *   1. **Normalise against the athlete's own baseline, not a population.**
 *      A rolling 60-day mean and standard deviation per signal, today's
 *      value expressed as a z-score, squashed to 0–1. Whoop, Oura and
 *      Garmin all do this, and the reason is that absolute HRV is
 *      meaningless across people — a well-recovered 40-year-old and a
 *      well-recovered 20-year-old can differ threefold in rMSSD.
 *   2. **Weight by what the signal is worth, then discount it by how well
 *      it is known.** Reliability is a function of freshness and
 *      directness, not of whether a machine produced it. Saw, Main &
 *      Gastin (BJSM 2016, 56 studies) found subjective wellbeing responded
 *      to load with GREATER sensitivity than objective markers, so
 *      self-report is weighted as a peer of HRV, not as a stand-in.
 *   3. **Average over what is present, and say what is missing.** A
 *      missing signal is never imputed as average — that would quietly
 *      pull every score toward the middle and make a thin day look normal.
 *   4. **Refuse to answer when the evidence is too thin.** Below a
 *      confidence floor the engine returns a null score and the reason.
 *      A confident number computed from one stale reading is the failure
 *      mode this whole module exists to avoid.
 * ------------------------------------------------------------------ */

import {
  type Reading,
  type ReadinessBandName,
  type ReadinessResult,
  type SignalContribution,
  type SignalKey,
  type SignalSource,
  SIGNAL_KEYS,
} from "./types";

/* ------------------------------------------------------------------ *
 * Configuration — all of it data, none of it hard-coded into the maths
 * ------------------------------------------------------------------ */

/** Days of history a personal baseline is built from. */
export const BASELINE_DAYS = 60;

/** Below this many readings a signal has no baseline and is skipped. */
export const BASELINE_MIN_READINGS = 14;

/** Below this confidence the engine declines to produce a score at all. */
export const CONFIDENCE_FLOOR = 0.35;

/** Direction of goodness. `true` means a higher raw value is better. */
export const SIGNAL_HIGHER_IS_BETTER: Record<SignalKey, boolean> = {
  hrv: true,
  resting_hr: false,
  sleep_hours: true,
  sleep_quality: true,
  stress: false,
  soreness: false,
  mood: true,
  energy: true,
  hydration: true,
  nutrition: true,
  acute_load: false,
};

/**
 * What each signal is worth.
 *
 * HRV and sleep lead because they are the two with the strongest evidence
 * behind them (Jamieson's HRV-guided work; Huberman and Attia both put
 * sleep first among recovery levers). Soreness and stress are weighted
 * close behind on the strength of the subjective-measures literature.
 * Hydration and nutrition are real but small — they belong in the score,
 * not near the top of it.
 */
export const SIGNAL_WEIGHT: Record<SignalKey, number> = {
  hrv: 1.0,
  sleep_hours: 0.9,
  sleep_quality: 0.9,
  soreness: 0.8,
  stress: 0.8,
  resting_hr: 0.7,
  energy: 0.7,
  mood: 0.5,
  acute_load: 0.6,
  hydration: 0.3,
  nutrition: 0.3,
};

/**
 * Reliability by source.
 *
 * `derived` is discounted hardest because it is an inference from what was
 * logged rather than an observation of the body — useful, but it cannot
 * know about the argument you had or the night you did not sleep.
 */
export const SOURCE_RELIABILITY: Record<SignalSource, number> = {
  wearable: 1.0,
  self: 0.95,
  import: 0.9,
  derived: 0.6,
};

/**
 * How fast a reading loses value with age, per day.
 *
 * Yesterday's HRV says something about today. Last Tuesday's does not.
 * A reading five days old retains about a third of its weight, which is
 * roughly the point at which the CSV-import path stops being a daily
 * signal and starts being a trend.
 */
export const STALENESS_HALF_LIFE_DAYS = 3;

/* ------------------------------------------------------------------ *
 * Baselines
 * ------------------------------------------------------------------ */

export type Baseline = {
  key: SignalKey;
  mean: number;
  /** Standard deviation — the width of this athlete's normal. */
  sd: number;
  readings: number;
};

const daysBetween = (a: string, b: string): number =>
  Math.round(
    (Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
      Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) /
      86_400_000
  );

/**
 * A rolling personal baseline for one signal.
 *
 * Today is EXCLUDED from its own baseline. Comparing a value against a
 * window that contains it drags the baseline toward it and flattens
 * exactly the deviation the score is trying to detect.
 */
export function baselineFor(
  readings: Reading[],
  key: SignalKey,
  todayIso: string,
  days: number = BASELINE_DAYS,
  minReadings: number = BASELINE_MIN_READINGS
): Baseline | null {
  const window = readings
    .filter((r) => r.key === key && r.on < todayIso)
    .filter((r) => daysBetween(r.on, todayIso) <= days)
    .map((r) => r.value)
    .filter((v) => Number.isFinite(v));

  if (window.length < minReadings) return null;

  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance =
    window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
  const sd = Math.sqrt(variance);

  // An sd of zero is a stuck sensor, not perfect consistency. Scoring
  // against it would send every subsequent day to an extreme.
  if (sd === 0) return null;

  return { key, mean, sd, readings: window.length };
}

export function allBaselines(
  readings: Reading[],
  todayIso: string
): Map<SignalKey, Baseline> {
  const out = new Map<SignalKey, Baseline>();
  for (const key of SIGNAL_KEYS) {
    const b = baselineFor(readings, key, todayIso);
    if (b) out.set(key, b);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Normalising
 * ------------------------------------------------------------------ */

/**
 * z-score → 0–1, via a logistic curve.
 *
 * Linear clamping would treat "two SDs down" and "four SDs down" as the
 * same day, which is precisely the day worth distinguishing. The logistic
 * keeps the extremes separable while flattening the middle, so ordinary
 * day-to-day noise does not read as signal. The 0.9 constant puts one
 * standard deviation at roughly 0.29 / 0.71 — a visible move, not an alarm.
 */
export function squash(z: number): number {
  return 1 / (1 + Math.exp(-0.9 * z));
}

/**
 * Normalise a raw reading against its own baseline, in the right direction.
 * Returns 0–1 where 1 is "better than usual for you".
 */
export function normalise(value: number, baseline: Baseline): number {
  const z = (value - baseline.mean) / baseline.sd;
  const directed = SIGNAL_HIGHER_IS_BETTER[baseline.key] ? z : -z;
  return squash(directed);
}

/** Weight decay for a reading `ageDays` old. Half-life, never a cliff. */
export function freshness(
  ageDays: number,
  halfLife: number = STALENESS_HALF_LIFE_DAYS
): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLife);
}

/* ------------------------------------------------------------------ *
 * The score
 * ------------------------------------------------------------------ */

const SIGNAL_LABEL: Record<SignalKey, string> = {
  hrv: "HRV",
  resting_hr: "Resting HR",
  sleep_hours: "Sleep",
  sleep_quality: "Sleep quality",
  stress: "Stress",
  soreness: "Soreness",
  mood: "Mood",
  energy: "Energy",
  hydration: "Hydration",
  nutrition: "Fuel",
  acute_load: "Recent load",
};

/** Plain English for a normalised value, so the UI never prints a bare number. */
function describe(key: SignalKey, n: number, source: SignalSource): string {
  const where =
    n >= 0.72
      ? "well above your normal"
      : n >= 0.58
        ? "above your normal"
        : n >= 0.42
          ? "about your normal"
          : n >= 0.28
            ? "below your normal"
            : "well below your normal";
  const how = source === "self" ? "reported" : source === "derived" ? "inferred" : "measured";
  return `${SIGNAL_LABEL[key]} ${where} (${how})`;
}

/** Most recent reading per signal, on or before today. */
export function latestPerSignal(
  readings: Reading[],
  todayIso: string
): Map<SignalKey, Reading> {
  const out = new Map<SignalKey, Reading>();
  for (const r of readings) {
    if (r.on > todayIso) continue;
    const held = out.get(r.key);
    if (!held || r.on > held.on) out.set(r.key, r);
  }
  return out;
}

/**
 * The band.
 *
 * Three bands rather than a bare number, for the same reason the HRV band
 * in the rest of the system uses them: "68 today, 71 yesterday" reads as a
 * meaningful move when it is noise. The score is still returned — it drives
 * the volume multiplier — but the band is what a human is asked to read.
 */
export function bandFor(score: number): ReadinessBandName {
  if (score >= 60) return "green";
  if (score >= 40) return "amber";
  return "red";
}

export const BAND_LABEL: Record<ReadinessBandName, string> = {
  green: "Ready",
  amber: "Ease off",
  red: "Back off",
};

/**
 * Score today.
 *
 * Every present signal contributes `weight × reliability × freshness`, and
 * the score is the weighted mean of the ones that showed up. Confidence is
 * the share of the total possible weight that was actually available — so
 * a day with only a self-reported mood reading returns a low confidence and,
 * below the floor, no score at all.
 */
export function readinessFor(
  readings: Reading[],
  todayIso: string,
  opts: { confidenceFloor?: number } = {}
): ReadinessResult {
  const floor = opts.confidenceFloor ?? CONFIDENCE_FLOOR;
  const baselines = allBaselines(readings, todayIso);
  const latest = latestPerSignal(readings, todayIso);

  const contributions: SignalContribution[] = [];
  const missing: SignalKey[] = [];
  let weighted = 0;
  let weightSum = 0;
  const possible = SIGNAL_KEYS.reduce((s, k) => s + SIGNAL_WEIGHT[k], 0);

  for (const key of SIGNAL_KEYS) {
    const reading = latest.get(key);
    const baseline = baselines.get(key);
    if (!reading || !baseline) {
      missing.push(key);
      continue;
    }
    const age = daysBetween(reading.on, todayIso);
    const weight =
      SIGNAL_WEIGHT[key] * SOURCE_RELIABILITY[reading.source] * freshness(age);
    // A reading so stale it is worth almost nothing is treated as absent
    // rather than as a whisper — otherwise it inflates confidence without
    // informing the score.
    if (weight < 0.02) {
      missing.push(key);
      continue;
    }
    const normalised = normalise(reading.value, baseline);
    contributions.push({
      key,
      normalised,
      weight,
      source: reading.source,
      line: describe(key, normalised, reading.source),
    });
    weighted += normalised * weight;
    weightSum += weight;
  }

  const confidence = possible === 0 ? 0 : weightSum / possible;

  if (weightSum === 0) {
    return {
      score: null,
      band: null,
      confidence: 0,
      contributions,
      missing,
      reason:
        "Nothing to go on yet. Readiness needs either a wearable feed or a few taps in the check-in, and at least two weeks of history before it knows what normal looks like for you.",
    };
  }

  if (confidence < floor) {
    return {
      score: null,
      band: null,
      confidence,
      contributions,
      missing,
      reason: `Only ${Math.round(confidence * 100)}% of the usual evidence is in, which is not enough to put a number on. What is here is shown below rather than averaged into a score that would look more certain than it is.`,
    };
  }

  // Weighted mean over what was PRESENT — never over what was possible.
  const score = Math.round((weighted / weightSum) * 100);
  contributions.sort((a, b) => b.weight - a.weight);

  return {
    score,
    band: bandFor(score),
    confidence,
    contributions,
    missing,
    reason: null,
  };
}

/**
 * The two signals pulling hardest in each direction.
 *
 * A score with no explanation is a black box, and a black box gets
 * overridden and then ignored. This is what lets the advisor say "sleep
 * and soreness are what dropped it" instead of "readiness is 44".
 */
export function drivers(result: ReadinessResult): {
  down: SignalContribution[];
  up: SignalContribution[];
} {
  const scored = [...result.contributions];
  const down = scored
    .filter((c) => c.normalised < 0.45)
    .sort((a, b) => a.normalised * a.weight - b.normalised * b.weight)
    .slice(0, 2);
  const up = scored
    .filter((c) => c.normalised > 0.55)
    .sort((a, b) => b.normalised * b.weight - a.normalised * a.weight)
    .slice(0, 2);
  return { down, up };
}
