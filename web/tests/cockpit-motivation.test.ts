import { describe, it, expect } from "vitest";
import {
  MOTIVATION_MAX_LEN,
  readMotivationBody,
  motivationFrom,
  latestMotivation,
} from "../src/lib/cockpit/motivation";
import { assertSingleEmitter } from "../src/lib/cockpit/types";

describe("readMotivationBody", () => {
  it("trims and returns a real entry", () => {
    expect(readMotivationBody("  keep going  ")).toBe("keep going");
  });

  it("returns null for blank input, never an empty string", () => {
    expect(readMotivationBody("")).toBeNull();
    expect(readMotivationBody("   ")).toBeNull();
  });

  it("caps length rather than rejecting", () => {
    const long = "x".repeat(MOTIVATION_MAX_LEN + 50);
    expect(readMotivationBody(long)!.length).toBe(MOTIVATION_MAX_LEN);
  });
});

describe("motivationFrom / latestMotivation", () => {
  it("maps rows and picks the first as latest — order is the caller's job", () => {
    const rows = [
      { id: "2", body: "second", created_at: "2026-08-18T10:00:00Z" },
      { id: "1", body: "first", created_at: "2026-08-17T10:00:00Z" },
    ];
    const entries = motivationFrom(rows);
    expect(entries).toHaveLength(2);
    expect(latestMotivation(entries)?.id).toBe("2");
  });

  it("returns null for an empty roster rather than throwing", () => {
    expect(latestMotivation([])).toBeNull();
  });
});

describe("assertSingleEmitter", () => {
  it("passes a manifest with zero or one emitter", () => {
    expect(() =>
      assertSingleEmitter({
        name: "brain",
        widgets: [
          { id: "a", title: "A", column: "today", emits: true },
          { id: "b", title: "B", column: "system" },
        ],
      })
    ).not.toThrow();
  });

  it("throws on two emitters", () => {
    expect(() =>
      assertSingleEmitter({
        name: "brain",
        widgets: [
          { id: "a", title: "A", column: "today", emits: true },
          { id: "b", title: "B", column: "system", emits: true },
        ],
      })
    ).toThrow(/2 emitting widgets/);
  });
});
