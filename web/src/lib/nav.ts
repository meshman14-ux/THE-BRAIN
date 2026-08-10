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
    key: "planner",
    href: "/planner",
    label: "Planner",
    icon: "▤",
    modes: ["brain"],
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

  /* -- LIFE_OS ----------------------------------------------------- */
  {
    key: "areas",
    href: "/life",
    label: "Areas",
    icon: "◧",
    modes: ["life"],
    phoneModes: ["life"],
  },
  {
    key: "debts",
    href: "/life/debts",
    label: "Debts",
    icon: "£",
    modes: ["life"],
    phoneModes: ["life"],
  },
  {
    key: "people",
    href: "/life/people",
    label: "People",
    icon: "◎",
    modes: ["life"],
    phoneModes: [],
  },
  {
    key: "vehicles",
    href: "/life/vehicles",
    label: "Vehicles",
    icon: "⛭",
    modes: ["life"],
    phoneModes: [],
  },
  {
    key: "habits",
    href: "/life#habits",
    label: "Habits",
    icon: "✓",
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

  /* -- shared ------------------------------------------------------ */
  {
    key: "goals",
    href: "/goals",
    label: "Goals",
    icon: "◎",
    modes: ["brain", "empire"],
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
  {
    key: "week",
    href: "/week",
    label: "Week",
    icon: "▦",
    modes: ["brain", "life"],
    phoneModes: [],
  },
  {
    key: "calendar",
    href: "/calendar",
    label: "Calendar",
    icon: "▤",
    modes: ["brain", "life"],
    // No phone slot: the bar is exactly five per mode, and syncing is a
    // desk job. Capture and Inbox are what a phone is for.
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
