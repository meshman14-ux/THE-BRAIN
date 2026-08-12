import { describe, expect, it } from "vitest";
import {
  mondaysIn,
  quarterBounds,
  readPillarScores,
  scoreDeltas,
  seasonDaysInQuarter,
} from "../src/lib/quarter";

describe("quarterBounds", () => {
  it("names the quarter the way the empire's horizons already do", () => {
    const q = quarterBounds("2026-08-12");
    expect(q.label).toBe("Q3 2026");
    expect(q.start).toBe("2026-07-01");
    expect(q.end).toBe("2026-09-30");
  });

  it("counts the days to the boundary, zero on the last day", () => {
    expect(quarterBounds("2026-09-30").daysLeft).toBe(0);
    expect(quarterBounds("2026-09-29").daysLeft).toBe(1);
    expect(quarterBounds("2026-08-12").daysLeft).toBe(49);
  });

  it("handles every quarter of the year, including the wrap", () => {
    expect(quarterBounds("2026-01-01").label).toBe("Q1 2026");
    expect(quarterBounds("2026-12-31").end).toBe("2026-12-31");
    expect(quarterBounds("2026-04-01").start).toBe("2026-04-01");
  });
});

describe("mondaysIn", () => {
  it("counts the weekly-review slots the quarter actually holds", () => {
    // Q3 2026: 1 Jul (Wed) … 30 Sep. First Monday 6 Jul; 13 Mondays.
    expect(mondaysIn("2026-07-01", "2026-09-30")).toBe(13);
  });

  it("a partial window counts only its own Mondays", () => {
    // 1 Jul … 12 Aug: Mondays 6,13,20,27 Jul + 3,10 Aug = 6.
    expect(mondaysIn("2026-07-01", "2026-08-12")).toBe(6);
    expect(mondaysIn("2026-07-01", "2026-07-05")).toBe(0);
  });
});

describe("readPillarScores", () => {
  it("validates the jsonb rather than trusting it", () => {
    expect(readPillarScores(null)).toEqual({});
    expect(readPillarScores("junk")).toEqual({});
    const raw = {
      "82a17418-cefb-4a9f": 7,
      "61d6d1ea-9685-41f9": 11, // out of range — discarded
      "aaaabbbb-cccc-dddd": "six", // not a number — discarded
      bad: 5, // key too short to be an id — discarded
    };
    expect(readPillarScores(raw)).toEqual({ "82a17418-cefb-4a9f": 7 });
  });
});

describe("scoreDeltas", () => {
  const pillars = [
    { id: "aaaa-bbbb-cccc-dddd", name: "Training", score: 4 },
    { id: "eeee-ffff-gggg-hhhh", name: "Money", score: 6 },
    { id: "iiii-jjjj-kkkk-llll", name: "Family", score: null },
  ];

  it("a delta needs both ends — a first measurement is not an improvement", () => {
    const out = scoreDeltas(pillars, { "aaaa-bbbb-cccc-dddd": 2 });
    expect(out.find((d) => d.name === "Training")).toEqual({
      id: "aaaa-bbbb-cccc-dddd",
      name: "Training",
      now: 4,
      then: 2,
      delta: 2,
    });
    // Money was never in the last snapshot: no delta, however it scores now.
    expect(out.find((d) => d.name === "Money")!.delta).toBeNull();
    // Family is unscored now: no delta either.
    expect(out.find((d) => d.name === "Family")!.delta).toBeNull();
  });
});

describe("seasonDaysInQuarter", () => {
  const Q3 = { start: "2026-07-01", end: "2026-09-30" };

  it("clips a season to the quarter's edges", () => {
    // Started mid-June, ended 10 July: only the July days count.
    expect(
      seasonDaysInQuarter(
        { kind: "busy", started_on: "2026-06-15", ended_on: "2026-07-10" },
        Q3,
        "2026-08-12"
      )
    ).toBe(10);
  });

  it("an open season runs to today, never to the boundary", () => {
    // Declared 12 Aug, still open on 12 Aug: one day, not fifty.
    expect(
      seasonDaysInQuarter(
        { kind: "quiet", started_on: "2026-08-12", ended_on: null },
        Q3,
        "2026-08-12"
      )
    ).toBe(1);
  });

  it("a season entirely outside the quarter contributes nothing", () => {
    expect(
      seasonDaysInQuarter(
        { kind: "busy", started_on: "2026-04-01", ended_on: "2026-06-30" },
        Q3,
        "2026-08-12"
      )
    ).toBe(0);
  });
});
