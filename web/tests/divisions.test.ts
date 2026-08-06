/* ====================================================================
 * STAGE 4 · PHASE C — division onboarding, then division dashboards
 *
 * Jay has eighteen divisions and almost no money against them. A dashboard
 * built first would have been eighteen empty pages, so the questionnaire is
 * the feature and the dashboard is what it pays for.
 *
 * One rule runs through every test below, because getting it wrong is how
 * this feature would quietly lie to him: **an unanswered question is NULL,
 * and NULL is not zero.** A division whose budget nobody has entered is a
 * division of unknown cost, never a free one — and money spent against no
 * budget is a missing figure, not an overspend.
 * ==================================================================== */

import { describe, it, expect } from "vitest";
import {
  toNumberOrNull,
  toTextOrNull,
  isExternal,
  onboardableVentures,
  readOnboardedAt,
  stageConfirmed,
  ventureOnboarding,
  onboardingProgress,
  nextToOnboard,
  nextStepProjectTitle,
  findNextStepProject,
  ventureProjects,
  ventureTasks,
  ventureGoals,
  venturesWithNextStep,
  budgetVsSpend,
  spendByVenture,
  runningCostTotal,
  stagePosition,
  stagePathPercent,
  taskMix,
  slugifyName,
  resolveVenture,
  readVentureProfile,
  complianceKind,
  complianceQuestions,
  readComplianceAnswers,
  isConcerningAnswer,
  complianceInboxText,
  complianceConcerns,
  NEXT_STEP_ROLE,
} from "../src/lib/logic";
import { ventureSlug, divisionHref } from "../src/lib/references";
import { DIVISION_NAMES, BUILT_BRANCHES } from "../src/lib/placeholders";
import {
  ONBOARD_STEPS,
  ONBOARDED_AT_KEY,
  STAGE_CONFIRMED_KEY,
  COMPLIANCE_KEY,
  COMPLIANCE_QUESTIONS,
  FUNDING_ROUTES,
  STAGE_MEANING,
  VENTURE_STAGES,
  type Venture,
} from "../src/lib/types";

/* -- fixtures ------------------------------------------------------- *
 *
 * The profiles are the real seeded ones, copied from the live project on
 * 2026-08-06. Testing the derivation against invented shapes would prove
 * only that the invention parses.
 */

const venture = (over: Partial<Venture> = {}): Venture => ({
  id: over.id ?? "v1",
  name: "A Division",
  pillar_id: null,
  stage: "idea",
  progress: 0,
  one_liner: null,
  status: "active",
  sort_order: 0,
  external_system: null,
  plan: null,
  budget: null,
  monthly_cost: null,
  funding_route: null,
  profile: {},
  meta: {},
  ...over,
});

/** Everything answered. The state one completed questionnaire leaves. */
const answered = (over: Partial<Venture> = {}): Venture =>
  venture({
    one_liner: "Buys and sells stock",
    budget: 1000,
    monthly_cost: 120,
    funding_route: "Angel investors / AS Ltd unit",
    plan: "Buy a pallet, list it, reinvest.",
    meta: { [STAGE_CONFIRMED_KEY]: true },
    ...over,
  });

const PROPERTY_PROFILE = {
  duty: "Every landlord of a rented property in Wales must REGISTER. If you manage it yourself you must also be LICENSED (training required).",
  sources: [
    "https://rentsmart.gov.wales/en/enforcement/",
    "https://www.gov.wales/council-tax-empty-and-second-homes-html",
  ],
  critical:
    "An unregistered landlord CANNOT serve a valid notice seeking possession.",
  penalties: "Fixed penalty £150-£250, no appeal once correctly served.",
  regulator: "Rent Smart Wales",
  first_steps: ["Confirm Rent Smart Wales registration status"],
  council_tax_warning:
    "Welsh councils may charge up to a 300% premium on long-term empty homes (empty 12 months+).",
};

const CIS_PROFILE = {
  duty: "Construction work for other businesses falls under CIS. Register as a subcontractor.",
  money:
    "Registered subcontractors have 20% deducted at source. UNREGISTERED have 30%.",
  sources: [
    "https://gov.uk/what-you-must-do-as-a-cis-contractor/make-deductions-and-pay-subcontractors",
  ],
  regulator: "HMRC — Construction Industry Scheme (CIS)",
  first_steps: ["Register for CIS as a subcontractor before the next paid job"],
  also_consider: ["TrustMark for consumer-facing work", "Gas Safe if any gas work"],
};

