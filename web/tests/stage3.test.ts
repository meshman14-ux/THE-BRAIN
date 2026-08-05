/* ====================================================================
 * STAGE 3 — principles, the creed, hour purpose, obstacles, habits
 *
 * The four things Jay marked in the margin of a book, turned into rules
 * a machine can check. The two that matter most are negative: the
 * obstacle tally must stay silent below three reviews, and an empty day
 * must produce arithmetic rather than a crash.
 * ==================================================================== */

import { describe, it, expect } from "vitest";
import {
  // principles
  notesOfKind,
  creedNote,
  jayMarks,
  principleSource,
  parsePrincipleBody,
  markedBulletNumbers,
  highlightSegments,
  noteTags,
  filterNotes,
  notesByPillar,
  // hours
  DAY_HOURS,
  DAY_START_HOUR,
  DAY_END_HOUR,
  hourKey,
  hourLabel,
  readHours,
  assignHour,
  clearHour,
  nextPurpose,
  hourStats,
  purposeSplit,
  type HourMap,
  // obstacles + the review week
  MIN_REVIEWS_FOR_TALLY,
  obstacleKey,
  obstacleLabel,
  readObstacles,
  obstacleTally,
  obstacleHeadline,
  reviewPeriod,
  daysUntilWeeklyReview,
  addDays,
  mondayOf,
  // habits
  logDaysFor,
  habitRows,
  habitsDoneToday,
} from "../src/lib/logic";
import { CREED, creedLines, creedFrom, creedLineOfDay } from "../src/lib/creed";
import {
  HOUR_PURPOSES,
  OBSTACLES,
  type HabitLog,
  type Note,
} from "../src/lib/types";
import {
  BUILT_BRANCHES,
  branchName,
  branchHref,
  placeholderFor,
} from "../src/lib/placeholders";

/* -- fixtures ------------------------------------------------------- */

const note = (over: Partial<Note> & { id: string }): Note => ({
  title: null,
  body: null,
  kind: "principle",
  tags: [],
  starred: false,
  pillar_id: null,
  meta: null,
  ...over,
});

/** The real shape of a seeded principle, so the parser is tested on truth. */
const TIME_NOTE = note({
  id: "time",
  title: "7 Ways to Use Your Time More Intentionally",
  pillar_id: "mind",
  tags: ["principle", "time", "marked"],
  starred: true,
  body: [
    "1. Know where your time actually goes. Spend a day noticing where minutes slip — scrolling, chatting, wandering. Awareness creates control.",
    '2. Define what "a good day" means to you: progress, peace, productivity, or balance.',
    "3. Give every hour a purpose. Not rigid schedules — intention. Label each hour: work, rest, learning, cleaning, connecting. Unassigned hours invite distraction.",
  ].join("\n"),
  meta: {
    page: 24,
    source: "Harvard-Fiction KH",
    jay_marked: ["3 — Give every hour a purpose"],
    jay_circled: ["scrolling", "work", "rest"],
  },
});

const QUOTED_NOTE = note({
  id: "money",
  title: "How to Set Financial Goals",
  pillar_id: "money",
  tags: ["principle", "money", "debt"],
  body: [
    '"A goal without a plan is just a wish." — Antoine de Saint-Exupéry',
    "",
    "1. Identify what you truly want.",
    "2. Write down your goals clearly.",
  ].join("\n"),
  meta: { page: 106, source: "Harvard-Fiction KH" },
});

const CREED_NOTE = note({
  id: "creed",
  kind: "creed",
  title: "The creed",
  body: CREED.join("\n\n"),
});

/* -- the principle library ------------------------------------------ */

