import { describe, expect, it } from "vitest";
import {
  AREA_DEFS,
  areaUnlocked,
  areasFor,
  groupOf,
  lockedLine,
  readLegal,
  readTier,
  readType,
  UNSORTED,
} from "../src/lib/venture/types";
import {
  DIMENSIONS,
  compareRag,
  daysBetween,
  irlLabel,
  portfolioLine,
  tierFromIrl,
  ventureRag,
  ventureScore,
} from "../src/lib/venture/scoring";
import {
  COMPLIANCE_RULES,
  KPI_CAP,
  KPI_TEMPLATES,
  PLAN_SECTIONS,
  checklistGaps,
  generateChecklist,
  planProgress,
} from "../src/lib/venture/templates";
import {
  type ChecklistItem,
  checklistLine,
  checklistProgress,
  nextObligation,
  nextObligationDays,
  obligationsOverdue,
  sortChecklist,
} from "../src/lib/venture/checklist";
import {
  DORMANCY_SILENCE_DAYS,
  PEER_FLOOR,
  proposeDormancy,
  proposeKpiSeed,
  proposePeerGap,
  proposeTierDisagreement,
} from "../src/lib/venture/proposals";
import { onePageSummary, summaryText } from "../src/lib/venture/summary";
import { type VentureModuleRow } from "../src/lib/venture/types";

const venture = (over: Partial<VentureModuleRow> = {}): VentureModuleRow => ({
  id: "v1",
  name: "A to Z Traderz",
  status: "active",
  stage: "launch",
  one_liner: null,
  created_at: "2026-01-01T00:00:00Z",
  venture_group: null,
  tier: null,
  irl: null,
  venture_type: null,
  legal_structure: null,
  employs_people: null,
  turnover_band: null,
  vat_registered: null,
  last_touched_at: null,
  dormant_since: null,
  kill_criteria: null,
  ...over,
});

const item = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id: "c1",
  rule_key: "gas-safety-certificate",
  title: "Gas safety check and certificate",
  category: "property",
  obligation: true,
  due_date: null,
  cadence: "annual",
  done: false,
  done_on: null,
  guidance_url: null,
  note: null,
  ...over,
});

/* ── a venture only earns the fields it can fill ──────────────────── */

describe("area unlocking", () => {
  it("gives an idea ONE card, not five disabled ones", () => {
    const areas = areasFor("idea");
    expect(areas.map((a) => a.key)).toEqual(["checklist"]);
  });

  it("opens the working areas once it is being validated", () => {
    expect(areasFor("validating").map((a) => a.key)).toEqual([
      "checklist",
      "tasks",
      "summary",
      "plan",
    ]);
  });

  it("gives an active venture all five", () => {
    expect(areasFor("active")).toHaveLength(5);
  });

  it("keeps a dormant venture's obligations and paperwork, and drops its next move", () => {
    expect(areaUnlocked("checklist", "dormant")).toBe(true);
    expect(areaUnlocked("documents", "dormant")).toBe(true);
    expect(areaUnlocked("plan", "dormant")).toBe(true);
    expect(areaUnlocked("tasks", "dormant")).toBe(false);
    expect(areaUnlocked("summary", "dormant")).toBe(false);
  });

  it("treats an unsorted venture as an idea — the floor, never the ceiling", () => {
    expect(areasFor(null).map((a) => a.key)).toEqual(["checklist"]);
  });

  it("says what is locked in one line, and nothing at all when nothing is", () => {
    expect(lockedLine("idea")).toContain("task list");
    expect(lockedLine("active")).toBeNull();
  });

  it("gives every area a question — nothing gets a card without one", () => {
    for (const a of Object.values(AREA_DEFS)) {
      expect(a.question.trim().length).toBeGreaterThan(0);
      expect(a.question.endsWith("?")).toBe(true);
    }
  });

  it("the checklist is unlocked at every tier, because an obligation does not wait", () => {
    for (const t of ["idea", "validating", "active", "dormant"] as const) {
      expect(areaUnlocked("checklist", t)).toBe(true);
    }
  });
});

