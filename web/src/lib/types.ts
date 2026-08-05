export type SystemKey = "life" | "empire";

/**
 * Which of the two systems the app is currently wearing.
 *
 * From Jay's sheet: "add 2 buttons to switch between LIFE_OS and EMPIRE_OS.
 * Each has its own operating system." So this is a *mode*, not a filter —
 * `brain` is the neutral position that shows both, and the two buttons
 * select a system. The mode changes the accent colour, the nav contents and
 * which dashboard you are looking at.
 *
 * It is a superset of SystemKey on purpose: every system is a mode, but the
 * command centre is a mode that is no system.
 */
export type Mode = "brain" | "life" | "empire";

export const MODES: Mode[] = ["brain", "life", "empire"];

/** Persisted beside `brain-theme`, and applied before first paint. */
export const MODE_KEY = "brain-mode";

export const MODE_LABEL: Record<Mode, string> = {
  brain: "Brain",
  life: "LIFE_OS",
  empire: "EMPIRE_OS",
};

/** The short form that fits a phone's top bar. */
export const MODE_SHORT: Record<Mode, string> = {
  brain: "Brain",
  life: "Life",
  empire: "Empire",
};

export const MODE_ICON: Record<Mode, string> = {
  brain: "◈",
  life: "☼",
  empire: "♛",
};

/**
 * Where selecting a mode takes you. This is how "dashboard scope follows the
 * mode" is honoured: the mode lives in localStorage, which a Server Component
 * cannot read, so selecting a system navigates to that system's dashboard
 * rather than trying to re-scope the page underneath you.
 */
export const MODE_HOME: Record<Mode, string> = {
  brain: "/dashboard",
  life: "/life",
  empire: "/empire",
};

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
export type ItemStatus =
  | "active"
  | "paused"
  | "done"
  | "dropped"
  /**
   * The bucket list. A bucket-list item is not a new kind of thing and does
   * not get a table — it is a goal with no date and no plan. Keeping it in
   * `goals` is what makes promoting one a single field change rather than a
   * migration between two homes.
   */
  | "someday";

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
  someday: "Someday",
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

/* ------------------------------------------------------------------ *
 * The vault — notes, and the two kinds that are not ordinary notes
 * ------------------------------------------------------------------ */

/**
 * `notes.kind` is free text in the database. These are the values the app
 * gives meaning to:
 *
 * - `note`      an ordinary note.
 * - `principle` a checklist Jay collected from a book. Reference material —
 *               it is somewhere he goes, never something that arrives. See
 *               `PRINCIPLES_NEVER_PUSH` for why that rule is in the code.
 * - `creed`     the lines he wrote himself, in red pen. Not from a book.
 */
export type NoteKind = "note" | "principle" | "creed";

export type Note = {
  id: string;
  title: string | null;
  body: string | null;
  kind: string;
  tags: string[];
  starred: boolean;
  pillar_id: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string;
};

/**
 * The rule, written down where a future change has to read it: a principle
 * never appears unasked. Ninety bullet points of general advice pushed at a
 * dashboard is exactly the clutter the worst-first, surface-three design
 * exists to prevent. Nothing here belongs in the watchtower.
 */
export const PRINCIPLES_NEVER_PUSH = true;

/* ------------------------------------------------------------------ *
 * Hours — giving every hour a purpose
 * ------------------------------------------------------------------ */

/**
 * The five labels Jay circled, and only those five. An hour is one of them
 * or it is unassigned; there is no "other", because a sixth bucket called
 * "other" is how a labelling scheme stops meaning anything.
 */
export type HourPurpose =
  | "work"
  | "rest"
  | "learning"
  | "cleaning"
  | "connecting";

export const HOUR_PURPOSES: HourPurpose[] = [
  "work",
  "rest",
  "learning",
  "cleaning",
  "connecting",
];

export const PURPOSE_LABEL: Record<HourPurpose, string> = {
  work: "Work",
  rest: "Rest",
  learning: "Learning",
  cleaning: "Cleaning",
  connecting: "Connecting",
};

/** One-letter form, for the hour strip on a phone. */
export const PURPOSE_INITIAL: Record<HourPurpose, string> = {
  work: "W",
  rest: "R",
  learning: "L",
  cleaning: "C",
  connecting: "N",
};