describe("the principle library", () => {
  it("picks out one kind and leaves the others alone", () => {
    const all = [TIME_NOTE, QUOTED_NOTE, CREED_NOTE, note({ id: "n", kind: "note" })];
    // Ordered by title, so "7 Ways to Use Your Time" lands before "How to
    // Set Financial Goals" — stable, and independent of what came back.
    expect(notesOfKind(all, "principle").map((n) => n.id)).toEqual(["time", "money"]);
    expect(creedNote(all)?.id).toBe("creed");
    expect(creedNote([TIME_NOTE])).toBeNull();
  });

  it("reads Jay's marks out of meta and says when there are none", () => {
    const m = jayMarks(TIME_NOTE);
    expect(m.marked).toEqual(["3 — Give every hour a purpose"]);
    expect(m.circled).toEqual(["scrolling", "work", "rest"]);
    expect(m.any).toBe(true);

    const plain = jayMarks(QUOTED_NOTE);
    expect(plain.any).toBe(false);
    expect(plain.marked).toEqual([]);
  });

  it("survives a meta field that is the wrong shape entirely", () => {
    // meta is free-form jsonb. A page he opened to read must not throw
    // because something stored a string where an array was expected.
    const wrong = note({
      id: "wrong",
      meta: {
        jay_marked: "not an array",
        jay_circled: [1, null, "kept", "  "],
        jay_highlighted_all: "yes",
      },
    });
    const m = jayMarks(wrong);
    expect(m.marked).toEqual([]);
    expect(m.circled).toEqual(["kept"]);
    expect(m.highlightedAll).toBe(false); // only a literal true counts
    expect(m.any).toBe(true);

    expect(jayMarks(note({ id: "empty" })).any).toBe(false);
    expect(jayMarks({ meta: undefined }).any).toBe(false);
  });

  it("renders a source line, or nothing when there is no source", () => {
    expect(principleSource(TIME_NOTE)).toBe("Harvard-Fiction KH · p.24");
    expect(
      principleSource(note({ id: "x", meta: { page: "5-year plan", source: "KH" } }))
    ).toBe("KH · 5-year plan");
    expect(principleSource(note({ id: "y" }))).toBeNull();
  });

  it("splits a body into quote, numbered points and tail", () => {
    const parsed = parsePrincipleBody(QUOTED_NOTE.body);
    expect(parsed.quote).toContain("just a wish");
    expect(parsed.bullets).toEqual([
      "Identify what you truly want.",
      "Write down your goals clearly.",
    ]);
    expect(parsed.tail).toEqual([]);

    const withTail = parsePrincipleBody(
      '1. Do the thing.\n\nJay\'s own margin notes, written in red:\n"Mastering yourself is true power."'
    );
    expect(withTail.bullets).toEqual(["Do the thing."]);
    expect(withTail.tail).toHaveLength(2);
    // A quotation AFTER the list is a margin note, not the epigraph.
    expect(withTail.quote).toBeNull();
  });

  it("drops nothing it cannot parse — unrecognised lines land in the tail", () => {
    const parsed = parsePrincipleBody("just a sentence\nand another");
    expect(parsed.bullets).toEqual([]);
    expect(parsed.tail).toEqual(["just a sentence", "and another"]);
    expect(parsePrincipleBody(null).bullets).toEqual([]);
    expect(parsePrincipleBody("").tail).toEqual([]);
  });

  it("finds which numbered points he wrote Yes beside", () => {
    expect([...markedBulletNumbers(["3 — Give every hour a purpose"])]).toEqual([3]);
    expect([...markedBulletNumbers(["4 — Track your progress visually", "2 — x"])]).toEqual([
      4, 2,
    ]);
    expect(markedBulletNumbers(["no number here"]).size).toBe(0);
    expect(markedBulletNumbers([]).size).toBe(0);
  });

  it("marks the circled words where they actually appear in a line", () => {
    const segs = highlightSegments("Label each hour: work, rest, learning.", [
      "work",
      "rest",
    ]);
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(["work", "rest"]);
    // Nothing is lost or duplicated in the split.
    expect(segs.map((s) => s.text).join("")).toBe(
      "Label each hour: work, rest, learning."
    );
  });

  it("prefers the longest circled phrase and never overlaps two", () => {
    const segs = highlightSegments("Start by make your bed each morning", [
      "bed",
      "make your bed",
    ]);
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(["make your bed"]);
  });

  it("returns one plain segment when nothing was circled", () => {
    expect(highlightSegments("plain text", [])).toEqual([
      { text: "plain text", hit: false },
    ]);
    // A single character is not a phrase; ringing every "a" would be noise.
    expect(highlightSegments("a plain sentence", ["a"])).toEqual([
      { text: "a plain sentence", hit: false },
    ]);
  });

  it("matches a circled word regardless of case", () => {
    const segs = highlightSegments("Fatigue is the enemy", ["fatigue"]);
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(["Fatigue"]);
  });

  it("rings a whole word only, never a word that merely contains it", () => {
    // Caught on the live page: point 7 of the time checklist reads "shows
    // what worked", and "work" was being ringed inside "worked" — a mark on
    // the page he never made, in the one place whose job is his marks.
    const segs = highlightSegments(
      "A nightly review shows what worked. Label each hour: work.",
      ["work"]
    );
    expect(segs.filter((s) => s.hit)).toHaveLength(1);
    expect(segs.filter((s) => s.hit)[0].text).toBe("work");

    expect(highlightSegments("homework and coursework", ["work"])).toEqual([
      { text: "homework and coursework", hit: false },
    ]);
    // Punctuation and quotes are boundaries, so a real word still matches.
    expect(
      highlightSegments('"rest", then work; then rest.', ["rest"]).filter((s) => s.hit)
    ).toHaveLength(2);
  });

  it("counts tags, commonest first, and drops the one that matches everything", () => {
    const tags = noteTags([TIME_NOTE, QUOTED_NOTE]);
    expect(tags.some((t) => t.tag === "principle")).toBe(false);
    expect(tags.find((t) => t.tag === "money")?.count).toBe(1);
  });

  it("searches title, body and tags together", () => {
    const all = [TIME_NOTE, QUOTED_NOTE];
    expect(filterNotes(all, { query: "unassigned hours" }).map((n) => n.id)).toEqual([
      "time",
    ]);
    expect(filterNotes(all, { query: "DEBT" }).map((n) => n.id)).toEqual(["money"]);
    expect(filterNotes(all, { tag: "time" }).map((n) => n.id)).toEqual(["time"]);
    // Tag AND query, not OR.
    expect(filterNotes(all, { tag: "money", query: "hour" })).toEqual([]);
    // Searching for nothing is not the same as finding nothing.
    expect(filterNotes(all, { query: "   " })).toHaveLength(2);
    expect(filterNotes(all)).toHaveLength(2);
  });

  it("groups by area in the areas' own order, unfiled last, empty areas dropped", () => {
    const pillars = [
      { id: "money", sort_order: 8 },
      { id: "mind", sort_order: 3 },
      { id: "family", sort_order: 4 },
    ];
    const groups = notesByPillar([TIME_NOTE, QUOTED_NOTE, note({ id: "loose" })], pillars);
    expect(groups.map((g) => g.pillar?.id ?? null)).toEqual(["mind", "money", null]);
    expect(groups[2].notes.map((n) => n.id)).toEqual(["loose"]);
  });

  it("treats a note filed against a missing area as unfiled, not as lost", () => {
    const groups = notesByPillar(
      [note({ id: "orphan", pillar_id: "gone" })],
      [{ id: "mind", sort_order: 3 }]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].pillar).toBeNull();
  });
});

