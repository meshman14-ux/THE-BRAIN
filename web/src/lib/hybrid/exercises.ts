/* ------------------------------------------------------------------ *
 * The exercise library — loading, validating, and choosing
 *
 * The library is a GRAPH, not a list: `regressions` and `progressions` are
 * ids, and following those edges IS the progression ladder. There is no
 * separate ladder structure, because a ladder stored apart from the library
 * is a ladder that eventually drifts out of step with it and starts lying.
 *
 * Selection is the part of a training app that usually goes wrong. Two
 * failure modes, and both are avoided here deliberately:
 *
 *   · **The system picks everything.** The athlete becomes a passenger,
 *     stops reading the plan, and eventually stops opening it. The brief
 *     asks for user-selectable exercises, and the right shape is that
 *     `candidatesFor` returns a RANKED SHORTLIST rather than one answer.
 *   · **The system picks nothing.** A library of 57 movements with a search
 *     box is a YouTube playlist with extra steps.
 *
 * So: the engine ranks and explains, the athlete chooses, and the choice is
 * remembered. Same spine as the rest of THE BRAIN — surface, never decide.
 * ------------------------------------------------------------------ */

import raw from "./data/exercises.json";
import {
  type Exercise,
  type Modality,
  type MovementPattern,
  type MuscleGroup,
  type SessionKind,
} from "./types";

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

export const EXERCISES = raw as unknown as Exercise[];

export const LIBRARY: Map<string, Exercise> = new Map(
  EXERCISES.map((e) => [e.id, e])
);

export function exerciseById(id: string): Exercise | null {
  return LIBRARY.get(id) ?? null;
}

/**
 * Structural checks, run in the test suite rather than at import.
 *
 * Every edge must resolve, and every edge should be reciprocal: if A lists
 * B as a progression, B should list A as a regression. A one-way edge means
 * the ladder can be climbed but not descended, and descending is exactly
 * what a bad day needs.
 */
