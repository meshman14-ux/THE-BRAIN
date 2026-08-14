import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_PARENTS,
  ALL_VIEW,
  EMPIRE_PARENTS,
  LIFE_PARENTS,
  PARENT_TRUTH,
  type ParentReport,
  boardLine,
  needingAttention,
  normaliseView,
  parentById,
  parentsFor,
  rankReports,
  showsView,
  staleAfterFor,
  staleReports,
  viewHref,
} from "../src/lib/parents";
import {
  bodyReport,
  empireParentReport,
  horizonReport,
  moneyReport,
  peopleReport,
  stalenessFor,
  standingReport,
} from "../src/lib/reports";
import { STALE_AFTER, type BodyContract, type MoneyContract, type PeopleContract } from "../src/lib/lifeos";
import type { AreaScore } from "../src/lib/standing";

const TODAY = "2026-08-13";

/* ================================================================== *
 * The registry
 * ================================================================== */

describe("the parent registry", () => {
  it("gives LIFE_OS four parents — Horizon folded into Standing", () => {
    // Eleven flat nav items was the problem this compression solves; five
    // became FOUR on 2026-08-14 when Horizon was folded in. Horizon had
    // been a registered parent with NO nav entry and no way to reach it,
    // so it was a parent in the registry and nothing on screen. Either it
    // was one or it wasn't; now it isn't, and Goals and the bucket list
    // are Standing's.
    expect(LIFE_PARENTS).toHaveLength(4);
    expect(LIFE_PARENTS.map((p) => p.id)).not.toContain("horizon");
  });

  it("gives EMPIRE five parents too, once the placements were confirmed", () => {
    // Shipped empty on 13 Aug because several placements were guesses, and
    // a board built on a guess reports the guess as a fact. Jay confirmed
    // them the same day, so the registry is real.
    expect(EMPIRE_PARENTS).toHaveLength(5);
  });

  it("groups the empire by how each division EARNS, not by category", () => {
    // Filed by category the empire cannot score itself against the one
    // sentence it exists to satisfy: how much of this earns without me.
    expect(EMPIRE_PARENTS.map((p) => p.id)).toEqual([
      "property",
      "trade",
      "product",
      "digital",
      "pipeline",
    ]);
  });

  it("has no duplicate ids", () => {
    const ids = ALL_PARENTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every parent a distinct question — overlapping ones mean a bad split", () => {
    const qs = ALL_PARENTS.map((p) => p.question);
    expect(new Set(qs).size).toBe(qs.length);
  });

  it("gives every parent at least one sub-module", () => {
    for (const p of ALL_PARENTS) expect(p.views.length, p.id).toBeGreaterThan(0);
  });

  it("names the honest typing cost of every parent", () => {
    // The whole redesign turns on this: a truth with a typing cost is a
    // truth that will be missing in a busy season.
    for (const p of ALL_PARENTS) {
      expect(["none", "one tap", "weekly", "monthly"]).toContain(p.cost);
    }
    // Body was "none" until 2026-08-14, on the reasoning that readiness
    // fills itself from a watch and food from meals marked cooked. The
    // watch is not connected, `workouts` has never held a row, and the
    // page therefore said nothing at all — so a "none" that produces an
    // empty module is a cost of zero on a value of zero.
    //
    // Training now leads the page and logging a session is one tap. That
    // is a real cost and the registry says so rather than flattering
    // itself, which is the entire point of this field.
    expect(parentById("body")!.cost).toBe("one tap");
  });

  it("opens Body on Training rather than on a score it cannot compute", () => {
    // Jay scored Training & Fitness 2/10 — his lowest of thirteen — and
    // said the priority is one he wants rather than one he has. Readiness
    // needs 14 wearable readings and there are none, so leading with it
    // meant leading with "not yet".
    expect(parentById("body")!.views[0].id).toBe("training");
  });

  it("does not make Rhythm a life parent", () => {
    // Season governs what the EMPIRE may expect as much as what life may.
    // A thing that governs both layers sits above both — in THE BRAIN.
    expect(ALL_PARENTS.some((p) => p.id === "rhythm")).toBe(false);
  });

  it("nests Vehicles and Accounts inside Money rather than beside it", () => {
    // Filing a vehicle as "a vehicle" rather than as a recurring cost and a
    // set of deadlines is why four MOT dates went unrecorded and one lapsed.
    const ids = parentById("money")!.views.map((v) => v.id);
    expect(ids).toContain("vehicles");
    expect(ids).toContain("accounts");
  });

  it("keeps the layers separable", () => {
    expect(parentsFor("life")).toHaveLength(4);
    expect(parentsFor("empire")).toHaveLength(5);
  });
});

