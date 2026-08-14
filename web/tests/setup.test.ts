import { describe, expect, it } from "vitest";
import {
  type SetupFacts,
  type SetupStep,
  estimateMinutes,
  setupLine,
  setupProgress,
  setupSteps,
  sortSteps,
} from "../src/lib/setup";
import { inlineField } from "../src/lib/inline";

/** A system with nothing in it — which is, today, the real one. */
const empty = (over: Partial<SetupFacts> = {}): SetupFacts => ({
  debts: [
    { id: "d1", creditor: "Council Tax", status: "active", current_balance: null },
    { id: "d2", creditor: "Barclaycard", status: "active", current_balance: null },
  ],
  vehicles: [
    {
      id: "v1", name: "BMW", registration: "ME54 JAY", status: "active",
      tax_due: null, mot_due: null, insurance_due: null, next_service: null,
    },
  ],
  workoutCount: 0,
  healthDayCount: 0,
  bandedJournalCount: 0,
  keystoneTaskCount: 0,
  keystonePillarName: "Training & Fitness",
  cookedMealCount: 0,
  reviewCount: 0,
  unscoredTypedAreas: ["Home & Admin"],
  unrecordedMetrics: ["Monthly income", "Savings buffer"],
  ...over,
});

/** Everything answered. */
const full = (): SetupFacts =>
  empty({
    debts: [{ id: "d1", creditor: "Council Tax", status: "active", current_balance: 420 }],
    vehicles: [
      {
        id: "v1", name: "BMW", registration: "ME54 JAY", status: "active",
        tax_due: "2027-01-01", mot_due: "2027-02-01",
        insurance_due: "2027-03-01", next_service: "2027-04-01",
      },
    ],
    workoutCount: 3,
    healthDayCount: 20,
    bandedJournalCount: 5,
    keystoneTaskCount: 1,
    cookedMealCount: 2,
    reviewCount: 1,
    unscoredTypedAreas: [],
    unrecordedMetrics: [],
  });

/* ================================================================== *
 * The order — the world outranks the system
 * ================================================================== */

