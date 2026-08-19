import { describe, expect, it } from "vitest";
import {
  FLOOR_SLOTS,
  floorHit,
  floorLine,
  floorWeek,
  slotHit,
  type FloorSignals,
} from "../src/lib/floor";

const T = "2026-08-19";
const empty = (): FloorSignals => ({
  trainingDays: new Set(),
  workoutDays: new Set(),
  empireDays: new Set(),
  mindHabitDays: new Set(),
  journalDays: new Set(),
});

describe("the floor", () => {
  it("is exactly three slots — BODY, EMPIRE, MIND, people deliberately outside", () => {
    expect(FLOOR_SLOTS.map((f) => f.slot)).toEqual(["body", "empire", "mind"]);
  });

  it("BODY lands from either the Training tick or a workout row", () => {
    expect(slotHit("body", T, { ...empty(), trainingDays: new Set([T]) })).toBe(true);
    expect(slotHit("body", T, { ...empty(), workoutDays: new Set([T]) })).toBe(true);
    expect(slotHit("body", T, empty())).toBe(false);
  });

  it("MIND lands from a mind habit or a journal entry", () => {
    expect(slotHit("mind", T, { ...empty(), mindHabitDays: new Set([T]) })).toBe(true);
    expect(slotHit("mind", T, { ...empty(), journalDays: new Set([T]) })).toBe(true);
  });

  it("the day counts only when ALL THREE land — a floor is a floor", () => {
    const twoOfThree: FloorSignals = {
      ...empty(),
      trainingDays: new Set([T]),
      empireDays: new Set([T]),
    };
    expect(floorHit(T, twoOfThree)).toBe(false);
    expect(floorHit(T, { ...twoOfThree, journalDays: new Set([T]) })).toBe(true);
  });

  it("the week window is the trailing 7 days, today included", () => {
    const s: FloorSignals = {
      ...empty(),
      trainingDays: new Set(["2026-08-13", "2026-08-19"]),
      empireDays: new Set(["2026-08-13", "2026-08-19"]),
      journalDays: new Set(["2026-08-13", "2026-08-19", "2026-08-12"]),
    };
    const w = floorWeek(T, s);
    expect(w.hits).toBe(2);
    expect(w.days).toHaveLength(7);
    expect(w.days[0].day).toBe("2026-08-13");
    expect(w.days[6].day).toBe(T);
    // 2026-08-12 is OUTSIDE the window and contributes nothing.
    expect(w.perSlot.mind).toBe(2);
  });

  it("perSlot counts land independently of the full-floor hit", () => {
    const s: FloorSignals = { ...empty(), trainingDays: new Set(["2026-08-18", T]) };
    const w = floorWeek(T, s);
    expect(w.hits).toBe(0);
    expect(w.perSlot.body).toBe(2);
    expect(w.today.body).toBe(true);
    expect(w.today.empire).toBe(false);
  });

  it("the headline reads in Jay's chosen shape", () => {
    const s: FloorSignals = {
      ...empty(),
      trainingDays: new Set(["2026-08-18", T]),
      empireDays: new Set([T]),
      journalDays: new Set([T]),
    };
    expect(floorLine(floorWeek(T, s))).toBe("Floor hit 1/7 · Body 2 · Empire 1 · Mind 1");
  });

  it("an empty week says unmeasured, never a row of zeros dressed as a score", () => {
    expect(floorLine(floorWeek(T, empty()))).toMatch(/unmeasured/);
  });
});