/* ================================================================== *
 * ONE table of half-lives, not two
 * ================================================================== */

describe("staleness half-lives", () => {
  it("reads them from the single table in lifeos, never its own copy", () => {
    // Two tables of half-lives is two tables that disagree within a month.
    for (const [parentId, truth] of Object.entries(PARENT_TRUTH)) {
      expect(STALE_AFTER[truth], `${parentId} → ${truth}`).toBeTypeOf("number");
      expect(staleAfterFor(parentId)).toBe(STALE_AFTER[truth]);
    }
  });

  it("does not define a second half-life table in parents.ts", () => {
    // Mechanical, because a future tidy-up would otherwise reintroduce it
    // without anyone noticing until the two numbers drifted.
    const src = readFileSync(join(process.cwd(), "src", "lib", "parents.ts"), "utf8");
    expect(src).not.toMatch(/STALE_AFTER_DAYS\s*[:=]/);
  });

  it("says nothing for a parent with no typed truth", () => {
    expect(staleAfterFor("nonexistent")).toBeNull();
  });
});

/* ================================================================== *
 * THE RULE THIS WHOLE FILE EXISTS FOR
 * ================================================================== */

describe("reports never measure anything themselves", () => {
  const src = readFileSync(join(process.cwd(), "src", "lib", "reports.ts"), "utf8");

  it("does not re-derive the training floor", () => {
    // bodyContract already counts sessions against TRAINING_FLOOR_PER_WEEK
    // over TRAINING_WINDOW_DAYS. A second implementation of one measurement
    // does not stay equal to the first — one gets tuned and the other does
    // not, and then the dashboard and the page it links to disagree about
    // whether the floor held, at which point both are worthless.
    expect(src).not.toMatch(/sessionsInFortnight/);
    expect(src).not.toMatch(/\.filter\([^)]*trainingDays/);
  });

  it("takes contracts as arguments rather than raw rows", () => {
    expect(src).toMatch(/body:\s*BodyContract/);
    expect(src).toMatch(/money:\s*MoneyContract/);
    expect(src).toMatch(/people:\s*PeopleContract/);
  });

  it("takes the COMPUTED standing board, not the typed pillar column", () => {
    // A draft read `pillars.score` — hand-typed numbers that go stale the
    // moment they are written, which is the exact fault computed Standing
    // was built to fix.
    expect(src).toMatch(/board:\s*AreaScore\[\]/);
  });
});

/* ================================================================== *
 * Views
 * ================================================================== */

describe("views", () => {
  const money = parentById("money")!;

  it("shows everything when no tab is asked for", () => {
    expect(normaliseView(money, undefined)).toBe(ALL_VIEW);
    expect(normaliseView(money, "nonsense")).toBe(ALL_VIEW);
  });

  it("resolves a real FILTER sub-module", () => {
    expect(normaliseView(money, "debt")).toBe("debt");
  });

  // Vehicles became a PAGE on 2026-08-14. A stale `?tab=vehicles` link
  // from before the move must fall back to the whole page rather than
  // filtering to a section that no longer renders here — which would show
  // an empty screen and look broken rather than merely out of date.
  it("falls back to All for a ?tab= naming a page view", () => {
    expect(normaliseView(money, "vehicles")).toBe(ALL_VIEW);
    expect(normaliseView(money, "accounts")).toBe(ALL_VIEW);
  });

  it("shows every section under All, and only one under a tab", () => {
    expect(showsView(ALL_VIEW, "vehicles")).toBe(true);
    expect(showsView("debt", "vehicles")).toBe(false);
    expect(showsView("vehicles", "vehicles")).toBe(true);
  });

  it("drops the parameter for the default view, so the bare URL is canonical", () => {
    expect(viewHref(money, ALL_VIEW)).toBe("/life/money");
    expect(viewHref(money, "vehicles")).toBe("/life/money?tab=vehicles");
  });
});

/* ================================================================== *
 * Ranking and the board header
 * ================================================================== */

const r = (id: string, state: ParentReport["state"], stale: string | null = null): ParentReport => ({
  id,
  layer: "life",
  line: id,
  state,
  score: null,
  working: null,
  stale,
});

