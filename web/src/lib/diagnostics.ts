/**
 * The diagnostic module — triage and deep-dive question banks, and the
 * arithmetic that turns answers into a health score.
 *
 * Three rules, inherited from the rest of the system:
 *
 *   1. Every answer is a number, a tap, or one line. Estimates are accepted
 *      and never punished — a rough answer beats an unanswered question.
 *   2. Skipping writes nothing. A skipped question is excluded from the
 *      score's basis entirely, and the score says so ("62 · 4 of 5
 *      signals") rather than pretending to a precision it doesn't have.
 *   3. The score is arithmetic over the answers. It is shown with its
 *      inputs and can be recomputed by hand. Nothing here is generated.
 *
 * Weights are EQUAL by Jay's decision (10 Aug 2026), to be tuned after
 * five or six real triages have shown which scores feel wrong.
 */

/* ------------------------------------------------------------------ *
 * Question model
 * ------------------------------------------------------------------ */

export type DiagChoice = {
  value: string;
  label: string;
  /** 0–10 contribution when this choice is picked. Only on scoreable Qs. */
  score?: number;
};

export type DiagQuestion = {
  /** Stable key — the answer's name in `answers` jsonb. Never rename. */
  key: string;
  /** Stage heading shown above the question. */
  stage: string;
  q: string;
  /** The hover text — why this is asked and how to answer it fast. */
  hint: string;
  type: "money" | "number" | "choice" | "text";
  choices?: DiagChoice[];
  placeholder?: string;
};

export type DiagAnswers = Record<string, string | number>;

/* ------------------------------------------------------------------ *
 * Venture triage — ten questions, ~5 minutes
 * Money framed as a typical month (Jay's pick): answerable from memory,
 * matching the monthly rhythm the debts update uses.
 * ------------------------------------------------------------------ */

