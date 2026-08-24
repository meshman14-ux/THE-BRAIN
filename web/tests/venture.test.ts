import { describe, expect, it } from "vitest";
import {
  AREAS,
  COMPLIANCE_RULES,
  areaUnlocked,
  checklistGaps,
  checklistState,
  daysBetween,
  deriveTier,
  generateChecklist,
  lockedAreas,
  planProgress,
  PLAN_SECTIONS,
  ragFor,
  sortChecklist,
  tierFor,
  unlockedAreas,
  nextSortOrder,
  sortVentureTasks,
  taskCardLine,
  ventureTaskState,
  type VentureTaskRow,
} from "../src/lib/venture";

const T = "2026-08-19";

describe("venture · tiers", () => {
  it("a shelved venture is dormant whatever its stage — parking was a decision", () => {
    expect(deriveTier({ stage: "revenue", status: "backlog" })).toBe("dormant");
    expect(deriveTier({ stage: "idea", status: "idea" })).toBe("dormant");
  });

  it("the stage ladder maps down: idea, research→validating, rest→active", () => {
    expect(deriveTier({ stage: "idea", status: "active" })).toBe("idea");
    expect(deriveTier({ stage: "research", status: "active" })).toBe("validating");
    expect(deriveTier({ stage: "stabilise", status: "active" })).toBe("active");
    expect(deriveTier({ stage: "launch", status: "active" })).toBe("active");
    expect(deriveTier({ stage: "revenue", status: "active" })).toBe("active");
  });

  it("an explicit tier overrides the derivation, and is not flagged assumed", () => {
    const r = tierFor({ stage: "idea", status: "active", tier: "active" });
    expect(r).toEqual({ tier: "active", assumed: false });
  });

  it("a null or junk tier falls back to the derivation and says so", () => {
    expect(tierFor({ stage: "idea", status: "active", tier: null })).toEqual({
      tier: "idea",
      assumed: true,
    });
    expect(tierFor({ stage: "idea", status: "active", tier: "wizard" })).toEqual({
      tier: "idea",
      assumed: true,
    });
  });
});

describe("venture · areas", () => {
  it("an Idea earns exactly one card: the checklist", () => {
    expect(unlockedAreas("idea").map((a) => a.key)).toEqual(["checklist"]);
  });

  it("dormant is watched for obligations only", () => {
    expect(unlockedAreas("dormant").map((a) => a.key)).toEqual(["checklist"]);
  });

  it("validating adds tasks and the one-page summary", () => {
    expect(unlockedAreas("validating").map((a) => a.key)).toEqual([
      "checklist",
      "tasks",
      "summary",
    ]);
  });

  it("active earns all five", () => {
    expect(unlockedAreas("active")).toHaveLength(AREAS.length);
    expect(lockedAreas("active")).toHaveLength(0);
  });

  it("the checklist is unlocked at EVERY tier — obligations do not care about stage", () => {
    for (const t of ["idea", "validating", "active", "dormant"] as const) {
      expect(areaUnlocked("checklist", t)).toBe(true);
    }
  });

  it("locked + unlocked partition the five with no overlap", () => {
    for (const t of ["idea", "validating", "active", "dormant"] as const) {
      const u = unlockedAreas(t).map((a) => a.key);
      const l = lockedAreas(t).map((a) => a.key);
      expect([...u, ...l].sort()).toEqual(AREAS.map((a) => a.key).sort());
      expect(u.filter((k) => l.includes(k))).toHaveLength(0);
    }
  });
});

