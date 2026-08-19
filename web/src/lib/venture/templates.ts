/**
 * The checklist — the highest-value thing in this module, and the reason it
 * was built at all.
 *
 * Every penalty captured on 18 Aug 2026 — four DVLA notices, two Merthyr
 * liability orders, Dŵr Cymru's £185 escalating to £681, an unfiled return
 * running at £10 a day — was a KNOWN, DATED, FORESEEABLE obligation that
 * nothing was watching. Not one of them needed judgement. They needed a
 * list, and a list is a thing a computer is good at.
 *
 * ⚠️ VERIFY EVERY THRESHOLD BEFORE RELYING ON IT. VAT registration, the
 * trading allowance and filing deadlines move at each Budget, and the
 * figures below were written in August 2026. Every rule carries a
 * `guidance_url` pointing at GOV.UK for exactly this reason. Treat these
 * as a starting point, not as advice — and for anything with a penalty
 * attached, confirm against GOV.UK or an accountant before acting.
 */

import { type LegalStructure, type VentureType } from "./types";

export type Cadence = "once" | "monthly" | "quarterly" | "annual" | "multi_year";

export const CADENCE_WORD: Record<Cadence, string> = {
  once: "One-off",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Every year",
  multi_year: "Every few years",
};

export type ComplianceFacts = {
  type: VentureType | null;
  legal: LegalStructure | null;
  employsPeople: boolean | null;
  vatRegistered: boolean | null;
  /** Wales-specific rules apply to property let in Wales. */
  wales?: boolean;
  /** True when the venture already has vehicles on the `vehicles` table. */
  hasVehicles?: boolean;
};

export type ComplianceRule = {
  key: string;
  title: string;
  category: "tax" | "company" | "property" | "insurance" | "people" | "vehicle" | "trading";
  /** Statutory obligations are red the moment they are overdue, at every tier. */
  obligation: boolean;
  cadence: Cadence;
  note: string;
  guidance_url: string;
  /**
   * Rules whose dates already live somewhere else in THE BRAIN. These are
   * never written into the checklist — a second copy of an MOT date is a
   * second thing to keep in step, and the four DVLA notices came from
   * nobody watching the first copy, not from there being only one.
   */
  deferTo?: "vehicles";
  applies: (f: ComplianceFacts) => boolean;
};

const isCompany = (l: LegalStructure | null) => l === "ltd" || l === "cic";
const filesSelfAssessment = (l: LegalStructure | null) =>
  l === "sole_trader" || l === "partnership" || l === "llp";

/**
 * 28 rules. `applies` is a pure function of the facts, which is what makes
 * `generateChecklist` deterministic: the same answers always produce the
 * same list, on any day, in any order.
 */
