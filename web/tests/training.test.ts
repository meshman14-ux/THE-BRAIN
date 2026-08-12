import { describe, expect, it } from "vitest";
import {
  DEFAULT_EQUIPMENT,
  allReadings,
  attemptsFrom,
  profileFrom,
  readLandmarks,
  readingsFromHealthDays,
  readingsFromJournal,
  sessionKindOf,
  sessionsFrom,
  sourceOf,
  todaysKind,
} from "../src/lib/training";

/* ------------------------------------------------------------------ *
 * The adapter is where "absence is not zero" is actually enforced.
 * Everything downstream in the engine depends on it holding HERE, which
 * is why these tests are as pointed as the engine's own.
 * ------------------------------------------------------------------ */

const day = (o: Record<string, unknown> = {}) => ({
  on_date: String(o.on_date ?? "2026-08-12"),
  rmssd: ("rmssd" in o ? o.rmssd : 42) as number | string | null,
  resting_hr: ("resting_hr" in o ? o.resting_hr : 54) as number | null,
  sleep_hours: ("sleep_hours" in o ? o.sleep_hours : 7.5) as number | string | null,
  steps: 8000,
  active_minutes: 40,
  source: String(o.source ?? "health_connect"),
});

describe("readingsFromHealthDays", () => {
  it("turns one row into one reading per present signal", () => {
    const out = readingsFromHealthDays([day()]);
    expect(out.map((r) => r.key).sort()).toEqual(["hrv", "resting_hr", "sleep_hours"]);
  });

  it("a null column produces NO reading — never a zero one", () => {
    // A day with no HRV is a day the engine knows nothing about, not a day
    // with an HRV of nothing. Imputing zero would read as catastrophic.
    const out = readingsFromHealthDays([day({ rmssd: null, sleep_hours: null })]);
    expect(out.map((r) => r.key)).toEqual(["resting_hr"]);
  });

  it("normalises PostgREST's stringly numerics", () => {
    const out = readingsFromHealthDays([day({ rmssd: "38.5" })]);
    expect(out.find((r) => r.key === "hrv")!.value).toBe(38.5);
  });

  it("drops a value that is not a number rather than passing NaN to the engine", () => {
    const out = readingsFromHealthDays([day({ rmssd: "not-a-number" })]);
    expect(out.some((r) => r.key === "hrv")).toBe(false);
  });
});

describe("sourceOf", () => {
  it("separates a live feed from a batch import, and typing from both", () => {
    expect(sourceOf("health_connect")).toBe("wearable");
    expect(sourceOf("samsung")).toBe("import");
    expect(sourceOf("manual")).toBe("self");
  });

  it("treats an unknown source as the more discounted tier, not the trusted one", () => {
    expect(sourceOf("whatever")).toBe("import");
  });
});

describe("readingsFromJournal", () => {
  it("reads the daily close's two taps as first-class signals", () => {
    const out = readingsFromJournal([
      { entry_date: "2026-08-12", mood: 4, energy: 3 },
    ]);
    expect(out.map((r) => r.key).sort()).toEqual(["energy", "mood"]);
    expect(out.every((r) => r.source === "self")).toBe(true);
  });

  it("a skipped question contributes nothing", () => {
    const out = readingsFromJournal([
      { entry_date: "2026-08-12", mood: null, energy: null },
    ]);
    expect(out).toEqual([]);
  });
});

describe("allReadings", () => {
  it("merges every table that speaks", () => {
    const out = allReadings(
      [day()],
      [{ entry_date: "2026-08-12", mood: 4, energy: 3 }]
    );
    expect(out).toHaveLength(5);
  });
});

describe("sessionsFrom", () => {
  const workout = { id: "w1", on_date: "2026-08-12", kind: "pull", minutes: 60, rpe: 7 };

  it("attaches sets to their session, in order", () => {
    const out = sessionsFrom(
      [workout],
      [
        { workout_id: "w1", exercise_id: "b", amount: 8, load_kg: 0, rir: 2, sort_order: 2 },
        { workout_id: "w1", exercise_id: "a", amount: 10, load_kg: 0, rir: 1, sort_order: 1 },
      ]
    );
    expect(out[0].sets.map((s) => s.exercise_id)).toEqual(["a", "b"]);
  });

  it("keeps an unlogged RIR as null — not zero", () => {
    // Zero RIR means taken to failure. Null means not recorded. Conflating
    // them would turn every unlogged set into a maximal one.
    const out = sessionsFrom(
      [workout],
      [{ workout_id: "w1", exercise_id: "a", amount: 8, load_kg: 0, rir: null, sort_order: 1 }]
    );
    expect(out[0].sets[0].rir).toBeNull();
  });

  it("a session with no sets is still a session", () => {
    const out = sessionsFrom([workout], []);
    expect(out).toHaveLength(1);
    expect(out[0].sets).toEqual([]);
  });

  it("keeps an unrecognised kind as work rather than dropping the session", () => {
    // A session that happened loaded the body. Losing it would understate
    // the week and make the acute:chronic ratio lie.
    expect(sessionKindOf("cardio-blast")).toBe("full-body");
    expect(sessionKindOf("legs")).toBe("legs");
  });
});

describe("attemptsFrom", () => {
  it("carries strictness through, because a sloppy rep passes nothing", () => {
    const out = attemptsFrom([
      { node_id: "fl.tuck", on_date: "2026-08-12", amount: "22", strict: false },
    ]);
    expect(out[0]).toEqual({
      node_id: "fl.tuck",
      on: "2026-08-12",
      amount: 22,
      strict: false,
    });
  });
});