describe("ranking", () => {
  it("puts warnings first and healthy areas last", () => {
    expect(rankReports([r("a", "ok"), r("b", "warn"), r("c", "note")]).map((x) => x.state)).toEqual([
      "warn",
      "note",
      "ok",
    ]);
  });

  it("is stable within a state, using registry order", () => {
    expect(rankReports([r("money", "ok"), r("standing", "ok")]).map((x) => x.id)).toEqual([
      "standing",
      "money",
    ]);
  });

  it("gives an attention list only what is not fine", () => {
    expect(needingAttention([r("a", "ok"), r("b", "warn")])).toHaveLength(1);
  });

  it("separates stale truths from unhealthy ones", () => {
    expect(staleReports([r("a", "ok", "Balances are six weeks old."), r("b", "ok")])).toHaveLength(1);
  });
});

describe("boardLine", () => {
  it("makes silence legible instead of blank", () => {
    expect(boardLine([r("a", "ok"), r("b", "ok")])).toContain("Whole board clear");
  });

  it("counts what needs you, and what is merely worth a look", () => {
    expect(boardLine([r("a", "warn"), r("b", "note")])).toBe("1 area needs you, 1 worth a look.");
    expect(boardLine([r("a", "warn"), r("b", "warn")])).toBe("2 areas need you.");
    expect(boardLine([r("a", "note"), r("b", "note")])).toContain("2 worth a look");
  });

  it("says so when nothing is reporting at all", () => {
    expect(boardLine([])).toContain("Nothing is reporting");
  });
});

/* ================================================================== *
 * The reports
 * ================================================================== */

const body = (over: Partial<BodyContract> = {}): BodyContract => ({
  trainingPerWeek: 4,
  readinessBand: "green",
  floorHeld: true,
  ...over,
});

describe("bodyReport", () => {
  it("cannot tell a stopped habit from a broken sync, and says so", () => {
    // floorHeld === null is UNMEASURED, not failed. Reporting it as a
    // breach would be the system accusing him from its own empty table.
    const out = bodyReport(body({ trainingPerWeek: null, floorHeld: null }), TODAY);
    expect(out.state).toBe("note");
    expect(out.working).toContain("only one of them is about you");
  });

  it("quotes his own standard back rather than a default", () => {
    expect(bodyReport(body(), TODAY).working).toContain("4 a week");
  });

  it("is healthy at the floor and worse the further below it", () => {
    expect(bodyReport(body({ trainingPerWeek: 4, floorHeld: true }), TODAY).state).toBe("ok");
    expect(bodyReport(body({ trainingPerWeek: 2, floorHeld: false }), TODAY).state).toBe("note");
    expect(bodyReport(body({ trainingPerWeek: 0.5, floorHeld: false }), TODAY).state).toBe("warn");
  });

  it("never shows a score without its working", () => {
    const out = bodyReport(body(), TODAY);
    expect(out.score).not.toBeNull();
    expect(out.working).toBeTruthy();
  });
});

const money = (over: Partial<MoneyContract> = {}): MoneyContract => ({
  accountsClosed: 2,
  debtFreeDate: null,
  arrearsTotal: 4000,
  overdueCount: 0,
  ...over,
});

describe("moneyReport", () => {
  it("counts accounts, not pounds", () => {
    const out = moneyReport(money(), TODAY, { openAccounts: 4 });
    expect(out.line).toContain("4 accounts left");
    expect(out.working).toContain("Accounts closed");
  });

  it("puts a missed payment above everything else", () => {
    const out = moneyReport(money({ overdueCount: 1 }), TODAY, { openAccounts: 4 });
    expect(out.state).toBe("warn");
    expect(out.line).toContain("past due");
  });

  it("says nothing is confirmed rather than implying nothing is owed", () => {
    // Today's real state: six creditors, no balance entered for any of them.
    // "0 owed" would be the most flattering possible lie.
    const out = moneyReport(money({ accountsClosed: 0, arrearsTotal: null }), TODAY, {
      openAccounts: 6,
    });
    expect(out.line).toContain("6 creditors, none confirmed");
    expect(out.working).toContain("a claim that you owe nothing");
  });

  it("marks a balance that has gone off", () => {
    const out = moneyReport(money(), TODAY, { openAccounts: 4, lastConfirmed: "2026-06-01" });
    expect(out.stale).toContain("weeks ago");
    expect(out.state).toBe("note");
  });

  it("celebrates the end rather than reporting zero", () => {
    expect(moneyReport(money({ accountsClosed: 8 }), TODAY, { openAccounts: 0 }).line).toContain(
      "has."
    );
  });
});

const people = (over: Partial<PeopleContract> = {}): PeopleContract => ({
  overdueContacts: 0,
  nextOccasion: null,
  unset: 0,
  ...over,
});