export const COMPLIANCE_RULES: ComplianceRule[] = [
  /* ── tax ─────────────────────────────────────────────────────────── */
  {
    key: "hmrc-register-self-employed",
    title: "Register with HMRC as self-employed",
    category: "tax",
    obligation: true,
    cadence: "once",
    note: "Due by 5 October after the tax year you started trading in.",
    guidance_url: "https://www.gov.uk/set-up-sole-trader",
    applies: (f) => filesSelfAssessment(f.legal) && f.legal !== "llp",
  },
  {
    key: "self-assessment-return",
    title: "File the Self Assessment return",
    category: "tax",
    obligation: true,
    cadence: "annual",
    note: "31 January online. £100 the day it is late, then £10 a day after three months.",
    guidance_url: "https://www.gov.uk/self-assessment-tax-returns/deadlines",
    applies: (f) => filesSelfAssessment(f.legal),
  },
  {
    key: "trading-allowance-check",
    title: "Check trading income against the trading allowance",
    category: "tax",
    obligation: false,
    cadence: "annual",
    note: "Below the allowance (£1,000 when written) there may be nothing to declare. Confirm the current figure.",
    guidance_url: "https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income",
    applies: (f) => f.legal === "sole_trader",
  },
  {
    key: "vat-threshold-watch",
    title: "Watch turnover against the VAT registration threshold",
    category: "tax",
    obligation: true,
    cadence: "monthly",
    note: "Rolling 12-month turnover. Registration is compulsory once it is crossed — check the current threshold.",
    guidance_url: "https://www.gov.uk/vat-registration/when-to-register",
    applies: (f) => f.vatRegistered !== true,
  },
  {
    key: "vat-return",
    title: "File the VAT return and pay",
    category: "tax",
    obligation: true,
    cadence: "quarterly",
    note: "One month and seven days after the period ends, under Making Tax Digital.",
    guidance_url: "https://www.gov.uk/vat-returns/deadlines",
    applies: (f) => f.vatRegistered === true,
  },
  {
    key: "corporation-tax-return",
    title: "File the company tax return (CT600) and pay corporation tax",
    category: "tax",
    obligation: true,
    cadence: "annual",
    note: "Payment is due 9 months and a day after the period ends; the return 12 months after.",
    guidance_url: "https://www.gov.uk/company-tax-returns",
    applies: (f) => isCompany(f.legal),
  },
  {
    key: "keep-records-six-years",
    title: "Keep the records where they can be found",
    category: "tax",
    obligation: true,
    cadence: "annual",
    note: "Business records must be kept — six years for a company, five after the filing deadline for Self Assessment.",
    guidance_url: "https://www.gov.uk/self-employed-records",
    applies: () => true,
  },

  /* ── company ─────────────────────────────────────────────────────── */
  {
    key: "confirmation-statement",
    title: "File the confirmation statement",
    category: "company",
    obligation: true,
    cadence: "annual",
    note: "At least once every 12 months. Late filing can lead to the company being struck off.",
    guidance_url: "https://www.gov.uk/guidance/confirmation-statement",
    applies: (f) => isCompany(f.legal) || f.legal === "llp",
  },
  {
    key: "annual-accounts",
    title: "File the annual accounts at Companies House",
    category: "company",
    obligation: true,
    cadence: "annual",
    note: "Nine months after the year end. The penalty starts at £150 and multiplies if it happens twice.",
    guidance_url: "https://www.gov.uk/annual-accounts",
    applies: (f) => isCompany(f.legal) || f.legal === "llp",
  },
  {
    key: "psc-register",
    title: "Keep the register of people with significant control current",
    category: "company",
    obligation: true,
    cadence: "annual",
    note: "Changes must be recorded and notified, not just remembered.",
    guidance_url: "https://www.gov.uk/guidance/people-with-significant-control-psc",
    applies: (f) => isCompany(f.legal),
  },
  {
    key: "director-self-assessment",
    title: "Directors' own Self Assessment",
    category: "company",
    obligation: true,
    cadence: "annual",
    note: "Dividends and salary are personal income and are declared personally.",
    guidance_url: "https://www.gov.uk/self-assessment-tax-returns",
    applies: (f) => isCompany(f.legal),
  },
  {
    key: "cic-annual-report",
    title: "File the CIC annual community interest report (CIC34)",
    category: "company",
    obligation: true,
    cadence: "annual",
    note: "Filed with the accounts, with the fee.",
    guidance_url: "https://www.gov.uk/government/publications/community-interest-companies-business-activities",
    applies: (f) => f.legal === "cic",
  },
  {
    key: "charity-annual-return",
    title: "File the charity annual return",
    category: "company",
    obligation: true,
    cadence: "annual",
    note: "Ten months after the financial year end, to the Charity Commission.",
    guidance_url: "https://www.gov.uk/guidance/prepare-a-charity-annual-return",
    applies: (f) => f.legal === "charity" || f.type === "charity",
  },
  {
    key: "ico-data-protection-fee",
    title: "Pay the ICO data protection fee",
    category: "company",
    obligation: true,
    cadence: "annual",
    note: "Required by most organisations processing personal data. Check the self-assessment tool before assuming exemption.",
    guidance_url: "https://ico.org.uk/for-organisations/data-protection-fee/",
    applies: () => true,
  },

  /* ── people ──────────────────────────────────────────────────────── */
  {
    key: "paye-registration",
    title: "Register as an employer for PAYE",
    category: "people",
    obligation: true,
    cadence: "once",
    note: "Before the first payday, not after it.",
    guidance_url: "https://www.gov.uk/register-employer",
    applies: (f) => f.employsPeople === true,
  },
  {
    key: "rti-submission",
    title: "Send the RTI payroll submission",
    category: "people",
    obligation: true,
    cadence: "monthly",
    note: "On or before each payday.",
    guidance_url: "https://www.gov.uk/running-payroll",
    applies: (f) => f.employsPeople === true,
  },
  {
    key: "pension-auto-enrolment",
    title: "Meet auto-enrolment duties and re-declare",
    category: "people",
    obligation: true,
    cadence: "multi_year",
    note: "Re-enrolment and a re-declaration of compliance roughly every three years.",
    guidance_url: "https://www.thepensionsregulator.gov.uk/en/employers",
    applies: (f) => f.employsPeople === true,
  },
  {
    key: "employers-liability-insurance",
    title: "Hold employers' liability insurance",
    category: "insurance",
    obligation: true,
    cadence: "annual",
    note: "Legally required from the first employee. The fine is per day without it.",
    guidance_url: "https://www.hse.gov.uk/pubns/hse40.htm",
    applies: (f) => f.employsPeople === true,
  },
  {
    key: "right-to-work-checks",
    title: "Keep right-to-work checks on file",
    category: "people",
    obligation: true,
    cadence: "once",
    note: "Before the person starts, and kept for the duration plus two years.",
    guidance_url: "https://www.gov.uk/check-job-applicant-right-to-work",
    applies: (f) => f.employsPeople === true,
  },

  /* ── property (Wales) ────────────────────────────────────────────── */
  {
    key: "rsw-registration",
    title: "Register the landlord with Rent Smart Wales",
    category: "property",
    obligation: true,
    cadence: "multi_year",
    note: "Registration and licensing are SEPARATE steps and both are mandatory in Wales. Renews every five years.",
    guidance_url: "https://www.rentsmart.gov.wales/en/register/",
    applies: (f) => f.type === "property" && f.wales !== false,
  },
  {
    key: "rsw-licence",
    title: "Hold a Rent Smart Wales licence (or use a licensed agent)",
    category: "property",
    obligation: true,
    cadence: "multi_year",
    note: "Required to let or manage. Letting unlicensed is an offence and can block a possession claim.",
    guidance_url: "https://www.rentsmart.gov.wales/en/licence/",
    applies: (f) => f.type === "property" && f.wales !== false,
  },
  {
    key: "written-occupation-contract",
    title: "Issue the written occupation contract",
    category: "property",
    obligation: true,
    cadence: "once",
    note: "Renting Homes (Wales) Act 2016 — within 14 days of occupation.",
    guidance_url: "https://www.gov.wales/housing-law-changing-renting-homes",
    applies: (f) => f.type === "property" && f.wales !== false,
  },
  {
    key: "gas-safety-certificate",
    title: "Gas safety check and certificate",
    category: "property",
    obligation: true,
    cadence: "annual",
    note: "Every 12 months, by a Gas Safe engineer, copy to the occupier.",
    guidance_url: "https://www.hse.gov.uk/gas/landlords/",
    applies: (f) => f.type === "property",
  },
  {
    key: "eicr",
    title: "Electrical installation condition report (EICR)",
    category: "property",
    obligation: true,
    cadence: "multi_year",
    note: "At least every five years, and at each change of occupation in Wales.",
    guidance_url: "https://www.gov.wales/electrical-safety-standards-rented-properties",
    applies: (f) => f.type === "property",
  },
  {
    key: "epc",
    title: "Valid EPC on the property",
    category: "property",
    obligation: true,
    cadence: "multi_year",
    note: "Ten years, and check the current minimum band before letting.",
    guidance_url: "https://www.gov.uk/buy-sell-your-home/energy-performance-certificates",
    applies: (f) => f.type === "property",
  },
  {
    key: "smoke-and-co-alarms",
    title: "Smoke and carbon monoxide alarms fitted and tested",
    category: "property",
    obligation: true,
    cadence: "annual",
    note: "Mains-wired interlinked smoke alarms are part of the fitness standard in Wales.",
    guidance_url: "https://www.gov.wales/renting-homes-fitness-human-habitation",
    applies: (f) => f.type === "property",
  },
  {
    key: "deposit-protection",
    title: "Protect the deposit and serve the prescribed information",
    category: "property",
    obligation: true,
    cadence: "once",
    note: "Within 30 days. Failing it can cost up to three times the deposit.",
    guidance_url: "https://www.gov.uk/deposit-protection-schemes-and-landlords",
    applies: (f) => f.type === "property",
  },
  {
    key: "council-tax-and-utilities",
    title: "Council tax and utility accounts named to the right party",
    category: "property",
    obligation: true,
    cadence: "annual",
    note: "Empty periods fall to the owner, and an unnamed water account is how a £185 bill becomes £681.",
    guidance_url: "https://www.gov.uk/council-tax/second-homes-and-empty-properties",
    applies: (f) => f.type === "property",
  },
  {
    key: "landlord-insurance",
    title: "Landlord buildings and liability insurance in force",
    category: "insurance",
    obligation: false,
    cadence: "annual",
    note: "Not statutory, but a let property on residential cover is usually uninsured in practice.",
    guidance_url: "https://www.abi.org.uk/",
    applies: (f) => f.type === "property",
  },

  /* ── trade and vehicles ──────────────────────────────────────────── */
  {
    key: "public-liability-insurance",
    title: "Public liability insurance in force",
    category: "insurance",
    obligation: false,
    cadence: "annual",
    note: "Not statutory, but most commercial and domestic clients make it a condition of the job.",
    guidance_url: "https://www.abi.org.uk/",
    applies: (f) => f.type === "trade" || f.type === "service" || f.type === "retail",
  },
  {
    key: "waste-carrier-licence",
    title: "Register as a waste carrier",
    category: "trading",
    obligation: true,
    cadence: "multi_year",
    note: "Required to carry your own construction or garden waste. Natural Resources Wales in Wales.",
    guidance_url: "https://naturalresources.wales/permits-and-permissions/waste-carriers-brokers-and-dealers/",
    applies: (f) => f.type === "trade",
  },
  {
    key: "vehicle-tax-mot-insurance",
    title: "Vehicle tax, MOT and insurance",
    category: "vehicle",
    obligation: true,
    cadence: "annual",
    deferTo: "vehicles",
    note: "Already tracked per vehicle in THE BRAIN — this is a pointer, not a second copy.",
    guidance_url: "https://www.gov.uk/check-vehicle-tax",
    applies: (f) => f.type === "trade" || f.type === "service",
  },

  /* ── trading generally ───────────────────────────────────────────── */
  {
    key: "business-bank-account",
    title: "Separate bank account for the venture",
    category: "trading",
    obligation: false,
    cadence: "once",
    note: "Not required for a sole trader, and the thing that makes every figure above cheap to produce.",
    guidance_url: "https://www.gov.uk/set-up-sole-trader",
    applies: () => true,
  },
  {
    key: "terms-and-privacy",
    title: "Written terms and a privacy notice customers can read",
    category: "trading",
    obligation: true,
    cadence: "once",
    note: "Consumer rights information is required before a contract, and UK GDPR requires the privacy notice.",
    guidance_url: "https://www.gov.uk/online-and-distance-selling-for-businesses",
    applies: (f) => f.type === "digital" || f.type === "retail" || f.type === "service",
  },
];

