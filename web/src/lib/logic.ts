/**
 * Pure logic for THE BRAIN.
 *
 * Everything here is a pure function over plain data — no Supabase, no React,
 * no dates-from-the-ambient-clock unless passed in. That is deliberate: it means
 * the rules that decide what you see can be tested without a database or a browser,
 * and a regression in "which tasks land on Thursday" gets caught by `npm test`
 * rather than by you, on a Thursday.
 */

import {
  type Goal,
  type ItemStatus,
  type MetricReading,
  type Pillar,
  type Priority,
  type Project,
  type SystemKey,
  type Task,
  type TaskStatus,
  type Venture,
  type VentureStage,
  type Vehicle,
  type VehicleDateKey,
  type DeadlineState,
  type Debt,
  type DebtPayment,
  type Note,
  type Habit,
  type HabitLog,
  type HourPurpose,
  type Obstacle,
  type Review,
  type Mode,
  type Asset,
  type ComplianceKind,
  type ComplianceQuestion,
  type OnboardStepKey,
  VENTURE_STAGES,
  ONBOARD_STEPS,
  ONBOARDED_AT_KEY,
  STAGE_CONFIRMED_KEY,
  COMPLIANCE_KEY,
  COMPLIANCE_QUESTIONS,
  VEHICLE_DATE_KEYS,
  DUE_SOON_DAYS,
  PAYMENTS_PER_YEAR,
  HOUR_PURPOSES,
  OBSTACLES,
  OBSTACLE_LABEL,
} from "./types";

/* ------------------------------------------------------------------ *
 * Kanban
 * ------------------------------------------------------------------ */

/** The three lanes, in order. Index position is what "move right" means. */
export const LANE_ORDER: TaskStatus[] = ["open", "doing", "done"];

/**
 * Where a task lands when nudged along the board.
 * Clamps at both ends — you cannot move left off "To Do" or right off "Done".
 */
export function nextStatus(current: TaskStatus, dir: 1 | -1): TaskStatus {
  const i = LANE_ORDER.indexOf(current);
  if (i === -1) return current; // dropped / waiting are not on the board
  const j = Math.max(0, Math.min(LANE_ORDER.length - 1, i + dir));
  return LANE_ORDER[j];
}

/** True when a task sits on the board at all (not dropped or waiting). */
export function isOnBoard(t: Pick<Task, "status">): boolean {
  return LANE_ORDER.includes(t.status);
}

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Med: 1, Low: 2 };

/**
 * High → Med → Low, stable within a priority so the underlying order
 * (newest first, from the query) is preserved. Returns a new array.
 */
export function sortByPriority<T extends Pick<Task, "priority">>(tasks: T[]): T[] {
  return [...tasks].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  );
}

/** Tasks in one lane, correctly ordered. */
export function laneTasks<T extends Pick<Task, "priority" | "status">>(
  tasks: T[],
  lane: TaskStatus
): T[] {
  return sortByPriority(tasks.filter((t) => t.status === lane));
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

/** ISO date (YYYY-MM-DD) in local time — not UTC, which shifts the day. */
export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The seven Monday-first ISO dates of the week containing `ref`. */
export function weekOf(ref: Date): string[] {
  const d = new Date(ref);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return toIso(x);
  });
}

/** The week `offset` weeks away from `ref`. Negative goes backwards. */
export function weekOffset(ref: Date, offset: number): string[] {
  const d = new Date(ref);
  d.setDate(d.getDate() + offset * 7);
  return weekOf(d);
}

/** Tasks scheduled on a given day. */
export function tasksOnDay<T extends Pick<Task, "do_date">>(
  tasks: T[],
  iso: string
): T[] {
  return tasks.filter((t) => t.do_date === iso);
}

/**
 * The unscheduled pool: anything with no `do_date`, or a `do_date` outside the
 * week on screen. The second half matters — a task parked three weeks out
 * should still be reachable when you're looking at this week.
 */
export function unscheduled<T extends Pick<Task, "do_date">>(
  tasks: T[],
  week: string[]
): T[] {
  return tasks.filter((t) => !t.do_date || !week.includes(t.do_date));
}

/* ------------------------------------------------------------------ *
 * Areas
 * ------------------------------------------------------------------ */

export type AreaCounts = { goals: number; projects: number; tasks: number };

/**
 * Roll goals / projects / open tasks up to their area.
 * Records with no area are ignored rather than bucketed into a phantom "none",
 * because the dashboard only renders real areas.
 */
export function countsByPillar(
  goals: { pillar_id: string | null }[],
  projects: { pillar_id: string | null }[],
  tasks: { pillar_id: string | null }[]
): Record<string, AreaCounts> {
  const out: Record<string, AreaCounts> = {};
  const bump = (id: string | null, key: keyof AreaCounts) => {
    if (!id) return;
    out[id] ??= { goals: 0, projects: 0, tasks: 0 };
    out[id][key] += 1;
  };
  goals.forEach((g) => bump(g.pillar_id, "goals"));
  projects.forEach((p) => bump(p.pillar_id, "projects"));
  tasks.forEach((t) => bump(t.pillar_id, "tasks"));
  return out;
}

/** An area nothing has been hung off yet — surfaced as "untouched" in the UI. */
export function isUntouched(c: AreaCounts | undefined): boolean {
  if (!c) return true;
  return c.goals === 0 && c.projects === 0 && c.tasks === 0;
}

/** Areas belonging to one subsystem, in their configured order. */
/* ------------------------------------------------------------------ *
 * Modes — LIFE_OS and EMPIRE_OS as two systems
 *
 * Jay asked for a switch, not a filter: "Each has its own operating
 * system. Separate them into 2 separate systems within THE BRAIN."
 * `brain` is the neutral position that shows both.
 * ------------------------------------------------------------------ */

/** The system a mode scopes to. `brain` scopes to neither — it reads both. */
export function systemForMode(mode: Mode): SystemKey | null {
  return mode === "brain" ? null : mode;
}

/** Anything not one of the three falls back to the neutral position. */
export function normaliseMode(raw: string | null | undefined): Mode {
  return raw === "life" || raw === "empire" || raw === "brain" ? raw : "brain";
}

/**
 * Selecting the mode you are already in returns you to the command centre.
 * One control, two directions — the button is a toggle, not a radio.
 */
export function toggleMode(current: Mode, pressed: SystemKey): Mode {
  return current === pressed ? "brain" : pressed;
}

/** The top-bar items for a mode, in registry order. */
export function navForMode<T extends { modes: Mode[] }>(
  items: T[],
  mode: Mode
): T[] {
  return items.filter((i) => i.modes.includes(mode));
}

/** The five-column phone bar for a mode, in registry order. */
export function phoneNavForMode<T extends { phoneModes: Mode[] }>(
  items: T[],
  mode: Mode
): T[] {
  return items.filter((i) => i.phoneModes.includes(mode));
}

/**
 * The areas a mode shows: its own system's, or all thirteen in `brain`.
 * The command centre reads over both systems (§A2), so it does not filter.
 */
export function pillarsForMode(pillars: Pillar[], mode: Mode): Pillar[] {
  const system = systemForMode(mode);
  return system == null ? pillars : areasFor(pillars, system);
}

