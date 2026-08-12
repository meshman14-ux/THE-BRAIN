/* ------------------------------------------------------------------ *
 * Skill trees, ladders and mastery
 *
 * A skill tree here is a DAG, not a line. Real progressions converge: a
 * tuck front lever needs both scapular retraction strength and a hollow
 * body, and neither is downstream of the other. Modelling that as a single
 * ordered ladder forces a false sequence and produces the classic stall —
 * grinding the next rung when the missing piece is off to the side.
 *
 * Four rules, each from a different corner of the field:
 *
 *   · **Strict standards, verifiable.** Every node passes on criteria that
 *     can be checked without opinion — an unbroken hold, a rep count, and
 *     named form points. A hold time with no form criteria is how a
 *     "20-second tuck lever" becomes a 20-second slouch. (Vadnal, School
 *     of Calisthenics, Calisthenics Movement.)
 *   · **Proved twice.** A standard must be met across separate sessions.
 *     One good rep on a good day is a data point, not an ability. (Ladon's
 *     lever work and Ayalon's handstand pedagogy both insist on this.)
 *   · **Skills come first and fresh.** Practised before fatigue, never
 *     after. A handstand attempted tired trains a compensation, and the
 *     compensation is what you keep. (Portal, Ayalon, Merrick.)
 *   · **Test in, do not assume.** The athlete already owns some skills, so
 *     the tree must be able to start mid-ladder — but only on evidence.
 *     Every unproved node is `locked` until tested.
 * ------------------------------------------------------------------ */

import {
  type Mastery,
  type SkillNode,
  type SkillState,
  type SkillTree,
  type Standard,
} from "./types";

/* ------------------------------------------------------------------ *
 * Reading a tree
 * ------------------------------------------------------------------ */

export function nodeById(tree: SkillTree, id: string): SkillNode | null {
  return tree.nodes.find((n) => n.id === id) ?? null;
}

export function masteryOf(state: SkillState, nodeId: string): Mastery {
  return state[nodeId] ?? "locked";
}

/** A node is unlocked when every prerequisite is owned. */
export function isUnlocked(
  tree: SkillTree,
  state: SkillState,
  nodeId: string
): boolean {
  const node = nodeById(tree, nodeId);
  if (!node) return false;
  return node.requires.every((r) => masteryOf(state, r) === "owned");
}

/**
 * The rungs worth practising today.
 *
 * Unlocked and not yet owned — usually one, sometimes two where the tree
 * branches. Returning the whole tree would put the athlete back where a
 * YouTube playlist leaves them: everything visible, nothing chosen.
 */
export function workingEdge(tree: SkillTree, state: SkillState): SkillNode[] {
  return tree.nodes.filter(
    (n) => masteryOf(state, n.id) !== "owned" && isUnlocked(tree, state, n.id)
  );
}

/** Owned nodes as a share of the tree. Progress, honestly counted. */
export function treeProgress(
  tree: SkillTree,
  state: SkillState
): { owned: number; of: number; percent: number } {
  const owned = tree.nodes.filter((n) => masteryOf(state, n.id) === "owned").length;
  const of = tree.nodes.length;
  return { owned, of, percent: of === 0 ? 0 : Math.round((owned / of) * 100) };
}

/**
 * Depth of a node — how many rungs deep it sits.
 *
 * Longest path from a root, so a node requiring two separate branches is
 * ranked by the harder one. Used for ordering, and for showing the tree in
 * a way that matches how it is actually climbed.
 */
export function depthOf(tree: SkillTree, nodeId: string): number {
  const seen = new Set<string>();
  const walk = (id: string): number => {
    if (seen.has(id)) return 0; // cycle guard; a malformed tree must not hang
    seen.add(id);
    const node = nodeById(tree, id);
    if (!node || node.requires.length === 0) return 0;
    const d = 1 + Math.max(...node.requires.map(walk));
    seen.delete(id);
    return d;
  };
  return walk(nodeId);
}

/* ------------------------------------------------------------------ *
 * Passing a standard
 * ------------------------------------------------------------------ */

export type Attempt = {
  node_id: string;
  on: string;
  /** Reps or seconds achieved, whichever the standard asks for. */
  amount: number;
  /** Every form criterion met, judged by the athlete. Honest or useless. */
  strict: boolean;
};

/** Consecutive qualifying sessions a standard needs by default. */
export const DEFAULT_PROOF_SESSIONS = 2;

export function meetsStandard(attempt: Attempt, standard: Standard): boolean {
  if (!attempt.strict) return false;
  if (standard.hold_s != null) return attempt.amount >= standard.hold_s;
  if (standard.reps != null) return attempt.amount >= standard.reps;
  return false;
}

/**
 * Has this node been earned?
 *
 * Qualifying attempts must fall on DIFFERENT DAYS. Three good sets in one
 * session is one good session — counting them separately is how a standard
 * gets passed on the single day everything felt easy.
 */
export function hasPassed(
  attempts: Attempt[],
  node: SkillNode
): { passed: boolean; qualifying: number; needed: number } {
  const needed = node.standard.sessions ?? DEFAULT_PROOF_SESSIONS;
  const days = new Set(
    attempts
      .filter((a) => a.node_id === node.id && meetsStandard(a, node.standard))
      .map((a) => a.on)
  );
  return { passed: days.size >= needed, qualifying: days.size, needed };
}

