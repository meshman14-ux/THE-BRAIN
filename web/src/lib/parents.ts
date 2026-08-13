/* ------------------------------------------------------------------ *
 * PARENT AREAS — the compression, and the contract
 *
 * THE BRAIN, LIFE_OS and EMPIRE_OS stay exactly as they are. What changes
 * is that each subsystem stops being a flat pile of pages and becomes five
 * PARENT AREAS, each holding its own sub-modules inside it.
 *
 * LIFE_OS was eleven flat nav entries, six of which were sub-modules
 * wearing a nav item: Vehicles is part of Money, Health and Food are parts
 * of Body, Habits is part of Standing. A nav that lists sub-modules
 * alongside their parents has no hierarchy, which is a nav you scan
 * instead of read — and the filing error is not cosmetic. A vehicle is a
 * recurring cost and a set of legal deadlines. Filing it as neither of
 * those, filing it as "a vehicle", is precisely why four MOT dates sat
 * unrecorded for months and one of them lapsed.
 *
 * WHAT THIS FILE IS NOT. It holds the registry and the shape of the
 * contract. It does not compute anything about Jay — `reports.ts` does
 * that, and `reports.ts` calls the contracts that already exist rather
 * than deriving a second opinion. That division is the whole point: a
 * command centre that re-derives what its subsystems already computed
 * becomes a second copy of them, and a second copy is a thing that
 * disagrees with the original within a month.
 *
 * Three rules the contract enforces by its shape:
 *
 *   1. **Every parent always reports.** Even a healthy one. An area that
 *      goes silent when it is fine is indistinguishable from an area that
 *      is broken.
 *   2. **A score may not appear without its working.** `score` and
 *      `working` travel together, because a number you cannot interrogate
 *      is a number you stop believing.
 *   3. **Staleness is a first-class fact.** A truth typed six weeks ago is
 *      not the same as a truth. `stale` says so out loud rather than
 *      letting an old number pass for a current one.
 * ------------------------------------------------------------------ */

import { STALE_AFTER } from "./lifeos";

export const LAYERS = ["life", "empire"] as const;
export type Layer = (typeof LAYERS)[number];

export const PARENT_STATES = ["ok", "note", "warn"] as const;
export type ParentState = (typeof PARENT_STATES)[number];

/**
 * What a parent area hands upward. Six fields plus its id, deliberately.
 *
 * A summary large enough to need scrolling is a summary nobody reads, and
 * ten parents is already the most a dashboard can carry without becoming
 * the thing it was meant to replace.
 */
export type ParentReport = {
  id: string;
  layer: Layer;
  /** The one truth, in words. Never a bare number. */
  line: string;
  state: ParentState;
  /** 0–10, and only ever present when `working` explains where it came from. */
  score: number | null;
  /** How the score was arrived at. "Trained twice in the last fortnight." */
  working: string | null;
  /** Set when a typed truth has aged past its half-life. */
  stale: string | null;
};

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

export type ParentArea = {
  id: string;
  layer: Layer;
  name: string;
  href: string;
  icon: string;
  /** The question this area answers. One per area, and they must not overlap. */
  question: string;
  /** The sub-modules nested inside it, in the order they appear on the page. */
  views: { id: string; label: string; hint: string }[];
  /**
   * What it costs to keep this area truthful. Named honestly, because the
   * whole redesign turns on the fact that a measurement with a typing cost
   * will be empty when a busy season arrives.
   */
  cost: "none" | "one tap" | "weekly" | "monthly";
};

/**
 * LIFE_OS — five parents.
 *
 * Rhythm is deliberately absent. Season, capacity, minimum mode and
 * "months that counted" govern EMPIRE_OS just as much as LIFE_OS — they
 * change what the empire is allowed to expect — and a thing that governs
 * both layers has to sit above both. `rhythmContract` stays in
 * `lifeos.ts` where its callers are; what changes is that it does not get
 * a parent tile, because it is not a part of one life area.
 */