describe("venture · RAG", () => {
  it("an Idea touched today is green; untouched 200 days is red", () => {
    expect(
      ragFor({ tier: "idea", todayIso: T, lastTouchedIso: T, createdAtIso: null }).rag
    ).toBe("green");
    expect(
      ragFor({ tier: "idea", todayIso: T, lastTouchedIso: "2026-01-31", createdAtIso: null })
        .rag
    ).toBe("red");
  });

  it("thresholds tighten with tier: 40 days is green for an Idea, red for active", () => {
    const last = "2026-07-10"; // 40 days before T
    expect(ragFor({ tier: "idea", todayIso: T, lastTouchedIso: last, createdAtIso: null }).rag).toBe(
      "green"
    );
    expect(
      ragFor({ tier: "validating", todayIso: T, lastTouchedIso: last, createdAtIso: null }).rag
    ).toBe("red");
    expect(
      ragFor({ tier: "active", todayIso: T, lastTouchedIso: last, createdAtIso: null }).rag
    ).toBe("red");
  });

  it("amber opens at the documented day counts, not one early", () => {
    // idea amber at 45
    expect(
      ragFor({ tier: "idea", todayIso: T, lastTouchedIso: "2026-07-06", createdAtIso: null }).rag
    ).toBe("green"); // 44 days
    expect(
      ragFor({ tier: "idea", todayIso: T, lastTouchedIso: "2026-07-05", createdAtIso: null }).rag
    ).toBe("amber"); // 45 days
  });

  it("an overdue statutory obligation is red at EVERY tier", () => {
    for (const t of ["idea", "validating", "active", "dormant"] as const) {
      expect(
        ragFor({
          tier: t,
          todayIso: T,
          lastTouchedIso: T,
          createdAtIso: null,
          overdueObligation: true,
        }).rag
      ).toBe("red");
    }
  });

  it("dormant: amber only when an obligation is inside 30 days, else no colour", () => {
    expect(
      ragFor({
        tier: "dormant",
        todayIso: T,
        lastTouchedIso: null,
        createdAtIso: null,
        nextObligationIso: "2026-09-01",
      }).rag
    ).toBe("amber");
    expect(
      ragFor({
        tier: "dormant",
        todayIso: T,
        lastTouchedIso: null,
        createdAtIso: null,
        nextObligationIso: "2026-12-01",
      }).rag
    ).toBe("none");
    expect(
      ragFor({ tier: "dormant", todayIso: T, lastTouchedIso: null, createdAtIso: null }).rag
    ).toBe("none");
  });

  it("a never-touched venture is judged from created_at, not given a pass", () => {
    expect(
      ragFor({ tier: "idea", todayIso: T, lastTouchedIso: null, createdAtIso: "2026-01-01" }).rag
    ).toBe("red");
  });

  it("no dates at all returns none — unknown is not failing", () => {
    expect(
      ragFor({ tier: "idea", todayIso: T, lastTouchedIso: null, createdAtIso: null }).rag
    ).toBe("none");
  });

  it("daysBetween is calendar days, timezone-proof", () => {
    expect(daysBetween("2026-08-18", "2026-08-19")).toBe(1);
    expect(daysBetween("2026-08-19", "2026-08-19")).toBe(0);
  });
});

describe("venture · plan sections", () => {
  it("eight sections, all keyed uniquely", () => {
    expect(PLAN_SECTIONS).toHaveLength(8);
    expect(new Set(PLAN_SECTIONS.map((s) => s.key)).size).toBe(8);
  });

  it("progress counts only sections with a non-blank body", () => {
    const p = planProgress([
      { section: "problem", body: "A thing." },
      { section: "customer", body: "   " },
      { section: "junk", body: "not a real section" },
    ]);
    expect(p).toEqual({ filled: 1, total: 8 });
  });
});

