export type SystemKey = "life" | "empire";

export type Pillar = {
  id: string;
  system: SystemKey;
  name: string;
  emoji: string | null;
  standard: string | null;
  purpose?: string | null;
  vision?: string | null;
  current?: string | null;
  sort_order: number;
  active: boolean;
  /**
   * How the area is doing, 0–10. Null is not zero: null means "not scored
   * yet", zero means "scored, and it is that bad". The dashboard average
   * ignores the first and counts the second.
   */
  score?: number | null;
  /** One line of plain English beside the bar. */
  status_line?: string | null;
  /**
   * Monday of the week this area is the declared focus for. Stored rather
   * than inferred — the area you have decided to work on is not always the
   * one scoring worst, and the dashboard shows the decision.
   */
  focus_week?: string | null;
};

export type InboxItem = {
  id: string;
  raw_text: string;
  captured_at: string;
  status: string;
};

export type Priority = "High" | "Med" | "Low";
export type TaskStatus = "open" | "doing" | "done" | "dropped" | "waiting";

/**
 * Goals and projects share a lifecycle: live, parked, finished, abandoned.
 *
 * Unlike `tasks.status`, the database does NOT constrain these columns — they
 * are plain text defaulting to 'active'. This union is a convention the app
 * upholds, not a guarantee the database enforces, so treat anything read back
 * as possibly outside it.
 */
export type ItemStatus = "active" | "paused" | "done" | "dropped";

export type Goal = {
  id: string;
  title: string;
  description: string | null;
  /** Optional per decision 2 — a goal need not hang off an area. */
  pillar_id: string | null;
  vision_id: string | null;
  target_date: string | null;
  /**
   * What you say your progress is: 0–100, NOT NULL in the database, default 0.
   * Because it is always present it can never mean "derive it for me" — what
   * the projects imply is computed separately by `derivedProgress`.
   */
  progress: number;
  status: ItemStatus;
};

export type Project = {
  id: string;
  title: string;
  description: string | null;
  pillar_id: string | null;
  /** Optional — a project without a goal is normal, not an error. */
  goal_id: string | null;
  start_date: string | null;
  due_date: string | null;
  status: ItemStatus;
};

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
  dropped: "Dropped",
};

export type Task = {
  id: string;
  title: string;
  pillar_id: string | null;
  do_date: string | null;
  due_date: string | null;
  priority: Priority;
  status: TaskStatus;
  /** The one-line why, shown under a task on the priorities panel. */
  notes?: string | null;
  project_id?: string | null;
};

/* ------------------------------------------------------------------ *
 * EMPIRE_OS
 * ------------------------------------------------------------------ */

/** The path to revenue, in order. Position is what "further along" means. */
export type VentureStage =
  | "idea"
  | "research"
  | "stabilise"
  | "launch"
  | "revenue";

export const VENTURE_STAGES: VentureStage[] = [
  "idea",
  "research",
  "stabilise",
  "launch",
  "revenue",
];

export const STAGE_LABEL: Record<VentureStage, string> = {
  idea: "Idea",
  research: "Research",
  stabilise: "Stabilise",
  launch: "Launch",
  revenue: "Revenue",
};

/**
 * Stage colour as a CSS variable, never a literal — both themes resolve it
 * themselves. The ramp reads as temperature: cold and quiet at the idea end,
 * the accent once it is being built, green only once money arrives.
 */
export const STAGE_COLOUR: Record<VentureStage, string> = {
  idea: "var(--faint)",
  research: "var(--muted)",
  stabilise: "var(--warn)",
  launch: "var(--accent)",
  revenue: "var(--good)",
};

export type Venture = {
  id: string;
  name: string;
  pillar_id: string | null;
  stage: VentureStage;
  /**
   * NOT NULL default 0 in the database, so 0 cannot mean "work it out for
   * me" — it means untouched, and the stage baseline is used instead. Any
   * positive value is a deliberate claim that overrides the baseline.
   */
  progress: number;
  one_liner: string | null;
  /** 'active' is live; anything else (e.g. 'backlog') is shelved. */
  status: string;
  sort_order: number;
  external_system: string | null;
  external_url?: string | null;
};

export type Metric = {
  id: string;
  name: string;
  unit: string | null;
  direction: string;
  pillar_id: string | null;
};

export type MetricReading = {
  metric_id: string;
  taken_on: string;
  value: number;
};

export type Vision = {
  id: string;
  title: string;
  statement: string | null;
  horizon_years: number | null;
  system: string;
  meta?: Record<string, unknown> | null;
};

export const SYSTEM_LABEL: Record<SystemKey, string> = {
  life: "LIFE_OS",
  empire: "EMPIRE_OS",
};

export const SYSTEM_BLURB: Record<SystemKey, string> = {
  life: "You as a person",
  empire: "You as an owner",
};

export const PRIORITY_COLOUR: Record<Priority, string> = {
  High: "var(--bad)",
  Med: "var(--warn)",
  Low: "var(--faint)",
};

/** Kanban lanes, in order. Moving right advances the task. */
export const LANES: { key: TaskStatus; label: string; colour: string }[] = [
  { key: "open", label: "To Do", colour: "var(--todo)" },
  { key: "doing", label: "In Progress", colour: "var(--doing)" },
  { key: "done", label: "Done", colour: "var(--done)" },
];

/** Monday-first ISO date list for the week containing `ref`. */
export function weekDates(ref: Date = new Date()): string[] {
  const d = new Date(ref);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
