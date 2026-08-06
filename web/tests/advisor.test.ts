/* ====================================================================
 * STAGE 4 · PHASE E — the advisor
 *
 * Locked decision 6:
 *
 *   "AI = briefing + retrieval advisor. Morning brief from own data;
 *    ask-anything over notes with citations; review assistant drafting from
 *    evidence. Advisory, never autonomous."
 *
 * The failure mode here is different from every other phase. Elsewhere a bug
 * shows a wrong number or edits a calendar; here a bug produces a confident
 * paragraph that sounds like Jay's own notes and isn't. So the tests below
 * are mostly about grounding: what the model is allowed to see, what counts
 * as a citation, and what the system does when an answer asserts something
 * with nothing behind it.
 * ==================================================================== */

import { describe, it, expect } from "vitest";
import {
  ADVISOR_NEVER_WRITES,
  ADVISOR_SYSTEM,
  REVIEW_SYSTEM,
  MAX_SOURCES,
  RETRIEVAL_CEILING,
  terms,
  scoreNote,
  passageFor,
  retrieve,
  citedNumbers,
  invalidCitations,
  uncitedSentences,
  checkAnswer,
  buildPrompt,
  worthAsking,
  morningBrief,
  briefSources,
  reviewEvidence,
  evidenceLines,
  buildReviewPrompt,
  enoughEvidence,
  advisorState,
  suggestedQuestions,
  comingUp,
  BRIEF_LOOKAHEAD,
  type Source,
} from "../src/lib/advisor";
import { PRINCIPLES_NEVER_PUSH, type Note, type Task } from "../src/lib/types";
import type { WatchAlert } from "../src/lib/logic";

/* -- fixtures ------------------------------------------------------- */

const TODAY = "2026-08-06";

const note = (over: Partial<Note> & { id: string }): Note => ({
  title: null,
  body: null,
  kind: "note",
  tags: [],
  starred: false,
  pillar_id: null,
  ...over,
});

const VAULT: Note[] = [
  note({
    id: "n1",
    title: "Starting a business",
    kind: "principle",
    tags: ["money", "business"],
    body: "Do not borrow to start. Test demand with the cheapest thing you can build. Keep the first customer close.",
  }),
  note({
    id: "n2",
    title: "The creed",
    kind: "creed",
    body: "Provide. Build. Be the man they can rely on.",
  }),
  note({
    id: "n3",
    title: "Kathleen St notes",
    tags: ["property"],
    body: "The arrears came from the void period. Rent Smart Wales registration is outstanding. Renovate room by room.",
  }),
  note({ id: "n4", title: "Nothing relevant", body: "A shopping list." }),
];

const src = (over: Partial<Source> = {}): Source => ({
  n: 1,
  id: "n1",
  title: "A note",
  kind: "note",
  passage: "…",
  score: 1,
  ...over,
});

/* ================================================================== *
 * "Advisory, never autonomous"
 * ================================================================== */

describe("advisory, never autonomous", () => {
  it("is written down as a constant, not just as an intention", () => {
    expect(ADVISOR_NEVER_WRITES).toBe(true);
  });

  it("tells the model it takes no actions and claims none", () => {
    // The prompt is the model's half of the rule; the routes are the other
    // half (they only ever SELECT). Both have to say it.
    expect(ADVISOR_SYSTEM).toContain("advisory");
    expect(ADVISOR_SYSTEM.toLowerCase()).toContain("never take an action");
  });

  it("tells the review assistant it is drafting, not judging", () => {
    expect(REVIEW_SYSTEM).toContain("draft he will edit");
    expect(REVIEW_SYSTEM.toLowerCase()).toContain("do not congratulate");
  });

  it("keeps the prompts short rather than shouting", () => {
    // Emphasis written for models that needed shouting at makes this one
    // hedge. If a future edit fills these with CRITICAL/MUST, that is a
    // regression worth failing on.
    for (const p of [ADVISOR_SYSTEM, REVIEW_SYSTEM]) {
      expect(p).not.toMatch(/CRITICAL|YOU MUST|ALWAYS\b/);
      expect(p.length).toBeLessThan(1200);
    }
  });
});

/* ================================================================== *
 * Retrieval — what the model is allowed to see
 * ================================================================== */

describe("terms", () => {
  it("keeps the words that carry the question", () => {
    expect(terms("What did I write about starting a business?")).toEqual([
      "write",
      "starting",
      "business",
    ]);
  });

  it("is empty for a question made entirely of filler", () => {
    expect(terms("what is it")).toEqual([]);
    expect(terms("")).toEqual([]);
    expect(terms("   ")).toEqual([]);
  });
});