export const LIFE_PARENTS: ParentArea[] = [
  {
    id: "standing",
    layer: "life",
    name: "Standing",
    href: "/life",
    icon: "◧",
    question: "How am I actually doing?",
    views: [
      { id: "areas", label: "Areas", hint: "eight areas, seven of them computed" },
      { id: "habits", label: "Habits", hint: "one that counts" },
      { id: "goals", label: "Goals", hint: "and the bucket list" },
    ],
    cost: "weekly",
  },
  {
    id: "body",
    layer: "life",
    name: "Body",
    href: "/life/body",
    icon: "◍",
    question: "Can I work?",
    views: [
      { id: "readiness", label: "Readiness", hint: "against your own baseline, not a chart" },
      { id: "food", label: "Food", hint: "fifty meals, protein first" },
    ],
    cost: "none",
  },
  {
    id: "money",
    layer: "life",
    name: "Money",
    href: "/life/money",
    icon: "£",
    question: "Am I getting out?",
    views: [
      { id: "debt", label: "Debt", hint: "what you owe, and when it is gone" },
      { id: "accounts", label: "Accounts", hint: "what closes, and what just recurs" },
      { id: "vehicles", label: "Vehicles", hint: "tax, MOT, insurance, service" },
      { id: "worth", label: "Net worth", hint: "what you are actually worth" },
      { id: "cashflow", label: "Cashflow", hint: "in against out" },
      { id: "buffer", label: "Buffer", hint: "how long you would last" },
    ],
    cost: "monthly",
  },
  {
    id: "people",
    layer: "life",
    name: "People",
    href: "/life/people",
    icon: "◎",
    question: "Am I present?",
    views: [
      { id: "roster", label: "Roster", hint: "who, and how often" },
      { id: "occasions", label: "Occasions", hint: "birthdays and dates" },
    ],
    cost: "one tap",
  },
  {
    id: "horizon",
    layer: "life",
    name: "Horizon",
    href: "/goals",
    icon: "◇",
    question: "Where is this going?",
    views: [
      { id: "goals", label: "Goals", hint: "month to ten years" },
      { id: "bucket", label: "Bucket list", hint: "things worth doing once" },
    ],
    cost: "none",
  },
];

/**
 * EMPIRE_OS — five parents, grouped by HOW EACH DIVISION EARNS.
 *
 * Not by category, and the difference is the whole point. Filed by
 * category — property, retail, software — the empire cannot score itself
 * against the sentence it exists to satisfy. Filed by maintenance load it
 * can, and the answer falls straight out of the grouping:
 *
 *     how much of this earns without me,
 *     and how much of it stops the day I stop?
 *
 * Confirmed with Jay on 13 Aug 2026 along with three things the grouping
 * alone could not settle: A to Z Traderz is the PROVING GROUND, MAINFRAME
 * is a platform he also operates rather than a passive one, and the
 * Pipeline splits into things he will start and things he might.
 *
 * The placements live on `ventures.meta.parent`, not here. A division can
 * be refiled without a deploy, and a venture added tomorrow does not need
 * a code change to appear.
 */
export const EMPIRE_PARENTS: ParentArea[] = [
  {
    id: "property",
    layer: "empire",
    name: "Property",
    href: "/empire/property",
    icon: "⌂",
    question: "What earns without me?",
    views: [
      { id: "let", label: "Let", hint: "earning now" },
      { id: "works", label: "Works", hint: "not yet earning" },
    ],
    cost: "monthly",
  },
  {
    id: "trade",
    layer: "empire",
    name: "Trade",
    href: "/empire/trade",
    icon: "⚒",
    question: "What am I selling my hours to?",
    views: [
      { id: "active", label: "Active", hint: "running now" },
      { id: "numbers", label: "Numbers", hint: "the five that matter" },
    ],
    cost: "monthly",
  },
  {
    id: "product",
    layer: "empire",
    name: "Product",
    href: "/empire/product",
    icon: "◈",
    question: "What am I making?",
    views: [{ id: "lines", label: "Lines", hint: "what is made and sold" }],
    cost: "monthly",
  },
  {
    id: "digital",
    layer: "empire",
    name: "Digital",
    href: "/empire/digital",
    icon: "◉",
    question: "What is built once and kept?",
    views: [{ id: "builds", label: "Builds", hint: "software and platforms" }],
    cost: "none",
  },
  {
    id: "pipeline",
    layer: "empire",
    name: "Pipeline",
    href: "/empire/pipeline",
    icon: "✦",
    question: "What is not started yet?",
    views: [
      { id: "queue", label: "Queue", hint: "things you will start" },
      { id: "menu", label: "Menu", hint: "things you might, no expectation" },
    ],
    cost: "none",
  },
];

