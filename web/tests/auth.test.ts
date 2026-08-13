import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD,
  passwordProblem,
  passwordReady,
  signInMessage,
} from "../src/lib/auth";

describe("password policy", () => {
  it("asks for more than Supabase's default six", () => {
    // Six is a number chosen so nobody complains. This is the front door to
    // every debt balance, every venture and every private note here, and it
    // is typed once and then held by a keychain — so a longer minimum costs
    // nothing and buys something.
    expect(MIN_PASSWORD).toBeGreaterThan(6);
    expect(MIN_PASSWORD).toBe(10);
  });

  it("says nothing about an empty field — blank is not yet wrong", () => {
    expect(passwordProblem("", "")).toBeNull();
    expect(passwordProblem("short", "")).toBe("short");
  });

  it("catches a short password and a mismatch, in that order", () => {
    expect(passwordProblem("abc", "abc")).toBe("short");
    expect(passwordProblem("abcdefghijkl", "abcdefghijk")).toBe("mismatch");
  });

  it("is only ready when both halves agree at full length", () => {
    expect(passwordReady("abcdefghij", "abcdefghij")).toBe(true);
    expect(passwordReady("abcdefghij", "abcdefghi")).toBe(false);
    expect(passwordReady("abc", "abc")).toBe(false);
  });
});

describe("signInMessage", () => {
  it("distinguishes a wrong password from never having set one", () => {
    // Supabase returns the same string for both, and they have different
    // fixes. Guessing silently between them is how someone concludes the
    // app is broken.
    const m = signInMessage("Invalid login credentials");
    expect(m).toContain("never set a password");
  });

  it("explains that a rate limit is the mail service, not the account", () => {
    const m = signInMessage("email rate limit exceeded");
    expect(m).toContain("not on your account");
    expect(m).toContain("password");
  });

  it("passes anything else through rather than inventing a diagnosis", () => {
    expect(signInMessage("Network request failed")).toBe("Network request failed");
  });
});
