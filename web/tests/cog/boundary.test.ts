/**
 * THE COG — the purity boundary, enforced rather than intended.
 *
 * `advise()` being a pure function is the claim the whole module rests on:
 * it is why a past day can be replayed, why the rules are testable without
 * a database, and why the determinism test means anything. A claim like
 * that decays the first time somebody reaches for the Supabase client
 * "just here, just once" — so it is checked mechanically.
 *
 * The same guard HYBRID has, for the same reason.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { advise, defaultConfig } from "../../src/lib/cog";
import { baseProfile, baseState } from "./base-state";

const ENGINE = join(process.cwd(), "src", "lib", "cog");
const FILES = readdirSync(ENGINE).filter((f) => f.endsWith(".ts"));

/** Imports that would break replay, testability, or both. */
const FORBIDDEN = [
  { pattern: /from\s+["']@\/lib\/supabase/, why: "the engine must not reach a database" },
  { pattern: /from\s+["']next\//, why: "the engine must not know it is in a web app" },
  { pattern: /from\s+["']react["']/, why: "the engine must not know about rendering" },
  { pattern: /from\s+["']\.\.\//, why: "the engine must not import from outside its own folder" },
];

describe("the engine imports nothing from outside itself", () => {
  it("has files to check", () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  for (const file of FILES) {
    it(file, () => {
      const src = readFileSync(join(ENGINE, file), "utf8");
      for (const { pattern, why } of FORBIDDEN) {
        expect(pattern.test(src), `${file}: ${why}`).toBe(false);
      }
    });
  }
});

describe("the engine reads no clock and rolls no dice", () => {
  for (const file of FILES) {
    it(file, () => {
      const src = readFileSync(join(ENGINE, file), "utf8")
        // Comments explain these prohibitions, so they must not trip them.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      // `now` is INJECTED into the state by the orchestrator. A rule that
      // reads the system clock cannot be tested and cannot be replayed:
      // the same stored state would give a different answer tomorrow.
      expect(/Date\.now\s*\(/.test(src), `${file}: reads the clock`).toBe(false);
      expect(/new Date\s*\(\s*\)/.test(src), `${file}: reads the clock`).toBe(false);
      expect(/Math\.random/.test(src), `${file}: rolls dice`).toBe(false);
    });
  }
});

describe("determinism, stated plainly", () => {
  it("gives byte-identical advice for the same state, config and profile", () => {
    const state = baseState();
    const a = JSON.stringify(advise(state, baseProfile(), defaultConfig));
    const b = JSON.stringify(advise(state, baseProfile(), defaultConfig));
    expect(a).toBe(b);
  });

  it("does not mutate the state it was given", () => {
    // The orchestrator persists the state it passed in. If `advise()`
    // edited it, the stored row would be the state AFTER thinking, and
    // replaying it would silently prove nothing.
    const state = baseState();
    const before = JSON.stringify(state);
    advise(state, baseProfile(), defaultConfig);
    expect(JSON.stringify(state)).toBe(before);
  });
});
