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
  // "finance" left 2026-08-10: the four money views are built at
  // /life/money. "debt-payoff" went with it — the pinned plan it promised
  // IS the Debt tab, order of attack and projected clear date included.
  // "health" left 2026-08-10: the hub is built at /life/health — readiness
  // band, load spike detector, the Big 4 and the nutrition ladder. It is in
  // BUILT_BRANCHES below, so /health forwards there.
  // "food" left 2026-08-11: the meal library is built at /life/food —
  // fifty meals, protein first, no beef in any recipe. It is in
  // BUILT_BRANCHES below, so /food forwards there.
  // -- the ghosts, cleared 12-13 Aug 2026 -------------------------------
  //
  // Ten branches promised views that did not exist. An entry that never
  // delivers teaches you to stop reading the ones that do.
  //
  // Step 1 DELETED four of them — Personal, Mind Map, Daily Wall, Me —
  // which broke house rule 12: never delete a route, redirect it. For a
  // day /personal and /me returned 404 rather than landing somewhere
  // true. They are FORWARDED now, along with the rest, because a
  // bookmark that dies is worse than a page that says "not yet".
  //
  // Eight had a real home already and go to it (see BUILT_BRANCHES):
  //   today, daily-wall → /day        the day planner IS the daily sheet
  //   diary               → /week       hour-by-hour, printable
  //   feed                → /life/health  where the Samsung importer lives
  //   personal, me        → /life       Standing holds the areas and standards
  //   motivation          → /library/principles   the Gita layer, ported
  //   documents           → /inbox      captures and their attachments
  //
  // Two had no home and stay deleted rather than kept as a wish:
  //   search — the advisor already searches notes WITH CITATIONS, and a
  //     box over everything else was never specced beyond a sentence.
  //   map — a picture of the whole system. The parent areas are now that
  //     map, in list form.
  // "kathleen-st" left with the other divisions: it is a venture, and its
  // cockpit is built at /empire/kathleen-st.
  // "vehicles" was retired 2026-08-01: the view it promised is built at
  // /life/vehicles. BRANCH_ALIASES redirects the old slug there.
  // "family" left 2026-08-10: the people ledger it promised — cadences,
  // occasions and the one-tap contact log — is built at /life/people.
  // "opportunities" left 2026-08-14, and it was the LAST entry in this
  // registry. The deal board is built at the same address, /opportunities,
  // so the real route simply wins over the catch-all — the same way
  // /reviews did. It kept its promise: what is on the table, what it is
  // worth, and what the next move is.
  //
  // PLACEHOLDERS is now empty, and that is the point of it. It was never
  // meant to be a permanent furniture list; it was meant to be a queue
  // that drains. Leaving the array and its rules in place is deliberate —
  // the next planned-but-unbuilt view has somewhere honest to live.
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
  // Graduated 2026-08-14, the last row to leave PLACEHOLDERS. Built at the
  // address it always advertised, so this keeps its name and its shelf.
  opportunities: { name: "Opportunities", href: "/opportunities" },
  holdings: { name: "Holdings", href: "/holdings" },
  // Retired ghosts, forwarded to where the thing they promised already is.
  today: { name: "Today", href: "/day" },
  "daily-wall": { name: "Daily Wall", href: "/day" },
  diary: { name: "Work Diary", href: "/week" },
  feed: { name: "Feed the System", href: "/life/health" },
  personal: { name: "Personal", href: "/life" },
  me: { name: "Me", href: "/life" },
  motivation: { name: "Motivation", href: "/library/principles" },
  documents: { name: "Documents", href: "/inbox" },
  calendar: { name: "Calendar", href: "/calendar" },
  advisor: { name: "Advisor", href: "/advisor" },
  health: { name: "Health", href: "/life/health" },
  finance: { name: "Finance", href: "/life/money" },
  food: { name: "Food", href: "/life/health/food" },
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
