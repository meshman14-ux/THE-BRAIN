/**
 * The venture module — the five areas from Jay's handwritten note of
 * 19 Aug 2026: Document File · Business Plan · One-Page Summary · Task
 * List · Checklist.
 *
 * The rule this file exists to hold: **a venture only earns the fields it
 * can fill.** This repo already has thirty tables that were never written
 * to, and the failure was never the schema — it was uniform depth applied
 * to unequal things, which produces screens that are ninety percent empty
 * and teaches you to stop opening them.
 *
 * So an idea shows ONE card, not five disabled ones, and the areas it has
 * not earned get a single honest line rather than a greyed-out promise.
 */

/** Where a venture is in its life, and how much of the module it earns. */
export type Tier = "idea" | "validating" | "active" | "dormant";

export const TIERS: Tier[] = ["idea", "validating", "active", "dormant"];

export const TIER_LABEL: Record<Tier, string> = {
  idea: "Idea",
  validating: "Validating",
  active: "Active",
  dormant: "Dormant",
};

export const TIER_MEANING: Record<Tier, string> = {
  idea: "Written down. Nothing has been tested.",
  validating: "Being tested against reality — is anyone paying for this?",
  active: "Trading. It has numbers of its own.",
  dormant: "Deliberately not being worked on. Its obligations still are.",
};

/**
 * `tier` is separate from `ventures.stage` on purpose. `stage`
 * (idea · research · stabilise · launch · revenue) is read by /empire,
 * /estate and every division cockpit, and its baselines drive the progress
 * figures there. Repurposing it would have broken those screens silently,
 * which is the one failure mode nothing catches.
 */
export type AreaKey = "checklist" | "tasks" | "summary" | "plan" | "documents";

export const AREAS: AreaKey[] = ["checklist", "tasks", "summary", "plan", "documents"];

export type Area = {
  key: AreaKey;
  /** Jay's own words from the note. */
  title: string;
  /** The question this area answers. Nothing gets a card without one. */
  question: string;
  /** The tier at which the area becomes worth opening. */
  unlocksAt: Tier;
  /** What the card says when the venture has not earned it yet. */
  locked: string;
};

/**
 * Ordered by what a venture needs FIRST, which is not the order they were
 * written on the sheet. The checklist comes first at every tier because an
 * obligation does not wait for you to be ready — it is the one area whose
 * absence costs money, and every penalty captured on 18 Aug was a known,
 * dated obligation that nothing was watching.
 */
export const AREA_DEFS: Record<AreaKey, Area> = {
  checklist: {
    key: "checklist",
    title: "Checklist",
    question: "What must be done, by law or by landlord, and by when?",
    unlocksAt: "idea",
    locked: "",
  },
  tasks: {
    key: "tasks",
    title: "Task List",
    question: "What is the next move, and whose day does it land in?",
    unlocksAt: "validating",
    locked: "A task list arrives when this is being tested rather than considered.",
  },
  summary: {
    key: "summary",
    title: "One-Page Summary",
    question: "If someone asked what this is, what would you hand them?",
    unlocksAt: "validating",
    locked: "The summary writes itself from the plan and the numbers. Neither exists yet.",
  },
  plan: {
    key: "plan",
    title: "Business Plan",
    question: "How is this supposed to make money?",
    unlocksAt: "validating",
    locked: "A plan for something untested is fiction with headings.",
  },
  documents: {
    key: "documents",
    title: "Document File",
    question: "Where is the paperwork, and what expires?",
    unlocksAt: "active",
    locked: "Nothing generates paperwork until it trades.",
  },
};

const DEPTH: Record<Tier, number> = { idea: 0, validating: 1, active: 2, dormant: 2 };

/**
 * Does this venture earn this area yet?
 *
 * Dormant is deliberately as deep as active: a dormant venture keeps its
 * documents and its checklist, because a company that stopped trading did
 * not stop having a filing deadline. What it loses is the nagging, which
 * is a RAG question rather than an unlock one (see `scoring.ts`).
 */