describe("peopleReport", () => {
  it("never escalates to a warning — a person is not a deadline", () => {
    const out = peopleReport(people({ overdueContacts: 1 }), {
      tracked: 3,
      worst: { name: "Mum", days: 60 },
    });
    expect(out.state).toBe("note");
  });

  it("names the person and the gap, not a count", () => {
    const out = peopleReport(people({ overdueContacts: 2 }), {
      tracked: 3,
      worst: { name: "Mum", days: 47 },
    });
    expect(out.line).toContain("Mum");
    expect(out.line).toContain("47 days");
  });

  it("reminds him the cadence was his own", () => {
    expect(
      peopleReport(people({ overdueContacts: 1 }), { tracked: 3, worst: { name: "Dad", days: 20 } })
        .working
    ).toContain("yourself");
  });

  it("does not call a never-contacted roster 'everyone is fine'", () => {
    // Nobody is overdue because no clock has ever started. That is a
    // different fact from everyone being in touch.
    const out = peopleReport(people({ overdueContacts: 0, unset: 3 }), { tracked: 3 });
    expect(out.state).toBe("note");
    expect(out.line).toContain("has been logged as contacted");
  });

  it("says the roster is empty rather than pretending everyone is fine", () => {
    expect(peopleReport(people(), { tracked: 0 }).state).toBe("note");
  });
});

const area = (name: string, score: number | null, source: AreaScore["source"] = "computed"): AreaScore => ({
  area: name,
  score,
  source,
  working: "because",
});

describe("standingReport", () => {
  it("leads with the weakest area and names it", () => {
    const out = standingReport(
      [area("Money & Security", 2), area("Family", 8), area("Vehicles", 5)],
      TODAY
    );
    expect(out.line).toContain("Money & Security");
    expect(out.line).toContain("2 of 10");
  });

  it("counts the unmeasured rather than averaging them away", () => {
    const out = standingReport([area("A", 5), area("B", null, "unmeasured")], TODAY);
    expect(out.working).toContain("1 unmeasured");
  });

  it("says how many were computed rather than typed", () => {
    const out = standingReport([area("A", 5), area("B", 7, "typed")], TODAY);
    expect(out.working).toContain("1 of them computed");
  });

  it("declines to score a board with nothing measurable on it", () => {
    const out = standingReport([area("A", null, "unmeasured")], TODAY);
    expect(out.score).toBeNull();
    expect(out.line).toContain("No area can be scored");
  });
});

describe("horizonReport", () => {
  it("treats a passed date as a decision, not a failure", () => {
    expect(
      horizonReport([{ target_date: "2026-01-01", status: "active" }], TODAY).working
    ).toContain("not failed");
  });

  it("flags goals with no date, since nothing can tell if they slip", () => {
    const out = horizonReport(
      [
        { target_date: "2027-01-01", status: "active" },
        { target_date: null, status: "active" },
      ],
      TODAY
    );
    expect(out.working).toContain("no date");
  });

  it("ignores finished and dropped goals", () => {
    expect(
      horizonReport(
        [
          { target_date: "2020-01-01", status: "done" },
          { target_date: "2020-01-01", status: "dropped" },
        ],
        TODAY
      ).line
    ).toContain("No live goals");
  });
});

describe("empireParentReport", () => {
  it("distinguishes parked on purpose from gone quiet", () => {
    const parked = empireParentReport("product", "Product", [
      { name: "Stencil Art", live: false, lastTouchedDays: 400 },
    ]);
    expect(parked.state).toBe("ok");
    expect(parked.working).toContain("not the same as dropped");
  });

  it("names the coldest active division", () => {
    const out = empireParentReport("trade", "Trade", [
      { name: "A to Z", live: true, lastTouchedDays: 34 },
      { name: "Stump Pump", live: true, lastTouchedDays: 2 },
    ]);
    expect(out.line).toContain("A to Z");
  });

  it("says nothing is filed rather than inventing a verdict", () => {
    expect(empireParentReport("digital", "Digital", []).line).toContain("Nothing filed");
  });
});

describe("stalenessFor", () => {
  it("stays quiet inside the half-life", () => {
    expect(stalenessFor("money", "2026-08-01", TODAY, "Balances")).toBeNull();
  });

  it("speaks once past it, in weeks a human reads", () => {
    expect(stalenessFor("money", "2026-06-01", TODAY, "Balances")).toContain("weeks ago");
  });

  it("says nothing when there is no timestamp at all", () => {
    // Never typed and typed long ago are different facts, and calling the
    // first one stale accuses him of neglecting something never asked for.
    expect(stalenessFor("money", null, TODAY, "Balances")).toBeNull();
  });
});