export function areasFor(pillars: Pillar[], system: SystemKey): Pillar[] {
  return pillars
    .filter((p) => p.system === system && p.active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */

/**
 * A captured thought becomes a task title (trimmed to a sane length) or a note
 * (title = first line, body = everything). Splitting on the first newline is
 * what makes a pasted paragraph produce a readable title instead of a wall.
 */
export function noteFromCapture(raw: string): { title: string; body: string } {
  const text = raw.trim();
  const firstLine = text.split("\n")[0].trim();
  // Cap is inclusive of the ellipsis, so the result is never longer than 120.
  const title = firstLine.length > 120 ? firstLine.slice(0, 119) + "…" : firstLine;
  return { title: title || "(untitled)", body: text };
}

export function taskTitleFromCapture(raw: string): string {
  const text = raw.trim().split("\n")[0].trim();
  // Cap is inclusive of the ellipsis — `tasks.title` is rendered in one line.
  return text.length > 300 ? text.slice(0, 299) + "…" : text;
}

/* ------------------------------------------------------------------ *
 * The cascade — Goals → Projects → Tasks
 *
 * Decision 2 makes every level above a task optional. So every function
 * here treats a missing parent as ordinary, never as an error: a project
 * with no goal is a project, and a goal with no area still counts.
 * ------------------------------------------------------------------ */

/** Live work only. Paused, done and dropped items stay out of the way. */
export function isLive<T extends { status: ItemStatus }>(x: T): boolean {
  return x.status === "active";
}

/**
 * Projects hanging off one goal. Pass `null` to get the unattached ones —
 * that is a real, first-class view, not a leftovers bucket.
 */
export function projectsForGoal<T extends Pick<Project, "goal_id">>(
  projects: T[],
  goalId: string | null
): T[] {
  return projects.filter((p) => p.goal_id === goalId);
}

/** Tasks belonging to one project. */
export function tasksForProject<T extends { project_id?: string | null }>(
  tasks: T[],
  projectId: string
): T[] {
  return tasks.filter((t) => t.project_id === projectId);
}

/**
 * How far along a project is, by its tasks: done ÷ counted, as 0–100.
 *
 * Dropped tasks leave the denominator entirely — abandoning work should not
 * drag a project's percentage down, or you get punished for cutting scope.
 * A project with nothing counted returns null, not 0: "no tasks yet" and
 * "none of the tasks are done" are different states and the UI says so.
 */
export function projectProgress<T extends Pick<Task, "status">>(
  tasks: T[]
): number | null {
  const counted = tasks.filter((t) => t.status !== "dropped");
  if (counted.length === 0) return null;
  const done = counted.filter((t) => t.status === "done").length;
  return Math.round((done / counted.length) * 100);
}

/**
 * What you SAY your progress is. `goals.progress` is NOT NULL with default 0,
 * so this is always a number — it can never encode "work it out for me".
 */
export function statedProgress(goal: Pick<Goal, "progress">): number {
  return clampPercent(goal.progress);
}

/**
 * What the WORK says: the mean of the projects that have measurable progress.
 * Null when nothing underneath is measurable — which is not the same as 0.
 */
export function derivedProgress(projectPercents: (number | null)[]): number | null {
  const known = projectPercents.filter((n): n is number => n != null);
  if (known.length === 0) return null;
  return Math.round(known.reduce((a, b) => a + b, 0) / known.length);
}

/** Gap wide enough to be worth surfacing rather than nagging about. */
export const PROGRESS_DRIFT = 15;

/**
 * True when your stated progress and the underlying work disagree materially.
 * This is the honest-list mechanism: a goal sitting at 80% while its projects
 * sit at 20% is the thing you most need shown to you.
 */
export function progressDrifts(
  stated: number,
  derived: number | null,
  threshold: number = PROGRESS_DRIFT
): boolean {
  if (derived == null) return false;
  return Math.abs(stated - derived) >= threshold;
}

/** Percentages are 0–100. Out-of-range stored values are clamped, not trusted. */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Overdue = a target date strictly before today, and still live.
 * Finished work is never overdue, however late it was.
 */
export function isOverdue(
  item: { target_date?: string | null; due_date?: string | null; status: ItemStatus },
  todayIso: string
): boolean {
  if (item.status !== "active") return false;
  const d = item.target_date ?? item.due_date ?? null;
  return d != null && d < todayIso;
}

/** Whole days until the date. Negative when past. Null when there is no date. */
export function daysUntil(dateIso: string | null, todayIso: string): number | null {
  if (!dateIso) return null;
  const ms = Date.parse(dateIso + "T00:00:00") - Date.parse(todayIso + "T00:00:00");
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / 86_400_000);
}

/**
 * Goals ordered the way you should read them: overdue first, then soonest
 * target, then undated. Undated goals sink rather than sorting as year zero.
 */
export function sortGoals<T extends Pick<Goal, "target_date" | "status">>(
  goals: T[],
  todayIso: string
): T[] {
  return [...goals].sort((a, b) => {
    const ao = isOverdue(a, todayIso) ? 0 : 1;
    const bo = isOverdue(b, todayIso) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (!a.target_date && !b.target_date) return 0;
    if (!a.target_date) return 1;
    if (!b.target_date) return -1;
    return a.target_date.localeCompare(b.target_date);
  });
}

/**
 * Goals grouped under their area, plus the ones with no area under `null`.
 * Keyed by pillar id so a caller can render in pillar order without a lookup.
 */
export function goalsByPillar<T extends Pick<Goal, "pillar_id">>(
  goals: T[]
): Map<string | null, T[]> {
  const out = new Map<string | null, T[]>();
  for (const g of goals) {
    const key = g.pillar_id ?? null;
    out.set(key, [...(out.get(key) ?? []), g]);
  }
  return out;
}

/**
 * What a goal is actually made of. Returns the goal's live projects, its
 * rolled-up progress, and whether it has run past its target date — the three
 * things the UI needs to render one row without three more passes over the data.
 */
export function goalRollup<
  G extends Pick<Goal, "progress" | "target_date" | "status">,
  P extends Pick<Project, "goal_id" | "status"> & { id: string }
>(
  goal: G & { id: string },
  projects: P[],
  tasksByProject: (projectId: string) => Pick<Task, "status">[],
  todayIso: string
): {
  projects: P[];
  stated: number;
  derived: number | null;
  drifts: boolean;
  overdue: boolean;
} {
  const mine = projectsForGoal(projects, goal.id).filter(isLive);
  const percents = mine.map((p) => projectProgress(tasksByProject(p.id)));
  const stated = statedProgress(goal);
  const derived = derivedProgress(percents);
  return {
    projects: mine,
    stated,
    derived,
    drifts: progressDrifts(stated, derived),
    overdue: isOverdue(goal, todayIso),
  };
}

/* ------------------------------------------------------------------ *
 * Calendar maths
 *
 * Everything below takes ISO date strings, not Dates, and builds its own
 * local-midnight Date when it needs one. Parsing "2026-08-01" directly is
 * UTC by spec, which puts anyone west of Greenwich on the previous day —
 * the exact class of bug that makes a dashboard show yesterday.
 * ------------------------------------------------------------------ */

/** Local midnight for an ISO date. Never `new Date(iso)` — that is UTC. */
function at(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** ISO date `n` days from `iso`. Negative goes backwards. */
export function addDays(iso: string, n: number): string {
  const d = at(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/**
 * ISO date `n` months from `iso`, clamped by the calendar.
 *
 * 31 January + 1 month is 28 February, not 3 March. JavaScript rolls the
 * overflow forward by default, which would push a goal due at the end of a
 * short month into the next bucket entirely.
 */
export function addMonths(iso: string, n: number): string {
  const d = at(iso);
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);
  if (d.getDate() !== day) d.setDate(0); // rolled over — pull back to month end
  return toIso(d);
}

/** ISO date `n` years from `iso`, clamped by the calendar (29 Feb → 28 Feb). */
export function addYears(iso: string, n: number): string {
  const d = at(iso);
  const day = d.getDate();
  d.setFullYear(d.getFullYear() + n);
  // setFullYear rolls 29 Feb into 1 Mar; pull it back to the month's last day.
  if (d.getDate() !== day) d.setDate(0);
  return toIso(d);
}

/** The Monday of the week containing `iso`. Weeks are Monday-first throughout. */
export function mondayOf(iso: string): string {
  const d = at(iso);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return toIso(d);
}

/** True when two dates fall in the same Monday-first week. */
export function sameWeek(a: string, b: string): boolean {
  return mondayOf(a) === mondayOf(b);
}

/**
 * ISO-8601 week number. The week containing the year's first Thursday is
 * week 1, which is why this cannot be `dayOfYear / 7` — around New Year the
 * two answers differ, and the header would quietly say the wrong week.
 */
export function isoWeekNumber(iso: string): number {
  const d = at(iso);
  // Shift to the Thursday of this week; its year is the ISO week-year.
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + 3);
  const thursday = d.getTime();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.round((thursday - jan1.getTime()) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

/** Calendar quarter, 1–4. */
export function quarterOf(iso: string): number {
  return Math.floor(at(iso).getMonth() / 3) + 1;
}

/** Last day of the quarter containing `iso`. */
export function endOfQuarter(iso: string): string {
  const d = at(iso);
  const lastMonth = quarterOf(iso) * 3; // 1-indexed month; day 0 = last of prev
  return toIso(new Date(d.getFullYear(), lastMonth, 0));
}

/** Last day of the year containing `iso`. */
export function endOfYear(iso: string): string {
  return `${at(iso).getFullYear()}-12-31`;
}

/**
 * "Friday 31.07" — the hero date, formatted without `toLocaleDateString`
 * so it renders identically on the server and in the browser. A hydration
 * mismatch on the first line of the page is not a small thing.
 */
export function formatDayLong(iso: string): string {
  const d = at(iso);
  return `${DAY_NAMES[d.getDay()]} ${iso.slice(8)}.${iso.slice(5, 7)}`;
}

/**
 * The weekly review lands on Sunday — the end of the Monday-first week, so
 * you review the week you just finished rather than one you are mid-way
 * through. Returns 0 on the day itself.
 */
export const REVIEW_WEEKDAY = 0; // Sunday, matching Date#getDay

export function daysUntilWeeklyReview(todayIso: string): number {
  const dow = at(todayIso).getDay();
  return (REVIEW_WEEKDAY - dow + 7) % 7;
}

/**
 * Which week the weekly review is *for*.
 *
 * Weeks run Monday-first, so Sunday is the last day of the current one:
 * reviewing on the day it lands means reviewing the week you are finishing.
 * On any other day you are reviewing late, and the week you just finished is
 * the previous one — which is what the form should open on, rather than
 * asking you to sum up a week that is still happening.
 */
export function reviewPeriod(todayIso: string): { start: string; end: string } {
  const thisMonday = mondayOf(todayIso);
  const isSunday = at(todayIso).getDay() === REVIEW_WEEKDAY;
  const start = isSunday ? thisMonday : addDays(thisMonday, -7);
  return { start, end: addDays(start, 6) };
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/**
 * GBP, or an em-dash when there is no figure.
 *
 * `null` renders `£—` and never `£0`, because "no income has arrived" and
 * "income was zero" are different facts and only one of them is something
 * you measured. A real zero still renders `£0` — that is a fact too.
 */
export function formatGBP(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "£—";
  const neg = n < 0;
  const whole = Math.round(Math.abs(n));
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "−" : ""}£${grouped}`;
}

/** A plain count that also refuses to flatter: null renders as an em-dash. */
export function formatCount(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : String(n);
}

/* ------------------------------------------------------------------ *
 * Metrics — a number that moves
 * ------------------------------------------------------------------ */

/**
 * The most recent reading, or null when the metric has never been read.
 * Null is what makes the tile show `£—` instead of inventing a zero.
 */
export function latestReading<T extends Pick<MetricReading, "taken_on" | "value">>(
  readings: T[]
): T | null {
  if (readings.length === 0) return null;
  return [...readings].sort((a, b) => b.taken_on.localeCompare(a.taken_on))[0];
}

/**
 * How much the metric has moved since the oldest reading inside the window.
 * Null when there is nothing to compare against — one reading is a value,
 * not a trend, and pretending otherwise would draw a line through one point.
 */
export function metricChange<T extends Pick<MetricReading, "taken_on" | "value">>(
  readings: T[],
  todayIso: string,
  windowDays: number
): number | null {
  const from = addDays(todayIso, -windowDays);
  const inWindow = readings.filter((r) => r.taken_on >= from);
  if (inWindow.length < 2) return null;
  const sorted = [...inWindow].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  return sorted[sorted.length - 1].value - sorted[0].value;
}

/* ------------------------------------------------------------------ *
 * Habits — the streak
 * ------------------------------------------------------------------ */

/**
 * Consecutive days up to today, counting back.
 *
 * A streak survives the day it has not happened *yet*: if the last log is
 * yesterday, the run is still alive and today is simply undecided. It dies
 * once a whole day passes with nothing logged. Anything else would either
 * break every streak at midnight or keep dead ones alive forever.
 */
export function currentStreak(doneOn: string[], todayIso: string): number {
  if (doneOn.length === 0) return 0;
  const days = new Set(doneOn);
  const startsToday = days.has(todayIso);
  if (!startsToday && !days.has(addDays(todayIso, -1))) return 0;

  let cursor = startsToday ? todayIso : addDays(todayIso, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Deadlines
 * ------------------------------------------------------------------ */

export const DUE_WINDOW_DAYS = 7;

/**
 * Deadlines you can still do something about: live items due on or before
 * `today + days`.
 *
 * Overdue items are deliberately included. A count called "due 7d" that
 * quietly drops the things already late would be the dashboard flattering
 * him, which is the one thing it must never do.
 */
export function dueWithin<
  T extends { due_date?: string | null; status: string }
>(items: T[], todayIso: string, days: number = DUE_WINDOW_DAYS): T[] {
  const horizon = addDays(todayIso, days);
  return items.filter(
    (i) =>
      (i.status === "open" || i.status === "doing" || i.status === "active") &&
      i.due_date != null &&
      i.due_date <= horizon
  );
}

/* ------------------------------------------------------------------ *
 * Life areas — worst first
 * ------------------------------------------------------------------ */

/** Scored at all? Zero counts; null does not. */
export function isScored(a: Pick<Pillar, "score">): boolean {
  return a.score != null;
}

/**
 * The ranking the dashboard is built on: worst score first.
 *
 * Unscored areas sort *after* every scored one, in their configured order,
 * rather than being treated as a zero. An area you have not looked at is
 * unknown, not failing — calling it the worst thing in your life because
 * you never rated it would put the wrong thing at the top of the page.
 */
export function rankAreasByNeed<T extends Pick<Pillar, "score" | "sort_order">>(
  areas: T[]
): T[] {
  return [...areas].sort((a, b) => {
    const as = a.score, bs = b.score;
    if (as == null && bs == null) return a.sort_order - b.sort_order;
    if (as == null) return 1;
    if (bs == null) return -1;
    if (as !== bs) return as - bs;
    return a.sort_order - b.sort_order;
  });
}

/**
 * Mean score across the areas that have one, to one decimal place.
 * Null when nothing has been scored — an average of no numbers is not 0.
 */
export function averageScore(areas: Pick<Pillar, "score">[]): number | null {
  const scored = areas.map((a) => a.score).filter((s): s is number => s != null);
  if (scored.length === 0) return null;
  const mean = scored.reduce((a, b) => a + b, 0) / scored.length;
  return Math.round(mean * 10) / 10;
}

/**
 * This week's declared focus, or null.
 *
 * Read from `focus_week`, never guessed from the scores. If nothing is
 * declared the dashboard says so rather than promoting the worst-scoring
 * area — a focus is a decision, and the system should not make it for him.
 * A focus set for a previous week is not this week's focus.
 */
export function focusArea<T extends Pick<Pillar, "focus_week">>(
  areas: T[],
  todayIso: string
): T | null {
  const monday = mondayOf(todayIso);
  return areas.find((a) => a.focus_week != null && mondayOf(a.focus_week) === monday) ?? null;
}

/** How full the bar is: score out of 10, as a percentage. Unscored → 0 width. */
export function scoreBarPercent(score: number | null | undefined): number {
  if (score == null) return 0;
  return clampPercent(score * 10);
}

/* ------------------------------------------------------------------ *
 * Today — the pick-three rule
 * ------------------------------------------------------------------ */

export const TODAY_LIMIT = 3;

/** Open work only. Done, dropped and waiting are not today's problem. */
export function isOpenWork<T extends Pick<Task, "status">>(t: T): boolean {
  return t.status === "open" || t.status === "doing";
}

/**
 * Why a task made it onto today's list. Lower is more urgent, and the
 * reason is returned alongside so the UI can say it out loud.
 */
export type TodayReason = "do-today" | "deadline" | "high" | "next";

export function todayReason(
  t: Pick<Task, "do_date" | "due_date" | "priority">,
  todayIso: string,
  days: number = DUE_WINDOW_DAYS
): TodayReason {
  if (t.do_date != null && t.do_date <= todayIso) return "do-today";
  if (t.due_date != null && t.due_date <= addDays(todayIso, days)) return "deadline";
  if (t.priority === "High") return "high";
  return "next";
}

const REASON_RANK: Record<TodayReason, number> = {
  "do-today": 0,
  deadline: 1,
  high: 2,
  next: 3,
};

const PRI_RANK: Record<Priority, number> = { High: 0, Med: 1, Low: 2 };

/**
 * Three things. Not the top three of a list of forty — three, and the count
 * of everything else stated plainly next to them.
 *
 * The whole dashboard is built to stop him scrolling his own life, so this
 * function is where that intention has to survive: it returns at most
 * `TODAY_LIMIT` items and nothing anywhere else re-expands it.
 */
export function pickThree<
  T extends Pick<Task, "do_date" | "due_date" | "priority" | "status" | "title">
>(tasks: T[], todayIso: string, limit: number = TODAY_LIMIT): T[] {
  return rankForToday(tasks, todayIso).slice(0, limit);
}

/**
 * The one ordering. Extracted so `pickThree` and `focusList` cannot drift:
 * the drawer's two are literally the next two of the same queue, not a
 * second opinion about what matters.
 */
export function rankForToday<
  T extends Pick<Task, "do_date" | "due_date" | "priority" | "status" | "title">
>(tasks: T[], todayIso: string): T[] {
  return [...tasks].filter(isOpenWork).sort((a, b) => {
    const ar = REASON_RANK[todayReason(a, todayIso)];
    const br = REASON_RANK[todayReason(b, todayIso)];
    if (ar !== br) return ar - br;
    const ap = PRI_RANK[a.priority] ?? 1;
    const bp = PRI_RANK[b.priority] ?? 1;
    if (ap !== bp) return ap - bp;
    const ad = a.do_date ?? a.due_date ?? "9999-12-31";
    const bd = b.do_date ?? b.due_date ?? "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.title.localeCompare(b.title);
  });
}

/* ------------------------------------------------------------------ *
 * Focus — three visible, two on deck
 * ------------------------------------------------------------------ */

/**
 * How many the drawer holds. Three plus two, and the two are a drawer for a
 * reason that matters more than it looks.
 *
 * `pickThree` exists to stop Jay scrolling his own life, and "just show five
 * then" would quietly undo it — five is a list, and a list is the thing the
 * dashboard was built to not be. But three with nothing behind them makes
 * the next decision invisible: finish one and you are back at a blank slot
 * with no idea what was queued.
 *
 * So the two are PLANNING SPACE, not more today. They are closed by default,
 * they are not counted by `todayProgress`, and they never render alongside
 * the three. Opening the drawer is a deliberate act that answers "and then
 * what?" — which is a different question from "what now?".
 */
export const FOCUS_VISIBLE = TODAY_LIMIT;
export const FOCUS_ON_DECK = 2;

export type FocusList<T> = {
  /** The three. Never more, whatever the drawer is doing. */
  visible: T[];
  /** The next two in the same queue. Behind a closed drawer. */
  onDeck: T[];
  /** Everything open, including the five above. The honest total. */
  openTotal: number;
  /** Open work beyond the five — what the drawer is NOT showing. */
  beyond: number;
};

export function focusList<
  T extends Pick<Task, "do_date" | "due_date" | "priority" | "status" | "title">
>(
  tasks: T[],
  todayIso: string,
  visible: number = FOCUS_VISIBLE,
  onDeck: number = FOCUS_ON_DECK
): FocusList<T> {
  const ranked = rankForToday(tasks, todayIso);
  return {
    visible: ranked.slice(0, visible),
    onDeck: ranked.slice(visible, visible + onDeck),
    openTotal: ranked.length,
    beyond: Math.max(0, ranked.length - visible - onDeck),
  };
}

/** How many are open in total — the honest number beside the three. */
export function openCount<T extends Pick<Task, "status">>(tasks: T[]): number {
  return tasks.filter(isOpenWork).length;
}

/** Of today's three, how many are finished. Drives the `TODAY 0/3` counter. */
export function todayProgress<T extends Pick<Task, "do_date" | "status">>(
  tasks: T[],
  todayIso: string,
  limit: number = TODAY_LIMIT
): { done: number; of: number } {
  const forToday = tasks.filter((t) => t.do_date === todayIso);
  const done = forToday.filter((t) => t.status === "done").length;
  return { done, of: Math.max(limit, forToday.length) };
}

/* ------------------------------------------------------------------ *
 * THE BRAIN — four tabs
 * ------------------------------------------------------------------ */

/**
 * The command centre asks four questions, and a tab exists only if it
 * answers one the other three cannot. That rule is the whole design: the
 * v1 dashboard was one column of eleven panels, so "what am I doing next"
 * and "what is going wrong" and "am I getting better" all arrived at once
 * and none of them got answered.
 *
 *   now       what am I doing next?      focus, capture, today
 *   attention what is going wrong?       the watchtower, worst first
 *   systems   how are LIFE and EMPIRE?   two panels, as doorways
 *   trend     am I getting better?       the ONLY backward look
 *
 * `trend` being the only backward look is what keeps the other three from
 * filling with history. A streak bar is interesting; it is not a decision,
 * and it does not belong beside the three things he is about to do.
 */
export const BRAIN_TABS = ["now", "attention", "systems", "trend"] as const;
export type BrainTab = (typeof BRAIN_TABS)[number];

export const BRAIN_TAB_LABEL: Record<BrainTab, string> = {
  now: "Now",
  attention: "Attention",
  systems: "Systems",
  trend: "Trend",
};

/** The question each tab exists to answer, shown under the tab bar. */
export const BRAIN_TAB_QUESTION: Record<BrainTab, string> = {
  now: "What am I doing next?",
  attention: "What is going wrong?",
  systems: "How are LIFE and EMPIRE doing?",
  trend: "Am I getting better?",
};

/**
 * The tab lives in the URL, not in React state, so the page stays a Server
 * Component and a link into `?tab=attention` lands where it says it does.
 * Anything unrecognised falls back to `now` rather than rendering nothing —
 * a mistyped tab should show him his day, not an empty page.
 */
export function normaliseTab(raw: string | string[] | null | undefined): BrainTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (BRAIN_TABS as readonly string[]).includes(v ?? "") ? (v as BrainTab) : "now";
}

/* ------------------------------------------------------------------ *
 * This week's priorities (EMPIRE_OS)
 * ------------------------------------------------------------------ */

export const PRIORITY_SLOTS = 4;

/**
 * The handful of things that actually matter this week: high-priority work
 * he has already committed to a day inside the current week.
 *
 * Priority alone is not enough — a High task with no day is an intention.
 * Requiring `do_date` in the week is what makes this list a plan.
 */
export function weekPriorities<
  T extends Pick<Task, "do_date" | "priority" | "status" | "title">
>(tasks: T[], week: string[], limit: number = PRIORITY_SLOTS): T[] {
  return tasks
    .filter(isOpenWork)
    .filter((t) => t.priority === "High")
    .filter((t) => t.do_date != null && week.includes(t.do_date))
    .sort((a, b) =>
      a.do_date === b.do_date
        ? a.title.localeCompare(b.title)
        : (a.do_date ?? "").localeCompare(b.do_date ?? "")
    )
    .slice(0, limit);
}

/** `01`, `02`, … — the numbering on the priorities panel. */
export function slotLabel(i: number): string {
  return String(i + 1).padStart(2, "0");
}

/* ------------------------------------------------------------------ *
 * Goals across horizons
 * ------------------------------------------------------------------ */

/**
 * THE TWO SYSTEMS USE DIFFERENT SCALES. This is deliberate, settled with
 * Jay, and must not be "fixed" into one list.
 *
 *   LIFE_OS    month · 6 month · annual · 5 year · 10 year
 *   EMPIRE_OS  quarter · year · 5 year · 20 year
 *
 * A life runs on personal rhythms, so its scale is a rolling window from
 * today — "six months from now", not "the end of H2". A business runs on
 * reporting periods, so EMPIRE keeps calendar quarters and calendar years.
 * That is why `month`/`six` measure forward from today while `quarter`
 * closes at the quarter end.
 *
 * The 20-year horizon is EMPIRE-only and load-bearing: the £100M objective
 * anchors the CEO dashboard and must survive any edit here.
 */
export type Horizon =
  | "month"
  | "six"
  | "quarter"
  | "year"
  | "five"
  | "ten"
  | "twenty"
  | "someday";

/** LIFE_OS, nearest first. `someday` is the bucket list — see `isSomeday`. */
export const LIFE_HORIZONS: Horizon[] = [
  "month",
  "six",
  "year",
  "five",
  "ten",
  "someday",
];

/** EMPIRE_OS, nearest first. Unchanged, and deliberately so. */
export const EMPIRE_HORIZONS: Horizon[] = ["quarter", "year", "five", "twenty"];

/** Every horizon either scale uses, for exhaustive record keys. */
export const ALL_HORIZONS: Horizon[] = [
  "month",
  "six",
  "quarter",
  "year",
  "five",
  "ten",
  "twenty",
  "someday",
];

export function horizonsFor(system: SystemKey): Horizon[] {
  return system === "life" ? LIFE_HORIZONS : EMPIRE_HORIZONS;
}

export const HORIZON_LABEL: Record<Horizon, string> = {
  month: "This month",
  six: "Six months",
  quarter: "This quarter",
  year: "This year",
  five: "5 years",
  ten: "10 years",
  twenty: "20 years",
  someday: "Someday",
};

/* ------------------------------------------------------------------ *
 * The bucket list
 *
 * Not a table. A bucket-list item is a goal with no date and no plan,
 * carried as `goals.status = 'someday'`. Keeping it in `goals` is the whole
 * point: promoting one into a real goal is a single field change, and that
 * promotion moment is why a bucket list belongs in a life OS rather than in
 * a notes app.
 * ------------------------------------------------------------------ */

export const SOMEDAY_STATUS = "someday";

export function isSomeday<T extends { status: string }>(goal: T): boolean {
  return goal.status === SOMEDAY_STATUS;
}

/**
 * The goals LIFE_OS shows.
 *
 * Three kinds, and the third is the one that matters: goals filed against a
 * life area, every bucket-list item, and every goal with **no area at all**.
 *
 * That last rule exists because of a bug caught on the live page. Promoting
 * a bucket-list item is a single status change, so the promoted goal has no
 * area — and requiring one made it vanish from `/life` at the exact moment
 * the promotion succeeded. A goal nobody has filed is personal until it is
 * told otherwise; EMPIRE goals are the ones deliberately filed to a business
 * area.
 */
export function lifeGoalsFor<T extends Pick<Goal, "pillar_id" | "status">>(
  goals: T[],
  lifeAreaIds: Set<string>
): T[] {
  return goals.filter(
    (g) =>
      isSomeday(g) || g.pillar_id == null || lifeAreaIds.has(g.pillar_id)
  );
}

/** Bucket-list items, newest intent first by title for a stable order. */
export function somedayGoals<T extends Pick<Goal, "status" | "title">>(
  goals: T[]
): T[] {
  return goals.filter(isSomeday).sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Which column a goal belongs in, on its system's scale.
 *
 * The boundary discipline, unchanged from the single-scale version and now
 * enforced on both:
 *
 * - Every dated goal lands in exactly one bucket. The comparisons are
 *   ordered nearest-first and each is `<=`, so no date can match two.
 * - An overdue goal reads as the *nearest* horizon, never one that has
 *   already passed. A date you have missed is the most immediate thing
 *   there is, so it buckets into `month` / `quarter` rather than falling off
 *   the board or being filed under twenty years.
 * - An undated goal returns null. A goal with no date is not a ten-year
 *   goal, it is an undecided one, and inventing a deadline for it would be
 *   the system putting words in his mouth.
 * - A `someday` goal is the bucket list and returns `someday` whatever its
 *   date, because a bucket-list item that has acquired a date has not been
 *   promoted yet — the status is the promotion, not the date.
 */
export function goalHorizon(
  goal: Pick<Goal, "target_date" | "status">,
  todayIso: string,
  system: SystemKey
): Horizon | null {
  if (isSomeday(goal)) return "someday";
  const target = goal.target_date;
  if (!target) return null;

  if (system === "life") {
    if (target <= addMonths(todayIso, 1)) return "month";
    if (target <= addMonths(todayIso, 6)) return "six";
    if (target <= addYears(todayIso, 1)) return "year";
    if (target <= addYears(todayIso, 5)) return "five";
    return "ten";
  }

  if (target <= endOfQuarter(todayIso)) return "quarter";
  if (target <= endOfYear(todayIso)) return "year";
  if (target <= addYears(todayIso, 5)) return "five";
  return "twenty";
}

/**
 * Goals bucketed onto their system's scale.
 *
 * `someday` items are included on the LIFE scale and excluded from EMPIRE's,
 * which has no such bucket — so on EMPIRE they are returned in `excluded`
 * rather than silently dropped. Nothing Jay has written should vanish
 * because of which mode he happens to be in.
 */
export function bucketGoalsByHorizon<
  T extends Pick<Goal, "target_date" | "status">
>(
  goals: T[],
  todayIso: string,
  system: SystemKey
): { buckets: Record<Horizon, T[]>; undated: T[]; excluded: T[] } {
  const scale = horizonsFor(system);
  // Every horizon gets a key, not just this system's, so the returned
  // Record is honest: indexing an off-scale bucket gives an empty list
  // rather than undefined behind a type that promised an array.
  const buckets = Object.fromEntries(
    ALL_HORIZONS.map((h) => [h, [] as T[]])
  ) as Record<Horizon, T[]>;

  const undated: T[] = [];
  const excluded: T[] = [];

  for (const g of goals) {
    const someday = isSomeday(g);
    // Paused, done and dropped goals stay out of the way; someday is not
    // "not live", it is a different kind of live.
    if (!someday && !isLive(g)) continue;

    const h = goalHorizon(g, todayIso, system);
    if (h == null) undated.push(g);
    else if (!scale.includes(h)) excluded.push(g);
    else buckets[h].push(g);
  }
  for (const h of scale) {
    buckets[h] = sortGoals(buckets[h], todayIso);
  }
  return { buckets, undated, excluded };
}

/* ------------------------------------------------------------------ *
 * Ventures — the path to revenue
 * ------------------------------------------------------------------ */

/**
 * What each stage is worth before anyone claims anything. These are not
 * arbitrary: reaching a stage *is* progress, so a venture that has got as
 * far as launch reads at 70 whether or not Jay has ever touched a slider.
 */
export const STAGE_BASELINE: Record<VentureStage, number> = {
  idea: 10,
  research: 30,
  stabilise: 50,
  launch: 70,
  revenue: 100,
};

/** Live means `status === 'active'`. Everything else is shelved. */
export function isShelved(v: Pick<Venture, "status">): boolean {
  return v.status !== "active";
}

/**
 * The baseline a venture reads at from its stage alone.
 *
 * A shelved venture reads at half: it has the same idea behind it, but
 * nobody is moving it. That halving is where the backlog's 5% comes from —
 * an idea (10) that nobody is working on (÷2).
 */
export function ventureBaseline(
  v: Pick<Venture, "stage" | "status">
): number {
  const base = STAGE_BASELINE[v.stage] ?? 0;
  return isShelved(v) ? Math.round(base / 2) : base;
}

/**
 * Stated vs derived, kept apart exactly as `/goals` keeps them.
 *
 * `ventures.progress` is NOT NULL default 0, so it can never encode "work it
 * out for me". Zero therefore means untouched and the baseline is shown; any
 * positive number is a claim Jay made, and it wins. When the two disagree by
 * PROGRESS_DRIFT or more the UI says so out loud rather than picking a side.
 */
export function ventureRollup(v: Pick<Venture, "stage" | "status" | "progress">): {
  stated: number | null;
  derived: number;
  shown: number;
  drifts: boolean;
} {
  const derived = ventureBaseline(v);
  const raw = clampPercent(v.progress);
  const stated = raw > 0 ? raw : null;
  return {
    stated,
    derived,
    shown: stated ?? derived,
    drifts: stated != null && progressDrifts(stated, derived),
  };
}

/** Ventures being worked on: live, and not yet earning. */
export function inDevelopment<T extends Pick<Venture, "status" | "stage">>(
  ventures: T[]
): T[] {
  return ventures.filter((v) => !isShelved(v) && v.stage !== "revenue");
}

/** The parked ideas. Named, counted, and not pretended into the pipeline. */
export function backlog<T extends Pick<Venture, "status">>(ventures: T[]): T[] {
  return ventures.filter(isShelved);
}

/** Live ventures in board order, shelved ones after them. */
export function sortVentures<
  T extends Pick<Venture, "status" | "stage" | "sort_order">
>(ventures: T[]): T[] {
  return [...ventures].sort((a, b) => {
    const as = isShelved(a) ? 1 : 0;
    const bs = isShelved(b) ? 1 : 0;
    if (as !== bs) return as - bs;
    const ai = VENTURE_STAGES.indexOf(a.stage);
    const bi = VENTURE_STAGES.indexOf(b.stage);
    if (ai !== bi) return bi - ai; // furthest along first
    return a.sort_order - b.sort_order;
  });
}

/* ------------------------------------------------------------------ *
 * The Command Centre — Jay's THE BRAIN design, over real data
 * ------------------------------------------------------------------ */

/**
 * Greeting by hour, from Jay's prototype. Passed the hour rather than
 * reading the clock so it is testable and so server and client agree.
 */
export function greetingFor(hour: number): { word: string; emoji: string } {
  if (hour < 5) return { word: "Still up", emoji: "🌙" };
  if (hour < 12) return { word: "Good morning", emoji: "☀️" };
  if (hour < 18) return { word: "Good afternoon", emoji: "🌤" };
  return { word: "Good evening", emoji: "🌘" };
}

/** What the watchtower is shouting about. Lower rank = louder. */
export type AlertKind = "overdue" | "due" | "person" | "birthday" | "drift" | "unscored";

export type WatchAlert = {
  kind: AlertKind;
  label: string;
  text: string;
  href: string;
};

const ALERT_RANK: Record<AlertKind, number> = {
  overdue: 0,
  due: 1,
  birthday: 2,
  person: 3,
  drift: 4,
  unscored: 5,
};

export const ALERT_TONE: Record<AlertKind, string> = {
  overdue: "var(--bad)",
  due: "var(--warn)",
  birthday: "var(--accent)",
  person: "var(--accent)",
  drift: "var(--warn)",
  unscored: "var(--faint)",
};

/**
 * Everything quietly going wrong, in one list, worst first.
 *
 * This is the panel that earns the system its keep: it is assembled from
 * facts already in the database rather than from anything Jay has to
 * remember to enter. An empty watchtower is a real state and means exactly
 * what it says — nothing is slipping.
 */
export function watchtowerAlerts(input: {
  tasks: Pick<Task, "id" | "title" | "due_date" | "status">[];
  people: {
    id: string;
    name: string;
    last_contact: string | null;
    cadence_days: number | null;
    birthday: string | null;
  }[];
  ventures: (Pick<Venture, "id" | "name" | "stage" | "status" | "progress">)[];
  pillars: Pick<Pillar, "id" | "name" | "score">[];
  todayIso: string;
  dueDays?: number;
}): WatchAlert[] {
  const { tasks, people, ventures, pillars, todayIso } = input;
  const dueDays = input.dueDays ?? DUE_WINDOW_DAYS;
  const out: WatchAlert[] = [];

  for (const t of tasks) {
    if (!isOpenWork(t) || !t.due_date) continue;
    const days = daysUntil(t.due_date, todayIso);
    if (days == null) continue;
    if (days < 0) {
      out.push({
        kind: "overdue",
        label: "OVERDUE",
        text: `${t.title} — ${Math.abs(days)}d late`,
        href: "/planner",
      });
    } else if (days <= dueDays) {
      out.push({
        kind: "due",
        label: days === 0 ? "TODAY" : `${days}D`,
        text: t.title,
        href: "/planner",
      });
    }
  }

  for (const p of people) {
    // The highest-value insight in the schema: you said 14 days, it's been 47.
    if (p.cadence_days != null && p.last_contact) {
      const since = -(daysUntil(p.last_contact, todayIso) ?? 0);
      if (since > p.cadence_days) {
        out.push({
          kind: "person",
          label: "TOUCH BASE",
          text: `${p.name} — ${since}d since you spoke, you said ${p.cadence_days}`,
          href: "/family",
        });
      }
    }
    if (p.birthday) {
      const d = daysUntilBirthday(p.birthday, todayIso);
      if (d != null && d <= 14) {
        out.push({
          kind: "birthday",
          label: d === 0 ? "TODAY" : `${d}D`,
          text: `${p.name}'s birthday`,
          href: "/family",
        });
      }
    }
  }

  for (const v of ventures) {
    const r = ventureRollup(v);
    if (r.drifts && r.stated != null) {
      out.push({
        kind: "drift",
        label: "DRIFT",
        text: `${v.name} — you say ${r.stated}%, its stage says ${r.derived}%`,
        href: "/empire",
      });
    }
  }

  const unscored = pillars.filter((p) => p.score == null).length;
  if (unscored > 0 && unscored < pillars.length) {
    out.push({
      kind: "unscored",
      label: "UNSCORED",
      text: `${unscored} area${unscored === 1 ? "" : "s"} not scored — the ranking is incomplete`,
      href: "/life",
    });
  }

  return out.sort((a, b) => ALERT_RANK[a.kind] - ALERT_RANK[b.kind]);
}