/**
 * Recompute the whole state from the attempt log.
 *
 * Derived rather than stored, for the same reason dormancy is derived
 * elsewhere in this system: a mastery flag written once and never revisited
 * is a claim that quietly stops being true. Two passes, because owning a
 * node can unlock a node whose own attempts already qualify — someone
 * testing in on skills they already have will pass several at once.
 */
export function deriveState(tree: SkillTree, attempts: Attempt[]): SkillState {
  const state: SkillState = {};
  for (let pass = 0; pass < tree.nodes.length; pass++) {
    let changed = false;
    for (const node of tree.nodes) {
      if (state[node.id] === "owned") continue;
      const unlocked = isUnlocked(tree, state, node.id);
      const { passed, qualifying } = hasPassed(attempts, node);
      const next: Mastery = !unlocked
        ? "locked"
        : passed
          ? "owned"
          : qualifying > 0
            ? "working"
            : "testing";
      if (state[node.id] !== next) {
        state[node.id] = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return state;
}

/* ------------------------------------------------------------------ *
 * Testing in
 * ------------------------------------------------------------------ */

/**
 * The test-in protocol, for an athlete who already owns some skills.
 *
 * Rather than making him climb from the bottom of every tree, this walks
 * DOWN from the hardest node and returns the rungs to attempt, deepest
 * first. He tests until he fails, and the tree positions itself from the
 * results — no self-assessment, no guessing, and no starting a front lever
 * programme with scapular pull-ups he has done for years.
 *
 * It deliberately does not skip: a node passed is a node proved, so a gap
 * further down the tree still surfaces rather than being assumed away.
 */
export function testInOrder(tree: SkillTree): SkillNode[] {
  return [...tree.nodes].sort(
    (a, b) => depthOf(tree, b.id) - depthOf(tree, a.id) || a.id.localeCompare(b.id)
  );
}

/**
 * The single node to test next, given what has been attempted so far.
 *
 * Returns null when the tree is fully positioned — every node is either
 * owned or genuinely locked behind an unowned prerequisite.
 */
export function nextTestIn(
  tree: SkillTree,
  state: SkillState,
  attempted: Set<string>
): SkillNode | null {
  return (
    testInOrder(tree).find(
      (n) =>
        !attempted.has(n.id) &&
        masteryOf(state, n.id) !== "owned" &&
        isUnlocked(tree, state, n.id)
    ) ?? null
  );
}

/* ------------------------------------------------------------------ *
 * Practice prescription
 * ------------------------------------------------------------------ */

export type SkillPrescription = {
  node: SkillNode;
  sets: number;
  /** Target per set, as a range around the standard. */
  target: { min: number; max: number; unit: "reps" | "seconds" };
  rest_s: number;
  why: string;
};

/**
 * How to practise a rung today.
 *
 * Skill practice is prescribed at SUBMAXIMAL effort and generous rest —
 * the point is quality repetitions of a motor pattern, not fatigue. Ayalon
 * and Portal both teach handstand work as frequent, short and fresh; sets
 * taken to failure teach the failure.
 *
 * Holds get shorter sets than the standard demands, because a 20-second
 * standard is proved with one 20-second hold and practised with several
 * clean 12s. Training at the standard every session is how the standard
 * stops improving.
 */
export function prescribe(
  node: SkillNode,
  opts: { readinessBand?: "green" | "amber" | "red" | null } = {}
): SkillPrescription {
  const band = opts.readinessBand ?? null;
  const isHold = node.standard.hold_s != null;
  const goal = isHold ? node.standard.hold_s! : node.standard.reps!;

  // Amber trims the dose but keeps the practice: skills are the one thing
  // worth defending on a mediocre day, because they are limited by the
  // nervous system's freshness rather than by how much work it can absorb.
  const setCount = band === "red" ? 2 : band === "amber" ? 3 : 4;

  return {
    node,
    sets: setCount,
    target: isHold
      ? { min: Math.max(3, Math.round(goal * 0.5)), max: Math.round(goal * 0.8), unit: "seconds" }
      : { min: Math.max(1, Math.round(goal * 0.5)), max: Math.max(1, Math.round(goal * 0.8)), unit: "reps" },
    rest_s: 120,
    why:
      band === "red"
        ? "Kept in, but short. Skill practice is the last thing to cut — it costs little and it is what a bad day is still good for."
        : "Practised fresh and well short of failure. Quality reps of the pattern, not fatigue.",
  };
}

/* ------------------------------------------------------------------ *
 * Loading the shipped trees
 * ------------------------------------------------------------------ */

/** Structural validation. A malformed tree must fail loudly at load. */
export function validateTree(tree: SkillTree): string[] {
  const problems: string[] = [];
  const ids = new Set(tree.nodes.map((n) => n.id));
  if (ids.size !== tree.nodes.length) problems.push(`${tree.id}: duplicate node ids`);
  for (const n of tree.nodes) {
    for (const r of n.requires) {
      if (!ids.has(r)) problems.push(`${tree.id}/${n.id}: requires unknown node "${r}"`);
    }
    if (n.standard.form.length === 0) {
      problems.push(`${tree.id}/${n.id}: a standard with no form criteria is not a standard`);
    }
    if (n.standard.hold_s == null && n.standard.reps == null) {
      problems.push(`${tree.id}/${n.id}: standard specifies neither a hold nor a rep count`);
    }
  }
  if (!ids.has(tree.goal)) problems.push(`${tree.id}: goal "${tree.goal}" is not a node`);
  return problems;
}
