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
} from "../src/lib/logic";
import type { Pillar, Task } from "../src/lib/types";

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
