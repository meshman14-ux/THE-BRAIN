import { describe, it, expect } from "vitest";
import {
  LANE_ORDER,
  nextStatus,
  isOnBoard,
  sortByPriority,
  laneTasks,
  toIso,
  weekOf,
  weekOffset,
  tasksOnDay,
  unscheduled,
  countsByPillar,
  isUntouched,
  DORMANT_AFTER_DAYS,
  isDormant,
  splitDormant,
  leftovers,
  areasFor,
  noteFromCapture,
  taskTitleFromCapture,
  isLive,
  projectsForGoal,
  projectProgress,
  statedProgress,
  derivedProgress,
  progressDrifts,
  clampPercent,
  isOverdue,
  daysUntil,
  sortGoals,
  goalsByPillar,
  goalRollup,
  addDays,
  addYears,
  mondayOf,
  sameWeek,
  isoWeekNumber,
  quarterOf,
  endOfQuarter,
  endOfYear,
  formatDayLong,
  daysUntilWeeklyReview,
  formatGBP,
  formatCount,
  latestReading,
  metricChange,
  currentStreak,
  dueWithin,
  isScored,
  rankAreasByNeed,
  averageScore,
  focusArea,
  scoreBarPercent,
  isOpenWork,
  todayReason,
  pickThree,
  openCount,
  todayProgress,
  weekPriorities,
  slotLabel,
  goalHorizon,
  bucketGoalsByHorizon,
  EMPIRE_HORIZONS,
  STAGE_BASELINE,
  isShelved,
  ventureBaseline,
  ventureRollup,
  inDevelopment,
  backlog,
  sortVentures,
  countsByVenture,
  TODAY_LIMIT,
} from "../src/lib/logic";
import type { Goal, Pillar, Project, Task, Venture } from "../src/lib/types";

const task = (over: Partial<Task> = {}): Task => ({
  id: Math.random().toString(36).slice(2),
  title: "t",
  pillar_id: null,
  do_date: null,
  due_date: null,
  priority: "Med",
  status: "open",
  ...over,
});

const pillar = (over: Partial<Pillar> = {}): Pillar => ({
  id: Math.random().toString(36).slice(2),
  system: "life",
  name: "Area",
  emoji: "◆",
  standard: null,
  sort_order: 0,
  active: true,
  ...over,
});

/* ------------------------------------------------------------------ */

describe("kanban lanes", () => {
  it("advances open → doing → done", () => {
    expect(nextStatus("open", 1)).toBe("doing");
    expect(nextStatus("doing", 1)).toBe("done");
  });

  it("goes back done → doing → open", () => {
    expect(nextStatus("done", -1)).toBe("doing");
    expect(nextStatus("doing", -1)).toBe("open");
  });

  it("clamps at both ends rather than wrapping", () => {
    expect(nextStatus("open", -1)).toBe("open");
    expect(nextStatus("done", 1)).toBe("done");
  });

  it("leaves off-board statuses untouched", () => {
    // A waiting task nudged on the board must not silently become 'open'.
    expect(nextStatus("waiting", 1)).toBe("waiting");
    expect(nextStatus("dropped", -1)).toBe("dropped");
  });

  it("knows which statuses are on the board", () => {
    expect(isOnBoard({ status: "open" })).toBe(true);
    expect(isOnBoard({ status: "doing" })).toBe(true);
    expect(isOnBoard({ status: "done" })).toBe(true);
    expect(isOnBoard({ status: "waiting" })).toBe(false);
    expect(isOnBoard({ status: "dropped" })).toBe(false);
  });

  it("has exactly three lanes in the documented order", () => {
    expect(LANE_ORDER).toEqual(["open", "doing", "done"]);
  });
});

describe("priority ordering", () => {
  it("sorts High before Med before Low", () => {
    const sorted = sortByPriority([
      task({ title: "c", priority: "Low" }),
      task({ title: "a", priority: "High" }),
      task({ title: "b", priority: "Med" }),
    ]);
    expect(sorted.map((t) => t.title)).toEqual(["a", "b", "c"]);
  });

  it("is stable within a priority", () => {
    const sorted = sortByPriority([
      task({ title: "first", priority: "Med" }),
      task({ title: "second", priority: "Med" }),
      task({ title: "third", priority: "Med" }),
    ]);
    expect(sorted.map((t) => t.title)).toEqual(["first", "second", "third"]);
  });

  it("does not mutate the input", () => {
    const input = [
      task({ title: "low", priority: "Low" }),
      task({ title: "high", priority: "High" }),
    ];
    sortByPriority(input);
    expect(input.map((t) => t.title)).toEqual(["low", "high"]);
  });

  it("selects and orders a single lane", () => {
    const all = [
      task({ title: "doing-low", status: "doing", priority: "Low" }),
      task({ title: "open-low", status: "open", priority: "Low" }),
      task({ title: "open-high", status: "open", priority: "High" }),
    ];
    expect(laneTasks(all, "open").map((t) => t.title)).toEqual([
      "open-high",
      "open-low",
    ]);
  });
});

describe("week maths", () => {
  it("formats dates in local time, not UTC", () => {
    // 1 Jan at 23:30 local must not roll forward to the 2nd.
    expect(toIso(new Date(2026, 0, 1, 23, 30))).toBe("2026-01-01");
    // ...and 00:30 must not roll back to the previous year.
    expect(toIso(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });

  it("starts the week on Monday", () => {
    // Thursday 30 July 2026 → week begins Monday 27 July.
    const w = weekOf(new Date(2026, 6, 30));
    expect(w[0]).toBe("2026-07-27");
    expect(w[6]).toBe("2026-08-02");
    expect(w).toHaveLength(7);
  });

  it("treats Sunday as the last day, not the first", () => {
    // Sunday 2 Aug 2026 still belongs to the week starting Mon 27 July.
    expect(weekOf(new Date(2026, 7, 2))[0]).toBe("2026-07-27");
  });

  it("crosses month and year boundaries cleanly", () => {
    // Week containing Thu 31 Dec 2026 runs Mon 28 Dec → Sun 3 Jan 2027.
    const w = weekOf(new Date(2026, 11, 31));
    expect(w[0]).toBe("2026-12-28");
    expect(w[6]).toBe("2027-01-03");
  });

  it("steps forward and back a week at a time", () => {
    const ref = new Date(2026, 6, 30);
    expect(weekOffset(ref, 0)[0]).toBe("2026-07-27");
    expect(weekOffset(ref, 1)[0]).toBe("2026-08-03");
    expect(weekOffset(ref, -1)[0]).toBe("2026-07-20");
  });

  it("buckets tasks onto the right day", () => {
    const all = [
      task({ title: "mon", do_date: "2026-07-27" }),
      task({ title: "wed", do_date: "2026-07-29" }),
      task({ title: "also-mon", do_date: "2026-07-27" }),
    ];
    expect(tasksOnDay(all, "2026-07-27").map((t) => t.title)).toEqual([
      "mon",
      "also-mon",
    ]);
    expect(tasksOnDay(all, "2026-07-28")).toEqual([]);
  });
});

describe("the unscheduled pool", () => {
  const week = weekOf(new Date(2026, 6, 30)); // 27 Jul → 2 Aug

  it("includes tasks with no do_date", () => {
    const pool = unscheduled([task({ title: "loose" })], week);
    expect(pool.map((t) => t.title)).toEqual(["loose"]);
  });

  it("excludes tasks scheduled inside the visible week", () => {
    expect(unscheduled([task({ do_date: "2026-07-29" })], week)).toEqual([]);
  });

  it("includes tasks scheduled outside the visible week", () => {
    // The regression this guards: a task parked next month vanishing entirely,
    // visible on no day and absent from the pool.
    const pool = unscheduled([task({ title: "later", do_date: "2026-09-01" })], week);
    expect(pool.map((t) => t.title)).toEqual(["later"]);
  });
});

describe("area roll-ups", () => {
  it("counts goals, projects and tasks per area", () => {
    const counts = countsByPillar(
      [{ pillar_id: "a" }, { pillar_id: "a" }],
      [{ pillar_id: "b" }],
      [{ pillar_id: "a" }, { pillar_id: "b" }, { pillar_id: "b" }]
    );
    expect(counts.a).toEqual({ goals: 2, projects: 0, tasks: 1 });
    expect(counts.b).toEqual({ goals: 0, projects: 1, tasks: 2 });
  });

  it("ignores records with no area", () => {
    const counts = countsByPillar([{ pillar_id: null }], [], []);
    expect(Object.keys(counts)).toEqual([]);
  });

  it("marks an area untouched only when everything is zero", () => {
    expect(isUntouched(undefined)).toBe(true);
    expect(isUntouched({ goals: 0, projects: 0, tasks: 0 })).toBe(true);
    expect(isUntouched({ goals: 0, projects: 0, tasks: 1 })).toBe(false);
  });

  it("splits areas by subsystem and respects sort order", () => {
    const pillars = [
      pillar({ name: "second", system: "life", sort_order: 2 }),
      pillar({ name: "first", system: "life", sort_order: 1 }),
      pillar({ name: "empire", system: "empire", sort_order: 1 }),
    ];
    expect(areasFor(pillars, "life").map((p) => p.name)).toEqual([
      "first",
      "second",
    ]);
    expect(areasFor(pillars, "empire").map((p) => p.name)).toEqual(["empire"]);
  });

  it("hides inactive areas", () => {
    const pillars = [pillar({ name: "gone", active: false })];
    expect(areasFor(pillars, "life")).toEqual([]);
  });
});

describe("capture routing", () => {
  it("uses the first line as a note title and keeps the whole text as body", () => {
    const { title, body } = noteFromCapture("Coffee shop idea\n\nRent is £1200/mo");
    expect(title).toBe("Coffee shop idea");
    expect(body).toBe("Coffee shop idea\n\nRent is £1200/mo");
  });

  it("truncates a very long first line rather than producing a wall", () => {
    const { title } = noteFromCapture("x".repeat(400));
    expect(title).toHaveLength(120);
    expect(title.endsWith("…")).toBe(true);
  });

  it("never produces an empty note title", () => {
    expect(noteFromCapture("   ").title).toBe("(untitled)");
  });

  it("takes only the first line for a task title", () => {
    expect(taskTitleFromCapture("Call the plumber\nabout the leak")).toBe(
      "Call the plumber"
    );
  });

  it("caps a task title at the column limit", () => {
    const t = taskTitleFromCapture("y".repeat(500));
    expect(t).toHaveLength(300);
  });
});

/* ------------------------------------------------------------------ *
 * The cascade — Goals → Projects → Tasks
 * ------------------------------------------------------------------ */

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: Math.random().toString(36).slice(2),
  title: "g",
  description: null,
  pillar_id: null,
  vision_id: null,
  target_date: null,
  progress: 0,
  status: "active",
  ...over,
});