/* ── generation ───────────────────────────────────────────────────── */

export type ChecklistDraft = {
  rule_key: string;
  title: string;
  category: string;
  obligation: boolean;
  cadence: Cadence;
  note: string;
  guidance_url: string;
};

/**
 * Deterministic: the same facts always produce the same list, in the same
 * order. Nothing here reads a clock or a random number, which is what lets
 * "regenerate" be a safe button rather than a risky one.
 *
 * Regenerating never un-ticks anything: the caller upserts on
 * `(venture_id, rule_key)` and leaves `done` alone, and the unique index in
 * the migration is what makes that possible.
 *
 * Rules that defer to another part of THE BRAIN — the vehicle dates — are
 * excluded when that part already holds them. A second copy of an MOT date
 * is a second thing to keep in step.
 */
export function generateChecklist(
  facts: ComplianceFacts,
  opts: { includeDeferred?: boolean } = {}
): ChecklistDraft[] {
  return COMPLIANCE_RULES.filter((r) => {
    if (r.deferTo && !opts.includeDeferred) return false;
    return r.applies(facts);
  })
    .map((r) => ({
      rule_key: r.key,
      title: r.title,
      category: r.category,
      obligation: r.obligation,
      cadence: r.cadence,
      note: r.note,
      guidance_url: r.guidance_url,
    }))
    .sort((a, b) => a.rule_key.localeCompare(b.rule_key));
}

