import { describe, expect, it } from "vitest";
import {
  BASELINE_MIN_READINGS,
  CONFIDENCE_FLOOR,
  DEFAULT_LANDMARKS,
  EXERCISES,
  LIBRARY,
  SKILL_TREES,
  type Attempt,
  type AthleteProfile,
  type Reading,
  type SkillState,
  type SessionLog,
  type SetLog,
  adjustmentFor,
  advise,
  bandFor,
  baselineFor,
  candidatesFor,
  deriveState,
  depthOf,
  freshness,
  generatePlan,
  hasPassed,
  isUnlocked,
  ladderFor,
  loadStepFor,
  nextStep,
  nextTestIn,
  normalise,
  pushPullBalance,
  readinessFor,
  sessionLoad,
  stepDown,
  treeById,
  treeProgress,
  validateLibrary,
  validateTree,
  volumeStatus,
  weekShape,
  weeklySets,
  workingEdge,
  workloadRatio,
} from "../src/lib/hybrid";

const TODAY = "2026-08-12";

const shift = (iso: string, by: number) => {
  const d = new Date(
    Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
  );
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

/** A clean baseline: `days` readings of `value`, jittered so sd is non-zero. */
const history = (
  key: Reading["key"],
  value: number,
  days = 30,
  source: Reading["source"] = "wearable"
): Reading[] =>
  Array.from({ length: days }, (_, i) => ({
    key,
    value: value + (i % 2 === 0 ? 1 : -1),
    source,
    on: shift(TODAY, -(i + 1)),
  }));

/* ================================================================== *
 * Content integrity — the seed data must not be able to lie
 * ================================================================== */

describe("library", () => {
  it("has no broken or one-way edges", () => {
    expect(validateLibrary()).toEqual([]);
  });

  it("ships every exercise the skill trees reference", () => {
    for (const tree of SKILL_TREES) {
      for (const node of tree.nodes) {
        expect(LIBRARY.has(node.exercise_id), `${tree.id}/${node.id}`).toBe(true);
      }
    }
  });

  it("is big enough to build a session from", () => {
    expect(EXERCISES.length).toBeGreaterThan(40);
  });
});

describe("skill trees", () => {
  it("ships the four the brief named", () => {
    expect(SKILL_TREES.map((t) => t.id).sort()).toEqual([
      "front-lever",
      "handstand",
      "l-sit",
      "muscle-up",
    ]);
  });

  it("are structurally sound — every standard has form criteria", () => {
    for (const tree of SKILL_TREES) {
      expect(validateTree(tree), tree.id).toEqual([]);
    }
  });

  it("orders depth by the hardest prerequisite path", () => {
    const fl = treeById("front-lever")!;
    expect(depthOf(fl, "fl.scap")).toBe(0);
    expect(depthOf(fl, "fl.full")).toBeGreaterThan(depthOf(fl, "fl.tuck"));
  });

  it("survives a malformed tree without hanging", () => {
    const cyclic = {
      id: "x",
      name: "x",
      goal: "a",
      nodes: [
        { id: "a", name: "a", requires: ["b"], exercise_id: "ex.pull_up", standard: { reps: 1, form: ["f"] } },
        { id: "b", name: "b", requires: ["a"], exercise_id: "ex.pull_up", standard: { reps: 1, form: ["f"] } },
      ],
    };
    expect(depthOf(cyclic, "a")).toBeGreaterThanOrEqual(0);
  });
});

/* ================================================================== *
 * Readiness — the engine has to be honest about what it does not know
 * ================================================================== */

describe("baselines", () => {
  it("refuses a baseline below the minimum reading count", () => {
    const thin = history("hrv", 50, BASELINE_MIN_READINGS - 1);
    expect(baselineFor(thin, "hrv", TODAY)).toBeNull();
  });

  it("excludes today from its own baseline", () => {
    // Today at 999 must not drag the mean up; it is not in the window.
    const readings = [
      ...history("hrv", 50, 30),
      { key: "hrv" as const, value: 999, source: "wearable" as const, on: TODAY },
    ];
    expect(baselineFor(readings, "hrv", TODAY)!.mean).toBeLessThan(60);
  });

  it("treats a stuck sensor as no baseline rather than perfect consistency", () => {
    const flat: Reading[] = Array.from({ length: 30 }, (_, i) => ({
      key: "hrv",
      value: 50,
      source: "wearable",
      on: shift(TODAY, -(i + 1)),
    }));
    expect(baselineFor(flat, "hrv", TODAY)).toBeNull();
  });
});

describe("normalise", () => {
  const base = { key: "hrv" as const, mean: 50, sd: 5, readings: 30 };

  it("puts the mean at the middle", () => {
    expect(normalise(50, base)).toBeCloseTo(0.5, 5);
  });

  it("scores above baseline as better for HRV", () => {
    expect(normalise(60, base)).toBeGreaterThan(0.5);
  });

  it("inverts direction for resting heart rate — higher is worse", () => {
    const rhr = { key: "resting_hr" as const, mean: 50, sd: 5, readings: 30 };
    expect(normalise(60, rhr)).toBeLessThan(0.5);
  });

  it("keeps extremes separable rather than clamping them together", () => {
    // Two SDs down and four SDs down are different days, and the day worth
    // distinguishing is exactly the far one.
    expect(normalise(40, base)).toBeGreaterThan(normalise(30, base));
  });
});

describe("freshness", () => {
  it("is undiscounted today and halved at the half-life", () => {
    expect(freshness(0)).toBe(1);
    expect(freshness(3)).toBeCloseTo(0.5, 5);
  });

  it("decays rather than falling off a cliff", () => {
    expect(freshness(1)).toBeGreaterThan(freshness(2));
    expect(freshness(10)).toBeGreaterThan(0);
  });
});

describe("readinessFor", () => {
  it("says so plainly when there is nothing to go on", () => {
    const r = readinessFor([], TODAY);
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.reason).toContain("Nothing to go on");
  });

  it("refuses to score below the confidence floor", () => {
    // One signal out of eleven cannot carry a number.
    const readings = [
      ...history("mood", 5, 30, "self"),
      { key: "mood" as const, value: 5, source: "self" as const, on: TODAY },
    ];
    const r = readinessFor(readings, TODAY);
    expect(r.score).toBeNull();
    expect(r.confidence).toBeLessThan(CONFIDENCE_FLOOR);
    expect(r.reason).toContain("not enough");
  });

  it("scores once enough signals are present, and names what is missing", () => {
    const keys = ["hrv", "sleep_hours", "sleep_quality", "soreness", "stress", "energy"] as const;
    const readings = keys.flatMap((k) => [
      ...history(k, 50, 30),
      { key: k, value: 50, source: "wearable" as const, on: TODAY },
    ]);
    const r = readinessFor(readings, TODAY);
    expect(r.score).not.toBeNull();
    expect(r.confidence).toBeGreaterThan(CONFIDENCE_FLOOR);
    expect(r.missing).toContain("hydration");
  });

  it("never imputes a missing signal as average", () => {
    // A day where every PRESENT signal is terrible must score badly, not be
    // pulled to the middle by the signals that did not show up.
    const keys = ["hrv", "sleep_hours", "sleep_quality", "soreness", "stress", "energy"] as const;
    const readings = keys.flatMap((k) => [
      ...history(k, 50, 30),
      // Direction matters: for soreness/stress higher is worse.
      {
        key: k,
        value: k === "soreness" || k === "stress" ? 80 : 20,
        source: "wearable" as const,
        on: TODAY,
      },
    ]);
    const r = readinessFor(readings, TODAY);
    expect(r.score).toBeLessThan(20);
    expect(r.band).toBe("red");
  });

  it("discounts a stale reading rather than trusting it like today's", () => {
    const keys = ["hrv", "sleep_hours", "sleep_quality", "soreness", "stress", "energy"] as const;
    const fresh = keys.flatMap((k) => [
      ...history(k, 50, 30),
      { key: k, value: 50, source: "wearable" as const, on: TODAY },
    ]);
    const stale = keys.flatMap((k) => [
      ...history(k, 50, 30),
      { key: k, value: 50, source: "wearable" as const, on: shift(TODAY, -6) },
    ]);
    expect(readinessFor(stale, TODAY).confidence).toBeLessThan(
      readinessFor(fresh, TODAY).confidence
    );
  });

  it("treats self-report as a peer of wearable data, not a fallback", () => {
    // Saw, Main & Gastin (2016): subjective measures track load at least as
    // well as objective ones. A near-equal reliability is a deliberate claim.
    const keys = ["hrv", "sleep_hours", "sleep_quality", "soreness", "stress", "energy"] as const;
    const make = (source: Reading["source"]) =>
      keys.flatMap((k) => [
        ...history(k, 50, 30, source),
        { key: k, value: 50, source, on: TODAY },
      ]);
    const w = readinessFor(make("wearable"), TODAY).confidence;
    const s = readinessFor(make("self"), TODAY).confidence;
    expect(s / w).toBeGreaterThan(0.9);
  });
});