const project = (over: Partial<Project> = {}): Project => ({
  id: Math.random().toString(36).slice(2),
  title: "p",
  description: null,
  pillar_id: null,
  goal_id: null,
  start_date: null,
  due_date: null,
  status: "active",
  ...over,
});

const TODAY = "2026-07-30";

describe("isLive", () => {
  it("counts only active items", () => {
    expect(isLive(goal({ status: "active" }))).toBe(true);
    (["paused", "done", "dropped"] as const).forEach((s) =>
      expect(isLive(goal({ status: s }))).toBe(false)
    );
  });
});

describe("projectsForGoal", () => {
  it("returns a goal's projects", () => {
    const ps = [project({ goal_id: "g1" }), project({ goal_id: "g2" }), project({ goal_id: "g1" })];
    expect(projectsForGoal(ps, "g1")).toHaveLength(2);
  });

  it("treats unattached projects as a real view, not leftovers", () => {
    const ps = [project({ goal_id: null }), project({ goal_id: "g1" })];
    expect(projectsForGoal(ps, null)).toHaveLength(1);
  });
});

describe("projectProgress", () => {
  it("is done over counted, as a percentage", () => {
    const ts = [task({ status: "done" }), task({ status: "done" }), task({ status: "open" }), task({ status: "doing" })];
    expect(projectProgress(ts)).toBe(50);
  });

  it("excludes dropped tasks from the denominator — cutting scope must not punish you", () => {
    const ts = [task({ status: "done" }), task({ status: "dropped" }), task({ status: "dropped" })];
    expect(projectProgress(ts)).toBe(100);
  });

  it("distinguishes 'no tasks' (null) from 'none done' (0)", () => {
    expect(projectProgress([])).toBeNull();
    expect(projectProgress([task({ status: "dropped" })])).toBeNull();
    expect(projectProgress([task({ status: "open" })])).toBe(0);
  });

  it("rounds to whole percent", () => {
    expect(projectProgress([task({ status: "done" }), task({ status: "open" }), task({ status: "open" })])).toBe(33);
  });
});

describe("statedProgress / derivedProgress", () => {
  it("stated is always a number — the column is NOT NULL, so it can never mean 'derive it'", () => {
    expect(statedProgress(goal({ progress: 70 }))).toBe(70);
    expect(statedProgress(goal({ progress: 0 }))).toBe(0);
  });

  it("stated clamps a stored value that is out of range", () => {
    expect(statedProgress(goal({ progress: 140 }))).toBe(100);
    expect(statedProgress(goal({ progress: -5 }))).toBe(0);
  });

  it("derived averages the projects that have measurable progress", () => {
    expect(derivedProgress([100, 50, 0])).toBe(50);
    expect(derivedProgress([80, null, null])).toBe(80);
  });

  it("derived is null when nothing underneath is measurable — not 0", () => {
    expect(derivedProgress([])).toBeNull();
    expect(derivedProgress([null])).toBeNull();
  });
});

describe("progressDrifts", () => {
  it("flags a goal claiming more than its work supports", () => {
    expect(progressDrifts(80, 20)).toBe(true);
  });

  it("stays quiet when the two roughly agree", () => {
    expect(progressDrifts(50, 45)).toBe(false);
  });

  it("triggers exactly at the threshold, not just past it", () => {
    expect(progressDrifts(50, 35)).toBe(true);
    expect(progressDrifts(50, 36)).toBe(false);
  });

  it("cannot drift against nothing", () => {
    expect(progressDrifts(90, null)).toBe(false);
  });

  it("flags under-claiming too — the gap matters in both directions", () => {
    expect(progressDrifts(10, 90)).toBe(true);
  });
});

describe("clampPercent", () => {
  it("bounds to 0..100 and rounds", () => {
    expect(clampPercent(50.4)).toBe(50);
    expect(clampPercent(-1)).toBe(0);
    expect(clampPercent(101)).toBe(100);
    expect(clampPercent(NaN)).toBe(0);
  });
});

describe("isOverdue", () => {
  it("is true for a live item past its date", () => {
    expect(isOverdue(goal({ target_date: "2026-07-29" }), TODAY)).toBe(true);
  });

  it("is false on the day itself — you still have today", () => {
    expect(isOverdue(goal({ target_date: TODAY }), TODAY)).toBe(false);
  });

  it("never marks finished work overdue, however late it was", () => {
    expect(isOverdue(goal({ target_date: "2020-01-01", status: "done" }), TODAY)).toBe(false);
    expect(isOverdue(goal({ target_date: "2020-01-01", status: "dropped" }), TODAY)).toBe(false);
  });

  it("reads due_date for projects and is false with no date at all", () => {
    expect(isOverdue(project({ due_date: "2026-07-01" }), TODAY)).toBe(true);
    expect(isOverdue(goal({ target_date: null }), TODAY)).toBe(false);
  });
});

describe("daysUntil", () => {
  it("counts forward, backward and handles no date", () => {
    expect(daysUntil("2026-08-02", TODAY)).toBe(3);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
    expect(daysUntil("2026-07-28", TODAY)).toBe(-2);
    expect(daysUntil(null, TODAY)).toBeNull();
  });

  it("crosses a month boundary correctly", () => {
    expect(daysUntil("2026-08-01", "2026-07-31")).toBe(1);
  });
});

describe("sortGoals", () => {
  it("puts overdue first, then soonest, with undated last", () => {
    const a = goal({ title: "soon", target_date: "2026-08-05" });
    const b = goal({ title: "late", target_date: "2026-07-01" });
    const c = goal({ title: "undated", target_date: null });
    const d = goal({ title: "later", target_date: "2026-09-01" });
    expect(sortGoals([c, d, a, b], TODAY).map((g) => g.title)).toEqual([
      "late",
      "soon",
      "later",
      "undated",
    ]);
  });

  it("does not mutate its input", () => {
    const gs = [goal({ target_date: "2026-09-01" }), goal({ target_date: "2026-08-01" })];
    const before = gs.map((g) => g.id);
    sortGoals(gs, TODAY);
    expect(gs.map((g) => g.id)).toEqual(before);
  });
});

describe("goalsByPillar", () => {
  it("groups by area and keeps arealess goals under null", () => {
    const m = goalsByPillar([
      goal({ pillar_id: "p1" }),
      goal({ pillar_id: null }),
      goal({ pillar_id: "p1" }),
    ]);
    expect(m.get("p1")).toHaveLength(2);
    expect(m.get(null)).toHaveLength(1);
  });
});

describe("goalRollup", () => {
  it("gathers live projects, rolls up progress, and flags overdue", () => {
    const g = goal({ id: "g1", target_date: "2026-07-01" });
    const p1 = project({ id: "p1", goal_id: "g1" });
    const p2 = project({ id: "p2", goal_id: "g1" });
    const dropped = project({ id: "p3", goal_id: "g1", status: "dropped" });
    const other = project({ id: "p4", goal_id: "g2" });
    const tasks: Record<string, Task[]> = {
      p1: [task({ status: "done" }), task({ status: "open" })],
      p2: [task({ status: "done" })],
      p3: [task({ status: "open" })],
      p4: [task({ status: "open" })],
    };
    const r = goalRollup(g, [p1, p2, dropped, other], (id) => tasks[id] ?? [], TODAY);
    expect(r.projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(r.derived).toBe(75); // (50 + 100) / 2
    expect(r.stated).toBe(0); // untouched by hand
    expect(r.drifts).toBe(true); // claims 0, work says 75
    expect(r.overdue).toBe(true);
  });

  it("copes with a goal that has no projects", () => {
    const r = goalRollup(goal({ id: "g1" }), [], () => [], TODAY);
    expect(r.projects).toEqual([]);
    expect(r.derived).toBeNull();
    expect(r.stated).toBe(0);
    expect(r.drifts).toBe(false); // nothing to disagree with
    expect(r.overdue).toBe(false);
  });
});

/* ==================================================================== *
 * JAY_OS + EMPIRE_OS rules
 *
 * FRI is a Friday, which is what the design's header is drawn on:
 * "Friday 31.07", "WK 31 · Q3", "WEEKLY REVIEW IN 2 DAYS". Those three
 * strings should fall out of the rules rather than be typed into a
 * component, so they are asserted here.
 * ==================================================================== */

const FRI = "2026-07-31";
const MON = "2026-07-27";

const venture = (over: Partial<Venture> = {}): Venture => ({
  id: Math.random().toString(36).slice(2),
  name: "V",
  pillar_id: null,
  stage: "idea",
  progress: 0,
  one_liner: null,
  status: "active",
  sort_order: 0,
  external_system: null,
  ...over,
});

describe("calendar maths", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
    expect(addDays(FRI, 0)).toBe(FRI);
  });

  it("adds years, pulling 29 Feb back to 28 Feb rather than into March", () => {
    expect(addYears("2026-07-31", 5)).toBe("2031-07-31");
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
  });

  it("finds the Monday of the week, and Monday is its own Monday", () => {
    expect(mondayOf(FRI)).toBe(MON);
    expect(mondayOf(MON)).toBe(MON);
    expect(mondayOf("2026-08-02")).toBe(MON); // Sunday still belongs to it
    expect(mondayOf("2026-08-03")).toBe("2026-08-03");
  });

  it("groups dates into the same Monday-first week", () => {
    expect(sameWeek(FRI, MON)).toBe(true);
    expect(sameWeek("2026-08-02", "2026-08-03")).toBe(false);
  });

  it("numbers ISO weeks by the first Thursday, not by day-of-year / 7", () => {
    expect(isoWeekNumber(FRI)).toBe(31);
    expect(isoWeekNumber(MON)).toBe(31);
    // 2026 opens on a Thursday, so 1 Jan is already week 1 —
    // and the Monday before it, in 2025, is the same ISO week.
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2025-12-29")).toBe(1);
    // 2027 opens on a Friday, so 1 Jan belongs to the previous year's week 53.
    expect(isoWeekNumber("2027-01-01")).toBe(53);
  });

  it("reports the quarter and its last day", () => {
    expect(quarterOf(FRI)).toBe(3);
    expect(quarterOf("2026-01-01")).toBe(1);
    expect(quarterOf("2026-12-31")).toBe(4);
    expect(endOfQuarter(FRI)).toBe("2026-09-30");
    expect(endOfQuarter("2026-02-10")).toBe("2026-03-31");
    expect(endOfYear(FRI)).toBe("2026-12-31");
  });

  it("formats the hero date the way the design shows it", () => {
    expect(formatDayLong(FRI)).toBe("Friday 31.07");
    expect(formatDayLong("2026-08-03")).toBe("Monday 03.08");
  });

  it("counts down to Sunday's weekly review, and says 0 on the day", () => {
    expect(daysUntilWeeklyReview(FRI)).toBe(2);
    expect(daysUntilWeeklyReview(MON)).toBe(6);
    expect(daysUntilWeeklyReview("2026-08-02")).toBe(0);
  });
});

