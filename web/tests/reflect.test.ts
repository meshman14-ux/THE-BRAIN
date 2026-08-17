import { describe, it, expect } from "vitest";
import {
  countVote,
  energyWord,
  halfForHour,
  isRecorded,
  POSITION_WORD,
  prompt,
  runLength,
  type ReflectionState,
} from "../src/lib/reflect";

const state = (over: Partial<ReflectionState> = {}): ReflectionState => ({
  morningDone: false,
  eveningDone: false,
  unclosedDate: null,
  ...over,
});

describe("halfForHour", () => {
  it("opens on the morning before 11, the evening after", () => {
    expect(halfForHour(7)).toBe("morning");
    expect(halfForHour(10)).toBe("morning");
    expect(halfForHour(11)).toBe("evening");
    expect(halfForHour(21)).toBe("evening");
  });
});

describe("prompt — one nudge with a deadline, everything else quiet", () => {
  it("an unclosed day outranks the clock entirely", () => {
    expect(prompt(9, state({ unclosedDate: "2026-08-16" }))).toMatchObject({
      key: "unclosed",
      tone: "warn",
    });
    expect(prompt(22, state({ unclosedDate: "2026-08-16" })).key).toBe("unclosed");
  });

  it("asks for the plan in the morning and the close at night", () => {
    expect(prompt(8, state()).key).toBe("morning");
    expect(prompt(21, state()).key).toBe("evening");
  });

  it("goes quiet once the half is done, and in the middle of the day", () => {
    expect(prompt(8, state({ morningDone: true })).key).toBe("quiet");
    expect(prompt(21, state({ eveningDone: true })).key).toBe("quiet");
    expect(prompt(15, state()).key).toBe("quiet");
  });

  it("is never louder than 'warn', and only for the deadline", () => {
    expect(prompt(8, state()).tone).toBe("normal");
    expect(prompt(15, state()).tone).toBe("quiet");
  });
});

describe("energyWord", () => {
  it("names the five taps", () => {
    expect(energyWord(1)).toBe("empty");
    expect(energyWord(5)).toBe("strong");
  });
  it("returns null rather than inventing a word", () => {
    expect(energyWord(null)).toBeNull();
    expect(energyWord(undefined)).toBeNull();
    expect(energyWord(0)).toBeNull();
    expect(energyWord(9)).toBeNull();
    expect(energyWord(2.5)).toBeNull();
  });
});

describe("isRecorded — a tap counts", () => {
  it("counts a single energy tap as a reflection", () => {
    expect(isRecorded({ energy: 3 })).toBe(true);
  });
  it("counts a false 'it happened' — answering no is answering", () => {
    expect(isRecorded({ it_happened: false })).toBe(true);
  });
  it("does not count blank text", () => {
    expect(isRecorded({ transcript: "   ", one_thing: "" })).toBe(false);
    expect(isRecorded({})).toBe(false);
  });
});

describe("runLength — today being open never breaks the run", () => {
  it("counts back from today when today is recorded", () => {
    expect(runLength(["2026-08-17", "2026-08-16", "2026-08-15"], "2026-08-17")).toBe(3);
  });

  it("counts yesterday's run when today has not happened yet", () => {
    // The day is not over. A streak that punishes you at breakfast is one you
    // stop looking at.
    expect(runLength(["2026-08-16", "2026-08-15"], "2026-08-17")).toBe(2);
  });

  it("stops at the first real gap", () => {
    expect(runLength(["2026-08-16", "2026-08-14"], "2026-08-17")).toBe(1);
  });

  it("is zero when nothing is recorded", () => {
    expect(runLength([], "2026-08-17")).toBe(0);
    expect(runLength(["2026-08-10"], "2026-08-17")).toBe(0);
  });

  it("crosses a month boundary", () => {
    expect(runLength(["2026-08-01", "2026-07-31"], "2026-08-01")).toBe(2);
  });
});

describe("countVote — counted from the seats, not from the summary line", () => {
  const o = (position: string, seat_key = "sceptic") => ({
    seat_key,
    position,
    argument: "…",
  });

  it("counts each position", () => {
    const v = countVote([o("for", "operator"), o("for", "coach"), o("against")]);
    expect(v).toMatchObject({ for: 2, against: 1, abstain: 0, line: "2–1" });
  });

  it("names abstentions rather than hiding them in the total", () => {
    expect(countVote([o("for"), o("abstain", "coach")]).line).toBe("1–0 (1 abstained)");
  });

  it("flags a unanimous board — that is information, not a success", () => {
    expect(countVote([o("for", "a"), o("for", "b"), o("for", "c")]).unanimous).toBe(true);
    expect(countVote([o("for", "a"), o("against", "b")]).unanimous).toBe(false);
  });

  it("does not call a single opinion unanimous", () => {
    expect(countVote([o("for")]).unanimous).toBe(false);
  });

  it("says 'no vote' rather than 0–0 when every seat abstained", () => {
    expect(countVote([o("abstain"), o("abstain", "b")]).line).toBe("no vote");
  });

  it("names positions in the board's own words", () => {
    expect(POSITION_WORD.abstain).toBe("abstained");
  });
});
