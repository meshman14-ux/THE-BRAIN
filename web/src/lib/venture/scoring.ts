/**
 * How a venture is doing — and the rule that decides whether this module
 * gets opened twice or once.
 *
 * **RAG is scored against stage-appropriate expectation, never absolute.**
 * An idea at £0 revenue is green if it was touched inside 45 days. Judged
 * absolutely, /ventures opens as sixteen red rows, and a board where
 * everything is red says exactly as much as a board where nothing is —
 * which is how the six-checkbox habit board died.
 *
 * The one exception, and it is the whole reason the module exists: an
 * OVERDUE STATUTORY OBLIGATION IS RED AT EVERY TIER. A late filing is not
 * a judgement about ambition, and it cannot be absorbed by tomorrow's plan.
 */

import { type Tier } from "./types";

/* ── the eight dimensions ─────────────────────────────────────────── */

export const DIMENSIONS = [
  "demand",
  "economics",
  "capability",
  "capacity",
  "capital",
  "compliance",
  "defensibility",
  "momentum",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_QUESTION: Record<Dimension, string> = {
  demand: "Is anyone actually asking for this?",
  economics: "Does one unit of it make money?",
  capability: "Can you do the work, or do you need someone?",
  capacity: "Is there room in the week for it?",
  capital: "Is it funded to its next milestone?",
  compliance: "Is it legal, insured and registered?",
  defensibility: "What stops the next person doing the same thing?",
  momentum: "Has it moved in the last month?",
};

/** Each dimension is 1–5, or null for "not scored". */
export type DimensionScores = Partial<Record<Dimension, number | null>>;

export type VentureScore = {
  /** 0–100, or null when nothing has been scored. */
  score: number | null;
  /** How many of the eight were answered. */
  answered: number;
  /** The sentence the UI must print beside the number. */
  basis: string;
  weakest: Dimension | null;
  strongest: Dimension | null;
};

const clampDim = (v: unknown): number | null => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= 1 && r <= 5 ? r : null;
};

/**
 * The mean over the dimensions that were ANSWERED, rescaled so 1 → 0 and
 * 5 → 100. A skipped dimension is excluded rather than counted as a
 * middling three: absence is not a score, and imputing one would make an
 * unexamined venture look like a considered one.
 *
 * The basis is always shown, because a 62 built on two dimensions and a 62
 * built on eight are different claims, and the number alone cannot tell
 * you which you are looking at.
 */
export function ventureScore(raw: DimensionScores): VentureScore {
  const answered: [Dimension, number][] = [];
  for (const d of DIMENSIONS) {
    const v = clampDim(raw[d]);
    if (v != null) answered.push([d, v]);
  }
  if (!answered.length) {
    return {
      score: null,
      answered: 0,
      basis: "not scored yet",
      weakest: null,
      strongest: null,
    };
  }
  const mean = answered.reduce((a, [, v]) => a + v, 0) / answered.length;
  const score = Math.round(((mean - 1) / 4) * 100);
  const sorted = [...answered].sort((a, b) => a[1] - b[1]);
  return {
    score,
    answered: answered.length,
    basis: `${answered.length} of ${DIMENSIONS.length} dimensions`,
    weakest: sorted[0][0],
    strongest: sorted[sorted.length - 1][0],
  };
}

/* ── IRL — idea realisation level ─────────────────────────────────── */

/**
 * Nine rungs, borrowed from technology readiness levels and rewritten in
 * the vocabulary of a man with a van and three houses. It is a claim about
 * EVIDENCE, not about effort: rung 5 is the first one that requires
 * somebody outside the family to have paid.
 */
export const IRL_RUNGS: { level: number; label: string; evidence: string }[] = [
  { level: 1, label: "Noticed", evidence: "You had the thought and wrote it down." },
  { level: 2, label: "Described", evidence: "You can say who it is for in one sentence." },
  { level: 3, label: "Costed", evidence: "You know roughly what it takes to start." },
  { level: 4, label: "Asked", evidence: "You have spoken to someone who would buy it." },
  { level: 5, label: "Sold once", evidence: "Somebody outside the family has paid." },
  { level: 6, label: "Repeated", evidence: "It has happened more than once, on purpose." },
  { level: 7, label: "Priced", evidence: "You know what a unit costs and what it earns." },
  { level: 8, label: "Systemised", evidence: "It runs without you being the whole system." },
  { level: 9, label: "Standing", evidence: "It earns while you are looking elsewhere." },
];

export function irlLabel(irl: number | null): string | null {
  const rung = IRL_RUNGS.find((r) => r.level === irl);
  return rung ? `${rung.level} · ${rung.label}` : null;
}

/**
 * The tier an IRL implies, used only to say when the two disagree — never
 * to change the tier. Stated and derived stay separate, exactly as
 * `/goals` keeps them.
 */