describe("money", () => {
  it("renders an em-dash for a figure that does not exist", () => {
    expect(formatGBP(null)).toBe("£—");
    expect(formatGBP(undefined)).toBe("£—");
    expect(formatGBP(NaN)).toBe("£—");
  });

  it("renders a real zero as £0 — zero and 'not yet' are different facts", () => {
    expect(formatGBP(0)).toBe("£0");
  });

  it("groups thousands and keeps GBP", () => {
    expect(formatGBP(8317)).toBe("£8,317");
    expect(formatGBP(999)).toBe("£999");
    expect(formatGBP(1000)).toBe("£1,000");
    expect(formatGBP(1234567)).toBe("£1,234,567");
    expect(formatGBP(-450)).toBe("−£450");
  });

  it("does the same for plain counts", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(12)).toBe("12");
  });
});

describe("metrics", () => {
  const r = (taken_on: string, value: number) => ({ metric_id: "m", taken_on, value });

  it("returns the most recent reading regardless of input order", () => {
    expect(latestReading([r("2026-07-01", 9000), r(FRI, 8317)])?.value).toBe(8317);
    expect(latestReading([r(FRI, 8317), r("2026-07-01", 9000)])?.value).toBe(8317);
  });

  it("is null when the metric has never been read", () => {
    expect(latestReading([])).toBeNull();
  });

  it("will not draw a trend through a single point", () => {
    expect(metricChange([r(FRI, 8317)], FRI, 30)).toBeNull();
    expect(metricChange([], FRI, 30)).toBeNull();
  });

  it("measures the move across the window and ignores readings outside it", () => {
    const readings = [r("2026-07-01", 9000), r("2026-07-15", 8600), r(FRI, 8317)];
    expect(metricChange(readings, FRI, 30)).toBe(-683);
    // A 10-day window cannot see 1 July, leaving 15 July → 31 July.
    expect(metricChange(readings, FRI, 20)).toBe(-283);
  });
});

describe("currentStreak", () => {
  it("counts back from today", () => {
    expect(currentStreak(["2026-07-29", "2026-07-30", FRI], FRI)).toBe(3);
  });

  it("survives a day that has not happened yet", () => {
    // Last trained yesterday; today is simply undecided, not a break.
    expect(currentStreak(["2026-07-29", "2026-07-30"], FRI)).toBe(2);
  });

  it("dies once a whole day passes with nothing logged", () => {
    expect(currentStreak(["2026-07-28", "2026-07-29"], FRI)).toBe(0);
  });

  it("stops at the first gap and ignores older runs", () => {
    expect(currentStreak(["2026-07-01", "2026-07-02", "2026-07-30", FRI], FRI)).toBe(2);
  });

  it("is 0 with no logs at all, and copes with duplicates", () => {
    expect(currentStreak([], FRI)).toBe(0);
    expect(currentStreak([FRI, FRI, "2026-07-30"], FRI)).toBe(2);
  });
});

describe("dueWithin", () => {
  const item = (due_date: string | null, status = "open") => ({ due_date, status });

  it("includes the horizon day and excludes the day after", () => {
    expect(dueWithin([item("2026-08-07")], FRI)).toHaveLength(1);
    expect(dueWithin([item("2026-08-08")], FRI)).toHaveLength(0);
  });

  it("counts overdue deadlines — the dashboard does not flatter him", () => {
    expect(dueWithin([item("2026-06-01")], FRI)).toHaveLength(1);
  });

  it("ignores finished work and anything with no date", () => {
    expect(dueWithin([item("2026-08-01", "done")], FRI)).toHaveLength(0);
    expect(dueWithin([item(null)], FRI)).toHaveLength(0);
  });
});

describe("life areas", () => {
  const area = (score: number | null, sort_order: number, over: Partial<Pillar> = {}) =>
    pillar({ score, sort_order, ...over });

  it("knows scored-zero from not-scored", () => {
    expect(isScored(area(0, 1))).toBe(true);
    expect(isScored(area(null, 1))).toBe(false);
  });

  it("ranks worst first", () => {
    const ranked = rankAreasByNeed([area(8, 1), area(3, 2), area(6, 3)]);
    expect(ranked.map((a) => a.score)).toEqual([3, 6, 8]);
  });

  it("sinks unscored areas below every scored one, rather than treating them as 0", () => {
    const ranked = rankAreasByNeed([area(null, 1), area(4, 2), area(0, 3)]);
    expect(ranked.map((a) => a.score)).toEqual([0, 4, null]);
  });

  it("breaks ties by configured order and does not mutate its input", () => {
    const input = [area(5, 3), area(5, 1), area(5, 2)];
    const before = input.map((a) => a.id);
    expect(rankAreasByNeed(input).map((a) => a.sort_order)).toEqual([1, 2, 3]);
    expect(input.map((a) => a.id)).toEqual(before);
  });

  it("averages only the scored areas, to one decimal", () => {
    // 8 + 3 + 6 + 5 = 22 over 4 → 5.5, with the unscored one ignored.
    expect(averageScore([area(8, 1), area(3, 2), area(6, 3), area(5, 4), area(null, 5)])).toBe(5.5);
    expect(averageScore([area(7, 1), area(5, 2), area(6, 3)])).toBe(6);
  });

  it("returns null when nothing has been scored — not 0", () => {
    expect(averageScore([area(null, 1), area(null, 2)])).toBeNull();
    expect(averageScore([])).toBeNull();
  });

  it("takes this week's focus from focus_week, never from the worst score", () => {
    const worst = area(1, 1);
    const chosen = area(9, 2, { focus_week: MON });
    expect(focusArea([worst, chosen], FRI)?.id).toBe(chosen.id);
  });

  it("accepts any day inside the week as this week's focus", () => {
    const chosen = area(5, 1, { focus_week: FRI });
    expect(focusArea([chosen], MON)?.id).toBe(chosen.id);
  });

  it("returns null when no focus is declared, or the focus is stale", () => {
    expect(focusArea([area(1, 1), area(2, 2)], FRI)).toBeNull();
    expect(focusArea([area(1, 1, { focus_week: "2026-07-20" })], FRI)).toBeNull();
  });

  it("turns a score out of 10 into a bar width", () => {
    expect(scoreBarPercent(0)).toBe(0);
    expect(scoreBarPercent(5.9)).toBe(59);
    expect(scoreBarPercent(10)).toBe(100);
    expect(scoreBarPercent(null)).toBe(0);
  });
});

describe("pickThree", () => {
  it("surfaces at most three, whatever the size of the list", () => {
    const many = Array.from({ length: 12 }, (_, i) => task({ title: `t${i}` }));
    expect(pickThree(many, FRI)).toHaveLength(TODAY_LIMIT);
    expect(TODAY_LIMIT).toBe(3);
  });

  it("puts today's decided work first, then deadlines, then High", () => {
    const later = task({ title: "someday" });
    const high = task({ title: "high", priority: "High" });
    const deadline = task({ title: "deadline", due_date: "2026-08-03" });
    const doToday = task({ title: "today", do_date: FRI, priority: "Low" });
    const picked = pickThree([later, high, deadline, doToday], FRI);
    expect(picked.map((t) => t.title)).toEqual(["today", "deadline", "high"]);
  });

  it("treats a missed do_date as today's work, not as history", () => {
    expect(todayReason(task({ do_date: "2026-07-20" }), FRI)).toBe("do-today");
    expect(todayReason(task({ due_date: "2026-08-03" }), FRI)).toBe("deadline");
    expect(todayReason(task({ priority: "High" }), FRI)).toBe("high");
    expect(todayReason(task({ priority: "Low" }), FRI)).toBe("next");
    // A deadline beyond the 7-day window is not yet a reason.
    expect(todayReason(task({ due_date: "2026-09-01" }), FRI)).toBe("next");
  });

  it("leaves done, dropped and waiting work alone", () => {
    const live = [task({ status: "open" }), task({ status: "doing" })];
    const dead = [
      task({ status: "done" }),
      task({ status: "dropped" }),
      task({ status: "waiting" }),
    ];
    expect(pickThree([...dead, ...live], FRI)).toHaveLength(2);
    expect(dead.every((t) => isOpenWork(t))).toBe(false);
    expect(openCount([...dead, ...live])).toBe(2);
  });

  it("is stable — same input, same three", () => {
    const ts = [
      task({ title: "b", priority: "High" }),
      task({ title: "a", priority: "High" }),
      task({ title: "c", priority: "High" }),
    ];
    expect(pickThree(ts, FRI).map((t) => t.title)).toEqual(["a", "b", "c"]);
    expect(pickThree([...ts].reverse(), FRI).map((t) => t.title)).toEqual(["a", "b", "c"]);
  });
});

