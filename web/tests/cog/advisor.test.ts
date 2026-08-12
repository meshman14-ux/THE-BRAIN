/**
 * THE COG — advisor behaviour tests, driven by the 10 sample cases.
 * Also asserts the two engine-wide invariants:
 *   1. determinism — same state twice => byte-identical advice
 *   2. explainability — every output carries a rationale and a ruleTrace
 */
import { describe, expect, it } from "vitest";
import { advise } from "../../src/lib/cog";
import { defaultConfig } from "../../src/lib/cog";
import type { Advice, MomentumState } from "../../src/lib/cog";
import { baseProfile, baseState, deepMerge } from "./base-state";
import fixtures from "./sample-cases.json";

interface Expected {
  pulseKind?: string; pulseRule?: string; momentumBand?: string;
  prioritiesCount?: number; prioritiesInclude?: string; topRuleFired?: string;
  focusQuality?: string; focusRule?: string; focusSource?: string;
  microActionsMin?: number; degraded?: boolean;
  ruleFiredOnTask?: { taskId: string; ruleId: string };
}
interface Case {
  name: string; patch?: Record<string, unknown>;
  taskEdits?: { id: string; set: Record<string, unknown> }[];
  tasks?: never[]; expected: Expected;
}

function buildCase(c: Case): MomentumState {
  let state = baseState();
  if (c.patch) state = deepMerge(state, c.patch);
  if (c.tasks !== undefined) state.tasks = c.tasks;
  for (const edit of c.taskEdits ?? []) {
    const t = state.tasks.find((t) => t.id === edit.id);
    if (t) Object.assign(t, edit.set);
  }
  return state;
}

function run(state: MomentumState): Advice {
  return advise(state, baseProfile(), defaultConfig);
}

describe("THE COG — 10 sample cases", () => {
  for (const c of (fixtures as { cases: Case[] }).cases) {
    it(c.name, () => {
      const state = buildCase(c);
      const a = run(state);
      const e = c.expected;

      if (e.pulseKind) expect(a.pulse.kind).toBe(e.pulseKind);
      if (e.pulseRule) expect(a.pulse.ruleTrace.some((r) => r.ruleId === e.pulseRule && r.fired)).toBe(true);
      if (e.momentumBand) expect(a.report.band).toBe(e.momentumBand);
      if (e.prioritiesCount !== undefined) expect(a.priorities).toHaveLength(e.prioritiesCount);
      if (e.prioritiesInclude) expect(a.priorities.map((p) => p.taskId)).toContain(e.prioritiesInclude);
      if (e.topRuleFired)
        expect(a.priorities.some((p) => p.ruleTrace.some((r) => r.ruleId === e.topRuleFired && r.fired))).toBe(true);
      if (e.focusQuality) expect(a.focusSlot?.quality).toBe(e.focusQuality);
      if (e.focusRule) expect(a.focusSlot?.ruleTrace.some((r) => r.ruleId === e.focusRule && r.fired)).toBe(true);
      if (e.focusSource) expect(a.focusSlot?.source).toBe(e.focusSource);
      if (e.microActionsMin) expect(a.microActions.length).toBeGreaterThanOrEqual(e.microActionsMin);
      if (e.degraded !== undefined) expect(a.report.degraded).toBe(e.degraded);
      if (e.ruleFiredOnTask) {
        const p = a.priorities.find((p) => p.taskId === e.ruleFiredOnTask!.taskId);
        expect(p, `task ${e.ruleFiredOnTask.taskId} should be a priority`).toBeDefined();
        expect(p!.ruleTrace.some((r) => r.ruleId === e.ruleFiredOnTask!.ruleId && r.fired)).toBe(true);
      }
    });
  }
});

describe("engine invariants", () => {
  it("is deterministic: same state + config => identical advice", () => {
    for (const c of (fixtures as { cases: Case[] }).cases) {
      const s1 = buildCase(c), s2 = buildCase(c);
      expect(JSON.stringify(run(s1))).toBe(JSON.stringify(run(s2)));
    }
  });

  it("every recommendation is explainable (rationale + ruleTrace, rationale <= 240 chars)", () => {
    for (const c of (fixtures as { cases: Case[] }).cases) {
      const a = run(buildCase(c));
      const all = [...a.priorities, ...(a.focusSlot ? [a.focusSlot] : []), a.pulse, ...a.microActions];
      for (const rec of all) {
        expect(rec.rationale, JSON.stringify(rec)).toBeTruthy();
        expect(rec.rationale.length).toBeLessThanOrEqual(240);
        expect(rec.ruleTrace.length).toBeGreaterThan(0);
      }
    }
  });

  it("identity check surfaces keystone drift first (I3)", () => {
    const a = run(baseState());
    // profile: training has weight 1 but only 1 of 14 completions -> keystone drift leads
    expect(a.identityAlignment.drifts[0]?.pillarId).toBe("pillar-training");
    expect(a.identityAlignment.drifts.length).toBeLessThanOrEqual(2); // I2
  });
});
