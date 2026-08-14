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
  /**
   * The sub-modules nested inside it, in the order they appear.
   *
   * `kind` is the rule that removes the judgement calls, and it has a
   * test rather than taste behind it:
   *
   *   A sub-module gets its own PATH if you can DO something there —
   *   log, edit, add, tick. It stays a QUERY FILTER if it only SHOWS
   *   you the parent's data.
   *
   * Doing needs a place; looking needs a lens. `subHref` is the single
   * function that applies it, so no screen has to know the rule.
   *
   * A `page` view carries its own `path`, because the route is not
   * always `<parent>/<id>` — Roster IS the People parent, for one.
   */
  views: {
    id: string;
    label: string;
    hint: string;
    kind: "page" | "filter";
    /** Required for `page` views. Ignored for filters. */
    path?: string;
  }[];
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
      { id: "areas", label: "Areas", hint: "eight areas, seven of them computed", kind: "filter" },
      { id: "habits", label: "Habits", hint: "one that counts", kind: "filter" },
      { id: "standards", label: "Standards", hint: "what you measure against", kind: "filter" },
      // Goals stays at /goals and is NOT /life/goals, which is where the
      // plan put it. That page is cross-system: it renders LIFE and
      // EMPIRE goals together, colours each row by its pillar's system,
      // sits in all three nav modes and holds EMPIRE's phone-bar slot.
      // Filing it under /life would put a cross-system surface inside one
      // subsystem and break the empire phone bar — the forced symmetry
      // decision 5 already rejected. Standing links to it; it does not
      // own it.
      { id: "goals", label: "Goals", hint: "month to ten years", kind: "page", path: "/goals" },
      { id: "bucket", label: "Bucket list", hint: "things worth doing once", kind: "page", path: "/life/bucket" },
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
      // Training leads, and that is a correction rather than an addition.
      // Readiness was first when the assumption was that a watch would
      // fill it; the watch is not connected, `workouts` has never held a
      // row, and Jay's own answer on 2026-08-14 was that training is a
      // priority he wants rather than one he has. A page that opens on a
      // score it cannot compute is a page nobody opens twice.
      { id: "training", label: "Training", hint: "one session is the whole target", kind: "filter" },
      { id: "readiness", label: "Readiness", hint: "against your own baseline, not a chart", kind: "filter" },
      { id: "food", label: "Food", hint: "fifty meals, protein first", kind: "page", path: "/life/body/food" },
      { id: "train", label: "Train", hint: "today's session, set by set", kind: "page", path: "/life/body/train" },
      { id: "skills", label: "Skills", hint: "the four trees, mastery derived", kind: "page", path: "/life/body/skills" },
    ],
    // No longer "none": logging a session is one tap, and it is the one
    // thing on this page that cannot fill itself.
    cost: "one tap",
  },
  {
    id: "money",
    layer: "life",
    name: "Money",
    href: "/life/money",
    icon: "£",
    question: "Am I getting out?",
    views: [
      { id: "debt", label: "Debt", hint: "what you owe, and when it is gone", kind: "filter" },
      { id: "worth", label: "Net worth", hint: "what you are actually worth", kind: "filter" },
      { id: "cashflow", label: "Cashflow", hint: "in against out", kind: "filter" },
      { id: "buffer", label: "Buffer", hint: "how long you would last", kind: "filter" },
      { id: "accounts", label: "Accounts", hint: "what closes, and what just recurs", kind: "page", path: "/life/money/accounts" },
      { id: "vehicles", label: "Vehicles", hint: "tax, MOT, insurance, service", kind: "page", path: "/life/money/vehicles" },
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
      // Roster IS this page — logging contact is doing, and its place is
      // the parent itself rather than a child of it. This is why a `page`
      // view carries its own path instead of deriving one.
      { id: "roster", label: "Roster", hint: "who, and how often", kind: "page", path: "/life/people" },
      { id: "occasions", label: "Occasions", hint: "birthdays and dates", kind: "filter" },
    ],
    cost: "one tap",
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
      { id: "let", label: "Let", hint: "earning now", kind: "filter" },
      { id: "works", label: "Works", hint: "not yet earning", kind: "filter" },
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
      { id: "active", label: "Active", hint: "running now", kind: "filter" },
      { id: "numbers", label: "Numbers", hint: "the five that matter", kind: "filter" },
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
    views: [{ id: "lines", label: "Lines", hint: "what is made and sold", kind: "filter" }],
    cost: "monthly",
  },
  {
    id: "digital",
    layer: "empire",
    name: "Digital",
    href: "/empire/digital",
    icon: "◉",
    question: "What is built once and kept?",
    views: [{ id: "builds", label: "Builds", hint: "software and platforms", kind: "filter" }],
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
      { id: "queue", label: "Queue", hint: "things you will start", kind: "filter" },
      { id: "menu", label: "Menu", hint: "things you might, no expectation", kind: "filter" },
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
  // Filters only. A `?tab=` naming a PAGE view is a stale link from
  // before that sub-module got its own route — it must fall back to the
  // whole page rather than filtering to a section that no longer renders
  // here, which would show an empty screen and look broken.
  return filterViews(parent).some((x) => x.id === v) ? (v as string) : ALL_VIEW;
}

/** Whether a section should render, given the active view. */
export function showsView(active: string, section: string): boolean {
  return active === ALL_VIEW || active === section;
}

/** The href for a tab. The default view drops the parameter entirely. */
export function viewHref(parent: ParentArea, view: string): string {
  return view === ALL_VIEW ? parent.href : `${parent.href}?tab=${view}`;
}

/**
 * Where a sub-module actually lives — the one place the page/filter rule
 * is applied.
 *
 * A FILTER is a lens on data the parent already fetched, so it is a query
 * string on the parent. A PAGE is somewhere you do something, so it is a
 * real route that can be bookmarked, linked from a reference shelf and
 * navigated back out of.
 *
 * The point of routing every caller through one function: before this,
 * Vehicles had TWO addresses — `/life/vehicles` and
 * `/life/money?tab=vehicles` — and two addresses for one subject is
 * exactly how the duplication started last time.
 */
export function subHref(parent: ParentArea, viewId: string): string {
  const v = parent.views.find((x) => x.id === viewId);
  if (v == null) return parent.href;
  if (v.kind === "page") return v.path ?? parent.href;
  return viewHref(parent, viewId);
}

/** Only the filters — the views a parent page renders inline. */
export function filterViews(parent: ParentArea) {
  return parent.views.filter((v) => v.kind === "filter");
}

/** Only the pages — the views that navigate away. */
export function pageViews(parent: ParentArea) {
  return parent.views.filter((v) => v.kind === "page");
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
 * A parent with no entry has no typed truth to go off.
 */
export const PARENT_TRUTH: Record<string, string> = {
  money: "debt balances",
  standing: "area scores",
  people: "the roster",
  body: "health data",
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
