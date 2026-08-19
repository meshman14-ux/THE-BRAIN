/**
 * The venture module — Jay's five areas, per venture (build brief, 19 Aug).
 *
 * Document File · Business Plan · One-Page Summary · Task List · Checklist,
 * drawn as cards on the venture's own page that expand in place. Everything
 * decidable without a database lives here, tested; the components only draw.
 *
 * The two rules that matter more than the code, from the brief:
 *
 * 1 · A venture only earns the fields it can fill. An Idea shows ONE card
 *     (Checklist), never five disabled ones — uniform depth applied to
 *     unequal things is how screens end up 90% empty and stop being opened.
 * 2 · RAG is scored against stage-appropriate expectation, never absolute.
 *     An Idea at £0 revenue is green if touched inside 45 days. Without
 *     this the portfolio opens as sixteen red rows, which is exactly how
 *     the six-checkbox habit board died.
 */

import type { Venture } from "./types";

/* ------------------------------------------------------------------ *
 * Tiers
 * ------------------------------------------------------------------ */

export type VentureTier = "idea" | "validating" | "active" | "dormant";

export const TIER_LABEL: Record<VentureTier, string> = {
  idea: "Idea",
  validating: "Validating",
  active: "Active",
  dormant: "Dormant",
};

export const TIERS: VentureTier[] = ["idea", "validating", "active", "dormant"];

/**
 * What a tier means — shown beside the picker so it is chosen knowingly,
 * the same manners as STAGE_MEANING.
 */
export const TIER_MEANING: Record<VentureTier, string> = {
  idea: "A sentence, not yet a test. Only the checklist watches it.",
  validating: "Being proved or disproved. Tasks and a summary earn their place.",
  active: "Trading or running. All five areas are live.",
  dormant: "Parked on purpose. Only its legal obligations are watched.",
};

/**
 * Tier when none has been chosen — derived from what the row already says,
 * and REPORTED as derived so a guess never silently reads as a decision.
 *
 * A shelved venture (status ≠ active) is dormant whatever its stage: parking
 * it was a decision already taken. Otherwise the stage ladder maps down —
 * idea stays idea, research is validating, and anything at stabilise or
 * beyond is active.
 */
export function deriveTier(v: Pick<Venture, "stage" | "status">): VentureTier {
  if (v.status !== "active") return "dormant";
  if (v.stage === "idea") return "idea";
  if (v.stage === "research") return "validating";
  return "active";
}

export function tierFor(
  v: Pick<Venture, "stage" | "status"> & { tier?: string | null }
): { tier: VentureTier; assumed: boolean } {
  const t = v.tier;
  if (t === "idea" || t === "validating" || t === "active" || t === "dormant") {
    return { tier: t, assumed: false };
  }
  return { tier: deriveTier(v), assumed: true };
}

/* ------------------------------------------------------------------ *
 * The five areas
 * ------------------------------------------------------------------ */

export type AreaKey = "documents" | "plan" | "summary" | "tasks" | "checklist";

export type AreaDef = {
  key: AreaKey;
  name: string;
  /** The question the area answers — the card's subtitle. */
  question: string;
};

export const AREAS: AreaDef[] = [
  { key: "checklist", name: "Checklist", question: "What must not be missed?" },
  { key: "tasks", name: "Task List", question: "What is the next move?" },
  { key: "summary", name: "One-Page Summary", question: "What is this, on one page?" },
  { key: "plan", name: "Business Plan", question: "How does it actually work?" },
  { key: "documents", name: "Document File", question: "Where is the paperwork?" },
];

/**
 * Which areas a tier has EARNED. The locked ones get a single honest line
 * at the bottom of the card stack, never a greyed-out promise.
 *
 * Checklist is unlocked at every tier because a statutory obligation does
 * not care what stage the venture is at — that is the whole lesson of the
 * 18 Aug penalties.
 */
