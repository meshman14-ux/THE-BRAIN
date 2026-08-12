/**
 * THE COG — the adapter, and the three schema corrections.
 *
 * The blueprint's engine was right and its schema assumptions were wrong.
 * These are the tests for the seam between them: nothing here exercises a
 * rule, and everything here would have shipped a silent wrong answer.
 */
import { describe, expect, it } from "vitest";
import {
  BAND_MAX_AGE_DAYS,
  OPEN_STATUSES,
  PRIORITY_RANK,
  type CogTaskRow,
  bandFrom1to5,
  buildState,
  busyFromPlanner,
  calendarLoad,
  completionRatio,
  completionsByPillar,
  deriveBands,
  eveningStreak,
  profileFrom,
  rankOf,
  readCogMeta,
  sleepBandFrom,
  tasksFrom,
  workloadPressure,
  yesterdayOf,
} from "../../src/lib/cogstate";
import { priorityScore, defaultConfig } from "../../src/lib/cog";
import { baseState } from "./base-state";

const TODAY = "2026-08-12";

const row = (over: Partial<CogTaskRow> = {}): CogTaskRow => ({
  id: "t1",
  title: "Chase the supplier invoice",
  status: "open",
  do_date: null,
  due_date: null,
  priority: "Med",
  energy: "low",
  pillar_id: "pillar-ventures",
  project_id: null,
  duration_min: 15,
  created_at: "2026-08-10T09:00:00Z",
  meta: null,
  ...over,
});

/* ================================================================== *
 * Correction 1 — priority is TEXT, not a number
 * ================================================================== */

describe("priority is text in this database", () => {
  it("maps High/Med/Low onto the numbers the engine divides by 3", () => {
    expect(PRIORITY_RANK).toEqual({ High: 3, Med: 2, Low: 1 });
    expect(rankOf("High")).toBe(3);
  });

  it("treats an ungraded task as middling, not worthless", () => {
    // Zero would bury exactly the work nobody has looked at properly —
    // which is usually the work most worth looking at.
    expect(rankOf(null)).toBe(2);
  });

  it("produces a real number in the engine, not NaN", () => {
    // This is the bug the correction exists for: feeding "Med" straight
    // through makes `task.priority / 3` NaN, every score NaN, and every
    // ranking arbitrary — and no rule test would have caught it, because
    // the rules would still have fired.
    const [task] = tasksFrom([row({ priority: "High" })], TODAY);
    const { score, components } = priorityScore(task, baseState(), defaultConfig);
    expect(Number.isNaN(score)).toBe(false);
    expect(Number.isNaN(components.importance)).toBe(false);
    expect(components.importance).toBeGreaterThan(0);
  });

  it("ranks a High task above an otherwise identical Low one", () => {
    const state = baseState();
    const [hi] = tasksFrom([row({ id: "a", priority: "High" })], TODAY);
    const [lo] = tasksFrom([row({ id: "b", priority: "Low" })], TODAY);
    expect(priorityScore(hi, state, defaultConfig).score).toBeGreaterThan(
      priorityScore(lo, state, defaultConfig).score
    );
  });
});

/* ================================================================== *
 * Correction 2 — duration_min, and null is not zero
 * ================================================================== */

describe("the estimate column", () => {
  it("reads duration_min, because estimate_min does not exist", () => {
    expect(tasksFrom([row({ duration_min: 45 })], TODAY)[0].estimateMin).toBe(45);
  });

  it("keeps an unestimated task null rather than zero", () => {
    // A zero would make a 90-minute spec eligible as a five-minute
    // micro-action — the filler rule compares against this number.
    expect(tasksFrom([row({ duration_min: null })], TODAY)[0].estimateMin).toBeNull();
  });
});

/* ================================================================== *
 * Correction 3 — five statuses, not two
 * ================================================================== */

