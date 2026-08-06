/* ====================================================================
 * STAGE 4 — two systems, two scales
 *
 * Phase A is the mode switch: LIFE_OS and EMPIRE_OS as separate operating
 * systems inside THE BRAIN, with `brain` as the neutral position.
 *
 * Phase B is the consequence nobody expects until they see it — the two
 * systems do not measure time the same way, and that is deliberate. A life
 * runs on months and decades; a business runs on quarters and reporting
 * years. The tests below pin both scales and the boundaries between them.
 * ==================================================================== */

import { describe, it, expect } from "vitest";
import {
  // modes
  systemForMode,
  normaliseMode,
  toggleMode,
  navForMode,
  phoneNavForMode,
  pillarsForMode,
  areasFor,
  // horizons
  goalHorizon,
  bucketGoalsByHorizon,
  horizonsFor,
  LIFE_HORIZONS,
  EMPIRE_HORIZONS,
  ALL_HORIZONS,
  HORIZON_LABEL,
  // the bucket list
  SOMEDAY_STATUS,
  isSomeday,
  somedayGoals,
  lifeGoalsFor,
  isLive,
  // dates
  addMonths,
} from "../src/lib/logic";
import { NAV, PHONE_SLOTS } from "../src/lib/nav";
import { MODES, MODE_HOME, type Goal, type Mode, type Pillar } from "../src/lib/types";

/* -- fixtures ------------------------------------------------------- */

/** A Wednesday, mid-quarter, mid-year — no boundary is accidentally on it. */
const TODAY = "2026-08-05";

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: over.title ?? "g",
  title: "a goal",
  description: null,
  pillar_id: null,
  vision_id: null,
  target_date: null,
  progress: 0,
  status: "active",
  ...over,
});

const pillar = (id: string, system: "life" | "empire", sort_order: number): Pillar => ({
  id,
  system,
  name: id,
  emoji: null,
  standard: null,
  sort_order,
  active: true,
});

const PILLARS: Pillar[] = [
  pillar("training", "life", 1),
  pillar("money", "life", 8),
  pillar("ventures", "empire", 9),
  pillar("assets", "empire", 10),
];

/* ==================================================================== *
 * PHASE A — the mode switch
 * ==================================================================== */

describe("modes", () => {
  it("maps a mode to the system it scopes to", () => {
    expect(systemForMode("life")).toBe("life");
    expect(systemForMode("empire")).toBe("empire");
    // brain is the neutral position — it reads both and scopes to neither.
    expect(systemForMode("brain")).toBeNull();
  });

  it("falls back to the neutral position for anything unrecognised", () => {
    // localStorage is user-writable and survives across versions, so a value
    // from a future or broken build must not leave the app in no mode at all.
    expect(normaliseMode("life")).toBe("life");
    expect(normaliseMode("empire")).toBe("empire");
    expect(normaliseMode("brain")).toBe("brain");
    expect(normaliseMode(null)).toBe("brain");
    expect(normaliseMode(undefined)).toBe("brain");
    expect(normaliseMode("")).toBe("brain");
    expect(normaliseMode("LIFE")).toBe("brain");
    expect(normaliseMode("mainframe")).toBe("brain");
  });

  it("makes each button a toggle, not a radio", () => {
    // Pressing the system you are already in returns you to the command
    // centre — one control, two directions.
    expect(toggleMode("brain", "life")).toBe("life");
    expect(toggleMode("life", "life")).toBe("brain");
    expect(toggleMode("life", "empire")).toBe("empire");
    expect(toggleMode("empire", "empire")).toBe("brain");
  });

  it("sends every mode somewhere real", () => {
    expect(MODE_HOME.brain).toBe("/dashboard");
    expect(MODE_HOME.life).toBe("/life");
    expect(MODE_HOME.empire).toBe("/empire");
  });
});