/* ================================================================== *
 * Unknown is not zero
 * ================================================================== */

describe("toNumberOrNull", () => {
  it("keeps a real zero and rejects everything that only looks like one", () => {
    // The distinction the whole feature rests on: a division costed at £0
    // is a claim; a division nobody has costed is a blank.
    expect(toNumberOrNull(0)).toBe(0);
    expect(toNumberOrNull("0")).toBe(0);
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
    expect(toNumberOrNull("")).toBeNull();
    expect(toNumberOrNull("   ")).toBeNull();
  });

  it("refuses anything that is not a finite number", () => {
    expect(toNumberOrNull("not a number")).toBeNull();
    expect(toNumberOrNull(NaN)).toBeNull();
    expect(toNumberOrNull(Infinity)).toBeNull();
    expect(toNumberOrNull({})).toBeNull();
    expect(toNumberOrNull([])).toBeNull();
  });

  it("reads the numeric strings a database can hand back", () => {
    expect(toNumberOrNull("1000")).toBe(1000);
    expect(toNumberOrNull("1500.50")).toBe(1500.5);
    expect(toNumberOrNull(1000)).toBe(1000);
  });
});

describe("toTextOrNull", () => {
  it("treats an empty box as an unanswered question", () => {
    expect(toTextOrNull("")).toBeNull();
    expect(toTextOrNull("   ")).toBeNull();
    expect(toTextOrNull(null)).toBeNull();
    expect(toTextOrNull(42)).toBeNull();
    expect(toTextOrNull("  answered  ")).toBe("answered");
  });
});

/* ================================================================== *
 * Who gets asked
 * ================================================================== */