export const VENTURE_TRIAGE: DiagQuestion[] = [
  {
    key: "rev_month",
    stage: "Money",
    q: "Revenue in a typical month?",
    hint: "A from-memory estimate is fine — rough beats blank. Typical means the month you'd call normal, not the best one. If it's genuinely zero, zero is an answer; if you don't know, skip and the score will say so.",
    type: "money",
    placeholder: "£ typical month",
  },
  {
    key: "cost_month",
    stage: "Money",
    q: "Costs in a typical month?",
    hint: "Everything it takes to run — stock, fuel, subs, wages, storage. Same rule: estimate freely. Together with revenue this becomes the margin signal, one of the five the score is built from.",
    type: "money",
    placeholder: "£ typical month",
  },
  {
    key: "hours_week",
    stage: "Your time",
    q: "Your hours in a typical week?",
    hint: "Deliberately NOT part of the health score — hard work can mask a sick venture. This feeds the LIFE_OS bandwidth map instead: 18 ventures' hours added up against the week you actually have.",
    type: "number",
    placeholder: "hours / week",
  },
  {
    key: "runs_without",
    stage: "Your time",
    q: "Does it run without you?",
    hint: "The owner-dependency signal. 'Mostly' means it survives you being away a fortnight; 'briefly' means days; 'never' means the venture is you wearing a trading name. Weighted equally with the other four signals.",
    type: "choice",
    choices: [
      { value: "never", label: "Never — it is me", score: 2 },
      { value: "briefly", label: "Briefly — days, not weeks", score: 5 },
      { value: "mostly", label: "Mostly — it runs", score: 9 },
    ],
  },
  {
    key: "bottleneck",
    stage: "Flow",
    q: "The single biggest bottleneck?",
    hint: "One line. Where does work pile up, wait, or die — quoting, capacity, cash, a person, a machine? On the finish screen this can become a real task with one tap.",
    type: "text",
    placeholder: "one line",
  },
  {
    key: "risk",
    stage: "Flow",
    q: "The risk most likely to kill it?",
    hint: "Not every risk — the one. A customer that is 80% of revenue, a platform that could close the account, a licence, a single supplier, your back giving out. Also one tap from becoming a task at the end.",
    type: "text",
    placeholder: "one line",
  },
  {
    key: "pipeline",
    stage: "Flow",
    q: "Pipeline — what's lined up?",
    hint: "Work booked, stock ready to sell, tenants in place — whatever 'lined up' means for this venture. 'Healthy' is roughly a month or more of forward visibility; 'thin' is living week to week; 'none' is starting from zero each morning.",
    type: "choice",
    choices: [
      { value: "none", label: "None — hand to mouth", score: 2 },
      { value: "thin", label: "Thin — a week or two", score: 5 },
      { value: "healthy", label: "Healthy — a month plus", score: 9 },
    ],
  },
  {
    key: "sops",
    stage: "Process",
    q: "Are the SOPs written down?",
    hint: "Could someone competent run a normal day from what is written, without ringing you? 'Key ones' counts — the openers and closers matter more than documenting everything. This is the signal that predicts whether 'runs without you' can ever improve.",
    type: "choice",
    choices: [
      { value: "none", label: "Nothing written", score: 2 },
      { value: "some", label: "Some, scattered", score: 5 },
      { value: "key", label: "The key ones exist", score: 8 },
    ],
  },
  {
    key: "milestone",
    stage: "Direction",
    q: "Next milestone, and when?",
    hint: "The next thing that would make this venture materially better, with a rough date. 'Fourth property let by March' or 'first £2k month by summer'. Vague is allowed; absent is information too. Becomes a task on the finish screen if you want it to.",
    type: "text",
    placeholder: "what · roughly when",
  },
  {
    key: "trend",
    stage: "Direction",
    q: "Gut check — which way is it moving?",
    hint: "Not the spreadsheet — your gut. Owners usually know before the numbers do, which is exactly why this is asked last, after the numbers have warmed the judgement up.",
    type: "choice",
    choices: [
      { value: "declining", label: "Declining", score: 2 },
      { value: "flat", label: "Flat", score: 5 },
      { value: "growing", label: "Growing", score: 9 },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Life-area triage — eight questions, same shape
 * ------------------------------------------------------------------ */

export const AREA_TRIAGE: DiagQuestion[] = [
  {
    key: "state",
    stage: "Where it is",
    q: "Where is this area right now?",
    hint: "Gut answer, five levels. This is the same 0–10 scale the area bars use, folded to five taps so it costs nothing to answer.",
    type: "choice",
    choices: [
      { value: "bad", label: "Bad", score: 1 },
      { value: "poor", label: "Poor", score: 3 },
      { value: "okay", label: "Okay", score: 5 },
      { value: "good", label: "Good", score: 7 },
      { value: "strong", label: "Strong", score: 9 },
    ],
  },
  {
    key: "standard",
    stage: "Where it is",
    q: "Against the standard you set — behind, at, or above?",
    hint: "Every area carries a written standard (the defining field of the pillar). This asks about THAT, not about perfection: the standard is yours, so being at it is a pass, not a participation prize.",
    type: "choice",
    choices: [
      { value: "behind", label: "Behind it", score: 2 },
      { value: "at", label: "At it", score: 6 },
      { value: "above", label: "Above it", score: 9 },
    ],
  },
  {
    key: "friction",
    stage: "What's in the way",
    q: "The biggest friction?",
    hint: "One line. The thing that makes this area harder than it should be — time, money, another person, a missing habit, plain avoidance. Can become a task on the finish screen.",
    type: "text",
    placeholder: "one line",
  },
  {
    key: "helping",
    stage: "What's in the way",
    q: "One habit that is helping?",
    hint: "Worth naming because the weekly review can then protect it. If nothing comes to mind, skip — that is itself worth knowing.",
    type: "text",
    placeholder: "one line",
  },
  {
    key: "hurting",
    stage: "What's in the way",
    q: "One habit that is hurting?",
    hint: "The honest one. Late nights, the phone, the takeaway run, the skipped session. Nothing here is scored — it is raw material for the Mind & Growth cross-map.",
    type: "text",
    placeholder: "one line",
  },
  {
    key: "hours_week",
    stage: "Bandwidth",
    q: "Hours this area actually gets in a week?",
    hint: "Attention is the budget. Like the venture hours question, this is not scored — it feeds the bandwidth map, where all thirteen areas' hours are added up against a real week.",
    type: "number",
    placeholder: "hours / week",
  },
  {
    key: "next_step",
    stage: "Direction",
    q: "The next improvement, and roughly when?",
    hint: "Small and dated beats grand and floating. 'Book the dentist this week' is a better answer than 'transform my health'.",
    type: "text",
    placeholder: "what · roughly when",
  },
  {
    key: "trend",
    stage: "Direction",
    q: "Which way is it moving?",
    hint: "The same gut check the ventures get. Trend matters more than level — a poor area improving is in better shape than a good one quietly slipping.",
    type: "choice",
    choices: [
      { value: "declining", label: "Declining", score: 2 },
      { value: "flat", label: "Flat", score: 5 },
      { value: "improving", label: "Improving", score: 9 },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Deep-dive bank — ventures, four stages (~20 questions)
 * Unlockable from any triaged venture; the picker nudges worst-first.
 * Deep answers enrich the record and the finish-screen tasks; the health
 * score stays a triage instrument, so re-triage is what moves the number.
 * ------------------------------------------------------------------ */

export const VENTURE_DEEP: DiagQuestion[] = [
  /* -- operations -------------------------------------------------- */
  {
    key: "op_stages",
    stage: "Operations",
    q: "Walk the work through — what are the stages from enquiry to paid?",
    hint: "One line per stage, commas fine: 'enquiry, quote, book, do, invoice, chase, paid'. This becomes the process map every later answer hangs off.",
    type: "text",
    placeholder: "stage, stage, stage…",
  },
  {
    key: "op_slowest",
    stage: "Operations",
    q: "Which stage is slowest, and why?",
    hint: "The stage where things wait. Usually quoting, chasing, or anything that needs you personally.",
    type: "text",
    placeholder: "stage · why",
  },
  {
    key: "op_dropped",
    stage: "Operations",
    q: "Where does work get lost or dropped?",
    hint: "Enquiries never answered, quotes never followed up, jobs finished but never invoiced. The leak is usually between stages, not inside them.",
    type: "text",
    placeholder: "one line",
  },
  {
    key: "op_team",
    stage: "Operations",
    q: "Who else works in it, and what do they own?",
    hint: "Names and what each actually owns end-to-end. 'Helps out' is not ownership — if every decision routes through you, write that.",
    type: "text",
    placeholder: "who · owns what (or 'just me')",
  },
  {
    key: "op_tools",
    stage: "Operations",
    q: "What tools and systems run it day to day?",
    hint: "Phone notes, WhatsApp, a spreadsheet, Xero, a diary — the honest list. Duplicated entry between two tools is the usual automation win hiding in this answer.",
    type: "text",
    placeholder: "the honest list",
  },
  {
    key: "op_automate",
    stage: "Operations",
    q: "One thing you do repeatedly that a machine should do?",
    hint: "The task you have done fifty times identically. Invoicing, reminders, listing relists, booking confirmations. One is enough — it becomes a task on the finish screen.",
    type: "text",
    placeholder: "one line",
  },
  /* -- forensics ---------------------------------------------------- */
  {
    key: "fin_streams",
    stage: "Forensics",
    q: "Where does the money actually come from — the top two or three streams?",
    hint: "Rough split in percentages: 'lettings 70, maintenance jobs 30'. Concentration is the point — one stream at 80%+ is a finding.",
    type: "text",
    placeholder: "stream %, stream %",
  },
  {
    key: "fin_concentration",
    stage: "Forensics",
    q: "Biggest single customer or platform — what share are they?",
    hint: "The dependency question. A customer, Amazon, one letting agent, one contract. Above ~40% the venture has a landlord of its own.",
    type: "choice",
    choices: [
      { value: "low", label: "Under a quarter", score: 9 },
      { value: "mid", label: "Quarter to half", score: 5 },
      { value: "high", label: "Over half", score: 2 },
    ],
  },
  {
    key: "fin_fixed",
    stage: "Forensics",
    q: "Fixed costs in a typical month — the ones that land whether or not you trade?",
    hint: "Rent, finance payments, insurance, subs, storage. This is the venture's own survival floor: the number it must clear before a single good month counts.",
    type: "money",
    placeholder: "£ / month",
  },
  {
    key: "fin_cash_gap",
    stage: "Forensics",
    q: "How long between doing the work and being paid?",
    hint: "The cashflow gap. Same-day card takings and 60-day invoices are different businesses even at identical revenue.",
    type: "choice",
    choices: [
      { value: "same", label: "Same day", score: 9 },
      { value: "weeks", label: "A few weeks", score: 6 },
      { value: "month_plus", label: "A month or more", score: 3 },
    ],
  },
  {
    key: "fin_price",
    stage: "Forensics",
    q: "When did prices last change, and what happens if they rise 10%?",
    hint: "Honest guess at the reaction: nothing / grumbles / lose some / lose plenty. Most owner-run ventures are underpriced by exactly the amount they fear to test.",
    type: "text",
    placeholder: "last change · likely reaction",
  },
  {
    key: "fin_competitors",
    stage: "Forensics",
    q: "Who takes the work you don't get, and why do they win?",
    hint: "Price, speed, reputation, relationships, being findable. 'I don't know' is a finding — it means lost work is invisible.",
    type: "text",
    placeholder: "who · why they win",
  },
  /* -- risk & constraints ------------------------------------------- */
  {
    key: "risk_single_points",
    stage: "Risk",
    q: "Single points of failure — what breaks it if it disappears tomorrow?",
    hint: "A person (usually you), a vehicle, an account, a certification, one supplier, one property. List what has no backup.",
    type: "text",
    placeholder: "the no-backup list",
  },
  {
    key: "risk_compliance",
    stage: "Risk",
    q: "Anything legal, tax, insurance or certification shaped hanging over it?",
    hint: "Gas certs, EPCs, CIS, VAT thresholds, platform policy, licences. Not an accusation — a listing. These become dated tasks so renewals are seen coming, the same logic as the Vehicles area.",
    type: "text",
    placeholder: "one line (or 'clear')",
  },
  {
    key: "risk_worst_month",
    stage: "Risk",
    q: "Describe the worst realistic month — what triggers it and what does it cost?",
    hint: "Not the apocalypse, the plausible bad month: void + boiler, account suspension, big job cancels. The answer sizes the buffer this venture needs.",
    type: "text",
    placeholder: "trigger · rough cost",
  },
  {
    key: "risk_exit",
    stage: "Risk",
    q: "If you had to stop tomorrow, what happens to it?",
    hint: "Sellable, transferable, windable-down, or it simply evaporates? Evaporating is fine for some ventures — but it should be a choice, not a surprise.",
    type: "choice",
    choices: [
      { value: "sellable", label: "Sellable as a business", score: 9 },
      { value: "transferable", label: "Transferable with effort", score: 6 },
      { value: "evaporates", label: "It evaporates", score: 3 },
    ],
  },
  /* -- LIFE_OS cross-map -------------------------------------------- */
  {
    key: "life_energy",
    stage: "LIFE cross-map",
    q: "Does this venture give you energy or take it?",
    hint: "Separate from the money. A profitable venture that drains you is a different problem from an unprofitable one you love — and the portfolio needs to know which is which.",
    type: "choice",
    choices: [
      { value: "gives", label: "Gives energy", score: 9 },
      { value: "neutral", label: "Neutral", score: 6 },
      { value: "takes", label: "Takes energy", score: 3 },
    ],
  },
  {
    key: "life_conflict",
    stage: "LIFE cross-map",
    q: "What does it collide with — which life area pays for this venture?",
    hint: "Training, family, sleep, another venture. Every venture is funded by hours from somewhere; name the somewhere.",
    type: "text",
    placeholder: "one line",
  },
  {
    key: "life_why",
    stage: "LIFE cross-map",
    q: "Why this venture — honestly?",
    hint: "Income, freedom, identity, proving something, momentum from a decision made years ago. No wrong answer, but 'I've just always done it' is worth knowing about a venture consuming ten hours a week.",
    type: "text",
    placeholder: "one honest line",
  },
  {
    key: "life_keep",
    stage: "LIFE cross-map",
    q: "Knowing everything above — grow it, hold it, fix it, or exit it?",
    hint: "The only question that is really a decision. The diagnostic exists to make this one answerable; the finish screen turns it into the venture's declared direction.",
    type: "choice",
    choices: [
      { value: "grow", label: "Grow it" },
      { value: "hold", label: "Hold it" },
      { value: "fix", label: "Fix it" },
      { value: "exit", label: "Exit it" },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Scoring — equal weights, skip-excluded, confidence carried
 * ------------------------------------------------------------------ */

export type TriageScore = {
  /** 0–100, or null when nothing scoreable was answered. */
  score: number | null;
  /** How many of the signals had data. */
  answered: number;
  ofTotal: number;
};

/** 0–10 for the margin signal, from typical-month revenue and costs. */
export function marginSignal(
  rev: number | null | undefined,
  cost: number | null | undefined
): number | null {
  if (rev == null || cost == null) return null;
  if (rev <= 0) return cost > 0 ? 0 : null; // no revenue: costing money is 0; dormant is no signal
  const margin = (rev - cost) / rev; // can be negative
  if (margin <= -0.25) return 0;
  if (margin <= 0) return 2;
  if (margin < 0.1) return 4;
  if (margin < 0.25) return 6;
  if (margin < 0.5) return 8;
  return 10;
}

function choiceSignal(
  bank: DiagQuestion[],
  answers: DiagAnswers,
  key: string
): number | null {
  const q = bank.find((x) => x.key === key);
  const v = answers[key];
  if (!q?.choices || v == null) return null;
  const c = q.choices.find((x) => x.value === v);
  return c?.score ?? null;
}

const asNum = (v: string | number | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The venture triage score: five equal signals — margin, autonomy,
 * pipeline, SOPs, trend. Hours are deliberately absent (they feed the
 * bandwidth map, not the score: hard work must never mask a sick venture).
 */
export function ventureTriageScore(answers: DiagAnswers): TriageScore {
  const signals = [
    marginSignal(asNum(answers.rev_month), asNum(answers.cost_month)),
    choiceSignal(VENTURE_TRIAGE, answers, "runs_without"),
    choiceSignal(VENTURE_TRIAGE, answers, "pipeline"),
    choiceSignal(VENTURE_TRIAGE, answers, "sops"),
    choiceSignal(VENTURE_TRIAGE, answers, "trend"),
  ];
  return fold(signals);
}

/** The area triage score: three equal signals — state, standard, trend. */
export function areaTriageScore(answers: DiagAnswers): TriageScore {
  const signals = [
    choiceSignal(AREA_TRIAGE, answers, "state"),
    choiceSignal(AREA_TRIAGE, answers, "standard"),
    choiceSignal(AREA_TRIAGE, answers, "trend"),
  ];
  return fold(signals);
}

function fold(signals: (number | null)[]): TriageScore {
  const present = signals.filter((s): s is number => s != null);
  if (present.length === 0)
    return { score: null, answered: 0, ofTotal: signals.length };
  const mean = present.reduce((a, b) => a + b, 0) / present.length;
  return {
    score: Math.round(mean * 10),
    answered: present.length,
    ofTotal: signals.length,
  };
}

/** Map a 0–100 score onto the existing `ventures.health` 1–5 field. */
export function healthFromScore(score: number): number {
  return Math.min(5, Math.max(1, Math.ceil(score / 20)));
}

/** "62 · 4 of 5 signals" — the score never hides how thin it is. */
export function scoreBasisLine(s: TriageScore): string {
  if (s.score == null) return `no score yet · 0 of ${s.ofTotal} signals`;
  return `${s.score} · ${s.answered} of ${s.ofTotal} signals`;
}

/**
 * Which text answers are offered as tasks on the finish screen, with the
 * verb that frames them. Nothing is created automatically — each is one
 * tap, and untapped answers stay answers.
 */
export function taskCandidates(
  bank: DiagQuestion[],
  answers: DiagAnswers
): { key: string; title: string }[] {
  const FRAME: Record<string, string> = {
    bottleneck: "Fix the bottleneck",
    risk: "Mitigate the risk",
    milestone: "Milestone",
    friction: "Remove the friction",
    next_step: "Next step",
    op_automate: "Automate",
    risk_compliance: "Compliance",
  };
  return bank
    .filter((q) => q.type === "text" && FRAME[q.key] && answers[q.key])
    .map((q) => ({
      key: q.key,
      title: `${FRAME[q.key]}: ${String(answers[q.key]).slice(0, 120)}`,
    }));
}

/** The banks, addressable by subject + kind. */
export function bankFor(
  subject: "venture" | "area",
  kind: "triage" | "deep"
): DiagQuestion[] {
  if (subject === "area") return AREA_TRIAGE; // deep bank for areas: later, content not migration
  return kind === "deep" ? VENTURE_DEEP : VENTURE_TRIAGE;
}

/* ------------------------------------------------------------------ *
 * Seeding — the answers become the backlog
 * ------------------------------------------------------------------ */

/** The finish screen's shape, carried across runs. */
export type SeedSuggestion = {
  runId: string;
  key: string;
  /** Exactly the title the Add tap will create — dedup depends on it. */
  title: string;
  pillarId: string | null;
  subjectName: string;
};

export type SeedRun = {
  id: string;
  subject_type: "venture" | "area";
  subject_id: string;
  kind: "triage" | "deep";
  answers: unknown;
  meta: unknown;
  completed_at: string | null;
};

/** `meta` is jsonb — validate, never trust (§A7). */
export function dismissedKeys(meta: unknown): string[] {
  if (typeof meta !== "object" || meta == null) return [];
  const d = (meta as { dismissed_suggestions?: unknown }).dismissed_suggestions;
  if (!Array.isArray(d)) return [];
  return d.filter((k): k is string => typeof k === "string");
}

/**
 * Every task the completed diagnostics are still offering, across all runs.
 *
 * The finish screen already offers one run's answers back as tasks; this is
 * that same offer made standing. The endowed-progress evidence (Nunes &
 * Drèze) is the why: confirming a pre-made row populates a system roughly
 * ten times faster than a blank form, and the diagnostic answers are the
 * best pre-made rows the system holds — Jay already said these things are
 * wrong, in his own words.
 *
 * Discipline unchanged from the finish screen: every suggestion is one tap,
 * nothing is created automatically, and a dismissal is remembered in the
 * run's own `meta` so declining is as durable as accepting. Only the LATEST
 * completed run per subject-and-kind speaks — a re-triage supersedes its
 * predecessor's opinions rather than stacking with them. A suggestion whose
 * exact title already exists as a task is silently satisfied: creating the
 * task IS the dedup, so nothing needs a second bookkeeping table.
 */
export function seedSuggestions(
  runs: SeedRun[],
  ventures: { id: string; name: string; pillar_id: string | null }[],
  pillars: { id: string; name: string; emoji?: string | null }[],
  existingTaskTitles: string[]
): SeedSuggestion[] {
  const ventureById = new Map(ventures.map((v) => [v.id, v]));
  const pillarById = new Map(pillars.map((p) => [p.id, p]));
  const existing = new Set(existingTaskTitles);

  // Latest completed run per subject+kind.
  const latest = new Map<string, SeedRun>();
  for (const r of runs) {
    if (!r.completed_at) continue;
    const slot = `${r.subject_type}:${r.subject_id}:${r.kind}`;
    const held = latest.get(slot);
    if (!held || r.completed_at > (held.completed_at ?? "")) latest.set(slot, r);
  }

  const out: SeedSuggestion[] = [];
  for (const r of latest.values()) {
    const subject =
      r.subject_type === "venture"
        ? ventureById.get(r.subject_id)
        : pillarById.get(r.subject_id);
    if (!subject) continue; // a run whose subject is gone offers nothing
    const answers =
      typeof r.answers === "object" && r.answers != null
        ? (r.answers as DiagAnswers)
        : {};
    const dismissed = new Set(dismissedKeys(r.meta));
    for (const c of taskCandidates(bankFor(r.subject_type, r.kind), answers)) {
      if (dismissed.has(c.key)) continue;
      const title = `${subject.name} — ${c.title}`;
      if (existing.has(title)) continue;
      out.push({
        runId: r.id,
        key: c.key,
        title,
        pillarId:
          r.subject_type === "venture"
            ? (subject as { pillar_id: string | null }).pillar_id
            : r.subject_id,
        subjectName: subject.name,
      });
    }
  }
  return out;
}