describe("ranking", () => {
  it("puts the vehicle dates first, above everything with more figures", () => {
    // Eight debt balances is more typing than four vehicle dates. It is
    // still second, because one of these is a fine and the other is a
    // question only this system is asking.
    const steps = setupSteps(empty());
    expect(steps[0].id).toBe("vehicle-legal-dates");
    expect(steps[0].worldPunishes).toBe(true);
  });

  it("is the only step the world punishes", () => {
    expect(setupSteps(empty()).filter((s) => s.worldPunishes)).toHaveLength(1);
  });

  it("then ranks by how much each one turns on", () => {
    const rest = setupSteps(empty()).filter((s) => !s.worldPunishes && !s.done);
    const counts = rest.map((s) => s.unlockCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("sinks finished steps to the bottom without hiding them", () => {
    // A list that silently shortens gives no sense of having got anywhere.
    const steps = setupSteps(empty({ workoutCount: 4, reviewCount: 2 }));
    const firstDone = steps.findIndex((s) => s.done);
    expect(firstDone).toBeGreaterThan(0);
    expect(steps.slice(firstDone).every((s) => s.done)).toBe(true);
    expect(steps).toHaveLength(setupSteps(empty()).length);
  });

  it("is stable — the list does not reshuffle under your hands", () => {
    const a = setupSteps(empty()).map((s) => s.id);
    const b = setupSteps(empty()).map((s) => s.id);
    expect(a).toEqual(b);
  });

  it("does not reorder the unfinished half when one finishes", () => {
    const before = setupSteps(empty())
      .filter((s) => !s.done && s.id !== "first-review")
      .map((s) => s.id);
    const after = setupSteps(empty({ reviewCount: 1 }))
      .filter((s) => !s.done)
      .map((s) => s.id);
    expect(after).toEqual(before);
  });
});

/* ================================================================== *
 * The figures
 * ================================================================== */

describe("figures", () => {
  it("keeps the three legal dates together, MOT first", () => {
    const step = setupSteps(empty()).find((s) => s.id === "vehicle-legal-dates")!;
    expect(step.figures?.map((f) => f.key)).toEqual([
      "vehicles.mot_due",
      "vehicles.tax_due",
      "vehicles.insurance_due",
    ]);
  });

  it("asks for the service date separately, and does not call it legal", () => {
    // Nobody fines you for a late service. Sixteen rows under one red
    // heading would have said a missed service and a lapsed MOT were the
    // same kind of thing, and that is how a warning label stops working.
    const step = setupSteps(empty()).find((s) => s.id === "vehicle-service-dates")!;
    expect(step.worldPunishes).toBe(false);
    expect(step.figures?.map((f) => f.key)).toEqual(["vehicles.next_service"]);
  });

  it("still asks for all four dates between the two steps", () => {
    // The /life panel has always listed three. The fourth was editable
    // everywhere except the one place that asks for it.
    const all = setupSteps(empty()).flatMap((s) => s.figures ?? []).map((f) => f.key);
    for (const k of ["vehicles.mot_due", "vehicles.tax_due", "vehicles.insurance_due", "vehicles.next_service"]) {
      expect(all).toContain(k);
    }
  });

  it("names the vehicle by registration when it has one", () => {
    const step = setupSteps(empty()).find((s) => s.id === "vehicle-legal-dates")!;
    expect(step.figures?.[0].subject).toBe("BMW · ME54 JAY");
  });

  it("ignores a vehicle that is off the road", () => {
    // A SORNed van has no MOT to lapse. Asking for its dates would be the
    // list inventing work.
    const facts = empty();
    facts.vehicles[0].status = "sorn";
    const steps = setupSteps(facts);
    expect(steps.find((s) => s.id === "vehicle-legal-dates")!.figures).toHaveLength(0);
    expect(steps.find((s) => s.id === "vehicle-service-dates")!.figures).toHaveLength(0);
  });

  it("ignores a settled debt", () => {
    const facts = empty();
    facts.debts[0].status = "closed";
    const step = setupSteps(facts).find((s) => s.id === "debt-balances")!;
    expect(step.figures).toHaveLength(1);
    expect(step.figures?.[0].subject).toBe("Barclaycard");
  });

  it("counts a confirmed balance as answered, including a zero one", () => {
    // A debt confirmed at zero is a debt that CLOSED. Treating it as
    // unanswered would ask him to re-enter his best news.
    const facts = empty();
    facts.debts[0].current_balance = 0;
    expect(setupSteps(facts).find((s) => s.id === "debt-balances")!.figures).toHaveLength(1);
  });
});

/* ================================================================== *
 * Metrics
 * ================================================================== */

describe("the metrics step", () => {
  const step = (f: SetupFacts) => setupSteps(f).find((s) => s.id === "first-metric-reading")!;

  it("counts the metrics that have never been recorded", () => {
    expect(step(empty()).title).toBe("2 metrics never recorded");
    expect(step(empty()).done).toBe(false);
  });

  it("says it in the singular for one", () => {
    expect(step(empty({ unrecordedMetrics: ["Monthly income"] })).title).toBe(
      "1 metric never recorded"
    );
  });

  it("is done, and says so positively, once every metric has a reading", () => {
    const s = step(empty({ unrecordedMetrics: [] }));
    expect(s.done).toBe(true);
    expect(s.title).toBe("Every metric has a reading");
  });

  // Not a fine, and the list must keep saying which things are.
  it("is never a world-punishes step", () => {
    expect(step(empty()).worldPunishes).toBe(false);
  });

  // The unlock count is three real answers, not "a chart looks nicer".
  it("names what it turns on rather than what to do", () => {
    const s = step(empty());
    expect(s.unlockCount).toBe(3);
    expect(s.unlocks).toContain("cashflow");
    expect(s.href).toBe("/life/metrics");
  });
});

/* ================================================================== *
 * Completion
 * ================================================================== */

describe("progress", () => {
  it("counts every step, done and not", () => {
    const p = setupProgress(setupSteps(empty()));
    expect(p.total).toBeGreaterThan(6);
    expect(p.done).toBe(0);
    expect(p.complete).toBe(false);
  });

  it("counts the individual figures across steps", () => {
    // Three legal dates, one service date, two balances.
    expect(setupProgress(setupSteps(empty())).figures).toBe(6);
  });

  it("is complete when everything is answered", () => {
    const p = setupProgress(setupSteps(full()));
    expect(p.complete).toBe(true);
    expect(p.figures).toBe(0);
  });
});

describe("estimateMinutes", () => {
  it("gives a number a human would say", () => {
    const m = estimateMinutes(setupSteps(empty()));
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThan(60);
  });

  it("leaves the one-off install out rather than guessing at it", () => {
    // Installing an app is not a task with a knowable length, and folding
    // an invented number into an otherwise honest total spoils the total.
    const withInstall = estimateMinutes(setupSteps(empty()));
    const withoutInstall = estimateMinutes(setupSteps(empty({ healthDayCount: 9 })));
    expect(withInstall).toBe(withoutInstall);
  });

  it("never claims zero minutes for work that remains", () => {
    const nearly = setupSteps(full());
    nearly[0] = { ...nearly[0], done: false, figures: [] };
    expect(estimateMinutes(nearly)).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================== *
 * The dashboard line — one, and then none
 * ================================================================== */

describe("setupLine", () => {
  it("carries the count and the honest time", () => {
    const line = setupLine(setupSteps(empty()))!;
    expect(line).toContain("6 figures");
    expect(line).toMatch(/\d+ minutes?/);
  });

  it("says nothing at all once it is done", () => {
    // A setup prompt that congratulates you daily for being set up is a
    // line you train yourself to skip — and the one line above it needs
    // that habit intact.
    expect(setupLine(setupSteps(full()))).toBeNull();
  });

  it("switches to counting things when only actions remain", () => {
    const facts = full();
    facts.workoutCount = 0;
    const line = setupLine(setupSteps(facts))!;
    expect(line).toContain("1 thing to set up");
  });

  it("reads as one sentence, not a status dump", () => {
    const line = setupLine(setupSteps(empty()))!;
    expect(line.length).toBeLessThan(180);
    expect(line.split(".").length).toBeLessThanOrEqual(2);
  });
});

/* ================================================================== *
 * Every step carries its reason
 * ================================================================== */

describe("every step explains itself", () => {
  const all = setupSteps(empty());

  it("says what filling it unlocks, in a sentence with substance", () => {
    for (const s of all) {
      expect(s.unlocks.length, s.id).toBeGreaterThan(40);
    }
  });

  it("gives a way to act — either figures to type or somewhere to go", () => {
    for (const s of all) {
      const actionable = (s.figures?.length ?? 0) > 0 || s.href != null;
      expect(actionable, `${s.id} is a dead end`).toBe(true);
    }
  });

  it("labels a link step with what the button should say", () => {
    for (const s of all) {
      if (s.href) expect(s.cta, s.id).toBeTruthy();
    }
  });

  it("has a unique id per step", () => {
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
  });
});

describe("sortSteps", () => {
  it("is a pure sort — it does not mutate what it was given", () => {
    const input: SetupStep[] = setupSteps(empty());
    const order = input.map((s) => s.id);
    sortSteps(input);
    expect(input.map((s) => s.id)).toEqual(order);
  });
});

/* ================================================================== *
 * The stamp — so a figure knows when it was confirmed
 * ================================================================== */

describe("inline fields that stamp a confirmation date", () => {
  it("stamps the debt balance, because staleness has to read something", () => {
    // Without this, a balance entered today and one entered in March are
    // indistinguishable, and the staleness test — which exists precisely
    // to tell them apart — has nothing to read. /setup writes through the
    // inline editor, so the stamp has to travel with the FIELD rather
    // than with the screen that happens to be showing it.
    expect(inlineField("debts.current_balance").stamp).toBe("balance_confirmed_on");
  });

  it("does not stamp fields that carry their own date", () => {
    // An MOT date IS a date. Recording when it was typed adds nothing.
    for (const key of ["vehicles.mot_due", "vehicles.tax_due", "vehicles.next_service"] as const) {
      expect(inlineField(key).stamp, key).toBeUndefined();
    }
  });
});
