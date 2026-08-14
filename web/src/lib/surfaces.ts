/* ------------------------------------------------------------------ *
 * Surfaces — siblings that answer one question between them
 *
 * Step 5 of the organisation plan, and the smallest of its ideas: some
 * routes are not neighbours, they are VIEWS of one surface, and the nav
 * should say so once rather than leaving each page to hint at the others
 * in its own words.
 *
 * The pattern is PlanTabs', which shipped first and proved it: the routes
 * stay separate — each fetches only what it shows — and a shared strip at
 * the top makes them one surface to the person using them. Nothing here
 * is a redirect and nothing moves; this file only writes down which pages
 * belong together, so a test can hold every strip pointing at a route
 * that exists.
 *
 * Deliberately NOT a general framework. Four registries and a component
 * beats a `layer`/`kind` abstraction (the plan's step 1) because there
 * are exactly four of these and the fifth, Plan, already exists with its
 * own extra furniture (the question line, the Print outlink). When a
 * sixth surface appears, add a fifth array — the day these need real
 * machinery is the day they stop fitting in one screen of data.
 * ------------------------------------------------------------------ */

export type SurfaceView = { key: string; href: string; label: string };

/**
 * ASK — the two screens you bring a question to.
 *
 * Advisor answers from your own notes with citations; Diagnose runs the
 * ten-question triage over a venture or an area. They had NO link to each
 * other in either direction — the only pair in the system that didn't.
 */
export const ASK_VIEWS: SurfaceView[] = [
  { key: "advisor", href: "/advisor", label: "Advisor" },
  { key: "diagnose", href: "/diagnose", label: "Diagnose" },
];

/**
 * REVIEW — the weekly twenty minutes and the quarterly hour.
 * They already cross-linked in prose; the strip makes it the same
 * furniture as everywhere else.
 */
export const REVIEW_VIEWS: SurfaceView[] = [
  { key: "weekly", href: "/reviews", label: "Weekly" },
  { key: "quarterly", href: "/reviews/quarterly", label: "Quarterly" },
];

/**
 * LIBRARY — reference material, all of it pulled and none of it pushed.
 * "Standards" from the plan's sketch is not here because no such route
 * exists; a strip must never promise a page that doesn't.
 */
export const LIBRARY_VIEWS: SurfaceView[] = [
  { key: "shelves", href: "/library", label: "Shelves" },
  { key: "notes", href: "/library/notes", label: "Notes" },
  { key: "principles", href: "/library/principles", label: "Principles" },
];

/**
 * SETTINGS — how you get in, and what is still missing.
 *
 * Setup has never had a nav item; it is reached from the dashboard's one
 * line and from /life. Pairing it with Account gives it a stable second
 * door without spending a nav slot. The plan's sketch also listed
 * "Integrations" here — that is the calendar connection, which lives on
 * /calendar where the thing it configures lives, and moving it would be
 * a real change rather than a small merge.
 */
export const SETTINGS_VIEWS: SurfaceView[] = [
  { key: "account", href: "/account", label: "Account" },
  { key: "setup", href: "/setup", label: "Setup" },
];

/** Every strip, for the integrity test. */
export const ALL_SURFACES: { name: string; views: SurfaceView[] }[] = [
  { name: "ask", views: ASK_VIEWS },
  { name: "review", views: REVIEW_VIEWS },
  { name: "library", views: LIBRARY_VIEWS },
  { name: "settings", views: SETTINGS_VIEWS },
];