describe("reading free text back out of the database", () => {
  it("refuses a tier, type or structure it does not recognise", () => {
    expect(readTier("widget")).toBeNull();
    expect(readType("widget")).toBeNull();
    expect(readLegal("widget")).toBeNull();
    expect(readTier("active")).toBe("active");
  });

  it("puts an unsorted venture in a named bucket, never a guessed one", () => {
    expect(groupOf(venture())).toBe(UNSORTED);
    expect(groupOf(venture({ venture_group: "  " }))).toBe(UNSORTED);
    expect(groupOf(venture({ venture_group: "Property" }))).toBe("Property");
  });
});

/* ── the eight-dimension score ────────────────────────────────────── */

describe("ventureScore", () => {
  const all = (v: number) => Object.fromEntries(DIMENSIONS.map((d) => [d, v]));

  it("scores all eight at 5 as 100", () => {
    expect(ventureScore(all(5)).score).toBe(100);
  });

  it("scores all eight at 1 as 0 — and 0 is a score, not an absence", () => {
    const s = ventureScore(all(1));
    expect(s.score).toBe(0);
    expect(s.answered).toBe(8);
  });

  it("excludes a skipped dimension rather than imputing a middling three", () => {
    const s = ventureScore({ demand: 5, economics: 5 });
    expect(s.score).toBe(100);
    expect(s.basis).toBe("2 of 8 dimensions");
  });

  it("returns null and says so when nothing has been scored", () => {
    const s = ventureScore({});
    expect(s.score).toBeNull();
    expect(s.basis).toBe("not scored yet");
  });

  it("discards a value outside 1–5 instead of clamping it into a claim", () => {
    expect(ventureScore({ demand: 9 }).score).toBeNull();
    expect(ventureScore({ demand: 0 }).answered).toBe(0);
  });

  it("names the weakest and strongest, which is the actionable half", () => {
    const s = ventureScore({ demand: 5, economics: 2, capital: 4 });
    expect(s.weakest).toBe("economics");
    expect(s.strongest).toBe("demand");
  });
});

describe("IRL", () => {
  it("labels a rung and refuses one that does not exist", () => {
    expect(irlLabel(5)).toBe("5 · Sold once");
    expect(irlLabel(null)).toBeNull();
    expect(irlLabel(12)).toBeNull();
  });

  it("derives a tier for comparison only", () => {
    expect(tierFromIrl(2)).toBe("idea");
    expect(tierFromIrl(5)).toBe("validating");
    expect(tierFromIrl(8)).toBe("active");
    expect(tierFromIrl(null)).toBeNull();
  });
});

/* ── RAG against stage-appropriate expectation ────────────────────── */

describe("ventureRag", () => {
  const today = "2026-08-19";

  it("counts days between two ISO dates", () => {
    expect(daysBetween("2026-08-01", "2026-08-19")).toBe(18);
    expect(daysBetween("2026-08-19", "2026-08-01")).toBe(-18);
  });

  it("is GREEN for an idea touched today, and red only after 90 days", () => {
    expect(ventureRag({ tier: "idea", lastTouched: today, today }).rag).toBe("green");
    expect(ventureRag({ tier: "idea", lastTouched: "2026-01-31", today }).rag).toBe("red");
  });

  it("does not punish an idea for earning nothing — 44 days is still green", () => {
    expect(ventureRag({ tier: "idea", lastTouched: "2026-07-06", today }).rag).toBe("green");
  });

  it("holds an active venture to its KPI reading, not to being opened", () => {
    expect(
      ventureRag({ tier: "active", lastTouched: today, lastReading: null, today }).rag
    ).toBe("amber");
    expect(
      ventureRag({ tier: "active", lastTouched: today, lastReading: "2026-08-16", today }).rag
    ).toBe("green");
    expect(
      ventureRag({ tier: "active", lastTouched: today, lastReading: "2026-07-01", today }).rag
    ).toBe("red");
  });

  it("makes an overdue statutory obligation RED at every tier", () => {
    for (const tier of ["idea", "validating", "active", "dormant"] as const) {
      const r = ventureRag({
        tier,
        lastTouched: today,
        lastReading: today,
        nextObligationDays: -3,
        today,
      });
      expect(r.rag).toBe("red");
      expect(r.reason).toContain("overdue");
    }
  });

  it("leaves a dormant venture green, and ambers it only for a date the world holds it to", () => {
    expect(ventureRag({ tier: "dormant", lastTouched: "2020-01-01", today }).rag).toBe("green");
    expect(
      ventureRag({ tier: "dormant", lastTouched: "2020-01-01", nextObligationDays: 12, today }).rag
    ).toBe("amber");
  });

  it("ambers a venture nothing has ever been recorded against", () => {
    const r = ventureRag({ tier: "validating", lastTouched: null, today });
    expect(r.rag).toBe("amber");
    expect(r.days).toBeNull();
  });

  it("sorts worst first, and unmeasured above merely slow", () => {
    const rows = [
      { name: "Green", rag: ventureRag({ tier: "idea", lastTouched: today, today }) },
      { name: "Slow", rag: ventureRag({ tier: "idea", lastTouched: "2026-07-01", today }) },
      { name: "Never", rag: ventureRag({ tier: "idea", lastTouched: null, today }) },
    ];
    expect([...rows].sort(compareRag).map((r) => r.name)).toEqual(["Never", "Slow", "Green"]);
  });

  it("counts rather than scolds", () => {
    expect(portfolioLine(["green", "green"])).toContain("all inside their own tolerance");
    expect(portfolioLine(["red", "amber", "green"])).toBe("3 ventures · 1 need you · 1 slipping.");
    expect(portfolioLine([])).toBe("No ventures.");
  });
});

