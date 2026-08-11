import { describe, expect, it } from "vitest";
import {
  CAPACITY_FRACTION,
  DAY_END_MIN,
  DAY_START_MIN,
  DEFAULT_DURATION_MIN,
  PRIORITY_SLOTS_PER_SYSTEM,
  SLOT_MIN,
  calibration,
  capacityOf,
  clashing,
  correctedEstimate,
  dayLayout,
  dayLoad,
  durationOf,
  firstFreeSlot,
  formatDuration,
  isEstimated,
  placementFor,
  slotStarts,
  systemPriorities,
  toHHMM,
  toMinutes,
  withLanes,
} from "../src/lib/planner";

const DAY = "2026-08-11";
const OTHER = "2026-08-12";

const task = (o: Record<string, unknown> = {}) => ({
  id: String(o.id ?? Math.random()),
  title: String(o.title ?? "t"),
  pillar_id: (o.pillar_id ?? null) as string | null,
  // `?? DAY` would turn an explicit null back into a date, which is exactly
  // the distinction these tests exist to check. "Absent" and "null" differ.
  do_date: ("do_date" in o ? o.do_date : DAY) as string | null,
  due_date: null,
  priority: (o.priority ?? "Med") as "High" | "Med" | "Low",
  status: (o.status ?? "open") as "open" | "doing" | "done" | "dropped" | "waiting",
  duration_min: (o.duration_min ?? null) as number | null,
  actual_min: (o.actual_min ?? null) as number | null,
  meta: o.meta ?? {},
});

const at = (start: string, end: string) => ({ time: { start, end } });

/* ------------------------------------------------------------------ *
 * Clock arithmetic
 * ------------------------------------------------------------------ */

describe("clock", () => {
  it("parses real times and refuses everything else", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("14:30")).toBe(870);
    expect(toMinutes("23:59")).toBe(1439);
    for (const bad of ["24:00", "9:00", "14:60", "", "half two", "1430"]) {
      expect(toMinutes(bad), bad).toBeNull();
    }
  });

  it("formats back, and cannot emit an hour that does not exist", () => {
    expect(toHHMM(870)).toBe("14:30");
    expect(toHHMM(0)).toBe("00:00");
    expect(toHHMM(-60)).toBe("00:00");
    expect(toHHMM(99999)).toBe("23:59");
  });

  it("round-trips every slot in the window", () => {
    for (const m of slotStarts()) expect(toMinutes(toHHMM(m))).toBe(m);
  });

  it("lays the grid across the whole window and stops before the end", () => {
    const s = slotStarts();
    expect(s[0]).toBe(DAY_START_MIN);
    expect(s.at(-1)).toBe(DAY_END_MIN - SLOT_MIN);
    expect(s).toHaveLength((DAY_END_MIN - DAY_START_MIN) / SLOT_MIN);
  });
});

describe("durations", () => {
  it("draws an unestimated task at the default without claiming it is one", () => {
    expect(durationOf({})).toBe(DEFAULT_DURATION_MIN);
    expect(durationOf({ duration_min: null })).toBe(DEFAULT_DURATION_MIN);
    expect(isEstimated({ duration_min: null })).toBe(false);
    expect(durationOf({ duration_min: 90 })).toBe(90);
    expect(isEstimated({ duration_min: 90 })).toBe(true);
  });

  it("renders a dash for absent, never 0m", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
  });
});

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

describe("placementFor", () => {
  it("places a block where it was dropped", () => {
    expect(placementFor(9 * 60, 60)).toEqual({ start: "09:00", end: "10:00" });
  });

  it("pulls a block back so it ends inside the day rather than off the grid", () => {
    const p = placementFor(DAY_END_MIN - 15, 60);
    expect(p).toEqual({ start: "21:00", end: "22:00" });
  });

  it("never starts before the window opens", () => {
    expect(placementFor(0, 30)?.start).toBe(toHHMM(DAY_START_MIN));
  });

  it("refuses a task longer than the planner's day instead of truncating it", () => {
    expect(placementFor(9 * 60, DAY_END_MIN - DAY_START_MIN + 1)).toBeNull();
  });
});

