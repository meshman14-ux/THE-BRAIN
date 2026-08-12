/**
 * THE COG — the focus slot, and the one bug the blueprint shipped.
 *
 * Every time string in this engine is naive and local. F3 computed its end
 * time by going out through `Date.toISOString()`, which converts to UTC —
 * so during British Summer Time the pomodoro fallback produced a slot that
 * ENDED BEFORE IT STARTED. It would have rendered as "13:00–12:25" and
 * been reported as 25 minutes long.
 */
import { describe, expect, it } from "vitest";
import { addMinutes, allocateFocus, defaultConfig, freeIntervals } from "../../src/lib/cog";
import { baseProfile, baseState } from "./base-state";

const DATE = "2026-08-13"; // British Summer Time — the offset that exposed it

describe("addMinutes", () => {
  it("stays in the naive local frame instead of converting to UTC", () => {
    expect(addMinutes(`${DATE}T13:00:00`, 25)).toBe(`${DATE}T13:25:00`);
  });

  it("carries the hour correctly", () => {
    expect(addMinutes(`${DATE}T13:50:00`, 25)).toBe(`${DATE}T14:15:00`);
  });

  it("clamps at the end of the day rather than rolling the date", () => {
    // No focus block in this system legitimately crosses midnight, and a
    // rolled date would put the slot on tomorrow's screen.
    expect(addMinutes(`${DATE}T23:50:00`, 60).slice(0, 10)).toBe(DATE);
  });
});

describe("F3 — the pomodoro fallback", () => {
  /** A day whose deep-work window is fully booked, leaving only afternoon. */
  function crowded() {
    const s = baseState();
    s.date = DATE;
    s.now = `${DATE}T07:30:00`;
    s.calendar = {
      source: "google",
      busy: [
        // The whole 08:30–12:30 window, so no prime candidate survives F1.
        { start: `${DATE}T08:00:00`, end: `${DATE}T13:00:00` },
        // And a late block, leaving exactly one usable afternoon gap.
        { start: `${DATE}T14:00:00`, end: `${DATE}T21:00:00` },
      ],
    };
    return s;
  }

  it("ends after it starts", () => {
    const slot = allocateFocus(crowded(), [], baseProfile(), defaultConfig);
    expect(slot).not.toBeNull();
    expect(slot!.quality).toBe("fallback");
    expect(slot!.end > slot!.start, `${slot!.start} → ${slot!.end}`).toBe(true);
  });

  it("is exactly as long as it claims to be", () => {
    const slot = allocateFocus(crowded(), [], baseProfile(), defaultConfig)!;
    const mins =
      (Date.parse(slot.end + "Z") - Date.parse(slot.start + "Z")) / 60_000;
    expect(mins).toBe(defaultConfig.focusFallbackMin);
    expect(slot.durationMin).toBe(defaultConfig.focusFallbackMin);
  });

  it("keeps the same date as the day it is planning", () => {
    const slot = allocateFocus(crowded(), [], baseProfile(), defaultConfig)!;
    expect(slot.start.slice(0, 10)).toBe(DATE);
    expect(slot.end.slice(0, 10)).toBe(DATE);
  });
});

describe("F1/F2 — the prime block", () => {
  it("takes the longest clear stretch in the deep-work window", () => {
    const s = baseState();
    s.date = DATE;
    s.calendar = {
      source: "google",
      busy: [{ start: `${DATE}T09:00:00`, end: `${DATE}T09:30:00` }],
    };
    const slot = allocateFocus(s, [], baseProfile(), defaultConfig)!;
    expect(slot.quality).toBe("prime");
    // 09:30–12:30 is three hours; 08:30–09:00 is thirty minutes.
    expect(slot.start).toBe(`${DATE}T09:30:00`);
    expect(slot.durationMin).toBe(180);
  });
});

describe("F4 — no calendar at all", () => {
  it("falls back to the configured window and says so", () => {
    const s = baseState();
    s.date = DATE;
    s.calendar = { source: "none", busy: [] };
    const slot = allocateFocus(s, [], baseProfile(), defaultConfig)!;
    expect(slot.source).toBe("config-default");
    expect(slot.ruleTrace.some((r) => r.ruleId === "F4" && r.fired)).toBe(true);
    expect(slot.end > slot.start).toBe(true);
  });
});

describe("freeIntervals", () => {
  it("returns the whole span when nothing is busy", () => {
    expect(freeIntervals([], `${DATE}T08:00:00`, `${DATE}T12:00:00`)).toEqual([
      { start: `${DATE}T08:00:00`, end: `${DATE}T12:00:00` },
    ]);
  });

  it("returns nothing when the span is fully booked", () => {
    expect(
      freeIntervals(
        [{ start: `${DATE}T07:00:00`, end: `${DATE}T13:00:00` }],
        `${DATE}T08:00:00`,
        `${DATE}T12:00:00`
      )
    ).toEqual([]);
  });
});
