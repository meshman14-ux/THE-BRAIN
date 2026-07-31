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
} from "../src/lib/logic";
import type { Goal, Pillar, Project, Task } from "../src/lib/types";

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