describe("bandFor", () => {
  it("splits the scale into three, not a hundred", () => {
    expect(bandFor(80)).toBe("green");
    expect(bandFor(50)).toBe("amber");
    expect(bandFor(20)).toBe("red");
  });
});

/* ================================================================== *
 * Load
 * ================================================================== */

describe("volumeStatus", () => {
  const l = DEFAULT_LANDMARKS.chest;

  it("distinguishes the productive ceiling from actual overreach", () => {
    // MAV..MRV is the top of a block, not a mistake. Flagging it red is how
    // a warning gets trained out of usefulness.
    expect(volumeStatus(l.mav, l)).toBe("at-ceiling");
    expect(volumeStatus(l.mrv + 1, l)).toBe("over");
  });

  it("names the whole scale", () => {
    expect(volumeStatus(0, l)).toBe("under-maintenance");
    expect(volumeStatus(l.mv, l)).toBe("maintaining");
    expect(volumeStatus(l.mev, l)).toBe("productive");
  });

  it("gives calisthenics-specific groups landmarks a barbell chart has not", () => {
    expect(DEFAULT_LANDMARKS["scapular-stabilisers"].mev).toBeGreaterThan(0);
    expect(DEFAULT_LANDMARKS.wrists.mev).toBeGreaterThan(0);
  });
});