/**
 * Days until the next occurrence of a birthday, ignoring the birth year.
 * Returns 0 on the day itself. Null when the date cannot be read.
 */
export function daysUntilBirthday(
  birthday: string,
  todayIso: string
): number | null {
  const bd = birthday.slice(5); // MM-DD
  if (!/^\d{2}-\d{2}$/.test(bd)) return null;
  const year = Number(todayIso.slice(0, 4));
  const thisYear = `${year}-${bd}`;
  if (thisYear >= todayIso) return daysUntil(thisYear, todayIso);
  return daysUntil(`${year + 1}-${bd}`, todayIso);
}

/**
 * The last `days` days as booleans, oldest first — the 14 little bars on
 * the productivity panel. Today is the final bar, so the row reads
 * left-to-right as history arriving at now.
 */
export function streakHistory(
  doneOn: string[],
  todayIso: string,
  days: number = 14
): boolean[] {
  const set = new Set(doneOn);
  return Array.from({ length: days }, (_, i) =>
    set.has(addDays(todayIso, -(days - 1 - i)))
  );
}

/**
 * Open tasks split by subsystem, for the LIFE vs EMPIRE bar. Tasks with no
 * area count as neither: they are real work, but they have not been told
 * which life they belong to, and guessing would make the bar a fiction.
 */
