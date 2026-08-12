/* ------------------------------------------------------------------ *
 * The daily plan
 *
 * Composition, not intelligence. Everything this file needs has already
 * been decided by readiness.ts, load.ts, skills.ts and progression.ts; the
 * job here is to put it in the right ORDER and say why.
 *
 * Order is a training decision, not layout:
 *
 *   prepare → skill → primary → secondary → accessory → conditioning → restore
 *
 * Skill work sits second, before anything heavy, because hand balancing and
 * levers are limited by a fresh nervous system rather than by how much work
 * it can absorb. A handstand attempted after a heavy pull day trains a
 * compensation, and the compensation is what you keep. Conditioning sits
 * last because the interference effect runs mostly one way — endurance work
 * before strength blunts the strength session far more than the reverse.
 *
 * The plan also reads the SEASON. THE BRAIN already knows whether this is a
 * quiet, busy or minimum month, and a training system that ignores that is
 * a training system that programmes five sessions into a week the rest of
 * the app has already agreed will not have five.
 * ------------------------------------------------------------------ */

import {
  type AthleteProfile,
  type DailyPlan,
  type Exercise,
  type MovementPattern,
  type PlanBlock,
  type PlannedSet,
  type ReadinessResult,
  type SessionKind,
  type SkillState,
  type SkillTree,
} from "./types";
import { candidatesFor, exerciseById } from "./exercises";
import { RANGES, TARGET_RIR, adjustmentFor, scaleSets } from "./progression";
import { prescribe, workingEdge } from "./skills";

/* ------------------------------------------------------------------ *
 * The split
 * ------------------------------------------------------------------ */

/**
 * Patterns each session is built from, in the order they are trained.
 *
 * The primary pattern comes first because it gets the freshest effort, and
 * which pattern that is defines the session. Full body is deliberately
 * short — a full-body day that tries to cover everything covers nothing.
 */
export const SESSION_PATTERNS: Record<SessionKind, MovementPattern[]> = {
  push: ["vertical-push", "horizontal-push", "vertical-push"],
  pull: ["vertical-pull", "horizontal-pull", "straight-arm-scapular"],
  legs: ["squat", "hinge", "lunge"],
  skills: ["hand-balancing", "straight-arm-scapular", "core-flexion"],
  "full-body": ["vertical-pull", "squat", "horizontal-push"],
  recovery: ["mobility", "locomotion", "core-anti-rotation"],
  rest: [],
};

/**
 * Sessions per week the season supports.
 *
 * Not a cap — a season is a declaration about the month, and the plan
 * respects it rather than arguing with it. Minimum mode keeps ONE session,
 * because Jay's declared floor includes training and the floor never flexes.
 */
export const SEASON_SESSIONS: Record<"quiet" | "busy" | "minimum", number> = {
  quiet: 5,
  busy: 3,
  minimum: 1,
};

/**
 * The rotation, given how many sessions the week supports.
 *
 * At three sessions the split collapses to full body rather than dropping
 * legs, because a push/pull-only week is how a hybrid athlete ends up with
 * a strong upper body and knees that cannot take a landing. At one, it is
 * full body — the floor is a session that touches everything, not the
 * favourite one.
 */
export function weekShape(sessions: number): SessionKind[] {
  if (sessions >= 5) return ["push", "pull", "legs", "skills", "full-body"];
  if (sessions === 4) return ["push", "pull", "legs", "skills"];
  if (sessions === 3) return ["full-body", "pull", "legs"];
  if (sessions === 2) return ["full-body", "pull"];
  return ["full-body"];
}

/* ------------------------------------------------------------------ *
 * Building blocks
 * ------------------------------------------------------------------ */

type Ctx = {
  on: string;
  kind: SessionKind;
  readiness: ReadinessResult;
  profile: AthleteProfile;
  trees: SkillTree[];
  skillState: SkillState;
  /** Exercise ids done in the last few days — nudged down the rankings. */
  recentIds?: string[];
  /** Exercise ids the athlete has chosen before for these slots. */
  preferredIds?: string[];
};

const setFor = (
  exercise: Exercise,
  sets: number,
  role: keyof typeof RANGES,
  rest_s: number,
  note?: string
): PlannedSet => ({
  exercise_id: exercise.id,
  sets,
  target: {
    min: exercise.unit === "seconds" ? RANGES.hold.min : RANGES[role].min,
    max: exercise.unit === "seconds" ? RANGES.hold.max : RANGES[role].max,
    unit: exercise.unit,
  },
  load_kg: null,
  rir: TARGET_RIR[role],
  rest_s,
  note,
});

/**
 * Nothing is prescribed that cannot actually be done.
 *
 * Applies to the fixed prepare and restore movements as much as to the
 * ranked strength slots — a warm-up calling for a band the athlete does not
 * own is the first thing that teaches him to skip the warm-up.
 */
function available(ctx: Ctx, id: string): Exercise | null {
  const e = exerciseById(id);
  if (!e) return null;
  const owned = new Set(ctx.profile.equipment);
  return e.equipment.every((k) => owned.has(k)) ? e : null;
}

function prepareBlock(ctx: Ctx): PlanBlock {
  const items: PlannedSet[] = [];
  const wrist = available(ctx, "ex.wrist_prep");
  const dislocate = available(ctx, "ex.shoulder_dislocate");
  // Wrists get prepared on any day that will load them. They adapt far
  // slower than the shoulders that want the work, and they are the tissue
  // that actually caps hand-balancing volume.
  if (wrist && (ctx.kind === "skills" || ctx.kind === "push")) {
    items.push(setFor(wrist, 1, "hold", 0, "Through all four positions."));
  }
  if (dislocate) items.push(setFor(dislocate, 2, "endurance", 30));
  return {
    kind: "prepare",
    title: "Prepare",
    why: "Short and specific to what today loads. Not a warm-up for its own sake.",
    items,
  };
}