/* -- the creed ------------------------------------------------------ */

describe("the creed", () => {
  it("splits a stored body into its lines and ignores the blanks", () => {
    expect(creedLines("one\n\ntwo\n  \nthree")).toEqual(["one", "two", "three"]);
    expect(creedLines(null)).toEqual([]);
    expect(creedLines("")).toEqual([]);
  });

  it("falls back to his words when the note has not been read", () => {
    expect(creedFrom(null)).toEqual(CREED);
    expect(creedFrom("   ")).toEqual(CREED);
    expect(creedFrom("stored line")).toEqual(["stored line"]);
  });

  it("holds the three lines exactly as he wrote them", () => {
    // Not a style test. These are his words; a paraphrase is a rewrite.
    expect(CREED).toEqual([
      "We must all suffer one of two things: the pain of discipline or the pain of regret.",
      "Mastering others is strength. Mastering yourself is true power.",
      "Make the most of the time left alive.",
    ]);
    expect(creedFrom(CREED_NOTE.body)).toEqual(CREED);
  });

  it("gives the same line for the same day, on the server and in the browser", () => {
    expect(creedLineOfDay(CREED, "2026-08-05")).toBe(creedLineOfDay(CREED, "2026-08-05"));
    expect(CREED).toContain(creedLineOfDay(CREED, "2026-08-05"));
  });

  it("rotates day by day and wraps round the list", () => {
    const seen = [
      creedLineOfDay(CREED, "2026-08-05"),
      creedLineOfDay(CREED, "2026-08-06"),
      creedLineOfDay(CREED, "2026-08-07"),
    ];
    expect(new Set(seen).size).toBe(3);
    expect(creedLineOfDay(CREED, "2026-08-08")).toBe(seen[0]);
  });

  it("offsets so two panels on one screen can differ without either lying", () => {
    expect(creedLineOfDay(CREED, "2026-08-05", 1)).not.toBe(
      creedLineOfDay(CREED, "2026-08-05", 0)
    );
    // A negative offset must not fall off the front of the array.
    expect(CREED).toContain(creedLineOfDay(CREED, "2026-08-05", -4));
  });

  it("shows nothing rather than empty quote marks when there is no creed", () => {
    expect(creedLineOfDay([], "2026-08-05")).toBeNull();
  });
});

