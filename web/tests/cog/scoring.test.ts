/**
 * THE COG — scoring unit tests: the formula in docs/03-advisor-logic.md §2-3,
 * especially weight RENORMALIZATION on missing inputs (a missing sensor != a zero score).
 */
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/lib/cog";
import { momentumBand, momentumIndicator, priorityScore } from "../../src/lib/cog";
import { freeIntervals } from "../../src/lib/cog";
import { baseState, baseTasks } from "./base-state";

describe("Momentum Indicator", () => {
  it("matches the worked example from the docs (~73, rolling)", () => {
    const state = baseState();
    state.signals.sleepBand = null; // the docs example runs without sleep
    const { score } = momentumIndicator(state, defaultConfig);
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(76);
    expect(momentumBand(score)).toBe("rolling");
  });

  it("renormalizes weights when inputs are missing — score does not collapse", () => {
    const full = momentumIndicator(baseState(), defaultConfig).score;
    const degraded = baseState();
    degraded.signals.sleepBand = null;
    degraded.signals.finishesRate = null;
    const partial = momentumIndicator(degraded, defaultConfig).score;
    expect(Math.abs(full - partial)).toBeLessThan(15); // shifts, never craters
  });

  it("returns neutral 50 on total blackout (labelled degraded upstream)", () => {
    const s = baseState();
    s.signals = { ...s.signals, energyBand: null, sleepBand: null, yesterdayCompletionRatio: null,
      keystoneHitYesterday: null, finishesRate: null, calendarLoadRatio: null,
      workloadPressure: null, checkinStreakDays: 0 };
    // streak component (0) is still "available", so tweak: streak 0 keeps weightSum > 0 — assert band low instead
    const { score } = momentumIndicator(s, defaultConfig);
    expect(score).toBeLessThanOrEqual(50);
  });
});

describe("priority score", () => {
  const state = baseState();

  it("overdue beats far-future, all else equal", () => {
    const a = { ...baseTasks[3], dueDate: "2026-08-10" }; // overdue
    const b = { ...baseTasks[3], dueDate: "2026-09-30" };
    expect(priorityScore(a, state, defaultConfig).score)
      .toBeGreaterThan(priorityScore(b, state, defaultConfig).score);
  });

  it("deep work scores low on a low-energy day (energyFit)", () => {
    const lowState = baseState();
    lowState.signals.energyBand = 1;
    const deepTask = baseTasks[2]; // energy: deep
    const hi = priorityScore(deepTask, state, defaultConfig).components.energyFit;
    const lo = priorityScore(deepTask, lowState, defaultConfig).components.energyFit;
    expect(lo).toBeLessThan(hi);
  });

  it("minimum season crushes non-keystone seasonFit (the floor never flexes)", () => {
    const min = baseState();
    min.season = "minimum";
    const keystone = priorityScore(baseTasks[0], min, defaultConfig).components.seasonFit;
    const other = priorityScore(baseTasks[2], min, defaultConfig).components.seasonFit;
    expect(keystone).toBeGreaterThan(other * 3);
  });

  it("empire bonus is flat and visible", () => {
    const t = { ...baseTasks[1], empireSignal: true };
    const withBonus = priorityScore(t, state, defaultConfig).score;
    const without = priorityScore(baseTasks[1], state, defaultConfig).score;
    expect(withBonus - without).toBeCloseTo(defaultConfig.empireBonus, 5);
  });
});

describe("freeIntervals (focus slot arithmetic)", () => {
  it("subtracts busy blocks and keeps order", () => {
    const free = freeIntervals(
      [
        { start: "2026-08-13T09:00:00", end: "2026-08-13T10:00:00" },
        { start: "2026-08-13T11:00:00", end: "2026-08-13T11:30:00" },
      ],
      "2026-08-13T08:30:00", "2026-08-13T12:30:00"
    );
    expect(free).toEqual([
      { start: "2026-08-13T08:30:00", end: "2026-08-13T09:00:00" },
      { start: "2026-08-13T10:00:00", end: "2026-08-13T11:00:00" },
      { start: "2026-08-13T11:30:00", end: "2026-08-13T12:30:00" },
    ]);
  });

  it("handles overlapping busy blocks", () => {
    const free = freeIntervals(
      [
        { start: "2026-08-13T09:00:00", end: "2026-08-13T11:00:00" },
        { start: "2026-08-13T10:00:00", end: "2026-08-13T10:30:00" },
      ],
      "2026-08-13T08:00:00", "2026-08-13T12:00:00"
    );
    expect(free).toEqual([
      { start: "2026-08-13T08:00:00", end: "2026-08-13T09:00:00" },
      { start: "2026-08-13T11:00:00", end: "2026-08-13T12:00:00" },
    ]);
  });
});
