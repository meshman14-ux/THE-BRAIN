/**
 * The navigation registry, keyed by mode.
 *
 * Each system gets its own nav because each system is its own operating
 * system (Jay's sheet). The registry is data, not markup: `navForMode` and
 * `phoneNavForMode` in logic.ts decide membership and are tested, so a
 * mis-assigned item is caught by `npm test` rather than by Jay finding
 * Debts missing from LIFE_OS.
 *
 * Capture and Inbox carry every mode deliberately. They are the entry
 * points, and hiding them behind a mode would break phone-first capture —
 * locked decision 4. There is a test that holds them in all three.
 */

import type { Mode } from "./types";

export type NavItem = {
  /** Unique within the registry — two items may share an href across modes. */
  key: string;
  href: string;
  label: string;
  icon: string;
  /** Modes whose top bar carries this item. */
  modes: Mode[];
  /**
   * Modes whose five-column phone bar carries it. Always a subset of
   * `modes`, and always exactly five per mode — the bar is a grid of five,
   * and a sixth would silently wrap onto a second row.
   */
  phoneModes: Mode[];
};

export const NAV: NavItem[] = [
  /* -- the command centre ----------------------------------------- */
  {
    key: "brain",
    href: "/dashboard",
    label: "Brain",
    icon: "◈",
    modes: ["brain"],
    phoneModes: ["brain"],
  },
  {
    key: "life",
    href: "/life",
    label: "Life",
    icon: "☼",
    modes: ["brain"],
    phoneModes: ["brain"],
  },
  {
    key: "empire",
    href: "/empire",
    label: "Empire",
    icon: "♛",
    modes: ["brain"],
    phoneModes: ["brain"],
  },
  {
    // ONE planning door, added 2026-08-12 (LIFE_OS v2, step 4). It points
    // at /day rather than /planner because /day was the best planning
    // surface in the system and had no nav entry at all — it shipped with
    // the day-planner work and could only be reached through a chip on
    // /week. Week and Board are one tap away via PlanTabs.
    key: "plan",
    href: "/day",
    label: "Plan",
    icon: "▤",
    modes: ["brain", "life"],
    phoneModes: [],
  },
  {
    key: "review",
    href: "/reviews",
    label: "Review",
    icon: "◇",
    modes: ["brain"],
    phoneModes: [],
  },

  /* -- LIFE_OS · five parent areas ---------------------------------
   *
   * Was six items, and four of them were SUB-MODULES wearing a nav entry.
   * Vehicles is part of Money. Health is part of Body. Habits is part of
   * Standing. A nav that lists sub-modules beside their parents has no
   * hierarchy, which is a nav you scan rather than read.
   *
   * The order is deliberate and it is not alphabetical: Standing first
   * because it is the summary of the other four, then the three that feed
   * it, then Horizon because it is the only one about the future.
   */
  {
    key: "standing",
    href: "/life",
    label: "Standing",
    icon: "◧",
    modes: ["life"],
    phoneModes: ["life"],
  },
  {
    key: "body",
    href: "/life/body",
    label: "Body",
    icon: "◍",
    // Readiness and Food are tabs on this page. Both old routes still
    // answer at their own addresses.
    modes: ["life"],
    phoneModes: ["life"],
  },
  {
    key: "money",
    href: "/life/money",
    label: "Money",
    icon: "£",
    // Debt, Accounts, Vehicles, Net worth, Cashflow and Buffer are all
    // tabs here. Six sub-modules, one nav entry.
    modes: ["life"],
    // OFF the phone bar, which holds exactly five. Body took the slot, and
    // Money is the honest thing to give up: the parent registry declares
    // its own cost as "monthly", the lowest of the five, and confirming a
    // debt balance is a desk job — the same reasoning that already keeps
    // Calendar and Week off the bar. It is one tap from the top bar.
    //
    // NOT the daily close, which is what the drop this came from dropped.
    // The close is the free-truth mechanism everything downstream reads:
    // it writes the mood and energy that THE COG derives the morning bands
    // from, and making the one ritual that feeds the system harder to
    // reach is the opposite of what a phone bar is for.
    phoneModes: [],
  },
  {
    key: "people",
    href: "/life/people",
    label: "People",
    icon: "◎",
    modes: ["life"],
    phoneModes: [],
  },
  /* -- EMPIRE_OS --------------------------------------------------- */
  {
    key: "divisions",
    href: "/empire",
    label: "Divisions",
    icon: "⬢",
    modes: ["empire"],
    phoneModes: ["empire"],
  },
  {
    key: "opportunities",
    href: "/opportunities",
    label: "Opportunities",
    icon: "✦",
    modes: ["empire"],
    phoneModes: ["empire"],
  },
  {
    key: "holdings",
    href: "/holdings",
    label: "Holdings",
    icon: "◈",
    // EMPIRE only, and NOT on the phone bar. Two separate budgets, and
    // this clears one while failing the other.
    //
    // The desktop header's constraint is `brain` mode, which carries
    // thirteen items inside a 1200px box with ~27px spare; this adds
    // nothing there, taking `empire` from seven to eight, which is
    // nowhere near the line.
    //
    // The phone bar is a five-column GRID and `empire` already fills it
    // exactly — divisions, opportunities, horizon, capture, inbox. A
    // sixth would silently wrap onto a second row. Valuing an asset is
    // also a desk job in the way confirming a debt balance is, which is
    // already why Money and People have no phone slot either.
    modes: ["empire"],
    phoneModes: [],
  },

  /* -- shared ------------------------------------------------------ */
  {
    key: "goals",
    href: "/goals",
    // "Horizon" is the LIFE_OS parent this route became: goals, the
    // bucket list and the vision, answering "where is this going?".
    //
    // ONE entry rather than a second life-mode one called Horizon. Two
    // nav entries pointing at one route under two names is how a nav
    // starts feeling arbitrary — you learn the address twice and trust
    // neither label.
    label: "Horizon",
    icon: "◇",
    modes: ["brain", "life", "empire"],
    phoneModes: ["empire"],
  },
  {
    key: "checkin",
    href: "/checkin",
    label: "Close",
    icon: "◫",
    // The daily close asks about whichever area the system picked, which
    // may be either system's, so it belongs to the command centre too.
    modes: ["brain", "life"],
    // It takes the phone slot Week used to hold. The close is the one
    // thing here you genuinely do one-handed in bed; planning a week is a
    // desk job, the same reasoning that already keeps Calendar off the bar.
    phoneModes: ["life"],
  },
  /* Calendar LEFT this registry on 2026-08-14, and it is a filing change
   * rather than a removal — the route is untouched and still answers at
   * /calendar, which the OAuth callback depends on.
   *
   * It was the fourth surface answering "what am I doing", and the only
   * one still outside the Plan strip: Day, Week and Board shared a tab
   * row while Calendar sat beside them as a peer of Inbox and Advisor.
   * Three chips and a fourth thing next to them is not one front door.
   * It is now the fourth chip in that row, reached from any of the other
   * three.
   *
   * The nav budget makes the same argument from the other end. `brain`
   * mode carried THIRTEEN items inside a 1200px header with ~27px spare,
   * and §A7 says the honest answer to a fourteenth is a shorter label or
   * fewer items. This is twelve, arrived at by filing rather than by
   * cutting something anybody wanted. */
  {
    key: "diagnose",
    href: "/diagnose",
    label: "Diagnose",
    icon: "⌖",
    // Brain and Empire: it reads across ventures AND life areas, so the
    // command centre carries it; Empire carries it because that is where
    // the ritual usually starts. A desk job — no phone slot, same
    // reasoning as Calendar.
    modes: ["brain", "empire"],
    phoneModes: [],
  },
  {
    key: "advisor",
    href: "/advisor",
    label: "Advisor",
    icon: "✦",
    // The command centre only: the advisor reads across both systems, so it
    // belongs to neither of them.
    modes: ["brain"],
    phoneModes: [],
  },

  /* -- the entry points, in every mode ----------------------------- */
  {
    key: "capture",
    href: "/capture",
    label: "Capture",
    icon: "＋",
    modes: ["brain", "life", "empire"],
    phoneModes: ["brain", "life", "empire"],
  },
  {
    key: "account",
    href: "/account",
    label: "Account",
    icon: "◌",
    // In every mode and on no phone bar. It is the one page you need
    // exactly once — to set a password — and then almost never again, so
    // it must be REACHABLE from anywhere and prominent nowhere.
    //
    // The patch that added /account did not link it at all, which would
    // have made the fix for being locked out a page you could only reach
    // by typing the address of.
    modes: ["brain", "life", "empire"],
    phoneModes: [],
  },
  {
    key: "inbox",
    href: "/inbox",
    label: "Inbox",
    icon: "▣",
    modes: ["brain", "life", "empire"],
    phoneModes: ["brain", "life", "empire"],
  },
];

/** How many columns the phone bar has. Every mode must fill exactly this. */
export const PHONE_SLOTS = 5;