describe("weeklySets", () => {
  const set = (o: Partial<SetLog> = {}): SetLog => ({
    exercise_id: o.exercise_id ?? "ex.pull_up",
    amount: o.amount ?? 8,
    load_kg: o.load_kg ?? 0,
    rir: "rir" in o ? (o.rir as number | null) : 1,
  });
  const session = (sets: SetLog[]): SessionLog => ({
    id: "s",
    on: TODAY,
    kind: "pull",
    sets,
    session_rpe: 7,
    duration_min: 60,
  });

  it("counts a secondary muscle at half a set", () => {
    const counts = weeklySets([session([set()])], LIBRARY);
    expect(counts.get("lats")).toBe(1);
    expect(counts.get("biceps")).toBe(0.5);
  });

  it("ignores sets left far from failure — the stimulus is in the last reps", () => {
    const counts = weeklySets([session([set({ rir: 8 })])], LIBRARY);
    expect(counts.get("lats")).toBeUndefined();
  });

  it("counts an unlogged RIR rather than punishing incomplete logging", () => {
    const counts = weeklySets([session([set({ rir: null })])], LIBRARY);
    expect(counts.get("lats")).toBe(1);
  });
});

describe("sessionLoad and workloadRatio", () => {
  it("prices a session as RPE times minutes, and nothing when either is absent", () => {
    expect(
      sessionLoad({ id: "a", on: TODAY, kind: "pull", sets: [], session_rpe: 7, duration_min: 60 })
    ).toBe(420);
    expect(
      sessionLoad({ id: "a", on: TODAY, kind: "pull", sets: [], session_rpe: null, duration_min: 60 })
    ).toBeNull();
  });

  it("refuses a ratio on too little history rather than producing a scary number", () => {
    const two: SessionLog[] = [0, 1].map((i) => ({
      id: `s${i}`,
      on: shift(TODAY, -i),
      kind: "pull",
      sets: [],
      session_rpe: 8,
      duration_min: 60,
    }));
    const r = workloadRatio(two, TODAY);
    expect(r.ratio).toBeNull();
    expect(r.zone).toBe("unknown");
  });

  it("catches the motivated Monday after two quiet weeks", () => {
    const sessions: SessionLog[] = [];
    // A month of light work...
    for (let i = 7; i < 28; i += 2) {
      sessions.push({
        id: `old${i}`,
        on: shift(TODAY, -i),
        kind: "pull",
        sets: [],
        session_rpe: 4,
        duration_min: 30,
      });
    }
    // ...then a very heavy week.
    for (let i = 0; i < 6; i++) {
      sessions.push({
        id: `new${i}`,
        on: shift(TODAY, -i),
        kind: "pull",
        sets: [],
        session_rpe: 9,
        duration_min: 90,
      });
    }
    expect(workloadRatio(sessions, TODAY).zone).toBe("spiking");
  });
});