describe("venture · checklist generation", () => {
  const facts = (over: Partial<Parameters<typeof generateChecklist>[0]["facts"]> = {}) => ({
    type: null,
    legal: null,
    employsPeople: null,
    vatRegistered: null,
    ...over,
  });
  const gen = (
    f: Parameters<typeof generateChecklist>[0]["facts"],
    existing: Set<string> = new Set()
  ) => generateChecklist({ facts: f, existingRuleKeys: existing });

  it("is deterministic: same facts, same list, same order", () => {
    const f = facts({ legal: "sole_trader", type: "property" });
    expect(gen(f)).toEqual(gen(f));
  });

  it("a null structure generates no structure-specific rules — never sole_trader by default (D6)", () => {
    const keys = gen(facts()).map((r) => r.key);
    expect(keys).not.toContain("hmrc-register-self-employed");
    expect(keys).not.toContain("self-assessment-return");
    expect(keys).not.toContain("confirmation-statement");
    // Universal rules still come — a short list that says why beats silence.
    expect(keys).toContain("keep-records-six-years");
    expect(keys).toContain("ico-data-protection-fee");
  });

  it("ltd gets Companies House and CT rules, not Self Assessment registration", () => {
    const keys = gen(facts({ legal: "ltd" })).map((r) => r.key);
    expect(keys).toContain("confirmation-statement");
    expect(keys).toContain("annual-accounts");
    expect(keys).toContain("corporation-tax-return");
    expect(keys).toContain("director-self-assessment");
    expect(keys).not.toContain("hmrc-register-self-employed");
  });

  it("not-trading-yet generates nothing at all", () => {
    expect(gen(facts({ legal: "none_yet", type: "property" }))).toHaveLength(0);
  });

  it("employment rules arrive only on an explicit yes — null is not answered", () => {
    expect(gen(facts()).map((r) => r.key)).not.toContain("paye-registration");
    const keys = gen(facts({ employsPeople: true })).map((r) => r.key);
    expect(keys).toContain("paye-registration");
    expect(keys).toContain("employers-liability-insurance");
    expect(keys).toContain("right-to-work-checks");
  });

  it("VAT: unregistered (or unanswered) watches the threshold; registered files returns", () => {
    expect(gen(facts()).map((r) => r.key)).toContain("vat-threshold-watch");
    const reg = gen(facts({ vatRegistered: true })).map((r) => r.key);
    expect(reg).toContain("vat-return");
    expect(reg).not.toContain("vat-threshold-watch");
  });

  it("property gets Rent Smart Wales registration AND licence as separate steps", () => {
    const keys = gen(facts({ type: "property" })).map((r) => r.key);
    expect(keys).toContain("rsw-registration");
    expect(keys).toContain("rsw-licence");
    expect(keys).toContain("council-tax-and-utilities");
    expect(keys).toContain("written-occupation-contract");
  });

  it("wales: false drops the Wales-only rules but keeps GB-wide property ones", () => {
    const keys = gen(facts({ type: "property", wales: false })).map((r) => r.key);
    expect(keys).not.toContain("rsw-registration");
    expect(keys).toContain("gas-safety-certificate");
    expect(keys).toContain("deposit-protection");
  });

  it("regenerating skips existing rule keys — a done item is never re-created", () => {
    const f = facts({ legal: "sole_trader", type: "property", employsPeople: true });
    const first = gen(f);
    expect(gen(f, new Set(first.map((r) => r.key)))).toHaveLength(0);
  });

  it("every rule carries an https guidance URL and a unique key", () => {
    expect(new Set(COMPLIANCE_RULES.map((r) => r.key)).size).toBe(COMPLIANCE_RULES.length);
    for (const r of COMPLIANCE_RULES) {
      expect(r.guidanceUrl.startsWith("https://")).toBe(true);
    }
  });

  it("no vehicle rules — the vehicles table already owns those dates", () => {
    for (const r of COMPLIANCE_RULES) {
      expect(r.title.toLowerCase()).not.toMatch(/\bmot\b|vehicle tax/);
    }
  });

  it("checklistGaps names exactly what is unanswered, and legal first", () => {
    expect(checklistGaps(facts())).toEqual([
      "legal structure",
      "what kind of venture this is",
      "whether it employs anyone",
      "whether it is VAT registered",
    ]);
    expect(
      checklistGaps(facts({ legal: "ltd", type: "trade", employsPeople: false, vatRegistered: false }))
    ).toEqual([]);
  });
});

describe("venture · checklist state and order", () => {
  const items = [
    { id: "a", title: "Zeta undated", due_on: null, done_at: null },
    { id: "b", title: "Done thing", due_on: "2026-01-01", done_at: "2026-01-02" },
    { id: "c", title: "Due soon", due_on: "2026-09-01", done_at: null },
    { id: "d", title: "Overdue", due_on: "2026-08-01", done_at: null },
  ];

  it("sorts open-dated first (earliest due), undated next, done last", () => {
    expect(sortChecklist(items).map((i) => i.id)).toEqual(["d", "c", "a", "b"]);
  });

  it("state counts overdue separately and names the next due date", () => {
    expect(checklistState(items, T)).toEqual({
      open: 3,
      done: 1,
      overdue: 1,
      nextDue: "2026-09-01",
    });
  });

  it("an item due today is not overdue", () => {
    const s = checklistState([{ id: "x", title: "t", due_on: T, done_at: null }], T);
    expect(s.overdue).toBe(0);
    expect(s.nextDue).toBe(T);
  });
});

/* ------------------------------------------------------------------ *
 * Area 4 · Task List
 * ------------------------------------------------------------------ */

const task = (over: Partial<VentureTaskRow> = {}): VentureTaskRow => ({
  id: Math.random().toString(36).slice(2),
  title: "t",
  status: "open",
  priority: "normal",
  due_on: null,
  do_date: null,
  sort_order: 0,
  ...over,
});

