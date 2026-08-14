import { describe, it, expect } from "vitest";
import {
  LINKABLE,
  LINKABLE_TYPES,
  RELATIONS,
  DEFAULT_RELATION,
  isLinkableType,
  linkKey,
  alreadyLinked,
  canLink,
  otherEnd,
  neighbours,
  groupedNeighbours,
  linkCount,
  noteTitle,
  noteHasContent,
  searchNotes,
  parseTags,
  isEditableNote,
  type LinkRow,
} from "../src/lib/links";

let n = 0;
function link(
  from: [string, string],
  to: [string, string],
  relation = DEFAULT_RELATION
): LinkRow {
  return {
    id: `l${++n}`,
    from_type: from[0],
    from_id: from[1],
    to_type: to[0],
    to_id: to[1],
    relation,
  };
}

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

describe("the linkable registry", () => {
  it("gives every type a label, a table and an href", () => {
    for (const t of LINKABLE_TYPES) {
      const spec = LINKABLE[t];
      expect(spec.label).toBeTruthy();
      expect(spec.table).toBeTruthy();
      expect(spec.titleColumn).toBeTruthy();
      expect(spec.href("abc")).toMatch(/^\//);
    }
  });

  it("is a closed set — an unknown type is not linkable", () => {
    // from_type is free text in the database, so this guard at the seam is
    // the only thing stopping an unrenderable row being written.
    expect(isLinkableType("note")).toBe(true);
    expect(isLinkableType("widget")).toBe(false);
    expect(isLinkableType("")).toBe(false);
    expect(isLinkableType(null)).toBe(false);
    expect(isLinkableType(7)).toBe(false);
  });

  it("says plainly which types have a page of their own", () => {
    // A chip that looks like a deep link and lands on a list is a small lie,
    // so `reach` is recorded and the UI dims what it cannot open precisely.
    expect(LINKABLE.note.reach).toBe("item");
    expect(LINKABLE.pillar.reach).toBe("item");
    expect(LINKABLE.venture.reach).toBe("item");
    expect(LINKABLE.task.reach).toBe("list");
    expect(LINKABLE.goal.reach).toBe("list");
  });

  it("addresses a division by id, so a rename cannot break the link", () => {
    // The hand-mapped version of this broke once when "A to Z Trailerz"
    // became "A to Z Traderz". /empire/[id] resolves a uuid as well as a slug.
    expect(LINKABLE.venture.href("uuid-1")).toBe("/empire/uuid-1");
  });

  it("ships exactly one relation, and it is the column default", () => {
    // A vocabulary nobody needs is a question standing between a thought and
    // it being recorded. A second relation arrives when the UI renders it
    // differently, not before.
    expect(RELATIONS).toEqual(["relates_to"]);
    expect(DEFAULT_RELATION).toBe("relates_to");
  });
});

/* ------------------------------------------------------------------ *
 * Direction — stored one way, read both
 * ------------------------------------------------------------------ */

describe("neighbours", () => {
  const NOTE = { type: "note", id: "n1" } as const;

  it("finds a link pointing AWAY from the subject", () => {
    const ls = [link(["note", "n1"], ["pillar", "p1"])];
    expect(neighbours(ls, NOTE)).toEqual([
      { type: "pillar", id: "p1", linkId: "l1", relation: "relates_to" },
    ]);
  });

  it("finds a link pointing AT the subject", () => {
    // This is the whole point. If backlinks only looked one way, linking a
    // note to an area would show on the note and be invisible on the area —
    // which is what makes people stop linking things.
    const ls = [link(["pillar", "p1"], ["note", "n1"])];
    expect(neighbours(ls, NOTE).map((x) => x.id)).toEqual(["p1"]);
  });

  it("shows the same relationship once, whichever way round it was written", () => {
    const ls = [
      link(["note", "n1"], ["pillar", "p1"]),
      link(["pillar", "p1"], ["note", "n1"]),
    ];
    expect(neighbours(ls, NOTE)).toHaveLength(1);
    // The FIRST row wins, so the UI offers to remove exactly that one and the
    // duplicate surfaces on the next load rather than both vanishing at once.
    expect(neighbours(ls, NOTE)[0].linkId).toBe(ls[0].id);
  });

  it("ignores links that do not touch the subject at all", () => {
    const ls = [link(["task", "t1"], ["pillar", "p1"])];
    expect(neighbours(ls, NOTE)).toEqual([]);
  });

  it("drops a self-link rather than listing the page under itself", () => {
    // Refused at creation too, but a row written by hand in the SQL editor
    // must not be able to make a page list itself forever.
    const ls = [link(["note", "n1"], ["note", "n1"])];
    expect(neighbours(ls, NOTE)).toEqual([]);
    expect(otherEnd(ls[0], NOTE)).toBeNull();
  });

  it("drops a row whose type the registry does not recognise", () => {
    // Unrenderable rather than dangerous: no label, no href, nothing to draw.
    const ls = [link(["note", "n1"], ["widget", "w1"])];
    expect(neighbours(ls, NOTE)).toEqual([]);
  });

  it("counts the neighbourhood, not the rows", () => {
    const ls = [
      link(["note", "n1"], ["pillar", "p1"]),
      link(["pillar", "p1"], ["note", "n1"]),
      link(["note", "n1"], ["task", "t1"]),
    ];
    expect(linkCount(ls, NOTE)).toBe(2);
  });

  it("returns nothing for a subject with no links", () => {
    expect(neighbours([], NOTE)).toEqual([]);
    expect(linkCount([], NOTE)).toBe(0);
  });
});

describe("groupedNeighbours", () => {
  it("groups in registry order, not by count", () => {
    // The same subject must render its links the same way every time. A group
    // that reorders as links are added is a page you have to re-read.
    const subject = { type: "pillar", id: "p1" } as const;
    const ls = [
      link(["task", "t1"], ["pillar", "p1"]),
      link(["task", "t2"], ["pillar", "p1"]),
      link(["note", "n1"], ["pillar", "p1"]),
    ];
    const g = groupedNeighbours(ls, subject);
    expect(g.map((x) => x.type)).toEqual(["note", "task"]);
    expect(g[0].items).toHaveLength(1);
    expect(g[1].items).toHaveLength(2);
  });

  it("omits empty groups entirely", () => {
    const g = groupedNeighbours(
      [link(["note", "n1"], ["pillar", "p1"])],
      { type: "note", id: "n1" }
    );
    expect(g).toHaveLength(1);
    expect(g[0].type).toBe("pillar");
  });
});

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

describe("canLink", () => {
  const A = { type: "note", id: "n1" } as const;
  const B = { type: "pillar", id: "p1" } as const;

  it("allows a fresh link between two different things", () => {
    expect(canLink([], A, B)).toEqual({ ok: true });
  });

  it("refuses linking a thing to itself", () => {
    const r = canLink([], A, { type: "note", id: "n1" });
    expect(r.ok).toBe(false);
  });

  it("refuses a duplicate written the SAME way round", () => {
    expect(canLink([link(["note", "n1"], ["pillar", "p1"])], A, B).ok).toBe(false);
  });

  it("refuses a duplicate written the OTHER way round", () => {
    // Stricter than the database's unique index on purpose: the index is
    // directional and would happily hold both rows, but a system that reads
    // links both ways would then render the relationship twice on both pages.
    expect(canLink([link(["pillar", "p1"], ["note", "n1"])], A, B).ok).toBe(false);
  });

  it("refuses a type the registry does not know", () => {
    const r = canLink([], A, { type: "widget" as never, id: "w1" });
    expect(r.ok).toBe(false);
  });

  it("gives a reason a person can read", () => {
    const r = canLink([], A, { type: "note", id: "n1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });

  it("keys a link on the whole tuple, matching the database", () => {
    expect(
      linkKey({
        from_type: "note",
        from_id: "n1",
        to_type: "pillar",
        to_id: "p1",
        relation: "relates_to",
      })
    ).toBe("note|n1|pillar|p1|relates_to");
  });

  it("does not treat different relations as the same link", () => {
    const ls = [link(["note", "n1"], ["pillar", "p1"], "relates_to")];
    expect(alreadyLinked(ls, A, B, "relates_to")).toBe(true);
    expect(alreadyLinked(ls, A, B, "supports")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */

describe("noteTitle", () => {
  it("uses the title when there is one", () => {
    expect(noteTitle({ title: "Rent Smart Wales", body: "anything" })).toBe(
      "Rent Smart Wales"
    );
  });

  it("falls back to the first line of the body", () => {
    // The floor for writing a note is a body and nothing else. Demanding a
    // title first is the same obstacle as demanding an area.
    expect(noteTitle({ title: null, body: "Ring the council\nthen the agent" })).toBe(
      "Ring the council"
    );
  });

  it("treats whitespace as absent, not as a title", () => {
    expect(noteTitle({ title: "   ", body: "Real content" })).toBe("Real content");
  });

  it("skips blank leading lines", () => {
    expect(noteTitle({ title: null, body: "\n\n  Something\nelse" })).toBe("Something");
  });

  it("strips a markdown heading marker rather than showing it", () => {
    expect(noteTitle({ title: null, body: "## Council tax" })).toBe("Council tax");
  });

  it("truncates a long first line with an ellipsis", () => {
    const long = "x".repeat(200);
    const t = noteTitle({ title: null, body: long }, 20);
    expect(t).toHaveLength(20);
    expect(t?.endsWith("…")).toBe(true);
  });

  it("returns null when there is genuinely nothing", () => {
    // Null rather than "Untitled", so the caller can tell an empty note from
    // one actually called Untitled.
    expect(noteTitle({ title: null, body: null })).toBeNull();
    expect(noteTitle({ title: "", body: "   \n  " })).toBeNull();
  });
});

describe("noteHasContent", () => {
  it("accepts a body alone, or a title alone", () => {
    expect(noteHasContent({ title: null, body: "something" })).toBe(true);
    expect(noteHasContent({ title: "something", body: null })).toBe(true);
  });

  it("rejects whitespace, so a stray tap cannot create a row", () => {
    expect(noteHasContent({ title: "  ", body: "\n\t " })).toBe(false);
    expect(noteHasContent({ title: null, body: null })).toBe(false);
  });
});

describe("searchNotes", () => {
  const notes = [
    { title: "Rent Smart Wales", body: "landlord licence", tags: ["property"] },
    { title: "CIS", body: "subcontractor deduction", tags: ["ventures", "tax"] },
    { title: null, body: "Ring Advantis", tags: [] },
  ];

  it("returns everything for an empty query", () => {
    expect(searchNotes(notes, "")).toHaveLength(3);
    expect(searchNotes(notes, "   ")).toHaveLength(3);
  });

  it("matches title, body and tags alike", () => {
    expect(searchNotes(notes, "licence")).toHaveLength(1);
    expect(searchNotes(notes, "advantis")).toHaveLength(1);
    expect(searchNotes(notes, "tax")).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    expect(searchNotes(notes, "RENT smart")).toHaveLength(1);
  });

  it("requires every term, because OR returns the whole vault", () => {
    expect(searchNotes(notes, "rent wales")).toHaveLength(1);
    expect(searchNotes(notes, "rent advantis")).toHaveLength(0);
  });

  it("handles a note with no title and no tags", () => {
    expect(searchNotes(notes, "ring")).toHaveLength(1);
  });
});

describe("parseTags", () => {
  it("lower-cases, trims and drops blanks", () => {
    expect(parseTags(" Property , TAX ,, ")).toEqual(["property", "tax"]);
  });

  it("de-duplicates but keeps the order they were typed", () => {
    // The first tag is what a narrow row shows, so it should be the one typed
    // first rather than whatever sorting decides.
    expect(parseTags("b, a, b")).toEqual(["b", "a"]);
  });

  it("slugs internal whitespace so a tag is one token", () => {
    expect(parseTags("council tax")).toEqual(["council-tax"]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags("  ,  ")).toEqual([]);
  });
});

describe("isEditableNote", () => {
  it("edits plain notes", () => {
    expect(isEditableNote({ kind: "note" })).toBe(true);
    expect(isEditableNote({})).toBe(true);
  });

  it("refuses principles and the creed", () => {
    // They carry Jay's own marks in `meta` — jay_marked, jay_circled,
    // jay_handwritten — which exist nowhere else. An accidental save from a
    // general-purpose editor would destroy provenance that cannot be rebuilt.
    expect(isEditableNote({ kind: "principle" })).toBe(false);
    expect(isEditableNote({ kind: "creed" })).toBe(false);
  });
});