/**
 * Skill practice, placed second and never last.
 *
 * Takes the working edge of each focus tree — the rungs that are unlocked
 * and not yet owned — capped at two, because a session with four skills in
 * it is a session with no skill in it.
 */
function skillBlock(ctx: Ctx): PlanBlock | null {
  if (!adjustmentFor(ctx.readiness).skills) return null;
  const focus = ctx.trees.filter((t) => ctx.profile.focus_skills.includes(t.id));
  const trees = focus.length > 0 ? focus : ctx.trees;
  const cap = ctx.kind === "skills" ? 3 : 1;

  const items: PlannedSet[] = [];
  for (const tree of trees) {
    for (const node of workingEdge(tree, ctx.skillState)) {
      if (items.length >= cap) break;
      const p = prescribe(node, { readinessBand: ctx.readiness.band });
      const ex = available(ctx, node.exercise_id);
      if (!ex) continue;
      items.push({
        exercise_id: ex.id,
        sets: p.sets,
        target: { min: p.target.min, max: p.target.max, unit: ex.unit },
        load_kg: null,
        rir: null,
        rest_s: p.rest_s,
        note: `${node.name} — ${p.why}`,
      });
    }
  }
  if (items.length === 0) return null;
  return {
    kind: "skill",
    title: "Skills",
    why: "Practised fresh, before anything heavy. Skill is limited by a rested nervous system, not by how much work it can absorb.",
    items,
  };
}

function strengthBlocks(ctx: Ctx): PlanBlock[] {
  const adjustment = adjustmentFor(ctx.readiness);
  const patterns = SESSION_PATTERNS[ctx.kind];
  const roles: Array<"primary" | "secondary" | "accessory"> = [
    "primary",
    "secondary",
    "accessory",
  ];
  const setCounts = [4, 3, 3];
  const rangeRoles: Array<keyof typeof RANGES> = [
    "strength",
    "hypertrophy",
    "hypertrophy",
  ];
  const rests = [180, 120, 90];

  const chosen = new Set<string>();
  const blocks: PlanBlock[] = [];

  patterns.forEach((pattern, i) => {
    const candidates = candidatesFor({
      session: ctx.kind,
      pattern,
      equipment: ctx.profile.equipment,
      prefer: ctx.preferredIds,
      avoid: [...(ctx.recentIds ?? []), ...chosen],
    });
    const pick = candidates.find((c) => !chosen.has(c.exercise.id));
    if (!pick) return;
    chosen.add(pick.exercise.id);
    blocks.push({
      kind: roles[i] ?? "accessory",
      title: pick.exercise.name,
      why:
        i === 0
          ? "The session's main lift — freshest effort, longest rest, lowest reps."
          : pick.why.join("; ") || "Fills the pattern this session is built around.",
      items: [
        setFor(
          pick.exercise,
          scaleSets(setCounts[i] ?? 3, adjustment),
          rangeRoles[i] ?? "hypertrophy",
          rests[i] ?? 90
        ),
      ],
    });
  });

  return blocks;
}

function restoreBlock(ctx: Ctx): PlanBlock {
  const items: PlannedSet[] = [];
  const breathing = available(ctx, "ex.nasal_breathing");
  const couch = available(ctx, "ex.couch_stretch");
  if (ctx.kind === "legs" && couch) items.push(setFor(couch, 2, "hold", 0));
  if (breathing) {
    items.push({
      exercise_id: breathing.id,
      sets: 1,
      target: { min: 3, max: 5, unit: "minutes" },
      load_kg: null,
      rir: null,
      rest_s: 0,
      note: "Exhale roughly twice as long as the inhale.",
    });
  }
  return {
    kind: "restore",
    title: "Restore",
    why: "Five minutes of down-regulation after hard work. The cheapest recovery intervention there is, and the one most often skipped.",
    items,
  };
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

export function generatePlan(ctx: Ctx): DailyPlan {
  const adjustment = adjustmentFor(ctx.readiness);

  if (ctx.kind === "rest") {
    return {
      on: ctx.on,
      kind: "rest",
      blocks: [restoreBlock(ctx)],
      readiness: ctx.readiness,
      adjustment,
      headline: "Rest day. Adaptation happens now, not in the session.",
    };
  }

  const blocks = [
    prepareBlock(ctx),
    skillBlock(ctx),
    ...strengthBlocks(ctx),
    restoreBlock(ctx),
  ].filter((b): b is PlanBlock => b != null && b.items.length > 0);

  const working = blocks
    .filter((b) => b.kind !== "prepare" && b.kind !== "restore")
    .reduce((n, b) => n + b.items.reduce((m, i) => m + i.sets, 0), 0);

  const headline =
    ctx.readiness.band === "red"
      ? `Trimmed session — ${working} working sets. ${adjustment.reason}`
      : ctx.readiness.band === "amber"
        ? `${working} working sets, slightly trimmed.`
        : `${working} working sets, as written.`;

  return {
    on: ctx.on,
    kind: ctx.kind,
    blocks,
    readiness: ctx.readiness,
    adjustment,
    headline,
  };
}

/** Total planned sets, for the volume report to compare against. */
export function plannedSetCount(plan: DailyPlan): number {
  return plan.blocks.reduce(
    (n, b) => n + b.items.reduce((m, i) => m + i.sets, 0),
    0
  );
}