describe("todayProgress", () => {
  it("reads 0/3 on a day with nothing scheduled", () => {
    expect(todayProgress([], FRI)).toEqual({ done: 0, of: 3 });
  });

  it("counts what is finished of what was set for today", () => {
    const ts = [
      task({ do_date: FRI, status: "done" }),
      task({ do_date: FRI, status: "open" }),
      task({ do_date: "2026-07-30", status: "done" }),
    ];
    expect(todayProgress(ts, FRI)).toEqual({ done: 1, of: 3 });
  });

  it("grows past three rather than hiding an over-full day", () => {
    const ts = Array.from({ length: 5 }, () => task({ do_date: FRI, status: "done" }));
    expect(todayProgress(ts, FRI)).toEqual({ done: 5, of: 5 });
  });
});

describe("weekPriorities", () => {
  const week = weekOf(new Date("2026-07-31T00:00:00"));

  it("takes only High-priority work committed to a day this week", () => {
    const ts = [
      task({ title: "in", priority: "High", do_date: "2026-07-29" }),
      task({ title: "no day", priority: "High" }),
      task({ title: "next week", priority: "High", do_date: "2026-08-10" }),
      task({ title: "not high", priority: "Med", do_date: FRI }),
    ];
    expect(weekPriorities(ts, week).map((t) => t.title)).toEqual(["in"]);
  });

  it("orders by day, then title, and caps at four slots", () => {
    const ts = [
      task({ title: "d", priority: "High", do_date: "2026-08-01" }),
      task({ title: "b", priority: "High", do_date: "2026-07-28" }),
      task({ title: "a", priority: "High", do_date: "2026-07-28" }),
      task({ title: "c", priority: "High", do_date: "2026-07-30" }),
      task({ title: "e", priority: "High", do_date: "2026-08-02" }),
    ];
    expect(weekPriorities(ts, week).map((t) => t.title)).toEqual(["a", "b", "c", "d"]);
  });

  it("numbers the slots 01–04", () => {
    expect([0, 1, 2, 3].map(slotLabel)).toEqual(["01", "02", "03", "04"]);
  });
});

describe("goal horizons — EMPIRE_OS scale", () => {
  // These assertions are unchanged from the single-scale version on purpose.
  // EMPIRE keeps calendar quarters and the 20-year horizon; the £100M
  // objective anchors the CEO dashboard and must survive the split.
  const dated = (target_date: string | null) => goal({ target_date });

  it("buckets by target date", () => {
    expect(goalHorizon(dated("2026-09-30"), FRI, "empire")).toBe("quarter");
    expect(goalHorizon(dated("2026-10-01"), FRI, "empire")).toBe("year");
    expect(goalHorizon(dated("2026-12-31"), FRI, "empire")).toBe("year");
    expect(goalHorizon(dated("2027-01-01"), FRI, "empire")).toBe("five");
    expect(goalHorizon(dated("2031-07-31"), FRI, "empire")).toBe("five");
    expect(goalHorizon(dated("2031-08-01"), FRI, "empire")).toBe("twenty");
  });

  it("pulls an overdue goal into this quarter rather than off the board", () => {
    expect(goalHorizon(dated("2020-01-01"), FRI, "empire")).toBe("quarter");
  });

  it("keeps undated goals out of the columns entirely", () => {
    expect(goalHorizon(dated(null), FRI, "empire")).toBeNull();
    const { buckets, undated } = bucketGoalsByHorizon(
      [goal({ title: "someday", target_date: null }), goal({ target_date: "2026-08-15" })],
      FRI,
      "empire"
    );
    expect(undated.map((g) => g.title)).toEqual(["someday"]);
    expect(buckets.quarter).toHaveLength(1);
  });

  it("drops finished and abandoned goals, and sorts inside each column", () => {
    const { buckets } = bucketGoalsByHorizon(
      [
        goal({ title: "late", target_date: "2026-07-01" }),
        goal({ title: "soon", target_date: "2026-08-20" }),
        goal({ title: "done", target_date: "2026-08-01", status: "done" }),
      ],
      FRI,
      "empire"
    );
    expect(buckets.quarter.map((g) => g.title)).toEqual(["late", "soon"]);
  });

  it("still carries the twenty-year horizon", () => {
    // The £100M objective lives here. If this fails, the CEO dashboard has
    // lost its anchor.
    expect(EMPIRE_HORIZONS).toEqual(["quarter", "year", "five", "twenty"]);
  });
});

describe("venture progress", () => {
  it("reads a live venture at its stage baseline", () => {
    expect(ventureBaseline(venture({ stage: "idea" }))).toBe(10);
    expect(ventureBaseline(venture({ stage: "research" }))).toBe(30);
    expect(ventureBaseline(venture({ stage: "stabilise" }))).toBe(50);
    expect(ventureBaseline(venture({ stage: "launch" }))).toBe(70);
    expect(ventureBaseline(venture({ stage: "revenue" }))).toBe(100);
    expect(STAGE_BASELINE.launch).toBe(70);
  });

  it("halves a shelved venture — which is where the backlog's 5% comes from", () => {
    const parked = venture({ stage: "idea", status: "backlog" });
    expect(isShelved(parked)).toBe(true);
    expect(ventureBaseline(parked)).toBe(5);
    expect(ventureBaseline(venture({ stage: "launch", status: "paused" }))).toBe(35);
  });

  it("treats a stored 0 as untouched and shows the baseline", () => {
    const r = ventureRollup(venture({ stage: "launch", progress: 0 }));
    expect(r.stated).toBeNull();
    expect(r.derived).toBe(70);
    expect(r.shown).toBe(70);
    expect(r.drifts).toBe(false); // no claim was made, so nothing disagrees
  });

  it("lets a deliberate claim override the baseline", () => {
    const r = ventureRollup(venture({ stage: "launch", progress: 80 }));
    expect(r.stated).toBe(80);
    expect(r.shown).toBe(80);
    expect(r.drifts).toBe(false); // 10 apart, under the threshold
  });

  it("says so when the claim and the stage disagree by 15 or more", () => {
    const optimistic = ventureRollup(venture({ stage: "idea", progress: 90 }));
    expect(optimistic.drifts).toBe(true);
    expect(optimistic.shown).toBe(90);
    expect(optimistic.derived).toBe(10);

    const modest = ventureRollup(venture({ stage: "revenue", progress: 40 }));
    expect(modest.drifts).toBe(true);
  });
});

describe("venture lists", () => {
  const az = venture({ name: "A to Z Trailerz", stage: "launch", sort_order: 0 });
  const fba = venture({ name: "Amazon FBA", stage: "research", sort_order: 1 });
  const mainframe = venture({ name: "MAINFRAME", stage: "revenue", sort_order: 9 });
  const coffee = venture({ name: "Coffee Shop", status: "backlog", sort_order: 4 });
  const all = [coffee, mainframe, fba, az];

  it("counts what is in development — live, and not yet earning", () => {
    expect(inDevelopment(all).map((v) => v.name)).toEqual(["Amazon FBA", "A to Z Trailerz"]);
  });

  it("names the backlog rather than folding it into the pipeline", () => {
    expect(backlog(all).map((v) => v.name)).toEqual(["Coffee Shop"]);
  });

  it("sorts live first, furthest along first, shelved last", () => {
    expect(sortVentures(all).map((v) => v.name)).toEqual([
      "MAINFRAME",
      "A to Z Trailerz",
      "Amazon FBA",
      "Coffee Shop",
    ]);
  });
});

describe("countsByVenture", () => {
  it("reaches tasks through their project, and counts only open work", () => {
    const projects = [
      { id: "p1", venture_id: "v1" },
      { id: "p2", venture_id: "v1" },
      { id: "p3", venture_id: null },
    ];
    const tasks = [
      { project_id: "p1", status: "open" },
      { project_id: "p1", status: "done" },
      { project_id: "p2", status: "doing" },
      { project_id: "p3", status: "open" },
      { project_id: null, status: "open" },
    ];
    const counts = countsByVenture(projects, tasks);
    expect(counts["v1"]).toEqual({ projects: 2, tasks: 2 });
    expect(counts["v2"]).toBeUndefined();
  });

  it("is empty when nothing is wired up yet", () => {
    expect(countsByVenture([], [])).toEqual({});
  });
});

/* ==================================================================== *
 * The reference library — integrity of the curated data
 *
 * references.ts is data, and data rots quietly. These tests make the
 * registry structurally sound: every seeded area has a shelf, every
 * division links somewhere real, every URL is https and unique on its
 * shelf, and every internal string points at a route that exists.
 * ==================================================================== */

import {
  PILLAR_REFS,
  BRANCH_REFS,
  BRANCH_RELATED,
  BRANCH_ALIASES,
  ventureSlug,
  branchForVenture,
  EXTERNAL_VENTURES,
  refsForPillar,
  refsForBranch,
} from "../src/lib/references";
import {
  PLACEHOLDERS,
  placeholderFor,
  BUILT_BRANCHES,
} from "../src/lib/placeholders";

const SEEDED_PILLARS = [
  "Training & Fitness",
  "Nutrition & Recovery",
  "Mind & Growth",
  "Family",
  "Friends & Network",
  "Home & Admin",
  "Vehicles",
  "Money & Security",
  "Ventures",
  "Property & Assets",
  "Capital & Investments",
  "Brand & Network",
  "Systems & Tools",
];

// The ventures on the books as of 2026-08-01, MAINFRAME excluded.
// Kept current so "every venture has a shelf" means every actual venture.
const SEEDED_VENTURES = [
  "A to Z Traderz",
  "Amazon FBA",
  "Kathleen St",
  "AI Software",
  "Building + Maintenance",
  "Bedlinog House",
  "Treharris House",
  "Coffee Shop",
  "Microgreens",
  "Resin & Epoxy",
  "Festivals",
  "Charity (India)",
  "Storage Solutions",
  "Photo Booth",
  "Stencil Art",
  "Stump Pump",
  "Find My Stash",
];

