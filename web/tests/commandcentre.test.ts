import { describe, it, expect } from "vitest";
import {
  KIND_WORD,
  moveCursor,
  normalise,
  RESULT_LIMIT,
  score,
  search,
  type Target,
} from "../src/lib/commandk";
import {
  ESTATE_ORDER,
  estateLine,
  estateState,
  groupEstate,
  isSubject,
  type VentureLike,
} from "../src/lib/estate";

const t = (over: Partial<Target> = {}): Target => ({
  kind: "page",
  id: "1",
  label: "Money",
  href: "/life/money",
  ...over,
});

describe("normalise", () => {
  it("strips punctuation and collapses space", () => {
    expect(normalise("  A to Z  Traderz! ")).toBe("a to z traderz");
    expect(normalise("Kathleen St.")).toBe("kathleen st");
  });
});

describe("score — ordering you can predict", () => {
  it("ranks exact over prefix over word-boundary over substring", () => {
    expect(score(t({ label: "Money" }), "money")).toBe(100);
    expect(score(t({ label: "Money & Security" }), "money")).toBe(80);
    expect(score(t({ label: "Life Money" }), "money")).toBe(60);
    expect(score(t({ label: "Testimony" }), "mony")).toBe(40);
  });

  it("scores a hint-only match lowest — it matched something unseen", () => {
    expect(score(t({ label: "Zafira", hint: "WF57 XWD" }), "wf57")).toBe(20);
  });

  it("matches every word anywhere, so 'kath st' finds 'Kathleen St'", () => {
    expect(score(t({ label: "Kathleen St" }), "kath st")).toBeGreaterThan(0);
  });

  it("returns 0 for no match and for an empty query", () => {
    expect(score(t({ label: "Money" }), "vehicles")).toBe(0);
    expect(score(t({ label: "Money" }), "   ")).toBe(0);
  });

  it("does not throw on regex metacharacters typed into the box", () => {
    expect(() => score(t({ label: "Money" }), "a(b[c")).not.toThrow();
  });
});

describe("search", () => {
  const targets = [
    t({ id: "p", kind: "page", label: "People", href: "/life/people" }),
    t({ id: "v", kind: "venture", label: "Kathleen St", href: "/empire/kathleen-st" }),
    t({ id: "n", kind: "note", label: "Kathleen notes", href: "/library/notes/n" }),
  ];

  it("returns nothing for an empty query — a palette is not a menu", () => {
    expect(search(targets, "")).toEqual([]);
    expect(search(targets, "   ")).toEqual([]);
  });

  it("breaks ties by kind, so a page outranks a note", () => {
    const pages = [
      t({ id: "note", kind: "note", label: "Money" }),
      t({ id: "page", kind: "page", label: "Money" }),
    ];
    expect(search(pages, "money")[0].id).toBe("page");
  });

  it("caps the list", () => {
    const many = Array.from({ length: 30 }, (_, i) => t({ id: String(i), label: `Money ${i}` }));
    expect(search(many, "money")).toHaveLength(RESULT_LIMIT);
    expect(search(many, "money", 3)).toHaveLength(3);
  });

  it("names a venture a division, in Jay's vocabulary", () => {
    expect(KIND_WORD.venture).toBe("division");
  });
});

describe("moveCursor wraps at both ends", () => {
  it("wraps down and up", () => {
    expect(moveCursor(2, 1, 3)).toBe(0);
    expect(moveCursor(0, -1, 3)).toBe(2);
    expect(moveCursor(0, 1, 3)).toBe(1);
  });
  it("never divides by zero on an empty list", () => {
    expect(moveCursor(0, 1, 0)).toBe(0);
  });
});

const v = (over: Partial<VentureLike> = {}): VentureLike => ({
  id: "v1",
  name: "A to Z Traderz",
  stage: "launch",
  status: "active",
  progress: 40,
  ...over,
});

describe("estateState — what it is doing, not what it is labelled", () => {
  it("parked beats any stage, because it is a decision already taken", () => {
    expect(estateState(v({ status: "shelved", stage: "revenue" }))).toBe("parked");
  });
  it("earning means revenue", () => {
    expect(estateState(v({ stage: "revenue" }))).toBe("earning");
  });
  it("an idea is being built, not parked — you still intend to", () => {
    expect(estateState(v({ stage: "idea" }))).toBe("building");
  });
});

describe("isSubject — MAINFRAME is a pointer, never a subject", () => {
  it("excludes an external system", () => {
    expect(isSubject(v({ external_system: "MAINFRAME" }))).toBe(false);
    expect(isSubject(v({ external_system: null }))).toBe(true);
    expect(isSubject(v())).toBe(true);
  });
});

describe("groupEstate", () => {
  it("returns every group even when empty — 'nothing is earning' is the useful sentence", () => {
    const groups = groupEstate([v({ stage: "idea" })]);
    expect(groups.map((g) => g.state)).toEqual(ESTATE_ORDER);
    expect(groups.find((g) => g.state === "earning")!.ventures).toEqual([]);
  });

  it("sorts by progress within a group, then by name", () => {
    const names = groupEstate([
      v({ id: "a", name: "Alpha", progress: 10 }),
      v({ id: "b", name: "Beta", progress: 90 }),
    ])
      .find((g) => g.state === "building")!
      .ventures.map((x) => x.name);
    expect(names).toEqual(["Beta", "Alpha"]);
  });

  it("drops MAINFRAME from every group", () => {
    const groups = groupEstate([v({ external_system: "MAINFRAME" })]);
    expect(groups.every((g) => g.ventures.length === 0)).toBe(true);
  });
});

describe("estateLine says the uncomfortable thing plainly", () => {
  it("leads with 'none earning' when nothing is", () => {
    expect(estateLine([v({ stage: "idea" }), v({ id: "2", status: "shelved" })])).toContain(
      "None earning yet"
    );
  });
  it("counts all three once something earns", () => {
    expect(estateLine([v({ stage: "revenue" }), v({ id: "2", stage: "idea" })])).toContain(
      "1 earning"
    );
  });
  it("says nothing rather than zeroes when there are no divisions", () => {
    expect(estateLine([])).toBe("No divisions yet.");
  });
});
