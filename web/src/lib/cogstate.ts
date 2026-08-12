/* ------------------------------------------------------------------ *
 * THE COG — the adapter, and the state builder
 *
 * This file exists so that `cog/` does not have to. Nothing in the engine
 * imports Supabase, React or a BRAIN table; the cost of that purity is one
 * translation layer, and this is it. It sits OUTSIDE the boundary on
 * purpose, exactly as `training.ts` does for HYBRID: if the database
 * changes shape tomorrow, this file changes and the engine's tests do not.
 *
 * THE BLUEPRINT'S SCHEMA ASSUMPTIONS WERE WRONG IN THREE PLACES, and this
 * is where each is corrected rather than papered over:
 *
 *   · `tasks.priority` is TEXT — "High" | "Med" | "Low" — not a number.
 *     The engine's `priorityScore` divides it by 3, so feeding the column
 *     through raw would have made every score NaN and every ranking
 *     meaningless in a way no test would have caught. Mapped here.
 *   · There is no `tasks.estimate_min`. The column is `duration_min`, and
 *     its null means "not estimated", never zero — the same distinction
 *     the planner already makes.
 *   · `tasks.status` has five values, not two. `doing` is an open task
 *     that has been started; treating it as closed would hide the work
 *     Jay is in the middle of, which is the worst possible thing for an
 *     advisor to hide.
 *
 * AND THE ONE DESIGN DEPARTURE, decided with Jay:
 *
 *   The blueprint centres a 10-second MORNING check-in, and rule N1 fires
 *   "no check-in yet — ask" whenever it is absent. But the check-in in
 *   this system is NIGHTLY, by his decision in LIFE_OS v2. Wired as
 *   designed, N1 would have fired every single morning forever: THE COG
 *   would have nagged him daily and never once advised him.
 *
 *   So the morning bands are DERIVED from what last night already
 *   recorded — journal mood/energy and health_days sleep — and decay with
 *   age rather than vanishing. A row in `cog_checkins` still wins when one
 *   exists, so the sharper read remains available without being required.
 *   This is the blueprint's own law applied to the blueprint: a
 *   measurement that costs a manual entry will not survive a busy season.
 * ------------------------------------------------------------------ */

import type {
  Band,
  CogTask,
  IdentityProfile,
  Interval,
  MissingInput,
  MomentumState,
  Season,
  TaskEnergy,
} from "./cog";
import type { Priority as BrainPriority, TaskStatus } from "./types";

/* ------------------------------------------------------------------ *
 * Rows, as the database hands them over
 * ------------------------------------------------------------------ */

export type CogTaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  do_date: string | null;
  due_date: string | null;
  priority: BrainPriority | null;
  energy: string | null;
  pillar_id: string | null;
  project_id: string | null;
  duration_min: number | null;
  created_at: string | null;
  meta?: unknown;
};

export type CogJournalRow = {
  entry_date: string;
  mood: number | null;
  energy: number | null;
};

export type CogHealthRow = {
  on_date: string;
  sleep_hours: number | string | null;
};

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

/**
 * "High" | "Med" | "Low" → 3 | 2 | 1.
 *
 * The engine wants a number it can normalise. An UNSET priority maps to
 * the middle rather than to zero: a task nobody has graded is not a task
 * of no importance, and scoring it at the bottom would bury exactly the
 * work that has never been looked at properly.
 */
export const PRIORITY_RANK: Record<BrainPriority, number> = {
  High: 3,
  Med: 2,
  Low: 1,
};

export function rankOf(p: BrainPriority | null): number {
  return p == null ? 2 : PRIORITY_RANK[p];
}

/** Statuses that mean the task is still live. `doing` is emphatically one. */
export const OPEN_STATUSES: readonly TaskStatus[] = ["open", "doing", "waiting"];

/** THE BRAIN's three energies are already the engine's three. */
function energyOf(raw: string | null): TaskEnergy | null {
  return raw === "low" || raw === "medium" || raw === "deep" ? raw : null;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(toIso.slice(0, 10) + "T00:00:00Z") -
      Date.parse(fromIso.slice(0, 10) + "T00:00:00Z")) /
      86_400_000
  );
}

/**
 * BRAIN task rows → the engine's vocabulary.
 *
 * `keystonePillarId` is the pillar the keystone habit belongs to; a task
 * under it counts as supporting the keystone. That is a coarser rule than
 * naming individual tasks, and deliberately so — the alternative is a
 * second thing to tag, which is a manual entry, which is a thing that
 * stops happening in March.
 */