export function areaUnlocked(area: AreaKey, tier: VentureTier): boolean {
  if (area === "checklist") return true;
  switch (tier) {
    case "idea":
      return false;
    case "validating":
      return area === "tasks" || area === "summary";
    case "active":
      return true;
    case "dormant":
      return false;
  }
}

export function unlockedAreas(tier: VentureTier): AreaDef[] {
  return AREAS.filter((a) => areaUnlocked(a.key, tier));
}

export function lockedAreas(tier: VentureTier): AreaDef[] {
  return AREAS.filter((a) => !areaUnlocked(a.key, tier));
}

/* ------------------------------------------------------------------ *
 * RAG — against stage-appropriate expectation, never absolute
 * ------------------------------------------------------------------ */

export type Rag = "green" | "amber" | "red" | "none";

/** Days since → amber / red, per tier, from the brief's table. */
const RAG_DAYS: Record<Exclude<VentureTier, "dormant">, { amber: number; red: number }> = {
  idea: { amber: 45, red: 90 },
  validating: { amber: 14, red: 30 },
  active: { amber: 10, red: 21 },
};

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * The venture's RAG.
 *
 * - An OVERDUE statutory obligation is red at every tier — the one thing
 *   tomorrow's plan cannot absorb.
 * - Dormant is judged on obligations only: amber when one is due inside 30
 *   days, otherwise no colour at all — a parked venture with nothing owed
 *   has earned its silence.
 * - Idea/validating are judged on last touch; a venture never touched is
 *   judged from `created_at` rather than given a free pass.
 * - Active should be judged on its last KPI reading per the brief; KPIs are
 *   not built yet, so it is judged on last touch with the active
 *   thresholds — stricter than nothing, honest about what exists.
 */
export function ragFor(args: {
  tier: VentureTier;
  todayIso: string;
  lastTouchedIso: string | null;
  createdAtIso: string | null;
  /** Earliest un-done checklist due date, if any. */
  nextObligationIso?: string | null;
  overdueObligation?: boolean;
}): { rag: Rag; why: string } {
  const { tier, todayIso } = args;

  if (args.overdueObligation) {
    return { rag: "red", why: "a statutory obligation is overdue" };
  }

  if (tier === "dormant") {
    if (args.nextObligationIso != null) {
      const d = daysBetween(todayIso, args.nextObligationIso);
      if (d <= 30) return { rag: "amber", why: `an obligation is due in ${d}d` };
    }
    return { rag: "none", why: "parked, nothing owed" };
  }

  const since = args.lastTouchedIso ?? args.createdAtIso;
  if (since == null) return { rag: "none", why: "never touched, no start date" };
  const days = daysBetween(since, todayIso);
  const t = RAG_DAYS[tier];
  if (days >= t.red) return { rag: "red", why: `untouched for ${days}d` };
  if (days >= t.amber) return { rag: "amber", why: `untouched for ${days}d` };
  return { rag: "green", why: `touched ${days}d ago` };
}

export const RAG_COLOUR: Record<Rag, string> = {
  green: "var(--good)",
  amber: "var(--warn)",
  red: "var(--bad)",
  none: "var(--faint)",
};

/* ------------------------------------------------------------------ *
 * Business Plan — the eight sections
 * ------------------------------------------------------------------ */

export type PlanSectionKey =
  | "what"
  | "customer"
  | "offer"
  | "channels"
  | "costs"
  | "revenue"
  | "risks"
  | "next90";

export const PLAN_SECTIONS: { key: PlanSectionKey; name: string; prompt: string }[] = [
  { key: "what", name: "What it is", prompt: "The business in three sentences." },
  { key: "customer", name: "Who pays", prompt: "The customer, and the problem they pay to remove." },
  { key: "offer", name: "The offer", prompt: "What they get, at what price." },
  { key: "channels", name: "How they find it", prompt: "Where the customers actually come from." },
  { key: "costs", name: "What it costs", prompt: "To start, and per month to keep alive." },
  { key: "revenue", name: "How the money works", prompt: "Unit economics — one sale, in pounds." },
  { key: "risks", name: "What kills it", prompt: "The two or three ways this dies." },
  { key: "next90", name: "Next 90 days", prompt: "What done looks like a quarter from now." },
];