/* -- hours ---------------------------------------------------------- */

describe("giving every hour a purpose", () => {
  it("covers the waking day, 06:00 to 22:00", () => {
    expect(DAY_START_HOUR).toBe(6);
    expect(DAY_END_HOUR).toBe(22);
    expect(DAY_HOURS).toHaveLength(16);
    expect(DAY_HOURS[0]).toBe(6);
    expect(DAY_HOURS[15]).toBe(21);
    expect(hourKey(9)).toBe("09");
    expect(hourKey(21)).toBe("21");
    expect(hourLabel(9)).toBe("09:00");
  });

  it("reads the hour map out of journal meta", () => {
    expect(readHours({ hours: { "09": "work", "10": "rest" } })).toEqual({
      "09": "work",
      "10": "rest",
    });
    // An unpadded key means the same hour.
    expect(readHours({ hours: { "9": "work" } })).toEqual({ "09": "work" });
  });

  it("ignores anything that is not an hour of the day with a real label", () => {
    // meta is jsonb: it can hold anything, including a future version of
    // this feature. A malformed row degrades to an unlabelled day.
    expect(
      readHours({
        hours: {
          "05": "work", // before the day starts
          "22": "work", // after it ends
          "09": "napping", // not one of the five
          "10": 3, // not a string
          xx: "work", // not an hour at all
          "11": "learning", // the only good one
        },
      })
    ).toEqual({ "11": "learning" });

    expect(readHours(null)).toEqual({});
    expect(readHours(undefined)).toEqual({});
    expect(readHours({})).toEqual({});
    expect(readHours({ hours: null })).toEqual({});
    expect(readHours({ hours: ["work"] })).toEqual({});
    expect(readHours({ hours: "work" })).toEqual({});
    // Other meta keys are none of this function's business.
    expect(readHours({ mood: 4, hours: { "09": "work" } })).toEqual({ "09": "work" });
  });

  it("assigns and clears an hour without mutating what it was given", () => {
    const before: HourMap = { "09": "work" };
    const after = assignHour(before, 10, "rest");
    expect(after).toEqual({ "09": "work", "10": "rest" });
    expect(before).toEqual({ "09": "work" }); // untouched

    expect(assignHour(after, 9, "learning")["09"]).toBe("learning");
    expect(clearHour(after, 9)).toEqual({ "10": "rest" });
    expect(assignHour(after, 9, null)).toEqual({ "10": "rest" });
    // Clearing an hour that was never set is a no-op, not an error.
    expect(clearHour({}, 7)).toEqual({});
  });

  it("cycles one control through the five labels and back to unassigned", () => {
    let p = nextPurpose(null);
    const seen: (string | null)[] = [];
    for (let i = 0; i < HOUR_PURPOSES.length; i++) {
      seen.push(p);
      p = nextPurpose(p);
    }
    expect(seen).toEqual(HOUR_PURPOSES);
    expect(p).toBeNull(); // one more tap clears it
  });

  it("counts an empty day as 0 of 16, not as a missing figure", () => {
    // He has sixteen waking hours whether or not he has said anything
    // about them.
    expect(hourStats({})).toEqual({
      assigned: 0,
      unassigned: 16,
      total: 16,
      percent: 0,
    });
  });

  it("counts a partly and a fully assigned day", () => {
    const half: HourMap = Object.fromEntries(
      DAY_HOURS.slice(0, 8).map((h) => [hourKey(h), "work"])
    );
    expect(hourStats(half)).toMatchObject({ assigned: 8, unassigned: 8, percent: 50 });

    const full: HourMap = Object.fromEntries(
      DAY_HOURS.map((h) => [hourKey(h), "rest"])
    );
    expect(hourStats(full)).toMatchObject({ assigned: 16, unassigned: 0, percent: 100 });
  });

  it("splits a week by label, counting every waking hour of it", () => {
    const monday: HourMap = { "06": "work", "07": "work", "08": "rest" };
    const tuesday: HourMap = { "06": "learning" };
    const split = purposeSplit([monday, tuesday, {}, {}, {}, {}, {}]);
    expect(split.counts.work).toBe(2);
    expect(split.counts.rest).toBe(1);
    expect(split.counts.learning).toBe(1);
    expect(split.counts.cleaning).toBe(0);
    expect(split.assigned).toBe(4);
    expect(split.total).toBe(7 * 16);
    expect(split.unassigned).toBe(7 * 16 - 4);
    expect(split.leader).toBe("work");
  });

  it("names no leader on a tie or an empty week", () => {
    // Calling one of two equal labels the winner would be the page
    // inventing an emphasis he never placed.
    expect(purposeSplit([{ "06": "work", "07": "rest" }]).leader).toBeNull();
    expect(purposeSplit([]).leader).toBeNull();
    expect(purposeSplit([{}, {}]).leader).toBeNull();
    expect(purposeSplit([]).total).toBe(0);
  });

  it("ignores an hour outside the day even if it got into the map", () => {
    const sneaky = { "06": "work", "23": "work" } as HourMap;
    expect(hourStats(sneaky).assigned).toBe(1);
    expect(purposeSplit([sneaky]).counts.work).toBe(1);
  });
});

