import { describe, expect, it } from "vitest";
import {
  MOMENTUM_STRONG,
  MOMENTUM_WEAK,
  collectFinishes,
  currentMonthNudge,
  finishesFromRecords,
  finishesFromRuns,
  finishesFromTasks,
  lastMonths,
  momentum,
  monthKey,
  monthsCounted,
} from "../src/lib/finishes";

const TODAY = "2026-08-11";

const done = (o: Record<string, unknown> = {}) => ({
  id: String(o.id ?? Math.random()),
  title: String(o.title ?? "t"),
  priority: String(o.priority ?? "High"),
  status: String(o.status ?? "done"),
  completed_at: ("completed_at" in o ? o.completed_at : `${TODAY}T10:00:00Z`) as
    | string
    | null,
});

/* ------------------------------------------------------------------ *
 * What counts — the teeth
 * ------------------------------------------------------------------ */

describe("finishesFromTasks", () => {
  it("counts a completed High task", () => {
    expect(finishesFromTasks([done()])).toHaveLength(1);
  });

  it("ignores Med and Low — otherwise the measure could never be failed", () => {
    // Twenty small admin jobs must not pass a month that moved nothing.
    expect(finishesFromTasks([done({ priority: "Med" })])).toHaveLength(0);
    expect(finishesFromTasks([done({ priority: "Low" })])).toHaveLength(0);
  });

  it("ignores work that is not actually done", () => {
    for (const status of ["open", "doing", "dropped", "waiting"]) {
      expect(finishesFromTasks([done({ status })]), status).toHaveLength(0);
    }
  });

  it("ignores a done task with no completion date — no date, no evidence", () => {
    expect(finishesFromTasks([done({ completed_at: null })])).toHaveLength(0);
    expect(finishesFromTasks([done({ completed_at: "" })])).toHaveLength(0);
  });

  it("keeps the day and drops the time", () => {
    expect(finishesFromTasks([done()])[0].on).toBe(TODAY);
  });
});

describe("finishesFromRuns", () => {
  it("counts a completed diagnostic and names its subject", () => {
    const f = finishesFromRuns([
      { id: "r1", kind: "triage", completed_at: `${TODAY}T09:00:00Z`, subject_name: "A to Z" },
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].title).toBe("Triage — A to Z");
  });

  it("distinguishes a deep dive from a triage", () => {
    const f = finishesFromRuns([
      { id: "r", kind: "deep", completed_at: `${TODAY}T09:00:00Z`, subject_name: "X" },
    ]);
    expect(f[0].title).toContain("Deep dive");
  });

  it("ignores an unfinished run", () => {
    expect(finishesFromRuns([{ id: "r", kind: "triage", completed_at: null }])).toHaveLength(0);
  });
});

describe("finishesFromRecords", () => {
  it("keeps a known kind and falls back to other for anything else", () => {
    const f = finishesFromRecords([
      { id: "a", title: "Cleared the card", happened_on: TODAY, kind: "debt" },
      { id: "b", title: "?", happened_on: TODAY, kind: "nonsense" },
    ]);
    expect(f[0].kind).toBe("debt");
    expect(f[1].kind).toBe("other");
  });
});