/** CSS variables, never literals — both themes resolve them themselves. */
export const PURPOSE_COLOUR: Record<HourPurpose, string> = {
  work: "var(--p-work)",
  rest: "var(--p-rest)",
  learning: "var(--p-learning)",
  cleaning: "var(--p-cleaning)",
  connecting: "var(--p-connecting)",
};

/* ------------------------------------------------------------------ *
 * Reviews — the rituals, and what got in the way
 * ------------------------------------------------------------------ */

export type ReviewKind = "daily" | "weekly" | "quarterly";

export type Review = {
  id: string;
  kind: string;
  period_start: string;
  period_end: string;
  wins: string | null;
  friction: string | null;
  next_focus: string | null;
  completed_at: string | null;
  meta?: Record<string, unknown> | null;
};

/**
 * The three obstacles Jay circled. They are offered as defaults because he
 * named them; anything else he types is stored beside them as free text, so
 * the list can grow past the book without a migration.
 */
export const OBSTACLES = ["fatigue", "distractions", "unexpected-demands"] as const;

export type Obstacle = (typeof OBSTACLES)[number];

export const OBSTACLE_LABEL: Record<Obstacle, string> = {
  fatigue: "Fatigue",
  distractions: "Distractions",
  "unexpected-demands": "Unexpected demands",
};

export type Habit = {
  id: string;
  name: string;
  cadence: string;
  pillar_id: string | null;
  active: boolean;
  target_count?: number;
  meta?: Record<string, unknown> | null;
};

export type HabitLog = { habit_id: string; done_on: string };

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

/* ------------------------------------------------------------------ *
 * LIFE_OS — vehicles
 * ------------------------------------------------------------------ */

/**
 * The state of one dated obligation on a vehicle.
 *
 * `not_recorded` is a first-class state, not a variant of `ok`. A vehicle
 * whose MOT date nobody has entered is not compliant and not overdue — it is
 * unknown, and the only honest thing the UI can do is ask for the date.
 */
export type DeadlineState = "overdue" | "due_soon" | "ok" | "not_recorded";

export const DEADLINE_LABEL: Record<DeadlineState, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  ok: "OK",
  not_recorded: "Not recorded",
};

/** Anything closer than this counts as "due soon". */
export const DUE_SOON_DAYS = 30;

export type VehicleDateKey =
  | "tax_due"
  | "mot_due"
  | "insurance_due"
  | "next_service";

export const VEHICLE_DATE_LABEL: Record<VehicleDateKey, string> = {
  tax_due: "Tax",
  mot_due: "MOT",
  insurance_due: "Insurance",
  next_service: "Service",
};

export const VEHICLE_DATE_KEYS: VehicleDateKey[] = [
  "tax_due",
  "mot_due",
  "insurance_due",
  "next_service",
];

export type Vehicle = {
  id: string;
  name: string;
  registration: string | null;
  make_model: string | null;
  tax_due: string | null;
  mot_due: string | null;
  insurance_due: string | null;
  last_service: string | null;
  next_service: string | null;
  /** 'active' | 'sorn' | 'sold' — free text, a convention the app upholds. */
  status: string;
  pillar_id: string | null;
  sort_order: number;
  notes: string | null;
};

/* ------------------------------------------------------------------ *
 * LIFE_OS — debts
 * ------------------------------------------------------------------ */

export type DebtKind =
  | "council_tax"
  | "credit"
  | "utility"
  | "vehicle"
  | "benefit"
  | "other";

export const DEBT_KIND_LABEL: Record<DebtKind, string> = {
  council_tax: "Council tax",
  credit: "Credit",
  utility: "Utility",
  vehicle: "Vehicle",
  benefit: "Benefit",
  other: "Other",
};

export type PlanFrequency = "weekly" | "fortnightly" | "monthly";

/** Payments per year, for projecting a payoff. */
export const PAYMENTS_PER_YEAR: Record<PlanFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
};

export type Debt = {
  id: string;
  creditor: string;
  kind: DebtKind;
  reference: string | null;
  original_amount: number | null;
  /** NULL means not yet confirmed with the creditor. It does NOT mean zero. */
  current_balance: number | null;
  status: string;
  plan_amount: number | null;
  plan_frequency: PlanFrequency | null;
  plan_day: number | null;
  plan_start: string | null;
  pillar_id: string | null;
  venture_id: string | null;
  notes: string | null;
  sort_order: number;
};

export type DebtPayment = {
  id: string;
  debt_id: string;
  amount: number;
  due_on: string;
  paid_on: string | null;
  status: "scheduled" | "paid" | "missed";
};