describe("dayLayout", () => {
  it("splits the day's work into timed and untimed", () => {
    const timed = task({ id: "a", meta: at("09:00", "10:00") });
    const untimed = task({ id: "b" });
    const { placed, unplaced } = dayLayout([timed, untimed], DAY);
    expect(placed.map((p) => p.task.id)).toEqual(["a"]);
    expect(unplaced.map((t) => t.id)).toEqual(["b"]);
  });

  it("ignores other days and finished work", () => {
    const rows = [
      task({ id: "elsewhere", do_date: OTHER, meta: at("09:00", "10:00") }),
      task({ id: "done", status: "done", meta: at("09:00", "10:00") }),
      task({ id: "dropped", status: "dropped" }),
      task({ id: "mine", meta: at("11:00", "12:00") }),
    ];
    const { placed, unplaced } = dayLayout(rows, DAY);
    expect(placed.map((p) => p.task.id)).toEqual(["mine"]);
    expect(unplaced).toHaveLength(0);
  });

  it("treats a malformed time as untimed rather than crashing or guessing", () => {
    const rows = [
      task({ id: "backwards", meta: at("10:00", "09:00") }),
      task({ id: "nonsense", meta: { time: { start: "half nine", end: "ten" } } }),
      task({ id: "nulltime", meta: { time: null } }),
    ];
    const { placed, unplaced } = dayLayout(rows, DAY);
    expect(placed).toHaveLength(0);
    expect(unplaced).toHaveLength(3);
  });

  it("sorts placed work by start time", () => {
    const rows = [
      task({ id: "late", meta: at("16:00", "17:00") }),
      task({ id: "early", meta: at("07:00", "08:00") }),
      task({ id: "mid", meta: at("12:00", "13:00") }),
    ];
    expect(dayLayout(rows, DAY).placed.map((p) => p.task.id)).toEqual([
      "early",
      "mid",
      "late",
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Clashes — surfaced, never resolved
 * ------------------------------------------------------------------ */

describe("clashing", () => {
  const layout = (rows: ReturnType<typeof task>[]) => dayLayout(rows, DAY).placed;

  it("finds overlapping blocks", () => {
    const p = layout([
      task({ id: "a", meta: at("09:00", "10:00") }),
      task({ id: "b", meta: at("09:30", "10:30") }),
    ]);
    expect([...clashing(p)].sort()).toEqual(["a", "b"]);
  });

  it("treats back-to-back as fine — an end is not an overlap", () => {
    const p = layout([
      task({ id: "a", meta: at("09:00", "10:00") }),
      task({ id: "b", meta: at("10:00", "11:00") }),
    ]);
    expect(clashing(p).size).toBe(0);
  });

  it("keeps a clash local instead of condemning the whole day", () => {
    const p = layout([
      task({ id: "a", meta: at("09:00", "10:00") }),
      task({ id: "b", meta: at("09:30", "10:30") }),
      task({ id: "c", meta: at("15:00", "16:00") }),
    ]);
    const c = clashing(p);
    expect(c.has("c")).toBe(false);
    expect(c.size).toBe(2);
  });

  it("never silently moves anything — layout is unchanged by detection", () => {
    const rows = [
      task({ id: "a", meta: at("09:00", "10:00") }),
      task({ id: "b", meta: at("09:30", "10:30") }),
    ];
    const before = layout(rows).map((p) => [p.startMin, p.endMin]);
    clashing(layout(rows));
    expect(layout(rows).map((p) => [p.startMin, p.endMin])).toEqual(before);
  });
});

describe("withLanes", () => {
  it("puts clashing blocks side by side", () => {
    const p = dayLayout(
      [
        task({ id: "a", meta: at("09:00", "10:00") }),
        task({ id: "b", meta: at("09:30", "10:30") }),
      ],
      DAY
    ).placed;
    const laned = withLanes(p);
    expect(laned.map((l) => l.lane)).toEqual([0, 1]);
    expect(laned.every((l) => l.lanes === 2)).toBe(true);
  });

  it("does not narrow a day because of one clash in the morning", () => {
    const p = dayLayout(
      [
        task({ id: "a", meta: at("09:00", "10:00") }),
        task({ id: "b", meta: at("09:30", "10:30") }),
        task({ id: "c", meta: at("15:00", "16:00") }),
      ],
      DAY
    ).placed;
    const laned = withLanes(p);
    expect(laned.find((l) => l.task.id === "c")!.lanes).toBe(1);
  });

  it("reuses a lane once its block has finished", () => {
    const p = dayLayout(
      [
        task({ id: "a", meta: at("09:00", "10:00") }),
        task({ id: "b", meta: at("09:30", "11:00") }),
        task({ id: "c", meta: at("10:00", "10:30") }),
      ],
      DAY
    ).placed;
    const laned = withLanes(p);
    // c starts exactly when a ends, so it takes a's lane back.
    expect(laned.find((l) => l.task.id === "c")!.lane).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Load, capacity, free slots
 * ------------------------------------------------------------------ */

describe("dayLoad", () => {
  it("separates known minutes from drawn-but-unknown ones", () => {
    const p = dayLayout(
      [
        task({ id: "a", duration_min: 60, meta: at("09:00", "10:00") }),
        task({ id: "b", meta: at("11:00", "11:30") }),
      ],
      DAY
    ).placed;
    const load = dayLoad(p);
    expect(load.totalMin).toBe(90);
    expect(load.estimatedMin).toBe(60);
    expect(load.unestimated).toBe(1);
  });
});

describe("capacityOf", () => {
  it("caps the day well below the hours technically available", () => {
    const cap = capacityOf(0);
    expect(cap.capacityMin).toBeLessThan(DAY_END_MIN - DAY_START_MIN);
    expect(CAPACITY_FRACTION).toBeLessThan(1);
  });

  it("reports over-capacity honestly rather than clamping at full", () => {
    const cap = capacityOf(capacityOf(0).capacityMin * 2);
    expect(cap.state).toBe("over");
    expect(cap.ratio).toBeGreaterThan(1);
  });

  it("moves light → full → over", () => {
    const c = capacityOf(0).capacityMin;
    expect(capacityOf(c * 0.2).state).toBe("light");
    expect(capacityOf(c * 0.9).state).toBe("full");
    expect(capacityOf(c * 1.2).state).toBe("over");
  });
});

describe("firstFreeSlot", () => {
  it("finds the first gap that actually fits", () => {
    const p = dayLayout(
      [task({ id: "a", meta: at("06:00", "09:00") })],
      DAY
    ).placed;
    expect(firstFreeSlot(p, 60)).toBe(9 * 60);
  });

  it("returns null rather than a slot that would overrun the day", () => {
    const p = dayLayout(
      [task({ id: "a", meta: at("06:00", "21:30") })],
      DAY
    ).placed;
    expect(firstFreeSlot(p, 120)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Calibration — the planning fallacy, measured
 * ------------------------------------------------------------------ */

describe("calibration", () => {
  it("says nothing at all rather than claiming a multiplier of 1", () => {
    const c = calibration([]);
    expect(c.multiplier).toBeNull();
    expect(c.reliable).toBe(false);
  });

  it("ignores tasks missing either number", () => {
    const c = calibration([
      { duration_min: 60, actual_min: null },
      { duration_min: null, actual_min: 60 },
      { duration_min: 60, actual_min: 90 },
    ]);
    expect(c.sample).toBe(1);
    expect(c.multiplier).toBeCloseTo(1.5);
  });

  it("computes the multiplier over the pooled totals", () => {
    const rows = Array.from({ length: 10 }, () => ({
      duration_min: 30,
      actual_min: 45,
    }));
    const c = calibration(rows);
    expect(c.multiplier).toBeCloseTo(1.5);
    expect(c.reliable).toBe(true);
  });

  it("withholds the correction until the sample is worth trusting", () => {
    const thin = calibration([{ duration_min: 30, actual_min: 90 }]);
    expect(thin.multiplier).toBeCloseTo(3);
    expect(thin.reliable).toBe(false);
    expect(correctedEstimate(60, thin)).toBeNull();
  });

  it("corrects an estimate once there is enough history", () => {
    const rows = Array.from({ length: 8 }, () => ({
      duration_min: 60,
      actual_min: 90,
    }));
    expect(correctedEstimate(60, calibration(rows))).toBe(90);
  });
});

/* ------------------------------------------------------------------ *
 * The week's two lists
 * ------------------------------------------------------------------ */

describe("systemPriorities", () => {
  const WEEK = ["2026-08-10", DAY, OTHER];
  const pillars = [
    { id: "L", system: "life" as const },
    { id: "E", system: "empire" as const },
  ];

  it("gives each machine its own list", () => {
    const rows = [
      task({ id: "l1", pillar_id: "L", priority: "High" }),
      task({ id: "e1", pillar_id: "E", priority: "High" }),
    ];
    const p = systemPriorities(rows, pillars, WEEK);
    expect(p.life.map((t) => t.id)).toEqual(["l1"]);
    expect(p.empire.map((t) => t.id)).toEqual(["e1"]);
  });

  it("caps each side at five", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      task({ id: `l${i}`, pillar_id: "L" })
    );
    expect(systemPriorities(rows, pillars, WEEK).life).toHaveLength(
      PRIORITY_SLOTS_PER_SYSTEM
    );
    expect(PRIORITY_SLOTS_PER_SYSTEM).toBe(5);
  });

  it("only counts work committed to a day inside this week", () => {
    const rows = [
      task({ id: "loose", pillar_id: "L", do_date: null, priority: "High" }),
      task({ id: "next", pillar_id: "L", do_date: "2026-09-01", priority: "High" }),
      task({ id: "real", pillar_id: "L" }),
    ];
    expect(systemPriorities(rows, pillars, WEEK).life.map((t) => t.id)).toEqual([
      "real",
    ]);
  });

  it("orders by priority, then day, then title", () => {
    const rows = [
      task({ id: "b", pillar_id: "L", priority: "Med", title: "b" }),
      task({ id: "a", pillar_id: "L", priority: "High", title: "a" }),
      task({ id: "c", pillar_id: "L", priority: "Med", title: "a", do_date: "2026-08-10" }),
    ];
    expect(systemPriorities(rows, pillars, WEEK).life.map((t) => t.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("counts unassigned work rather than guessing it into a system", () => {
    const rows = [
      task({ id: "orphan", pillar_id: null }),
      task({ id: "ghost", pillar_id: "GONE" }),
      task({ id: "l", pillar_id: "L" }),
    ];
    const p = systemPriorities(rows, pillars, WEEK);
    expect(p.unassigned).toBe(2);
    expect(p.life).toHaveLength(1);
    expect(p.empire).toHaveLength(0);
  });

  it("leaves finished work out of both lists", () => {
    const rows = [
      task({ id: "done", pillar_id: "L", status: "done" }),
      task({ id: "open", pillar_id: "L" }),
    ];
    expect(systemPriorities(rows, pillars, WEEK).life.map((t) => t.id)).toEqual([
      "open",
    ]);
  });
});
