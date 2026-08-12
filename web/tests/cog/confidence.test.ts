/**
 * THE COG — confidence, harvested from the standalone service build.
 *
 * The score already renormalises over present inputs, so a missing sensor
 * does not crater it. That leaves a problem the score alone cannot say:
 * a 73 built on two signals looks exactly like a 73 built on seven.
 *
 * Confidence is the number that tells them apart, and the two tests that
 * matter most are that it MOVES with the evidence and that it never
 * reaches 1 — the engine is deterministic, the person it models is not.
 */
import { describe, expect, it } from "vitest";
import {
  advise,
  confidenceOf,
  confidenceWord,
  decisionMargin,
  defaultConfig,
  inputCompleteness,
} from "../../src/lib/cog";
import type { MomentumState } from "../../src/lib/cog";
import { baseProfile, baseState } from "./base-state";

const run = (s: MomentumState) => advise(s, baseProfile(), defaultConfig);

/** Everything the engine could possibly know is gone. */
function blind(): MomentumState {
  const s = baseState();
  s.signals = {
    ...s.signals,
    energyBand: null,
    sleepBand: null,
    energySource: "none",
    sleepSource: "none",
    yesterdayCompletionRatio: null,
    keystoneHitYesterday: null,
    finishesRate: null,
    calendarLoadRatio: null,
    workloadPressure: null,
    checkinStreakDays: 0,
  };
  s.calendar = { source: "none", busy: [] };
  s.missingInputs = ["health", "sleep", "checkin", "calendar"];
  return s;
}

/* ================================================================== *
 * The ceiling and the floor
 * ================================================================== */

describe("confidenceOf", () => {
  it("never reaches 1, however complete the evidence", () => {
    // The engine is deterministic. The person it models is not, and a
    // system that claims certainty about a human has said something false.
    const perfect = confidenceOf(
      { inputCompleteness: 1, decisionMargin: 1, fallbacksApplied: 0 },
      defaultConfig
    );
    expect(perfect).toBe(defaultConfig.confidence.ceiling);
    expect(perfect).toBeLessThan(1);
  });

  it("never falls below the floor, however blind", () => {
    const worst = confidenceOf(
      { inputCompleteness: 0, decisionMargin: 0, fallbacksApplied: 9, energyMissing: true },
      defaultConfig
    );
    expect(worst).toBe(defaultConfig.confidence.floor);
    expect(worst).toBeGreaterThan(0);
  });

  it("rises with completeness", () => {
    const thin = confidenceOf({ inputCompleteness: 0.2 }, defaultConfig);
    const full = confidenceOf({ inputCompleteness: 1 }, defaultConfig);
    expect(full).toBeGreaterThan(thin);
  });

  it("falls when the decision was close", () => {
    // Two tasks a point apart is a coin toss, and a coin toss announced in
    // the same tone as a clear winner is what this number exists to stop.
    const clear = confidenceOf({ inputCompleteness: 1, decisionMargin: 1 }, defaultConfig);
    const closeCall = confidenceOf({ inputCompleteness: 1, decisionMargin: 0.01 }, defaultConfig);
    expect(closeCall).toBeLessThan(clear);
  });

  it("is docked for each fallback the engine had to reach for", () => {
    const direct = confidenceOf({ inputCompleteness: 1, decisionMargin: 0.5 }, defaultConfig);
    const once = confidenceOf(
      { inputCompleteness: 1, decisionMargin: 0.5, fallbacksApplied: 1 },
      defaultConfig
    );
    const twice = confidenceOf(
      { inputCompleteness: 1, decisionMargin: 0.5, fallbacksApplied: 2 },
      defaultConfig
    );
    expect(once).toBeLessThan(direct);
    expect(twice).toBeLessThan(once);
  });

  it("is docked again when there is no energy reading at all", () => {
    const known = confidenceOf({ inputCompleteness: 0.5, decisionMargin: 0.5 }, defaultConfig);
    const blindEnergy = confidenceOf(
      { inputCompleteness: 0.5, decisionMargin: 0.5, energyMissing: true },
      defaultConfig
    );
    expect(blindEnergy).toBeLessThan(known);
  });
});