export function planProgress(
  rows: { section: string; body: string | null }[]
): { filled: number; total: number } {
  const bySection = new Map(rows.map((r) => [r.section, r.body]));
  const filled = PLAN_SECTIONS.filter((s) => {
    const b = bySection.get(s.key);
    return b != null && b.trim().length > 0;
  }).length;
  return { filled, total: PLAN_SECTIONS.length };
}

/* ------------------------------------------------------------------ *
 * Legal structure + the checklist rules
 * ------------------------------------------------------------------ */

export type LegalStructure = "sole_trader" | "ltd" | "partnership" | "none_yet";

export const LEGAL_LABEL: Record<LegalStructure, string> = {
  sole_trader: "Sole trader",
  ltd: "Limited company",
  partnership: "Partnership",
  none_yet: "Not trading yet",
};

export type ComplianceRule = {
  key: string;
  title: string;
  /** null = applies to every structure. */
  structures: LegalStructure[] | null;
  /** null = applies to every group; matched against ventures.venture_group. */
  groups: string[] | null;
  guidanceUrl: string;
  note?: string;
};

/**
 * The starter rulebook — UK, Wales-aware, deliberately small.
 *
 * These are prompts with a GOV.UK link each, NOT advice: thresholds and
 * deadlines move at every Budget, so anything with a penalty attached must
 * be confirmed against the linked guidance or an accountant before being
 * relied on. The UI says this in so many words.
 *
 * Vehicle tax / MOT / insurance are deliberately NOT rules here — the
 * `vehicles` table already owns those dates and the watchtower already
 * fires on them; a second copy is how the £8,317 class of bug starts.
 */
export const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    key: "hmrc-register-sa",
    title: "Register for Self Assessment with HMRC",
    structures: ["sole_trader", "partnership"],
    groups: null,
    guidanceUrl: "https://www.gov.uk/register-for-self-assessment",
  },
  {
    key: "hmrc-file-sa",
    title: "File the Self Assessment return by 31 January",
    structures: ["sole_trader", "partnership"],
    groups: null,
    guidanceUrl: "https://www.gov.uk/self-assessment-tax-returns",
    note: "Late filing starts at £100 and grows daily after three months.",
  },
  {
    key: "ch-confirmation-statement",
    title: "File the Companies House confirmation statement",
    structures: ["ltd"],
    groups: null,
    guidanceUrl: "https://www.gov.uk/guidance/confirmation-statement-guidance",
  },
  {
    key: "ch-annual-accounts",
    title: "File annual accounts with Companies House",
    structures: ["ltd"],
    groups: null,
    guidanceUrl: "https://www.gov.uk/prepare-file-annual-accounts-for-limited-company",
  },
  {
    key: "hmrc-corporation-tax",
    title: "Register for and pay Corporation Tax",
    structures: ["ltd"],
    groups: null,
    guidanceUrl: "https://www.gov.uk/corporation-tax",
  },
  {
    key: "vat-threshold",
    title: "Check turnover against the VAT registration threshold",
    structures: ["sole_trader", "ltd", "partnership"],
    groups: null,
    guidanceUrl: "https://www.gov.uk/register-for-vat",
    note: "The threshold moves at Budgets — check the current figure, do not remember it.",
  },
  {
    key: "business-insurance",
    title: "Public liability / professional insurance in place and in date",
    structures: ["sole_trader", "ltd", "partnership"],
    groups: null,
    guidanceUrl: "https://www.gov.uk/browse/business/setting-up",
  },
  {
    key: "ico-registration",
    title: "Check whether ICO data-protection registration applies",
    structures: ["sole_trader", "ltd", "partnership"],
    groups: null,
    guidanceUrl: "https://ico.org.uk/for-organisations/data-protection-fee/",
  },
  // -- Wales, property ---------------------------------------------------
  // Registration and licence are SEPARATE steps and both are mandatory —
  // conflating them is the common miss.
  {
    key: "rsw-registration",
    title: "Rent Smart Wales — landlord REGISTRATION",
    structures: null,
    groups: ["property"],
    guidanceUrl: "https://www.gov.wales/rent-smart-wales",
  },
  {
    key: "rsw-licence",
    title: "Rent Smart Wales — landlord/agent LICENCE (separate from registration)",
    structures: null,
    groups: ["property"],
    guidanceUrl: "https://www.gov.wales/rent-smart-wales",
  },
  {
    key: "gas-safety",
    title: "Annual gas safety certificate (CP12) per property",
    structures: null,
    groups: ["property"],
    guidanceUrl: "https://www.hse.gov.uk/gas/domestic/landlords.htm",
  },
  {
    key: "eicr",
    title: "Electrical safety report (EICR) — five-yearly, per property",
    structures: null,
    groups: ["property"],
    guidanceUrl: "https://www.gov.uk/government/publications/electrical-safety-standards-in-the-private-rented-sector-guidance-for-landlords-tenants-and-local-authorities",
  },
  {
    key: "deposit-protection",
    title: "Tenancy deposits protected in an approved scheme",
    structures: null,
    groups: ["property"],
    guidanceUrl: "https://www.gov.uk/deposit-protection-schemes-and-landlords",
  },
  {
    key: "business-rates",
    title: "Business rates: bill known, payment plan honoured",
    structures: null,
    groups: ["property", "trade", "retail"],
    guidanceUrl: "https://www.gov.uk/introduction-to-business-rates",
    note: "A missed instalment can make the FULL balance due at once.",
  },
];