describe("scoreNote", () => {
  it("weights a title hit above a body hit", () => {
    const inTitle = note({ id: "a", title: "Business", body: "nothing here" });
    const inBody = note({ id: "b", title: "Nothing", body: "business business" });
    expect(scoreNote(inTitle, ["business"])).toBeGreaterThan(
      scoreNote(inBody, ["business"])
    );
  });

  it("rewards covering every term over repeating one", () => {
    const both = note({ id: "a", body: "rent smart wales registration" });
    const oneRepeated = note({ id: "b", body: "rent rent rent rent rent" });
    const q = ["rent", "wales"];
    expect(scoreNote(both, q)).toBeGreaterThan(scoreNote(oneRepeated, q));
  });

  it("scores nothing for an empty query or an empty note", () => {
    expect(scoreNote(note({ id: "a", body: "anything" }), [])).toBe(0);
    expect(scoreNote(note({ id: "a" }), ["business"])).toBe(0);
  });
});

describe("passageFor", () => {
  it("returns a short note whole", () => {
    expect(passageFor("Short body.", ["short"])).toBe("Short body.");
  });

  it("centres the window on where the question is answered", () => {
    const body = `${"filler ".repeat(80)}the answer is rent smart wales${" more".repeat(80)}`;
    const p = passageFor(body, ["wales"], 200);
    expect(p).toContain("wales");
    expect(p.length).toBeLessThan(260);
  });

  it("survives a note with no body at all", () => {
    expect(passageFor(null, ["x"])).toBe("");
  });
});

describe("retrieve", () => {
  it("returns numbered sources, best first", () => {
    const out = retrieve(VAULT, "rent smart wales registration");
    expect(out[0].id).toBe("n3");
    expect(out[0].n).toBe(1);
    expect(out.map((s) => s.n)).toEqual(out.map((_, i) => i + 1));
  });

  it("returns nothing when nothing matches", () => {
    expect(retrieve(VAULT, "submarine navigation")).toEqual([]);
    expect(retrieve(VAULT, "what is it")).toEqual([]);
  });

  /**
   * The pull side of §A7. A principle is reference material he *goes* to —
   * and asking a question is going to it. What the rule forbids is a
   * principle arriving unasked, which is `briefSources` below.
   */
  it("lets him pull a principle by asking for it", () => {
    const out = retrieve(VAULT, "what did I write about starting a business");
    expect(out.some((s) => s.kind === "principle")).toBe(true);
  });

  it("never returns more than the model is meant to read", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      note({ id: `x${i}`, title: "business", body: "business business" })
    );
    expect(retrieve(many, "business").length).toBe(MAX_SOURCES);
  });

  it("is stable for the same question", () => {
    expect(retrieve(VAULT, "business")).toEqual(retrieve(VAULT, "business"));
  });

  it("records the scale at which word matching stops being the right tool", () => {
    // pgvector is enabled and notes.embedding is vector(1536); at eleven
    // notes, matching the words he used beats it. This is the number that
    // says when to revisit that.
    expect(RETRIEVAL_CEILING).toBeGreaterThan(0);
  });
});

/* ================================================================== *
 * Citations — the part that stops a plausible answer passing as a true one
 * ================================================================== */

describe("citations", () => {
  it("reads every distinct citation, in order", () => {
    expect(citedNumbers("First [2]. Second [1]. Again [2].")).toEqual([1, 2]);
    expect(citedNumbers("No citations here.")).toEqual([]);
  });

  it("catches a citation pointing at a source that does not exist", () => {
    const sources = [src({ n: 1 }), src({ n: 2, id: "n2" })];
    expect(invalidCitations("Backed up [1]. Made up [7].", sources)).toEqual([7]);
    expect(invalidCitations("Backed up [1][2].", sources)).toEqual([]);
  });

  it("finds asserting sentences with nothing behind them", () => {
    const answer =
      "Your notes say the arrears came from the void period [1]. You should probably sell the house and move somewhere cheaper instead.";
    const uncited = uncitedSentences(answer);
    expect(uncited).toHaveLength(1);
    expect(uncited[0]).toContain("sell the house");
  });

  it("does not flag questions or short connective lines", () => {
    // These assert nothing, so demanding a citation from them would train
    // the reader to ignore the warning.
    expect(uncitedSentences("Two things stand out.")).toEqual([]);
    expect(
      uncitedSentences(
        "Would you like the detail on the second one, or is the summary enough for now?"
      )
    ).toEqual([]);
  });

  it("calls a fully cited answer grounded and anything else not", () => {
    const sources = [src({ n: 1 })];
    const good = checkAnswer(
      "The arrears came from the void period, and registration is still outstanding [1].",
      sources
    );
    expect(good.grounded).toBe(true);

    const bad = checkAnswer(
      "The arrears came from the void period [1]. You will almost certainly be fined within the month unless you act now.",
      sources
    );
    expect(bad.grounded).toBe(false);
    expect(bad.uncited).toHaveLength(1);

    const fabricated = checkAnswer("As your notes say [4], sell up.", sources);
    expect(fabricated.grounded).toBe(false);
    expect(fabricated.invalid).toEqual([4]);
  });
});