describe("task status", () => {
  it("counts a started task as open", () => {
    // `doing` is the work Jay is in the middle of. An advisor that hides
    // it is worse than no advisor.
    expect(OPEN_STATUSES).toContain("doing");
    expect(tasksFrom([row({ status: "doing" })], TODAY)[0].status).toBe("open");
  });

  it("keeps waiting distinct, because it is genuinely blocked", () => {
    expect(tasksFrom([row({ status: "waiting" })], TODAY)[0].status).toBe("waiting");
  });

  it("drops done and dropped entirely", () => {
    const out = tasksFrom(
      [row({ id: "a", status: "done" }), row({ id: "b", status: "dropped" })],
      TODAY
    );
    expect(out).toHaveLength(0);
  });
});

/* ================================================================== *
 * The rest of the mapping
 * ================================================================== */

describe("tasksFrom", () => {
  it("derives staleness from created_at", () => {
    expect(tasksFrom([row({ created_at: "2026-08-05T00:00:00Z" })], TODAY)[0].staleDays).toBe(7);
  });

  it("never reports negative staleness for a future-dated row", () => {
    expect(tasksFrom([row({ created_at: "2026-09-01T00:00:00Z" })], TODAY)[0].staleDays).toBe(0);
  });

  it("marks keystone support by the keystone habit's pillar", () => {
    const out = tasksFrom([row({ pillar_id: "p-train" })], TODAY, {
      keystonePillarId: "p-train",
    });
    expect(out[0].supportsKeystone).toBe(true);
  });

  it("supports no keystone at all when none is set", () => {
    // Six habits, none marked keystone, is a real state of this database.
    expect(tasksFrom([row()], TODAY, { keystonePillarId: null })[0].supportsKeystone).toBe(false);
  });

  it("honours a live steer cooldown and ignores an expired one", () => {
    const live = tasksFrom([row({ meta: { cog: { steeredUntil: "2026-08-20" } } })], TODAY);
    const dead = tasksFrom([row({ meta: { cog: { steeredUntil: "2026-08-01" } } })], TODAY);
    expect(live[0].userSteered).toBe(true);
    expect(dead[0].userSteered).toBe(false);
  });

  it("survives junk in meta rather than crashing on it", () => {
    for (const meta of [null, "nonsense", 42, { cog: "nope" }, { cog: { steeredUntil: 7 } }]) {
      expect(() => tasksFrom([row({ meta })], TODAY)).not.toThrow();
      expect(readCogMeta(meta).steeredUntil).toBeUndefined();
    }
  });
});

/* ================================================================== *
 * The bands — derived from last night, never a new ritual
 * ================================================================== */

describe("deriveBands", () => {
  const empty = { checkin: null, journal: [], health: [], todayIso: TODAY };

  it("uses last night's journal and reports it as decayed", () => {
    // `decayed` rather than `checkin` is the whole point: it is a real
    // reading, so N1 must not fire, but it is not a live answer either.
    const b = deriveBands({
      ...empty,
      journal: [{ entry_date: "2026-08-11", mood: 4, energy: 4 }],
    });
    expect(b.energyBand).toBe(4);
    expect(b.energySource).toBe("decayed");
    expect(b.energyAgeDays).toBe(1);
  });

  it("lets an explicit check-in override the derivation", () => {
    const b = deriveBands({
      ...empty,
      checkin: { energyBand: 2, sleepBand: null },
      journal: [{ entry_date: "2026-08-11", mood: 5, energy: 5 }],
    });
    expect(b.energyBand).toBe(2);
    expect(b.energySource).toBe("checkin");
  });

  it("falls back to mood when the energy figure was left blank", () => {
    const b = deriveBands({ ...empty, journal: [{ entry_date: "2026-08-11", mood: 3, energy: null }] });
    expect(b.energyBand).toBe(3);
  });

  it("says nothing at all from an entry that rated neither", () => {
    // An empty evening entry is not evidence about the tank.
    const b = deriveBands({ ...empty, journal: [{ entry_date: "2026-08-11", mood: null, energy: null }] });
    expect(b.energyBand).toBeNull();
    expect(b.energySource).toBe("none");
  });

  it("stops trusting a reading once it is stale", () => {
    const old = "2026-08-01";
    expect(deriveBands({ ...empty, journal: [{ entry_date: old, mood: 5, energy: 5 }] }).energySource).toBe("none");
    // And the boundary itself is inclusive.
    const edge = yesterdayOf(yesterdayOf(TODAY));
    expect(BAND_MAX_AGE_DAYS).toBe(2);
    expect(deriveBands({ ...empty, journal: [{ entry_date: edge, mood: 5, energy: 5 }] }).energySource).toBe("decayed");
  });

  it("prefers measured sleep over remembered sleep", () => {
    const b = deriveBands({
      ...empty,
      checkin: { energyBand: 3, sleepBand: 5 },
      health: [{ on_date: "2026-08-12", sleep_hours: 5.2 }],
    });
    expect(b.sleepSource).toBe("health");
    expect(b.sleepBand).toBe(2);
  });

  it("reads a numeric string, because the column comes back as one", () => {
    const b = deriveBands({ ...empty, health: [{ on_date: TODAY, sleep_hours: "7.5" }] });
    expect(b.sleepBand).toBe(4);
  });

  it("takes the most recent reading when several are in the window", () => {
    const b = deriveBands({
      ...empty,
      journal: [
        { entry_date: "2026-08-10", mood: 1, energy: 1 },
        { entry_date: "2026-08-11", mood: 5, energy: 5 },
      ],
    });
    expect(b.energyBand).toBe(5);
  });
});