describe("decisionMargin", () => {
  it("calls a single candidate a clear field, not a close call", () => {
    expect(decisionMargin(50, undefined)).toBe(1);
  });

  it("is near zero when the top two are level", () => {
    expect(decisionMargin(50, 50)).toBe(0);
  });

  it("is high when the winner is streets ahead", () => {
    expect(decisionMargin(90, 10)).toBeGreaterThan(0.8);
  });

  it("refuses to divide by nothing", () => {
    // Neither confident nor an accusation of ambiguity that was never
    // actually tested.
    expect(decisionMargin(0, 0)).toBe(0.5);
    expect(decisionMargin(undefined, undefined)).toBe(0.5);
  });
});

/* ================================================================== *
 * Completeness, measured against the real weights
 * ================================================================== */

describe("inputCompleteness", () => {
  it("is high on a well-fed day", () => {
    expect(inputCompleteness(baseState(), defaultConfig)).toBeGreaterThan(0.8);
  });

  it("is low when almost nothing is known", () => {
    expect(inputCompleteness(blind(), defaultConfig)).toBeLessThan(0.3);
  });

  it("never exceeds 1", () => {
    expect(inputCompleteness(baseState(), defaultConfig)).toBeLessThanOrEqual(1);
  });
});

/* ================================================================== *
 * It reaches every recommendation
 * ================================================================== */

describe("every recommendation carries a confidence", () => {
  it("on a normal day", () => {
    const a = run(baseState());
    const all = [...a.priorities, ...(a.focusSlot ? [a.focusSlot] : []), a.pulse, ...a.microActions];
    expect(all.length).toBeGreaterThan(1);
    for (const rec of all) {
      expect(typeof rec.confidence, JSON.stringify(rec)).toBe("number");
      expect(rec.confidence).toBeGreaterThanOrEqual(defaultConfig.confidence.floor);
      expect(rec.confidence).toBeLessThanOrEqual(defaultConfig.confidence.ceiling);
    }
  });

  it("on a blind day, and lower than on a well-fed one", () => {
    // The whole point: the same-looking advice, told apart by how much
    // the engine could actually see when it said it.
    const fed = run(baseState()).report.confidence;
    const nothing = run(blind()).report.confidence;
    expect(nothing).toBeLessThan(fed);
  });

  it("and the report says what share of the evidence showed up", () => {
    const a = run(baseState());
    expect(a.report.inputCompleteness).toBeGreaterThan(0);
    expect(a.report.inputCompleteness).toBeLessThanOrEqual(1);
  });
});

describe("the pulse inherits what it points at", () => {
  it("matches the priority it names", () => {
    // A "do this next" is only as trustworthy as the ranking underneath
    // it, and pretending otherwise would make the sentence sound more
    // certain than the thing that produced it.
    const s = baseState();
    s.signals.keystoneDoneToday = true; // skip N5 so N7 leads
    const a = advise(s, baseProfile(), defaultConfig);
    if (a.pulse.kind === "do-task" && a.pulse.refId) {
      const target = a.priorities.find((p) => p.taskId === a.pulse.refId);
      expect(target).toBeDefined();
      expect(a.pulse.confidence).toBe(target!.confidence);
    }
  });
});

describe("the focus slot is less certain the further it falls back", () => {
  it("trusts a real calendar over a default window", () => {
    const real = run(baseState()).focusSlot!;
    const noCalendar = baseState();
    noCalendar.calendar = { source: "none", busy: [] };
    const guessed = run(noCalendar).focusSlot!;
    expect(guessed.source).toBe("config-default");
    expect(guessed.confidence).toBeLessThan(real.confidence);
  });

  it("trusts a real calendar over pinned intentions", () => {
    // Google says he is committed. The planner says he meant to be.
    const planner = baseState();
    planner.calendar = { ...planner.calendar, source: "planner" };
    expect(run(planner).focusSlot!.confidence).toBeLessThan(run(baseState()).focusSlot!.confidence);
  });
});

describe("confidenceWord", () => {
  it("says it in words a person would use", () => {
    expect(confidenceWord(0.2)).toBe("low");
    expect(confidenceWord(0.6)).toBe("fair");
    expect(confidenceWord(0.95)).toBe("high");
  });
});

describe("determinism survives the addition", () => {
  it("still gives byte-identical advice", () => {
    const s = baseState();
    expect(JSON.stringify(run(s))).toBe(JSON.stringify(run(s)));
  });
});
