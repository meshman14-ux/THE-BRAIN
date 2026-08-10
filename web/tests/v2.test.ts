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