/* -- obstacles ------------------------------------------------------ */

describe("what got in the way", () => {
  const review = (obstacles: unknown) => ({ meta: { obstacles } });

  it("offers the three he circled", () => {
    expect(OBSTACLES).toEqual(["fatigue", "distractions", "unexpected-demands"]);
  });

  it("keys free text the same way the circled three are keyed", () => {
    expect(obstacleKey("Unexpected demands")).toBe("unexpected-demands");
    expect(obstacleKey("  The VAN broke!  ")).toBe("the-van-broke");
    expect(obstacleKey("   ")).toBe("");
    expect(obstacleKey("!!!")).toBe("");
  });

  it("labels a key back into something readable", () => {
    expect(obstacleLabel("fatigue")).toBe("Fatigue");
    expect(obstacleLabel("unexpected-demands")).toBe("Unexpected demands");
    expect(obstacleLabel("the-van-broke")).toBe("The van broke");
  });

  it("reads obstacles out of review meta, deduping and discarding junk", () => {
    expect(readObstacles({ obstacles: ["fatigue", "Fatigue", "distractions"] })).toEqual([
      "fatigue",
      "distractions",
    ]);
    expect(readObstacles({ obstacles: ["fatigue", 3, null, "", "  "] })).toEqual([
      "fatigue",
    ]);
    expect(readObstacles(null)).toEqual([]);
    expect(readObstacles({})).toEqual([]);
    expect(readObstacles({ obstacles: "fatigue" })).toEqual([]);
  });

  it("says NOTHING below three reviews", () => {
    // The rule the brief singles out: one bad week is not a pattern, and a
    // conclusion drawn from it is a guess wearing a number.
    expect(MIN_REVIEWS_FOR_TALLY).toBe(3);

    for (const n of [0, 1, 2]) {
      const t = obstacleTally(Array.from({ length: n }, () => review(["fatigue"])));
      expect(t.enough, `${n} reviews`).toBe(false);
      expect(t.counts, `${n} reviews`).toEqual([]);
      expect(t.top, `${n} reviews`).toBeNull();
      expect(t.reviews).toBe(n);
      expect(obstacleHeadline(t), `${n} reviews`).toBeNull();
    }
  });

  it("names the recurring obstacle once there are three reviews", () => {
    const t = obstacleTally([
      review(["fatigue", "distractions"]),
      review(["fatigue"]),
      review(["fatigue", "unexpected-demands"]),
    ]);
    expect(t.enough).toBe(true);
    expect(t.reviews).toBe(3);
    expect(t.top).toMatchObject({ key: "fatigue", count: 3 });
    expect(t.counts[0].label).toBe("Fatigue");
    expect(obstacleHeadline(t)).toBe("Fatigue has cost you 3 of your last 3 weeks.");
  });

  it("writes the sentence Jay asked for, in his numbers", () => {
    const reviews = [
      review(["fatigue"]),
      review(["fatigue"]),
      review(["distractions"]),
      review(["fatigue"]),
      review([]),
      review(["fatigue"]),
    ];
    expect(obstacleHeadline(obstacleTally(reviews))).toBe(
      "Fatigue has cost you 4 of your last 6 weeks."
    );
  });

  it("declares no winner when two obstacles are level", () => {
    const t = obstacleTally([review(["fatigue"]), review(["distractions"]), review([])]);
    expect(t.enough).toBe(true);
    expect(t.counts).toHaveLength(2);
    expect(t.top).toBeNull();
    expect(obstacleHeadline(t)).toBeNull();
  });

  it("handles three reviews that named nothing at all", () => {
    const t = obstacleTally([review([]), review(undefined), { meta: null }]);
    expect(t.enough).toBe(true);
    expect(t.counts).toEqual([]);
    expect(t.top).toBeNull();
    expect(obstacleHeadline(t)).toBeNull();
  });

  it("counts a free-typed obstacle alongside the circled three", () => {
    const t = obstacleTally([
      review(["the-van-broke"]),
      review(["the-van-broke"]),
      review(["fatigue"]),
    ]);
    expect(t.top).toMatchObject({
      key: "the-van-broke",
      label: "The van broke",
      count: 2,
    });
  });

  it("counts a repeated obstacle inside one review only once", () => {
    const t = obstacleTally([
      review(["fatigue", "fatigue", "Fatigue"]),
      review(["distractions"]),
      review(["distractions"]),
    ]);
    expect(t.counts.find((c) => c.key === "fatigue")?.count).toBe(1);
    expect(t.top).toMatchObject({ key: "distractions", count: 2 });
  });
});