const REAL_ROUTES = [
  "/dashboard",
  "/day",
  "/life",
  // Still real routes: both now REDIRECT into the Money parent rather than
  // rendering, so an old bookmark lands on the tab that holds the thing.
  // Both now REDIRECT into the pages that own them (2026-08-14): a
  // creditor list and a set of MOT dates are places you DO something, so
  // each has its own route under Money rather than two addresses each.
  "/life/debts",
  "/life/vehicles",
  "/life/money",
  "/life/money/accounts",
  "/life/money/vehicles",
  // /life/body redirects to /life/health (moved 2026-08-18, when the
  // cockpit's route caught up with its own name); /life/food redirects
  // to /life/health/food.
  "/life/body",
  "/life/health",
  "/life/food",
  "/life/health/food",
  "/life/health/train",
  "/life/health/skills",
  "/life/bucket",
  // /life/people redirects to /life/family (moved 2026-08-18).
  "/life/people",
  "/life/family",
  "/checkin",
  "/empire",
  "/goals",
  "/planner",
  "/week",
  "/capture",
  "/inbox",
  "/library",
  "/library/principles",
  "/library/notes",
  "/life/motivation",
  "/reviews",
  "/calendar",
  "/advisor",
  // Phase 4 · metrics (2026-08-14)
  "/life/metrics",
  // Phase 5 · EMPIRE_OS (2026-08-14). /opportunities was a placeholder for
  // months and is now the deal board at the same address.
  "/opportunities",
  "/holdings",
];

