/* ------------------------------------------------------------------ *
 * The adapter — THE BRAIN's rows, in HYBRID's vocabulary
 *
 * This file exists so that `hybrid/` does not have to. Nothing in the
 * engine imports Supabase, React or a BRAIN table; the cost of that purity
 * is one translation layer, and this is it. It sits OUTSIDE the boundary
 * on purpose: if the database changes shape tomorrow, this file changes
 * and the 77 engine tests do not.
 *
 * Two rules it inherits and must not break:
 *
 *   · **Absence is not zero.** A null column produces NO reading rather
 *     than a zero one. A day with no HRV is a day the engine knows nothing
 *     about, not a day with an HRV of nothing.
 *   · **Source is not the same as quality.** `source` on `health_days`
 *     records HOW the row arrived, and the engine discounts by freshness
 *     and directness rather than by whether a machine produced it.
 * ------------------------------------------------------------------ */

import {
  type AthleteProfile,
  type Attempt,
  type MuscleGroup,
  type Reading,
  type SessionKind,
  type SessionLog,
  type SignalSource,
  type VolumeLandmarks,
} from "./hybrid";

/* ------------------------------------------------------------------ *
 * Rows, as the database hands them over
 * ------------------------------------------------------------------ */

export type HealthDayRow = {
  on_date: string;
  rmssd: number | string | null;
  resting_hr: number | null;
  sleep_hours: number | string | null;
  steps: number | null;
  active_minutes: number | null;
  source: string;
};

export type JournalRow = {
  entry_date: string;
  mood: number | null;
  energy: number | null;
};

export type WorkoutRow = {
  id: string;
  on_date: string;
  kind: string;
  minutes: number | null;
  rpe: number | null;
};

export type TrainingSetRow = {
  workout_id: string;
  exercise_id: string;
  amount: number | string;
  load_kg: number | string;
  rir: number | null;
  sort_order: number;
};

export type SkillAttemptRow = {
  node_id: string;
  on_date: string;
  amount: number | string;
  strict: boolean;
};

export type AthleteProfileRow = {
  bodyweight_kg: number | string | null;
  sessions_per_week: number;
  equipment: string[];
  focus_skills: string[];
  landmarks: unknown;
};

/** PostgREST returns numerics as strings. Absence stays absence. */
const num = (v: number | string | null | undefined): number | null => {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ *
 * health_days → Reading[]
 * ------------------------------------------------------------------ */

/**
 * How a row got here, in the engine's terms.
 *
 * `health_connect` is a live device feed, so it is a wearable. `samsung`
 * came out of an export file — the same numbers, but arriving in a batch
 * days later, which is exactly what the `import` reliability tier is for.
 * Anything typed is `self`. An unrecognised source is treated as an import
 * rather than as a wearable: the honest default is the more discounted one.
 */
export function sourceOf(raw: string): SignalSource {
  if (raw === "health_connect") return "wearable";
  if (raw === "manual") return "self";
  return "import";
}

/**
 * One row becomes up to three readings — HRV, resting HR and sleep — and
 * a null column produces none. This is where "absence is not zero" is
 * actually enforced; everything downstream depends on it holding here.
 */
export function readingsFromHealthDays(rows: HealthDayRow[]): Reading[] {
  const out: Reading[] = [];
  for (const r of rows) {
    const source = sourceOf(r.source);
    const push = (key: Reading["key"], value: number | null) => {
      if (value == null) return;
      out.push({ key, value, source, on: r.on_date });
    };
    push("hrv", num(r.rmssd));
    push("resting_hr", r.resting_hr);
    push("sleep_hours", num(r.sleep_hours));
  }
  return out;
}

/**
 * The daily close is already a readiness instrument.
 *
 * Mood and energy are asked every evening in two taps, they are the two
 * signals Jay actually supplies, and the subjective-measures literature
 * puts them level with HRV rather than beneath it. Not wiring them in
 * would mean the engine ignored the only data the system reliably has.
 */
export function readingsFromJournal(rows: JournalRow[]): Reading[] {
  const out: Reading[] = [];
  for (const r of rows) {
    if (r.mood != null) {
      out.push({ key: "mood", value: r.mood, source: "self", on: r.entry_date });
    }
    if (r.energy != null) {
      out.push({ key: "energy", value: r.energy, source: "self", on: r.entry_date });
    }
  }
  return out;
}

/** Everything the readiness engine can hear, from every table that speaks. */
export function allReadings(
  health: HealthDayRow[],
  journal: JournalRow[]
): Reading[] {
  return [...readingsFromHealthDays(health), ...readingsFromJournal(journal)];
}

/* ------------------------------------------------------------------ *
 * workouts + training_sets → SessionLog[]
 * ------------------------------------------------------------------ */

const SESSION_KINDS_SET = new Set<SessionKind>([
  "push",
  "pull",
  "legs",
  "skills",
  "full-body",
  "recovery",
  "rest",
]);

/**
 * `workouts.kind` is free text, so a value from before HYBRID existed —
 * or typed by hand — may be anything. Unknown kinds become `full-body`
 * rather than being dropped: a session that happened is a session that
 * loaded the body, and losing it would understate the week's volume.
 */
export function sessionKindOf(raw: string): SessionKind {
  return SESSION_KINDS_SET.has(raw as SessionKind)
    ? (raw as SessionKind)
    : "full-body";
}

export function sessionsFrom(
  workouts: WorkoutRow[],
  sets: TrainingSetRow[]
): SessionLog[] {
  const byWorkout = new Map<string, TrainingSetRow[]>();
  for (const s of sets) {
    const held = byWorkout.get(s.workout_id);
    if (held) held.push(s);
    else byWorkout.set(s.workout_id, [s]);
  }
  return workouts.map((w) => ({
    id: w.id,
    on: w.on_date,
    kind: sessionKindOf(w.kind),
    session_rpe: w.rpe,
    duration_min: w.minutes,
    sets: (byWorkout.get(w.id) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        exercise_id: s.exercise_id,
        amount: num(s.amount) ?? 0,
        load_kg: num(s.load_kg) ?? 0,
        rir: s.rir,
      })),
  }));
}