describe("the prompt", () => {
  it("shows the model only the numbered passages", () => {
    const sources = retrieve(VAULT, "rent smart wales");
    const prompt = buildPrompt("Am I registered?", sources);
    expect(prompt).toContain("[1]");
    expect(prompt).toContain("Am I registered?");
    // A note that did not match is not in the prompt, so it cannot be cited.
    expect(prompt).not.toContain("shopping list");
  });

  it("refuses to spend a request the sources cannot answer", () => {
    expect(worthAsking("anything", [])).toBe(false);
    expect(worthAsking("", [src()])).toBe(false);
    expect(worthAsking("what about the arrears", [src()])).toBe(true);
  });
});

/* ================================================================== *
 * The brief — assembled, and never a push surface for principles
 * ================================================================== */

const alert = (text: string): WatchAlert => ({
  kind: "overdue",
  label: "Overdue",
  text,
  href: "/planner",
});

const baseBrief = {
  todayIso: TODAY,
  greeting: "Good morning",
  alerts: [] as WatchAlert[],
  tasksToday: [] as Pick<Task, "id" | "title" | "status">[],
  habitsDone: { done: 6, of: 6 },
  debtKnown: null,
  debtComplete: true,
  onboarded: { done: 17, total: 17 },
  conflicts: 0,
  unsynced: 0,
};

describe("morningBrief", () => {
  it("says nothing rather than inventing something to say", () => {
    const b = morningBrief(baseBrief);
    expect(b.quiet).toBe(true);
    expect(b.items).toEqual([]);
  });

  it("puts what is slipping above everything else", () => {
    const b = morningBrief({
      ...baseBrief,
      alerts: [alert("Ring the council — 3 days late")],
      habitsDone: { done: 1, of: 6 },
      onboarded: { done: 0, total: 17 },
    });
    expect(b.items[0].kind).toBe("attention");
    expect(b.items[0].text).toContain("3 days late");
  });

  it("counts only work still to do as today's work", () => {
    const b = morningBrief({
      ...baseBrief,
      tasksToday: [
        { id: "a", title: "Ring the council", status: "open" },
        { id: "b", title: "Already done", status: "done" },
      ],
    });
    const today = b.items.find((i) => i.kind === "today");
    expect(today?.text).toContain("One thing");
    expect(today?.text).toContain("Ring the council");
  });

  it("raises a calendar conflict and says nothing was changed", () => {
    const b = morningBrief({ ...baseBrief, conflicts: 2 });
    const c = b.items.find((i) => i.kind === "calendar");
    expect(c?.text).toContain("2 calendar conflicts");
    expect(c?.text).toContain("nothing has been changed");
  });

  it("says the debt total is partial rather than quoting it as a total", () => {
    const b = morningBrief({ ...baseBrief, debtKnown: 8317, debtComplete: false });
    expect(b.items.some((i) => i.text.includes("still partial"))).toBe(true);
    // And never prints the partial figure as if it were the answer.
    expect(b.items.some((i) => i.text.includes("8317"))).toBe(false);
  });

  it("stays quiet about habits once they are all ticked", () => {
    expect(
      morningBrief({ ...baseBrief, habitsDone: { done: 6, of: 6 } }).items
    ).toEqual([]);
    expect(
      morningBrief({ ...baseBrief, habitsDone: { done: 0, of: 0 } }).items
    ).toEqual([]);
  });
});

/**
 * The push side of §A7, and the reason the rule is in code rather than in a
 * comment: the brief arrives without being asked for, so a principle must
 * never reach it. The creed is the one exception — he wrote it himself.
 */
describe("briefSources", () => {
  it("keeps every principle out of a surface that arrives unasked", () => {
    const kinds = briefSources(VAULT).map((n) => n.kind);
    expect(kinds).not.toContain("principle");
    expect(PRINCIPLES_NEVER_PUSH).toBe(true);
  });

  it("keeps the creed, because he wrote that one", () => {
    expect(briefSources(VAULT).some((n) => n.kind === "creed")).toBe(true);
  });

  it("leaves ordinary notes alone", () => {
    expect(briefSources(VAULT).map((n) => n.id)).toEqual(["n2", "n3", "n4"]);
  });
});

/* ================================================================== *
 * The review assistant — evidence first
 * ================================================================== */

