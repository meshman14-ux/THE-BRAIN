/* ------------------------------------------------------------------ *
 * HYBRID — the domain, and nothing else
 *
 * This file describes training. It knows nothing about Supabase, React,
 * Next, or THE BRAIN's tables, and it must stay that way: the engine is
 * pure, the persistence layer adapts to it. That is what makes every rule
 * in here testable without a database and portable if the database ever
 * changes.
 *
 * The whole module obeys three laws borrowed from the rest of the system:
 *
 *   1. **Absence is not zero.** A missing signal is `null` and is excluded
 *      from a calculation, never imputed as average. A readiness score
 *      built from one input must not look like one built from six.
 *   2. **Surface, never decide.** Nothing in here returns "allowed: false".
 *      Gates produce ADVICE with a severity; the athlete overrides it, and
 *      overriding is a supported path rather than cheating.
 *   3. **Judge against yourself.** Every physiological signal is scored
 *      against the athlete's own rolling baseline, never a population
 *      norm. Absolute HRV is meaningless across people; only the deviation
 *      from your own normal carries information.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Movement vocabulary
 * ------------------------------------------------------------------ */

/**
 * Patterns rather than muscles.
 *
 * A hybrid athlete's programme balances by PATTERN — if vertical pull
 * outweighs vertical push three to one, the shoulder pays for it however
 * good the muscle-group tally looks. Nippard and Helms both programme this
 * way, and calisthenics needs two patterns barbell training does not:
 * straight-arm scapular work (levers, planche) and hand balancing, which
 * are strength qualities in their own right rather than accessories.
 */