export function taskSplit(
  tasks: Pick<Task, "pillar_id" | "status">[],
  pillars: Pick<Pillar, "id" | "system">[]
): { life: number; empire: number; unassigned: number; done: number } {
  const systemOf = new Map(pillars.map((p) => [p.id, p.system]));
  let life = 0,
    empire = 0,
    unassigned = 0,
    done = 0;
  for (const t of tasks) {
    if (t.status === "done") {
      done += 1;
      continue;
    }
    if (!isOpenWork(t)) continue;
    const sys = t.pillar_id ? systemOf.get(t.pillar_id) : undefined;
    if (sys === "life") life += 1;
    else if (sys === "empire") empire += 1;
    else unassigned += 1;
  }
  return { life, empire, unassigned, done };
}

/**
 * Habit consistency over a window: logs landed ÷ logs possible, as 0–100.
 * Null when there are no active habits — a percentage of nothing is not 0,
 * and the ring should say so rather than showing a damning empty circle.
 */
export function habitConsistency(
  habitIds: string[],
  logs: { habit_id: string; done_on: string }[],
  todayIso: string,
  days: number = 7
): number | null {
  if (habitIds.length === 0) return null;
  const from = addDays(todayIso, -(days - 1));
  const ids = new Set(habitIds);
  const hit = new Set(
    logs
      .filter((l) => ids.has(l.habit_id) && l.done_on >= from && l.done_on <= todayIso)
      .map((l) => `${l.habit_id}|${l.done_on}`)
  );
  return clampPercent((hit.size / (habitIds.length * days)) * 100);
}

/**
 * How much of the debt is cleared: from the highest reading ever recorded
 * down to the latest. Null until there are two readings — with one point
 * there is no "cleared", only a balance.
 */
export function debtCleared(
  readings: Pick<MetricReading, "taken_on" | "value">[]
): { peak: number; latest: number; percent: number } | null {
  if (readings.length < 2) return null;
  const latest = latestReading(readings);
  if (!latest) return null;
  const peak = Math.max(...readings.map((r) => r.value));
  if (peak <= 0) return null;
  return {
    peak,
    latest: latest.value,
    percent: clampPercent(((peak - latest.value) / peak) * 100),
  };
}

/**
 * Net monthly cash from assets: what they earn minus what they cost.
 * Null when no asset carries either figure — see formatGBP on why that is
 * a dash and not a zero.
 */
export function cashThisMonth(
  assets: { income_monthly: number | null; cost_monthly: number | null; status: string }[]
): number | null {
  const live = assets.filter((a) => a.status === "active");
  const known = live.filter(
    (a) => a.income_monthly != null || a.cost_monthly != null
  );
  if (known.length === 0) return null;
  return known.reduce(
    (sum, a) => sum + (a.income_monthly ?? 0) - (a.cost_monthly ?? 0),
    0
  );
}

export type VentureCounts = { projects: number; tasks: number };

/**
 * Projects and open tasks per venture. Tasks reach a venture through their
 * project — there is no `tasks.venture_id`, and inventing one would give a
 * task two parents that could disagree.
 */