const week = { weekStart: "2026-08-03", weekEnd: "2026-08-09" };

describe("reviewEvidence", () => {
  const tasks = [
    { title: "Rang the council", status: "done" as const, do_date: "2026-08-04", completed_at: "2026-08-04T10:00:00Z" },
    { title: "Still to do", status: "open" as const, do_date: "2026-08-05" },
    { title: "Last month", status: "done" as const, do_date: "2026-07-01", completed_at: "2026-07-01T10:00:00Z" },
    { title: "Next week", status: "open" as const, do_date: "2026-08-20" },
  ];

  it("separates what finished from what slipped, inside the week only", () => {
    const e = reviewEvidence({
      ...week,
      tasks,
      habits: [{ name: "Training", days: ["2026-08-03", "2026-08-05", "2026-07-01"] }],
      hoursAssigned: 12,
      hoursOf: 32,
      obstacles: ["fatigue"],
    });
    expect(e.done).toEqual(["Rang the council"]);
    expect(e.slipped).toEqual(["Still to do"]);
    // The habit day outside the week does not count towards it.
    expect(e.habits[0]).toEqual({ name: "Training", hits: 2, of: 7 });
  });

  it("reports an empty week as empty rather than as a good one", () => {
    const e = reviewEvidence({
      ...week,
      tasks: [],
      habits: [],
      hoursAssigned: 0,
      hoursOf: 0,
      obstacles: [],
    });
    expect(enoughEvidence(e)).toBe(false);
    expect(evidenceLines(e)[0]).toContain("nothing recorded");
  });

  it("has enough to draft from once anything real is on record", () => {
    const base = { ...week, tasks: [], habits: [], hoursAssigned: 0, hoursOf: 16, obstacles: [] };
    expect(enoughEvidence(reviewEvidence({ ...base, hoursAssigned: 4 }))).toBe(true);
    expect(
      enoughEvidence(
        reviewEvidence({ ...base, habits: [{ name: "Training", days: ["2026-08-04"] }] })
      )
    ).toBe(true);
  });

  it("builds a prompt out of facts and nothing else", () => {
    const e = reviewEvidence({
      ...week,
      tasks,
      habits: [],
      hoursAssigned: 12,
      hoursOf: 32,
      obstacles: ["fatigue"],
    });
    const prompt = buildReviewPrompt(e);
    expect(prompt).toContain("Rang the council");
    expect(prompt).toContain("12 of 32");
    expect(prompt).toContain("fatigue");
    // No opinion is smuggled in with the evidence.
    expect(prompt.toLowerCase()).not.toContain("well done");
    expect(prompt.toLowerCase()).not.toContain("should");
  });
});

/* ================================================================== *
 * What the page says
 * ================================================================== */

describe("advisorState", () => {
  it("separates 'no key' from 'the last call failed'", () => {
    expect(advisorState({ configured: false, lastError: null })).toBe("unconfigured");
    expect(advisorState({ configured: true, lastError: null })).toBe("ready");
    expect(advisorState({ configured: true, lastError: "boom" })).toBe("error");
    // A stale error cannot make an unconfigured server look merely broken.
    expect(advisorState({ configured: false, lastError: "boom" })).toBe("unconfigured");
  });
});

describe("suggestedQuestions", () => {
  it("suggests from what the vault actually holds", () => {
    const qs = suggestedQuestions({
      noteCount: 11,
      hasPrinciples: true,
      ventures: [
        { name: "MAINFRAME", external_system: "MAINFRAME" },
        { name: "A to Z Traderz", external_system: null },
      ],
      areas: [{ name: "Property & Assets" }],
    });
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(4);
    // Never suggests asking about the system THE BRAIN does not contain.
    expect(qs.join(" ")).not.toContain("MAINFRAME");
    expect(qs.join(" ")).toContain("A to Z Traderz");
  });

  it("suggests nothing about principles when there are none", () => {
    const qs = suggestedQuestions({
      noteCount: 0,
      hasPrinciples: false,
      ventures: [],
      areas: [],
    });
    expect(qs.join(" ").toLowerCase()).not.toContain("principle");
  });
});

describe("comingUp", () => {
  it("looks only at the window ahead, never behind", () => {
    const items = [
      { title: "yesterday", due_date: "2026-08-05" },
      { title: "today", due_date: TODAY },
      { title: "in the window", due_date: "2026-08-11" },
      { title: "beyond it", due_date: "2026-09-01" },
      { title: "undated", due_date: null },
    ];
    expect(comingUp(items, TODAY).map((i) => i.title)).toEqual([
      "today",
      "in the window",
    ]);
    expect(BRIEF_LOOKAHEAD).toBe(7);
  });
});
