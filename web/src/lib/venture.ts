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

/**
 * Eight sections, each a QUESTION rather than a heading — a heading invites
 * prose, a question can be answered in a sentence, and a sentence is what
 * actually gets written at nine in the evening. (Harvested from the parallel
 * venture-module branch, whose prompts were better than the first draft's.)
 */
export type PlanSectionKey =
  | "problem"
  | "offer"
  | "customer"
  | "unit"
  | "route"
  | "resources"
  | "risks"
  | "next";

export const PLAN_SECTIONS: { key: PlanSectionKey; name: string; prompt: string }[] = [
  { key: "problem", name: "The problem", prompt: "Whose problem is this, and how do they currently live with it?" },
  { key: "offer", name: "The offer", prompt: "What exactly is being sold, and for how much?" },
  { key: "customer", name: "The customer", prompt: "Who pays, and where are they already looking?" },
  { key: "unit", name: "Unit economics", prompt: "What does one job cost you, and what does it earn?" },
  { key: "route", name: "Route to market", prompt: "How does the first stranger hear about this?" },
  { key: "resources", name: "What it needs", prompt: "Money, tools, people, licences — what has to exist first?" },
  { key: "risks", name: "What could kill it", prompt: "What could kill this — the honest list, not the tidy one?" },
  { key: "next", name: "Next milestone", prompt: "What one thing would make this more real than it is today?" },
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

export type LegalStructure =
  | "sole_trader"
  | "ltd"
  | "partnership"
  | "llp"
  | "cic"
  | "charity"
  | "none_yet";

export const LEGAL_LABEL: Record<LegalStructure, string> = {
  sole_trader: "Sole trader",
  ltd: "Limited company",
  partnership: "Partnership",
  llp: "LLP",
  cic: "CIC",
  charity: "Charity",
  none_yet: "Not trading yet",
};

/** Matched against ventures.venture_group. */
export type VentureType =
  | "property"
  | "trade"
  | "retail"
  | "digital"
  | "service"
  | "charity"
  | "other";

/**
 * The facts the rulebook is keyed off. Every one nullable: NULL is "not
 * answered", and an unanswered fact generates no rule that depends on it —
 * never a guessed one. `wales` defaults true (all of Jay's property is in
 * Wales) and exists so the model does not hard-code that.
 */
export type ComplianceFacts = {
  type: VentureType | null;
  legal: LegalStructure | null;
  employsPeople: boolean | null;
  vatRegistered: boolean | null;
  wales?: boolean;
};

export type Cadence = "once" | "monthly" | "quarterly" | "annual" | "multi_year";

export const CADENCE_WORD: Record<Cadence, string> = {
  once: "One-off",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Every year",
  multi_year: "Every few years",
};

export type ComplianceRule = {
  key: string;
  title: string;
  /** Statutory obligations are red the moment they are overdue, at every tier. */
  obligation: boolean;
  cadence: Cadence;
  guidanceUrl: string;
  note?: string;
  /** Pure predicate over the facts — what makes generation deterministic. */
  applies: (f: ComplianceFacts) => boolean;
};

const isCompany = (l: LegalStructure | null) => l === "ltd" || l === "cic";
const filesSelfAssessment = (l: LegalStructure | null) =>
  l === "sole_trader" || l === "partnership" || l === "llp";

/**
 * The rulebook — UK, Wales-aware. Harvested from the parallel venture-module
 * branch (claude/new-session-lw4dmk), whose fact-predicate model covered the
 * things the first draft's structure/group matcher could not: employment
 * duties, VAT returns, Renting Homes (Wales) contracts, and the exact
 * council-tax/water-account failure the 18 Aug penalties came from.
 *
 * These are prompts with a guidance link each, NOT advice: thresholds and
 * deadlines move at every Budget, so anything with a penalty attached must
 * be confirmed against the linked guidance or an accountant before being
 * relied on. The UI says this in so many words.
 *
 * Vehicle tax / MOT / insurance are deliberately NOT rules here — the
 * `vehicles` table already owns those dates and the watchtower already
 * fires on them; a second copy is how the £8,317 class of bug starts.
 */
export const COMPLIANCE_RULES: ComplianceRule[] = [
  /* ── tax ─────────────────────────────────────────────────────────── */
  {
    key: "hmrc-register-self-employed",
    title: "Register with HMRC as self-employed",
    obligation: true,
    cadence: "once",
    note: "Due by 5 October after the tax year you started trading in.",
    guidanceUrl: "https://www.gov.uk/set-up-sole-trader",
    applies: (f) => filesSelfAssessment(f.legal) && f.legal !== "llp",
  },
  {
    key: "self-assessment-return",
    title: "File the Self Assessment return",
    obligation: true,
    cadence: "annual",
    note: "31 January online. £100 the day it is late, then £10 a day after three months.",
    guidanceUrl: "https://www.gov.uk/self-assessment-tax-returns/deadlines",
    applies: (f) => filesSelfAssessment(f.legal),
  },
  {
    key: "trading-allowance-check",
    title: "Check trading income against the trading allowance",
    obligation: false,
    cadence: "annual",
    note: "Below the allowance (£1,000 when written) there may be nothing to declare. Confirm the current figure.",
    guidanceUrl: "https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income",
    applies: (f) => f.legal === "sole_trader",
  },
  {
    key: "vat-threshold-watch",
    title: "Watch turnover against the VAT registration threshold",
    obligation: true,
    cadence: "monthly",
    note: "Rolling 12-month turnover. Registration is compulsory once it is crossed — check the current threshold.",
    guidanceUrl: "https://www.gov.uk/vat-registration/when-to-register",
    applies: (f) => f.vatRegistered !== true,
  },
  {
    key: "vat-return",
    title: "File the VAT return and pay",
    obligation: true,
    cadence: "quarterly",
    note: "One month and seven days after the period ends, under Making Tax Digital.",
    guidanceUrl: "https://www.gov.uk/vat-returns/deadlines",
    applies: (f) => f.vatRegistered === true,
  },
  {
    key: "corporation-tax-return",
    title: "File the company tax return (CT600) and pay corporation tax",
    obligation: true,
    cadence: "annual",
    note: "Payment is due 9 months and a day after the period ends; the return 12 months after.",
    guidanceUrl: "https://www.gov.uk/company-tax-returns",
    applies: (f) => isCompany(f.legal),
  },
  {
    key: "keep-records-six-years",
    title: "Keep the records where they can be found",
    obligation: true,
    cadence: "annual",
    note: "Business records must be kept — six years for a company, five after the filing deadline for Self Assessment.",
    guidanceUrl: "https://www.gov.uk/self-employed-records",
    applies: () => true,
  },

  /* ── company ─────────────────────────────────────────────────────── */
  {
    key: "confirmation-statement",
    title: "File the confirmation statement",
    obligation: true,
    cadence: "annual",
    note: "At least once every 12 months. Late filing can lead to the company being struck off.",
    guidanceUrl: "https://www.gov.uk/guidance/confirmation-statement",
    applies: (f) => isCompany(f.legal) || f.legal === "llp",
  },
  {
    key: "annual-accounts",
    title: "File the annual accounts at Companies House",
    obligation: true,
    cadence: "annual",
    note: "Nine months after the year end. The penalty starts at £150 and multiplies if it happens twice.",
    guidanceUrl: "https://www.gov.uk/annual-accounts",
    applies: (f) => isCompany(f.legal) || f.legal === "llp",
  },
  {
    key: "psc-register",
    title: "Keep the register of people with significant control current",
    obligation: true,
    cadence: "annual",
    note: "Changes must be recorded and notified, not just remembered.",
    guidanceUrl: "https://www.gov.uk/guidance/people-with-significant-control-psc",
    applies: (f) => isCompany(f.legal),
  },
  {
    key: "director-self-assessment",
    title: "Directors' own Self Assessment",
    obligation: true,
    cadence: "annual",
    note: "Dividends and salary are personal income and are declared personally.",
    guidanceUrl: "https://www.gov.uk/self-assessment-tax-returns",
    applies: (f) => isCompany(f.legal),
  },
  {
    key: "cic-annual-report",
    title: "File the CIC annual community interest report (CIC34)",
    obligation: true,
    cadence: "annual",
    note: "Filed with the accounts, with the fee.",
    guidanceUrl: "https://www.gov.uk/government/publications/community-interest-companies-business-activities",
    applies: (f) => f.legal === "cic",
  },
  {
    key: "charity-annual-return",
    title: "File the charity annual return",
    obligation: true,
    cadence: "annual",
    note: "Ten months after the financial year end, to the Charity Commission.",
    guidanceUrl: "https://www.gov.uk/guidance/prepare-a-charity-annual-return",
    applies: (f) => f.legal === "charity" || f.type === "charity",
  },
  {
    key: "ico-data-protection-fee",
    title: "Pay the ICO data protection fee",
    obligation: true,
    cadence: "annual",
    note: "Required by most organisations processing personal data. Check the self-assessment tool before assuming exemption.",
    guidanceUrl: "https://ico.org.uk/for-organisations/data-protection-fee/",
    applies: () => true,
  },

  /* ── people ──────────────────────────────────────────────────────── */
  {
    key: "paye-registration",
    title: "Register as an employer for PAYE",
    obligation: true,
    cadence: "once",
    note: "Before the first payday, not after it.",
    guidanceUrl: "https://www.gov.uk/register-employer",
    applies: (f) => f.employsPeople === true,
  },
  {
    key: "rti-submission",
    title: "Send the RTI payroll submission",
    obligation: true,
    cadence: "monthly",
    note: "On or before each payday.",
    guidanceUrl: "https://www.gov.uk/running-payroll",
    applies: (f) => f.employsPeople === true,
  },
  {
    key: "pension-auto-enrolment",
    title: "Meet auto-enrolment duties and re-declare",
    obligation: true,
    cadence: "multi_year",
    note: "Re-enrolment and a re-declaration of compliance roughly every three years.",
    guidanceUrl: "https://www.thepensionsregulator.gov.uk/en/employers",
    applies: (f) => f.employsPeople === true,
  },
  {
    key: "employers-liability-insurance",
    title: "Hold employers' liability insurance",
    obligation: true,
    cadence: "annual",
    note: "Legally required from the first employee. The fine is per day without it.",
    guidanceUrl: "https://www.hse.gov.uk/pubns/hse40.htm",
    applies: (f) => f.employsPeople === true,
  },
  {
    key: "right-to-work-checks",
    title: "Keep right-to-work checks on file",
    obligation: true,
    cadence: "once",
    note: "Before the person starts, and kept for the duration plus two years.",
    guidanceUrl: "https://www.gov.uk/check-job-applicant-right-to-work",
    applies: (f) => f.employsPeople === true,
  },

  /* ── property (Wales) ────────────────────────────────────────────── */
  {
    key: "rsw-registration",
    title: "Register the landlord with Rent Smart Wales",
    obligation: true,
    cadence: "multi_year",
    note: "Registration and licensing are SEPARATE steps and both are mandatory in Wales. Renews every five years.",
    guidanceUrl: "https://www.rentsmart.gov.wales/en/register/",
    applies: (f) => f.type === "property" && f.wales !== false,
  },
  {
    key: "rsw-licence",
    title: "Hold a Rent Smart Wales licence (or use a licensed agent)",
    obligation: true,
    cadence: "multi_year",
    note: "Required to let or manage. Letting unlicensed is an offence and can block a possession claim.",
    guidanceUrl: "https://www.rentsmart.gov.wales/en/licence/",
    applies: (f) => f.type === "property" && f.wales !== false,
  },
  {
    key: "written-occupation-contract",
    title: "Issue the written occupation contract",
    obligation: true,
    cadence: "once",
    note: "Renting Homes (Wales) Act 2016 — within 14 days of occupation.",
    guidanceUrl: "https://www.gov.wales/housing-law-changing-renting-homes",
    applies: (f) => f.type === "property" && f.wales !== false,
  },
  {
    key: "gas-safety-certificate",
    title: "Gas safety check and certificate",
    obligation: true,
    cadence: "annual",
    note: "Every 12 months, by a Gas Safe engineer, copy to the occupier.",
    guidanceUrl: "https://www.hse.gov.uk/gas/landlords/",
    applies: (f) => f.type === "property",
  },
  {
    key: "eicr",
    title: "Electrical installation condition report (EICR)",
    obligation: true,
    cadence: "multi_year",
    note: "At least every five years, and at each change of occupation in Wales.",
    guidanceUrl: "https://www.gov.wales/electrical-safety-standards-rented-properties",
    applies: (f) => f.type === "property",
  },
  {
    key: "epc",
    title: "Valid EPC on the property",
    obligation: true,
    cadence: "multi_year",
    note: "Ten years, and check the current minimum band before letting.",
    guidanceUrl: "https://www.gov.uk/buy-sell-your-home/energy-performance-certificates",
    applies: (f) => f.type === "property",
  },
  {
    key: "smoke-and-co-alarms",
    title: "Smoke and carbon monoxide alarms fitted and tested",
    obligation: true,
    cadence: "annual",
    note: "Mains-wired interlinked smoke alarms are part of the fitness standard in Wales.",
    guidanceUrl: "https://www.gov.wales/renting-homes-fitness-human-habitation",
    applies: (f) => f.type === "property",
  },
  {
    key: "deposit-protection",
    title: "Protect the deposit and serve the prescribed information",
    obligation: true,
    cadence: "once",
    note: "Within 30 days. Failing it can cost up to three times the deposit.",
    guidanceUrl: "https://www.gov.uk/deposit-protection-schemes-and-landlords",
    applies: (f) => f.type === "property",
  },
  {
    key: "council-tax-and-utilities",
    title: "Council tax and utility accounts named to the right party",
    obligation: true,
    cadence: "annual",
    note: "Empty periods fall to the owner, and an unnamed water account is how a £185 bill becomes £681.",
    guidanceUrl: "https://www.gov.uk/council-tax/second-homes-and-empty-properties",
    applies: (f) => f.type === "property",
  },
  {
    key: "landlord-insurance",
    title: "Landlord buildings and liability insurance in force",
    obligation: false,
    cadence: "annual",
    note: "Not statutory, but a let property on residential cover is usually uninsured in practice.",
    guidanceUrl: "https://www.abi.org.uk/",
    applies: (f) => f.type === "property",
  },
  {
    key: "business-rates",
    title: "Business rates: bill known, payment plan honoured",
    obligation: true,
    cadence: "monthly",
    note: "A missed instalment can make the FULL balance due at once.",
    guidanceUrl: "https://www.gov.uk/introduction-to-business-rates",
    applies: (f) => f.type === "property" || f.type === "trade" || f.type === "retail",
  },

  /* ── trade and trading generally ─────────────────────────────────── */
  {
    key: "public-liability-insurance",
    title: "Public liability insurance in force",
    obligation: false,
    cadence: "annual",
    note: "Not statutory, but most commercial and domestic clients make it a condition of the job.",
    guidanceUrl: "https://www.abi.org.uk/",
    applies: (f) => f.type === "trade" || f.type === "service" || f.type === "retail",
  },
  {
    key: "cis-contractor-registration",
    title: "Register as a CIS contractor",
    obligation: true,
    cadence: "once",
    note:
      "If you pay subcontractors for construction work you are a contractor under the " +
      "Construction Industry Scheme, whatever your own structure. Registration is before " +
      "the first payment, and subcontractors must be verified with HMRC before you pay them.",
    guidanceUrl: "https://www.gov.uk/what-is-the-construction-industry-scheme",
    applies: (f) => f.type === "trade",
  },
  {
    key: "cis-monthly-return",
    title: "File the monthly CIS return",
    obligation: true,
    cadence: "monthly",
    note:
      "Due the 19th of each month, and due even in a month you paid nobody — a nil return " +
      "is still a return. The penalty is automatic from day one and stacks month on month, " +
      "which is what makes a monthly filing worse to forget than an annual one.",
    guidanceUrl: "https://www.gov.uk/what-you-must-do-as-a-cis-contractor/file-your-monthly-returns",
    applies: (f) => f.type === "trade",
  },
  {
    key: "waste-carrier-licence",
    title: "Register as a waste carrier",
    obligation: true,
    cadence: "multi_year",
    note: "Required to carry your own construction or garden waste. Natural Resources Wales in Wales.",
    guidanceUrl: "https://naturalresources.wales/permits-and-permissions/waste-carriers-brokers-and-dealers/",
    applies: (f) => f.type === "trade",
  },
  {
    key: "business-bank-account",
    title: "Separate bank account for the venture",
    obligation: false,
    cadence: "once",
    note: "Not required for a sole trader, and the thing that makes every figure above cheap to produce.",
    guidanceUrl: "https://www.gov.uk/set-up-sole-trader",
    applies: () => true,
  },
  {
    key: "terms-and-privacy",
    title: "Written terms and a privacy notice customers can read",
    obligation: true,
    cadence: "once",
    note: "Consumer rights information is required before a contract, and UK GDPR requires the privacy notice.",
    guidanceUrl: "https://www.gov.uk/online-and-distance-selling-for-businesses",
    applies: (f) => f.type === "digital" || f.type === "retail" || f.type === "service",
  },
];

/**
 * The deterministic generator: the same facts always produce the same list,
 * in the same order (sorted by key — nothing here reads a clock).
 *
 * - `none_yet` generates nothing: a venture not trading yet owes nothing,
 *   and prompting it to register with HMRC would be the system inventing an
 *   obligation.
 * - A null fact generates no rule that depends on it — never a guessed one.
 *   Defaulting structure to sole_trader would list the wrong statutes for
 *   anything incorporated (D6 in the brief).
 * - `existingRuleKeys` are skipped, so regenerating never duplicates and
 *   never un-ticks: a done item keeps its row and its done_at.
 */
export function generateChecklist(args: {
  facts: ComplianceFacts;
  existingRuleKeys: ReadonlySet<string>;
}): ComplianceRule[] {
  if (args.facts.legal === "none_yet") return [];
  return COMPLIANCE_RULES.filter(
    (r) => !args.existingRuleKeys.has(r.key) && r.applies(args.facts)
  ).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * What the generator would ask for that it does not have. `legal` is the one
 * that matters: a checklist built on the wrong structure quietly lists the
 * wrong statutes — worse than no checklist, because it looks like coverage.
 */
export function checklistGaps(facts: ComplianceFacts): string[] {
  const gaps: string[] = [];
  if (!facts.legal) gaps.push("legal structure");
  if (!facts.type) gaps.push("what kind of venture this is");
  if (facts.employsPeople == null) gaps.push("whether it employs anyone");
  if (facts.vatRegistered == null) gaps.push("whether it is VAT registered");
  return gaps;
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

/* ------------------------------------------------------------------ *
 * Area 4 · Task List
 *
 * Venture tasks live in venture_tasks and nowhere else. A task with a
 * do_date is READ by the day screen; it is never copied into
 * public.tasks. One row, two views — so there is no second copy to edit
 * and nothing that can drift out of step.
 *
 * Ordered, never blocking: sort_order carries the sequence Jay wants,
 * and nothing refuses to start because something above it is unfinished.
 * ------------------------------------------------------------------ */

export type VentureTaskStatus = "open" | "doing" | "done" | "dropped";
export type VentureTaskPriority = "low" | "normal" | "high";

export type VentureTaskRow = {
  id: string;
  title: string;
  status: VentureTaskStatus;
  priority: VentureTaskPriority;
  due_on: string | null;
  do_date: string | null;
  sort_order: number;
};

export const PRIORITY_RANK: Record<VentureTaskPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

export function isLive(t: { status: VentureTaskStatus }): boolean {
  return t.status === "open" || t.status === "doing";
}

/**
 * Overdue first — a date that has passed is the only thing here that
 * cannot be absorbed by tomorrow. Then whatever is dated for today, then
 * everything else in the order Jay put it in.
 */
export function sortVentureTasks<T extends VentureTaskRow>(
  tasks: T[],
  todayIso: string
): T[] {
  const bucket = (t: T): number => {
    if (t.due_on != null && t.due_on < todayIso) return 0;
    if (t.do_date != null && t.do_date <= todayIso) return 1;
    return 2;
  };
  return [...tasks].sort(
    (a, b) =>
      bucket(a) - bucket(b) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.sort_order - b.sort_order ||
      a.title.localeCompare(b.title)
  );
}

export function ventureTaskState(
  tasks: VentureTaskRow[],
  todayIso: string
): { open: number; done: number; overdue: number; today: number; nextDue: string | null } {
  let open = 0;
  let done = 0;
  let overdue = 0;
  let today = 0;
  let nextDue: string | null = null;

  for (const t of tasks) {
    if (t.status === "done") {
      done++;
      continue;
    }
    if (t.status === "dropped") continue;
    open++;
    if (t.do_date != null && t.do_date <= todayIso) today++;
    if (t.due_on != null) {
      if (t.due_on < todayIso) overdue++;
      else if (nextDue == null || t.due_on < nextDue) nextDue = t.due_on;
    }
  }
  return { open, done, overdue, today, nextDue };
}

/** The card subtitle. Overdue outranks everything — it is the only urgent state. */
export function taskCardLine(
  s: { open: number; overdue: number; today: number },
  legacy = 0
): string {
  if (s.open === 0 && legacy === 0) return "no open work";
  const parts: string[] = [];
  if (s.overdue > 0) parts.push(`${s.overdue} OVERDUE`);
  if (s.today > 0) parts.push(`${s.today} in today`);
  if (s.open > 0) parts.push(`${s.open} open`);
  if (legacy > 0) parts.push(`${legacy} in shared pool`);
  return parts.join(" · ");
}

/** Next free slot, so a new task lands at the bottom rather than the middle. */
export function nextSortOrder(tasks: { sort_order: number }[]): number {
  return tasks.reduce((max, t) => Math.max(max, t.sort_order), 0) + 10;
}