export function validateLibrary(exercises: Exercise[] = EXERCISES): string[] {
  const problems: string[] = [];
  const ids = new Set(exercises.map((e) => e.id));
  if (ids.size !== exercises.length) problems.push("duplicate exercise ids");

  for (const e of exercises) {
    for (const r of e.regressions) {
      if (!ids.has(r)) problems.push(`${e.id}: unknown regression "${r}"`);
    }
    for (const p of e.progressions) {
      if (!ids.has(p)) problems.push(`${e.id}: unknown progression "${p}"`);
      const target = exercises.find((x) => x.id === p);
      if (target && !target.regressions.includes(e.id)) {
        problems.push(
          `${e.id} → ${p} is one-way: ${p} does not list ${e.id} as a regression`
        );
      }
    }
    if (e.cues.length === 0) problems.push(`${e.id}: no cues`);
    if (e.difficulty < 1 || e.difficulty > 10) {
      problems.push(`${e.id}: difficulty ${e.difficulty} outside 1–10`);
    }
    if (e.muscles.primary.length === 0 && e.modality !== "mobility" && e.modality !== "conditioning") {
      problems.push(`${e.id}: no primary muscles`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * Walking the ladder
 * ------------------------------------------------------------------ */

/** One step easier. Ordered hardest-first, so the first is the gentlest drop. */
export function regressionsOf(id: string): Exercise[] {
  const e = exerciseById(id);
  if (!e) return [];
  return e.regressions
    .map(exerciseById)
    .filter((x): x is Exercise => x != null)
    .sort((a, b) => b.difficulty - a.difficulty);
}

/** One step harder. Ordered easiest-first — the next rung, not the top. */
export function progressionsOf(id: string): Exercise[] {
  const e = exerciseById(id);
  if (!e) return [];
  return e.progressions
    .map(exerciseById)
    .filter((x): x is Exercise => x != null)
    .sort((a, b) => a.difficulty - b.difficulty);
}

/**
 * The whole ladder an exercise sits on, easiest to hardest.
 *
 * Breadth-first in both directions with a visited set, because the graph
 * has diamonds — a pike push-up regresses to an incline push-up and also
 * progresses toward the handstand line — and a naive walk would loop.
 */
export function ladderFor(id: string): Exercise[] {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const e = exerciseById(current);
    if (!e) continue;
    queue.push(...e.regressions, ...e.progressions);
  }
  return [...seen]
    .map(exerciseById)
    .filter((x): x is Exercise => x != null)
    .sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name));
}

/**
 * Step down a ladder by `steps` rungs.
 *
 * This is what a red readiness day actually needs: not "skip the session",
 * but "do the same pattern one rung easier". Returns the original when
 * there is nowhere further to fall, because failing to regress must never
 * mean failing to train.
 */
export function stepDown(id: string, steps: number = 1): Exercise | null {
  let current = exerciseById(id);
  for (let i = 0; i < steps && current; i++) {
    const easier = regressionsOf(current.id)[0];
    if (!easier) break;
    current = easier;
  }
  return current;
}

/* ------------------------------------------------------------------ *
 * Choosing
 * ------------------------------------------------------------------ */

export type SelectionCriteria = {
  session: SessionKind;
  pattern?: MovementPattern;
  muscle?: MuscleGroup;
  /** What is actually available. An exercise needing absent kit is excluded. */
  equipment?: string[];
  modality?: Modality;
  /** Ceiling on difficulty — used to scale a session down, never to gate it. */
  maxDifficulty?: number;
  /** Ids to prefer, e.g. what the athlete chose last time. */
  prefer?: string[];
  /** Ids to push down, e.g. what was done yesterday. */
  avoid?: string[];
};

const hasEquipment = (e: Exercise, available?: string[]): boolean => {
  if (!available) return true;
  const owned = new Set(available);
  return e.equipment.every((k) => owned.has(k));
};

export type Candidate = {
  exercise: Exercise;
  score: number;
  /** Why it ranked where it did. Shown, so the ranking can be argued with. */
  why: string[];
};

/**
 * A ranked shortlist for a slot.
 *
 * Hard filters first (session, equipment, pattern) because those are facts;
 * then a soft score, because everything after that is preference. The score
 * is transparent — every component appends its reason — so the athlete can
 * see that "ring push-up" came first because it matched the pattern and he
 * picked it last week, rather than because a black box said so.
 */
export function candidatesFor(
  criteria: SelectionCriteria,
  library: Exercise[] = EXERCISES
): Candidate[] {
  const prefer = new Set(criteria.prefer ?? []);
  const avoid = new Set(criteria.avoid ?? []);

  return library
    .filter((e) => e.category.includes(criteria.session))
    .filter((e) => !criteria.pattern || e.pattern === criteria.pattern)
    .filter((e) => !criteria.modality || e.modality === criteria.modality)
    .filter(
      (e) =>
        !criteria.muscle ||
        e.muscles.primary.includes(criteria.muscle) ||
        e.muscles.secondary.includes(criteria.muscle)
    )
    .filter((e) => hasEquipment(e, criteria.equipment))
    .filter(
      (e) => criteria.maxDifficulty == null || e.difficulty <= criteria.maxDifficulty
    )
    .map((e) => {
      let score = 0;
      const why: string[] = [];
      if (prefer.has(e.id)) {
        score += 3;
        why.push("you chose this last time");
      }
      if (avoid.has(e.id)) {
        score -= 2;
        why.push("done recently");
      }
      if (criteria.muscle && e.muscles.primary.includes(criteria.muscle)) {
        score += 2;
        why.push("trains it directly");
      }
      // Nudge toward the top of the allowed difficulty rather than the
      // bottom: given a ceiling, the hardest thing under it is the most
      // productive thing under it.
      if (criteria.maxDifficulty != null) {
        score += (e.difficulty / criteria.maxDifficulty) * 1.5;
      }
      if (e.skill) {
        score += 0.5;
        why.push(`feeds the ${e.skill} tree`);
      }
      return { exercise: e, score, why };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.exercise.difficulty - a.exercise.difficulty ||
        a.exercise.name.localeCompare(b.exercise.name)
    );
}

/** The top pick, or null when nothing fits — never a silent substitution. */
export function pickOne(
  criteria: SelectionCriteria,
  library: Exercise[] = EXERCISES
): Exercise | null {
  return candidatesFor(criteria, library)[0]?.exercise ?? null;
}

/* ------------------------------------------------------------------ *
 * Balance
 * ------------------------------------------------------------------ */

import { PULL_PATTERNS, PUSH_PATTERNS } from "./types";

/**
 * Push-to-pull ratio across a set of exercises.
 *
 * The single most reliable structural fault in self-programmed hybrid
 * training, and the one that costs shoulders. A ratio meaningfully below 1
 * (push-heavy) is the one worth flagging; pull-heavy is common in
 * calisthenics and far less costly.
 */
export function pushPullBalance(ids: string[]): {
  push: number;
  pull: number;
  ratio: number | null;
  line: string;
} {
  let push = 0;
  let pull = 0;
  for (const id of ids) {
    const e = exerciseById(id);
    if (!e) continue;
    if (PUSH_PATTERNS.includes(e.pattern)) push++;
    if (PULL_PATTERNS.includes(e.pattern)) pull++;
  }
  if (push === 0 && pull === 0) {
    return { push, pull, ratio: null, line: "No pushing or pulling logged." };
  }
  if (push === 0) {
    return { push, pull, ratio: null, line: "All pull, no push." };
  }
  const ratio = pull / push;
  if (ratio < 0.8) {
    return {
      push,
      pull,
      ratio,
      line: `${push} push to ${pull} pull. Push-heavy — this is the ratio that costs shoulders over a year.`,
    };
  }
  if (ratio > 2) {
    return { push, pull, ratio, line: `${push} push to ${pull} pull. Pull-heavy, which is the cheaper direction to err in.` };
  }
  return { push, pull, ratio, line: `${push} push to ${pull} pull — balanced.` };
}
