import { describe, it, expect } from "vitest";
import { badHeaderChar, describeChar } from "../src/lib/invoke";

/* ==================================================================== *
 * Header safety
 *
 * `supabase.functions.invoke` failed in the browser with "Failed to
 * construct 'Request': 'headers' … is not a valid ByteString" — thrown by
 * fetch BEFORE the request leaves, because a header value contained a
 * character outside Latin-1. That message names nothing a person can act
 * on, which is why we check first and say which value is wrong.
 * ==================================================================== */

describe("badHeaderChar", () => {
  it("passes ordinary tokens and keys", () => {
    expect(badHeaderChar("eyJhbGciOiJIUzI1NiJ9.abc-_123")).toBeNull();
    expect(badHeaderChar("sb_publishable_AbC123")).toBeNull();
    expect(badHeaderChar("https://qttroyuajpyelfrbxzzt.supabase.co")).toBeNull();
  });

  it("passes the whole Latin-1 range, which headers can legally carry", () => {
    expect(badHeaderChar("café £5 ÿ")).toBeNull();
  });

  it("catches the characters a paste actually introduces", () => {
    // Every one of these comes from copying out of a document or a chat
    // rather than from a plain-text field.
    for (const c of ["’", "“", "—", "…", "  "]) {
      const v = `abc${c}def`;
      // A non-breaking space IS Latin-1 and legal; the narrow one is not.
      if (c === "  ") {
        expect(badHeaderChar("abc def")).toBeNull();
        expect(badHeaderChar("abc def")).not.toBeNull();
        continue;
      }
      expect(badHeaderChar(v), c).not.toBeNull();
    }
  });

  it("reports WHERE, so a long key can be repaired", () => {
    expect(badHeaderChar("ab—cd")).toEqual({ char: "—", index: 2 });
  });

  it("finds the first offender, not an arbitrary one", () => {
    expect(badHeaderChar("a—b…c")?.char).toBe("—");
  });

  it("is safe on an empty string", () => {
    expect(badHeaderChar("")).toBeNull();
  });
});

describe("describeChar names things a person can look for", () => {
  it("uses plain words for the common pastes", () => {
    expect(describeChar("’")).toBe("a curly apostrophe");
    expect(describeChar("—")).toBe("an em dash");
  });

  it("falls back to the codepoint rather than to nothing", () => {
    expect(describeChar(" ")).toContain("U+2007");
  });
});