export function tierFromIrl(irl: number | null): Tier | null {
  if (irl == null) return null;
  if (irl <= 3) return "idea";
  if (irl <= 5) return "validating";
  return "active";
}

/* ── RAG ──────────────────────────────────────────────────────────── */

export type Rag = "green" | "amber" | "red";

export type RagThresholds = { amber: number; red: number; measure: string };

/**
 * Days of silence a tier tolerates. An idea is allowed to sit for six
 * weeks; a trading business is not allowed to go ten days without a
 * number. Dormant is measured on nothing but its obligations.
 */
export const TIER_THRESHOLDS: Record<Tier, RagThresholds> = {
  idea: { amber: 45, red: 90, measure: "last touched" },
  validating: { amber: 14, red: 30, measure: "last touched" },
  active: { amber: 10, red: 21, measure: "last KPI reading" },
  dormant: { amber: 30, red: 0, measure: "obligations only" },
};

export type RagInput = {
  tier: Tier | null;
  /** ISO date the venture was last worked on — any child row counts. */
  lastTouched: string | null;
  /** ISO date of the most recent KPI reading, for active ventures. */
  lastReading?: string | null;
  /** Days until the nearest OPEN statutory obligation; negative is overdue. */
  nextObligationDays?: number | null;
  today: string;
};

export type RagResult = { rag: Rag; reason: string; days: number | null };

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Green, amber or red — with the sentence that says why, because a colour
 * nobody can explain is a colour nobody acts on.
 */
export function ventureRag(input: RagInput): RagResult {
  const { tier, today } = input;
  const t: Tier = tier ?? "idea";
  const obligation = input.nextObligationDays;

  // The one absolute. Everything else on this page is judged against what
  // the tier deserves; a missed statutory date is judged against the law.
  if (obligation != null && obligation < 0) {
    return {
      rag: "red",
      reason: `an obligation is ${Math.abs(obligation)} ${plural(Math.abs(obligation), "day")} overdue`,
      days: obligation,
    };
  }

  const th = TIER_THRESHOLDS[t];

  if (t === "dormant") {
    // A parked venture is not failing by being parked. The only thing that
    // can make it amber is a date the world is holding it to.
    if (obligation != null && obligation <= th.amber) {
      return {
        rag: "amber",
        reason: `an obligation falls in ${obligation} ${plural(obligation, "day")}`,
        days: obligation,
      };
    }
    return { rag: "green", reason: "parked, and nothing is due", days: null };
  }

  const measuredOn = t === "active" ? (input.lastReading ?? null) : input.lastTouched;
  if (!measuredOn) {
    // Never measured is not the same as neglected, and it is not green
    // either. Amber, with the reason, so the fix is obvious.
    return {
      rag: "amber",
      reason: t === "active" ? "no KPI reading has ever been logged" : "never touched",
      days: null,
    };
  }
  const days = daysBetween(measuredOn, today);
  const word = t === "active" ? "since the last KPI reading" : "since it was touched";
  if (days >= th.red) return { rag: "red", reason: `${days} days ${word}`, days };
  if (days >= th.amber) return { rag: "amber", reason: `${days} days ${word}`, days };
  return { rag: "green", reason: `${days} days ${word}`, days };
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

export const RAG_WORD: Record<Rag, string> = {
  green: "Fine",
  amber: "Slipping",
  red: "Needs you",
};

/** Worst first, then longest-silent first, then by name. */
export const RAG_RANK: Record<Rag, number> = { red: 0, amber: 1, green: 2 };

export function compareRag(
  a: { rag: RagResult; name: string },
  b: { rag: RagResult; name: string }
): number {
  const r = RAG_RANK[a.rag.rag] - RAG_RANK[b.rag.rag];
  if (r !== 0) return r;
  const ad = a.rag.days ?? Number.POSITIVE_INFINITY;
  const bd = b.rag.days ?? Number.POSITIVE_INFINITY;
  // A venture with no measurement at all sorts ABOVE ones with a long
  // silence: unknown ranks worse than known-and-slow, the same way an
  // unscored area ranks below every scored one.
  if (ad !== bd) return bd - ad;
  return a.name.localeCompare(b.name);
}

/**
 * One line over the whole portfolio. It counts; it does not scold.
 */
export function portfolioLine(rags: Rag[]): string {
  if (!rags.length) return "No ventures.";
  const n = (r: Rag) => rags.filter((x) => x === r).length;
  const red = n("red");
  const amber = n("amber");
  if (!red && !amber) return `${rags.length} ventures, all inside their own tolerance.`;
  const bits: string[] = [];
  if (red) bits.push(`${red} need you`);
  if (amber) bits.push(`${amber} slipping`);
  return `${rags.length} ventures · ${bits.join(" · ")}.`;
}