export function areaUnlocked(area: AreaKey, tier: Tier | null): boolean {
  // Unsorted is treated as an idea: the floor, never the ceiling. Guessing
  // upward would open four empty cards on 23 ventures at once.
  const t: Tier = tier ?? "idea";
  if (t === "dormant" && (area === "tasks" || area === "plan" || area === "summary")) {
    // A dormant venture has no next move by definition, and its plan is a
    // record rather than a working document. Its obligations and its
    // paperwork are exactly what still matter.
    return area === "plan";
  }
  return DEPTH[t] >= DEPTH[AREA_DEFS[area].unlocksAt];
}

/** The areas a venture actually gets a card for, in the order above. */
export function areasFor(tier: Tier | null): Area[] {
  return AREAS.filter((k) => areaUnlocked(k, tier)).map((k) => AREA_DEFS[k]);
}

/** The ones it does not, so the page can say so in one line instead of five. */
export function lockedAreas(tier: Tier | null): Area[] {
  return AREAS.filter((k) => !areaUnlocked(k, tier)).map((k) => AREA_DEFS[k]);
}

/**
 * One honest line for everything this venture has not earned. Returns null
 * when it has earned everything — a sentence that congratulates you for
 * being complete is a sentence you learn to skip.
 */
export function lockedLine(tier: Tier | null): string | null {
  const locked = lockedAreas(tier);
  if (!locked.length) return null;
  const names = locked.map((a) => a.title.toLowerCase());
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `No ${list} yet — ${TIER_MEANING[tier ?? "idea"].toLowerCase()}`;
}

/* ── what a venture IS, which is a different question from where it is ── */

export type VentureType =
  | "property"
  | "trade"
  | "retail"
  | "service"
  | "digital"
  | "charity";

export const VENTURE_TYPES: VentureType[] = [
  "property",
  "trade",
  "retail",
  "service",
  "digital",
  "charity",
];

export const TYPE_LABEL: Record<VentureType, string> = {
  property: "Property",
  trade: "Trade",
  retail: "Retail",
  service: "Service",
  digital: "Digital",
  charity: "Charity",
};

export type LegalStructure =
  | "sole_trader"
  | "partnership"
  | "ltd"
  | "llp"
  | "cic"
  | "charity";

export const LEGAL_STRUCTURES: LegalStructure[] = [
  "sole_trader",
  "partnership",
  "ltd",
  "llp",
  "cic",
  "charity",
];

export const LEGAL_LABEL: Record<LegalStructure, string> = {
  sole_trader: "Sole trader",
  partnership: "Partnership",
  ltd: "Limited company",
  llp: "LLP",
  cic: "CIC",
  charity: "Charity",
};

/** The row as the module reads it. Every new column is nullable. */
export type VentureModuleRow = {
  id: string;
  name: string;
  status: string;
  stage: string;
  one_liner: string | null;
  external_system?: string | null;
  created_at?: string | null;
  venture_group: string | null;
  tier: string | null;
  irl: number | null;
  venture_type: string | null;
  legal_structure: string | null;
  employs_people: boolean | null;
  turnover_band: string | null;
  vat_registered: boolean | null;
  last_touched_at: string | null;
  dormant_since: string | null;
  kill_criteria: string | null;
};

/** `tier` is free text in the database as far as any reader is concerned. */
export function readTier(raw: string | null | undefined): Tier | null {
  return TIERS.includes(raw as Tier) ? (raw as Tier) : null;
}

export function readType(raw: string | null | undefined): VentureType | null {
  return VENTURE_TYPES.includes(raw as VentureType) ? (raw as VentureType) : null;
}

export function readLegal(raw: string | null | undefined): LegalStructure | null {
  return LEGAL_STRUCTURES.includes(raw as LegalStructure)
    ? (raw as LegalStructure)
    : null;
}

/**
 * The group a venture is sorted into. Free text so Jay can name his own —
 * the portfolio has to work before anyone has agreed a taxonomy.
 * `UNSORTED` is the honest bucket, never a guessed one.
 */
export const UNSORTED = "Not yet sorted";

export function groupOf(v: Pick<VentureModuleRow, "venture_group">): string {
  const g = (v.venture_group ?? "").trim();
  return g === "" ? UNSORTED : g;
}
