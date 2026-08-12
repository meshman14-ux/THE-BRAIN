/* ------------------------------------------------------------------ *
 * Progression — how the numbers move
 *
 * Double progression, autoregulated by RIR, with a rung change when the top
 * of the range is owned. It is the least fashionable option available and
 * it is chosen on purpose: linear progression stops working within months,
 * percentage-based programming needs a tested 1RM that a calisthenics
 * athlete does not have for half their movements, and anything cleverer
 * needs more logging discipline than a real week supplies.
 *
 * Double progression needs one number per set — reps — and it works for
 * holds, bodyweight reps, and loaded barbell work with the same maths.
 *
 * The rule:
 *
 *   1. Work within a rep or time RANGE.
 *   2. Every set at the TOP of the range, at or under the target RIR →
 *      add load, or step up the ladder if there is no load to add.
 *   3. Two sessions stalled at the SAME point → the range is not the
 *      problem. Deload rather than repeat, because repeating a stalled
 *      week is how a plateau becomes an injury.
 *
 * Readiness enters as a MULTIPLIER on the prescription, never as a veto.
 * Helms' RIR-based autoregulation is the mechanism: on a bad day the same
 * bar speed happens at a lower load, so the target is the effort, not the
 * number.
 * ------------------------------------------------------------------ */

import { type Exercise, type PlanAdjustment, type ReadinessResult, type SetLog } from "./types";
import { progressionsOf, regressionsOf } from "./exercises";

/* ------------------------------------------------------------------ *
 * Rep ranges
 * ------------------------------------------------------------------ */

export type RepRange = { min: number; max: number };

/**
 * Default ranges by role in the session.
 *
 * Strength work low, hypertrophy work in the middle, skill and holds
 * separate because a hold is measured in seconds and the effective
 * hypertrophy range does not transfer to isometrics.
 */
export const RANGES: Record<
  "strength" | "hypertrophy" | "endurance" | "hold",
  RepRange
> = {
  strength: { min: 3, max: 6 },
  hypertrophy: { min: 6, max: 12 },
  endurance: { min: 12, max: 20 },
  hold: { min: 10, max: 30 },
};

/** Target reps in reserve by role. Nuckols' and Helms' working consensus. */
export const TARGET_RIR: Record<"strength" | "hypertrophy" | "endurance" | "hold", number> = {
  strength: 2,
  hypertrophy: 1,
  endurance: 2,
  hold: 2,
};

/* ------------------------------------------------------------------ *
 * The decision
 * ------------------------------------------------------------------ */

export type ProgressionVerdict =
  | { move: "add-load"; by_kg: number; line: string }
  | { move: "step-up"; to: string; line: string }
  | { move: "add-reps"; line: string }
  | { move: "hold"; line: string }
  | { move: "deload"; line: string }
  | { move: "step-down"; to: string; line: string };

/** Smallest jump worth making on a bodyweight movement, in kg. */
export const MIN_LOAD_STEP_KG = 1.25;

/**
 * Load increment as a share of the total system load.
 *
 * A weighted pull-up at 85kg bodyweight plus 20kg is a 105kg lift, so
 * adding 2.5kg is a 2.4% jump — not the 12.5% it looks like against the
 * belt weight alone. Pricing the jump against bodyweight is the difference
 * between a weighted-calisthenics progression that works for a year and one
 * that stalls in six weeks.
 */
export function loadStepFor(
  exercise: Exercise,
  bodyweightKg: number | null
): number {
  const bodyweightBears =
    exercise.modality === "weighted-calisthenics" || exercise.modality === "calisthenics";
  if (!bodyweightBears || bodyweightKg == null) return 2.5;
  // Rounded UP to the nearest loadable plate: a step rounded down to zero
  // is not a step, and the smallest real jump is better than a fake one.
  const step =
    Math.ceil((bodyweightKg * 0.025) / MIN_LOAD_STEP_KG) * MIN_LOAD_STEP_KG;
  return Math.max(MIN_LOAD_STEP_KG, step);
}

/**
 * What to do next with this exercise.
 *
 * Reads only the last two sessions of it. Anything longer is a trend
 * question for the volume report, not a "what do I do on Tuesday" question.
 */