describe("nav by mode", () => {
  const labels = (m: Mode) => navForMode(NAV, m).map((n) => n.label);

  it("gives LIFE_OS its own operating system", () => {
    expect(labels("life")).toEqual([
      "Areas",
      "Debts",
      "Vehicles",
      "Habits",
      "Week",
      "Calendar",
      "Capture",
      "Inbox",
    ]);
  });

  it("gives EMPIRE_OS its own operating system", () => {
    expect(labels("empire")).toEqual([
      "Divisions",
      "Opportunities",
      "Goals",
      "Capture",
      "Inbox",
    ]);
  });

  it("keeps the command centre as it was", () => {
    expect(labels("brain")).toEqual([
      "Brain",
      "Life",
      "Empire",
      "Planner",
      "Review",
      "Goals",
      "Week",
      "Calendar",
      "Capture",
      "Inbox",
    ]);
  });

  it("KEEPS CAPTURE AND INBOX IN EVERY MODE", () => {
    // Locked decision 4 is phone-first capture. Hiding the entry points
    // behind a mode would mean a thought you had in the wrong mode is a
    // thought you lose. This is the one nav rule that is not negotiable.
    for (const m of MODES) {
      expect(labels(m), `top bar in ${m}`).toContain("Capture");
      expect(labels(m), `top bar in ${m}`).toContain("Inbox");
      const phone = phoneNavForMode(NAV, m).map((n) => n.label);
      expect(phone, `phone bar in ${m}`).toContain("Capture");
      expect(phone, `phone bar in ${m}`).toContain("Inbox");
    }
  });

  it("fills the five-column phone bar exactly, in every mode", () => {
    // The bar is `grid-cols-5`. A sixth item would silently wrap onto a
    // second row and cover the page; a fourth would leave a gap.
    for (const m of MODES) {
      expect(phoneNavForMode(NAV, m).length, `phone bar in ${m}`).toBe(PHONE_SLOTS);
    }
  });

  it("never puts an item on the phone bar that is not in that mode's nav", () => {
    for (const item of NAV) {
      for (const m of item.phoneModes) {
        expect(item.modes, `${item.label} on the ${m} phone bar`).toContain(m);
      }
    }
  });

  it("keys every item uniquely, since two modes can share an href", () => {
    // Areas and Life both point at /life. React needs distinct keys, and a
    // duplicate would silently drop one from the bar.
    const keys = NAV.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("leaves no item stranded in no mode at all", () => {
    for (const item of NAV) {
      expect(item.modes.length, `${item.label} belongs to no mode`).toBeGreaterThan(0);
    }
  });
});

describe("pillars by mode", () => {
  it("shows one system's areas in that system's mode", () => {
    expect(pillarsForMode(PILLARS, "life").map((p) => p.id)).toEqual([
      "training",
      "money",
    ]);
    expect(pillarsForMode(PILLARS, "empire").map((p) => p.id)).toEqual([
      "ventures",
      "assets",
    ]);
  });

  it("shows all thirteen in the command centre", () => {
    // §A2: the command centre reads over both systems. It does not filter.
    expect(pillarsForMode(PILLARS, "brain")).toHaveLength(PILLARS.length);
  });

  it("agrees with areasFor, which is the rule it delegates to", () => {
    expect(pillarsForMode(PILLARS, "life")).toEqual(areasFor(PILLARS, "life"));
    expect(pillarsForMode(PILLARS, "empire")).toEqual(areasFor(PILLARS, "empire"));
  });
});

/* ==================================================================== *
 * PHASE B — two scales
 * ==================================================================== */

describe("addMonths", () => {
  it("moves whole months", () => {
    expect(addMonths("2026-08-05", 1)).toBe("2026-09-05");
    expect(addMonths("2026-08-05", 6)).toBe("2027-02-05");
    expect(addMonths("2026-08-05", -1)).toBe("2026-07-05");
  });

  it("clamps to the end of a short month instead of rolling over", () => {
    // 31 Jan + 1 month is 28 Feb, not 3 March. Rolling forward would push a
    // month-end goal into the next horizon entirely.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-08-31", 1)).toBe("2026-09-30");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29"); // leap year
  });
});

describe("the two scales", () => {
  it("gives each system its own, and they are different on purpose", () => {
    expect(horizonsFor("life")).toEqual(LIFE_HORIZONS);
    expect(horizonsFor("empire")).toEqual(EMPIRE_HORIZONS);
    expect(LIFE_HORIZONS).not.toEqual(EMPIRE_HORIZONS);
  });

  it("runs LIFE_OS on month · six months · annual · 5 year · 10 year", () => {
    expect(LIFE_HORIZONS).toEqual(["month", "six", "year", "five", "ten", "someday"]);
  });

  it("leaves EMPIRE_OS on quarter · year · 5 year · 20 year", () => {
    expect(EMPIRE_HORIZONS).toEqual(["quarter", "year", "five", "twenty"]);
  });

  it("keeps the 20-year horizon out of LIFE and the 10-year out of EMPIRE", () => {
    expect(LIFE_HORIZONS).not.toContain("twenty");
    expect(EMPIRE_HORIZONS).not.toContain("ten");
    // The bucket list is a life idea; a business has a backlog instead.
    expect(EMPIRE_HORIZONS).not.toContain("someday");
  });

  it("labels every horizon either scale can produce", () => {
    for (const h of ALL_HORIZONS) {
      expect(HORIZON_LABEL[h], `label for ${h}`).toBeTruthy();
    }
    for (const h of [...LIFE_HORIZONS, ...EMPIRE_HORIZONS]) {
      expect(ALL_HORIZONS, `${h} missing from ALL_HORIZONS`).toContain(h);
    }
  });
});

describe("goal horizons — LIFE_OS scale", () => {
  const on = (target_date: string | null) =>
    goalHorizon(goal({ target_date }), TODAY, "life");

  it("buckets on every boundary, each landing in exactly one", () => {
    // Rolling windows from today: +1mo, +6mo, +1y, +5y, then ten.
    expect(on("2026-09-05")).toBe("month"); // exactly +1 month
    expect(on("2026-09-06")).toBe("six"); // one day past
    expect(on("2027-02-05")).toBe("six"); // exactly +6 months
    expect(on("2027-02-06")).toBe("year");
    expect(on("2027-08-05")).toBe("year"); // exactly +1 year
    expect(on("2027-08-06")).toBe("five");
    expect(on("2031-08-05")).toBe("five"); // exactly +5 years
    expect(on("2031-08-06")).toBe("ten");
    expect(on("2099-01-01")).toBe("ten"); // nothing falls off the end
  });

  it("files today itself under this month", () => {
    expect(on(TODAY)).toBe("month");
  });

  it("pulls an overdue goal to the NEAREST horizon, never a passed one", () => {
    // A date you have already missed is the most immediate thing there is.
    expect(on("2020-01-01")).toBe("month");
    expect(on("2026-08-04")).toBe("month");
  });

  it("returns null for an undated goal rather than inventing a deadline", () => {
    expect(on(null)).toBeNull();
    expect(goalHorizon(goal({}), TODAY, "life")).toBeNull();
  });

  it("puts every dated goal in exactly one bucket", () => {
    const dates = [
      "2020-01-01",
      TODAY,
      "2026-09-05",
      "2026-09-06",
      "2027-02-05",
      "2027-08-05",
      "2031-08-05",
      "2031-08-06",
    ];
    const goals = dates.map((d, i) => goal({ title: `g${i}`, target_date: d }));
    const { buckets, undated, excluded } = bucketGoalsByHorizon(goals, TODAY, "life");
    const placed = LIFE_HORIZONS.flatMap((h) => buckets[h]);
    expect(placed).toHaveLength(dates.length);
    expect(new Set(placed.map((g) => g.title)).size).toBe(dates.length);
    expect(undated).toEqual([]);
    expect(excluded).toEqual([]);
  });
});

describe("goal horizons — the boundary between the scales", () => {
  it("files the same date differently in each system, which is the point", () => {
    const g = goal({ target_date: "2026-11-30" });
    // Life: inside six months of today. Empire: past this quarter, inside
    // the calendar year. Same date, two honest answers.
    expect(goalHorizon(g, TODAY, "life")).toBe("six");
    expect(goalHorizon(g, TODAY, "empire")).toBe("year");
  });

  it("agrees where the scales genuinely agree", () => {
    const g = goal({ target_date: "2030-01-01" });
    expect(goalHorizon(g, TODAY, "life")).toBe("five");
    expect(goalHorizon(g, TODAY, "empire")).toBe("five");
  });

  it("sends the far future to ten in LIFE and twenty in EMPIRE", () => {
    const g = goal({ target_date: "2050-01-01" });
    expect(goalHorizon(g, TODAY, "life")).toBe("ten");
    expect(goalHorizon(g, TODAY, "empire")).toBe("twenty");
  });
});

describe("the bucket list", () => {
  const wish = (title: string, over: Partial<Goal> = {}) =>
    goal({ title, status: "someday", ...over });

  it("is a goal with no date and no plan, not a new table", () => {
    expect(SOMEDAY_STATUS).toBe("someday");
    expect(isSomeday(wish("see the northern lights"))).toBe(true);
    expect(isSomeday(goal({ status: "active" }))).toBe(false);
  });

  it("is not 'live work', so it stays out of active counts", () => {
    expect(isLive(wish("learn to sail"))).toBe(false);
  });

  it("gets its own horizon in LIFE_OS", () => {
    expect(goalHorizon(wish("x"), TODAY, "life")).toBe("someday");
    expect(LIFE_HORIZONS).toContain("someday");
  });

  it("stays someday even if a date got attached — status is the promotion", () => {
    // Writing a date next to a wish does not promote it. Only the status
    // change does, which is what makes promotion a single field change.
    expect(goalHorizon(wish("x", { target_date: "2026-09-01" }), TODAY, "life")).toBe(
      "someday"
    );
  });

  it("promotes with one field, keeping everything else about the goal", () => {
    const before = wish("walk the Camino", {
      id: "keep-me",
      pillar_id: "training",
      description: "800km",
    });
    // The promotion, exactly as BucketList performs it.
    const after: Goal = { ...before, status: "active" };

    expect(goalHorizon(after, TODAY, "life")).toBeNull(); // undated, honestly
    expect(isLive(after)).toBe(true);
    expect(after.id).toBe("keep-me"); // same row, same links
    expect(after.pillar_id).toBe("training");
    expect(after.description).toBe("800km");
  });

  it("files a promoted goal by its date the moment it has one", () => {
    const promoted: Goal = {
      ...wish("run a marathon"),
      status: "active",
      target_date: "2026-09-01",
    };
    expect(goalHorizon(promoted, TODAY, "life")).toBe("month");
  });

  it("sorts the list stably by title", () => {
    const gs = [wish("zip line"), wish("alaska"), goal({ title: "active one" })];
    expect(somedayGoals(gs).map((g) => g.title)).toEqual(["alaska", "zip line"]);
  });

  it("NEVER SILENTLY DROPS a wish in the wrong system", () => {
    // EMPIRE has no someday bucket. A bucket-list item viewed there must be
    // reported as excluded, not vanish — nothing Jay wrote down should
    // disappear because of which mode he happens to be in.
    const gs = [wish("sail the Atlantic"), goal({ target_date: "2026-09-30" })];

    const life = bucketGoalsByHorizon(gs, TODAY, "life");
    expect(life.buckets.someday.map((g) => g.title)).toEqual(["sail the Atlantic"]);
    expect(life.excluded).toEqual([]);

    const empire = bucketGoalsByHorizon(gs, TODAY, "empire");
    expect(empire.excluded.map((g) => g.title)).toEqual(["sail the Atlantic"]);
    expect(empire.buckets.quarter).toHaveLength(1);
  });

  it("KEEPS A PROMOTED WISH VISIBLE — the bug the live page caught", () => {
    // Promotion is a single status change, so the promoted goal has no
    // area. Requiring one made it vanish from /life at the exact moment the
    // promotion succeeded — the one moment the feature exists for.
    const lifeIds = new Set(["training", "money"]);
    const promoted = goal({
      title: "walk the Camino",
      status: "active",
      pillar_id: null,
      target_date: "2026-10-15",
    });

    expect(lifeGoalsFor([promoted], lifeIds)).toHaveLength(1);
    const { buckets } = bucketGoalsByHorizon(
      lifeGoalsFor([promoted], lifeIds),
      TODAY,
      "life"
    );
    expect(buckets.six.map((g) => g.title)).toEqual(["walk the Camino"]);
  });

  it("shows life-area goals, unfiled goals and wishes; hides business ones", () => {
    const lifeIds = new Set(["training"]);
    const gs = [
      goal({ title: "mine", pillar_id: "training" }),
      goal({ title: "unfiled", pillar_id: null }),
      wish("a wish"),
      goal({ title: "business", pillar_id: "ventures" }),
    ];
    expect(lifeGoalsFor(gs, lifeIds).map((g) => g.title)).toEqual([
      "mine",
      "unfiled",
      "a wish",
    ]);
  });

  it("keeps someday out of the undated list, which means something else", () => {
    // "No date" and "someday" are different states: one is a goal you have
    // committed to without a deadline, the other you have not committed to.
    const gs = [wish("a wish"), goal({ title: "committed", target_date: null })];
    const { buckets, undated } = bucketGoalsByHorizon(gs, TODAY, "life");
    expect(undated.map((g) => g.title)).toEqual(["committed"]);
    expect(buckets.someday.map((g) => g.title)).toEqual(["a wish"]);
  });

  it("still hides paused, done and dropped goals", () => {
    const gs = [
      goal({ title: "paused", status: "paused", target_date: "2026-09-01" }),
      goal({ title: "done", status: "done", target_date: "2026-09-01" }),
      goal({ title: "dropped", status: "dropped", target_date: "2026-09-01" }),
      goal({ title: "live", target_date: "2026-09-01" }),
    ];
    const { buckets } = bucketGoalsByHorizon(gs, TODAY, "life");
    expect(buckets.month.map((g) => g.title)).toEqual(["live"]);
  });
});