describe("band arithmetic", () => {
  it("maps sleep hours onto five bands, worst first", () => {
    expect([4.5, 5.5, 6.5, 7.5, 9].map(sleepBandFrom)).toEqual([1, 2, 3, 4, 5]);
  });

  it("refuses an out-of-range or absent figure", () => {
    expect(sleepBandFrom(null)).toBeNull();
    expect(bandFrom1to5(0)).toBeNull();
    expect(bandFrom1to5(6)).toBeNull();
    expect(bandFrom1to5(null)).toBeNull();
  });
});

/* ================================================================== *
 * missingInputs — the honest list
 * ================================================================== */

describe("buildState missingInputs", () => {
  const base = {
    date: TODAY,
    now: `${TODAY}T07:30:00`,
    season: "quiet" as const,
    tasks: [],
    calendar: { source: "none" as const, busy: [] },
    yesterday: { completionRatio: null, keystoneHit: null },
    finishesRate: null,
    empire: { dormantVentures: 0, opportunitiesDueToday: 0 },
    counters: { inboxCount: 0, pulsesRejectedToday: 0, checkinStreakDays: 0, keystoneDoneToday: false },
  };

  it("does NOT call a decayed reading a missing check-in", () => {
    // The single most important line in this file. Marked missing, rule N1
    // fires every morning forever and THE COG becomes a nag that never
    // advises — which is exactly what the nightly-check-in decision was
    // meant to prevent.
    const s = buildState({
      ...base,
      bands: {
        energyBand: 4,
        sleepBand: 4,
        energySource: "decayed",
        sleepSource: "health",
        energyAgeDays: 1,
      },
    });
    expect(s.missingInputs).not.toContain("checkin");
  });

  it("does call it missing when nothing could be derived", () => {
    const s = buildState({
      ...base,
      bands: { energyBand: null, sleepBand: null, energySource: "none", sleepSource: "none", energyAgeDays: null },
    });
    expect(s.missingInputs).toContain("checkin");
    expect(s.missingInputs).toContain("sleep");
  });
});

/* ================================================================== *
 * Capacity, yesterday, streak
 * ================================================================== */

describe("capacity", () => {
  it("reads a fully booked waking day as full load", () => {
    expect(
      calendarLoad([{ start: `${TODAY}T07:00:00`, end: `${TODAY}T22:00:00` }], TODAY)
    ).toBeCloseTo(1, 5);
  });

  it("ignores the hours outside the waking day", () => {
    expect(calendarLoad([{ start: `${TODAY}T02:00:00`, end: `${TODAY}T05:00:00` }], TODAY)).toBe(0);
  });

  it("caps workload pressure at full rather than running away", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      tasksFrom([row({ id: `t${i}`, due_date: "2026-08-13" })], TODAY)[0]
    );
    expect(workloadPressure(many, TODAY)).toBe(1);
  });
});