export function nextStep(
  exercise: Exercise,
  range: RepRange,
  recent: { sets: SetLog[] }[],
  opts: { bodyweightKg?: number | null; targetRir?: number } = {}
): ProgressionVerdict {
  const targetRir = opts.targetRir ?? TARGET_RIR.hypertrophy;
  const last = recent[0];

  if (!last || last.sets.length === 0) {
    return {
      move: "hold",
      line: "Nothing logged for this yet — this session sets the baseline to progress from.",
    };
  }

  const working = last.sets.filter((s) => s.exercise_id === exercise.id);
  if (working.length === 0) {
    return { move: "hold", line: "Not performed last time — repeat it before changing anything." };
  }

  const allAtTop = working.every((s) => s.amount >= range.max);
  const allStrict = working.every((s) => s.rir == null || s.rir <= targetRir);
  const anyBelowMin = working.some((s) => s.amount < range.min);

  // Earned the jump.
  if (allAtTop && allStrict) {
    const canLoad =
      exercise.modality === "barbell" ||
      exercise.modality === "dumbbell" ||
      exercise.modality === "machine" ||
      exercise.modality === "weighted-calisthenics";
    if (canLoad) {
      const by = loadStepFor(exercise, opts.bodyweightKg ?? null);
      return {
        move: "add-load",
        by_kg: by,
        line: `Every set hit ${range.max} at ${targetRir} RIR or better. Add ${by}kg and drop back to ${range.min}.`,
      };
    }
    const harder = progressionsOf(exercise.id)[0];
    if (harder) {
      return {
        move: "step-up",
        to: harder.id,
        line: `Top of the range on every set with nothing left to add. Next rung: ${harder.name}.`,
      };
    }
    return {
      move: "add-reps",
      line: "Top of the range on every set, and this is the end of its ladder — extend the range rather than stalling.",
    };
  }

  // Falling out of the bottom twice is a fatigue signal, not a weakness one.
  if (anyBelowMin && recent.length >= 2) {
    const before = recent[1].sets.filter((s) => s.exercise_id === exercise.id);
    const alsoBelow = before.some((s) => s.amount < range.min);
    if (alsoBelow) {
      const easier = regressionsOf(exercise.id)[0];
      if (easier) {
        return {
          move: "step-down",
          to: easier.id,
          line: `Under ${range.min} reps twice running. That is the rung being too hard, not you having a bad week — drop to ${easier.name} and rebuild.`,
        };
      }
      return {
        move: "deload",
        line: `Under ${range.min} twice running with nowhere easier to go. Halve the sets for a week; repeating a stalled week is how a plateau becomes an injury.`,
      };
    }
  }

  return {
    move: "add-reps",
    line: `Add a rep where you can, keeping every set at ${targetRir} RIR or better. The jump comes when all sets reach ${range.max}.`,
  };
}

/* ------------------------------------------------------------------ *
 * Readiness → prescription
 * ------------------------------------------------------------------ */

/**
 * How today's readiness scales the plan.
 *
 * Volume moves more than intensity, and that ordering is the whole point.
 * Cutting intensity first turns a hard session into a pointless one — the
 * stimulus lives in the top-end effort. Cutting volume keeps the stimulus
 * and removes the fatigue, which is exactly what a low-readiness day needs.
 * (Israetel's fatigue management; the same logic behind a "top set, back-off
 * sets" structure.)
 *
 * Nothing here returns false. A red day produces a smaller session with a
 * reason attached — the athlete can still do the session as written, and
 * doing so is a supported path rather than cheating.
 */
export function adjustmentFor(readiness: ReadinessResult): PlanAdjustment {
  if (readiness.score == null) {
    return {
      volume: 1,
      intensity: 1,
      skills: true,
      reason:
        "No readiness score today, so the plan is as written. The system will not invent a reason to make you do less.",
    };
  }
  if (readiness.band === "red") {
    return {
      volume: 0.6,
      intensity: 0.9,
      skills: true,
      reason:
        "Well below your normal. Volume cut to about 60%, intensity nearly held — the hard part is what makes it worth doing, the accumulated fatigue is what you cannot afford today. Skill work stays in; it costs little.",
    };
  }
  if (readiness.band === "amber") {
    return {
      volume: 0.8,
      intensity: 0.95,
      skills: true,
      reason:
        "A bit below your normal. Volume trimmed, effort unchanged. If it feels wrong once you are warm, the full session is one tap away.",
    };
  }
  // A green day is not a licence to add. Programmed volume is programmed
  // for a reason, and "feeling good" is the most common cause of the spike
  // that ends a training block.
  return {
    volume: 1,
    intensity: 1,
    skills: true,
    reason: "At or above your normal — the session as written.",
  };
}

/** Apply an adjustment to a set count, never dropping below one working set. */
export function scaleSets(sets: number, adjustment: PlanAdjustment): number {
  return Math.max(1, Math.round(sets * adjustment.volume));
}

/** Apply an adjustment to a load, rounded to something loadable. */
export function scaleLoad(
  loadKg: number | null,
  adjustment: PlanAdjustment
): number | null {
  if (loadKg == null) return null;
  return Math.round((loadKg * adjustment.intensity) / MIN_LOAD_STEP_KG) * MIN_LOAD_STEP_KG;
}
