import { describe, expect, it } from "vitest";
import {
  AREA_TRIAGE,
  VENTURE_DEEP,
  VENTURE_TRIAGE,
  areaTriageScore,
  bankFor,
  dismissedKeys,
  healthFromScore,
  seedSuggestions,
  type SeedRun,
  marginSignal,
  scoreBasisLine,
  taskCandidates,
  ventureTriageScore,
} from "../src/lib/diagnostics";

/* ------------------------------------------------------------------ *
 * Bank integrity — the questions are the product, so they get tests.
 * ------------------------------------------------------------------ */

const BANKS = [
  ["VENTURE_TRIAGE", VENTURE_TRIAGE],
  ["AREA_TRIAGE", AREA_TRIAGE],
  ["VENTURE_DEEP", VENTURE_DEEP],
] as const;

describe("question banks", () => {
  it("every key is unique within its bank — keys are storage names", () => {
    for (const [name, bank] of BANKS) {
      const keys = bank.map((q) => q.key);
      expect(new Set(keys).size, name).toBe(keys.length);
    }
  });

  it("every question carries a hover hint — Jay's requirement, no exceptions", () => {
    for (const [name, bank] of BANKS) {
      for (const q of bank) {
        expect(q.hint.length, `${name}:${q.key}`).toBeGreaterThan(20);
      }
    }
  });

  it("every choice question has choices, and non-choice questions have none", () => {
    for (const [name, bank] of BANKS) {
      for (const q of bank) {
        if (q.type === "choice")
          expect(q.choices?.length ?? 0, `${name}:${q.key}`).toBeGreaterThan(1);
        else expect(q.choices, `${name}:${q.key}`).toBeUndefined();
      }
    }
  });

  it("triage is ten questions and the deep dive is materially deeper", () => {
    expect(VENTURE_TRIAGE).toHaveLength(10);
    expect(VENTURE_DEEP.length).toBeGreaterThanOrEqual(18);
    expect(AREA_TRIAGE).toHaveLength(8);
  });

  it("bankFor routes subject and kind to the right bank", () => {
    expect(bankFor("venture", "triage")).toBe(VENTURE_TRIAGE);
    expect(bankFor("venture", "deep")).toBe(VENTURE_DEEP);
    expect(bankFor("area", "triage")).toBe(AREA_TRIAGE);
  });
});

/* ------------------------------------------------------------------ *
 * Margin signal
 * ------------------------------------------------------------------ */

describe("marginSignal", () => {
  it("needs both numbers — one alone is no signal, not a bad one", () => {
    expect(marginSignal(1000, null)).toBeNull();
    expect(marginSignal(null, 500)).toBeNull();
    expect(marginSignal(undefined, undefined)).toBeNull();
  });

  it("scales with margin", () => {
    expect(marginSignal(1000, 400)).toBe(10); // 60%
    expect(marginSignal(1000, 700)).toBe(8); // 30%
    expect(marginSignal(1000, 850)).toBe(6); // 15%
    expect(marginSignal(1000, 950)).toBe(4); // 5%
    expect(marginSignal(1000, 1100)).toBe(2); // -10%
    expect(marginSignal(1000, 1400)).toBe(0); // -40%
  });

  it("treats a dormant venture as no signal, a money pit as zero", () => {
    expect(marginSignal(0, 0)).toBeNull(); // not trading — nothing to score
    expect(marginSignal(0, 300)).toBe(0); // costing money while earning none
  });
});

/* ------------------------------------------------------------------ *
 * Triage scores — equal weights, skip-excluded, honest basis
 * ------------------------------------------------------------------ */

describe("ventureTriageScore", () => {
  it("scores a full answer set over all five signals", () => {
    const s = ventureTriageScore({
      rev_month: 4000,
      cost_month: 1600, // margin 60% → 10
      runs_without: "mostly", // 9
      pipeline: "healthy", // 9
      sops: "key", // 8
      trend: "growing", // 9
    });
    expect(s.ofTotal).toBe(5);
    expect(s.answered).toBe(5);
    expect(s.score).toBe(90); // mean 9.0 × 10
  });

  it("excludes skipped signals from the basis instead of counting them as zero", () => {
    const s = ventureTriageScore({ trend: "flat" }); // only one signal: 5
    expect(s.score).toBe(50);
    expect(s.answered).toBe(1);
    expect(s.ofTotal).toBe(5);
  });

  it("returns null, not zero, when nothing scoreable was answered", () => {
    const s = ventureTriageScore({ bottleneck: "quoting", hours_week: 20 });
    expect(s.score).toBeNull();
    expect(s.answered).toBe(0);
  });

  it("never lets hours worked move the score — hard work must not mask a sick venture", () => {
    const base = { trend: "declining" };
    expect(ventureTriageScore(base).score).toBe(
      ventureTriageScore({ ...base, hours_week: 80 }).score
    );
  });
});

