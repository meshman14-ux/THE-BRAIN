/**
 * THE COG — scoring. Pure arithmetic, weights from CogConfig.
 * Formula documented in docs/03-advisor-logic.md §2–3. Missing inputs drop out
 * and remaining weights are RENORMALIZED — a missing sensor is not a zero score.
 */
import type { CogConfig } from "./config";
import type { CogTask, MomentumState } from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Momentum Indicator, 0–100. Returns the score and the components that were available. */
export function momentumIndicator(
  state: MomentumState,
  cfg: CogConfig
): { score: number; components: Record<string, number> } {
  const s = state.signals;
  const w = cfg.momentumWeights;

  // component value in 0..1, or null when its input is missing
  const raw: Record<string, number | null> = {
    completion: s.yesterdayCompletionRatio,
    keystone: s.keystoneHitYesterday === null ? null : s.keystoneHitYesterday ? 1 : 0,
    energy: s.energyBand === null ? null : (s.energyBand - 1) / 4,
    sleep: s.sleepBand === null ? null : (s.sleepBand - 1) / 4,
    streak: Math.min(s.checkinStreakDays, 14) / 14,
    finishes: s.finishesRate,
    capacity:
      s.calendarLoadRatio === null && s.workloadPressure === null
        ? null
        : 1 - clamp01(0.6 * (s.calendarLoadRatio ?? 0) + 0.4 * (s.workloadPressure ?? 0)),
  };

  const available = Object.entries(raw).filter(([, v]) => v !== null) as [string, number][];
  const weightSum = available.reduce((acc, [k]) => acc + w[k as keyof typeof w], 0);
  if (weightSum === 0) return { score: 50, components: {} }; // total blackout: neutral, labelled degraded upstream

  const components: Record<string, number> = {};
  let score = 0;
  for (const [k, v] of available) {
    const norm = w[k as keyof typeof w] / weightSum;
    components[k] = Math.round(norm * v * 1000) / 1000;
    score += norm * v;
  }
  return { score: Math.round(score * 100), components };
}

export function momentumBand(score: number): "low" | "steady" | "rolling" {
  return score < 40 ? "low" : score < 70 ? "steady" : "rolling";
}

/** Days between two ISO dates (b - a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function urgency(task: CogTask, today: string): number {
  if (!task.dueDate) return 0.1;
  const d = daysBetween(today, task.dueDate);
  if (d < 0) return 1; // overdue
  if (d === 0) return 0.9;
  if (d <= 3) return 0.7;
  if (d <= 7) return 0.4;
  return 0.1;
}

function energyFit(task: CogTask, band: number | null): number {
  if (band === null || task.energy === null) return 0.5;
  const high = band >= 4, low = band <= 2;
  if (task.energy === "deep") return high ? 1 : low ? 0.1 : 0.5;
  if (task.energy === "low") return low ? 1 : 0.5;
  return 0.5; // medium
}

function seasonFit(task: CogTask, state: MomentumState): number {
  switch (state.season) {
    case "quiet":
      return 1;
    case "busy":
      return task.energy === "deep" ? 0.5 : 0.8;
    case "minimum":
      return task.supportsKeystone ? 1 : 0.2; // the floor never flexes
  }
}

/** Priority score, 0–100 (+ flat empire bonus). Component breakdown returned for explainability. */
export function priorityScore(
  task: CogTask,
  state: MomentumState,
  cfg: CogConfig
): { score: number; components: Record<string, number> } {
  const w = cfg.priorityWeights;
  const components = {
    urgency: w.urgency * urgency(task, state.date),
    importance: w.importance * clamp01(clamp01(task.priority / 3) + (task.projectId ? 0.2 : 0)),
    energyFit: w.energyFit * energyFit(task, state.signals.energyBand),
    seasonFit: w.seasonFit * seasonFit(task, state),
    staleness: w.staleness * (Math.min(task.staleDays, cfg.maxStaleDays) / cfg.maxStaleDays),
    keystoneSupport: w.keystoneSupport * (task.supportsKeystone ? 1 : 0),
  };
  let score = 100 * Object.values(components).reduce((a, b) => a + b, 0);
  if (task.empireSignal) score += cfg.empireBonus; // rule P7 logs this
  return { score: Math.round(score * 10) / 10, components };
}

/** Deterministic tiebreak: score desc, then staler first, then id asc. */
export function tiebreak(
  a: { score: number; task: CogTask },
  b: { score: number; task: CogTask }
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.task.staleDays !== a.task.staleDays) return b.task.staleDays - a.task.staleDays;
  return a.task.id < b.task.id ? -1 : 1;
}
