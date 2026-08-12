/* ------------------------------------------------------------------ *
 * HYBRID — the public surface
 *
 * The whole module is imported from here, so the internal file layout can
 * change without touching a single page. Nothing in `hybrid/` imports from
 * outside `hybrid/`: no Supabase, no React, no THE BRAIN tables. The
 * adapter that maps `health_days` rows onto `Reading[]` lives OUTSIDE this
 * boundary, and that is what keeps every rule in here testable without a
 * database.
 *
 *   types.ts        the domain — movement, skills, readiness, load, plans
 *   readiness.ts    multi-source scoring against a personal baseline
 *   load.ts         volume landmarks, session load, acute:chronic
 *   skills.ts       DAG skill trees, strict standards, test-in, mastery
 *   exercises.ts    the library graph, laddering, ranked selection
 *   progression.ts  double progression, RIR autoregulation, readiness scaling
 *   plan.ts         composition — the session, in order, with reasons
 *   advisor.ts      four channels that suggest and never perform
 *   data/           exercises.json · skills.json (seed content)
 * ------------------------------------------------------------------ */

export * from "./types";
export * from "./readiness";
export * from "./load";
export * from "./skills";
export * from "./exercises";
export * from "./progression";
export * from "./plan";
export * from "./advisor";

import treeData from "./data/skills.json";
import type { SkillTree } from "./types";

/** The four trees the brief named: handstand, muscle-up, front lever, L-sit. */
export const SKILL_TREES = treeData as unknown as SkillTree[];

export function treeById(id: string): SkillTree | null {
  return SKILL_TREES.find((t) => t.id === id) ?? null;
}