describe("venture · task list", () => {
  it("overdue sorts above everything, whatever its priority", () => {
    const late = task({ title: "late", due_on: "2026-08-01", priority: "low" });
    const urgent = task({ title: "urgent", priority: "high" });
    const order = sortVentureTasks([urgent, late], T).map((t) => t.title);
    expect(order).toEqual(["late", "urgent"]);
  });

  it("a task pulled into today sits above undated work", () => {
    const dated = task({ title: "today", do_date: T, priority: "low" });
    const loose = task({ title: "loose", priority: "high" });
    expect(sortVentureTasks([loose, dated], T).map((t) => t.title)).toEqual([
      "today",
      "loose",
    ]);
  });

  it("inside a bucket, priority then the order Jay put them in", () => {
    const a = task({ title: "a", priority: "normal", sort_order: 20 });
    const b = task({ title: "b", priority: "high", sort_order: 30 });
    const c = task({ title: "c", priority: "normal", sort_order: 10 });
    expect(sortVentureTasks([a, b, c], T).map((t) => t.title)).toEqual(["b", "c", "a"]);
  });

  it("sorting never mutates the array it was handed", () => {
    const input = [task({ title: "z", sort_order: 9 }), task({ title: "a", sort_order: 1 })];
    const before = input.map((t) => t.title);
    sortVentureTasks(input, T);
    expect(input.map((t) => t.title)).toEqual(before);
  });

  it("counts open, done, overdue and what is in today — dropped counts as neither", () => {
    const s = ventureTaskState(
      [
        task({ status: "done" }),
        task({ status: "dropped" }),
        task({ due_on: "2026-08-01" }),
        task({ do_date: T }),
        task(),
      ],
      T
    );
    expect(s).toEqual({ open: 3, done: 1, overdue: 1, today: 1, nextDue: null });
  });

  it("nextDue skips anything already overdue and takes the soonest ahead", () => {
    const s = ventureTaskState(
      [
        task({ due_on: "2026-08-01" }),
        task({ due_on: "2026-09-30" }),
        task({ due_on: "2026-08-25" }),
      ],
      T
    );
    expect(s.overdue).toBe(1);
    expect(s.nextDue).toBe("2026-08-25");
  });

  it("a task due today is not overdue", () => {
    expect(ventureTaskState([task({ due_on: T })], T).overdue).toBe(0);
  });

  it("the card line leads with overdue, and stays honest when empty", () => {
    expect(taskCardLine({ open: 0, overdue: 0, today: 0 })).toBe("no open work");
    expect(taskCardLine({ open: 3, overdue: 2, today: 1 })).toBe(
      "2 OVERDUE · 1 in today · 3 open"
    );
  });

  it("the card line still reports work stranded in the shared pool", () => {
    expect(taskCardLine({ open: 0, overdue: 0, today: 0 }, 6)).toBe("6 in shared pool");
  });

  it("a new task lands at the bottom, not in the middle", () => {
    expect(nextSortOrder([])).toBe(10);
    expect(nextSortOrder([{ sort_order: 10 }, { sort_order: 40 }])).toBe(50);
  });
});

describe("venture · CIS", () => {
  const trade = { type: "trade" as const, legal: "sole_trader" as const, employsPeople: false, vatRegistered: false };

  it("a construction venture is handed both CIS rules", () => {
    const keys = generateChecklist({ facts: trade, existingRuleKeys: new Set() }).map((r) => r.key);
    expect(keys).toContain("cis-contractor-registration");
    expect(keys).toContain("cis-monthly-return");
  });

  it("CIS fires on trade even with no employees — subcontractors are not employees", () => {
    const keys = generateChecklist({ facts: trade, existingRuleKeys: new Set() }).map((r) => r.key);
    expect(keys).toContain("cis-monthly-return");
    // and the employment rules correctly stay away
    expect(keys).not.toContain("paye-registration");
  });

  it("CIS does not reach a shop, a let or a software venture", () => {
    for (const type of ["retail", "property", "digital", "service"] as const) {
      const keys = generateChecklist({
        facts: { ...trade, type },
        existingRuleKeys: new Set(),
      }).map((r) => r.key);
      expect(keys).not.toContain("cis-contractor-registration");
    }
  });

  it("the monthly return is a statutory obligation, so it goes red the day it is late", () => {
    const rule = COMPLIANCE_RULES.find((r) => r.key === "cis-monthly-return");
    expect(rule?.obligation).toBe(true);
    expect(rule?.cadence).toBe("monthly");
  });

  it("every CIS rule carries a GOV.UK link — these are prompts, not advice", () => {
    for (const key of ["cis-contractor-registration", "cis-monthly-return"]) {
      const rule = COMPLIANCE_RULES.find((r) => r.key === key);
      expect(rule?.guidanceUrl).toMatch(/^https:\/\/www\.gov\.uk\//);
    }
  });
});
