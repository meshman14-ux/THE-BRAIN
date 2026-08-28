import { describe, it, expect } from "vitest";
import {
  ALL_SURFACES,
  ASK_VIEWS,
  LIBRARY_VIEWS,
  REVIEW_VIEWS,
  SETTINGS_VIEWS,
} from "../src/lib/surfaces";
import { NAV } from "../src/lib/nav";
import { navForMode } from "../src/lib/logic";

/* ------------------------------------------------------------------ *
 * Step 5 — the small merges. Four strips, each turning sibling routes
 * into one surface. The rules are PlanTabs' rules, held here so the
 * next strip added by hand inherits them whether or not anyone rereads
 * the originals.
 * ------------------------------------------------------------------ */

describe("the surface strips", () => {
  it("names the four surfaces and no fifth by accident", () => {
    expect(ALL_SURFACES.map((s) => s.name)).toEqual([
      "ask",
      "review",
      "library",
      "settings",
    ]);
  });

  // A strip must never promise a page that does not exist — the exact
  // failure PLACEHOLDERS existed to make honest, recreated in miniature.
  it("points every view at a real route", () => {
    const real = new Set([
      "/advisor",
      "/advisor/board",
      "/advisor/table",
      "/diagnose",
      "/reviews",
      "/reviews/quarterly",
      "/library",
      "/library/notes",
      "/library/principles",
      "/account",
      "/setup",
    ]);
    for (const s of ALL_SURFACES) {
      for (const v of s.views) {
        expect(real.has(v.href), `${s.name}: ${v.href}`).toBe(true);
      }
    }
  });

  it("keys every view uniquely within its strip", () => {
    for (const s of ALL_SURFACES) {
      const keys = s.views.map((v) => v.key);
      expect(new Set(keys).size, s.name).toBe(keys.length);
    }
  });

  it("gives no route two strips — a page carries one surface identity", () => {
    const hrefs = ALL_SURFACES.flatMap((s) => s.views.map((v) => v.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("pairs the two screens that never linked to each other", () => {
    // Advisor and Diagnose had no link in either direction — the only
    // sibling pair in the system that didn't. The strip is that link.
    //
    // The board joined 2026-08-17 and sits BESIDE the advisor rather than
    // replacing it: the advisor is one voice reading your own data back, the
    // board is several voices disagreeing about a decision. The table joined
    // 2026-08-22 — the Peaky Blinders council, two fixed voices in deliberate
    // friction over the problem itself.
    expect(ASK_VIEWS.map((v) => v.href)).toEqual([
      "/advisor",
      "/advisor/board",
      "/advisor/table",
      "/diagnose",
    ]);
  });

  it("holds the other three to what already existed, formalised", () => {
    expect(REVIEW_VIEWS.map((v) => v.key)).toEqual(["weekly", "quarterly"]);
    expect(LIBRARY_VIEWS.map((v) => v.key)).toEqual(["shelves", "notes", "principles"]);
    expect(SETTINGS_VIEWS.map((v) => v.key)).toEqual(["account", "setup"]);
  });
});

describe("the nav after the merges", () => {
  it("keeps Diagnose reachable from every mode, by nav or by strip", () => {
    // Rewritten 2026-08-18. Advisor moved to the TOP BAR and is in every
    // mode there, so Diagnose no longer needs a mode-scoped entry of its
    // own to stay reachable from `empire` — it is one chip past Advisor
    // from anywhere, and the registry keeps its address for ⌘K.
    //
    // The rule this test has always been about is unchanged: a surface
    // must never be reachable from a mode only by knowing the address.
    for (const mode of ["brain", "life", "empire"] as const) {
      const hrefs = navForMode(NAV, mode).map((n) => n.href);
      expect(hrefs, `advisor in ${mode}`).toContain("/advisor");
    }
    expect(NAV.find((n) => n.href === "/advisor")!.topbar).toBe(true);
    expect(ASK_VIEWS.map((v) => v.href)).toContain("/diagnose");
  });

  it("leaves Setup without a nav item, now with a stable second door", () => {
    // Setup is reached from the dashboard's one line, from /life, and now
    // from Account's strip. Still no nav slot — the one line above the
    // dashboard is its front door, and a nav item would be a standing
    // invitation to a page whose whole aim is to empty itself.
    for (const mode of ["brain", "life", "empire"] as const) {
      expect(navForMode(NAV, mode).map((n) => n.href)).not.toContain("/setup");
    }
  });
});
