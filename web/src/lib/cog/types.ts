/**
 * THE COG — core types.
 * Mirrors schemas/*.schema.json. The engine (advisor.ts) is a pure function over these types:
 * no I/O, no clock, no randomness — same MomentumState + CogConfig => identical Advice.
 */

export type Season = "quiet" | "busy" | "minimum";
export type Band = 1 | 2 | 3 | 4 | 5;
export type TaskEnergy = "low" | "medium" | "deep";

export interface CogTask {
  id: string;
  title: string;
  status: "open" | "waiting";
  doDate: string | null; // ISO date
  dueDate: string | null;
  priority: number; // BRAIN's tasks.priority
  energy: TaskEnergy | null;
  pillarId: string | null;
  projectId: string | null;
  estimateMin: number | null;
  staleDays: number;
  supportsKeystone: boolean;
  /** BRAIN edit after a COG write-back marks the task user-steered until cooldown expires */
  userSteered?: boolean;
  /** true when this task is the next step of an opportunity due today */
  empireSignal?: boolean;
}

export interface Interval {
  start: string; // ISO datetime
  end: string;
}

export interface MomentumSignals {
  energyBand: Band | null;
  sleepBand: Band | null;
  energySource: "checkin" | "decayed" | "none";
  sleepSource: "health" | "checkin" | "none";
  yesterdayCompletionRatio: number | null;
  keystoneHitYesterday: boolean | null;
  keystoneDoneToday: boolean;
  checkinStreakDays: number;
  finishesRate: number | null;
  calendarLoadRatio: number | null;
  workloadPressure: number | null;
  inboxCount: number;
  pulsesRejectedToday: number;
}

export type MissingInput = "sleep" | "checkin" | "calendar" | "health" | "empire";

export interface MomentumState {
  date: string; // ISO date — the engine's only notion of "now" besides `now` below
  now: string; // ISO datetime, injected by the orchestrator (never read from a clock)
  season: Season;
  signals: MomentumSignals;
  tasks: CogTask[];
  calendar: { source: "google" | "planner" | "none"; busy: Interval[] };
  empire: { dormantVentures: number; opportunitiesDueToday: number };
  missingInputs: MissingInput[];
  momentumIndicator?: number;
}

export interface IdentityStatement {
  pillarId: string;
  statement: string;
  weight: number;
}

export interface IdentityProfile {
  id: string;
  keystoneHabitId: string | null;
  deepWorkWindow: { start: string; end: string }; // "HH:MM"
  statements: IdentityStatement[];
  alignmentWindowDays: number;
  /** last-7-day completed-task counts per pillar, supplied by the orchestrator */
  recentCompletionsByPillar: Record<string, number>;
}

export interface RuleTraceEntry {
  ruleId: string;
  fired: boolean;
  detail?: string;
}

export interface Priority {
  taskId: string;
  title: string;
  rank: 1 | 2 | 3;
  score: number;
  components: Record<string, number>;
  rationale: string;
  ruleTrace: RuleTraceEntry[];
}

export interface FocusSlot {
  id: string;
  start: string;
  end: string;
  durationMin: number;
  quality: "prime" | "good" | "fallback";
  matchedPriorityRank: number | null;
  source: "google" | "planner" | "config-default";
  rationale: string;
  ruleTrace: RuleTraceEntry[];
}

export type PulseKind =
  | "do-task" | "start-focus" | "micro-action" | "checkin"
  | "triage" | "rest" | "identity-nudge" | "none";

export interface AdvisorPulse {
  id: string;
  kind: PulseKind;
  refId: string | null;
  message: string;
  rationale: string;
  ruleTrace: RuleTraceEntry[];
  issuedAt: string;
  correlationId: string;
}

export interface MicroAction {
  id: string;
  label: string;
  estimateMin: number;
  origin: "task-fragment" | "keystone-support" | "inbox-triage" | "people-cadence" | "admin";
  refTaskId: string | null;
  rationale: string;
  ruleTrace: RuleTraceEntry[];
}

export interface IdentityAlignment {
  aligned: string[];
  drifts: { pillarId: string; observation: string }[];
}

export interface Advice {
  state: MomentumState;
  report: {
    headline: string;
    momentumIndicator: number;
    band: "low" | "steady" | "rolling";
    degraded: boolean;
    missingInputs: MissingInput[];
    narrative: string;
  };
  priorities: Priority[];
  focusSlot: FocusSlot | null;
  pulse: AdvisorPulse;
  identityAlignment: IdentityAlignment;
  microActions: MicroAction[];
}
