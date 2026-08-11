import type { Pillar, SystemKey, Task } from "./types";
import { readTaskTime, type TaskTime } from "./calendar";
import { isOpenWork } from "./logic";

/* ------------------------------------------------------------------ *
 * The day planner
 *
 * A task already knows the day it will be done (`do_date`) and, since the
 * calendar work, the *time* it sits at — `meta.time`, read by
 * `readTaskTime`. That field was written only by Google: drag an event to
 * 2pm over there and the pull recorded it here. Nothing inside THE BRAIN
 * ever set it.
 *
 * This module is what sets it. Drop a task on 14:00 and the same field
 * Google writes is written here, which means the existing push carries it
 * straight back out as a timed event with no new sync path at all.
 *
 * Two rules inherited from the calendar decisions, and both matter:
 *
 *   · **Conflicts are surfaced, never auto-resolved.** Two tasks on the
 *     same slot is a fact about the day, and the planner says so rather
 *     than quietly shuffling one of them. Only Jay moves Jay's work.
 *   · **Absence is not zero.** A task with no `duration_min` is drawn at a
 *     default length so it can be placed at all, but it renders a dash and
 *     is counted separately from the day's estimated load.
 * ------------------------------------------------------------------ */

/** The planner's visible window. Outside it, a day is not a diary. */
export const DAY_START_MIN = 6 * 60; // 06:00
export const DAY_END_MIN = 22 * 60; // 22:00
/** Grid resolution. Half an hour is fine enough to plan, coarse enough to read. */
export const SLOT_MIN = 30;
/** What an unestimated task occupies. Drawn, but never counted as known. */
export const DEFAULT_DURATION_MIN = 30;
/** Five per system — Jay's sheet, and the count each week section shows. */
export const PRIORITY_SLOTS_PER_SYSTEM = 5;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "14:30" → 870. Anything that is not a real clock time returns null. */
export function toMinutes(hhmm: string): number | null {
  if (!HHMM.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 870 → "14:30". Clamped to the day so no caller can produce "25:00". */
export function toHHMM(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Every slot start in the planner window, in minutes. */
export function slotStarts(
  startMin: number = DAY_START_MIN,
  endMin: number = DAY_END_MIN,
  step: number = SLOT_MIN
): number[] {
  const out: number[] = [];
  for (let m = startMin; m < endMin; m += step) out.push(m);
  return out;
}

type Durationed = { duration_min?: number | null };

/** What to draw. Unestimated tasks get the default so they can be placed. */
export function durationOf(t: Durationed): number {
  const d = t.duration_min;
  return typeof d === "number" && d > 0 ? d : DEFAULT_DURATION_MIN;
}

/** Whether the length on screen is a real estimate or just a placeholder. */
export function isEstimated(t: Durationed): boolean {
  return typeof t.duration_min === "number" && t.duration_min > 0;
}

/** "1h 30m" · "45m" · "—" for not estimated. Never "0m". */
export function formatDuration(min: number | null | undefined): string {
  if (typeof min !== "number" || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * The `meta.time` a task should carry if dropped at `startMin`.
 *
 * A block that would run past the end of the planner window is pulled back
 * so it still ends inside the day — a task cannot be scheduled into a time
 * that is not on the grid. Returns null only when the task cannot fit at
 * all, which the caller reports rather than silently swallowing.
 */
export function placementFor(
  startMin: number,
  durationMin: number,
  dayEndMin: number = DAY_END_MIN
): TaskTime | null {
  const dur = Math.max(1, Math.round(durationMin));
  if (dur > dayEndMin - DAY_START_MIN) return null;
  const start = Math.max(DAY_START_MIN, Math.min(startMin, dayEndMin - dur));
  return { start: toHHMM(start), end: toHHMM(start + dur) };
}

export type Placed<T> = {
  task: T;
  startMin: number;
  endMin: number;
  /** False when the length shown is the default rather than an estimate. */
  estimated: boolean;
};

type Planned = Pick<Task, "id" | "do_date" | "status"> &
  Durationed & { meta?: unknown };

/**
 * Split one day's open work into what has a time and what does not.
 *
 * Placed items are sorted by start so the column renders top to bottom;
 * unplaced ones keep their incoming order and wait in the day's pool.
 */
export function dayLayout<T extends Planned>(
  tasks: T[],
  dayIso: string
): { placed: Placed<T>[]; unplaced: T[] } {
  const placed: Placed<T>[] = [];
  const unplaced: T[] = [];

  for (const t of tasks) {
    if (t.do_date !== dayIso || !isOpenWork(t)) continue;
    const time = readTaskTime(t.meta);
    const start = time ? toMinutes(time.start) : null;
    const end = time ? toMinutes(time.end) : null;
    if (start == null || end == null) {
      unplaced.push(t);
      continue;
    }
    placed.push({ task: t, startMin: start, endMin: end, estimated: isEstimated(t) });
  }

  placed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  return { placed, unplaced };
}

/**
 * The ids of tasks whose blocks overlap.
 *
 * Surfaced, never resolved — the same rule the calendar sync holds. Two
 * things booked at once is information, and moving one of them is a
 * decision only Jay gets to make.
 */
export function clashing<T extends { id: string }>(
  placed: Placed<T>[]
): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      // Sorted by start, so once b starts after a ends nothing later clashes.
      if (b.startMin >= a.endMin) break;
      out.add(a.task.id);
      out.add(b.task.id);
    }
  }
  return out;
}

export type Laned<T> = Placed<T> & { lane: number; lanes: number };

/**
 * Side-by-side lanes for blocks that overlap.
 *
 * Clashing work is drawn beside itself rather than on top of itself, so a
 * double-booking is visible as a double-booking. Lanes are computed per
 * cluster of mutually-overlapping blocks, so one clash at 9am does not
 * narrow the whole day.
 */
export function withLanes<T extends { id: string }>(
  placed: Placed<T>[]
): Laned<T>[] {
  const out: Laned<T>[] = [];
  let cluster: Laned<T>[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    const lanes = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 0);
    for (const c of cluster) out.push({ ...c, lanes });
    cluster = [];
  };

  // `placed` arrives sorted by start (dayLayout guarantees it).
  for (const p of placed) {
    if (cluster.length > 0 && p.startMin >= clusterEnd) closeCluster();
    // First lane whose last block has finished.
    const laneEnds: number[] = [];
    for (const c of cluster) laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? 0, c.endMin);
    let lane = 0;
    while (laneEnds[lane] != null && laneEnds[lane] > p.startMin) lane++;
    cluster.push({ ...p, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, p.endMin);
  }
  if (cluster.length > 0) closeCluster();

  return out;
}

/**
 * The day's committed minutes, and how much of it is guesswork.
 *
 * `estimated` counts only tasks with a real `duration_min`, so a day made
 * entirely of unestimated blocks reports a load it does not pretend to know.
 */
export function dayLoad<T extends { id: string }>(
  placed: Placed<T>[]
): { totalMin: number; estimatedMin: number; unestimated: number } {
  let total = 0;
  let est = 0;
  let unest = 0;
  for (const p of placed) {
    const len = p.endMin - p.startMin;
    total += len;
    if (p.estimated) est += len;
    else unest++;
  }
  return { totalMin: total, estimatedMin: est, unestimated: unest };
}

/**
 * The first slot a block of `durationMin` fits without clashing, or null if
 * the day has no room. Offered as a suggestion on the drop target — never
 * applied on its own.
 */
export function firstFreeSlot<T extends { id: string }>(
  placed: Placed<T>[],
  durationMin: number,
  fromMin: number = DAY_START_MIN,
  dayEndMin: number = DAY_END_MIN
): number | null {
  const dur = Math.max(1, durationMin);
  for (const start of slotStarts(Math.max(DAY_START_MIN, fromMin), dayEndMin)) {
    if (start + dur > dayEndMin) return null;
    const clash = placed.some((p) => start < p.endMin && start + dur > p.startMin);
    if (!clash) return start;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Capacity, and the planning fallacy
 *
 * Buehler, Griffin & Ross (1994): people underestimate their own task
 * times even knowing they have been wrong before, because each new task
 * feels like the atypical one. Awareness does not fix it; only comparing
 * against the distribution of your own completed work does.
 *
 * So the planner does two things. It caps the day well below the hours
 * technically available — a day planned to the brim is a day that fails by
 * 10am — and once enough tasks carry both an estimate and an actual, it
 * reports the multiplier rather than the encouragement.
 * ------------------------------------------------------------------ */

/**
 * The share of the visible day that may be planned before the meter turns.
 * 65% of a 16-hour window is ~10 hours, which sounds generous until you
 * remember it excludes everything that is not a task.
 */
export const CAPACITY_FRACTION = 0.65;

export function capacityMin(
  startMin: number = DAY_START_MIN,
  endMin: number = DAY_END_MIN
): number {
  return Math.round((endMin - startMin) * CAPACITY_FRACTION);
}

export type Capacity = {
  plannedMin: number;
  capacityMin: number;
  /** 0–1+, where over 1 is overcommitted. Uncapped, so honesty survives. */
  ratio: number;
  state: "light" | "full" | "over";
};

export function capacityOf(plannedMin: number, cap: number = capacityMin()): Capacity {
  const ratio = cap <= 0 ? 0 : plannedMin / cap;
  return {
    plannedMin,
    capacityMin: cap,
    ratio,
    state: ratio > 1 ? "over" : ratio >= 0.8 ? "full" : "light",
  };
}

/** How many finished tasks it takes before a multiplier means anything. */
export const CALIBRATION_MIN_SAMPLE = 8;

export type Calibration = {
  /** actual ÷ estimated across the sample. >1 means you run over. */
  multiplier: number | null;
  sample: number;
  /** True once the sample is big enough to be worth showing. */
  reliable: boolean;
};

/**
 * The personal estimate multiplier, over tasks that carry both numbers.
 *
 * Returns null rather than 1.0 when there is nothing to go on — a
 * multiplier of exactly 1 is a claim, and "no data" is not that claim.
 */
export function calibration(
  tasks: { duration_min?: number | null; actual_min?: number | null }[],
  minSample: number = CALIBRATION_MIN_SAMPLE
): Calibration {
  let est = 0;
  let act = 0;
  let n = 0;
  for (const t of tasks) {
    const d = t.duration_min;
    const a = t.actual_min;
    if (typeof d !== "number" || d <= 0) continue;
    if (typeof a !== "number" || a <= 0) continue;
    est += d;
    act += a;
    n++;
  }
  if (n === 0 || est === 0) return { multiplier: null, sample: 0, reliable: false };
  return {
    multiplier: act / est,
    sample: n,
    reliable: n >= minSample,
  };
}

/**
 * An estimate corrected by the observed multiplier — shown *beside* the
 * estimate at planning time, never silently substituted for it. The point
 * is to make the gap visible, not to overwrite Jay's judgement.
 */
export function correctedEstimate(
  estimateMin: number,
  cal: Calibration
): number | null {
  if (!cal.reliable || cal.multiplier == null) return null;
  return Math.round(estimateMin * cal.multiplier);
}

/* ------------------------------------------------------------------ *
 * The week's two lists
 * ------------------------------------------------------------------ */

/**
 * Five priorities per system, LIFE and EMPIRE side by side.
 *
 * `weekPriorities` in logic.ts answers "what matters this week" across
 * everything; this answers it *per machine*, because the week screen shows
 * the two operating systems as two columns and a merged list would hide
 * whichever system is quieter.
 *
 * Work with no area belongs to neither system and appears in neither list —
 * it is surfaced separately by the caller rather than being guessed into a
 * column it might not belong to.
 */
export function systemPriorities<
  T extends Pick<Task, "id" | "do_date" | "priority" | "status" | "title" | "pillar_id">
>(
  tasks: T[],
  pillars: Pick<Pillar, "id" | "system">[],
  week: string[],
  limit: number = PRIORITY_SLOTS_PER_SYSTEM
): { life: T[]; empire: T[]; unassigned: number } {
  const systemOf = new Map(pillars.map((p) => [p.id, p.system]));
  const PRI: Record<string, number> = { High: 0, Med: 1, Low: 2 };

  const inWeek = tasks
    .filter(isOpenWork)
    .filter((t) => t.do_date != null && week.includes(t.do_date));

  const rank = (a: T, b: T) => {
    const ap = PRI[a.priority] ?? 1;
    const bp = PRI[b.priority] ?? 1;
    if (ap !== bp) return ap - bp;
    const ad = a.do_date ?? "9999-12-31";
    const bd = b.do_date ?? "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.title.localeCompare(b.title);
  };

  const bySystem = (sys: SystemKey) =>
    inWeek
      .filter((t) => t.pillar_id != null && systemOf.get(t.pillar_id) === sys)
      .sort(rank)
      .slice(0, limit);

  const unassigned = inWeek.filter(
    (t) => t.pillar_id == null || !systemOf.has(t.pillar_id)
  ).length;

  return { life: bySystem("life"), empire: bySystem("empire"), unassigned };
}
