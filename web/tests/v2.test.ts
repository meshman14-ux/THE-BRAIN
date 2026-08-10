import { describe, it, expect } from "vitest";
import {
  focusList,
  pickThree,
  rankForToday,
  todayProgress,
  FOCUS_VISIBLE,
  FOCUS_ON_DECK,
  TODAY_LIMIT,
  normaliseTab,
  BRAIN_TABS,
  BRAIN_TAB_LABEL,
  BRAIN_TAB_QUESTION,
  areaToAsk,
  gratitudePrompt,
  GRATITUDE_PROMPTS,
  readCheckin,
  checkinProgress,
  isAnswered,
  isSettled,
  EMPTY_CHECKIN,
  CHECKIN_FLOOR,
  REFLECTION_TARGET,
  reflectionWeeks,
  moodTrend,
  addDays,
  type CheckinField,
} from "../src/lib/logic";

const TODAY = "2026-08-10";

type T = {
  id: string;
  title: string;
  status: "open" | "doing" | "done" | "dropped" | "waiting";
  priority: "High" | "Med" | "Low";
  do_date: string | null;
  due_date: string | null;
};

function task(id: string, over: Partial<T> = {}): T {
  return {
    id,
    title: id,
    status: "open",
    priority: "Med",
    do_date: null,
    due_date: null,
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * Focus — three visible, two on deck
 * ------------------------------------------------------------------ */

describe("focusList", () => {
  it("shows three and never more, whatever the drawer holds", () => {
    // The cap is the whole reason the dashboard exists. If the drawer can
    // push a fourth item into `visible`, pickThree has been undone by the
    // back door and nobody would notice until the page is a list again.
    const many = Array.from({ length: 20 }, (_, i) => task(`t${i}`));
    const f = focusList(many, TODAY);
    expect(f.visible).toHaveLength(FOCUS_VISIBLE);
    expect(f.visible).toHaveLength(TODAY_LIMIT);
    expect(f.onDeck).toHaveLength(FOCUS_ON_DECK);
  });

  it("takes the on-deck two from the same queue, in the same order", () => {
    // Not a second opinion about what matters — literally the next two.
    const many = Array.from({ length: 10 }, (_, i) => task(`t${i}`));
    const ranked = rankForToday(many, TODAY);
    const f = focusList(many, TODAY);
    expect(f.visible.map((t) => t.id)).toEqual(ranked.slice(0, 3).map((t) => t.id));
    expect(f.onDeck.map((t) => t.id)).toEqual(ranked.slice(3, 5).map((t) => t.id));
  });

  it("agrees with pickThree exactly, so the two cannot drift", () => {
    const many = [
      task("a", { priority: "Low" }),
      task("b", { do_date: TODAY }),
      task("c", { due_date: "2026-08-12" }),
      task("d", { priority: "High" }),
      task("e", { status: "doing", priority: "High" }),
    ];
    expect(focusList(many, TODAY).visible).toEqual(pickThree(many, TODAY));
  });

  it("counts every open item as the total, including the five it showed", () => {
    const many = Array.from({ length: 9 }, (_, i) => task(`t${i}`));
    const f = focusList(many, TODAY);
    expect(f.openTotal).toBe(9);
    expect(f.beyond).toBe(9 - FOCUS_VISIBLE - FOCUS_ON_DECK);
  });

  it("never reports work hiding beyond the drawer when there is none", () => {
    // "4 more not shown" when nothing is hidden would be a small lie, and
    // the copy is built from this number.
    const f = focusList([task("a"), task("b")], TODAY);
    expect(f.beyond).toBe(0);
    expect(f.onDeck).toHaveLength(0);
  });

  it("ignores done, dropped and waiting work in every slot", () => {
    const f = focusList(
      [
        task("done", { status: "done" }),
        task("dropped", { status: "dropped" }),
        task("waiting", { status: "waiting" }),
        task("live"),
      ],
      TODAY
    );
    expect(f.visible.map((t) => t.id)).toEqual(["live"]);
    expect(f.openTotal).toBe(1);
  });

  it("puts today's work first, then deadlines, then high priority", () => {
    const f = focusList(
      [
        task("next"),
        task("high", { priority: "High" }),
        task("deadline", { due_date: "2026-08-12" }),
        task("today", { do_date: TODAY }),
      ],
      TODAY
    );
    expect(f.visible.map((t) => t.id)).toEqual(["today", "deadline", "high"]);
    expect(f.onDeck.map((t) => t.id)).toEqual(["next"]);
  });

  it("leaves the TODAY counter alone — the drawer is not more today", () => {
    // The two on deck are planning space. If opening the drawer moved the
    // n/3 counter, the counter would be measuring the drawer rather than
    // the day, and the number Jay checks in the morning would move for a
    // reason he did not cause.
    const tasks = [
      task("a", { do_date: TODAY }),
      task("b", { do_date: TODAY, status: "done" }),
      ...Array.from({ length: 6 }, (_, i) => task(`later${i}`)),
    ];
    const before = todayProgress(tasks, TODAY);
    const f = focusList(tasks, TODAY);
    expect(f.onDeck.length).toBeGreaterThan(0);
    expect(todayProgress(tasks, TODAY)).toEqual(before);
    expect(before.done).toBe(1);
    expect(before.of).toBe(3);
  });

  it("handles an empty list without inventing a drawer", () => {
    expect(focusList([], TODAY)).toEqual({
      visible: [],
      onDeck: [],
      openTotal: 0,
      beyond: 0,
    });
  });
});

/* ------------------------------------------------------------------ *
 * The four tabs
 * ------------------------------------------------------------------ */

describe("the command centre's four tabs", () => {
  it("is exactly Now · Attention · Systems · Trend", () => {
    expect(BRAIN_TABS).toEqual(["now", "attention", "systems", "trend"]);
  });

  it("gives every tab a label and a distinct question", () => {
    // The rule is that a tab exists only if it answers a question the
    // others cannot, so two tabs sharing a question means one of them
    // should not be there.
    const questions = BRAIN_TABS.map((t) => BRAIN_TAB_QUESTION[t]);
    expect(new Set(questions).size).toBe(BRAIN_TABS.length);
    for (const t of BRAIN_TABS) {
      expect(BRAIN_TAB_LABEL[t]).toBeTruthy();
      expect(BRAIN_TAB_QUESTION[t]).toMatch(/\?$/);
    }
  });

  it("falls back to Now for anything it does not recognise", () => {
    // A mistyped tab should show him his day, not an empty page.
    for (const bad of ["", "  ", "Now", "trends", "attention ", null, undefined]) {
      expect(normaliseTab(bad as string | null | undefined)).toBe("now");
    }
  });

  it("accepts each real tab, and the first value of a repeated parameter", () => {
    for (const t of BRAIN_TABS) expect(normaliseTab(t)).toBe(t);
    expect(normaliseTab(["trend", "systems"])).toBe("trend");
    expect(normaliseTab([])).toBe("now");
  });
});

/* ------------------------------------------------------------------ *
 * The daily close
 * ------------------------------------------------------------------ */

describe("areaToAsk", () => {
  const area = (id: string, score: number | null, sort: number) => ({
    id,
    name: id,
    score,
    sort_order: sort,
  });

  it("asks about an unscored area before any scored one", () => {
    // Deliberately the OPPOSITE of rankAreasByNeed, which ranks unscored
    // last because an area you have never looked at is unknown rather than
    // failing. Here the job is to close the gap, so unknown is exactly what
    // is worth asking about.
    const picked = areaToAsk(
      [area("terrible", 1, 1), area("never-looked", null, 2), area("fine", 9, 3)],
      "2026-08-10"
    );
    expect(picked?.id).toBe("never-looked");
  });

  it("asks about the worst score once every area has one", () => {
    expect(
      areaToAsk([area("good", 8, 1), area("bad", 2, 2), area("ok", 5, 3)], "2026-08-10")?.id
    ).toBe("bad");
  });

  it("treats a zero as a real score, not as unscored", () => {
    // Null means "not yet scored"; zero means "scored, and it is that bad".
    const picked = areaToAsk([area("zero", 0, 1), area("five", 5, 2)], "2026-08-10");
    expect(picked?.id).toBe("zero");
  });

  it("rotates between tied areas so a fresh account is not asked the same one for a fortnight", () => {
    const fresh = Array.from({ length: 13 }, (_, i) => area(`a${i}`, null, i));
    const asked = new Set(
      Array.from({ length: 13 }, (_, d) => areaToAsk(fresh, addDays("2026-08-10", d))?.id)
    );
    expect(asked.size).toBe(13);
  });

  it("is stable within a day", () => {
    const fresh = Array.from({ length: 5 }, (_, i) => area(`a${i}`, null, i));
    expect(areaToAsk(fresh, "2026-08-10")?.id).toBe(areaToAsk(fresh, "2026-08-10")?.id);
  });

  it("returns null rather than inventing an area when there are none", () => {
    expect(areaToAsk([], "2026-08-10")).toBeNull();
  });
});

describe("gratitudePrompt", () => {
  it("holds for a week and moves on the Monday", () => {
    // Emmons: weekly beats daily, because answering the same question every
    // night is how you end up writing the same three words by Thursday.
    const mon = "2026-08-10";
    for (let d = 0; d < 7; d++) {
      expect(gratitudePrompt(addDays(mon, d)), `day ${d}`).toBe(gratitudePrompt(mon));
    }
    expect(gratitudePrompt(addDays(mon, 7))).not.toBe(gratitudePrompt(mon));
  });

  it("only ever returns a prompt from the list", () => {
    for (let d = 0; d < 400; d += 7) {
      expect(GRATITUDE_PROMPTS).toContain(gratitudePrompt(addDays("2026-01-05", d)));
    }
  });
});

describe("readCheckin", () => {
  it("returns an empty check-in for a night with no row", () => {
    expect(readCheckin(null)).toEqual(EMPTY_CHECKIN);
    expect(readCheckin(undefined)).toEqual(EMPTY_CHECKIN);
  });

  it("discards anything meta holds that it does not recognise", () => {
    // meta is jsonb and therefore untrusted (§A7). A page he opened to read
    // must not throw because a row holds a number where a string was
    // expected.
    const c = readCheckin({
      mood: 4,
      energy: "loads",
      gratitude: 12,
      meta: { wins: ["a", "b"], friction: "traffic", tomorrow: "  ", skipped: "gratitude" },
    });
    expect(c.mood).toBe(4);
    expect(c.energy).toBeNull();
    expect(c.gratitude).toBeNull();
    expect(c.wins).toBeNull();
    expect(c.friction).toBe("traffic");
    expect(c.tomorrow).toBeNull();
    expect(c.skipped).toEqual([]);
  });

  it("survives meta being an array, a string or missing entirely", () => {
    for (const meta of [[], "nope", null, undefined, 7]) {
      expect(() => readCheckin({ mood: 3, meta })).not.toThrow();
      expect(readCheckin({ mood: 3, meta }).wins).toBeNull();
    }
  });

  it("rejects a mood outside 1–5 rather than clamping it", () => {
    // Clamping would turn a bad write into a plausible reading, and the
    // average would then be built on a number nobody entered.
    for (const bad of [0, 6, 2.5, -1, NaN]) {
      expect(readCheckin({ mood: bad }).mood).toBeNull();
    }
    for (const good of [1, 2, 3, 4, 5]) {
      expect(readCheckin({ mood: good }).mood).toBe(good);
    }
  });

  it("keeps only real field names in the skip list", () => {
    expect(
      readCheckin({ meta: { skipped: ["wins", "nonsense", 4, "tomorrow"] } }).skipped
    ).toEqual(["wins", "tomorrow"]);
  });

  it("accepts an area score of zero", () => {
    expect(readCheckin({ meta: { area_id: "x", area_score: 0 } }).areaScore).toBe(0);
    expect(readCheckin({ meta: { area_id: "x", area_score: 11 } }).areaScore).toBeNull();
  });
});

describe("checkinProgress", () => {
  const base = { ...EMPTY_CHECKIN };

  it("counts the day as logged on the floor alone", () => {
    // Two taps is the whole obligation. If the floor needed more than mood
    // and energy, the streak would be unreachable on a bad evening, which
    // is exactly the evening it exists for.
    expect(checkinProgress({ ...base, mood: 3, energy: 2 }).logged).toBe(true);
    expect(checkinProgress({ ...base, mood: 3 }).logged).toBe(false);
    expect(CHECKIN_FLOOR).toEqual(["mood", "energy"]);
  });

  it("never counts a skip as an answer", () => {
    const c = { ...base, skipped: ["wins", "gratitude"] as CheckinField[] };
    expect(checkinProgress(c).answered).toBe(0);
    expect(checkinProgress(c).skipped).toBe(2);
  });

  it("resumes at the first field that is neither answered nor skipped", () => {
    expect(checkinProgress({ ...base, mood: 3 }).next).toBe("energy");
    expect(
      checkinProgress({ ...base, mood: 3, energy: 3, skipped: ["wins"] as CheckinField[] })
        .next
    ).toBe("friction");
  });

  it("is done when every field is settled one way or the other", () => {
    const c = {
      ...base,
      mood: 3,
      energy: 3,
      skipped: ["wins", "friction", "gratitude", "tomorrow", "area"] as CheckinField[],
    };
    expect(checkinProgress(c).done).toBe(true);
    expect(checkinProgress(c).answered).toBe(2);
  });

  it("treats an answered field as settled even if it is also in the skip list", () => {
    // He skipped it, then came back and answered it. The answer wins.
    const c = { ...base, wins: "shipped it", skipped: ["wins"] as CheckinField[] };
    expect(isAnswered(c, "wins")).toBe(true);
    expect(isSettled(c, "wins")).toBe(true);
    expect(checkinProgress(c).skipped).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * The reflection streak — weeks, not days
 * ------------------------------------------------------------------ */

describe("reflectionWeeks", () => {
  const MONDAY = "2026-08-10"; // a Monday
  const days = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) => addDays(from, i));

  it("counts a week as good at four entries, not seven", () => {
    // A daily streak resets on one missed evening, and the reset is what
    // ends the habit rather than the missed day.
    const { weeks } = reflectionWeeks(days(MONDAY, 4), addDays(MONDAY, 6), 2);
    expect(weeks[1].entries).toBe(4);
    expect(weeks[1].met).toBe(true);
    expect(REFLECTION_TARGET).toBe(4);
  });

  it("does not fail the current week for being incomplete", () => {
    // It is Tuesday. Two entries is not a failure yet, and calling it one
    // would be calling it early.
    const prior = days(addDays(MONDAY, -7), 5);
    const { streak } = reflectionWeeks([...prior, MONDAY], addDays(MONDAY, 1), 3);
    expect(streak).toBe(1);
  });

  it("counts the current week once it has genuinely met the target", () => {
    const prior = days(addDays(MONDAY, -7), 5);
    const { streak } = reflectionWeeks([...prior, ...days(MONDAY, 4)], addDays(MONDAY, 4), 3);
    expect(streak).toBe(2);
  });

  it("breaks the run on a completed week that missed, not on a gap day", () => {
    const twoBack = days(addDays(MONDAY, -14), 5);
    const oneBack = days(addDays(MONDAY, -7), 2); // a bad week
    const { streak } = reflectionWeeks(
      [...twoBack, ...oneBack, ...days(MONDAY, 5)],
      addDays(MONDAY, 6),
      4
    );
    expect(streak).toBe(1);
  });

  it("reports every requested week, oldest first, with no entries at all", () => {
    const { weeks, streak } = reflectionWeeks([], MONDAY, 6);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.entries === 0 && !w.met)).toBe(true);
    expect(weeks[0].monday < weeks[5].monday).toBe(true);
    expect(streak).toBe(0);
  });
});

describe("moodTrend", () => {
  it("averages only what was actually answered", () => {
    // A skipped question contributes no reading, so an evening he passed on
    // must not be averaged as a bad one.
    const t = moodTrend(
      [
        { entry_date: "2026-08-10", mood: 4, energy: null },
        { entry_date: "2026-08-09", mood: 2, energy: 3 },
        { entry_date: "2026-08-08", mood: null, energy: null },
      ],
      "2026-08-10"
    );
    expect(t.mood).toBe(3);
    expect(t.energy).toBe(3);
    expect(t.of).toBe(3);
  });

  it("returns null rather than zero when nothing has been logged", () => {
    // £0 and £— are different facts, and so are 0.0 and "not yet".
    expect(moodTrend([], "2026-08-10")).toEqual({ mood: null, energy: null, of: 0 });
  });

  it("ignores anything outside the window", () => {
    const t = moodTrend(
      [
        { entry_date: "2026-08-10", mood: 5 },
        { entry_date: "2026-07-01", mood: 1 },
      ],
      "2026-08-10",
      14
    );
    expect(t.mood).toBe(5);
    expect(t.of).toBe(1);
  });
});