describe("completionRatio", () => {
  it("is null when nothing was planned, not zero", () => {
    // Zero-of-zero is a day nobody made a claim about. Scoring it as total
    // failure would let an unplanned Sunday hit momentum as hard as a day
    // of avoidance.
    expect(completionRatio([])).toBeNull();
  });

  it("counts done against everything planned", () => {
    expect(completionRatio([{ status: "done" }, { status: "done" }, { status: "open" }])).toBe(0.667);
  });
});

describe("eveningStreak", () => {
  it("ends yesterday, because tonight has not happened", () => {
    const dates = ["2026-08-11", "2026-08-10", "2026-08-09"];
    expect(eveningStreak(dates, TODAY)).toBe(3);
  });

  it("is not broken by today being absent", () => {
    expect(eveningStreak(["2026-08-11"], TODAY)).toBe(1);
  });

  it("stops at the first gap", () => {
    expect(eveningStreak(["2026-08-11", "2026-08-09"], TODAY)).toBe(1);
  });

  it("is zero when last night was missed", () => {
    expect(eveningStreak(["2026-08-10", "2026-08-09"], TODAY)).toBe(0);
  });
});

/* ================================================================== *
 * Identity and the planner fallback
 * ================================================================== */

describe("profileFrom", () => {
  it("carries the keystone PILLAR, which is what the rules compare", () => {
    // The blueprint's field is named keystoneHabitId but rule I3 compares
    // it against statement pillarIds. Getting this wrong disables I3
    // silently rather than failing.
    expect(profileFrom(null, "p-train", {}).keystoneHabitId).toBe("p-train");
  });

  it("falls back to a sane deep-work window with no row", () => {
    expect(profileFrom(null, null, {}).deepWorkWindow).toEqual({ start: "08:30", end: "12:30" });
  });

  it("trims a postgres time to HH:MM", () => {
    const p = profileFrom(
      { keystone_habit_id: null, deep_work_start: "09:15:00", deep_work_end: "13:00:00", statements: [], alignment_window_days: 7 },
      null, {}
    );
    expect(p.deepWorkWindow).toEqual({ start: "09:15", end: "13:00" });
  });

  it("drops malformed statements instead of trusting jsonb", () => {
    const p = profileFrom(
      {
        keystone_habit_id: null, deep_work_start: "08:30", deep_work_end: "12:30",
        alignment_window_days: 7,
        statements: [
          { pillarId: "a", statement: "I train first.", weight: 2 },
          { pillarId: "b" },
          "junk",
          { pillarId: "c", statement: "No weight given." },
        ],
      },
      null, {}
    );
    expect(p.statements.map((s) => s.pillarId)).toEqual(["a", "c"]);
    expect(p.statements[1].weight).toBe(1);
  });
});

describe("completionsByPillar", () => {
  it("counts only inside the window and only where a pillar is known", () => {
    const out = completionsByPillar(
      [
        { pillar_id: "a", completed_at: "2026-08-11T10:00:00Z" },
        { pillar_id: "a", completed_at: "2026-08-10T10:00:00Z" },
        { pillar_id: "b", completed_at: "2026-07-01T10:00:00Z" },
        { pillar_id: null, completed_at: "2026-08-11T10:00:00Z" },
      ],
      TODAY
    );
    expect(out).toEqual({ a: 2 });
  });
});

describe("busyFromPlanner", () => {
  it("turns pinned hours into busy blocks", () => {
    const { source, busy } = busyFromPlanner({ "9": "Deep work", "14": "Calls" }, TODAY);
    expect(source).toBe("planner");
    expect(busy).toEqual([
      { start: `${TODAY}T09:00:00`, end: `${TODAY}T10:00:00` },
      { start: `${TODAY}T14:00:00`, end: `${TODAY}T15:00:00` },
    ]);
  });

  it("reports no source rather than an empty calendar", () => {
    // "No blocks pinned" and "nothing pinned anything" must not look the
    // same to the engine: one is a free day, the other is no signal.
    for (const junk of [null, undefined, {}, "nope", { "99": "x" }, { "9": "" }]) {
      expect(busyFromPlanner(junk, TODAY).source).toBe("none");
    }
  });
});