export function countsByVenture(
  projects: { id: string; venture_id?: string | null }[],
  tasks: { project_id?: string | null; status: string }[]
): Record<string, VentureCounts> {
  const ventureOfProject = new Map<string, string>();
  const out: Record<string, VentureCounts> = {};

  for (const p of projects) {
    if (!p.venture_id) continue;
    ventureOfProject.set(p.id, p.venture_id);
    out[p.venture_id] ??= { projects: 0, tasks: 0 };
    out[p.venture_id].projects += 1;
  }
  for (const t of tasks) {
    if (!t.project_id || !isOpenWork(t as Pick<Task, "status">)) continue;
    const v = ventureOfProject.get(t.project_id);
    if (!v) continue;
    out[v] ??= { projects: 0, tasks: 0 };
    out[v].tasks += 1;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * LIFE_OS — vehicles
 *
 * Every function here treats a missing date as *unknown*, never as safe and
 * never as late. That distinction is the whole feature: a reminder system you
 * cannot trust is worse than no reminder system, and the fastest way to lose
 * that trust is to shout "OVERDUE" about a date nobody ever entered.
 * ------------------------------------------------------------------ */

export type Deadline = {
  key: VehicleDateKey;
  date: string | null;
  days: number | null;
  state: DeadlineState;
};

/** Where one dated obligation stands today. */
export function deadlineState(
  date: string | null,
  todayIso: string,
  dueSoonDays: number = DUE_SOON_DAYS
): DeadlineState {
  const days = daysUntil(date, todayIso);
  if (days == null) return "not_recorded";
  if (days < 0) return "overdue";
  if (days <= dueSoonDays) return "due_soon";
  return "ok";
}

/** All four obligations for one vehicle, in a fixed order. */
export function vehicleDeadlines(
  vehicle: Pick<Vehicle, VehicleDateKey>,
  todayIso: string,
  dueSoonDays: number = DUE_SOON_DAYS
): Deadline[] {
  return VEHICLE_DATE_KEYS.map((key) => {
    const date = vehicle[key] ?? null;
    return {
      key,
      date,
      days: daysUntil(date, todayIso),
      state: deadlineState(date, todayIso, dueSoonDays),
    };
  });
}

const DEADLINE_RANK: Record<DeadlineState, number> = {
  overdue: 0,
  due_soon: 1,
  not_recorded: 2,
  ok: 3,
};

/**
 * The worst state across a vehicle's obligations — what its row should say.
 * Unknown ranks *below* due-soon but *above* fine: it deserves attention, but
 * not the alarm reserved for something genuinely lapsed.
 */
export function vehicleWorstState(
  vehicle: Pick<Vehicle, VehicleDateKey>,
  todayIso: string,
  dueSoonDays: number = DUE_SOON_DAYS
): DeadlineState {
  return vehicleDeadlines(vehicle, todayIso, dueSoonDays)
    .map((d) => d.state)
    .reduce(
      (worst, s) => (DEADLINE_RANK[s] < DEADLINE_RANK[worst] ? s : worst),
      "ok" as DeadlineState
    );
}

export type UpcomingDeadline = Deadline & {
  vehicleId: string;
  vehicleName: string;
};

/**
 * Everything genuinely due inside the window, soonest first.
 *
 * Undated obligations are excluded — they cannot be "due in 30 days" when
 * nobody knows when they are due, and padding the list with them would train
 * Jay to ignore it. Sold and SORN vehicles drop out entirely.
 */
export function upcomingDeadlines(
  vehicles: (Pick<Vehicle, VehicleDateKey | "status"> & {
    id: string;
    name: string;
  })[],
  todayIso: string,
  withinDays: number = DUE_SOON_DAYS
): UpcomingDeadline[] {
  return vehicles
    .filter((v) => v.status === "active")
    .flatMap((v) =>
      vehicleDeadlines(v, todayIso, withinDays)
        .filter((d) => d.state === "overdue" || d.state === "due_soon")
        .map((d) => ({ ...d, vehicleId: v.id, vehicleName: v.name }))
    )
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
}

/** Vehicles ordered worst-first, matching the dashboard's governing habit. */
export function sortVehicles<
  T extends Pick<Vehicle, VehicleDateKey | "status" | "sort_order" | "name">
>(vehicles: T[], todayIso: string): T[] {
  return [...vehicles].sort((a, b) => {
    const av = a.status === "active" ? 0 : 1;
    const bv = b.status === "active" ? 0 : 1;
    if (av !== bv) return av - bv;
    const ar = DEADLINE_RANK[vehicleWorstState(a, todayIso)];
    const br = DEADLINE_RANK[vehicleWorstState(b, todayIso)];
    if (ar !== br) return ar - br;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
}

/* ------------------------------------------------------------------ *
 * LIFE_OS — debts
 * ------------------------------------------------------------------ */

export type DebtTotal = {
  /** Sum of the balances actually recorded. */
  known: number;
  /** Active debts whose balance nobody has confirmed yet. */
  unknownCount: number;
  /** Active debts with a balance. */
  knownCount: number;
  /** True only when every active debt has a balance. Derived, never stored. */
  complete: boolean;
};

/**
 * What Jay owes, and how much of that is actually known.
 *
 * `complete` is derived rather than stored, which makes it self-maintaining:
 * the moment the last balance is entered the figure stops being provisional on
 * its own, with no flag anyone has to remember to flip.
 *
 * A null balance contributes nothing to `known` and increments `unknownCount`.
 * It is never treated as zero — Jay confirmed his £8,317 covers only some of
 * his creditors, and a partial figure shown as a total would tell him he is
 * closer to done than he is.
 */
export function debtTotal(
  debts: Pick<Debt, "current_balance" | "status">[]
): DebtTotal {
  const active = debts.filter((d) => d.status === "active");
  const known = active.filter((d) => d.current_balance != null);
  return {
    known: known.reduce((sum, d) => sum + Number(d.current_balance ?? 0), 0),
    unknownCount: active.length - known.length,
    knownCount: known.length,
    complete: active.length > 0 && known.length === active.length,
  };
}

/**
 * How long this debt takes to clear at the current plan, in payments.
 *
 * Null whenever the answer would be a guess: no balance, no plan, or a plan of
 * zero that would never clear anything. Returning a number here when the
 * inputs are unknown would be the most damaging kind of wrong — a debt-free
 * date Jay might actually plan around.
 */
export function payoffPayments(
  debt: Pick<Debt, "current_balance" | "plan_amount">
): number | null {
  const balance = debt.current_balance;
  const payment = debt.plan_amount;
  if (balance == null || payment == null) return null;
  if (payment <= 0) return null;
  if (balance <= 0) return 0;
  return Math.ceil(balance / payment);
}

/**
 * The same projection expressed in months, so plans on different frequencies
 * can be compared. Null for the same reasons as `payoffPayments`.
 */
export function payoffMonths(
  debt: Pick<Debt, "current_balance" | "plan_amount" | "plan_frequency">
): number | null {
  const payments = payoffPayments(debt);
  if (payments == null) return null;
  const freq = debt.plan_frequency;
  if (!freq) return null;
  const perYear = PAYMENTS_PER_YEAR[freq];
  if (!perYear) return null;
  return Math.ceil((payments / perYear) * 12);
}

/** The soonest scheduled payment across every debt, or null when none. */
export function nextPaymentDue<
  T extends Pick<DebtPayment, "due_on" | "status">
>(payments: T[], todayIso: string): T | null {
  const upcoming = payments
    .filter((p) => p.status === "scheduled" && p.due_on >= todayIso)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  return upcoming[0] ?? null;
}

/** Scheduled payments whose date has passed — chased, not silently ignored. */
export function missedPayments<
  T extends Pick<DebtPayment, "due_on" | "status">
>(payments: T[], todayIso: string): T[] {
  return payments
    .filter((p) => p.status === "scheduled" && p.due_on < todayIso)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
}

/**
 * Debts ordered for a phone call: unknown balances first, because finding out
 * is the actual next action, then largest known balance.
 */
export function sortDebts<
  T extends Pick<Debt, "current_balance" | "status" | "creditor">
>(debts: T[]): T[] {
  return [...debts].sort((a, b) => {
    const aa = a.status === "active" ? 0 : 1;
    const ba = b.status === "active" ? 0 : 1;
    if (aa !== ba) return aa - ba;
    const au = a.current_balance == null ? 0 : 1;
    const bu = b.current_balance == null ? 0 : 1;
    if (au !== bu) return au - bu;
    const diff = Number(b.current_balance ?? 0) - Number(a.current_balance ?? 0);
    if (diff !== 0) return diff;
    return a.creditor.localeCompare(b.creditor);
  });
}

/* ================================================================== *
 * THE PRINCIPLE LIBRARY
 *
 * Ten checklists Jay collected, roughly ninety bullet points in total.
 * Nine of those lines are his — the ones he underlined, circled or wrote
 * "Yes" beside. Everything below exists to keep that distinction visible,
 * because a marked line inside ninety generic ones is the only part of
 * this that is actually about him.
 *
 * None of it is ever pushed. See `PRINCIPLES_NEVER_PUSH` in types.ts.
 * ================================================================== */

/** Notes of one kind, newest-first ties broken by title so order is stable. */
export function notesOfKind<T extends Pick<Note, "kind" | "title">>(
  notes: T[],
  kind: string
): T[] {
  return notes
    .filter((n) => n.kind === kind)
    .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
}

/** The single creed note, or null. More than one is a data error, not a list. */
export function creedNote<T extends Pick<Note, "kind">>(notes: T[]): T | null {
  return notes.find((n) => n.kind === "creed") ?? null;
}

/**
 * Jay's own marks on a principle, pulled out of `meta`.
 *
 * `meta` is jsonb and therefore free-form, so every field is validated
 * rather than trusted: a string where an array was expected must not throw
 * on a page he opened to read.
 */
export type JayMarks = {
  /** Lines he wrote "Yes" beside — the strongest signal in the file. */
  marked: string[];
  /** Words and phrases he ringed. */
  circled: string[];
  /** Lines he wrote himself, in the margin. */
  handwritten: string[];
  /** He ran a highlighter down the whole page. */
  highlightedAll: boolean;
  /** True when there is anything of his to show at all. */
  any: boolean;
};

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

export function jayMarks(note: Pick<Note, "meta">): JayMarks {
  const m = (note.meta ?? {}) as Record<string, unknown>;
  const marked = stringArray(m.jay_marked);
  const circled = stringArray(m.jay_circled);
  const handwritten = stringArray(m.jay_handwritten);
  const highlightedAll = m.jay_highlighted_all === true;
  return {
    marked,
    circled,
    handwritten,
    highlightedAll,
    any:
      marked.length + circled.length + handwritten.length > 0 || highlightedAll,
  };
}

/** Where a principle came from, as one line: "Harvard-Fiction KH · p.26". */
export function principleSource(note: Pick<Note, "meta">): string | null {
  const m = (note.meta ?? {}) as Record<string, unknown>;
  const source = typeof m.source === "string" ? m.source.trim() : "";
  const page =
    typeof m.page === "number"
      ? `p.${m.page}`
      : typeof m.page === "string" && m.page.trim() !== ""
        ? m.page.trim()
        : "";
  const parts = [source, page].filter((s) => s !== "");
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type PrincipleBody = {
  /** The epigraph, when the checklist opens with one. */
  quote: string | null;
  /** The numbered lines, numbers stripped — the list renders its own. */
  bullets: string[];
  /** Anything after the list: margin notes, a closing thought. */
  tail: string[];
};

/**
 * Parse a principle body into its parts.
 *
 * The shape is consistent because the notes were entered consistently: an
 * optional quote, then `1.` `2.` `3.` lines, then occasionally a tail. A
 * body that does not match still renders — everything unrecognised falls to
 * `tail`, so nothing Jay stored can be silently dropped by a parser.
 */
export function parsePrincipleBody(
  body: string | null | undefined
): PrincipleBody {
  const out: PrincipleBody = { quote: null, bullets: [], tail: [] };
  if (!body) return out;

  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let seenBullet = false;
  for (const line of lines) {
    const bullet = /^(\d+)\.\s+(.*)$/.exec(line);
    if (bullet) {
      seenBullet = true;
      out.bullets.push(bullet[2].trim());
      continue;
    }
    // A leading quotation before the list is the epigraph; the same shape
    // after the list is a margin note and belongs in the tail.
    if (!seenBullet && out.quote == null && /^[""']/.test(line)) {
      out.quote = line;
      continue;
    }
    out.tail.push(line);
  }
  return out;
}

/**
 * Which numbered points he wrote "Yes" beside.
 *
 * `jay_marked` entries read "4 — Track your progress visually": the number
 * is the point in the checklist. Pulling it out lets the list flag the line
 * itself rather than only repeating it in a box above, which is the
 * difference between showing his mark and describing it.
 */
export function markedBulletNumbers(marked: string[]): Set<number> {
  const out = new Set<number>();
  for (const m of marked) {
    const n = /^\s*(\d+)\b/.exec(m);
    if (n) out.add(Number(n[1]));
  }
  return out;
}

export type Segment = { text: string; hit: boolean };

/** Letters and digits are "inside a word"; everything else is a boundary. */
function isWordChar(c: string | undefined): boolean {
  return c != null && /[a-z0-9]/i.test(c);
}

/**
 * Split text so the phrases he circled can be drawn as circled.
 *
 * Case-insensitive, longest phrase first so "make your bed" wins over
 * "bed", and non-overlapping. Returns the whole string as one plain segment
 * when nothing matches, so a caller renders the same way either way.
 *
 * Matches only on whole words. He circled "work", not the "work" inside
 * "worked" — ringing that would put a mark on the page he never made, and
 * the entire point of this is to show his marks accurately.
 */
export function highlightSegments(text: string, phrases: string[]): Segment[] {
  const wanted = phrases
    .map((p) => p.trim())
    .filter((p) => p.length > 1)
    .sort((a, b) => b.length - a.length);
  if (wanted.length === 0) return [{ text, hit: false }];

  const lower = text.toLowerCase();
  const hits: { start: number; end: number }[] = [];

  for (const phrase of wanted) {
    const needle = phrase.toLowerCase();
    let from = 0;
    for (;;) {
      const i = lower.indexOf(needle, from);
      if (i === -1) break;
      const end = i + needle.length;
      const boundedStart = !isWordChar(text[i - 1]) || !isWordChar(text[i]);
      const boundedEnd = !isWordChar(text[end]) || !isWordChar(text[end - 1]);
      // Skip a partial word, and anything overlapping a phrase already claimed.
      if (
        boundedStart &&
        boundedEnd &&
        !hits.some((h) => i < h.end && end > h.start)
      ) {
        hits.push({ start: i, end });
      }
      from = i + 1;
    }
  }
  if (hits.length === 0) return [{ text, hit: false }];

  hits.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start > cursor) out.push({ text: text.slice(cursor, h.start), hit: false });
    out.push({ text: text.slice(h.start, h.end), hit: true });
    cursor = h.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out;
}

/**
 * Every tag across a set of notes with how many carry it, commonest first.
 * `principle` itself is dropped: a filter that matches everything is not a
 * filter, it is a wasted tap.
 */
export function noteTags<T extends Pick<Note, "tags">>(
  notes: T[]
): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of notes) {
    for (const t of n.tags ?? []) {
      const tag = t.trim().toLowerCase();
      if (tag === "" || tag === "principle") continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Search and tag filter, combined with AND.
 *
 * The query matches title, body and tags together, so typing "hour" finds
 * the intentional-time checklist by its content rather than only by its
 * name. An empty query matches everything — searching for nothing is not
 * the same as finding nothing.
 */
export function filterNotes<
  T extends Pick<Note, "title" | "body" | "tags">
>(notes: T[], opts: { query?: string; tag?: string | null } = {}): T[] {
  const q = (opts.query ?? "").trim().toLowerCase();
  const tag = (opts.tag ?? "").trim().toLowerCase();
  return notes.filter((n) => {
    if (tag !== "" && !(n.tags ?? []).some((t) => t.toLowerCase() === tag)) {
      return false;
    }
    if (q === "") return true;
    const hay = [n.title ?? "", n.body ?? "", ...(n.tags ?? [])]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/**
 * Notes grouped under the area they were filed against, in the areas' own
 * order, with unfiled notes last under a null pillar. Empty groups are
 * dropped — an area with no principles is not a heading worth printing.
 */
export function notesByPillar<
  T extends Pick<Note, "pillar_id">,
  P extends Pick<Pillar, "id" | "sort_order">
>(notes: T[], pillars: P[]): { pillar: P | null; notes: T[] }[] {
  const order = [...pillars].sort((a, b) => a.sort_order - b.sort_order);
  const groups: { pillar: P | null; notes: T[] }[] = [];
  for (const p of order) {
    const mine = notes.filter((n) => n.pillar_id === p.id);
    if (mine.length > 0) groups.push({ pillar: p, notes: mine });
  }
  const known = new Set(pillars.map((p) => p.id));
  const orphans = notes.filter(
    (n) => n.pillar_id == null || !known.has(n.pillar_id)
  );
  if (orphans.length > 0) groups.push({ pillar: null, notes: orphans });
  return groups;
}

/* ================================================================== *
 * HOURS — give every hour a purpose
 *
 * Jay marked "Give every hour a purpose" with a Yes. Labels live in
 * `journal.meta.hours` as `{"09": "work"}` — per-day annotation on a row
 * that already exists per day, which is what `meta` is for (decision 5).
 *
 * The insight is one line: unassigned hours invite distraction. State it,
 * do not nag about it.
 * ================================================================== */

/** The waking day the diary covers, 06:00–22:00, as the old app's did. */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 22;

/** Every hour of that day, as numbers. 06 … 21 — sixteen of them. */
export const DAY_HOURS: number[] = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, i) => DAY_START_HOUR + i
);

/** Zero-padded key, which is also how it is stored: 9 → "09". */
export function hourKey(hour: number): string {
  return String(hour).padStart(2, "0");
}

/** "09" → "09:00", for a label a human reads. */
export function hourLabel(hour: number): string {
  return `${hourKey(hour)}:00`;
}

export type HourMap = Record<string, HourPurpose>;

function isPurpose(v: unknown): v is HourPurpose {
  return typeof v === "string" && (HOUR_PURPOSES as string[]).includes(v);
}

/**
 * Read the hour map out of a journal row's `meta`.
 *
 * `meta` is free-form jsonb: it may hold anything, including keys from a
 * future version of this feature. Anything that is not an in-range hour
 * mapped to one of the five labels is ignored rather than rendered, so a
 * malformed row degrades to an unlabelled day instead of a crash.
 */
export function readHours(meta: unknown): HourMap {
  const raw = (meta as { hours?: unknown } | null | undefined)?.hours;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: HourMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < DAY_START_HOUR || n >= DAY_END_HOUR) continue;
    if (!isPurpose(v)) continue;
    out[hourKey(n)] = v;
  }
  return out;
}

/**
 * Assign a purpose to an hour, or clear it by passing null.
 *
 * Returns a new map — the caller writes the result back, so an optimistic
 * UI and the row it came from never share an object.
 */
export function assignHour(
  hours: HourMap,
  hour: number,
  purpose: HourPurpose | null
): HourMap {
  const next: HourMap = { ...hours };
  const key = hourKey(hour);
  if (purpose == null) delete next[key];
  else next[key] = purpose;
  return next;
}

/** Clear one hour. The same thing as assigning null, said out loud. */
export function clearHour(hours: HourMap, hour: number): HourMap {
  return assignHour(hours, hour, null);
}

/**
 * The tap cycle: unassigned → work → rest → learning → cleaning →
 * connecting → unassigned. One control, no menu, thumb-sized.
 */
export function nextPurpose(current: HourPurpose | null): HourPurpose | null {
  if (current == null) return HOUR_PURPOSES[0];
  const i = HOUR_PURPOSES.indexOf(current);
  if (i === -1) return HOUR_PURPOSES[0];
  return i === HOUR_PURPOSES.length - 1 ? null : HOUR_PURPOSES[i + 1];
}

export type HourStats = {
  assigned: number;
  unassigned: number;
  total: number;
  /** 0–100. Zero on an empty day, because zero of sixteen is a real zero. */
  percent: number;
};

/**
 * How much of the day has a purpose. An empty day is 0 of 16, not a
 * missing figure: he has sixteen waking hours whether or not he has said
 * anything about them.
 */
export function hourStats(hours: HourMap): HourStats {
  const total = DAY_HOURS.length;
  const assigned = DAY_HOURS.filter((h) => hours[hourKey(h)] != null).length;
  return {
    assigned,
    unassigned: total - assigned,
    total,
    percent: total === 0 ? 0 : clampPercent((assigned / total) * 100),
  };
}

export type PurposeSplit = {
  counts: Record<HourPurpose, number>;
  assigned: number;
  unassigned: number;
  total: number;
  /** The label with the most hours, or null on a tie or an empty week. */
  leader: HourPurpose | null;
};

/**
 * The split by label across a set of days — the week, usually.
 *
 * `total` counts every waking hour of every day passed in, so a week of
 * seven days is 112 hours whether or not any of them were labelled. A tie
 * has no leader: naming one of two equal labels the winner would be the
 * page inventing an emphasis he never placed.
 */
export function purposeSplit(days: HourMap[]): PurposeSplit {
  const counts = Object.fromEntries(
    HOUR_PURPOSES.map((p) => [p, 0])
  ) as Record<HourPurpose, number>;

  let assigned = 0;
  for (const day of days) {
    for (const h of DAY_HOURS) {
      const p = day[hourKey(h)];
      if (p == null) continue;
      counts[p] += 1;
      assigned += 1;
    }
  }
  const total = days.length * DAY_HOURS.length;

  let leader: HourPurpose | null = null;
  let best = 0;
  let tied = false;
  for (const p of HOUR_PURPOSES) {
    if (counts[p] > best) {
      best = counts[p];
      leader = p;
      tied = false;
    } else if (counts[p] === best && best > 0) {
      tied = true;
    }
  }
  return {
    counts,
    assigned,
    unassigned: total - assigned,
    total,
    leader: best === 0 || tied ? null : leader,
  };
}

/* ================================================================== *
 * OBSTACLES — what got in the way
 *
 * Jay circled fatigue, distractions and unexpected demands, and asked the
 * system to act on them. One review is an anecdote; the tally only speaks
 * once there are three, and says so plainly until then.
 * ================================================================== */

/** Below this, a tally is one bad week talking, not a pattern. */
export const MIN_REVIEWS_FOR_TALLY = 3;

/** A free-typed obstacle stored the same way the circled three are. */
export function obstacleKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Title-case an unknown key back into something readable. */
export function obstacleLabel(key: string): string {
  if ((OBSTACLES as readonly string[]).includes(key)) {
    return OBSTACLE_LABEL[key as Obstacle];
  }
  const words = key.split("-").filter(Boolean);
  if (words.length === 0) return key;
  return words.join(" ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Read the obstacle list out of a review's `meta`, discarding anything that
 * is not a usable key. Same defensive reasoning as `readHours`.
 */
export function readObstacles(meta: unknown): string[] {
  const raw = (meta as { obstacles?: unknown } | null | undefined)?.obstacles;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const key = obstacleKey(v);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export type ObstacleTally = {
  /** False until MIN_REVIEWS_FOR_TALLY reviews exist. */
  enough: boolean;
  /** How many completed reviews the tally is drawn from. */
  reviews: number;
  /** Commonest first; empty while `enough` is false. */
  counts: { key: string; label: string; count: number }[];
  /** The single worst, or null on a tie, no data, or too few reviews. */
  top: { key: string; label: string; count: number } | null;
};

/**
 * Which obstacle recurs most across the reviews.
 *
 * Below three reviews it returns nothing at all — no counts, no top, no
 * "so far it looks like". A circled line in a book only earns its place by
 * becoming evidence, and one week is not evidence. A tie has no top for
 * the same reason `purposeSplit` has no leader.
 */
export function obstacleTally(
  reviews: Pick<Review, "meta">[],
  minReviews: number = MIN_REVIEWS_FOR_TALLY
): ObstacleTally {
  const n = reviews.length;
  if (n < minReviews) {
    return { enough: false, reviews: n, counts: [], top: null };
  }

  const counts = new Map<string, number>();
  for (const r of reviews) {
    for (const key of readObstacles(r.meta)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const rows = [...counts.entries()]
    .map(([key, count]) => ({ key, label: obstacleLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const top =
    rows.length === 0 || (rows.length > 1 && rows[1].count === rows[0].count)
      ? null
      : rows[0];

  return { enough: true, reviews: n, counts: rows, top };
}

/**
 * The tally as the sentence Jay actually wants: "Fatigue has cost you 4 of
 * your last 6 weeks." Null whenever there is nothing honest to say, so a
 * caller can render it or render nothing without deciding anything itself.
 */
export function obstacleHeadline(tally: ObstacleTally): string | null {
  if (!tally.enough || !tally.top) return null;
  const { label, count } = tally.top;
  const weeks = tally.reviews;
  return `${label} has cost you ${count} of your last ${weeks} week${
    weeks === 1 ? "" : "s"
  }.`;
}

/* ================================================================== *
 * HABITS — one tap, and the streak where he can see it
 * ================================================================== */

/** Every day a habit was logged, ascending. */
export function logDaysFor(logs: HabitLog[], habitId: string): string[] {
  return logs
    .filter((l) => l.habit_id === habitId)
    .map((l) => l.done_on)
    .sort((a, b) => a.localeCompare(b));
}

export type HabitRow<T> = {
  habit: T;
  streak: number;
  doneToday: boolean;
  /** The last `days` days, oldest first — the dots under the name. */
  history: boolean[];
  /** How many of the last `days` days landed. */
  hits: number;
};

/**
 * Everything one habit row needs to render, in one pass.
 *
 * The streak is `currentStreak` rather than a second implementation: a
 * habit and the training streak on the same page disagreeing about what a
 * streak is would be worse than either being wrong.
 */
export function habitRows<T extends Pick<Habit, "id" | "name">>(
  habits: T[],
  logs: HabitLog[],
  todayIso: string,
  days: number = 7
): HabitRow<T>[] {
  return habits.map((h) => {
    const doneOn = logDaysFor(logs, h.id);
    const history = streakHistory(doneOn, todayIso, days);
    return {
      habit: h,
      streak: currentStreak(doneOn, todayIso),
      doneToday: doneOn.includes(todayIso),
      history,
      hits: history.filter(Boolean).length,
    };
  });
}

/**
 * How many of today's habits are ticked. Rendered as "3/6" — a fraction,
 * never a percentage, because six habits is a list you can see the whole of.
 */
export function habitsDoneToday<T extends Pick<Habit, "id">>(
  habits: T[],
  logs: HabitLog[],
  todayIso: string
): { done: number; of: number } {
  const today = new Set(
    logs.filter((l) => l.done_on === todayIso).map((l) => l.habit_id)
  );
  return {
    done: habits.filter((h) => today.has(h.id)).length,
    of: habits.length,
  };
}

/* ================================================================== *
 * EMPIRE_OS — division onboarding
 *
 * Eighteen divisions, almost no numbers. Everything below exists to turn
 * that into seventeen answered questionnaires (MAINFRAME is a pointer row
 * and is never asked anything), because a division dashboard built over
 * nothing is just an empty page with a chart on it.
 *
 * The rule every function here holds: an unanswered question is NULL, and
 * NULL is not zero. A division whose budget nobody has entered is a
 * division of unknown cost, never a free one.
 * ================================================================== */

/**
 * A number that came out of the database, or null.
 *
 * PostgREST hands back `numeric` as a JSON number, but a null, an empty
 * string or a NaN must all collapse to "not answered" rather than to 0 —
 * the one wrong coercion here would make every unpriced division look free.
 */
export function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Only a string is worth parsing. `Number("  ")` and `Number([])` are both
  // 0, so anything looser than this would turn a box he left blank into a
  // division that costs nothing — the exact lie this whole file exists to
  // prevent.
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Trimmed text, or null. An empty box is an unanswered question. */
export function toTextOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * A pointer row, not a division. MAINFRAME is a separate business system
 * (locked decision A1) — it is never onboarded, never asked a question and
 * never counted in the total.
 */
export function isExternal(v: Pick<Venture, "external_system">): boolean {
  return toTextOrNull(v.external_system) != null;
}

/** The divisions onboarding applies to: everything THE BRAIN actually owns. */
export function onboardableVentures<
  T extends Pick<Venture, "external_system">
>(ventures: T[]): T[] {
  return ventures.filter((v) => !isExternal(v));
}

/** When onboarding was finished, as recorded in `ventures.meta`. */
export function readOnboardedAt(meta: unknown): string | null {
  const m = (meta ?? {}) as Record<string, unknown>;
  return toTextOrNull(m[ONBOARDED_AT_KEY]);
}

/** Whether the stage was chosen rather than defaulted. See STAGE_CONFIRMED_KEY. */
export function stageConfirmed(meta: unknown): boolean {
  const m = (meta ?? {}) as Record<string, unknown>;
  return m[STAGE_CONFIRMED_KEY] === true;
}

export type VentureOnboarding = {
  answered: OnboardStepKey[];
  missing: OnboardStepKey[];
  /** How many of the questions have an answer. */
  done: number;
  total: number;
  percent: number;
  /** True only when nothing is outstanding. */
  complete: boolean;
  /** The stamp in `meta`, which records *when* — not whether. */
  onboardedAt: string | null;
  /** True when he has not started: no answer to anything. */
  untouched: boolean;
  /**
   * Whether there is anything for a dashboard to draw.
   *
   * A one-liner on its own is not. All seventeen divisions were seeded with
   * one, so counting it would mean the questionnaire invitation never
   * appeared for a single division — and the empty state *is* the on-ramp.
   * Anything else he has answered (a figure, a funding route, a plan, a next
   * step, a stage he confirmed rather than inherited) is a panel with
   * something in it.
   */
  hasDashboardData: boolean;
};

/**
 * How far through the questionnaire one division is.
 *
 * `hasNextStep` is passed in rather than derived here, because a task
 * reaches a venture through its project and this file does not get to
 * assume the caller loaded them.
 *
 * Completeness is computed from the answers themselves, never from the
 * `onboarded_at` stamp. That way clearing an answer takes the division back
 * out of the count instead of leaving a flag saying it is finished — the
 * count can go down, which is what makes it worth reading.
 */
export function ventureOnboarding(
  v: Pick<
    Venture,
    "one_liner" | "budget" | "monthly_cost" | "funding_route" | "plan" | "meta"
  >,
  opts: { hasNextStep?: boolean } = {}
): VentureOnboarding {
  const has: Record<OnboardStepKey, boolean> = {
    one_liner: toTextOrNull(v.one_liner) != null,
    stage: stageConfirmed(v.meta),
    budget: toNumberOrNull(v.budget) != null,
    monthly_cost: toNumberOrNull(v.monthly_cost) != null,
    funding_route: toTextOrNull(v.funding_route) != null,
    next_step: opts.hasNextStep === true,
    plan: toTextOrNull(v.plan) != null,
  };

  const answered = ONBOARD_STEPS.filter((s) => has[s.key]).map((s) => s.key);
  const missing = ONBOARD_STEPS.filter((s) => !has[s.key]).map((s) => s.key);
  const total = ONBOARD_STEPS.length;

  return {
    answered,
    missing,
    done: answered.length,
    total,
    percent: total === 0 ? 0 : Math.round((answered.length / total) * 100),
    complete: missing.length === 0,
    onboardedAt: readOnboardedAt(v.meta),
    untouched: answered.length === 0,
    hasDashboardData: answered.some((k) => k !== "one_liner"),
  };
}

export type OnboardingProgress = {
  done: number;
  total: number;
  /** Divisions with some answers but not all — the ones worth returning to. */
  started: number;
  percent: number;
};

/**
 * "6 of 17 divisions onboarded."
 *
 * Seventeen, not eighteen: MAINFRAME is excluded, because counting a
 * division you have decided never to onboard as outstanding would make the
 * number permanently wrong by one.
 */
export function onboardingProgress<
  T extends Pick<
    Venture,
    | "id"
    | "external_system"
    | "one_liner"
    | "budget"
    | "monthly_cost"
    | "funding_route"
    | "plan"
    | "meta"
  >
>(ventures: T[], withNextStep: Set<string> = new Set()): OnboardingProgress {
  const mine = onboardableVentures(ventures);
  let done = 0;
  let started = 0;
  for (const v of mine) {
    const o = ventureOnboarding(v, { hasNextStep: withNextStep.has(v.id) });
    if (o.complete) done += 1;
    else if (!o.untouched) started += 1;
  }
  return {
    done,
    total: mine.length,
    started,
    percent: mine.length === 0 ? 0 : Math.round((done / mine.length) * 100),
  };
}

/**
 * The divisions worth asking about next: least answered first, and a
 * division that is half-done before one that has never been opened.
 */
export function nextToOnboard<
  T extends Pick<
    Venture,
    | "id"
    | "name"
    | "status"
    | "external_system"
    | "one_liner"
    | "budget"
    | "monthly_cost"
    | "funding_route"
    | "plan"
    | "meta"
  >
>(ventures: T[], withNextStep: Set<string> = new Set()): T[] {
  return onboardableVentures(ventures)
    .map((v) => ({
      v,
      o: ventureOnboarding(v, { hasNextStep: withNextStep.has(v.id) }),
    }))
    .filter((x) => !x.o.complete)
    .sort((a, b) => {
      // Started but unfinished first — finishing one is cheaper than starting one.
      const ax = a.o.untouched ? 1 : 0;
      const bx = b.o.untouched ? 1 : 0;
      if (ax !== bx) return ax - bx;
      // Then live divisions before shelved ones.
      const as = isShelved(a.v) ? 1 : 0;
      const bs = isShelved(b.v) ? 1 : 0;
      if (as !== bs) return as - bs;
      return b.o.done - a.o.done;
    })
    .map((x) => x.v);
}

/* ------------------------------------------------------------------ *
 * The next step — one task, hung off the division honestly
 * ------------------------------------------------------------------ */

/**
 * A task reaches a venture through its project — there is no
 * `tasks.venture_id` and inventing one would give a task two parents that
 * could disagree (see countsByVenture). So the next step needs a project to
 * live in, and this is the one it gets: one per division, created on demand
 * and reused forever after.
 */
export const NEXT_STEP_ROLE = "next_steps";

export function nextStepProjectTitle(ventureName: string): string {
  return `${ventureName} · next steps`;
}

/**
 * The division's next-steps project, if it already exists.
 *
 * Matched on `meta.role` rather than on the title, so renaming the division
 * — or the project — never orphans it into a second one.
 */
export function findNextStepProject<
  T extends { id: string; venture_id?: string | null; meta?: unknown }
>(projects: T[], ventureId: string): T | null {
  return (
    projects.find((p) => {
      if (p.venture_id !== ventureId) return false;
      const m = (p.meta ?? {}) as Record<string, unknown>;
      return m.role === NEXT_STEP_ROLE;
    }) ?? null
  );
}

/** Every project belonging to a division. */
export function ventureProjects<
  T extends { venture_id?: string | null }
>(projects: T[], ventureId: string): T[] {
  return projects.filter((p) => p.venture_id === ventureId);
}

/** Every task belonging to a division, reached through its projects. */
export function ventureTasks<
  P extends { id: string; venture_id?: string | null },
  T extends { project_id?: string | null }
>(projects: P[], tasks: T[], ventureId: string): T[] {
  const ids = new Set(ventureProjects(projects, ventureId).map((p) => p.id));
  return tasks.filter((t) => t.project_id != null && ids.has(t.project_id));
}

/**
 * The goals a division is working towards, reached through its projects.
 *
 * `goals` has no `venture_id`: a goal is a thing you want, and a division is
 * one of the ways you get it. The link is the project that serves both.
 */
export function ventureGoals<
  P extends { goal_id?: string | null; venture_id?: string | null },
  G extends { id: string }
>(projects: P[], goals: G[], ventureId: string): G[] {
  const ids = new Set(
    ventureProjects(projects, ventureId)
      .map((p) => p.goal_id)
      .filter((g): g is string => g != null)
  );
  return goals.filter((g) => ids.has(g.id));
}

/**
 * Whether each division has a next step recorded, as a set of venture ids.
 * An open task counts; a done one does not — a step already taken is not a
 * next step, and the questionnaire should ask again.
 */
export function venturesWithNextStep<
  P extends { id: string; venture_id?: string | null },
  T extends { project_id?: string | null; status: string }
>(projects: P[], tasks: T[]): Set<string> {
  const ventureOfProject = new Map<string, string>();
  for (const p of projects) {
    if (p.venture_id) ventureOfProject.set(p.id, p.venture_id);
  }
  const out = new Set<string>();
  for (const t of tasks) {
    if (!t.project_id || !isOpenWork(t as Pick<Task, "status">)) continue;
    const v = ventureOfProject.get(t.project_id);
    if (v) out.add(v);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Money — budget against what has actually gone in
 * ------------------------------------------------------------------ */

export type BudgetState =
  /** Neither side known. Nothing to draw and nothing to claim. */
  | "unknown"
  /** A budget, and nothing spent against it yet. */
  | "unspent"
  /** Spending recorded against no budget — real, and not an overspend. */
  | "unbudgeted"
  | "under"
  | "over";

export type BudgetVsSpend = {
  budget: number | null;
  spent: number | null;
  /** Budget minus spend, or null when either side is unknown. */
  remaining: number | null;
  /** How much of the budget is used, 0–100+. Null without both figures. */
  percent: number | null;
  state: BudgetState;
  /** Only ever true when both figures are known and spend exceeds budget. */
  over: boolean;
};

/**
 * Budget against spend, where either side may be missing.
 *
 * The state that matters most is `unbudgeted`: money has gone into
 * something nobody set a budget for. That is a real and common state — it is
 * not an overspend, and calling it one would be the system inventing a
 * failure out of a missing number.
 */
export function budgetVsSpend(
  budgetRaw: unknown,
  spentRaw: unknown
): BudgetVsSpend {
  const budget = toNumberOrNull(budgetRaw);
  const spent = toNumberOrNull(spentRaw);

  if (budget == null && spent == null) {
    return { budget, spent, remaining: null, percent: null, state: "unknown", over: false };
  }
  if (budget == null) {
    return { budget, spent, remaining: null, percent: null, state: "unbudgeted", over: false };
  }
  if (spent == null) {
    return { budget, spent, remaining: null, percent: null, state: "unspent", over: false };
  }

  const remaining = budget - spent;
  // A zero budget with anything spent is over by any reading; guard the
  // division rather than emitting Infinity into a bar's width.
  const percent = budget === 0 ? (spent > 0 ? 100 : 0) : Math.round((spent / budget) * 100);
  return {
    budget,
    spent,
    remaining,
    percent,
    state: spent > budget ? "over" : "under",
    over: spent > budget,
  };
}

/**
 * What has actually gone into each division, from the assets recorded
 * against it. A division with no assets returns nothing at all rather than
 * a zero — see the £— rule.
 */
export function spendByVenture<
  T extends Pick<Asset, "venture_id" | "value">
>(assets: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of assets) {
    if (!a.venture_id) continue;
    const v = toNumberOrNull(a.value);
    if (v == null) continue;
    out[a.venture_id] = (out[a.venture_id] ?? 0) + v;
  }
  return out;
}

/** Total monthly running cost across divisions, and how many are unknown. */
export function runningCostTotal<
  T extends Pick<Venture, "monthly_cost" | "external_system">
>(ventures: T[]): { known: number | null; knownCount: number; unknownCount: number } {
  const mine = onboardableVentures(ventures);
  const figures = mine
    .map((v) => toNumberOrNull(v.monthly_cost))
    .filter((n): n is number => n != null);
  return {
    known: figures.length === 0 ? null : figures.reduce((a, b) => a + b, 0),
    knownCount: figures.length,
    unknownCount: mine.length - figures.length,
  };
}

/* ------------------------------------------------------------------ *
 * The division dashboard — what its graphs are drawn from
 * ------------------------------------------------------------------ */

/** Where a stage sits on the path to revenue, 0-indexed. */
export function stagePosition(stage: VentureStage): number {
  const i = VENTURE_STAGES.indexOf(stage);
  return i < 0 ? 0 : i;
}

/**
 * How far along the path a stage is, as a percentage of the *path* rather
 * than of the progress baseline. Idea is the start line, not 10% of nothing.
 */
export function stagePathPercent(stage: VentureStage): number {
  const last = VENTURE_STAGES.length - 1;
  return last <= 0 ? 0 : Math.round((stagePosition(stage) / last) * 100);
}

export type TaskMix = {
  open: number;
  doing: number;
  done: number;
  total: number;
  /** Share of the division's tasks that are finished. Null with no tasks. */
  donePercent: number | null;
};

/**
 * The task chart. A division with no tasks returns `donePercent: null` —
 * zero percent done would be a judgement about work that does not exist.
 */
export function taskMix<T extends Pick<Task, "status">>(tasks: T[]): TaskMix {
  const count = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;
  const open = count("open");
  const doing = count("doing");
  const done = count("done");
  const total = tasks.length;
  return {
    open,
    doing,
    done,
    total,
    donePercent: total === 0 ? null : Math.round((done / total) * 100),
  };
}

/**
 * A name turned into a URL slug. The single implementation — `ventureSlug`
 * in references.ts is this function, so a branch shelf and a division page
 * can never disagree about what a division is called in a URL.
 *
 * Derived rather than hand-mapped, because the hand-map broke exactly once
 * and expensively: "A to Z Trailerz" was renamed "A to Z Traderz" and its
 * link silently stopped resolving.
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve `/empire/[id]` — a uuid or a name-derived slug, both.
 *
 * The slug form means a renamed division moves its page with it; the uuid
 * form keeps a link already written down working after that rename. An
 * external system resolves to nothing: MAINFRAME has no cockpit here by
 * design (locked decision A1).
 */

export function resolveVenture<
  T extends Pick<Venture, "id" | "name" | "external_system">
>(ventures: T[], idOrSlug: string): T | null {
  const key = idOrSlug.trim().toLowerCase();
  if (key === "") return null;
  const usable = onboardableVentures(ventures);
  return (
    usable.find((v) => v.id.toLowerCase() === key) ??
    usable.find((v) => slugifyName(v.name) === key) ??
    null
  );
}

/* ------------------------------------------------------------------ *
 * Compliance — research turned into questions
 * ------------------------------------------------------------------ */

export type VentureProfile = {
  regulator: string | null;
  duty: string | null;
  critical: string | null;
  penalties: string | null;
  money: string | null;
  councilTaxWarning: string | null;
  firstSteps: string[];
  alsoConsider: string[];
  sources: string[];
  /** True when there is any researched material at all. */
  any: boolean;
};

/**
 * `ventures.profile` is jsonb, so every field is validated rather than
 * trusted — the same discipline `jayMarks` and `readHours` hold. A page he
 * opened to check a legal duty must not blank because a key holds a string
 * where an array was expected.
 */
export function readVentureProfile(profile: unknown): VentureProfile {
  const p = (profile ?? {}) as Record<string, unknown>;
  const text = (k: string) => toTextOrNull(p[k]);
  const list = (k: string): string[] =>
    Array.isArray(p[k])
      ? (p[k] as unknown[]).filter(
          (x): x is string => typeof x === "string" && x.trim() !== ""
        )
      : [];

  const regulator = text("regulator");
  const duty = text("duty");
  const critical = text("critical");
  const penalties = text("penalties");
  const money = text("money");
  const councilTaxWarning = text("council_tax_warning");
  const firstSteps = list("first_steps");
  const alsoConsider = list("also_consider");
  const sources = list("sources").filter((s) => s.startsWith("https://"));

  return {
    regulator,
    duty,
    critical,
    penalties,
    money,
    councilTaxWarning,
    firstSteps,
    alsoConsider,
    sources,
    any:
      [regulator, duty, critical, penalties, money, councilTaxWarning].some(
        (x) => x != null
      ) || firstSteps.length + alsoConsider.length + sources.length > 0,
  };
}

/**
 * Which set of questions a profile earns, derived from the regulator it
 * names rather than from a hand-kept list of division names — so a fifth
 * property researched tomorrow gets the property questions without an edit.
 */
export function complianceKind(profile: unknown): ComplianceKind | null {
  const p = readVentureProfile(profile);
  const hay = `${p.regulator ?? ""} ${p.duty ?? ""}`.toLowerCase();
  if (hay.includes("rent smart wales")) return "property";
  if (hay.includes("cis") || hay.includes("construction industry scheme")) {
    return "cis";
  }
  return null;
}

/** The questions this division should be asked. Empty when none apply. */
export function complianceQuestions(profile: unknown): ComplianceQuestion[] {
  const kind = complianceKind(profile);
  return kind ? COMPLIANCE_QUESTIONS[kind] : [];
}

/** His answers, validated out of `ventures.meta`. */
export function readComplianceAnswers(meta: unknown): Record<string, string> {
  const m = (meta ?? {}) as Record<string, unknown>;
  const raw = m[COMPLIANCE_KEY];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const t = toTextOrNull(v);
    if (t != null) out[k] = t;
  }
  return out;
}

/** Whether a given answer is one that should reach the inbox. */
export function isConcerningAnswer(
  q: ComplianceQuestion,
  value: string | null | undefined
): boolean {
  if (value == null) return false;
  return q.options.some((o) => o.value === value && o.concern);
}

/**
 * The line that lands in the inbox.
 *
 * An inbox item, never a task: this is a prompt research raised, not a
 * decision he made, and locked decision 6 keeps the AI and the research
 * layer advisory. He triages it into a task himself, or bins it.
 *
 * Deterministic, so the same answer never produces two different lines —
 * that is what makes de-duplicating on the text honest.
 */
export function complianceInboxText(
  ventureName: string,
  q: ComplianceQuestion,
  value: string
): string {
  const option = q.options.find((o) => o.value === value);
  const answer = option ? option.label.toLowerCase() : value;
  return `${q.prompt} — ${ventureName} (answered: ${answer})`;
}

/** Every outstanding compliance prompt for a division, given his answers. */
export function complianceConcerns(
  profile: unknown,
  meta: unknown
): { question: ComplianceQuestion; answer: string }[] {
  const answers = readComplianceAnswers(meta);
  return complianceQuestions(profile)
    .map((q) => ({ question: q, answer: answers[q.key] }))
    .filter((x): x is { question: ComplianceQuestion; answer: string } =>
      isConcerningAnswer(x.question, x.answer)
    );
}

/* ------------------------------------------------------------------ *
 * The daily close — check-in and the structured review, one ritual
 *
 * These arrived as two items on the v2 list: a "check-in workflow" and a
 * "structured daily review". They are one thing. Two rituals competing for
 * the same two minutes at the end of the same day is how both get skipped,
 * so this is a single flow with a floor and a ceiling.
 *
 * FLOOR: mood and energy. Two taps, and the day is logged. That is the
 * whole obligation, and it is what makes a streak possible on a bad day.
 *
 * CEILING: five prompts — wins, friction, gratitude, tomorrow, and the one
 * area the system picked. Always present, never demanded. Every field is
 * optional and skipping writes NULL rather than an empty string, because
 * "I did not answer" and "nothing happened" are different facts and only
 * one of them should show up in a tally later.
 * ------------------------------------------------------------------ */

export type CheckinField =
  | "mood"
  | "energy"
  | "wins"
  | "friction"
  | "gratitude"
  | "tomorrow"
  | "area";

/** The floor: answer these and the day counts as logged. */
export const CHECKIN_FLOOR: CheckinField[] = ["mood", "energy"];

/** Every field, in the order the flow asks them. */
export const CHECKIN_FIELDS: CheckinField[] = [
  "mood",
  "energy",
  "wins",
  "friction",
  "gratitude",
  "tomorrow",
  "area",
];

export const CHECKIN_PROMPT: Record<CheckinField, string> = {
  mood: "How was today?",
  energy: "How much was in the tank?",
  wins: "What went well?",
  friction: "What got in the way?",
  gratitude: "", // rotates weekly — see gratitudePrompt()
  tomorrow: "What is the one thing for tomorrow?",
  area: "", // names the area the system picked — see areaToAsk()
};

/**
 * The gratitude prompt rotates weekly rather than daily.
 *
 * Emmons & McCullough found weekly gratitude practice outperformed daily,
 * and the mechanism is adaptation: answer the same question every night
 * and by Thursday you are writing the same three words. A prompt that
 * changes on Monday and holds for the week gives the novelty without
 * asking him to invent a new angle every single evening.
 */
export const GRATITUDE_PROMPTS = [
  "Who made this week easier?",
  "What worked that you did not expect to?",
  "What do you have now that you once wanted?",
  "What went wrong and cost you nothing?",
  "Which small thing would you miss most?",
  "What did somebody do that they did not have to?",
];

export function gratitudePrompt(todayIso: string): string {
  // Keyed to the ISO week so it holds for seven days and moves on Monday.
  const wk = isoWeekNumber(todayIso);
  const yr = Number(todayIso.slice(0, 4));
  const i = (yr * 53 + wk) % GRATITUDE_PROMPTS.length;
  return GRATITUDE_PROMPTS[i];
}

/**
 * Which area the check-in asks about tonight.
 *
 * The system chooses, so he never has to. Unscored areas come first —
 * they are where a single tap buys the most information, and the dashboard
 * cannot rank an area it has never been told about. After that, the worst
 * score, because that is where attention is worth spending.
 *
 * Note this is the OPPOSITE ordering to `rankAreasByNeed`, and deliberately
 * so: that function ranks unscored areas LAST because an area you have
 * never looked at is unknown rather than failing, and the dashboard must
 * not present a guess as a problem. Here the goal is to close the gap, not
 * to report it, so unknown is exactly what we want to ask about.
 *
 * Ties rotate by date. A fresh account has thirteen unscored areas, and
 * without rotation it would ask about the same one every night until he
 * answered it.
 */
export function areaToAsk<
  T extends Pick<Pillar, "id" | "name" | "score" | "sort_order">
>(areas: T[], todayIso: string): T | null {
  if (areas.length === 0) return null;
  const unscored = areas.filter((a) => !isScored(a));
  if (unscored.length > 0) {
    const ordered = [...unscored].sort((a, b) => a.sort_order - b.sort_order);
    return ordered[dayRotation(todayIso, ordered.length)];
  }
  const scored = [...areas].sort(
    (a, b) => (a.score ?? 0) - (b.score ?? 0) || a.sort_order - b.sort_order
  );
  const worst = scored[0].score;
  const tied = scored.filter((a) => a.score === worst);
  return tied[dayRotation(todayIso, tied.length)];
}

/** A stable index for a given day. Same day, same answer; next day, next. */
export function dayRotation(iso: string, n: number): number {
  if (n <= 0) return 0;
  const days = Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  return ((days % n) + n) % n;
}

/**
 * What a saved check-in looks like coming back out of the database.
 *
 * `journal.meta` is jsonb, so nothing here is trusted: every field is
 * validated and anything unrecognised is discarded. A page Jay opened to
 * read must not throw because a row holds a number where a string was
 * expected (§A7).
 */
export type Checkin = {
  mood: number | null;
  energy: number | null;
  wins: string | null;
  friction: string | null;
  gratitude: string | null;
  tomorrow: string | null;
  areaId: string | null;
  areaScore: number | null;
  /**
   * Fields he chose to pass on tonight.
   *
   * Kept SEPARATE from the answers, which is the whole point: skipping
   * writes NULL to the answer, exactly as the zero-obligation rule says,
   * so a skipped gratitude never becomes an empty string that a tally
   * counts later. But a skip is still information — it means "asked, and
   * he said no" — and without recording it the flow has no way to stop
   * asking, so the skip button would visibly do nothing.
   */
  skipped: CheckinField[];
};

export const EMPTY_CHECKIN: Checkin = {
  mood: null,
  energy: null,
  wins: null,
  friction: null,
  gratitude: null,
  tomorrow: null,
  areaId: null,
  areaScore: null,
  skipped: [],
};

/** Mood and energy are both 1–5. Anything else is not an answer. */
function scale5(v: unknown): number | null {
  const n = typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export function readCheckin(row: {
  mood?: unknown;
  energy?: unknown;
  gratitude?: unknown;
  meta?: unknown;
} | null | undefined): Checkin {
  if (!row) return EMPTY_CHECKIN;
  const meta =
    typeof row.meta === "object" && row.meta !== null && !Array.isArray(row.meta)
      ? (row.meta as Record<string, unknown>)
      : {};
  const score = typeof meta.area_score === "number" ? meta.area_score : NaN;
  return {
    mood: scale5(row.mood),
    energy: scale5(row.energy),
    wins: toTextOrNull(meta.wins),
    friction: toTextOrNull(meta.friction),
    gratitude: toTextOrNull(row.gratitude),
    tomorrow: toTextOrNull(meta.tomorrow),
    areaId: toTextOrNull(meta.area_id),
    areaScore: Number.isInteger(score) && score >= 0 && score <= 10 ? score : null,
    skipped: Array.isArray(meta.skipped)
      ? (meta.skipped.filter(
          (f): f is CheckinField =>
            typeof f === "string" && (CHECKIN_FIELDS as string[]).includes(f)
        ) as CheckinField[])
      : [],
  };
}

/**
 * Asked and dealt with — either answered, or passed on.
 *
 * The flow resumes on the first UNSETTLED field, not the first unanswered
 * one, so a skip moves you forward. `isAnswered` stays the narrower test
 * because that is the one anything measuring the data should use: a skipped
 * night contributed no mood reading and must not be averaged as though it
 * did.
 */
export function isSettled(c: Checkin, f: CheckinField): boolean {
  return isAnswered(c, f) || c.skipped.includes(f);
}

/** Answered means answered — an empty box is a skip, and a skip is NULL. */
export function isAnswered(c: Checkin, f: CheckinField): boolean {
  switch (f) {
    case "mood":
      return c.mood != null;
    case "energy":
      return c.energy != null;
    case "wins":
      return c.wins != null;
    case "friction":
      return c.friction != null;
    case "gratitude":
      return c.gratitude != null;
    case "tomorrow":
      return c.tomorrow != null;
    case "area":
      return c.areaScore != null;
  }
}

export type CheckinProgress = {
  /** Floor answered — the day is logged and the reflection week counts it. */
  logged: boolean;
  /** Answers given. Skips are NOT counted; they are not answers. */
  answered: number;
  /** Skips taken, so the page can say "3 answered, 2 passed" honestly. */
  skipped: number;
  of: number;
  /** The next field neither answered nor skipped — where the flow resumes. */
  next: CheckinField | null;
  /** Nothing left to ask tonight. */
  done: boolean;
};

export function checkinProgress(c: Checkin): CheckinProgress {
  const next = CHECKIN_FIELDS.find((f) => !isSettled(c, f)) ?? null;
  return {
    logged: CHECKIN_FLOOR.every((f) => isAnswered(c, f)),
    answered: CHECKIN_FIELDS.filter((f) => isAnswered(c, f)).length,
    skipped: CHECKIN_FIELDS.filter((f) => !isAnswered(c, f) && c.skipped.includes(f))
      .length,
    of: CHECKIN_FIELDS.length,
    next,
    done: next == null,
  };
}

/* ------------------------------------------------------------------ *
 * The reflection streak — weeks, not days
 * ------------------------------------------------------------------ */

/**
 * How many days a week count as having reflected. Four, not seven.
 *
 * A daily streak punishes one missed evening by resetting to zero, and the
 * retention evidence is that the reset is what ends the habit rather than
 * the missed day. Counting ENTRIES PER WEEK is streak-tolerant by
 * construction: miss Tuesday and the week is still good, so Wednesday is
 * a normal evening rather than a restart.
 */
export const REFLECTION_TARGET = 4;

export type ReflectionWeek = {
  /** Monday of the week. */
  monday: string;
  entries: number;
  met: boolean;
};

/**
 * The last `weeks` weeks, oldest first, and the run of consecutive weeks
 * that met the target counting back from the most recent COMPLETE week.
 *
 * The current week is reported but never breaks the run: it is Tuesday and
 * two entries in, so calling it a failure would be calling it early.
 */
export function reflectionWeeks(
  entryDates: string[],
  todayIso: string,
  weeks = 8,
  target = REFLECTION_TARGET
): { weeks: ReflectionWeek[]; streak: number } {
  const seen = new Set(entryDates);
  const thisMonday = mondayOf(todayIso);
  const out: ReflectionWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDays(thisMonday, -7 * i);
    let entries = 0;
    for (let d = 0; d < 7; d++) if (seen.has(addDays(monday, d))) entries++;
    out.push({ monday, entries, met: entries >= target });
  }
  // Count back from the last COMPLETE week — the current one is still
  // being lived and cannot have failed yet.
  let streak = 0;
  for (let i = out.length - 2; i >= 0; i--) {
    if (!out[i].met) break;
    streak++;
  }
  // A complete current week still counts, so a perfect record reads right.
  if (out.length > 0 && out[out.length - 1].met) streak++;
  return { weeks: out, streak };
}

/** Mood or energy averaged over the last `days` days, or null if unasked. */
export function moodTrend(
  rows: { entry_date: string; mood?: number | null; energy?: number | null }[],
  todayIso: string,
  days = 14
): { mood: number | null; energy: number | null; of: number } {
  const from = addDays(todayIso, -(days - 1));
  const window = rows.filter((r) => r.entry_date >= from && r.entry_date <= todayIso);
  const mean = (xs: number[]) =>
    xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  return {
    mood: mean(window.map((r) => r.mood).filter((n): n is number => n != null)),
    energy: mean(window.map((r) => r.energy).filter((n): n is number => n != null)),
    of: window.length,
  };
}

/* ------------------------------------------------------------------ *
 * People — cadence, occasions, and the roster
 *
 * `people.cadence_days` was already called the highest-value thing in the
 * schema: it is what lets the system say "you have not spoken to your
 * brother in 47 days and you said 14". What it lacked was a sane default,
 * a way to log a conversation in one tap, and a rule about how much of the
 * backlog to show.
 * ------------------------------------------------------------------ */

/**
 * Dunbar's layers, used as the default cadence for a tier.
 *
 * The numbers are not arbitrary and not ours: the layers (roughly 5 / 15 /
 * 50 / 150) fall out of contact-frequency data, including mobile-call
 * records, and the frequency is what defines the layer in the first place.
 * So the tier IS the cadence, and asking "how close is this person" is a
 * question he can answer instantly where "how often should I ring them"
 * is one he would have to compute.
 *
 * Every default is overridable per person. The tier is a starting point,
 * not a verdict — some people in the outer band get a call every week.
 */
export type Tier = "inner" | "close" | "band" | "wider";

export const TIERS: Tier[] = ["inner", "close", "band", "wider"];

export const TIER_CADENCE: Record<Tier, number> = {
  inner: 7,
  close: 30,
  band: 90,
  wider: 365,
};

export const TIER_LABEL: Record<Tier, string> = {
  inner: "Inner five",
  close: "Close fifteen",
  band: "The fifty",
  wider: "Wider circle",
};

export const TIER_HINT: Record<Tier, string> = {
  inner: "The handful you would ring at 3am — about weekly",
  close: "Close friends and family — about monthly",
  band: "People you genuinely know — about quarterly",
  wider: "Worth not losing — about yearly",
};

/** The tier a stored cadence corresponds to, for showing it back to him. */
export function tierForCadence(days: number | null | undefined): Tier | null {
  if (days == null) return null;
  let best: Tier | null = null;
  let bestGap = Infinity;
  for (const t of TIERS) {
    const gap = Math.abs(TIER_CADENCE[t] - days);
    if (gap < bestGap) {
      bestGap = gap;
      best = t;
    }
  }
  return best;
}

export type PersonRow = {
  id: string;
  name: string;
  relationship: string | null;
  last_contact: string | null;
  cadence_days: number | null;
  birthday: string | null;
};

export type ContactState = "overdue" | "due" | "ok" | "no_cadence" | "never";

export type PersonStatus = {
  person: PersonRow;
  state: ContactState;
  /** Days since the last logged contact, or null if there has never been one. */
  since: number | null;
  /** Days past the cadence. Positive means overdue. Null if not measurable. */
  over: number | null;
};

/**
 * How a person stands against their own cadence.
 *
 * Four honest outcomes, and the two that mean "I cannot tell you" are kept
 * separate from the two that mean "here is the answer". A person with no
 * cadence is not overdue — nobody has said how often — and a person never
 * contacted is not overdue either, because there is no clock to be past.
 * Both are prompts to fill something in, exactly like an unrecorded MOT.
 */
export function personStatus(p: PersonRow, todayIso: string): PersonStatus {
  // `|| 0` rather than a bare negation: negating zero gives -0, which
  // renders as "-0 days" on the day he actually spoke to somebody.
  const since =
    p.last_contact == null ? null : -(daysUntil(p.last_contact, todayIso) ?? 0) || 0;
  if (p.cadence_days == null) return { person: p, state: "no_cadence", since, over: null };
  if (since == null) return { person: p, state: "never", since: null, over: null };
  const over = since - p.cadence_days;
  // "Due" opens at 80% of the cadence — a weekly person nudges on day six,
  // a yearly one from ten months out. A fixed window would make the yearly
  // ones useless and the weekly ones constant.
  if (over >= 0) return { person: p, state: "overdue", since, over };
  if (since >= p.cadence_days * 0.8) return { person: p, state: "due", since, over };
  return { person: p, state: "ok", since, over };
}

/** How many of the overdue the watchtower will ever show at once. */
export const CADENCE_SURFACED = 3;

/**
 * The two or three people actually worth surfacing.
 *
 * A personal CRM that lists eleven overdue friends produces guilt, and
 * guilt produces avoidance — the app gets closed rather than the calls
 * getting made. So the hero surfaces at most three, worst first, and states
 * the rest as a number rather than as a list. Three is a thing you can do
 * something about tonight.
 *
 * Ranked by how far past the cadence they are as a PROPORTION of it, not in
 * raw days: two weeks past a weekly friend is a much louder signal than two
 * weeks past a yearly one, and sorting on raw days would bury the first
 * behind the second forever.
 */
export function cadenceWatchtower(
  people: PersonRow[],
  todayIso: string,
  limit: number = CADENCE_SURFACED
): { surfaced: PersonStatus[]; alsoOverdue: number; unset: number } {
  const statuses = people.map((p) => personStatus(p, todayIso));
  const overdue = statuses
    .filter((s) => s.state === "overdue")
    .sort((a, b) => {
      const ar = (a.over ?? 0) / (a.person.cadence_days || 1);
      const br = (b.over ?? 0) / (b.person.cadence_days || 1);
      if (ar !== br) return br - ar;
      return a.person.name.localeCompare(b.person.name);
    });
  return {
    surfaced: overdue.slice(0, limit),
    alsoOverdue: Math.max(0, overdue.length - limit),
    unset: statuses.filter((s) => s.state === "no_cadence" || s.state === "never").length,
  };
}

/* -- occasions ------------------------------------------------------ */

/** How far ahead the occasions strip looks. */
export const OCCASION_WINDOW_DAYS = 60;

/**
 * How much warning an occasion needs before it is worth flagging.
 *
 * A birthday you learn about on the day is a text; one you learn about a
 * fortnight out is a present. The lead time is the whole value of the
 * strip, so it is a stated number rather than a feeling.
 */
export const OCCASION_LEAD_DAYS = 14;

export type Occasion = {
  personId: string;
  name: string;
  kind: "birthday";
  /** The date it falls on THIS time round, not the original year. */
  on: string;
  inDays: number;
  /** Inside the lead time — act now or it becomes a text on the day. */
  soon: boolean;
};

export function occasions(
  people: PersonRow[],
  todayIso: string,
  windowDays: number = OCCASION_WINDOW_DAYS,
  leadDays: number = OCCASION_LEAD_DAYS
): Occasion[] {
  const out: Occasion[] = [];
  for (const p of people) {
    if (p.birthday == null) continue;
    const inDays = daysUntilBirthday(p.birthday, todayIso);
    if (inDays == null || inDays > windowDays) continue;
    out.push({
      personId: p.id,
      name: p.name,
      kind: "birthday",
      on: addDays(todayIso, inDays),
      inDays,
      soon: inDays <= leadDays,
    });
  }
  return out.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}

/* -- seeding the roster --------------------------------------------- */

/**
 * How many people the seeding session aims at. Fifteen, not a hundred.
 *
 * Dunbar's inner two layers are about twenty people, and they are the ones
 * a cadence is meaningful for. A roster of a hundred is a database; a
 * roster of fifteen is a relationship practice, and it can be built in one
 * sitting of one question at a time.
 */
export const ROSTER_TARGET = 15;

export type RosterProgress = {
  named: number;
  /** How many have a tier, which is what makes the cadence meaningful. */
  withCadence: number;
  target: number;
  /** Done enough to be useful — not "complete", which it never is. */
  useful: boolean;
};

export function rosterProgress(
  people: PersonRow[],
  target: number = ROSTER_TARGET
): RosterProgress {
  const withCadence = people.filter((p) => p.cadence_days != null).length;
  return {
    named: people.length,
    withCadence,
    target,
    // Five people with cadences beats fifteen names with none, so the bar
    // is set on the thing that makes the feature work rather than on the
    // count. It is a floor, not a finish line.
    useful: withCadence >= 5,
  };
}

/**
 * The next person to ask about, so the seeding session is one question at
 * a time rather than a form with fifteen rows.
 *
 * Someone with a name and no cadence is the cheapest possible win — one
 * tap turns a dead row into a live one — so those come first.
 */
export function nextToSet(people: PersonRow[]): PersonRow | null {
  return (
    [...people]
      .filter((p) => p.cadence_days == null)
      .sort((a, b) => a.name.localeCompare(b.name))[0] ?? null
  );
}