/* ================================================================== *
 * Exercises — the graph
 * ================================================================== */

describe("ladders", () => {
  it("walks a whole ladder without looping on a diamond", () => {
    const ladder = ladderFor("ex.pull_up").map((e) => e.id);
    expect(ladder).toContain("ex.ring_row");
    expect(ladder).toContain("ex.muscle_up");
    expect(new Set(ladder).size).toBe(ladder.length);
  });

  it("orders a ladder easiest first", () => {
    const d = ladderFor("ex.pull_up").map((e) => e.difficulty);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it("steps down a rung, and returns the original when there is nowhere to fall", () => {
    expect(stepDown("ex.pull_up")!.id).toBe("ex.band_pull_up");
    // Failing to regress must never mean failing to train.
    expect(stepDown("ex.ring_row")!.id).toBe("ex.ring_row");
  });
});

describe("candidatesFor", () => {
  it("excludes anything needing equipment that is not there", () => {
    const none = candidatesFor({ session: "pull", equipment: ["floor"] });
    expect(none.every((c) => !c.exercise.equipment.includes("bar"))).toBe(true);
  });

  it("ranks what he chose last time above what he did yesterday", () => {
    const c = candidatesFor({
      session: "pull",
      pattern: "vertical-pull",
      prefer: ["ex.pull_up"],
      avoid: ["ex.weighted_pull_up"],
    });
    const pull = c.findIndex((x) => x.exercise.id === "ex.pull_up");
    const weighted = c.findIndex((x) => x.exercise.id === "ex.weighted_pull_up");
    expect(pull).toBeLessThan(weighted);
  });

  it("explains its ranking rather than asserting it", () => {
    const c = candidatesFor({ session: "pull", muscle: "lats", prefer: ["ex.pull_up"] });
    expect(c[0].why.length).toBeGreaterThan(0);
  });

  it("returns a shortlist, so the athlete chooses and the system does not", () => {
    expect(candidatesFor({ session: "pull" }).length).toBeGreaterThan(1);
  });
});

describe("pushPullBalance", () => {
  it("flags push-heavy, the ratio that costs shoulders", () => {
    const b = pushPullBalance([
      "ex.bench_press",
      "ex.ohp",
      "ex.push_up",
      "ex.pull_up",
    ]);
    expect(b.ratio).toBeLessThan(0.8);
    expect(b.line).toContain("Push-heavy");
  });

  it("treats pull-heavy as the cheaper error", () => {
    const b = pushPullBalance(["ex.pull_up", "ex.ring_row", "ex.barbell_row", "ex.push_up"]);
    expect(b.line).toContain("cheaper");
  });
});

/* ================================================================== *
 * Skills — mastery is proved, never assumed
 * ================================================================== */

describe("mastery", () => {
  const fl = treeById("front-lever")!;
  const attempt = (node_id: string, on: string, amount: number, strict = true): Attempt => ({
    node_id,
    on,
    amount,
    strict,
  });

  it("locks a node until every prerequisite is owned", () => {
    expect(isUnlocked(fl, {}, "fl.tuck")).toBe(false);
    expect(isUnlocked(fl, { "fl.scap": "owned", "fl.hollow": "owned" }, "fl.tuck")).toBe(true);
  });

  it("will not pass a standard on sloppy form, however big the number", () => {
    const node = fl.nodes.find((n) => n.id === "fl.tuck")!;
    const sloppy = [
      attempt("fl.tuck", "2026-08-01", 60, false),
      attempt("fl.tuck", "2026-08-03", 60, false),
    ];
    expect(hasPassed(sloppy, node).passed).toBe(false);
  });

  it("requires separate days — three good sets is one good session", () => {
    const node = fl.nodes.find((n) => n.id === "fl.tuck")!;
    const oneDay = [
      attempt("fl.tuck", "2026-08-01", 25),
      attempt("fl.tuck", "2026-08-01", 25),
      attempt("fl.tuck", "2026-08-01", 25),
    ];
    expect(hasPassed(oneDay, node).passed).toBe(false);
    expect(hasPassed([...oneDay, attempt("fl.tuck", "2026-08-03", 25)], node).passed).toBe(true);
  });

  it("derives state from the log, so mastery cannot quietly stop being true", () => {
    const attempts = [
      attempt("fl.scap", "2026-08-01", 12),
      attempt("fl.scap", "2026-08-03", 12),
      attempt("fl.hollow", "2026-08-01", 50),
      attempt("fl.hollow", "2026-08-03", 50),
      attempt("fl.tuck", "2026-08-05", 22),
      attempt("fl.tuck", "2026-08-07", 22),
    ];
    const state = deriveState(fl, attempts);
    expect(state["fl.scap"]).toBe("owned");
    expect(state["fl.tuck"]).toBe("owned");
    expect(state["fl.adv_tuck"]).toBe("testing");
    expect(state["fl.full"]).toBe("locked");
  });

  it("cascades in one pass — someone testing in passes several rungs at once", () => {
    // This is the case that matters: an athlete who already owns the skill
    // logs attempts across the tree and every earned rung resolves together.
    const attempts = ["fl.scap", "fl.hollow", "fl.tuck", "fl.adv_tuck"].flatMap((id) => [
      attempt(id, "2026-08-01", 60),
      attempt(id, "2026-08-03", 60),
    ]);
    const state = deriveState(fl, attempts);
    expect(state["fl.adv_tuck"]).toBe("owned");
  });

  it("offers the working edge, not the whole tree", () => {
    const edge = workingEdge(fl, { "fl.scap": "owned", "fl.hollow": "owned" });
    expect(edge.map((n) => n.id)).toEqual(["fl.tuck"]);
  });

  it("counts progress honestly", () => {
    const p = treeProgress(fl, { "fl.scap": "owned" });
    expect(p.owned).toBe(1);
    expect(p.of).toBe(fl.nodes.length);
  });
});

describe("test-in", () => {
  it("starts at the deepest node so an existing skill is not re-climbed", () => {
    const hs = treeById("handstand")!;
    const first = nextTestIn(hs, {}, new Set());
    // Nothing deep is unlocked yet, so it offers a root — but the ORDER it
    // walks is deepest-first, which is what lets a proved rung skip the rest.
    expect(first).not.toBeNull();
    expect(hs.nodes.some((n) => n.id === first!.id)).toBe(true);
  });

  it("stops when the tree is fully positioned", () => {
    const ls = treeById("l-sit")!;
    const attempted = new Set(ls.nodes.map((n) => n.id));
    expect(nextTestIn(ls, {}, attempted)).toBeNull();
  });
});

/* ================================================================== *
 * Progression
 * ================================================================== */

describe("nextStep", () => {
  const pullUp = LIBRARY.get("ex.pull_up")!;
  const weighted = LIBRARY.get("ex.weighted_pull_up")!;
  const range = { min: 6, max: 12 };
  const sets = (amount: number, rir: number | null, id = "ex.pull_up"): SetLog[] => [
    { exercise_id: id, amount, load_kg: 0, rir },
    { exercise_id: id, amount, load_kg: 0, rir },
  ];

  it("holds when there is nothing logged yet", () => {
    expect(nextStep(pullUp, range, []).move).toBe("hold");
  });

  it("steps up the ladder when the top of the range is owned and there is no load to add", () => {
    const v = nextStep(pullUp, range, [{ sets: sets(12, 1) }]);
    expect(v.move).toBe("step-up");
  });

  it("adds load instead when the movement can carry it", () => {
    const v = nextStep(weighted, range, [
      { sets: sets(12, 1, "ex.weighted_pull_up") },
    ]);
    expect(v.move).toBe("add-load");
  });

  it("prices the jump against total system load, not belt weight", () => {
    // 2.5kg on a 20kg belt looks like 12.5%; against 85kg of athlete it is
    // 2.4%, which is the number that actually governs whether it is doable.
    const step = loadStepFor(weighted, 85);
    expect(step).toBeGreaterThan(1.25);
    expect(step).toBeLessThan(3);
  });

  it("will not promote a set hit at high RIR", () => {
    expect(nextStep(pullUp, range, [{ sets: sets(12, 6) }]).move).toBe("add-reps");
  });

  it("drops a rung after falling out of the bottom twice — not once", () => {
    const once = nextStep(pullUp, range, [{ sets: sets(4, 0) }]);
    expect(once.move).toBe("add-reps");
    const twice = nextStep(pullUp, range, [{ sets: sets(4, 0) }, { sets: sets(4, 0) }]);
    expect(twice.move).toBe("step-down");
  });
});

describe("adjustmentFor", () => {
  const at = (score: number | null) => ({
    score,
    band: score == null ? null : bandFor(score),
    confidence: 0.8,
    contributions: [],
    missing: [],
    reason: null,
  });

  it("cuts volume harder than intensity — the stimulus is in the effort", () => {
    const red = adjustmentFor(at(20));
    expect(red.volume).toBeLessThan(red.intensity);
    expect(red.volume).toBeLessThan(1);
  });

  it("keeps skill work in even on a red day", () => {
    expect(adjustmentFor(at(20)).skills).toBe(true);
  });

  it("never invents a reason to do less when there is no score", () => {
    const none = adjustmentFor(at(null));
    expect(none.volume).toBe(1);
    expect(none.reason).toContain("as written");
  });

  it("does not licence extra work on a good day", () => {
    // "Feeling good" is the most common cause of the spike that ends a block.
    expect(adjustmentFor(at(90)).volume).toBe(1);
  });
});

/* ================================================================== *
 * The plan
 * ================================================================== */

describe("weekShape", () => {
  it("keeps legs when the week shrinks, rather than dropping them", () => {
    expect(weekShape(3)).toContain("legs");
    expect(weekShape(2)).not.toContain("push");
  });

  it("makes the floor a full-body session, not the favourite one", () => {
    expect(weekShape(1)).toEqual(["full-body"]);
  });
});

describe("generatePlan", () => {
  const profile: AthleteProfile = {
    bodyweight_kg: 85,
    sessions_per_week: 4,
    equipment: ["floor", "bar", "rings", "parallettes", "band", "wall", "bench", "dumbbell", "barbell", "rack", "dip-belt", "plate", "step", "ab-wheel", "bike", "parallel-bars"],
    focus_skills: ["front-lever"],
  };
  const base = {
    on: TODAY,
    profile,
    trees: SKILL_TREES,
    skillState: { "fl.scap": "owned", "fl.hollow": "owned" } as Record<string, "owned">,
  };
  const readiness = (score: number | null) => ({
    score,
    band: score == null ? null : bandFor(score),
    confidence: 0.8,
    contributions: [],
    missing: [],
    reason: null,
  });

  it("puts skill work before anything heavy", () => {
    const plan = generatePlan({ ...base, kind: "pull", readiness: readiness(80) });
    const kinds = plan.blocks.map((b) => b.kind);
    expect(kinds.indexOf("skill")).toBeLessThan(kinds.indexOf("primary"));
  });

  it("gives every block a reason, so the plan can be argued with", () => {
    const plan = generatePlan({ ...base, kind: "push", readiness: readiness(80) });
    expect(plan.blocks.every((b) => b.why.length > 0)).toBe(true);
  });

  it("shrinks a red day instead of cancelling it", () => {
    const green = generatePlan({ ...base, kind: "pull", readiness: readiness(85) });
    const red = generatePlan({ ...base, kind: "pull", readiness: readiness(15) });
    const count = (p: typeof green) =>
      p.blocks.reduce((n, b) => n + b.items.reduce((m, i) => m + i.sets, 0), 0);
    expect(count(red)).toBeLessThan(count(green));
    expect(red.blocks.length).toBeGreaterThan(0);
  });

  it("never drops a working set below one", () => {
    const red = generatePlan({ ...base, kind: "legs", readiness: readiness(5) });
    expect(red.blocks.every((b) => b.items.every((i) => i.sets >= 1))).toBe(true);
  });

  it("carries the readiness it was built from, so the plan cannot be read without it", () => {
    const plan = generatePlan({ ...base, kind: "pull", readiness: readiness(45) });
    expect(plan.readiness.score).toBe(45);
    expect(plan.adjustment.reason).toBeTruthy();
  });

  it("respects absent equipment — nothing is prescribed that cannot be done", () => {
    const plan = generatePlan({
      ...base,
      kind: "pull",
      readiness: readiness(80),
      profile: { ...profile, equipment: ["floor"] },
    });
    for (const b of plan.blocks) {
      for (const i of b.items) {
        const ex = LIBRARY.get(i.exercise_id)!;
        expect(ex.equipment.every((k) => k === "floor"), ex.id).toBe(true);
      }
    }
  });

  it("gives a rest day a restore block and nothing to grind", () => {
    const plan = generatePlan({ ...base, kind: "rest", readiness: readiness(80) });
    expect(plan.blocks.map((b) => b.kind)).toEqual(["restore"]);
  });
});

/* ================================================================== *
 * The advisor — suggests, never performs
 * ================================================================== */

describe("advise", () => {
  const profile: AthleteProfile = {
    bodyweight_kg: 85,
    sessions_per_week: 4,
    equipment: ["floor", "bar"],
    focus_skills: ["front-lever"],
  };
  const input = (over: Partial<Parameters<typeof advise>[0]> = {}) => ({
    todayIso: TODAY,
    readiness: {
      score: 70,
      band: "green" as const,
      confidence: 0.8,
      contributions: [],
      missing: [],
      reason: null,
    },
    sessions: [] as SessionLog[],
    library: LIBRARY,
    trees: SKILL_TREES,
    skillState: { "fl.scap": "owned", "fl.hollow": "owned" } as SkillState,
    profile,
    ...over,
  });

  it("keeps the four channels separate so the quiet one is not drowned out", () => {
    expect(Object.keys(advise(input())).sort()).toEqual([
      "progression",
      "readiness",
      "recovery",
      "skill",
    ]);
  });

  it("never returns an advice item that performs an action itself", () => {
    const all = Object.values(advise(input())).flat();
    for (const a of all) {
      // An action is a label and at most a link — never a mutation.
      if (a.action) expect(Object.keys(a.action).sort()).toEqual(["href", "label"]);
    }
  });

  it("offers the three-tap fix when there is no readiness score", () => {
    const r = advise(
      input({
        readiness: {
          score: null,
          band: null,
          confidence: 0,
          contributions: [],
          missing: [],
          reason: "Nothing to go on yet.",
        },
      })
    ).readiness;
    expect(r[0].action?.href).toBe("/checkin");
  });

  it("states thin confidence rather than letting a number pass for certainty", () => {
    const r = advise(
      input({
        readiness: {
          score: 70,
          band: "green",
          confidence: 0.4,
          contributions: [],
          missing: [],
          reason: null,
        },
      })
    ).readiness;
    expect(r.some((a) => a.line.includes("hint rather than a verdict"))).toBe(true);
  });

  it("names the next rung of a focus skill with its actual standard", () => {
    const s = advise(input()).skill;
    expect(s[0].line).toContain("Tuck front lever");
    expect(s[0].line).toContain("20s");
  });

  it("says something when no skill is being worked at all", () => {
    const s = advise(input({ profile: { ...profile, focus_skills: [] } })).skill;
    expect(s[0].action?.label).toContain("Pick a skill");
  });

  it("warns about too many skills at once", () => {
    const s = advise(
      input({
        profile: { ...profile, focus_skills: ["front-lever", "handstand", "l-sit"] },
      })
    ).skill;
    expect(s.some((a) => a.line.includes("Two is about the ceiling"))).toBe(true);
  });

  it("stays quiet on progression when there is nothing logged", () => {
    expect(advise(input()).progression).toEqual([]);
  });
});
