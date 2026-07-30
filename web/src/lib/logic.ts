/**
 * Pure logic for THE BRAIN.
 *
 * Everything here is a pure function over plain data — no Supabase, no React,
 * no dates-from-the-ambient-clock unless passed in. That is deliberate: it means
 * the rules that decide what you see can be tested without a database or a browser,
 * and a regression in "which tasks land on Thursday" gets caught by `npm test`
 * rather than by you, on a Thursday.
 */

import type {
  Goal,
  ItemStatus,
  Pillar,
  Priority,
  Project,
  SystemKey,
  Task,
  TaskStatus,
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
 * A goal's progress. A hand-set `progress` always wins — if you have said
 * where you are, the system does not argue. Otherwise it is the mean of the
 * goal's projects that have measurable progress. Null when nothing is known.
 */
export function goalProgress(
  goal: Pick<Goal, "progress">,
  projectPercents: (number | null)[]
): number | null {
  if (goal.progress != null) return clampPercent(goal.progress);
  const known = projectPercents.filter((n): n is number => n != null);
  if (known.length === 0) return null;
  return Math.round(known.reduce((a, b) => a + b, 0) / known.length);
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
): { projects: P[]; percent: number | null; overdue: boolean } {
  const mine = projectsForGoal(projects, goal.id).filter(isLive);
  const percents = mine.map((p) => projectProgress(tasksByProject(p.id)));
  return {
    projects: mine,
    percent: goalProgress(goal, percents),
    overdue: isOverdue(goal, todayIso),
  };
}
