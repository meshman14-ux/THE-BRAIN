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
  VENTURE_STAGES,
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
  return [...tasks]
    .filter(isOpenWork)
    .sort((a, b) => {
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
    })
    .slice(0, limit);
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

export type Horizon = "quarter" | "year" | "five" | "twenty";

export const HORIZONS: Horizon[] = ["quarter", "year", "five", "twenty"];

export const HORIZON_LABEL: Record<Horizon, string> = {
  quarter: "This quarter",
  year: "This year",
  five: "5 years",
  twenty: "20 years",
};

/**
 * Which column a goal belongs in, by its target date.
 *
 * An overdue goal buckets into "this quarter" rather than falling off the
 * board — a date you have already missed is the most immediate horizon
 * there is. Undated goals return null and are listed separately, because a
 * goal with no date is not a twenty-year goal, it is an undecided one.
 */
export function goalHorizon(
  targetDate: string | null | undefined,
  todayIso: string
): Horizon | null {
  if (!targetDate) return null;
  if (targetDate <= endOfQuarter(todayIso)) return "quarter";
  if (targetDate <= endOfYear(todayIso)) return "year";
  if (targetDate <= addYears(todayIso, 5)) return "five";
  return "twenty";
}

export function bucketGoalsByHorizon<
  T extends Pick<Goal, "target_date" | "status">
>(
  goals: T[],
  todayIso: string
): { buckets: Record<Horizon, T[]>; undated: T[] } {
  const buckets: Record<Horizon, T[]> = {
    quarter: [],
    year: [],
    five: [],
    twenty: [],
  };
  const undated: T[] = [];
  for (const g of goals.filter(isLive)) {
    const h = goalHorizon(g.target_date, todayIso);
    if (h == null) undated.push(g);
    else buckets[h].push(g);
  }
  for (const h of HORIZONS) {
    buckets[h] = sortGoals(buckets[h], todayIso);
  }
  return { buckets, undated };
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