export function tasksFrom(
  rows: CogTaskRow[],
  todayIso: string,
  opts: { keystonePillarId?: string | null; empireTaskIds?: Set<string> } = {}
): CogTask[] {
  const empire = opts.empireTaskIds ?? new Set<string>();
  return rows
    .filter((r) => OPEN_STATUSES.includes(r.status))
    .map((r): CogTask => {
      const cog = readCogMeta(r.meta);
      return {
        id: r.id,
        title: r.title,
        // The engine's own union is narrower than BRAIN's. `doing` is a
        // started open task, and only `waiting` is genuinely blocked.
        status: r.status === "waiting" ? "waiting" : "open",
        doDate: r.do_date,
        dueDate: r.due_date,
        priority: rankOf(r.priority),
        energy: energyOf(r.energy),
        pillarId: r.pillar_id,
        projectId: r.project_id,
        // Null is "not estimated", never zero — a task with no estimate
        // must not read as a task that takes no time, or the micro-action
        // rule would offer a 90-minute spec as a five-minute filler.
        estimateMin: r.duration_min,
        staleDays: r.created_at == null ? 0 : Math.max(0, daysBetween(r.created_at, todayIso)),
        supportsKeystone:
          opts.keystonePillarId != null && r.pillar_id === opts.keystonePillarId,
        userSteered: cog.steeredUntil != null && cog.steeredUntil > todayIso,
        empireSignal: empire.has(r.id),
      };
    });
}

/** What COG writes into `tasks.meta.cog`. Validated, never trusted (§A7). */
export type CogTaskMeta = { steeredUntil?: string; lastWriteAt?: string };