/**
 * What the generator would ask for that it does not have. `legal` is the
 * one that matters: `generateChecklist` cannot guess a structure, and a
 * checklist built on the wrong one quietly lists the wrong statutes — which
 * is worse than no checklist, because it looks like coverage.
 */
export function checklistGaps(facts: ComplianceFacts): string[] {
  const gaps: string[] = [];
  if (!facts.legal) gaps.push("legal structure");
  if (!facts.type) gaps.push("what kind of venture this is");
  if (facts.employsPeople == null) gaps.push("whether it employs anyone");
  if (facts.vatRegistered == null) gaps.push("whether it is VAT registered");
  return gaps;
}

/* ── KPI templates ────────────────────────────────────────────────── */

export type KpiTemplate = {
  name: string;
  unit: string | null;
  direction: "up" | "down";
  cadence: "weekly" | "monthly";
};

/**
 * Five per type, and five is the cap the database enforces. The number is
 * the decision: a venture with twelve measures has none, because nobody
 * reads twelve every week. These are a starting set to be edited, not a
 * standard to be met.
 */
export const KPI_TEMPLATES: Record<VentureType, KpiTemplate[]> = {
  property: [
    { name: "Rent collected", unit: "£", direction: "up", cadence: "monthly" },
    { name: "Arrears", unit: "£", direction: "down", cadence: "monthly" },
    { name: "Void days", unit: "days", direction: "down", cadence: "monthly" },
    { name: "Open repairs", unit: "jobs", direction: "down", cadence: "weekly" },
    { name: "Compliance items overdue", unit: "items", direction: "down", cadence: "weekly" },
  ],
  trade: [
    { name: "Jobs completed", unit: "jobs", direction: "up", cadence: "weekly" },
    { name: "Quotes sent", unit: "quotes", direction: "up", cadence: "weekly" },
    { name: "Quote win rate", unit: "%", direction: "up", cadence: "monthly" },
    { name: "Revenue", unit: "£", direction: "up", cadence: "monthly" },
    { name: "Unpaid invoices", unit: "£", direction: "down", cadence: "weekly" },
  ],
  retail: [
    { name: "Units sold", unit: "units", direction: "up", cadence: "weekly" },
    { name: "Revenue", unit: "£", direction: "up", cadence: "weekly" },
    { name: "Margin", unit: "%", direction: "up", cadence: "monthly" },
    { name: "Stock on hand", unit: "£", direction: "down", cadence: "monthly" },
    { name: "Returns", unit: "units", direction: "down", cadence: "monthly" },
  ],
  service: [
    { name: "Clients served", unit: "clients", direction: "up", cadence: "monthly" },
    { name: "Revenue", unit: "£", direction: "up", cadence: "monthly" },
    { name: "Hours delivered", unit: "hrs", direction: "up", cadence: "weekly" },
    { name: "Profit per hour", unit: "£/hr", direction: "up", cadence: "monthly" },
    { name: "Enquiries", unit: "enquiries", direction: "up", cadence: "weekly" },
  ],
  digital: [
    { name: "Active users", unit: "users", direction: "up", cadence: "weekly" },
    { name: "Paying customers", unit: "customers", direction: "up", cadence: "monthly" },
    { name: "Monthly recurring revenue", unit: "£", direction: "up", cadence: "monthly" },
    { name: "Churn", unit: "%", direction: "down", cadence: "monthly" },
    { name: "Hours spent building", unit: "hrs", direction: "up", cadence: "weekly" },
  ],
  charity: [
    { name: "People helped", unit: "people", direction: "up", cadence: "monthly" },
    { name: "Donations received", unit: "£", direction: "up", cadence: "monthly" },
    { name: "Costs", unit: "£", direction: "down", cadence: "monthly" },
    { name: "Volunteers active", unit: "people", direction: "up", cadence: "monthly" },
    { name: "Admin share of spend", unit: "%", direction: "down", cadence: "monthly" },
  ],
};

