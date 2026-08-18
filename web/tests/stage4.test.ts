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
import { readFileSync } from "node:fs";
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
import { NAV, PHONE_SLOTS, NAV_GROUPS, navBoxes, topbarNav } from "../src/lib/nav";
import { PLAN_VIEWS } from "../src/components/PlanTabs";
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

/* ================================================================== *
 * The planning surface
 * ================================================================== */

describe("one front door for planning", () => {
  it("holds every surface that answers 'what am I doing'", () => {
    // The whole point. Five screens read `tasks` and answer this question;
    // four of them are lenses on the same work and belong in one strip.
    expect(PLAN_VIEWS.map((v) => v.key)).toEqual(["day", "week", "board", "calendar"]);
  });

  it("gives each view a DIFFERENT question, so none is redundant", () => {
    const questions = PLAN_VIEWS.map((v) => v.question);
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("points every view at a route that exists", () => {
    expect(PLAN_VIEWS.map((v) => v.href)).toEqual([
      "/day",
      "/week",
      "/planner",
      "/calendar",
    ]);
  });

  // Print strips the app chrome so a browser can lay it out for paper, so
  // it cannot be a tab of a page that HAS chrome. It is an export, not a
  // lens on the same work.
  it("does not make Print a view", () => {
    expect(PLAN_VIEWS.some((v) => v.href.includes("print"))).toBe(false);
  });

  // Calendar CAME BACK to the nav on 2026-08-18 and is deliberately in
  // both places. It left on 14 Aug because it was a fourth surface
  // answering "what am I doing" sitting outside the strip the other
  // three shared — a peer of Inbox and Advisor, which it is not. The
  // boxes dissolve that: inside WORKSPACE it is plainly one of six
  // things you do this week, so the strip and the box agree rather
  // than competing.
  it("keeps Calendar in the Workspace box AND in the Plan strip", () => {
    const cal = NAV.find((n) => n.href === "/calendar")!;
    expect(cal.group).toBe("workspace");
    expect(PLAN_VIEWS.some((v) => v.href === "/calendar")).toBe(true);
  });

  it("keeps the planning door itself at the head of the first box", () => {
    // "Today" is the sheet's word for /day, and it leads WORKSPACE for
    // the same reason /day is the front door: a morning starts with
    // "what am I doing next?".
    const today = NAV.find((n) => n.key === "today")!;
    expect(today.href).toBe("/day");
    expect(today.group).toBe("workspace");
    expect(navBoxes()[0].items[0].key).toBe("today");
  });
});

/* ==================================================================== *
 * THE FOUR BOXES — 2026-08-18, from Jay's sheet
 *
 * The nav stopped being a flat list filtered by mode and became four
 * named groups with boxed titles. These hold the shape he drew, because
 * the shape IS the design: the value of naming a group is entirely in
 * the name not moving.
 * ==================================================================== */

describe("the four boxes", () => {
  it("keeps the four groups, in the order they were drawn", () => {
    expect(NAV_GROUPS.map((g) => g.title)).toEqual([
      "Workspace",
      "Money",
      "Life Plan",
      "Information Library",
    ]);
  });

  it("fills Workspace with the day and the week", () => {
    expect(labelsIn("workspace")).toEqual([
      "Today",
      "Calendar",
      "Work Diary",
      "Feed the System",
      "Tasks",
      "Weekly Review",
    ]);
  });

  it("leaves Money as three lines after the crossings-out", () => {
    // Health, Food and Property were struck off this box on the sheet.
    // The first two reappear under LIFE PLAN; Property is a venture,
    // which is what Ventures already says.
    expect(labelsIn("money")).toEqual(["Finances", "Ventures", "Vehicles"]);
    expect(labelsIn("money")).not.toContain("Health");
    expect(labelsIn("money")).not.toContain("Food");
  });

  it("gives Life Plan the three that have pages, and NOT Motivation", () => {
    // Motivation is on the sheet and has no route — it was one of the
    // ten ghosts deleted on 17 Aug. A nav entry pointing at a 404 is
    // worse than no entry: it teaches you the nav lies. This assertion
    // is the reminder, and it flips the day the page exists.
    expect(labelsIn("life")).toEqual(["Health", "Food", "Family"]);
    expect(NAV.some((n) => n.href === "/motivation")).toBe(false);
  });

  it("fills the Information Library with what is written down", () => {
    expect(labelsIn("library")).toEqual([
      "Library",
      "Life Principles",
      "Documents",
      "Debt Pay Off Plan",
    ]);
  });

  it("puts Inbox and Advisor in the top bar and in no box", () => {
    expect(topbarNav().map((n) => n.label)).toEqual(["Inbox", "Advisor"]);
    for (const n of topbarNav()) expect(n.group).toBeNull();
    for (const box of navBoxes()) {
      expect(box.items.map((i) => i.key)).not.toContain("inbox");
      expect(box.items.map((i) => i.key)).not.toContain("advisor");
    }
  });

  it("renders no empty box", () => {
    // A title promising nothing is the same lie as a nav item pointing
    // at a 404, so `navBoxes` drops a group rather than drawing it bare.
    for (const box of navBoxes()) expect(box.items.length).toBeGreaterThan(0);
    expect(navBoxes([])).toEqual([]);
  });

  it("keeps every registry-only address out of the boxes but in ⌘K", () => {
    // These have real links pointing at them from inside pages and are
    // findable by name. An address you can only reach by typing it is a
    // page nobody opens, which is why they stay in the registry at all.
    const hidden = NAV.filter((n) => n.hidden).map((n) => n.href);
    for (const href of [
      "/dashboard",
      "/estate",
      "/holdings",
      "/opportunities",
      "/goals",
      "/checkin",
      "/reflect",
      "/diagnose",
      "/account",
    ]) {
      expect(hidden, `${href} must stay reachable`).toContain(href);
    }
    const boxed = navBoxes().flatMap((b) => b.items.map((i) => i.href));
    for (const href of hidden) expect(boxed).not.toContain(href);
  });

  it("never gives a boxed item a topbar flag, or the reverse", () => {
    for (const n of NAV) {
      if (n.group) {
        expect(n.topbar, `${n.label}`).toBeFalsy();
        expect(n.hidden, `${n.label}`).toBeFalsy();
      }
    }
  });

  it("keeps every href in the registry unique", () => {
    // Two entries onto one address under two names is how a nav starts
    // feeling arbitrary — you learn the address twice and trust neither.
    const hrefs = NAV.map((n) => n.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives a short label to anything too long for a fifth of a phone", () => {
    // The bar is `grid-cols-5`, so a phone item's label has ~78px. Any
    // phone item over twelve characters needs the short form or it
    // truncates to nonsense.
    for (const n of NAV) {
      if (n.phoneModes.length && n.label.length > 12) {
        expect(n.short, `${n.label} on the phone bar`).toBeTruthy();
      }
    }
  });
});

const labelsIn = (g: string) =>
  navBoxes()
    .filter((b) => b.group.key === g)
    .flatMap((b) => b.items.map((i) => i.label));

describe("nav by mode", () => {
  const labels = (m: Mode) => navForMode(NAV, m).map((n) => n.label);

  /* THE THREE PER-MODE LISTS WERE DELETED ON 2026-08-18, and their
   * deletion is the change rather than a casualty of it.
   *
   * They asserted that `life` saw eleven items, `empire` ten and
   * `brain` twelve — three different navs, one per system. The sheet
   * replaces that with four named boxes, and a box whose membership
   * changed under you defeats the point of naming it: you learn "Money
   * is the second box" once, not once per system.
   *
   * So every item now carries all three modes, and the property worth
   * testing is that this is TRUE OF ALL OF THEM rather than true by
   * accident of fifteen separate lists. The fail-closed CSS is
   * unchanged and still tested below — a dropped `data-mode` still has
   * a defined meaning, it is simply no longer the difference between
   * two navs.
   */
  it("shows the same nav in every mode, which is what a named box means", () => {
    const brain = labels("brain");
    expect(labels("life")).toEqual(brain);
    expect(labels("empire")).toEqual(brain);
    expect(brain.length).toBe(NAV.length);
  });

  it("KEEPS CAPTURE AND INBOX IN EVERY MODE", () => {
    // Locked decision 4 is phone-first capture. Hiding the entry points
    // behind a mode would mean a thought you had in the wrong mode is a
    // thought you lose. This is the one nav rule that is not negotiable.
    //
    // Keyed on the ADDRESS, not the label: capture is called "Feed the
    // System" since 2026-08-18 and could be renamed again. The rule is
    // about the door, not what is written on it.
    const hrefs = (m: Mode) => navForMode(NAV, m).map((n) => n.href);
    for (const m of MODES) {
      expect(hrefs(m), `top bar in ${m}`).toContain("/capture");
      expect(hrefs(m), `top bar in ${m}`).toContain("/inbox");
      const phone = phoneNavForMode(NAV, m).map((n) => n.href);
      expect(phone, `phone bar in ${m}`).toContain("/capture");
      expect(phone, `phone bar in ${m}`).toContain("/inbox");
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

describe("the nav CSS fails closed", () => {
  /* The nav is filtered in CSS off `data-mode` (§A5), which means the
   * stylesheet — not `navForMode` — is what the top bar actually obeys. The
   * tests above can all pass while the bar is wrong, and on 2026-08-06 they
   * did: a client navigation dropped the attribute in production, every
   * selector keyed on `:root[data-mode=…]` stopped matching, and all
   * seventeen items from all three modes rendered at once and pushed the
   * page sideways. Nothing here could have caught it, so this reads the
   * stylesheet directly. It is a coarse test of a file rather than a
   * function, and that is the point: the rule it guards lives in a file. */
  const css = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8"
  );

  it("treats a missing data-mode as `brain` rather than as no mode", () => {
    // Without these two, a dropped attribute shows every item from every
    // mode. Failing closed to the neutral position is what makes the nav
    // correct with no JavaScript at all, and correct even when it loses.
    expect(css).toContain(
      ':root:not([data-mode]) [data-nav-modes]:not([data-nav-modes~="brain"])'
    );
    expect(css).toContain(
      ':root:not([data-mode]) [data-phone-modes]:not([data-phone-modes~="brain"])'
    );
  });

  it("hides the other modes' items in each of the three modes", () => {
    for (const m of ["brain", "life", "empire"] as const) {
      expect(css, `nav items outside ${m}`).toContain(
        `:root[data-mode="${m}"] [data-nav-modes]:not([data-nav-modes~="${m}"])`
      );
      expect(css, `phone items outside ${m}`).toContain(
        `:root[data-mode="${m}"] [data-phone-modes]:not([data-phone-modes~="${m}"])`
      );
    }
  });

  it("marks up every nav item with both attributes the CSS filters on", () => {
    // The stylesheet hides what does NOT carry the current mode, so an item
    // rendered without `data-nav-modes` at all is visible in every mode. The
    // registry is where that attribute comes from, so both lists must be
    // present on every row for the selectors above to have anything to bite.
    for (const item of NAV) {
      expect(Array.isArray(item.modes), `${item.label}.modes`).toBe(true);
      expect(Array.isArray(item.phoneModes), `${item.label}.phoneModes`).toBe(true);
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