/* ── the checklist ────────────────────────────────────────────────── */

describe("generateChecklist", () => {
  const facts = {
    type: "property" as const,
    legal: "sole_trader" as const,
    employsPeople: false,
    vatRegistered: false,
  };

  it("is deterministic — the same facts produce the same list, byte for byte", () => {
    expect(generateChecklist(facts)).toEqual(generateChecklist(facts));
  });

  it("gives a Welsh landlord registration AND licence, because they are separate", () => {
    const keys = generateChecklist(facts).map((r) => r.rule_key);
    expect(keys).toContain("rsw-registration");
    expect(keys).toContain("rsw-licence");
  });

  it("asks a company for accounts and a confirmation statement, and a sole trader for neither", () => {
    const company = generateChecklist({ ...facts, legal: "ltd" }).map((r) => r.rule_key);
    expect(company).toContain("annual-accounts");
    expect(company).toContain("confirmation-statement");
    expect(company).not.toContain("hmrc-register-self-employed");

    const sole = generateChecklist(facts).map((r) => r.rule_key);
    expect(sole).not.toContain("annual-accounts");
    expect(sole).toContain("self-assessment-return");
  });

  it("only asks for employers' liability once somebody is employed", () => {
    expect(generateChecklist(facts).map((r) => r.rule_key)).not.toContain(
      "employers-liability-insurance"
    );
    expect(
      generateChecklist({ ...facts, employsPeople: true }).map((r) => r.rule_key)
    ).toContain("employers-liability-insurance");
  });

  it("watches the VAT threshold until registered, then asks for the return instead", () => {
    expect(generateChecklist(facts).map((r) => r.rule_key)).toContain("vat-threshold-watch");
    const reg = generateChecklist({ ...facts, vatRegistered: true }).map((r) => r.rule_key);
    expect(reg).toContain("vat-return");
    expect(reg).not.toContain("vat-threshold-watch");
  });

  it("defers the vehicle dates to the vehicles table rather than copying them", () => {
    const trade = { ...facts, type: "trade" as const };
    expect(generateChecklist(trade).map((r) => r.rule_key)).not.toContain(
      "vehicle-tax-mot-insurance"
    );
    expect(
      generateChecklist(trade, { includeDeferred: true }).map((r) => r.rule_key)
    ).toContain("vehicle-tax-mot-insurance");
  });

  it("gives every rule a GOV.UK-style source, because the thresholds move", () => {
    for (const r of COMPLIANCE_RULES) {
      expect(r.guidance_url.startsWith("https://")).toBe(true);
      expect(r.key).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("has no duplicate rule keys — the unique index depends on it", () => {
    const keys = COMPLIANCE_RULES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names what it is missing, legal structure first", () => {
    expect(checklistGaps({ ...facts, legal: null })).toContain("legal structure");
    expect(checklistGaps(facts)).toEqual([]);
  });
});

describe("reading the checklist", () => {
  const today = "2026-08-19";

  it("finds what is overdue and how long until the next thing", () => {
    const items = [
      item({ id: "a", due_date: "2026-08-01" }),
      item({ id: "b", due_date: "2026-09-01" }),
      item({ id: "c", due_date: null }),
    ];
    expect(obligationsOverdue(items, today).map((i) => i.id)).toEqual(["a"]);
    expect(nextObligation(items, today)?.id).toBe("a");
    expect(nextObligationDays(items, today)).toBe(-18);
  });

  it("returns null days when nothing is dated — which is not 'nothing is due'", () => {
    expect(nextObligationDays([item({ due_date: null })], today)).toBeNull();
  });

  it("ignores an item already done", () => {
    const done = [item({ due_date: "2026-01-01", done: true, done_on: "2026-01-01" })];
    expect(obligationsOverdue(done, today)).toEqual([]);
  });

  it("counts undated obligations separately, because nothing is watching those", () => {
    const p = checklistProgress([
      item({ id: "a", due_date: "2026-09-01" }),
      item({ id: "b", due_date: null }),
      item({ id: "c", obligation: false }),
    ]);
    expect(p).toEqual({
      total: 3,
      done: 0,
      obligations: 2,
      obligationsDone: 0,
      undated: 1,
    });
  });

  it("reads overdue first and keeps finished items on the page", () => {
    const items = [
      item({ id: "done", done: true }),
      item({ id: "later", due_date: "2026-12-01" }),
      item({ id: "overdue", due_date: "2026-01-01" }),
      item({ id: "undated" }),
    ];
    expect(sortChecklist(items, today).map((i) => i.id)).toEqual([
      "overdue",
      "later",
      "undated",
      "done",
    ]);
  });

  it("says the worst true thing on the card face", () => {
    expect(checklistLine([], today)).toBe("Nothing generated yet.");
    expect(checklistLine([item({ due_date: "2026-01-01" })], today)).toContain("1 overdue");
    expect(checklistLine([item({ due_date: "2026-08-20" })], today)).toContain("next in 1 day");
    expect(checklistLine([item({ due_date: null })], today)).toContain("1 with no date");
  });
});

/* ── KPIs and the plan ────────────────────────────────────────────── */

describe("templates", () => {
  it("offers exactly the cap, never more", () => {
    for (const list of Object.values(KPI_TEMPLATES)) {
      expect(list).toHaveLength(KPI_CAP);
    }
  });

  it("gives the plan eight sections, each of them a question", () => {
    expect(PLAN_SECTIONS).toHaveLength(8);
    for (const s of PLAN_SECTIONS) expect(s.prompt.endsWith("?")).toBe(true);
  });

  it("counts what is written rather than scoring it", () => {
    expect(planProgress({ problem: "yes", offer: "  " })).toEqual({ written: 1, total: 8 });
  });
});

/* ── propose, never push ──────────────────────────────────────────── */

describe("proposals", () => {
  const today = "2026-08-19";

  it("stays silent below three peers", () => {
    const peers = [
      { venture: venture({ id: "a", venture_group: "Property" }), has: true },
      { venture: venture({ id: "b", venture_group: "Property" }), has: false },
    ];
    expect(PEER_FLOOR).toBe(3);
    expect(proposePeerGap(peers, { key: "eicr", noun: "an EICR date" })).toEqual([]);
  });

  it("compares a venture to its own peer group, descriptively", () => {
    const peers = [
      { venture: venture({ id: "a", name: "Kathleen St", venture_group: "Property" }), has: false },
      { venture: venture({ id: "b", name: "Bedlinog", venture_group: "Property" }), has: true },
      { venture: venture({ id: "c", name: "Treharris", venture_group: "Property" }), has: true },
      { venture: venture({ id: "d", name: "Flat", venture_group: "Property" }), has: true },
    ];
    const out = proposePeerGap(peers, { key: "eicr", noun: "an EICR date" });
    expect(out).toHaveLength(1);
    expect(out[0].rationale).toBe(
      "3 of your 4 property ventures have an EICR date recorded. Kathleen St does not."
    );
    // Descriptive, never directive.
    expect(out[0].rationale).not.toMatch(/you should|you need to|book /i);
  });

  it("says nothing when the whole group lacks it — that is a decision, not a gap", () => {
    const peers = ["a", "b", "c"].map((id) => ({
      venture: venture({ id, venture_group: "Property" }),
      has: false,
    }));
    expect(proposePeerGap(peers, { key: "eicr", noun: "an EICR date" })).toEqual([]);
  });

  it("proposes dormancy after long silence and never applies it", () => {
    expect(DORMANCY_SILENCE_DAYS).toBe(120);
    const quiet = venture({ id: "q", last_touched_at: "2026-01-01T00:00:00Z" });
    const busy = venture({ id: "b", last_touched_at: "2026-08-18T00:00:00Z" });
    const out = proposeDormancy([quiet, busy], today);
    expect(out.map((p) => p.venture_id)).toEqual(["q"]);
    expect(out[0].payload.tier).toBe("dormant");
  });

  it("falls back to created_at when nothing has ever touched the venture", () => {
    const never = venture({ id: "n", last_touched_at: null, created_at: "2026-01-01T00:00:00Z" });
    expect(proposeDormancy([never], today)).toHaveLength(1);
  });

  it("notices an active venture with nothing measured", () => {
    const out = proposeKpiSeed([
      { venture: venture({ id: "a", tier: "active" }), kpiCount: 0 },
      { venture: venture({ id: "b", tier: "active" }), kpiCount: 2 },
      { venture: venture({ id: "c", tier: "idea" }), kpiCount: 0 },
    ]);
    expect(out.map((p) => p.venture_id)).toEqual(["a"]);
  });

  it("reports a stated/derived disagreement without changing either", () => {
    const v = venture({ tier: "idea", irl: 8 });
    const out = proposeTierDisagreement([v], (x) => tierFromIrl(x.irl));
    expect(out).toHaveLength(1);
    expect(out[0].payload).toEqual({ stated: "idea", derived: "active" });
    expect(proposeTierDisagreement([venture({ tier: "idea", irl: 2 })], (x) => tierFromIrl(x.irl)))
      .toEqual([]);
  });
});

/* ── the one-page summary ─────────────────────────────────────────── */

describe("onePageSummary", () => {
  const today = "2026-08-19";
  const base = {
    venture: venture({ tier: "active", one_liner: "Trailer sales and hire." }),
    plan: { problem: "Nobody local hires trailers.", offer: "Day hire from £45." },
    kpis: [
      {
        id: "k",
        name: "Revenue",
        unit: "£",
        target: 2000,
        direction: "up",
        latest: { taken_on: "2026-08-18", value: 1400 },
      },
    ],
    checklist: [item({ due_date: "2026-01-01" })],
    score: { score: 62, basis: "5 of 8 dimensions" },
    rag: { rag: "red" as const, reason: "an obligation is 230 days overdue", days: -230 },
    today,
  };

  it("assembles from rows that already exist, never invents a line", () => {
    const s = onePageSummary(base);
    expect(s.headline).toBe("Trailer sales and hire.");
    expect(s.paragraphs.map((p) => p.title)).toEqual(["The problem", "The offer"]);
    expect(s.facts.some((f) => f.value === "£1400 of £2000 · 2026-08-18")).toBe(true);
    expect(s.facts.some((f) => f.label === "Overdue")).toBe(true);
  });

  it("names what it could not say rather than padding the page", () => {
    const s = onePageSummary({
      ...base,
      venture: venture({ tier: "active" }),
      plan: {},
      kpis: [],
      checklist: [],
    });
    expect(s.paragraphs).toEqual([]);
    expect(s.missing).toEqual([
      "a one-line description",
      "any of the plan",
      "a single KPI reading",
      "a checklist",
    ]);
  });

  it("falls back to the name when there is no one-liner", () => {
    expect(onePageSummary({ ...base, venture: venture({ tier: "active" }) }).headline).toBe(
      "A to Z Traderz"
    );
  });

  it("hands you plain text, because a summary is for handing to somebody", () => {
    const text = summaryText(onePageSummary(base), "A to Z Traderz");
    expect(text.split("\n")[0]).toBe("A to Z Traderz");
    expect(text).toContain("THE PROBLEM");
  });
});

describe("the rule book", () => {
  it("holds the full set, so the count in CLAUDE.md can be checked rather than remembered", () => {
    expect(COMPLIANCE_RULES).toHaveLength(34);
  });
});
