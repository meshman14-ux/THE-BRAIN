/**
 * The parts of JAY_OS that are drawn on the sidebar but not built yet.
 *
 * Jay needs to see the shape of the whole system, so every planned view has
 * a route today. An unbuilt one renders an honest placeholder — what it will
 * be, and where that work sits in the build order — rather than a 404 or a
 * silent omission. When a view gets built, delete its row here and the
 * placeholder route stops claiming it.
 */

import { divisionHref, ventureSlug } from "./references";

export type Placeholder = {
  slug: string;
  name: string;
  /** What this view will be, in one or two plain sentences. */
  what: string;
  /** Which build phase it belongs to (§A8 in CLAUDE.md). */
  phase: string;
};

export const PLACEHOLDERS: Placeholder[] = [
  {
    slug: "search",
    name: "Search everything",
    what: "One box over tasks, goals and captures. Searching your notes already works — the advisor does it, with citations. What is missing is everything that is not a note.",
    phase: "Phase 3 · Notes + links",
  },
  {
    slug: "today",
    name: "Today",
    what: "The day view: your three, the diary hours, and nothing else. The dashboard's Today panel is the seed of it.",
    phase: "Phase 6 · Review rituals",
  },
  {
    slug: "diary",
    name: "Work Diary",
    what: "Hour-by-hour record of where the day actually went, feeding the weekly review.",
    phase: "Phase 6 · Review rituals",
  },
  {
    slug: "feed",
    name: "Feed the System",
    what: "Imports: Samsung Health screenshots, bill photos, bank statements. The OCR parsers from the old app get ported here.",
    phase: "Phase 4 · LIFE_OS",
  },
  // "finance" left 2026-08-10: the four money views are built at
  // /life/money. "debt-payoff" went with it — the pinned plan it promised
  // IS the Debt tab, order of attack and projected clear date included.
  // "health" left 2026-08-10: the hub is built at /life/health — readiness
  // band, load spike detector, the Big 4 and the nutrition ladder. It is in
  // BUILT_BRANCHES below, so /health forwards there.
  // "food" left 2026-08-11: the meal library is built at /life/food —
  // fifty meals, protein first, no beef in any recipe. It is in
  // BUILT_BRANCHES below, so /food forwards there.
  // The four sidebar ghosts left 2026-08-12 (LIFE_OS v2, step 1): Personal,
  // Mind Map, Daily Wall and Me. They were honest — each said what it would
  // be — but they were promises the sidebar kept making and never keeping,
  // and an entry that never delivers teaches you to stop reading the ones
  // that do. Their futures are not cancelled: Personal and Daily Wall are
  // absorbed by STANDING and /day, and Mind Map and Me can return as real
  // pages when there is something behind them.
  // "kathleen-st" left with the other divisions: it is a venture, and its
  // cockpit is built at /empire/kathleen-st.
  // "vehicles" was retired 2026-08-01: the view it promised is built at
  // /life/vehicles. BRANCH_ALIASES redirects the old slug there.
  // "family" left 2026-08-10: the people ledger it promised — cadences,
  // occasions and the one-tap contact log — is built at /life/people.
  {
    slug: "opportunities",
    name: "Opportunities",
    what: "The deal board: what is on the table, what it would cost, and what it would return. EMPIRE_OS carries the table already — this becomes the view over it.",
    phase: "Phase 5 · EMPIRE_OS",
  },
  {
    slug: "motivation",
    name: "Motivation",
    what: "The Gita layer — verse of the day, deterministic, surfaced across the system. Worth porting intact.",
    phase: "Phase 6+",
  },
  {
    slug: "documents",
    name: "Documents",
    what: "The vault: filed papers, photographed bills, anything that must not rot in a drawer.",
    phase: "Phase 3 · Notes + links",
  },
  // "reviews" was retired 2026-08-05: the weekly review is built and lives
  // at the same address, /reviews, so the real route simply wins over the
  // catch-all. Its shelf and its name now come from BUILT_BRANCHES below.

  /* -- EMPIRE_OS divisions are no longer placeholders ---------------
   *
   * Every division had a branch page here saying "this page becomes its
   * cockpit". Stage 4 · Phase C built the cockpit, so all seventeen left
   * the registry in the same commit — a branch that is built must never
   * also be listed as not built yet. They live at /empire/[slug] now, keep
   * their names and reference shelves in DIVISION_BRANCHES below, and
   * (app)/[slug] forwards the old address to the new one.
   */
];

export function placeholderFor(slug: string): Placeholder | undefined {
  return PLACEHOLDERS.find((p) => p.slug === slug);
}

/**
 * The seventeen divisions, by name.
 *
 * Their slugs and hrefs are *derived* from these names, never typed out —
 * the hand-written map broke once already when "A to Z Trailerz" became
 * "A to Z Traderz" and its link silently stopped resolving. MAINFRAME is
 * absent on purpose: it is a pointer to a separate system and has no page
 * here (locked decision A1).
 */
export const DIVISION_NAMES = [
  "A to Z Traderz",
  "Building + Maintenance",
  "Bedlinog House",
  "Treharris House",
  "Kathleen St",
  "Amazon FBA",
  "AI Software",
  "Coffee Shop",
  "Microgreens",
  "Resin & Epoxy",
  "Festivals",
  "Charity (India)",
  "Storage Solutions",
  "Photo Booth",
  "Stencil Art",
  "Stump Pump",
  "Find My Stash",
];

/**
 * Branches whose view is built, and where it answers.
 *
 * A slug leaves PLACEHOLDERS the moment its page is real — otherwise the
 * registry starts lying about what is finished. But the branch itself does
 * not stop existing: it keeps its name and its reference shelf, and the
 * library still needs something to call it. That is what this holds.
 *
 * (BRANCH_ALIASES is a different job: it retires a *slug*, so an old link
 * still lands somewhere. This says where a live branch's view is.)
 */
export const BUILT_BRANCHES: Record<string, { name: string; href: string }> = {
  reviews: { name: "Reviews", href: "/reviews" },
  calendar: { name: "Calendar", href: "/calendar" },
  advisor: { name: "Advisor", href: "/advisor" },
  health: { name: "Health", href: "/life/health" },
  finance: { name: "Finance", href: "/life/money" },
  food: { name: "Food", href: "/life/food" },
  "debt-payoff": { name: "Debt payoff plan", href: "/life/money" },
  family: { name: "Family", href: "/life/people" },
  ...Object.fromEntries(
    DIVISION_NAMES.map((name) => [
      ventureSlug(name),
      { name, href: divisionHref(name) },
    ])
  ),
};

/** What to call a branch, built or not. Falls back to the slug itself. */
export function branchName(slug: string): string {
  return placeholderFor(slug)?.name ?? BUILT_BRANCHES[slug]?.name ?? slug;
}

/** Where a branch actually lives. */
export function branchHref(slug: string): string {
  return BUILT_BRANCHES[slug]?.href ?? `/${slug}`;
}