describe("which week the review is for", () => {
  it("reviews the week you are finishing when it lands on Sunday", () => {
    // 2026-08-09 is a Sunday; its Monday-first week starts 2026-08-03.
    expect(reviewPeriod("2026-08-09")).toEqual({
      start: "2026-08-03",
      end: "2026-08-09",
    });
    expect(daysUntilWeeklyReview("2026-08-09")).toBe(0);
  });

  it("reviews the week just gone on any other day", () => {
    // Wednesday: summing up a week still happening would be a fiction.
    expect(reviewPeriod("2026-08-05")).toEqual({
      start: "2026-07-27",
      end: "2026-08-02",
    });
    // Monday morning, the same answer.
    expect(reviewPeriod("2026-08-03")).toEqual({
      start: "2026-07-27",
      end: "2026-08-02",
    });
  });

  it("always spans exactly seven days, Monday to Sunday", () => {
    for (const d of ["2026-08-03", "2026-08-06", "2026-08-09", "2026-12-31"]) {
      const p = reviewPeriod(d);
      expect(addDays(p.start, 6), d).toBe(p.end);
      expect(mondayOf(p.start), d).toBe(p.start);
    }
  });
});

/* -- habits --------------------------------------------------------- */

describe("habits", () => {
  const habits = [
    { id: "bed", name: "Make the bed" },
    { id: "water", name: "Drink water" },
    { id: "page", name: "Read a page" },
  ];
  const logs: HabitLog[] = [
    { habit_id: "bed", done_on: "2026-08-05" },
    { habit_id: "bed", done_on: "2026-08-04" },
    { habit_id: "bed", done_on: "2026-08-03" },
    { habit_id: "water", done_on: "2026-08-04" },
    { habit_id: "page", done_on: "2026-07-01" },
  ];

  it("pulls one habit's days out, oldest first", () => {
    expect(logDaysFor(logs, "bed")).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
    expect(logDaysFor(logs, "nothing")).toEqual([]);
  });

  it("builds a row with the streak, today's tick and the visible history", () => {
    const rows = habitRows(habits, logs, "2026-08-05", 7);
    const bed = rows.find((r) => r.habit.id === "bed")!;
    expect(bed.streak).toBe(3);
    expect(bed.doneToday).toBe(true);
    expect(bed.history).toHaveLength(7);
    expect(bed.history[6]).toBe(true); // today is the last bar
    expect(bed.hits).toBe(3);

    // A streak survives the day it has not happened yet — the same rule as
    // the training streak, because two rules would be one too many.
    const water = rows.find((r) => r.habit.id === "water")!;
    expect(water.streak).toBe(1);
    expect(water.doneToday).toBe(false);

    const page = rows.find((r) => r.habit.id === "page")!;
    expect(page.streak).toBe(0);
    expect(page.hits).toBe(0);
  });

  it("counts today as a fraction of a list you can see all of", () => {
    expect(habitsDoneToday(habits, logs, "2026-08-05")).toEqual({ done: 1, of: 3 });
    expect(habitsDoneToday(habits, logs, "2026-08-04")).toEqual({ done: 2, of: 3 });
    expect(habitsDoneToday(habits, [], "2026-08-05")).toEqual({ done: 0, of: 3 });
    expect(habitsDoneToday([], logs, "2026-08-05")).toEqual({ done: 0, of: 0 });
  });

  it("treats a double-tap as the same single day", () => {
    // The database enforces this with a primary key on (habit_id, done_on);
    // the maths must agree rather than counting the day twice.
    const dupes: HabitLog[] = [
      { habit_id: "bed", done_on: "2026-08-05" },
      { habit_id: "bed", done_on: "2026-08-05" },
    ];
    const row = habitRows([habits[0]], dupes, "2026-08-05", 7)[0];
    expect(row.streak).toBe(1);
    expect(row.hits).toBe(1);
    expect(habitsDoneToday([habits[0]], dupes, "2026-08-05")).toEqual({
      done: 1,
      of: 1,
    });
  });

  it("handles a habit with no logs at all", () => {
    const row = habitRows([{ id: "new", name: "One hard thing" }], [], "2026-08-05")[0];
    expect(row.streak).toBe(0);
    expect(row.doneToday).toBe(false);
    expect(row.history.every((h) => h === false)).toBe(true);
  });
});

/* -- a branch that graduated ---------------------------------------- */

describe("a branch that graduated to a real route", () => {
  it("keeps its name and shelf after leaving the placeholder registry", () => {
    // /reviews is built, so it is no longer a placeholder — but the library
    // still has to know what to call it and where to send him.
    expect(placeholderFor("reviews")).toBeUndefined();
    expect(BUILT_BRANCHES["reviews"]).toBeTruthy();
    expect(branchName("reviews")).toBe("Reviews");
    expect(branchHref("reviews")).toBe("/reviews");
  });

  it("still names and routes an ordinary placeholder", () => {
    expect(branchName("finance")).toBe("Finance");
    expect(branchHref("finance")).toBe("/finance");
    expect(branchName("nothing-like-this")).toBe("nothing-like-this");
  });
});
