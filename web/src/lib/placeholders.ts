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
  {
    slug: "finance",
    name: "Finance",
    what: "Debt payoff engine, bills, income vs outgoings. The debt number on the dashboard already comes from the metrics that will power this.",
    phase: "Phase 4 · LIFE_OS",
  },
  {
    slug: "health",
    name: "Health",
    what: "Training, nutrition and recovery in one place — habits, streaks, imported health data.",
    phase: "Phase 4 · LIFE_OS",
  },
  {
    slug: "food",
    name: "Food",
    what: "Meal planning and the shopping that follows from it. House rule: no beef, ever.",
    phase: "Phase 4 · LIFE_OS",
  },
  // "kathleen-st" left with the other divisions: it is a venture, and its
  // cockpit is built at /empire/kathleen-st.
  // "vehicles" was retired 2026-08-01: the view it promised is built at
  // /life/vehicles. BRANCH_ALIASES redirects the old slug there.
  {
    slug: "family",
    name: "Family",
    what: "The people ledger — cadences like \"you said 14 days, it has been 47\". The schema for this already exists.",
    phase: "Phase 4 · LIFE_OS",
  },
  {
    slug: "opportunities",
    name: "Opportunities",
    what: "The deal board: what is on the table, what it would cost, and what it would return. EMPIRE_OS carries the table already — this becomes the view over it.",
    phase: "Phase 5 · EMPIRE_OS",
  },
  {
    slug: "personal",
    name: "Personal",
    what: "Profile, principles, and the standards you hold yourself to.",
    phase: "Phase 6 · Review rituals",
  },
  {
    slug: "map",
    name: "Mind Map",
    what: "The whole system as one picture — pillars, ventures, goals and how they hang together.",
    phase: "Phase 6+",
  },
  {
    slug: "daily-wall",
    name: "Daily Wall",
    what: "The printable daily sheet: constraint, three, hours. The old app's Daily Sheet, rebuilt on real data.",
    phase: "Phase 6 · Review rituals",
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
  {
    slug: "me",
    name: "Me",
    what: "Profile and settings — who the system is for, and how it should behave.",
    phase: "Phase 6+",
  },
  {
    slug: "debt-payoff",
    name: "Debt payoff plan",
    what: "The pinned plan: order of attack, monthly payment, projected clear date. The engine exists in the old app and gets ported onto the Debt remaining metric.",
    phase: "Phase 4 · LIFE_OS",
  },

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
