/**
 * THE COG — configuration.
 * All weights and thresholds live in the `cog_config` table (seeded by migration
 * db/migrations/0001_cog_core.sql) and can be edited without redeploy. Env vars
 * override for local dev: COG_WEIGHT_<NAME>, COG_<THRESHOLD>.
 * The engine only ever receives a resolved CogConfig — it never reads env itself.
 */

export interface CogConfig {
  /** Momentum Indicator component weights — renormalized over available inputs at score time */
  momentumWeights: {
    completion: number;
    keystone: number;
    energy: number;
    sleep: number;
    streak: number;
    finishes: number;
    capacity: number;
  };
  /** Priority score component weights */
  priorityWeights: {
    urgency: number;
    importance: number;
    energyFit: number;
    seasonFit: number;
    staleness: number;
    keystoneSupport: number;
  };
  /**
   * How confident to sound.
   *
   * The best idea in the service build, ported: every recommendation
   * reports how much to trust it, from (a) how complete the inputs were
   * and (b) how clearly the winner beat the runner-up. A confident-
   * sounding guess is the exact failure this whole design exists to
   * prevent, and a number that never reaches 1.0 says so out loud.
   */
  confidence: {
    base: number;
    /** Weight on the share of possible evidence that showed up. */
    completeness: number;
    /** Weight on how far the top pick beat the second. */
    margin: number;
    /** Deducted per fallback rule the engine had to reach for. */
    penaltyFallback: number;
    /** Deducted when there is no energy reading at all. */
    penaltyNoEnergy: number;
    floor: number;
    /** Never 1.0. The engine is deterministic; the person it models is not. */
    ceiling: number;
  };
  empireBonus: number; // flat bonus when a task unblocks an opportunity due today
  triageThreshold: number; // inbox count that triggers pulse N6
  pulseFatigueLimit: number; // consecutive rejections that silence pulses (FB-5 / N2)
  userSteerCooldownDays: number; // how long a BRAIN-overridden task is untouchable (P6)
  focusMinPrimeMin: number; // minimum minutes for a prime focus slot (F1)
  focusFallbackMin: number; // pomodoro fallback length (F3)
  fallbackFocusWindow: { start: string; end: string }; // used when calendar+planner absent (F4)
  maxStaleDays: number; // staleness normalization cap
  microActionMaxMin: number;
}

export const defaultConfig: CogConfig = {
  momentumWeights: {
    completion: 0.25,
    keystone: 0.2,
    energy: 0.15,
    sleep: 0.1,
    streak: 0.1,
    finishes: 0.1,
    capacity: 0.1,
  },
  priorityWeights: {
    urgency: 0.3,
    importance: 0.25,
    energyFit: 0.2,
    seasonFit: 0.1,
    staleness: 0.1,
    keystoneSupport: 0.05,
  },
  confidence: {
    base: 0.4,
    completeness: 0.35,
    margin: 0.25,
    penaltyFallback: 0.15,
    penaltyNoEnergy: 0.1,
    floor: 0.2,
    ceiling: 0.95,
  },
  empireBonus: 5,
  triageThreshold: 15,
  pulseFatigueLimit: 3,
  userSteerCooldownDays: 3,
  focusMinPrimeMin: 50,
  focusFallbackMin: 25,
  fallbackFocusWindow: { start: "09:00", end: "10:30" },
  maxStaleDays: 21,
  microActionMaxMin: 5,
};

/** Resolve config: DB row (if provided) over defaults, env overrides on top (dev only). */
export function resolveConfig(
  dbRow?: Partial<CogConfig>,
  env: Record<string, string | undefined> = {}
): CogConfig {
  const merged: CogConfig = {
    ...defaultConfig,
    ...dbRow,
    momentumWeights: { ...defaultConfig.momentumWeights, ...dbRow?.momentumWeights },
    priorityWeights: { ...defaultConfig.priorityWeights, ...dbRow?.priorityWeights },
    fallbackFocusWindow: { ...defaultConfig.fallbackFocusWindow, ...dbRow?.fallbackFocusWindow },
  };
  for (const key of Object.keys(merged.momentumWeights) as (keyof CogConfig["momentumWeights"])[]) {
    const v = env[`COG_WEIGHT_${key.toUpperCase()}`];
    if (v !== undefined && !Number.isNaN(Number(v))) merged.momentumWeights[key] = Number(v);
  }
  return merged;
}
