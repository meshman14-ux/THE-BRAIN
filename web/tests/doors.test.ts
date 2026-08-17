import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  LIFE_PARENTS,
  EMPIRE_PARENTS,
  pageViews,
  parentsFor,
  subHref,
} from "../src/lib/parents";

/* ==================================================================== *
 * The module doors
 *
 * Each system's landing page is a command centre: it says how things
 * stand, then hands you a door into every module beneath it. The doors
 * are BUILT FROM THE REGISTRY rather than written on the page, which is
 * what stops the two drifting apart — the drift that once left ten nav
 * items pointing at views that did not exist.
 * ==================================================================== */

const life = readFileSync(new URL("../src/app/(app)/life/page.tsx", import.meta.url), "utf8");
const empire = readFileSync(new URL("../src/app/(app)/empire/page.tsx", import.meta.url), "utf8");

describe("both systems land on a command centre with doors", () => {
  it("renders the doors on LIFE_OS and on EMPIRE_OS", () => {
    expect(life).toContain('<ModuleDoors layer="life" />');
    expect(empire).toContain('<ModuleDoors layer="empire" />');
  });

  it("gives each system its OWN layer, never the other's", () => {
    expect(life).not.toContain('layer="empire"');
    expect(empire).not.toContain('layer="life"');
  });

  it("stops hand-writing the module chips the registry already knows", () => {
    // Debts and Vehicles were hard-coded chips in the header while also
    // being Money's sub-modules. Two places naming one module is how one of
    // them goes stale without anything going red.
    //
    // Deep contextual links are NOT the same thing and stay: "creditors →"
    // beside the debt figure is an answer to the number you are looking at,
    // not a second copy of the nav. The test names the chips it removed
    // rather than banning the route, which would have taken that with it.
    expect(life).not.toContain("£ Debts · the creditors");
    expect(life).not.toContain("⛭ Vehicles · tax, MOT, insurance");
  });
});

describe("every door leads somewhere real", () => {
  it("gives every parent a question, an icon and a route", () => {
    for (const p of [...LIFE_PARENTS, ...EMPIRE_PARENTS]) {
      expect(p.question.trim(), p.id).not.toBe("");
      expect(p.icon.trim(), p.id).not.toBe("");
      expect(p.href.startsWith("/"), p.id).toBe(true);
    }
  });

  it("only offers `page` views as doors — a filter is a lens, not a place", () => {
    for (const p of [...LIFE_PARENTS, ...EMPIRE_PARENTS]) {
      for (const v of pageViews(p)) {
        expect(v.kind, `${p.id}:${v.id}`).toBe("page");
        expect(subHref(p, v.id).startsWith("/"), `${p.id}:${v.id}`).toBe(true);
      }
    }
  });

  it("never offers a door back to the page you are already on", () => {
    // Roster IS the People parent. A chip landing on its own parent reads
    // as a broken link even though it resolves.
    for (const p of [...LIFE_PARENTS, ...EMPIRE_PARENTS]) {
      const doors = pageViews(p).filter((v) => subHref(p, v.id) !== p.href);
      for (const v of doors) {
        expect(subHref(p, v.id), `${p.id}:${v.id}`).not.toBe(p.href);
      }
    }
  });

  it("keeps the two systems' parents disjoint", () => {
    const l = new Set(parentsFor("life").map((p) => p.id));
    const e = parentsFor("empire").map((p) => p.id);
    for (const id of e) expect(l.has(id), id).toBe(false);
  });

  it("states a cost for every module, because a costly one ends up empty", () => {
    for (const p of [...LIFE_PARENTS, ...EMPIRE_PARENTS]) {
      expect(["none", "one tap", "weekly", "monthly"]).toContain(p.cost);
    }
  });
});