export const ALL_PARENTS = [...LIFE_PARENTS, ...EMPIRE_PARENTS];

export function parentById(id: string): ParentArea | null {
  return ALL_PARENTS.find((p) => p.id === id) ?? null;
}

export function parentsFor(layer: Layer): ParentArea[] {
  return ALL_PARENTS.filter((p) => p.layer === layer);
}

/* ------------------------------------------------------------------ *
 * Views — the sub-modules, and deep-linking to them
 * ------------------------------------------------------------------ */

/** The view id meaning "show everything". A parent page defaults to it. */
export const ALL_VIEW = "all";

/**
 * Resolve `?tab=` to a real sub-module, falling back to everything.
 *
 * A bad or missing value shows the whole page rather than an error,
 * because the page is a scroll first and a filter second — the tabs
 * narrow what is already there, they do not fetch anything new.
 */
export function normaliseView(
  parent: ParentArea,
  raw: string | string[] | null | undefined
): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return parent.views.some((x) => x.id === v) ? (v as string) : ALL_VIEW;
}

/** Whether a section should render, given the active view. */
export function showsView(active: string, section: string): boolean {
  return active === ALL_VIEW || active === section;
}

/** The href for a tab. The default view drops the parameter entirely. */
export function viewHref(parent: ParentArea, view: string): string {
  return view === ALL_VIEW ? parent.href : `${parent.href}?tab=${view}`;
}

/* ------------------------------------------------------------------ *
 * Staleness — which truth each parent leans on
 * ------------------------------------------------------------------ */

/**
 * The typed truth a parent's honesty depends on.
 *
 * The half-life itself lives in `STALE_AFTER` (`lifeos.ts`) and is NOT
 * repeated here. Two tables of half-lives is two tables that disagree
 * within a month, and the whole reason this file exists is to stop the
 * command centre keeping its own copy of what the subsystems know.
 *
 * A parent with no entry has no typed truth to go off — Body fills itself
 * from the watch, Horizon from rows that carry their own dates.
 */
export const PARENT_TRUTH: Record<string, string> = {
  money: "debt balances",
  standing: "area scores",
  people: "the roster",
  body: "health data",
  horizon: "goals",
};

/** How long that parent's truth stays true. Null when it has none. */
export function staleAfterFor(parentId: string): number | null {
  const truth = PARENT_TRUTH[parentId];
  if (truth == null) return null;
  return STALE_AFTER[truth] ?? null;
}

/* ------------------------------------------------------------------ *
 * What THE BRAIN does with the reports
 * ------------------------------------------------------------------ */

const STATE_ORDER: Record<ParentState, number> = { warn: 0, note: 1, ok: 2 };

/** Worst first, then by registry order. Stable and printable. */
export function rankReports(reports: ParentReport[]): ParentReport[] {
  const order = new Map(ALL_PARENTS.map((p, i) => [p.id, i]));
  return [...reports].sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99)
  );
}

/** Only what is not fine. */
export function needingAttention(reports: ParentReport[]): ParentReport[] {
  return rankReports(reports.filter((r) => r.state !== "ok"));
}

/** Typed truths that have gone off. */
export function staleReports(reports: ParentReport[]): ParentReport[] {
  return reports.filter((r) => r.stale != null);
}

/**
 * The board's own header. A COUNT, never a finding.
 *
 * This is deliberately not a second one-line advisor. `oneline.ts` says
 * the specific thing that needs Jay today, ranked by who is doing the
 * punishing; this says how many tiles below it are not green, which is a
 * header for a list rather than a claim about his day. Two sentences
 * saying overlapping things is the collision that had to be resolved once
 * already when THE COG arrived, and the resolution was the same: keep the
 * specific finding above, and let the summary be visibly a summary.
 */
export function boardLine(reports: ParentReport[]): string {
  if (reports.length === 0) return "Nothing is reporting yet.";
  const bad = reports.filter((r) => r.state === "warn").length;
  const noted = reports.filter((r) => r.state === "note").length;
  if (bad > 0) {
    const areas = bad === 1 ? "1 area needs" : `${bad} areas need`;
    return `${areas} you${noted > 0 ? `, ${noted} worth a look` : ""}.`;
  }
  if (noted > 0) {
    return `Nothing urgent. ${noted} worth a look when you have a minute.`;
  }
  return "Whole board clear. Nothing needs you.";
}