export const MOVEMENT_PATTERNS = [
  "horizontal-push",
  "vertical-push",
  "horizontal-pull",
  "vertical-pull",
  "squat",
  "hinge",
  "lunge",
  "straight-arm-scapular",
  "hand-balancing",
  "core-anti-extension",
  "core-anti-rotation",
  "core-flexion",
  "carry",
  "locomotion",
  "mobility",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

/** Push and pull patterns, so a balance check does not need a hard-coded list. */
export const PUSH_PATTERNS: readonly MovementPattern[] = [
  "horizontal-push",
  "vertical-push",
  "hand-balancing",
];
export const PULL_PATTERNS: readonly MovementPattern[] = [
  "horizontal-pull",
  "vertical-pull",
  "straight-arm-scapular",
];

export const MODALITIES = [
  "calisthenics",
  "weighted-calisthenics",
  "barbell",
  "dumbbell",
  "machine",
  "band",
  "mobility",
  "conditioning",
] as const;
export type Modality = (typeof MODALITIES)[number];

/** The split, plus the two sessions the split does not contain. */
export const SESSION_KINDS = [
  "push",
  "pull",
  "legs",
  "skills",
  "full-body",
  "recovery",
  "rest",
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_LABEL: Record<SessionKind, string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  skills: "Skills",
  "full-body": "Full body",
  recovery: "Recovery",
  rest: "Rest",
};

export const MUSCLE_GROUPS = [
  "chest",
  "front-delts",
  "side-delts",
  "rear-delts",
  "triceps",
  "biceps",
  "forearms",
  "lats",
  "upper-back",
  "lower-back",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "obliques",
  "hip-flexors",
  "scapular-stabilisers",
  "wrists",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/* ------------------------------------------------------------------ *
 * The exercise library
 * ------------------------------------------------------------------ */

/**
 * One movement.
 *
 * `regressions` and `progressions` are ids, which makes the library a
 * graph rather than a list — and the graph is the progression ladder.
 * There is no separate "ladder" table because a ladder that can drift out
 * of step with the library is a ladder that eventually lies. Vadnal's
 * progressions, Liu's simplifications and Saturno's mobility entries all
 * live in the same structure; only the edges differ.
 */
export type Exercise = {
  id: string;
  name: string;
  /** Which sessions this movement can appear in. */
  category: SessionKind[];
  pattern: MovementPattern;
  modality: Modality;
  /**
   * 1–10, and deliberately coarse. It orders a ladder; it does not claim
   * that a 7 is exactly one seventh harder than a 6.
   */
  difficulty: number;
  video_url: string | null;
  diagram_url: string | null;
  /** Coaching cues, in the order they matter. Vadnal's strictness lives here. */
  cues: string[];
  muscles: {
    primary: MuscleGroup[];
    secondary: MuscleGroup[];
  };
  equipment: string[];
  /** Easier neighbours in the graph. */
  regressions: string[];
  /** Harder neighbours in the graph. */
  progressions: string[];
  /** The skill tree this rung belongs to, if any. */
  skill: string | null;
  /**
   * How a set is measured. A front lever is held, a pull-up is counted,
   * and treating both as "reps" is how bodyweight logs become useless.
   */
  unit: "reps" | "seconds" | "metres" | "minutes";
  /** Free-form, so the library can grow without a migration. */
  meta?: Record<string, unknown>;
};

/* ------------------------------------------------------------------ *
 * Skills
 * ------------------------------------------------------------------ */

/**
 * Mastery, in four states rather than a percentage.
 *
 * A percentage on a skill is a fiction — nobody is 63% of the way to a
 * handstand. Four states carry everything a plan needs and nothing it
 * cannot verify.
 */
export const MASTERY_LEVELS = ["locked", "testing", "working", "owned"] as const;
export type Mastery = (typeof MASTERY_LEVELS)[number];

export const MASTERY_LABEL: Record<Mastery, string> = {
  locked: "Not yet",
  testing: "Test in",
  working: "Working",
  owned: "Owned",
};

/**
 * The standard a rung is passed at.
 *
 * Every field is optional because different rungs are proved differently,
 * but `form` is never empty: a hold time without form criteria is how a
 * "60-second plank" becomes a 60-second sag. Strict standards are the
 * entire point of the calisthenics tradition this borrows from.
 */
export type Standard = {
  /** Unbroken hold, in seconds. */
  hold_s?: number;
  /** Strict reps in one set. */
  reps?: number;
  /** Consecutive sessions the standard must be met on — no one-off flukes. */
  sessions?: number;
  /** Non-negotiable form criteria, each independently checkable. */
  form: string[];
};

export type SkillNode = {
  id: string;
  name: string;
  /** Every node this one requires. A DAG, not a line — skills converge. */
  requires: string[];
  /** The exercise in the library this node is practised with. */
  exercise_id: string;
  standard: Standard;
  /** Coaching note specific to this rung. */
  note?: string;
};

export type SkillTree = {
  id: string;
  name: string;
  /** The end of the tree — what "owning" the skill means. */
  goal: string;
  nodes: SkillNode[];
};

/** What the athlete has proved, per node. Sparse: absent means locked. */
export type SkillState = Record<string, Mastery>;

/* ------------------------------------------------------------------ *
 * Readiness
 * ------------------------------------------------------------------ */

/**
 * Everything the readiness engine can listen to.
 *
 * The list is open by design: adding a signal must not require touching
 * the scoring maths. Each has a direction, because for HRV higher is
 * better and for resting heart rate it is not.
 */
export const SIGNAL_KEYS = [
  "hrv",
  "resting_hr",
  "sleep_hours",
  "sleep_quality",
  "stress",
  "soreness",
  "mood",
  "energy",
  "hydration",
  "nutrition",
  "acute_load",
] as const;
export type SignalKey = (typeof SIGNAL_KEYS)[number];

/**
 * Where a reading came from.
 *
 * Reliability is about freshness and directness, NOT about whether a
 * machine produced it. Saw, Main & Gastin's 2016 systematic review (56
 * studies) found subjective wellbeing measures responded to training load
 * with greater sensitivity and consistency than objective markers — so
 * self-report is a first-class signal here, not a fallback.
 */
export const SIGNAL_SOURCES = ["wearable", "import", "self", "derived"] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

export type Reading = {
  key: SignalKey;
  /** The raw value in its own units. Normalising is the engine's job. */
  value: number;
  source: SignalSource;
  /** ISO date the reading describes, not when it was uploaded. */
  on: string;
};

export type ReadinessBandName = "green" | "amber" | "red";

export type SignalContribution = {
  key: SignalKey;
  /** 0–1 after normalisation against this athlete's own baseline. */
  normalised: number;
  /** Effective weight after source reliability and staleness decay. */
  weight: number;
  source: SignalSource;
  /** Plain-English line for the UI. Never a bare number. */
  line: string;
};

export type ReadinessResult = {
  /** 0–100, or null when there is not enough to say. Null is a valid answer. */
  score: number | null;
  band: ReadinessBandName | null;
  /**
   * 0–1: the share of the possible evidence that was actually present.
   * Printed beside the score so a number built on one signal cannot pass
   * itself off as a number built on six.
   */
  confidence: number;
  contributions: SignalContribution[];
  /** Signals the engine wanted and did not get. Named, so they can be fixed. */
  missing: SignalKey[];
  /** Why there is no score, when there is no score. */
  reason: string | null;
};

/* ------------------------------------------------------------------ *
 * Load
 * ------------------------------------------------------------------ */

export type SetLog = {
  exercise_id: string;
  /** Reps, seconds, metres — whatever the exercise's `unit` says. */
  amount: number;
  /** Added load in kg. 0 for pure bodyweight, negative for assistance. */
  load_kg: number;
  /** Reps in reserve. Helms' RIR-based autoregulation, logged not guessed. */
  rir: number | null;
};

export type SessionLog = {
  id: string;
  on: string;
  kind: SessionKind;
  sets: SetLog[];
  /** Session RPE, 0–10, taken ~30 min after. Foster's method. */
  session_rpe: number | null;
  duration_min: number | null;
};

/**
 * Israetel's volume landmarks, per muscle group, in working sets per week.
 *
 * Held as DATA rather than constants because they are individual and they
 * move: MRV in particular drops in a bad sleep week and rises across a
 * training age. Anything that ships as a default must be overridable, or
 * the system is asserting something about this athlete it cannot know.
 */
export type VolumeLandmarks = {
  /** Maintenance volume — enough to not lose it. */
  mv: number;
  /** Minimum effective volume — the least that still grows. */
  mev: number;
  /** Maximum adaptive volume — the productive ceiling. */
  mav: number;
  /** Maximum recoverable volume — beyond this is debt, not stimulus. */
  mrv: number;
};

export type VolumeStatus =
  | "under-maintenance"
  | "maintaining"
  | "productive"
  | "at-ceiling"
  | "over";

/* ------------------------------------------------------------------ *
 * Plans and advice
 * ------------------------------------------------------------------ */

export type PlannedSet = {
  exercise_id: string;
  sets: number;
  /** A range, not a number — autoregulation needs room. */
  target: { min: number; max: number; unit: Exercise["unit"] };
  load_kg: number | null;
  /** Target reps in reserve for the working sets. */
  rir: number | null;
  rest_s: number;
  note?: string;
};

/** Blocks run in order, and the order is a training decision, not layout. */
export const BLOCK_KINDS = [
  "prepare",
  "skill",
  "primary",
  "secondary",
  "accessory",
  "conditioning",
  "restore",
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export type PlanBlock = {
  kind: BlockKind;
  title: string;
  /** Why this block is here today. Shown, so the plan can be argued with. */
  why: string;
  items: PlannedSet[];
};

export type DailyPlan = {
  on: string;
  kind: SessionKind;
  blocks: PlanBlock[];
  /** The readiness the plan was built against, carried for honesty. */
  readiness: ReadinessResult;
  /** How the plan was scaled, and by how much. */
  adjustment: PlanAdjustment;
  /** One line summarising the session. */
  headline: string;
};

export type PlanAdjustment = {
  /** Multiplier applied to planned volume. 1 = as written. */
  volume: number;
  /** Multiplier applied to planned intensity. */
  intensity: number;
  /** Whether skill work stays in. Skills need a fresh nervous system. */
  skills: boolean;
  reason: string;
};

/** The four channels the brief asks for, kept separate so none drowns out another. */
export const ADVICE_CHANNELS = [
  "readiness",
  "progression",
  "skill",
  "recovery",
] as const;
export type AdviceChannel = (typeof ADVICE_CHANNELS)[number];

export type AdviceSeverity = "info" | "note" | "warn";

export type Advice = {
  channel: AdviceChannel;
  severity: AdviceSeverity;
  /** The whole message, in a sentence. No headline/body split. */
  line: string;
  /** What the app should offer. Never performed automatically. */
  action?: { label: string; href?: string };
};

/* ------------------------------------------------------------------ *
 * The athlete
 * ------------------------------------------------------------------ */

export type AthleteProfile = {
  /** Bodyweight in kg, needed to price weighted calisthenics honestly. */
  bodyweight_kg: number | null;
  /** Sessions the athlete intends per week. Their claim, not the system's. */
  sessions_per_week: number;
  equipment: string[];
  /** Landmark overrides, per muscle group. Sparse — defaults fill the rest. */
  landmarks?: Partial<Record<MuscleGroup, VolumeLandmarks>>;
  /** Skills being actively pursued. Everything else is dormant, not deleted. */
  focus_skills: string[];
};