describe("areaTriageScore", () => {
  it("folds state, standard and trend equally", () => {
    const s = areaTriageScore({ state: "okay", standard: "at", trend: "improving" });
    // 5, 6, 9 → mean 6.67 → 67
    expect(s.score).toBe(67);
    expect(s.answered).toBe(3);
    expect(s.ofTotal).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

describe("healthFromScore", () => {
  it("maps 0–100 onto the existing 1–5 ventures.health field", () => {
    expect(healthFromScore(0)).toBe(1);
    expect(healthFromScore(20)).toBe(1);
    expect(healthFromScore(21)).toBe(2);
    expect(healthFromScore(50)).toBe(3);
    expect(healthFromScore(90)).toBe(5);
    expect(healthFromScore(100)).toBe(5);
  });
});

describe("scoreBasisLine", () => {
  it("owns up to a thin basis instead of faking precision", () => {
    expect(scoreBasisLine({ score: 62, answered: 4, ofTotal: 5 })).toBe(
      "62 · 4 of 5 signals"
    );
    expect(scoreBasisLine({ score: null, answered: 0, ofTotal: 5 })).toBe(
      "no score yet · 0 of 5 signals"
    );
  });
});

describe("taskCandidates", () => {
  it("offers only answered, task-shaped text answers back", () => {
    const c = taskCandidates(VENTURE_TRIAGE, {
      bottleneck: "quoting takes days",
      trend: "flat", // choice — never a task
    });
    expect(c).toHaveLength(1);
    expect(c[0].title).toBe("Fix the bottleneck: quoting takes days");
  });

  it("offers nothing when nothing task-shaped was answered", () => {
    expect(taskCandidates(VENTURE_TRIAGE, { trend: "flat" })).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Seeding — the answers become the backlog
 * ------------------------------------------------------------------ */

describe("seedSuggestions", () => {
  const ventures = [{ id: "v1", name: "A to Z Traderz", pillar_id: "p-vent" }];
  const pillars = [{ id: "p-life", name: "Money & Security" }];

  const run = (over: Partial<SeedRun> = {}): SeedRun => ({
    id: "r1",
    subject_type: "venture",
    subject_id: "v1",
    kind: "triage",
    answers: { bottleneck: "No stock system" },
    meta: {},
    completed_at: "2026-08-11T14:49:00Z",
    ...over,
  });

  it("offers a completed run's answers with the subject named", () => {
    const out = seedSuggestions([run()], ventures, pillars, []);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe(
      "A to Z Traderz — Fix the bottleneck: No stock system"
    );
    expect(out[0].pillarId).toBe("p-vent");
  });

  it("an incomplete run offers nothing", () => {
    expect(
      seedSuggestions([run({ completed_at: null })], ventures, pillars, [])
    ).toHaveLength(0);
  });

  it("a suggestion whose task already exists is silently satisfied", () => {
    const out = seedSuggestions([run()], ventures, pillars, [
      "A to Z Traderz — Fix the bottleneck: No stock system",
    ]);
    expect(out).toHaveLength(0);
  });

  it("a dismissal in the run's meta is durable", () => {
    const out = seedSuggestions(
      [run({ meta: { dismissed_suggestions: ["bottleneck"] } })],
      ventures,
      pillars,
      []
    );
    expect(out).toHaveLength(0);
  });

  it("only the latest run per subject-and-kind speaks", () => {
    const out = seedSuggestions(
      [
        run({ id: "old", answers: { bottleneck: "Old answer" }, completed_at: "2026-08-01T10:00:00Z" }),
        run({ id: "new", answers: { bottleneck: "New answer" }, completed_at: "2026-08-11T10:00:00Z" }),
      ],
      ventures,
      pillars,
      []
    );
    expect(out).toHaveLength(1);
    expect(out[0].runId).toBe("new");
    expect(out[0].title).toContain("New answer");
  });

  it("an area run resolves against pillars and carries its own id as the area", () => {
    const out = seedSuggestions(
      [
        run({
          subject_type: "area",
          subject_id: "p-life",
          answers: { friction: "Too many logins" },
        }),
      ],
      ventures,
      pillars,
      []
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe(
      "Money & Security — Remove the friction: Too many logins"
    );
    expect(out[0].pillarId).toBe("p-life");
  });

  it("a run whose subject is gone offers nothing rather than a nameless task", () => {
    expect(
      seedSuggestions([run({ subject_id: "vanished" })], ventures, pillars, [])
    ).toHaveLength(0);
  });
});

describe("dismissedKeys", () => {
  it("validates the jsonb rather than trusting it", () => {
    expect(dismissedKeys(null)).toEqual([]);
    expect(dismissedKeys("junk")).toEqual([]);
    expect(dismissedKeys({ dismissed_suggestions: "not-a-list" })).toEqual([]);
    expect(dismissedKeys({ dismissed_suggestions: ["a", 7, "b"] })).toEqual([
      "a",
      "b",
    ]);
  });
});
