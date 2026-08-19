import { describe, expect, it } from "vitest";
import {
  AREAS,
  COMPLIANCE_RULES,
  areaUnlocked,
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
      { section: "what", body: "A thing." },
      { section: "customer", body: "   " },
      { section: "junk", body: "not a real section" },
    ]);
    expect(p).toEqual({ filled: 1, total: 8 });
  });
});

describe("venture · checklist generation", () => {
  it("is deterministic: same facts, same list", () => {
    const args = { structure: "sole_trader" as const, group: "property", existingRuleKeys: new Set<string>() };
    expect(generateChecklist(args)).toEqual(generateChecklist(args));
  });

  it("a null structure generates ONLY universal rules — never sole_trader by default (D6)", () => {
    const rules = generateChecklist({ structure: null, group: null, existingRuleKeys: new Set() });
    expect(rules.every((r) => r.structures == null)).toBe(true);
    expect(rules.some((r) => r.key === "hmrc-register-sa")).toBe(false);
  });

  it("ltd gets Companies House rules, not Self Assessment", () => {
    const keys = generateChecklist({ structure: "ltd", group: null, existingRuleKeys: new Set() }).map(
      (r) => r.key
    );
    expect(keys).toContain("ch-confirmation-statement");
    expect(keys).toContain("ch-annual-accounts");
    expect(keys).not.toContain("hmrc-register-sa");
  });

  it("not-trading-yet generates nothing at all", () => {
    expect(
      generateChecklist({ structure: "none_yet", group: "property", existingRuleKeys: new Set() })
    ).toHaveLength(0);
  });

  it("property group gets Rent Smart Wales registration AND licence as separate steps", () => {
    const keys = generateChecklist({
      structure: "sole_trader",
      group: "property",
      existingRuleKeys: new Set(),
    }).map((r) => r.key);
    expect(keys).toContain("rsw-registration");
    expect(keys).toContain("rsw-licence");
  });

  it("regenerating skips existing rule keys — a done item is never re-created", () => {
    const first = generateChecklist({
      structure: "sole_trader",
      group: "property",
      existingRuleKeys: new Set(),
    });
    const again = generateChecklist({
      structure: "sole_trader",
      group: "property",
      existingRuleKeys: new Set(first.map((r) => r.key)),
    });
    expect(again).toHaveLength(0);
  });

  it("every rule carries a guidance URL, https, and a unique key", () => {
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