describe("external systems are never onboarded", () => {
  const mainframe = venture({
    id: "mf",
    name: "MAINFRAME",
    external_system: "MAINFRAME",
  });

  it("knows a pointer row from a division", () => {
    expect(isExternal(mainframe)).toBe(true);
    expect(isExternal(venture())).toBe(false);
    // An empty string is not a system name.
    expect(isExternal(venture({ external_system: "  " }))).toBe(false);
  });

  it("leaves MAINFRAME out of the divisions entirely", () => {
    const all = [venture({ id: "a" }), venture({ id: "b" }), mainframe];
    expect(onboardableVentures(all).map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("never resolves a page for it — its data lives in its own system", () => {
    expect(resolveVenture([mainframe], "mf")).toBeNull();
    expect(resolveVenture([mainframe], "mainframe")).toBeNull();
  });
});

/* ================================================================== *
 * Completeness, per division
 * ================================================================== */

describe("ventureOnboarding", () => {
  it("counts a division nobody has touched as untouched, not as zero percent done", () => {
    const o = ventureOnboarding(venture());
    expect(o.done).toBe(0);
    expect(o.total).toBe(ONBOARD_STEPS.length);
    expect(o.untouched).toBe(true);
    expect(o.complete).toBe(false);
    expect(o.missing).toHaveLength(ONBOARD_STEPS.length);
  });

  it("has one gradeable question per step in the registry", () => {
    // A question the completeness rule cannot see is a question that can be
    // answered without the count ever moving.
    const o = ventureOnboarding(answered(), { hasNextStep: true });
    expect(o.answered.sort()).toEqual(ONBOARD_STEPS.map((s) => s.key).sort());
    expect(o.complete).toBe(true);
    expect(o.percent).toBe(100);
  });

  it("reads the four costed divisions as part-answered, not as untouched", () => {
    // Storage Solutions, Photo Booth, Stencil Art and Microgreens arrived
    // with a budget and a funding route from Jay's own costing sheet.
    const storage = venture({
      name: "Storage Solutions",
      one_liner: "Costed at £1,000",
      budget: 1000,
      funding_route: "Angel investors / AS Ltd unit",
    });
    const o = ventureOnboarding(storage);
    expect(o.untouched).toBe(false);
    expect(o.done).toBe(3);
    expect(o.answered).toContain("budget");
    expect(o.missing).toContain("monthly_cost");
    expect(o.missing).toContain("plan");
  });

  it("counts a budget of zero as an answer", () => {
    // "It costs nothing to start" is a real answer, and a different fact
    // from "nobody has said what it costs".
    expect(ventureOnboarding(venture({ budget: 0 })).answered).toContain("budget");
    expect(ventureOnboarding(venture({ budget: null })).missing).toContain("budget");
  });

  /**
   * The rule that decides whether a division gets a dashboard or the
   * questionnaire invitation. Every one of the seventeen was seeded with a
   * one-liner, so if that counted as something to draw, the on-ramp would
   * never appear for a single division — and the empty state *is* the
   * on-ramp.
   */
  it("does not treat a seeded one-liner as a dashboard's worth of data", () => {
    const seeded = venture({ one_liner: "First income engine" });
    const o = ventureOnboarding(seeded);
    expect(o.untouched).toBe(false);
    expect(o.done).toBe(1);
    expect(o.hasDashboardData).toBe(false);

    // Any other answer is a panel with something in it.
    expect(ventureOnboarding(venture({ budget: 0 })).hasDashboardData).toBe(true);
    expect(ventureOnboarding(venture({ plan: "buy a pallet" })).hasDashboardData).toBe(true);
    expect(
      ventureOnboarding(venture(), { hasNextStep: true }).hasDashboardData
    ).toBe(true);
    expect(
      ventureOnboarding(venture({ meta: { [STAGE_CONFIRMED_KEY]: true } }))
        .hasDashboardData
    ).toBe(true);
    // And a division with nothing at all certainly has none.
    expect(ventureOnboarding(venture()).hasDashboardData).toBe(false);
  });

  it("does not count a blank one-liner or a whitespace plan", () => {
    const o = ventureOnboarding(venture({ one_liner: "", plan: "   " }));
    expect(o.missing).toContain("one_liner");
    expect(o.missing).toContain("plan");
    expect(o.untouched).toBe(true);
  });

  /**
   * The stage is the one question the database cannot tell has been
   * answered: `ventures.stage` is NOT NULL and defaults to 'idea', so every
   * division already has one. Confirming it is what turns a default into a
   * decision.
   */
  it("separates a stage he chose from a stage the database defaulted", () => {
    expect(stageConfirmed({})).toBe(false);
    expect(stageConfirmed(null)).toBe(false);
    expect(stageConfirmed({ [STAGE_CONFIRMED_KEY]: "yes" })).toBe(false);
    expect(stageConfirmed({ [STAGE_CONFIRMED_KEY]: true })).toBe(true);

    expect(ventureOnboarding(venture({ stage: "launch" })).missing).toContain("stage");
    expect(
      ventureOnboarding(
        venture({ stage: "launch", meta: { [STAGE_CONFIRMED_KEY]: true } })
      ).answered
    ).toContain("stage");
  });

  it("only counts the next step once a task actually exists", () => {
    expect(ventureOnboarding(venture(), { hasNextStep: false }).missing).toContain(
      "next_step"
    );
    expect(ventureOnboarding(venture(), { hasNextStep: true }).answered).toContain(
      "next_step"
    );
  });

  it("reads the stamp without ever trusting it for completeness", () => {
    // The stamp records WHEN, not WHETHER. A division whose one-liner was
    // later cleared drops back out of the count rather than staying
    // "onboarded" on the strength of an old flag.
    const stamped = answered({
      one_liner: null,
      meta: {
        [STAGE_CONFIRMED_KEY]: true,
        [ONBOARDED_AT_KEY]: "2026-08-06T10:00:00.000Z",
      },
    });
    const o = ventureOnboarding(stamped, { hasNextStep: true });
    expect(o.onboardedAt).toBe("2026-08-06T10:00:00.000Z");
    expect(o.complete).toBe(false);
    expect(o.missing).toEqual(["one_liner"]);
  });

  it("survives a meta column holding something unexpected", () => {
    expect(readOnboardedAt(null)).toBeNull();
    expect(readOnboardedAt({})).toBeNull();
    expect(readOnboardedAt({ [ONBOARDED_AT_KEY]: 20260806 })).toBeNull();
    expect(readOnboardedAt({ [ONBOARDED_AT_KEY]: "  " })).toBeNull();
  });
});

/* ================================================================== *
 * "6 of 17 divisions onboarded"
 * ================================================================== */

describe("onboardingProgress", () => {
  const roster = () => [
    answered({ id: "1" }),
    answered({ id: "2" }),
    venture({ id: "3", one_liner: "half-answered" }),
    venture({ id: "4" }),
    venture({ id: "mf", name: "MAINFRAME", external_system: "MAINFRAME" }),
  ];

  it("counts out of the divisions he actually owns", () => {
    const p = onboardingProgress(roster(), new Set(["1", "2"]));
    // Four divisions, not five: MAINFRAME is a pointer, and counting it as
    // outstanding would leave the number permanently wrong by one.
    expect(p.total).toBe(4);
    expect(p.done).toBe(2);
    expect(p.started).toBe(1);
    expect(p.percent).toBe(50);
  });

  it("does not count a division as done just because it has a next step", () => {
    const p = onboardingProgress(roster(), new Set(["1", "2", "3", "4"]));
    expect(p.done).toBe(2);
    expect(p.started).toBe(2);
  });

  it("reads zero of zero without dividing by it", () => {
    const p = onboardingProgress([]);
    expect(p).toEqual({ done: 0, total: 0, started: 0, percent: 0 });
  });
});

describe("nextToOnboard", () => {
  it("offers the half-finished ones first, then live before shelved", () => {
    const list = [
      venture({ id: "untouched-live" }),
      venture({ id: "shelved-started", status: "backlog", one_liner: "x" }),
      venture({ id: "started", one_liner: "x", budget: 5 }),
      answered({ id: "done" }),
      venture({ id: "mf", name: "MAINFRAME", external_system: "MAINFRAME" }),
    ];
    const order = nextToOnboard(list, new Set(["done"])).map((v) => v.id);
    // Finishing one is cheaper than starting one, so started come first —
    // and a live division is asked about before a parked idea.
    expect(order).toEqual(["started", "shelved-started", "untouched-live"]);
    expect(order).not.toContain("done");
    expect(order).not.toContain("mf");
  });
});

/* ================================================================== *
 * The next step — one task, hung off the division honestly
 * ================================================================== */

describe("the next step becomes a real task", () => {
  const projects = [
    { id: "p1", venture_id: "v1", meta: { role: NEXT_STEP_ROLE } },
    { id: "p2", venture_id: "v1", meta: {} },
    { id: "p3", venture_id: "v2", meta: { role: NEXT_STEP_ROLE } },
    { id: "p4", venture_id: null, meta: { role: NEXT_STEP_ROLE } },
  ];

  it("finds the division's own next-steps project and nobody else's", () => {
    expect(findNextStepProject(projects, "v1")?.id).toBe("p1");
    expect(findNextStepProject(projects, "v2")?.id).toBe("p3");
    expect(findNextStepProject(projects, "v3")).toBeNull();
  });

  it("matches on the role rather than the title, so a rename cannot orphan it", () => {
    // Titles get edited. If the match were on the title, editing one would
    // silently create a second next-steps project on the next answer.
    const renamed = [{ id: "p9", venture_id: "v1", meta: { role: NEXT_STEP_ROLE } }];
    expect(findNextStepProject(renamed, "v1")?.id).toBe("p9");
    expect(nextStepProjectTitle("A to Z Traderz")).toBe("A to Z Traderz · next steps");
  });

  it("ignores a project with no meta at all", () => {
    expect(findNextStepProject([{ id: "x", venture_id: "v1" }], "v1")).toBeNull();
  });

  it("counts an open task as a next step and a finished one as not", () => {
    const ps = [{ id: "p1", venture_id: "v1" }];
    expect(
      venturesWithNextStep(ps, [{ project_id: "p1", status: "open" }])
    ).toEqual(new Set(["v1"]));
    expect(
      venturesWithNextStep(ps, [{ project_id: "p1", status: "doing" }])
    ).toEqual(new Set(["v1"]));
    // A step already taken is not a next step — the question asks again.
    expect(
      venturesWithNextStep(ps, [{ project_id: "p1", status: "done" }]).size
    ).toBe(0);
    expect(
      venturesWithNextStep(ps, [{ project_id: null, status: "open" }]).size
    ).toBe(0);
  });
});

describe("what belongs to a division", () => {
  const projects = [
    { id: "p1", venture_id: "v1", goal_id: "g1" },
    { id: "p2", venture_id: "v1", goal_id: null },
    { id: "p3", venture_id: "v2", goal_id: "g2" },
  ];
  const tasks = [
    { id: "t1", project_id: "p1", status: "open" },
    { id: "t2", project_id: "p3", status: "open" },
    { id: "t3", project_id: null, status: "open" },
  ];
  const goals = [{ id: "g1" }, { id: "g2" }, { id: "g3" }];

  it("gathers its projects, its tasks and the goals it serves", () => {
    expect(ventureProjects(projects, "v1").map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(ventureTasks(projects, tasks, "v1").map((t) => t.id)).toEqual(["t1"]);
    expect(ventureGoals(projects, goals, "v1").map((g) => g.id)).toEqual(["g1"]);
  });

  it("leaves a loose task alone rather than guessing whose it is", () => {
    expect(ventureTasks(projects, tasks, "v2").map((t) => t.id)).toEqual(["t2"]);
    expect(ventureTasks([], tasks, "v1")).toEqual([]);
  });
});

/* ================================================================== *
 * Budget against spend — the case that must not read as failure
 * ================================================================== */

describe("budgetVsSpend", () => {
  it("says nothing at all when neither side is known", () => {
    const r = budgetVsSpend(null, null);
    expect(r.state).toBe("unknown");
    expect(r.percent).toBeNull();
    expect(r.remaining).toBeNull();
    expect(r.over).toBe(false);
  });

  /**
   * The one the brief calls out by name. Money has gone into something
   * nobody budgeted for. That is a missing figure, not an overspend, and a
   * system that shouted "over budget" here would be inventing a failure out
   * of a blank field.
   */
  it("never reads a null budget with real spend as an overspend", () => {
    const r = budgetVsSpend(null, 4200);
    expect(r.state).toBe("unbudgeted");
    expect(r.over).toBe(false);
    expect(r.budget).toBeNull();
    expect(r.spent).toBe(4200);
    expect(r.remaining).toBeNull();
    expect(r.percent).toBeNull();
  });

  it("holds a budget open when nothing has been spent yet", () => {
    const r = budgetVsSpend(1500, null);
    expect(r.state).toBe("unspent");
    expect(r.over).toBe(false);
    // Not "0% used" — nothing is recorded, which is not the same as nothing spent.
    expect(r.percent).toBeNull();
    expect(r.remaining).toBeNull();
  });

  it("does the arithmetic once both sides are real", () => {
    const under = budgetVsSpend(1000, 250);
    expect(under.state).toBe("under");
    expect(under.remaining).toBe(750);
    expect(under.percent).toBe(25);
    expect(under.over).toBe(false);

    const over = budgetVsSpend(1000, 1250);
    expect(over.state).toBe("over");
    expect(over.remaining).toBe(-250);
    expect(over.percent).toBe(125);
    expect(over.over).toBe(true);
  });

  it("treats spending exactly the budget as under, not over", () => {
    const r = budgetVsSpend(500, 500);
    expect(r.over).toBe(false);
    expect(r.state).toBe("under");
    expect(r.remaining).toBe(0);
    expect(r.percent).toBe(100);
  });

  it("never divides by a zero budget", () => {
    expect(budgetVsSpend(0, 0).percent).toBe(0);
    expect(budgetVsSpend(0, 0).state).toBe("under");
    const spent = budgetVsSpend(0, 40);
    expect(spent.percent).toBe(100);
    expect(Number.isFinite(spent.percent!)).toBe(true);
    expect(spent.over).toBe(true);
  });

  it("reads numeric strings from the database the same way", () => {
    expect(budgetVsSpend("1000", "250").percent).toBe(25);
  });
});

describe("spendByVenture", () => {
  it("sums what is recorded and stays silent about what is not", () => {
    const spend = spendByVenture([
      { venture_id: "v1", value: 1000 },
      { venture_id: "v1", value: 250 },
      { venture_id: "v2", value: null },
      { venture_id: null, value: 900 },
    ]);
    expect(spend["v1"]).toBe(1250);
    // A division with an asset of unknown value has no spend figure, not
    // a spend of zero — the same £— rule the debts screen holds.
    expect(spend["v2"]).toBeUndefined();
    expect(spend["v3"]).toBeUndefined();
    expect(Object.keys(spend)).toEqual(["v1"]);
  });
});

describe("runningCostTotal", () => {
  it("totals only the answers and says how many are missing", () => {
    const r = runningCostTotal([
      venture({ id: "1", monthly_cost: 100 }),
      venture({ id: "2", monthly_cost: 50 }),
      venture({ id: "3" }),
      venture({ id: "mf", external_system: "MAINFRAME", monthly_cost: 9999 }),
    ]);
    expect(r.known).toBe(150);
    expect(r.knownCount).toBe(2);
    expect(r.unknownCount).toBe(1);
  });

  it("returns a dash rather than a zero when nothing has been answered", () => {
    expect(runningCostTotal([venture(), venture()]).known).toBeNull();
  });
});

/* ================================================================== *
 * The graphs — and what they refuse to draw
 * ================================================================== */

describe("the path to revenue", () => {
  it("puts idea at the start line and revenue at the end", () => {
    expect(stagePosition("idea")).toBe(0);
    expect(stagePosition("revenue")).toBe(VENTURE_STAGES.length - 1);
    expect(stagePathPercent("idea")).toBe(0);
    expect(stagePathPercent("revenue")).toBe(100);
    expect(stagePathPercent("stabilise")).toBe(50);
  });

  it("never leaves a stage without a meaning to show beside it", () => {
    // The stage question exists so he chooses knowingly. A stage with no
    // explanation is a stage picked from a dropdown.
    for (const s of VENTURE_STAGES) {
      expect(STAGE_MEANING[s]?.trim().length ?? 0).toBeGreaterThan(20);
    }
  });
});

describe("taskMix", () => {
  it("refuses to call an empty division nought percent done", () => {
    const m = taskMix([]);
    expect(m.total).toBe(0);
    // Zero percent complete would be a judgement about work that does not
    // exist. Null says there is nothing to judge.
    expect(m.donePercent).toBeNull();
  });

  it("counts the lanes and the share finished", () => {
    const m = taskMix([
      { status: "open" },
      { status: "open" },
      { status: "doing" },
      { status: "done" },
    ]);
    expect(m).toMatchObject({ open: 2, doing: 1, done: 1, total: 4, donePercent: 25 });
  });

  it("leaves dropped and waiting out of the lanes but inside the total", () => {
    const m = taskMix([{ status: "dropped" }, { status: "waiting" }]);
    expect(m.open + m.doing + m.done).toBe(0);
    expect(m.total).toBe(2);
    expect(m.donePercent).toBe(0);
  });
});

/* ================================================================== *
 * Reaching a division's page
 * ================================================================== */

describe("resolveVenture", () => {
  const list = [
    venture({ id: "11111111-1111-1111-1111-111111111111", name: "A to Z Traderz" }),
    venture({ id: "22222222-2222-2222-2222-222222222222", name: "Resin & Epoxy" }),
    venture({ id: "mf", name: "MAINFRAME", external_system: "MAINFRAME" }),
  ];

  it("answers to the uuid and to the slug", () => {
    expect(resolveVenture(list, "11111111-1111-1111-1111-111111111111")?.name).toBe(
      "A to Z Traderz"
    );
    expect(resolveVenture(list, "a-to-z-traderz")?.name).toBe("A to Z Traderz");
    expect(resolveVenture(list, "resin-and-epoxy")?.name).toBe("Resin & Epoxy");
  });

  it("is not case sensitive and is not confused by whitespace", () => {
    expect(resolveVenture(list, "  A-TO-Z-TRADERZ ")?.name).toBe("A to Z Traderz");
    expect(resolveVenture(list, "")).toBeNull();
    expect(resolveVenture(list, "   ")).toBeNull();
  });

  it("404s an unknown division rather than guessing at one", () => {
    expect(resolveVenture(list, "coffee-shop")).toBeNull();
    expect(resolveVenture([], "anything")).toBeNull();
  });

  /**
   * The regression that actually happened once: the branch map was keyed by
   * hand, "A to Z Trailerz" was renamed, and the link silently stopped
   * resolving. One slug rule, used by the shelf and by the page, is what
   * stops it happening again.
   */
  it("uses exactly the same slug rule as the reference shelves", () => {
    for (const name of DIVISION_NAMES) {
      expect(slugifyName(name)).toBe(ventureSlug(name));
      expect(divisionHref(name)).toBe(`/empire/${slugifyName(name)}`);
      expect(BUILT_BRANCHES[ventureSlug(name)]?.href).toBe(divisionHref(name));
    }
    expect(slugifyName("Resin & Epoxy")).toBe("resin-and-epoxy");
    expect(slugifyName("Charity (India)")).toBe("charity-india");
    expect(slugifyName("  Spaced  Out  ")).toBe("spaced-out");
  });

  it("moves a division's page with it when it is renamed", () => {
    const renamed = [venture({ id: "x", name: "A to Z Traderz Ltd" })];
    expect(resolveVenture(renamed, "a-to-z-traderz-ltd")?.id).toBe("x");
    // And the uuid keeps every link already written down working.
    expect(resolveVenture(renamed, "x")?.id).toBe("x");
  });
});

/* ================================================================== *
 * The researched profiles — validated, never trusted
 * ================================================================== */

describe("readVentureProfile", () => {
  it("reads the seeded property profile whole", () => {
    const p = readVentureProfile(PROPERTY_PROFILE);
    expect(p.regulator).toBe("Rent Smart Wales");
    expect(p.critical).toContain("CANNOT serve a valid notice");
    expect(p.councilTaxWarning).toContain("300%");
    expect(p.firstSteps).toHaveLength(1);
    expect(p.sources).toHaveLength(2);
    expect(p.any).toBe(true);
  });

  it("reads the seeded CIS profile whole", () => {
    const p = readVentureProfile(CIS_PROFILE);
    expect(p.regulator).toContain("Construction Industry Scheme");
    expect(p.money).toContain("30%");
    expect(p.alsoConsider).toHaveLength(2);
    expect(p.any).toBe(true);
  });

  it("says plainly when there is no research at all", () => {
    expect(readVentureProfile({}).any).toBe(false);
    expect(readVentureProfile(null).any).toBe(false);
    expect(readVentureProfile(undefined).any).toBe(false);
  });

  /**
   * `profile` is jsonb, so it is free-form. A page he opened to check a
   * legal duty must not blank because a key holds a string where an array
   * was expected — the same discipline `jayMarks` and `readHours` hold.
   */
  it("discards anything of the wrong shape instead of throwing", () => {
    const p = readVentureProfile({
      regulator: 42,
      duty: "",
      first_steps: "not a list",
      also_consider: [1, 2, "kept"],
      sources: ["http://insecure.example", "https://secure.example", 7],
    });
    expect(p.regulator).toBeNull();
    expect(p.duty).toBeNull();
    expect(p.firstSteps).toEqual([]);
    expect(p.alsoConsider).toEqual(["kept"]);
    // A source that is not https does not go on a page as a source.
    expect(p.sources).toEqual(["https://secure.example"]);
  });

  it("survives a profile that is not an object at all", () => {
    expect(() => readVentureProfile("nonsense")).not.toThrow();
    expect(() => readVentureProfile([1, 2, 3])).not.toThrow();
    expect(readVentureProfile("nonsense").any).toBe(false);
  });
});

describe("which questions a division earns", () => {
  it("derives the question set from the regulator, not from a list of names", () => {
    // So a fifth property researched tomorrow gets the property questions
    // without anyone editing a file.
    expect(complianceKind(PROPERTY_PROFILE)).toBe("property");
    expect(complianceKind(CIS_PROFILE)).toBe("cis");
    expect(complianceKind({})).toBeNull();
    expect(complianceKind(null)).toBeNull();
  });

  it("asks the properties two questions and the builder one", () => {
    expect(complianceQuestions(PROPERTY_PROFILE).map((q) => q.key)).toEqual([
      "rent_smart_wales",
      "empty_status",
    ]);
    expect(complianceQuestions(CIS_PROFILE).map((q) => q.key)).toEqual([
      "cis_registered",
    ]);
    // The other thirteen divisions get no compliance step at all.
    expect(complianceQuestions({})).toEqual([]);
  });

  it("states the reason beside every question", () => {
    for (const set of Object.values(COMPLIANCE_QUESTIONS)) {
      for (const q of set) {
        expect(q.because.length, `${q.key} needs a reason`).toBeGreaterThan(60);
        expect(q.options.some((o) => o.concern), `${q.key} needs a concern`).toBe(true);
        expect(
          q.options.some((o) => !o.concern),
          `${q.key} needs an answer that is fine`
        ).toBe(true);
      }
    }
  });

  it("puts the 300% premium and the 20-vs-30 point where they are asked", () => {
    const [, empty] = COMPLIANCE_QUESTIONS.property;
    expect(empty.because).toContain("300%");
    expect(empty.because).toContain("12 months");
    expect(COMPLIANCE_QUESTIONS.cis[0].because).toContain("30%");
    expect(COMPLIANCE_QUESTIONS.cis[0].because).toContain("20%");
  });
});

describe("his answers", () => {
  const q = COMPLIANCE_QUESTIONS.property[0];

  it("validates what comes out of meta", () => {
    expect(readComplianceAnswers(null)).toEqual({});
    expect(readComplianceAnswers({ [COMPLIANCE_KEY]: "no" })).toEqual({});
    expect(readComplianceAnswers({ [COMPLIANCE_KEY]: ["no"] })).toEqual({});
    expect(
      readComplianceAnswers({
        [COMPLIANCE_KEY]: { rent_smart_wales: "no", bad: 7, blank: "  " },
      })
    ).toEqual({ rent_smart_wales: "no" });
  });

  it("knows which answers should reach him and which should not", () => {
    expect(isConcerningAnswer(q, "yes")).toBe(false);
    expect(isConcerningAnswer(q, "no")).toBe(true);
    expect(isConcerningAnswer(q, "unsure")).toBe(true);
    // An unanswered question is not a concern. It is an unanswered question.
    expect(isConcerningAnswer(q, null)).toBe(false);
    expect(isConcerningAnswer(q, undefined)).toBe(false);
    expect(isConcerningAnswer(q, "something else entirely")).toBe(false);
  });

  it("treats an empty property under twelve months as worth flagging", () => {
    const empty = COMPLIANCE_QUESTIONS.property[1];
    expect(isConcerningAnswer(empty, "occupied")).toBe(false);
    // The exemption clock is running: that is exactly when it is worth
    // knowing, not after the premium lands.
    expect(isConcerningAnswer(empty, "under_12")).toBe(true);
    expect(isConcerningAnswer(empty, "over_12")).toBe(true);
    expect(isConcerningAnswer(empty, "unsure")).toBe(true);
  });

  it("writes one stable inbox line per answer, so it can be de-duplicated", () => {
    const a = complianceInboxText("Kathleen St", q, "no");
    const b = complianceInboxText("Kathleen St", q, "no");
    expect(a).toBe(b);
    expect(a).toContain("Kathleen St");
    expect(a).toContain("Confirm Rent Smart Wales registration");
    // Two different divisions must not collide on one inbox row.
    expect(complianceInboxText("Bedlinog House", q, "no")).not.toBe(a);
    // Nor two different answers to the same question.
    expect(complianceInboxText("Kathleen St", q, "unsure")).not.toBe(a);
  });

  it("lists only the concerns that are outstanding", () => {
    const clean = complianceConcerns(PROPERTY_PROFILE, {
      [COMPLIANCE_KEY]: { rent_smart_wales: "yes", empty_status: "occupied" },
    });
    expect(clean).toEqual([]);

    const flagged = complianceConcerns(PROPERTY_PROFILE, {
      [COMPLIANCE_KEY]: { rent_smart_wales: "no", empty_status: "occupied" },
    });
    expect(flagged).toHaveLength(1);
    expect(flagged[0].question.key).toBe("rent_smart_wales");

    // Unanswered is not concerning — nothing has been claimed either way.
    expect(complianceConcerns(PROPERTY_PROFILE, {})).toEqual([]);
    expect(complianceConcerns({}, {})).toEqual([]);
  });
});

/* ================================================================== *
 * The registries themselves
 * ================================================================== */

describe("the questionnaire registry", () => {
  it("asks seven questions, each of them once", () => {
    expect(ONBOARD_STEPS).toHaveLength(7);
    const keys = ONBOARD_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tells him what skipping each one costs", () => {
    // Nothing is required, so every question has to earn its answer by
    // saying what the dashboard cannot show without it.
    for (const s of ONBOARD_STEPS) {
      expect(s.question.trim().endsWith("?") || s.key === "plan").toBe(true);
      expect(s.hint.trim().length).toBeGreaterThan(20);
      expect(s.skipped.trim().length).toBeGreaterThan(20);
    }
  });

  it("suggests funding routes without inventing a 'not decided' one", () => {
    expect(FUNDING_ROUTES).toContain("Angel investors / AS Ltd unit");
    expect(new Set(FUNDING_ROUTES).size).toBe(FUNDING_ROUTES.length);
    // Skipping is how "not decided" is said. An option for it would write a
    // string where NULL is the honest value.
    for (const r of FUNDING_ROUTES) {
      expect(r.toLowerCase()).not.toContain("not decided");
      expect(r.toLowerCase()).not.toContain("unknown");
    }
  });
});

describe("the division registry", () => {
  it("holds the seventeen divisions and not the pointer row", () => {
    expect(DIVISION_NAMES).toHaveLength(17);
    expect(DIVISION_NAMES).not.toContain("MAINFRAME");
    expect(new Set(DIVISION_NAMES).size).toBe(17);
  });

  it("gives every division a unique slug", () => {
    const slugs = DIVISION_NAMES.map(slugifyName);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });
});