describe("profileFrom", () => {
  it("gives a first-run athlete a floor, not a wish", () => {
    const p = profileFrom(null);
    expect(p.equipment).toEqual(DEFAULT_EQUIPMENT);
    expect(p.bodyweight_kg).toBeNull();
    expect(p.focus_skills).toEqual([]);
  });

  it("treats an empty equipment list as never-filled-in", () => {
    const p = profileFrom({
      bodyweight_kg: "85",
      sessions_per_week: 5,
      equipment: [],
      focus_skills: ["front-lever"],
      landmarks: {},
    });
    expect(p.equipment).toEqual(DEFAULT_EQUIPMENT);
    expect(p.bodyweight_kg).toBe(85);
  });
});

describe("readLandmarks", () => {
  it("validates the jsonb rather than trusting it", () => {
    expect(readLandmarks(null)).toEqual({});
    expect(readLandmarks("junk")).toEqual({});
    expect(readLandmarks({ chest: { mv: 4 } })).toEqual({});
  });

  it("refuses landmarks that are out of order — that is a typo, not a preference", () => {
    expect(readLandmarks({ chest: { mv: 20, mev: 8, mav: 16, mrv: 22 } })).toEqual({});
    expect(
      readLandmarks({ chest: { mv: 4, mev: 8, mav: 16, mrv: 22 } })
    ).toEqual({ chest: { mv: 4, mev: 8, mav: 16, mrv: 22 } });
  });
});

describe("todaysKind", () => {
  const shape = ["push", "pull", "legs", "skills"] as const;
  const session = (kind: string, on: string) => ({
    id: on,
    on,
    kind: kind as "push",
    sets: [],
    session_rpe: 7,
    duration_min: 60,
  });

  it("picks the first kind not trained recently", () => {
    const out = todaysKind([...shape], [session("push", "2026-08-11")], "2026-08-12");
    expect(out.kind).toBe("pull");
  });

  it("comes back round once a session ages past the gap", () => {
    const out = todaysKind([...shape], [session("push", "2026-08-01")], "2026-08-12");
    expect(out.kind).toBe("push");
  });

  it("says so when everything is recent, rather than inventing a session", () => {
    const out = todaysKind(
      [...shape],
      shape.map((k) => session(k, "2026-08-11")),
      "2026-08-12"
    );
    expect(out.everythingRecent).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The whole pipe, against the data that actually exists today
 *
 * Every training table is empty right now. That is not an edge case to be
 * tolerated — it is Jay's real state until the companion runs, and the
 * pages have to be honest and useful in it rather than crashing or
 * inventing a session out of nothing.
 * ------------------------------------------------------------------ */

import {
  SEASON_SESSIONS,
  SKILL_TREES,
  advise,
  deriveState,
  generatePlan,
  readinessFor,
  weekShape,
  workloadRatio,
  LIBRARY,
} from "../src/lib/hybrid";

describe("adapter → engine, with nothing logged", () => {
  const today = "2026-08-12";
  const readings = allReadings([], []);
  const sessions = sessionsFrom([], []);
  const profile = profileFrom(null);
  const state = SKILL_TREES.reduce(
    (acc, t) => ({ ...acc, ...deriveState(t, []) }),
    {} as Record<string, "locked" | "testing" | "working" | "owned">
  );

  it("returns no readiness score, and says why rather than guessing", () => {
    const r = readinessFor(readings, today);
    expect(r.score).toBeNull();
    expect(r.reason).toContain("Nothing to go on");
  });

  it("still produces a full session — no data is not a reason to not train", () => {
    const shape = weekShape(SEASON_SESSIONS.quiet);
    const { kind } = todaysKind(shape, sessions, today);
    const plan = generatePlan({
      on: today,
      kind,
      readiness: readinessFor(readings, today),
      profile,
      trees: SKILL_TREES,
      skillState: state,
    });
    expect(plan.blocks.length).toBeGreaterThan(0);
    // Unscored days are prescribed as written: the system will not invent
    // a reason to make him do less.
    expect(plan.adjustment.volume).toBe(1);
  });

  it("prescribes only what the default equipment can actually do", () => {
    const plan = generatePlan({
      on: today,
      kind: "pull",
      readiness: readinessFor(readings, today),
      profile,
      trees: SKILL_TREES,
      skillState: state,
    });
    const owned = new Set(profile.equipment);
    for (const b of plan.blocks) {
      for (const i of b.items) {
        const ex = LIBRARY.get(i.exercise_id)!;
        expect(ex.equipment.every((k) => owned.has(k)), ex.id).toBe(true);
      }
    }
  });

  it("refuses a workload ratio rather than dividing by nothing", () => {
    expect(workloadRatio(sessions, today).ratio).toBeNull();
  });

  it("stays quiet on progression instead of inventing a failure", () => {
    const a = advise({
      todayIso: today,
      readiness: readinessFor(readings, today),
      sessions,
      library: LIBRARY,
      trees: SKILL_TREES,
      skillState: state,
      profile,
    });
    expect(a.progression).toEqual([]);
    // But it does offer the three-tap fix for the missing readiness score.
    expect(a.readiness[0].action?.href).toBe("/checkin");
  });

  it("locks every skill rung until something is proved", () => {
    expect(Object.values(state).every((m) => m === "locked" || m === "testing")).toBe(true);
  });
});