export const KPI_CAP = 5;

export function kpiTemplatesFor(type: VentureType | null): KpiTemplate[] {
  return type ? KPI_TEMPLATES[type] : [];
}

/* ── the plan skeleton ────────────────────────────────────────────── */

export type PlanSection = { key: string; title: string; prompt: string };

/**
 * Eight sections, each a question rather than a heading. A heading invites
 * prose; a question can be answered in a sentence, and a sentence is what
 * actually gets written at nine in the evening.
 */
export const PLAN_SECTIONS: PlanSection[] = [
  { key: "problem", title: "The problem", prompt: "Whose problem is this, and how do they currently live with it?" },
  { key: "offer", title: "The offer", prompt: "What exactly is being sold, and for how much?" },
  { key: "customer", title: "The customer", prompt: "Who pays, and where are they already looking?" },
  { key: "unit", title: "Unit economics", prompt: "What does one job cost you, and what does it earn?" },
  { key: "route", title: "Route to market", prompt: "How does the first stranger hear about this?" },
  { key: "resources", title: "What it needs", prompt: "Money, tools, people, licences — what has to exist first?" },
  { key: "risks", title: "What could kill it", prompt: "What could kill this — the honest list, not the tidy one?" },
  { key: "next", title: "Next milestone", prompt: "What one thing would make this more real than it is today?" },
];

export function planSectionTitle(key: string): string {
  return PLAN_SECTIONS.find((s) => s.key === key)?.title ?? key;
}

/** How much of the plan has been written, as a count rather than a score. */
export function planProgress(bodies: Record<string, string | null | undefined>): {
  written: number;
  total: number;
} {
  const written = PLAN_SECTIONS.filter((s) => (bodies[s.key] ?? "").trim() !== "").length;
  return { written, total: PLAN_SECTIONS.length };
}