describe("collectFinishes", () => {
  it("merges every source, newest first, with ids that cannot collide", () => {
    const all = collectFinishes(
      [done({ id: "1", title: "task", completed_at: "2026-08-01T00:00:00Z" })],
      [{ id: "1", kind: "triage", completed_at: "2026-08-05T00:00:00Z", subject_name: "V" }],
      [{ id: "1", title: "rec", happened_on: "2026-08-09", kind: "debt" }]
    );
    expect(all.map((f) => f.source)).toEqual(["recorded", "diagnostic", "task"]);
    expect(new Set(all.map((f) => f.id)).size).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Months
 * ------------------------------------------------------------------ */

describe("lastMonths", () => {
  it("returns n months, oldest first, ending this month", () => {
    const m = lastMonths(TODAY, 12);
    expect(m).toHaveLength(12);
    expect(m.at(-1)).toBe("2026-08");
    expect(m[0]).toBe("2025-09");
  });

  it("crosses the year boundary correctly", () => {
    expect(lastMonths("2026-02-15", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("uses string maths, so no timezone can shift the month", () => {
    // A Date-based implementation parses an ISO date as UTC and slides the
    // month for anyone west of Greenwich on the 1st.
    expect(monthKey("2026-01-01")).toBe("2026-01");
    expect(lastMonths("2026-01-01", 1)).toEqual(["2026-01"]);
  });
});

describe("monthsCounted", () => {
  const f = (on: string) => ({
    id: on,
    title: "x",
    on,
    source: "task" as const,
    kind: "milestone" as const,
  });

  it("marks a month counted when anything at all finished in it", () => {
    const t = monthsCounted([f("2026-07-03")], TODAY, 3);
    expect(t.find((m) => m.month === "2026-07")?.counted).toBe(true);
    expect(t.find((m) => m.month === "2026-06")?.counted).toBe(false);
  });

  it("tallies several finishes in one month without double-counting it", () => {
    const t = monthsCounted([f("2026-07-01"), f("2026-07-20")], TODAY, 3);
    const july = t.find((m) => m.month === "2026-07")!;
    expect(july.count).toBe(2);
    expect(july.counted).toBe(true);
  });

  it("flags the month still being lived", () => {
    const t = monthsCounted([], TODAY, 3);
    expect(t.filter((m) => m.current)).toHaveLength(1);
    expect(t.at(-1)!.current).toBe(true);
  });

  it("ignores finishes outside the window", () => {
    const t = monthsCounted([f("2020-01-01")], TODAY, 3);
    expect(t.every((m) => m.count === 0)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */

describe("momentum", () => {
  const months = (countedFlags: boolean[], currentCounted = false) => {
    const t = countedFlags.map((c, i) => ({
      month: `m${i}`,
      count: c ? 1 : 0,
      counted: c,
      current: false,
    }));
    t.push({
      month: "now",
      count: currentCounted ? 1 : 0,
      counted: currentCounted,
      current: true,
    });
    return t;
  };

  it("never judges the month still being lived", () => {
    // Counting an unfinished month as a miss would penalise him for the
    // calendar rather than for anything he did.
    const m = momentum(months(Array(11).fill(true), false));
    expect(m.of).toBe(11);
    expect(m.counted).toBe(11);
    expect(m.state).toBe("compounding");
  });

  it("declines to judge on too little history", () => {
    const m = momentum(months([true, true]));
    expect(m.state).toBe("unknown");
    expect(m.line).toContain("too early");
  });

  it("calls 9 of 12 compounding", () => {
    const flags = [...Array(9).fill(true), ...Array(2).fill(false)];
    expect(momentum(months(flags)).state).toBe("compounding");
    expect(MOMENTUM_STRONG).toBe(9);
  });

  it("calls 6 of 12 steady rather than good", () => {
    const flags = [...Array(6).fill(true), ...Array(5).fill(false)];
    const m = momentum(months(flags));
    expect(m.state).toBe("steady");
    expect(MOMENTUM_WEAK).toBe(6);
  });

  it("calls a low rate drift, and says so plainly", () => {
    const flags = [...Array(2).fill(true), ...Array(9).fill(false)];
    const m = momentum(months(flags));
    expect(m.state).toBe("drift");
    expect(m.line).toContain("drift");
  });

  it("judges as a rate, so the verdict is honest before a year exists", () => {
    // 4 of 4 is compounding even though 4 < MOMENTUM_STRONG.
    expect(momentum(months([true, true, true, true])).state).toBe("compounding");
  });

  it("is failable — the entire point", () => {
    expect(momentum(months(Array(11).fill(false))).state).toBe("drift");
  });
});

describe("currentMonthNudge", () => {
  const empty = monthsCounted([], "2026-08-25", 3);

  it("asks a question late in a month where nothing has closed", () => {
    const n = currentMonthNudge(empty, "2026-08-25");
    expect(n).toContain("what could still close");
  });

  it("stays quiet early in the month — a young month is not a failure", () => {
    expect(currentMonthNudge(monthsCounted([], "2026-08-05", 3), "2026-08-05")).toBeNull();
  });

  it("stays quiet once something has finished", () => {
    const t = monthsCounted(
      [{ id: "a", title: "x", on: "2026-08-02", source: "task", kind: "milestone" }],
      "2026-08-25",
      3
    );
    expect(currentMonthNudge(t, "2026-08-25")).toBeNull();
  });
});
