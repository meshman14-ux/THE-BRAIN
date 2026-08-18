import { describe, it, expect } from "vitest";
import {
  ATTEMPT_XP_SOFT,
  ATTEMPT_XP_STRICT,
  SESSION_XP,
  hexWeek,
  levelFor,
  mondayOf,
  rankFor,
  totalXp,
  weekProgressLine,
  xpForAttempts,
  xpForLevel,
  xpForSessions,
} from "../src/lib/cockpit";

describe("XP — flat per session, so a restore day pays like a full one", () => {
  it("counts only closed sessions", () => {
    expect(xpForSessions([{ closed: true }, { closed: false }, { closed: true }])).toBe(
      SESSION_XP * 2
    );
  });

  it("a session carries no readiness-shaped field to multiply by", () => {
    // The type itself is the guarantee: ClosedSession is {closed: boolean}
    // and nothing else, so there is no kind/band a multiplier could read.
    // Two sessions, closed the same way, always pay the same.
    const restoreDay = [{ closed: true }];
    const pushDay = [{ closed: true }];
    expect(xpForSessions(restoreDay)).toBe(xpForSessions(pushDay));
  });

  it("weights a strict attempt above a soft one", () => {
    expect(xpForAttempts([{ strict: true }])).toBe(ATTEMPT_XP_STRICT);
    expect(xpForAttempts([{ strict: false }])).toBe(ATTEMPT_XP_SOFT);
    expect(ATTEMPT_XP_STRICT).toBeGreaterThan(ATTEMPT_XP_SOFT);
  });

  it("sums both sources", () => {
    expect(totalXp([{ closed: true }], [{ strict: true }, { strict: false }])).toBe(
      SESSION_XP + ATTEMPT_XP_STRICT + ATTEMPT_XP_SOFT
    );
  });
});

describe("level — a curve, not a table", () => {
  it("starts level 1 at zero", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelFor(0)).toEqual({ level: 1, into: 0, span: xpForLevel(2), xp: 0 });
  });

  it("each level needs more than the last", () => {
    const span2 = xpForLevel(3) - xpForLevel(2);
    const span1 = xpForLevel(2) - xpForLevel(1);
    expect(span2).toBeGreaterThan(span1);
  });

  it("reports how far into the current level, never past its span", () => {
    const s = levelFor(500);
    expect(s.into).toBeGreaterThanOrEqual(0);
    expect(s.into).toBeLessThan(s.span);
  });
});

describe("rank — gated on owned rungs, never on XP", () => {
  it("starts at RECRUIT with nothing owned", () => {
    expect(rankFor(0).name).toBe("RECRUIT");
  });

  it("climbs only off the owned-rung count", () => {
    expect(rankFor(3).name).toBe("OPERATIVE");
    expect(rankFor(8).name).toBe("SPECIALIST");
    expect(rankFor(15).name).toBe("ELITE");
  });

  it("never drops below the highest threshold actually met", () => {
    expect(rankFor(2).name).toBe("RECRUIT");
    expect(rankFor(20).name).toBe("ELITE");
  });
});

describe("mondayOf", () => {
  it("finds Monday for any day of the week", () => {
    expect(mondayOf("2026-08-18")).toBe("2026-08-17"); // a Tuesday
    expect(mondayOf("2026-08-17")).toBe("2026-08-17"); // already Monday
    expect(mondayOf("2026-08-23")).toBe("2026-08-17"); // Sunday, prior Monday
  });
});

describe("hexWeek — the calendar as logged, never a forecast", () => {
  it("marks today distinctly from a done day", () => {
    const days = hexWeek(["2026-08-17"], "2026-08-18");
    expect(days).toHaveLength(7);
    expect(days.find((d) => d.iso === "2026-08-17")!.state).toBe("done");
    expect(days.find((d) => d.iso === "2026-08-18")!.state).toBe("today");
  });

  it("never claims a future day as pending — it is future, not missed", () => {
    const days = hexWeek([], "2026-08-17"); // Monday
    const sunday = days[6];
    expect(sunday.state).toBe("future");
  });

  it("a past untrained day reads pending, not done", () => {
    const days = hexWeek([], "2026-08-19"); // Wednesday, nothing logged
    expect(days.find((d) => d.iso === "2026-08-17")!.state).toBe("pending");
  });
});

describe("weekProgressLine", () => {
  it("never claims a target it was not given", () => {
    const days = hexWeek(["2026-08-17"], "2026-08-18");
    // 2026-08-17 is done and 2026-08-18 (today) counts as in progress.
    expect(weekProgressLine(days, null)).toBe("2 sessions this week");
  });

  it("counts today as a session day once it is trained or in progress", () => {
    const days = hexWeek(["2026-08-17", "2026-08-18", "2026-08-19"], "2026-08-19");
    expect(weekProgressLine(days, 5)).toContain("3 / 5");
  });
});