export function readCogMeta(meta: unknown): CogTaskMeta {
  if (typeof meta !== "object" || meta == null) return {};
  const cog = (meta as { cog?: unknown }).cog;
  if (typeof cog !== "object" || cog == null) return {};
  const c = cog as Record<string, unknown>;
  return {
    steeredUntil: typeof c.steeredUntil === "string" ? c.steeredUntil : undefined,
    lastWriteAt: typeof c.lastWriteAt === "string" ? c.lastWriteAt : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * The bands — derived from last night, decayed by age
 * ------------------------------------------------------------------ */

/** How stale last night's reading may be before it stops speaking. */
export const BAND_MAX_AGE_DAYS = 2;

/** THE BRAIN records mood and energy 1–5 already. Clamp and trust. */
export function bandFrom1to5(n: number | null | undefined): Band | null {
  if (n == null || Number.isNaN(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 5) return null;
  return r as Band;
}

/**
 * Sleep hours → a 1–5 band.
 *
 * Absolute thresholds rather than a personal baseline, because HYBRID
 * already owns baseline-relative readiness and this is the coarse
 * question: was that enough sleep to do hard things today. Under five
 * hours is a 1 in anybody's book.
 */
export function sleepBandFrom(hours: number | null): Band | null {
  if (hours == null || Number.isNaN(hours)) return null;
  if (hours < 5) return 1;
  if (hours < 6) return 2;
  if (hours < 7) return 3;
  if (hours < 8) return 4;
  return 5;
}

export type DerivedBands = {
  energyBand: Band | null;
  sleepBand: Band | null;
  energySource: "checkin" | "decayed" | "none";
  sleepSource: "health" | "checkin" | "none";
  /** Days between the reading and today. Null when there was no reading. */
  energyAgeDays: number | null;
};

/**
 * Today's bands, from whatever spoke most recently.
 *
 * Precedence for energy: an explicit check-in for today, else the most
 * recent journal entry inside the window (reported as `decayed`, which is
 * what stops N1 nagging), else nothing. For sleep: measured hours from
 * health_days first, because a wearable beats a memory.
 */
export function deriveBands(input: {
  checkin: { energyBand: Band; sleepBand: Band | null } | null;
  journal: CogJournalRow[];
  health: CogHealthRow[];
  todayIso: string;
}): DerivedBands {
  const { checkin, journal, health, todayIso } = input;

  const fresh = <T extends { date: string }>(rows: T[]): T | null => {
    const inWindow = rows
      .filter((r) => {
        const age = daysBetween(r.date, todayIso);
        return age >= 0 && age <= BAND_MAX_AGE_DAYS;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return inWindow[0] ?? null;
  };

  const lastJournal = fresh(
    journal
      .map((j) => ({ date: j.entry_date, energy: bandFrom1to5(j.energy), mood: bandFrom1to5(j.mood) }))
      // A journal entry that recorded neither number says nothing about
      // the tank, and must not count as evidence that it was measured.
      .filter((j) => j.energy != null || j.mood != null)
  );
  const lastSleep = fresh(
    health
      .map((h) => ({ date: h.on_date, band: sleepBandFrom(numeric(h.sleep_hours)) }))
      .filter((h) => h.band != null)
  );

  // Energy: today's check-in, then last night, then silence.
  let energyBand: Band | null = null;
  let energySource: DerivedBands["energySource"] = "none";
  let energyAgeDays: number | null = null;
  if (checkin) {
    energyBand = checkin.energyBand;
    energySource = "checkin";
    energyAgeDays = 0;
  } else if (lastJournal) {
    // Mood stands in when energy was left blank — they are not the same
    // thing, but a rated evening with no energy figure still tells you
    // more than nothing does, and the source says `decayed` either way.
    energyBand = lastJournal.energy ?? lastJournal.mood;
    energySource = "decayed";
    energyAgeDays = daysBetween(lastJournal.date, todayIso);
  }

  // Sleep: measured beats reported.
  let sleepBand: Band | null = null;
  let sleepSource: DerivedBands["sleepSource"] = "none";
  if (lastSleep?.band != null) {
    sleepBand = lastSleep.band;
    sleepSource = "health";
  } else if (checkin?.sleepBand != null) {
    sleepBand = checkin.sleepBand;
    sleepSource = "checkin";
  }

  return { energyBand, sleepBand, energySource, sleepSource, energyAgeDays };
}

function numeric(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ *
 * Capacity
 * ------------------------------------------------------------------ */

/** The waking day the calendar load is measured against. */
export const WAKING = { start: "07:00", end: "22:00" };

export function calendarLoad(busy: Interval[], dateIso: string): number {
  const wake = Date.parse(`${dateIso}T${WAKING.start}:00Z`);
  const sleep = Date.parse(`${dateIso}T${WAKING.end}:00Z`);
  const busyMs = busy.reduce((acc, b) => {
    const s = Date.parse(asUtc(b.start));
    const e = Date.parse(asUtc(b.end));
    if (Number.isNaN(s) || Number.isNaN(e)) return acc;
    return acc + Math.max(0, Math.min(e, sleep) - Math.max(s, wake));
  }, 0);
  return Math.min(1, busyMs / (sleep - wake));
}

/** Naive local datetimes are compared in one consistent frame. */
function asUtc(naive: string): string {
  return naive.endsWith("Z") ? naive : `${naive}Z`;
}

/** How many due-within-a-week tasks count as full pressure. */
export const PRESSURE_FULL_AT = 10;

export function workloadPressure(tasks: CogTask[], dateIso: string): number {
  const week = new Date(Date.parse(dateIso + "T00:00:00Z") + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const dueSoon = tasks.filter((t) => t.dueDate !== null && t.dueDate <= week).length;
  return Math.min(1, dueSoon / PRESSURE_FULL_AT);
}

/* ------------------------------------------------------------------ *
 * The state
 * ------------------------------------------------------------------ */

export type StateInput = {
  date: string;
  now: string;
  season: Season;
  tasks: CogTask[];
  bands: DerivedBands;
  calendar: { source: "google" | "planner" | "none"; busy: Interval[] };
  yesterday: { completionRatio: number | null; keystoneHit: boolean | null };
  finishesRate: number | null;
  empire: { dormantVentures: number; opportunitiesDueToday: number };
  counters: {
    inboxCount: number;
    pulsesRejectedToday: number;
    checkinStreakDays: number;
    keystoneDoneToday: boolean;
  };
};

/**
 * Assemble the state the engine runs on.
 *
 * `missingInputs` is the honest part of this function, and the rule it
 * follows is the one the whole system follows: a thing is listed as
 * missing when the system CANNOT SEE IT, never when the answer happens to
 * be nothing. In particular "checkin" is only missing when no band could
 * be derived at all — a decayed reading from last night is a real reading,
 * and marking it missing would restore exactly the daily nag this design
 * exists to avoid.
 */
export function buildState(i: StateInput): MomentumState {
  const missing: MissingInput[] = [];
  if (i.bands.sleepSource !== "health") missing.push("health");
  if (i.bands.sleepBand === null) missing.push("sleep");
  if (i.bands.energySource === "none") missing.push("checkin");
  if (i.calendar.source === "none") missing.push("calendar");

  return {
    date: i.date,
    now: i.now,
    season: i.season,
    signals: {
      energyBand: i.bands.energyBand,
      sleepBand: i.bands.sleepBand,
      energySource: i.bands.energySource,
      sleepSource: i.bands.sleepSource,
      yesterdayCompletionRatio: i.yesterday.completionRatio,
      keystoneHitYesterday: i.yesterday.keystoneHit,
      keystoneDoneToday: i.counters.keystoneDoneToday,
      checkinStreakDays: i.counters.checkinStreakDays,
      finishesRate: i.finishesRate,
      calendarLoadRatio:
        i.calendar.source === "none" ? null : calendarLoad(i.calendar.busy, i.date),
      workloadPressure: workloadPressure(i.tasks, i.date),
      inboxCount: i.counters.inboxCount,
      pulsesRejectedToday: i.counters.pulsesRejectedToday,
    },
    tasks: i.tasks,
    calendar: i.calendar,
    empire: i.empire,
    missingInputs: missing,
  };
}

/* ------------------------------------------------------------------ *
 * Yesterday, and the streak
 * ------------------------------------------------------------------ */

export function yesterdayOf(todayIso: string): string {
  return new Date(Date.parse(todayIso + "T00:00:00Z") - 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * How much of what was planned for a day actually got done.
 *
 * Returns NULL when nothing was planned. Zero-of-zero is not a failure;
 * it is a day nobody made a claim about, and scoring it as 0% completion
 * would let an unplanned Sunday drag the momentum indicator down as hard
 * as a day of avoidance.
 */
export function completionRatio(
  rows: { status: TaskStatus }[]
): number | null {
  if (rows.length === 0) return null;
  const done = rows.filter((r) => r.status === "done").length;
  return Math.round((done / rows.length) * 1000) / 1000;
}

/**
 * Consecutive days ending yesterday with an evening entry.
 *
 * Ends YESTERDAY, not today: at 07:00 the evening has not happened, and a
 * streak that resets every morning and rebuilds every night would be
 * noise dressed as a signal.
 */
export function eveningStreak(dates: string[], todayIso: string): number {
  const set = new Set(dates.map((d) => d.slice(0, 10)));
  let n = 0;
  let cursor = yesterdayOf(todayIso);
  while (set.has(cursor)) {
    n += 1;
    cursor = yesterdayOf(cursor);
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

export type CogIdentityRow = {
  keystone_habit_id: string | null;
  deep_work_start: string;
  deep_work_end: string;
  statements: unknown;
  alignment_window_days: number;
};

/**
 * The identity profile.
 *
 * `keystoneHabitId` carries the keystone's PILLAR id, not the habit's own
 * id, because that is what the engine compares statements against — the
 * blueprint's fixture did the same thing under a misleading name, and
 * getting it wrong would silently disable rule I3 rather than fail.
 */
export function profileFrom(
  row: CogIdentityRow | null,
  keystonePillarId: string | null,
  recentCompletionsByPillar: Record<string, number>
): IdentityProfile {
  const statements = readStatements(row?.statements);
  return {
    id: "cog-identity",
    keystoneHabitId: keystonePillarId,
    deepWorkWindow: {
      start: (row?.deep_work_start ?? "08:30").slice(0, 5),
      end: (row?.deep_work_end ?? "12:30").slice(0, 5),
    },
    statements,
    alignmentWindowDays: row?.alignment_window_days ?? 7,
    recentCompletionsByPillar,
  };
}

function readStatements(raw: unknown): IdentityProfile["statements"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    if (typeof s !== "object" || s == null) return [];
    const o = s as Record<string, unknown>;
    if (typeof o.pillarId !== "string" || typeof o.statement !== "string") return [];
    const weight = typeof o.weight === "number" && o.weight > 0 ? o.weight : 1;
    return [{ pillarId: o.pillarId, statement: o.statement, weight }];
  });
}

/** Completed-task counts per pillar over the alignment window. */
export function completionsByPillar(
  rows: { pillar_id: string | null; completed_at: string | null }[],
  todayIso: string,
  windowDays = 7
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.pillar_id == null || r.completed_at == null) continue;
    const age = daysBetween(r.completed_at, todayIso);
    if (age < 0 || age >= windowDays) continue;
    out[r.pillar_id] = (out[r.pillar_id] ?? 0) + 1;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The calendar, from the planner
 * ------------------------------------------------------------------ */

/**
 * Busy blocks from the day-planner's `journal.meta.hours` pinning.
 *
 * The blueprint's FB-3 fallback. It is a weaker signal than Google's
 * free/busy — it says where Jay INTENDED to work, not where he is
 * committed — so the slot it produces is labelled `planner` and the UI
 * says which source it came from.
 */
export function busyFromPlanner(
  hours: unknown,
  dateIso: string
): { source: "planner" | "none"; busy: Interval[] } {
  if (typeof hours !== "object" || hours == null) return { source: "none", busy: [] };
  const busy: Interval[] = [];
  for (const [key, value] of Object.entries(hours as Record<string, unknown>)) {
    const hour = Number(key);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    if (value == null || value === "") continue;
    const hh = String(hour).padStart(2, "0");
    busy.push({
      start: `${dateIso}T${hh}:00:00`,
      end: `${dateIso}T${String(hour + 1).padStart(2, "0")}:00:00`,
    });
  }
  return busy.length === 0 ? { source: "none", busy: [] } : { source: "planner", busy };
}