/**
 * The deterministic generator: the same facts always produce the same list.
 *
 * - `structure` null = not set. Rules keyed to a structure are then NOT
 *   generated — defaulting to sole_trader would list the wrong statutes for
 *   anything incorporated (D6 in the brief), and a wrong checklist is worse
 *   than a short one that says why it is short. Universal rules still come.
 * - `existingRuleKeys` are skipped, so regenerating never duplicates and
 *   never un-ticks: a done item keeps its row and its done_at.
 */
export function generateChecklist(args: {
  structure: LegalStructure | null;
  group: string | null;
  existingRuleKeys: ReadonlySet<string>;
}): ComplianceRule[] {
  if (args.structure === "none_yet") return [];
  return COMPLIANCE_RULES.filter((r) => {
    if (args.existingRuleKeys.has(r.key)) return false;
    if (r.structures != null) {
      if (args.structure == null) return false;
      if (!r.structures.includes(args.structure)) return false;
    }
    if (r.groups != null) {
      if (args.group == null) return false;
      if (!r.groups.includes(args.group)) return false;
    }
    return true;
  });
}

export type ChecklistItemRow = {
  id: string;
  title: string;
  due_on: string | null;
  done_at: string | null;
};

/** Open first, dated before undated, earliest due first; done last. */
export function sortChecklist<T extends ChecklistItemRow>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const doneA = a.done_at != null ? 1 : 0;
    const doneB = b.done_at != null ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    if (a.due_on != null && b.due_on != null) return a.due_on.localeCompare(b.due_on);
    if (a.due_on != null) return -1;
    if (b.due_on != null) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function checklistState(
  items: ChecklistItemRow[],
  todayIso: string
): { open: number; done: number; overdue: number; nextDue: string | null } {
  let open = 0;
  let done = 0;
  let overdue = 0;
  let nextDue: string | null = null;
  for (const i of items) {
    if (i.done_at != null) {
      done++;
      continue;
    }
    open++;
    if (i.due_on != null) {
      if (i.due_on < todayIso) overdue++;
      else if (nextDue == null || i.due_on < nextDue) nextDue = i.due_on;
    }
  }
  return { open, done, overdue, nextDue };
}