describe("reference library integrity", () => {
  it("gives every seeded pillar a non-empty shelf", () => {
    for (const name of SEEDED_PILLARS) {
      expect(refsForPillar(name).length, `shelf for ${name}`).toBeGreaterThan(0);
    }
  });

  it("has no shelf for a pillar that was never seeded", () => {
    // A key that matches nothing is a shelf nobody can reach.
    for (const key of Object.keys(PILLAR_REFS)) {
      expect(SEEDED_PILLARS, `orphan pillar shelf: ${key}`).toContain(key);
    }
  });

  it("derives a branch slug from any venture name", () => {
    expect(ventureSlug("A to Z Traderz")).toBe("a-to-z-traderz");
    expect(ventureSlug("Resin & Epoxy")).toBe("resin-and-epoxy");
    expect(ventureSlug("Charity (India)")).toBe("charity-india");
    expect(ventureSlug("Building + Maintenance")).toBe("building-maintenance");
    expect(ventureSlug("  Spaced  Out  ")).toBe("spaced-out");
  });

  /**
   * The regression this guards, which actually happened: the branch map was
   * keyed by hand on "A to Z Trailerz". The venture was renamed to
   * "A to Z Traderz" and its link silently stopped resolving — nothing
   * errored, the row just quietly stopped being clickable. Deriving the slug
   * means a rename moves the page with it.
   */
  it("keeps linking a venture after it is renamed", () => {
    expect(branchForVenture("A to Z Traderz")).toBe("a-to-z-traderz");
    expect(branchForVenture("Something Invented Tomorrow")).toBe(
      "something-invented-tomorrow"
    );
  });

  it("keeps the retired slug working so old links survive", () => {
    expect(BRANCH_ALIASES["a-to-z-trailerz"]).toBe("a-to-z-traderz");
    // A placeholder graduates to a real route when its view ships.
    expect(BRANCH_ALIASES["vehicles"]).toBe("life/vehicles");
    for (const [from, to] of Object.entries(BRANCH_ALIASES)) {
      // A retired slug has to land on something that answers: a branch still
      // waiting to be built, a branch whose view has shipped, or a real
      // route. Anything else is a link that 404s on a bookmark.
      const lands =
        placeholderFor(to) != null ||
        BUILT_BRANCHES[to] != null ||
        REAL_ROUTES.includes(`/${to}`);
      expect(lands, `alias ${from} → ${to} must land somewhere`).toBe(true);
      expect(placeholderFor(from), `${from} should be retired, not duplicated`).toBeUndefined();
    }
  });

  /**
   * Every division's cockpit shipped in Stage 4 · Phase C, so none of them
   * is a placeholder any more — but each one still keeps its name and its
   * researched shelf. What must never happen is a division falling out of
   * both registries: that is a shelf nobody can reach and a page nobody can
   * name.
   */
  it("gives every seeded venture a shelf and a built cockpit", () => {
    for (const name of SEEDED_VENTURES) {
      const slug = branchForVenture(name);
      expect(slug, `branch for ${name}`).toBeTruthy();
      expect(placeholderFor(slug!), `${slug} is built, not pending`).toBeUndefined();
      expect(BUILT_BRANCHES[slug!], `built branch for ${slug}`).toBeTruthy();
      expect(BUILT_BRANCHES[slug!].name, `name for ${slug}`).toBe(name);
      expect(BUILT_BRANCHES[slug!].href, `href for ${slug}`).toBe(
        `/empire/${slug}`
      );
      expect(refsForBranch(slug!).length, `shelf for ${slug}`).toBeGreaterThan(0);
    }
    // The pointer row stays a pointer: linking it would pretend to contain it.
    expect(branchForVenture("MAINFRAME")).toBeNull();
    expect(EXTERNAL_VENTURES.has("MAINFRAME")).toBe(true);
    expect(BUILT_BRANCHES["mainframe"]).toBeUndefined();
  });

  it("keys every branch shelf and every related-map entry to a real slug", () => {
    // A branch is real if it is still a placeholder OR its view has been
    // built at the same address. It keeps its shelf either way — what it
    // must never be is a key nobody can reach.
    const slugs = new Set([
      ...PLACEHOLDERS.map((p) => p.slug),
      ...Object.keys(BUILT_BRANCHES),
    ]);
    for (const key of Object.keys(BRANCH_REFS)) {
      expect(slugs.has(key), `orphan branch shelf: ${key}`).toBe(true);
    }
    for (const key of Object.keys(BRANCH_RELATED)) {
      expect(slugs.has(key), `orphan related entry: ${key}`).toBe(true);
    }
  });

  it("never leaves a built branch listed as a placeholder as well", () => {
    // Two homes for one slug is how a registry starts lying about what is
    // finished — /reviews is built, so it is not also "not built yet".
    for (const slug of Object.keys(BUILT_BRANCHES)) {
      expect(placeholderFor(slug), `${slug} is built AND a placeholder`).toBeUndefined();
      // A built branch points either at a fixed route or at its own
      // division cockpit under the one dynamic route, /empire/[id].
      const href = BUILT_BRANCHES[slug].href;
      const real =
        REAL_ROUTES.includes(href) || href === `/empire/${slug}`;
      expect(real, `${slug} must point at a real route, got ${href}`).toBe(true);
    }
  });

  it("uses https everywhere and never repeats a URL on one shelf", () => {
    const shelves = [...Object.values(PILLAR_REFS), ...Object.values(BRANCH_REFS)];
    for (const shelf of shelves) {
      const urls = shelf.map((r) => r.url);
      expect(new Set(urls).size, `duplicate on shelf: ${urls.join(", ")}`).toBe(urls.length);
      for (const r of shelf) {
        expect(r.url.startsWith("https://"), `not https: ${r.url}`).toBe(true);
        expect(r.title.trim().length).toBeGreaterThan(0);
        expect(r.why.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("points every internal string at a route that exists", () => {
    const slugs = new Set([
      ...PLACEHOLDERS.map((p) => p.slug),
      ...Object.keys(BUILT_BRANCHES),
    ]);
    for (const [slug, rel] of Object.entries(BRANCH_RELATED)) {
      for (const r of rel.routes ?? []) {
        const ok =
          REAL_ROUTES.includes(r.href) || slugs.has(r.href.replace(/^\//, ""));
        expect(ok, `${slug} links to unknown route ${r.href}`).toBe(true);
      }
      for (const name of rel.pillars ?? []) {
        expect(SEEDED_PILLARS, `${slug} names unknown pillar ${name}`).toContain(name);
      }
    }
  });

  it("respects the house rule: nothing on the food shelves mentions beef", () => {
    const foodShelves = [
      ...refsForBranch("food"),
      ...refsForPillar("Nutrition & Recovery"),
    ];
    for (const r of foodShelves) {
      expect(`${r.title} ${r.why}`.toLowerCase().includes("beef recipes")).toBe(false);
    }
  });
});

/* ==================================================================== *
 * The Command Centre — Jay's THE BRAIN design, over real data
 * ==================================================================== */

import {
  greetingFor,
  watchtowerAlerts,
  readVentureMonths,
  profitPerHour,
  lowProfitRun,
  daysUntilBirthday,
  streakHistory,
  taskSplit,
  habitConsistency,
  debtCleared,
  cashThisMonth,
} from "../src/lib/logic";
import { GITA, verseOfDay } from "../src/lib/gita";

describe("greeting", () => {
  it("changes through the day and never leaves a gap", () => {
    expect(greetingFor(2).word).toBe("Still up");
    expect(greetingFor(8).word).toBe("Good morning");
    expect(greetingFor(14).word).toBe("Good afternoon");
    expect(greetingFor(21).word).toBe("Good evening");
    for (let h = 0; h < 24; h++) {
      expect(greetingFor(h).word.length, `hour ${h}`).toBeGreaterThan(0);
      expect(greetingFor(h).emoji.length, `hour ${h}`).toBeGreaterThan(0);
    }
  });

  it("switches exactly on the boundaries", () => {
    expect(greetingFor(4).word).toBe("Still up");
    expect(greetingFor(5).word).toBe("Good morning");
    expect(greetingFor(11).word).toBe("Good morning");
    expect(greetingFor(12).word).toBe("Good afternoon");
    expect(greetingFor(17).word).toBe("Good afternoon");
    expect(greetingFor(18).word).toBe("Good evening");
  });
});

describe("the Gita layer", () => {
  it("gives the same verse all day, on server and client alike", () => {
    expect(verseOfDay(FRI)).toEqual(verseOfDay(FRI));
    expect(verseOfDay(FRI).ref).toBeTruthy();
    expect(verseOfDay(FRI).v.length).toBeGreaterThan(10);
  });

  it("rotates with the date", () => {
    const a = verseOfDay("2026-08-01");
    const b = verseOfDay("2026-08-02");
    expect(a.v).not.toBe(b.v);
  });

  it("varies by offset so two panels differ on the same day", () => {
    expect(verseOfDay(FRI, 0).v).not.toBe(verseOfDay(FRI, 1).v);
  });

  it("wraps the array cleanly, forwards and backwards", () => {
    expect(verseOfDay(FRI, GITA.length)).toEqual(verseOfDay(FRI, 0));
    expect(verseOfDay(FRI, -1)).toEqual(verseOfDay(FRI, GITA.length - 1));
  });

  it("has no empty or duplicated verses", () => {
    const seen = new Set(GITA.map((g) => g.v));
    expect(seen.size).toBe(GITA.length);
    for (const g of GITA) {
      expect(g.v.trim().length).toBeGreaterThan(0);
      expect(g.ref).toMatch(/^BG \d+\.\d+$/);
    }
  });
});

describe("daysUntilBirthday", () => {
  it("counts to this year's date, and 0 on the day", () => {
    expect(daysUntilBirthday("1990-08-05", FRI)).toBe(5);
    expect(daysUntilBirthday("1990-07-31", FRI)).toBe(0);
  });

  it("rolls to next year once the date has passed", () => {
    // 30 July already gone on 31 July → next year.
    expect(daysUntilBirthday("1990-07-30", FRI)).toBe(364);
  });

  it("ignores the birth year entirely", () => {
    expect(daysUntilBirthday("1955-08-05", FRI)).toBe(
      daysUntilBirthday("2005-08-05", FRI)
    );
  });
});

describe("watchtower", () => {
  const base = { people: [], ventures: [], pillars: [], todayIso: FRI };

  it("is empty when nothing is slipping", () => {
    expect(watchtowerAlerts({ ...base, tasks: [] })).toEqual([]);
  });

  it("shouts loudest about overdue work", () => {
    const alerts = watchtowerAlerts({
      ...base,
      tasks: [
        { id: "1", title: "soon", due_date: "2026-08-03", status: "open" },
        { id: "2", title: "late", due_date: "2026-07-20", status: "open" },
      ],
    });
    expect(alerts.map((a) => a.kind)).toEqual(["overdue", "due"]);
    expect(alerts[0].text).toContain("11d late");
  });

  it("ignores finished work and undated work", () => {
    const alerts = watchtowerAlerts({
      ...base,
      tasks: [
        { id: "1", title: "done", due_date: "2026-07-01", status: "done" },
        { id: "2", title: "undated", due_date: null, status: "open" },
      ],
    });
    expect(alerts).toEqual([]);
  });

  it("surfaces the cadence insight — you said 14, it has been 47", () => {
    const alerts = watchtowerAlerts({
      ...base,
      tasks: [],
      people: [
        { id: "p", name: "Brother", last_contact: "2026-06-14", cadence_days: 14, birthday: null },
      ],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("person");
    expect(alerts[0].text).toContain("47d since you spoke");
    expect(alerts[0].text).toContain("you said 14");
  });

  it("stays quiet while a cadence is still being kept", () => {
    const alerts = watchtowerAlerts({
      ...base,
      tasks: [],
      people: [
        { id: "p", name: "Mum", last_contact: "2026-07-29", cadence_days: 14, birthday: null },
      ],
    });
    expect(alerts).toEqual([]);
  });

  it("gives two weeks' warning on a birthday", () => {
    const near = watchtowerAlerts({
      ...base, tasks: [],
      people: [{ id: "p", name: "Dad", last_contact: null, cadence_days: null, birthday: "1960-08-10" }],
    });
    expect(near.map((a) => a.kind)).toEqual(["birthday"]);
    const far = watchtowerAlerts({
      ...base, tasks: [],
      people: [{ id: "p", name: "Dad", last_contact: null, cadence_days: null, birthday: "1960-10-10" }],
    });
    expect(far).toEqual([]);
  });

  it("flags a venture whose claim and stage disagree", () => {
    const alerts = watchtowerAlerts({
      ...base, tasks: [],
      ventures: [{ id: "v", name: "AI Software", stage: "idea", status: "active", progress: 90 }],
    });
    expect(alerts.map((a) => a.kind)).toEqual(["drift"]);
    expect(alerts[0].text).toContain("90%");
    expect(alerts[0].text).toContain("10%");
  });

  it("mentions unscored areas only once some are scored", () => {
    const none = watchtowerAlerts({
      ...base, tasks: [],
      pillars: [{ id: "a", name: "A", score: null }, { id: "b", name: "B", score: null }],
    });
    expect(none).toEqual([]); // nothing scored at all is a first-run state, not an alert

    const some = watchtowerAlerts({
      ...base, tasks: [],
      pillars: [{ id: "a", name: "A", score: 5 }, { id: "b", name: "B", score: null }],
    });
    expect(some.map((a) => a.kind)).toEqual(["unscored"]);
  });
});

describe("streakHistory", () => {
  it("returns one bar per day, oldest first, today last", () => {
    const h = streakHistory([FRI, "2026-07-30"], FRI, 14);
    expect(h).toHaveLength(14);
    expect(h[13]).toBe(true); // today
    expect(h[12]).toBe(true); // yesterday
    expect(h[11]).toBe(false);
  });

  it("is all-false with no logs", () => {
    expect(streakHistory([], FRI, 5)).toEqual([false, false, false, false, false]);
  });
});

describe("taskSplit", () => {
  const ps = [
    { id: "L", system: "life" as const },
    { id: "E", system: "empire" as const },
  ];

  it("counts open work per system and keeps arealess work separate", () => {
    const split = taskSplit(
      [
        { pillar_id: "L", status: "open" },
        { pillar_id: "L", status: "doing" },
        { pillar_id: "E", status: "open" },
        { pillar_id: null, status: "open" },
        { pillar_id: "L", status: "done" },
        { pillar_id: "E", status: "dropped" },
      ],
      ps
    );
    expect(split).toEqual({ life: 2, empire: 1, unassigned: 1, done: 1 });
  });

  it("is all zeros on an empty system", () => {
    expect(taskSplit([], ps)).toEqual({ life: 0, empire: 0, unassigned: 0, done: 0 });
  });
});

describe("habitConsistency", () => {
  it("is null with no habits — a percentage of nothing is not 0", () => {
    expect(habitConsistency([], [], FRI)).toBeNull();
  });

  it("is 0 when habits exist but nothing was logged", () => {
    expect(habitConsistency(["h"], [], FRI, 7)).toBe(0);
  });

  it("counts logs landed over logs possible", () => {
    const logs = [FRI, "2026-07-30", "2026-07-29"].map((d) => ({ habit_id: "h", done_on: d }));
    expect(habitConsistency(["h"], logs, FRI, 7)).toBe(43); // 3/7
  });

  it("ignores logs outside the window and other habits", () => {
    const logs = [
      { habit_id: "h", done_on: "2026-06-01" },
      { habit_id: "other", done_on: FRI },
    ];
    expect(habitConsistency(["h"], logs, FRI, 7)).toBe(0);
  });

  it("caps at 100 across several habits", () => {
    const days = ["2026-07-25","2026-07-26","2026-07-27","2026-07-28","2026-07-29","2026-07-30",FRI];
    const logs = days.flatMap((d) => [
      { habit_id: "a", done_on: d },
      { habit_id: "b", done_on: d },
    ]);
    expect(habitConsistency(["a", "b"], logs, FRI, 7)).toBe(100);
  });
});

describe("debtCleared", () => {
  const r = (taken_on: string, value: number) => ({ taken_on, value });

  it("refuses to compute a percentage from a single point", () => {
    expect(debtCleared([r(FRI, 8317)])).toBeNull();
    expect(debtCleared([])).toBeNull();
  });

  it("measures from the peak down to the latest", () => {
    const c = debtCleared([r("2026-01-01", 12000), r("2026-05-01", 9500), r(FRI, 8317)]);
    expect(c).not.toBeNull();
    expect(c!.peak).toBe(12000);
    expect(c!.latest).toBe(8317);
    expect(c!.percent).toBe(31);
  });

  it("reads 0% cleared when the debt has only grown", () => {
    const c = debtCleared([r("2026-01-01", 5000), r(FRI, 9000)]);
    expect(c!.percent).toBe(0);
  });
});

describe("cashThisMonth", () => {
  const a = (income: number | null, cost: number | null, status = "active") => ({
    income_monthly: income, cost_monthly: cost, status,
  });

  it("is null when no asset carries a figure", () => {
    expect(cashThisMonth([])).toBeNull();
    expect(cashThisMonth([a(null, null)])).toBeNull();
  });

  it("nets income against cost", () => {
    expect(cashThisMonth([a(900, 300), a(null, 120)])).toBe(480);
  });

  it("can be negative, and says so rather than hiding it", () => {
    expect(cashThisMonth([a(0, 6462)])).toBe(-6462);
  });

  it("ignores assets that are not active", () => {
    expect(cashThisMonth([a(900, 0), a(5000, 0, "sold")])).toBe(900);
  });
});

/* ==================================================================== *
 * LIFE_OS — vehicles and debts
 * ==================================================================== */

import {
  deadlineState,
  vehicleDeadlines,
  vehicleWorstState,
  upcomingDeadlines,
  sortVehicles,
  debtTotal,
  payoffPayments,
  payoffMonths,
  nextPaymentDue,
  missedPayments,
  sortDebts,
} from "../src/lib/logic";
import type { Debt, Vehicle } from "../src/lib/types";

const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  id: "v1",
  name: "BMW",
  registration: "ME54 JAY",
  make_model: null,
  tax_due: null,
  mot_due: null,
  insurance_due: null,
  last_service: null,
  next_service: null,
  status: "active",
  pillar_id: null,
  sort_order: 0,
  notes: null,
  ...over,
});

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: "d1",
  creditor: "Advantis",
  kind: "credit",
  reference: null,
  original_amount: null,
  current_balance: null,
  status: "active",
  plan_amount: null,
  plan_frequency: null,
  plan_day: null,
  plan_start: null,
  pillar_id: null,
  venture_id: null,
  notes: null,
  sort_order: 0,
  ...over,
});

describe("deadlineState", () => {
  it("distinguishes overdue, due soon and fine", () => {
    expect(deadlineState("2026-07-01", TODAY)).toBe("overdue");
    expect(deadlineState("2026-08-10", TODAY)).toBe("due_soon");
    expect(deadlineState("2027-06-01", TODAY)).toBe("ok");
  });

  it("treats today as due soon, not overdue — you still have today", () => {
    expect(deadlineState(TODAY, TODAY)).toBe("due_soon");
  });

  it("calls a missing date not_recorded, never overdue and never fine", () => {
    expect(deadlineState(null, TODAY)).toBe("not_recorded");
  });
});

describe("vehicleDeadlines", () => {
  it("returns all four obligations in a fixed order", () => {
    const ds = vehicleDeadlines(vehicle(), TODAY);
    expect(ds.map((d) => d.key)).toEqual([
      "tax_due",
      "mot_due",
      "insurance_due",
      "next_service",
    ]);
  });

  it("RAISES NO FALSE ALARMS for a vehicle with no dates recorded", () => {
    const ds = vehicleDeadlines(vehicle(), TODAY);
    expect(ds.every((d) => d.state === "not_recorded")).toBe(true);
    expect(ds.some((d) => d.state === "overdue")).toBe(false);
    expect(ds.some((d) => d.state === "ok")).toBe(false);
  });
});

describe("vehicleWorstState", () => {
  it("reports the worst obligation on the vehicle", () => {
    const v = vehicle({ tax_due: "2027-01-01", mot_due: "2026-07-01" });
    expect(vehicleWorstState(v, TODAY)).toBe("overdue");
  });

  it("ranks unknown below due-soon but above fine", () => {
    const unknown = vehicle({ tax_due: "2027-01-01" }); // rest null
    expect(vehicleWorstState(unknown, TODAY)).toBe("not_recorded");
    const soon = vehicle({
      tax_due: "2026-08-05",
      mot_due: "2027-01-01",
      insurance_due: "2027-01-01",
      next_service: "2027-01-01",
    });
    expect(vehicleWorstState(soon, TODAY)).toBe("due_soon");
  });

  it("is ok only when every obligation is dated and comfortably away", () => {
    const v = vehicle({
      tax_due: "2027-01-01",
      mot_due: "2027-02-01",
      insurance_due: "2027-03-01",
      next_service: "2027-04-01",
    });
    expect(vehicleWorstState(v, TODAY)).toBe("ok");
  });
});

describe("upcomingDeadlines", () => {
  it("lists what is genuinely due, soonest first", () => {
    const vs = [
      vehicle({ id: "a", name: "BMW", mot_due: "2026-08-20" }),
      vehicle({ id: "b", name: "Zafira", tax_due: "2026-08-02" }),
    ];
    const out = upcomingDeadlines(vs, TODAY, 30);
    expect(out.map((d) => d.vehicleName)).toEqual(["Zafira", "BMW"]);
  });

  it("excludes undated obligations — they cannot be due in 30 days", () => {
    expect(upcomingDeadlines([vehicle()], TODAY, 30)).toEqual([]);
  });

  it("ignores sold and SORN vehicles", () => {
    const vs = [vehicle({ status: "sold", mot_due: "2026-08-02" })];
    expect(upcomingDeadlines(vs, TODAY, 30)).toEqual([]);
  });
});

describe("sortVehicles", () => {
  it("puts the worst first and sinks inactive vehicles", () => {
    const vs = [
      vehicle({ id: "ok", name: "OK", tax_due: "2027-01-01", mot_due: "2027-01-01", insurance_due: "2027-01-01", next_service: "2027-01-01" }),
      vehicle({ id: "sold", name: "Sold", status: "sold", mot_due: "2020-01-01" }),
      vehicle({ id: "late", name: "Late", mot_due: "2026-07-01" }),
    ];
    expect(sortVehicles(vs, TODAY).map((v) => v.id)).toEqual(["late", "ok", "sold"]);
  });
});

describe("debtTotal", () => {
  it("sums only what is known and counts what is not", () => {
    const ds = [
      debt({ current_balance: 5000 }),
      debt({ current_balance: 3317 }),
      debt({ current_balance: null }),
    ];
    const t = debtTotal(ds);
    expect(t.known).toBe(8317);
    expect(t.knownCount).toBe(2);
    expect(t.unknownCount).toBe(1);
  });

  it("is INCOMPLETE while any active debt has no balance — Jay's £8,317 case", () => {
    const ds = [debt({ current_balance: 8317 }), debt({ current_balance: null })];
    expect(debtTotal(ds).complete).toBe(false);
  });

  it("becomes complete on its own once the last balance is entered", () => {
    const ds = [debt({ current_balance: 8317 }), debt({ current_balance: 500 })];
    expect(debtTotal(ds).complete).toBe(true);
  });

  it("never counts a null balance as zero", () => {
    expect(debtTotal([debt({ current_balance: null })]).known).toBe(0);
    expect(debtTotal([debt({ current_balance: null })]).complete).toBe(false);
  });

  it("ignores cleared debts entirely", () => {
    const ds = [debt({ current_balance: 100, status: "cleared" }), debt({ current_balance: 50 })];
    const t = debtTotal(ds);
    expect(t.known).toBe(50);
    expect(t.complete).toBe(true);
  });

  it("is not complete when there are no debts at all", () => {
    expect(debtTotal([]).complete).toBe(false);
  });
});

describe("payoffPayments / payoffMonths", () => {
  it("counts the payments needed, rounding up", () => {
    expect(payoffPayments(debt({ current_balance: 1000, plan_amount: 300 }))).toBe(4);
  });

  it("refuses to guess when the balance is unknown", () => {
    expect(payoffPayments(debt({ current_balance: null, plan_amount: 300 }))).toBeNull();
  });

  it("refuses to guess when there is no plan", () => {
    expect(payoffPayments(debt({ current_balance: 1000, plan_amount: null }))).toBeNull();
  });

  it("returns null for a zero plan rather than infinity", () => {
    expect(payoffPayments(debt({ current_balance: 1000, plan_amount: 0 }))).toBeNull();
  });

  it("is 0 for an already-cleared balance", () => {
    expect(payoffPayments(debt({ current_balance: 0, plan_amount: 50 }))).toBe(0);
  });

  it("converts frequency to months so plans can be compared", () => {
    expect(payoffMonths(debt({ current_balance: 1200, plan_amount: 100, plan_frequency: "monthly" }))).toBe(12);
    expect(payoffMonths(debt({ current_balance: 1200, plan_amount: 100, plan_frequency: "weekly" }))).toBe(3);
  });

  it("is null without a frequency — payments alone are not a timescale", () => {
    expect(payoffMonths(debt({ current_balance: 1200, plan_amount: 100 }))).toBeNull();
  });
});

describe("nextPaymentDue / missedPayments", () => {
  const pay = (due_on: string, status: "scheduled" | "paid" | "missed" = "scheduled") =>
    ({ id: due_on, debt_id: "d1", amount: 50, due_on, paid_on: null, status });

  it("finds the soonest scheduled payment from today onward", () => {
    const ps = [pay("2026-09-01"), pay("2026-08-05"), pay("2026-08-20")];
    expect(nextPaymentDue(ps, TODAY)?.due_on).toBe("2026-08-05");
  });

  it("ignores payments already made", () => {
    const ps = [pay("2026-08-05", "paid"), pay("2026-08-20")];
    expect(nextPaymentDue(ps, TODAY)?.due_on).toBe("2026-08-20");
  });

  it("is null when nothing is scheduled", () => {
    expect(nextPaymentDue([], TODAY)).toBeNull();
  });

  it("surfaces payments whose date has passed rather than hiding them", () => {
    const ps = [pay("2026-07-01"), pay("2026-09-01")];
    expect(missedPayments(ps, TODAY).map((p) => p.due_on)).toEqual(["2026-07-01"]);
  });
});

describe("sortDebts", () => {
  it("puts unknown balances first — finding out is the next action", () => {
    const ds = [
      debt({ id: "big", creditor: "Big", current_balance: 5000 }),
      debt({ id: "unknown", creditor: "Unknown", current_balance: null }),
      debt({ id: "small", creditor: "Small", current_balance: 100 }),
    ];
    expect(sortDebts(ds).map((d) => d.id)).toEqual(["unknown", "big", "small"]);
  });

  it("sinks cleared debts below active ones", () => {
    const ds = [
      debt({ id: "cleared", current_balance: 9999, status: "cleared" }),
      debt({ id: "active", current_balance: 1 }),
    ];
    expect(sortDebts(ds).map((d) => d.id)).toEqual(["active", "cleared"]);
  });
});

/* ------------------------------------------------------------------ *
 * Dormancy — untouched 30 days leaves the counts
 * ------------------------------------------------------------------ */

describe("dormancy", () => {
  const TODAY = "2026-08-11";
  // 40 days before TODAY — comfortably past the threshold.
  const OLD = "2026-07-02T09:00:00+00:00";
  // 10 days before TODAY — recent.
  const RECENT = "2026-08-01T09:00:00+00:00";

  it("is 30 days, and the constant is load-bearing", () => {
    expect(DORMANT_AFTER_DAYS).toBe(30);
  });

  it("puts an old untouched open task to sleep", () => {
    expect(isDormant(task({ created_at: OLD }), TODAY)).toBe(true);
  });

  it("keeps a recent task awake", () => {
    expect(isDormant(task({ created_at: RECENT }), TODAY)).toBe(false);
  });

  it("never sleeps a task with a due_date, however stale", () => {
    // Due is a fact about the world. 40 days old AND 35 days overdue — the
    // exact task the wall-of-red instinct wants hidden, and the exact task
    // that must not be.
    const t = task({ created_at: OLD, due_date: "2026-07-07" });
    expect(isDormant(t, TODAY)).toBe(false);
  });

  it("a future or recent do_date keeps it awake", () => {
    expect(
      isDormant(task({ created_at: OLD, do_date: "2026-08-20" }), TODAY)
    ).toBe(false);
    expect(
      isDormant(task({ created_at: OLD, do_date: "2026-08-01" }), TODAY)
    ).toBe(false);
  });

  it("an old do_date does not keep it awake", () => {
    expect(
      isDormant(task({ created_at: OLD, do_date: "2026-07-03" }), TODAY)
    ).toBe(true);
  });

  it("only open tasks sleep — started work is touched work", () => {
    expect(isDormant(task({ created_at: OLD, status: "doing" }), TODAY)).toBe(
      false
    );
    expect(isDormant(task({ created_at: OLD, status: "done" }), TODAY)).toBe(
      false
    );
    expect(isDormant(task({ created_at: OLD, status: "waiting" }), TODAY)).toBe(
      false
    );
  });

  it("a task that cannot be dated cannot be hidden", () => {
    // No created_at → no evidence of silence → hiding fails closed.
    expect(isDormant(task({}), TODAY)).toBe(false);
  });

  it("day 30 is awake, day 31 is asleep — the boundary is exact", () => {
    expect(isDormant(task({ created_at: "2026-07-12T00:00:00Z" }), TODAY)).toBe(
      false
    ); // exactly 30 days
    expect(isDormant(task({ created_at: "2026-07-11T00:00:00Z" }), TODAY)).toBe(
      true
    ); // 31 days
  });

  it("splitDormant loses nothing and counts nothing twice", () => {
    const rows = [
      task({ id: "old", created_at: OLD }),
      task({ id: "fresh", created_at: RECENT }),
      task({ id: "deadline", created_at: OLD, due_date: "2026-07-01" }),
    ];
    const { live, dormant } = splitDormant(rows, TODAY);
    expect(dormant.map((t) => t.id)).toEqual(["old"]);
    expect(live.map((t) => t.id)).toEqual(["fresh", "deadline"]);
    expect(live.length + dormant.length).toBe(rows.length);
  });
});

/* ------------------------------------------------------------------ *
 * Rollover — the day's leftovers
 * ------------------------------------------------------------------ */

describe("leftovers", () => {
  const TODAY = "2026-08-11";

  it("collects open work scheduled for today or earlier", () => {
    const rows = [
      task({ id: "today", do_date: TODAY }),
      task({ id: "slipped", do_date: "2026-08-05" }),
      task({ id: "tomorrow", do_date: "2026-08-12" }),
      task({ id: "unscheduled" }),
    ];
    expect(leftovers(rows, TODAY).map((t) => t.id)).toEqual([
      "slipped",
      "today",
    ]);
  });

  it("oldest slip first — what has waited longest is settled first", () => {
    const rows = [
      task({ id: "recent", do_date: "2026-08-10" }),
      task({ id: "ancient", do_date: "2026-07-20" }),
    ];
    expect(leftovers(rows, TODAY).map((t) => t.id)).toEqual([
      "ancient",
      "recent",
    ]);
  });

  it("breaks a same-day tie by priority", () => {
    const rows = [
      task({ id: "low", do_date: TODAY, priority: "Low" }),
      task({ id: "high", do_date: TODAY, priority: "High" }),
    ];
    expect(leftovers(rows, TODAY).map((t) => t.id)).toEqual(["high", "low"]);
  });

  it("finished and dropped work is not a leftover", () => {
    const rows = [
      task({ id: "done", do_date: TODAY, status: "done" }),
      task({ id: "dropped", do_date: TODAY, status: "dropped" }),
      task({ id: "waiting", do_date: TODAY, status: "waiting" }),
    ];
    expect(leftovers(rows, TODAY)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Division months — the three numbers and the exit gate
 * ------------------------------------------------------------------ */

describe("division months", () => {
  const TODAY = "2026-08-11";
  const m = (revenue: number | null, costs: number | null, hours: number | null) => ({
    revenue,
    costs,
    hours,
  });

  it("validates meta rather than trusting it", () => {
    expect(readVentureMonths(null)).toEqual({});
    expect(readVentureMonths("junk")).toEqual({});
    expect(readVentureMonths({ months: "junk" })).toEqual({});
    expect(readVentureMonths({ months: { "not-a-month": m(1, 1, 1) } })).toEqual({});
    const good = readVentureMonths({
      months: { "2026-07": { revenue: 300, costs: "bad", hours: -2 } },
    });
    // Recognised month, unrecognised fields discarded to null — not zero.
    expect(good["2026-07"]).toEqual(m(300, null, null));
  });

  it("profit per hour needs all three figures — a dash, never a guess", () => {
    expect(profitPerHour(m(300, 200, 43))).toBeCloseTo(2.326, 2);
    expect(profitPerHour(m(300, null, 43))).toBeNull();
    expect(profitPerHour(m(300, 200, null))).toBeNull();
    expect(profitPerHour(m(null, 200, 43))).toBeNull();
    expect(profitPerHour(m(300, 200, 0))).toBeNull();
    expect(profitPerHour(undefined)).toBeNull();
  });

  it("three recorded months under the floor trip the gate", () => {
    const months = {
      "2026-05": m(300, 200, 43),
      "2026-06": m(300, 200, 43),
      "2026-07": m(300, 200, 43),
    };
    expect(lowProfitRun(months, TODAY)).toBe(true);
  });

  it("the current month is never judged — it is part-way through", () => {
    // August is terrible but only August exists: no pattern, no alert.
    expect(lowProfitRun({ "2026-08": m(10, 200, 43) }, TODAY)).toBe(false);
  });

  it("a missing month ends the run — recorded evidence only", () => {
    const months = {
      "2026-05": m(300, 200, 43),
      // June missing
      "2026-07": m(300, 200, 43),
    };
    expect(lowProfitRun(months, TODAY)).toBe(false);
  });

  it("one healthy month breaks the pattern", () => {
    const months = {
      "2026-05": m(300, 200, 43),
      "2026-06": m(900, 200, 43), // £16/hr
      "2026-07": m(300, 200, 43),
    };
    expect(lowProfitRun(months, TODAY)).toBe(false);
  });

  it("the watchtower says it out loud, and only with the evidence", () => {
    const base = {
      tasks: [],
      people: [],
      pillars: [],
      todayIso: TODAY,
    };
    const bad = {
      id: "v1",
      name: "A to Z Traderz",
      stage: "stabilise" as const,
      status: "active",
      progress: 0,
      meta: {
        months: {
          "2026-05": m(300, 200, 43),
          "2026-06": m(300, 200, 43),
          "2026-07": m(300, 200, 43),
        },
      },
    };
    const alerts = watchtowerAlerts({ ...base, ventures: [bad] });
    const low = alerts.filter((a) => a.kind === "lowprofit");
    expect(low).toHaveLength(1);
    expect(low[0].text).toContain("A to Z Traderz");
    expect(low[0].text).toContain("exit question");

    // No months recorded → silent, not guessed.
    const silent = watchtowerAlerts({
      ...base,
      ventures: [{ ...bad, meta: {} }],
    });
    expect(silent.filter((a) => a.kind === "lowprofit")).toHaveLength(0);

    // A shelved division is not asked the exit question — it already left.
    const shelved = watchtowerAlerts({
      ...base,
      ventures: [{ ...bad, status: "backlog" }],
    });
    expect(shelved.filter((a) => a.kind === "lowprofit")).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Vehicle deadlines reach the watchtower
 *
 * LIFE_OS v2, step 5. The four dates existed from the start and were
 * filed as attributes OF A VEHICLE rather than as deadlines, so the one
 * panel whose whole job is "what is about to bite you" never saw them.
 * A lapsed MOT is the clearest thing in the system that the WORLD
 * punishes rather than something Jay merely intended to do.
 * ------------------------------------------------------------------ */

describe("watchtower · vehicles", () => {
  const TODAY = "2026-08-12";
  const base = { tasks: [], people: [], ventures: [], pillars: [], todayIso: TODAY };
  const van = (o: Record<string, unknown> = {}) => ({
    id: String(o.id ?? "v1"),
    name: String(o.name ?? "Canter"),
    status: String(o.status ?? "active"),
    tax_due: ("tax_due" in o ? o.tax_due : null) as string | null,
    mot_due: ("mot_due" in o ? o.mot_due : null) as string | null,
    insurance_due: ("insurance_due" in o ? o.insurance_due : null) as string | null,
    next_service: ("next_service" in o ? o.next_service : null) as string | null,
  });

  it("raises a lapsed obligation, with the vehicle named and the days counted", () => {
    const alerts = watchtowerAlerts({
      ...base,
      vehicles: [van({ mot_due: "2026-08-09" })],
    });
    const legal = alerts.filter((a) => a.kind === "legal");
    expect(legal).toHaveLength(1);
    expect(legal[0].text).toContain("Canter");
    expect(legal[0].text).toContain("3d ago");
  });

  it("outranks every other alert, because the DVLA is not an opinion", () => {
    const alerts = watchtowerAlerts({
      ...base,
      tasks: [
        { id: "t", title: "Late thing", due_date: "2026-08-01", status: "open" },
      ],
      vehicles: [van({ tax_due: "2026-08-10" })],
    });
    expect(alerts[0].kind).toBe("legal");
  });

  it("a never-recorded date raises NOTHING — a gap is not a lapse", () => {
    // Four vehicles with no dates would otherwise be sixteen permanent
    // alerts nobody can clear. The Not-yet-known panel asks for these.
    const alerts = watchtowerAlerts({ ...base, vehicles: [van(), van({ id: "v2" })] });
    expect(alerts.filter((a) => a.kind === "legal")).toHaveLength(0);
  });

  it("says nothing about a vehicle that is off the road", () => {
    const alerts = watchtowerAlerts({
      ...base,
      vehicles: [van({ status: "sorn", mot_due: "2026-01-01" })],
    });
    expect(alerts.filter((a) => a.kind === "legal")).toHaveLength(0);
  });

  it("warns before the date as well as after it", () => {
    const alerts = watchtowerAlerts({
      ...base,
      vehicles: [van({ insurance_due: "2026-08-20" })],
    });
    const legal = alerts.filter((a) => a.kind === "legal");
    expect(legal).toHaveLength(1);
    expect(legal[0].text).toContain("due");
  });

  it("is entirely optional — every existing caller keeps working", () => {
    expect(() => watchtowerAlerts(base)).not.toThrow();
    expect(watchtowerAlerts(base)).toEqual([]);
  });
});