/* ------------------------------------------------------------------ *
 * skill_attempts → Attempt[]
 * ------------------------------------------------------------------ */

export function attemptsFrom(rows: SkillAttemptRow[]): Attempt[] {
  return rows.map((r) => ({
    node_id: r.node_id,
    on: r.on_date,
    amount: num(r.amount) ?? 0,
    strict: r.strict,
  }));
}

/* ------------------------------------------------------------------ *
 * athlete_profile → AthleteProfile
 * ------------------------------------------------------------------ */

/**
 * What a first-run athlete owns.
 *
 * Deliberately the floor rather than a wish: a floor, a bar and a wall.
 * Everything the plan generator prescribes is checked against this, so an
 * over-generous default would produce a session Jay cannot actually do —
 * and a warm-up calling for kit he does not own is the first thing that
 * teaches him to skip the warm-up.
 */
export const DEFAULT_EQUIPMENT = ["floor", "wall", "bar"];

/** `landmarks` is jsonb — validate, never trust (§A7). */
export function readLandmarks(
  raw: unknown
): Partial<Record<MuscleGroup, VolumeLandmarks>> {
  if (typeof raw !== "object" || raw == null) return {};
  const out: Partial<Record<MuscleGroup, VolumeLandmarks>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "object" || v == null) continue;
    const l = v as Record<string, unknown>;
    const mv = num(l.mv as number);
    const mev = num(l.mev as number);
    const mav = num(l.mav as number);
    const mrv = num(l.mrv as number);
    if (mv == null || mev == null || mav == null || mrv == null) continue;
    // The landmarks are a ladder. One out of order is a typo, not a
    // preference, and honouring it would produce nonsense statuses.
    if (!(mv <= mev && mev <= mav && mav <= mrv)) continue;
    out[k as MuscleGroup] = { mv, mev, mav, mrv };
  }
  return out;
}

export function profileFrom(row: AthleteProfileRow | null): AthleteProfile {
  if (!row) {
    return {
      bodyweight_kg: null,
      sessions_per_week: 4,
      equipment: DEFAULT_EQUIPMENT,
      focus_skills: [],
      landmarks: {},
    };
  }
  return {
    bodyweight_kg: num(row.bodyweight_kg),
    sessions_per_week: row.sessions_per_week,
    // An empty equipment list is a profile never filled in, not an athlete
    // with nothing — the defaults are kinder and still honest.
    equipment: row.equipment.length > 0 ? row.equipment : DEFAULT_EQUIPMENT,
    focus_skills: row.focus_skills,
    landmarks: readLandmarks(row.landmarks),
  };
}

/* ------------------------------------------------------------------ *
 * Which session today
 * ------------------------------------------------------------------ */

/**
 * Today's session kind, from the week's shape and what has been trained.
 *
 * Walks the rotation and takes the first kind not done in the last three
 * days. Not a calendar: a plan pinned to weekdays is wrong by Wednesday of
 * the first busy week, and this system already knows seasons make weeks
 * uneven. Falls back to the first of the rotation when everything is
 * recent, which is a rest-day signal the page can say out loud.
 */
export function todaysKind(
  shape: SessionKind[],
  sessions: SessionLog[],
  todayIso: string,
  restGapDays: number = 3
): { kind: SessionKind; everythingRecent: boolean } {
  const daysAgo = (on: string) =>
    Math.round(
      (Date.parse(todayIso + "T00:00:00") - Date.parse(on + "T00:00:00")) /
        86_400_000
    );
  const recent = new Set(
    sessions
      .filter((s) => {
        const d = daysAgo(s.on);
        return d >= 0 && d < restGapDays;
      })
      .map((s) => s.kind)
  );
  const next = shape.find((k) => !recent.has(k));
  return {
    kind: next ?? shape[0] ?? "full-body",
    everythingRecent: next == null,
  };
}
