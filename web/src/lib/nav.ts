/**
 * The navigation registry.
 *
 * REBUILT 2026-08-18 from Jay's sheet. The nav is no longer a flat list
 * filtered by mode — it is FOUR NAMED GROUPS, each with a boxed title, in
 * the same order he drew them:
 *
 *     WORKSPACE            the day and the week
 *     MONEY                what comes in and what it is tied up in
 *     LIFE PLAN            the body, the table, the people
 *     INFORMATION LIBRARY  what is written down
 *
 * with INBOX and ADVISOR promoted OUT of the sidebar and into the top bar,
 * because both are things you glance at from wherever you already are
 * rather than places you go.
 *
 * Two consequences worth stating plainly:
 *
 * 1. The four groups are the SAME in every mode. A group whose membership
 *    changed under you would defeat the point of naming it — you learn
 *    "Money is the second box" once, not once per system. Every item still
 *    carries all three modes so the fail-closed CSS in globals.css (§A5)
 *    keeps working exactly as it did; nothing about a dropped `data-mode`
 *    attribute changes.
 * 2. `hidden: true` items are registry-only. They are real destinations
 *    with real links pointing at them from inside pages, and ⌘K still
 *    finds them, but they do not earn a line in a box. A sidebar that
 *    lists everything is a list you scan rather than read — which is the
 *    problem the boxes are there to solve.
 *
 * Capture ("Feed the System") and Inbox carry every mode deliberately.
 * They are the entry points, and hiding either behind a mode would break
 * phone-first capture — locked decision 4.
 */

import type { Mode } from "./types";

/** The four boxes, in the order Jay drew them. */
export type NavGroupKey = "workspace" | "money" | "life" | "library";

export type NavGroup = {
  key: NavGroupKey;
  /** The boxed title, rendered as a tab above its items. */
  title: string;
};

export const NAV_GROUPS: NavGroup[] = [
  { key: "workspace", title: "Workspace" },
  { key: "money", title: "Money" },
  { key: "life", title: "Life Plan" },
  { key: "library", title: "Information Library" },
];

const ALL: Mode[] = ["brain", "life", "empire"];

export type NavItem = {
  /** Unique within the registry — two items may share an href. */
  key: string;
  href: string;
  label: string;
  /**
   * The label the five-column phone bar uses, when the full one is too
   * long for a fifth of a 390px screen. "Feed the System" is 15
   * characters and truncates to "Feed the S…" without this.
   */
  short?: string;
  icon: string;
  /** Which box it sits in. `null` for top-bar and registry-only items. */
  group: NavGroupKey | null;
  /** Rendered in the header rather than the sidebar. Inbox and Advisor. */
  topbar?: boolean;
  /**
   * In the registry (so ⌘K finds it) but in no box. Reached from inside
   * pages, or from the brand mark, or from the strips.
   */
  hidden?: boolean;
  /** Modes whose nav carries this item. */
  modes: Mode[];
  /**
   * Modes whose five-column phone bar carries it. Always a subset of
   * `modes`, and always exactly five per mode — the bar is a grid of five,
   * and a sixth would silently wrap onto a second row.
   */
  phoneModes: Mode[];
};

export const NAV: NavItem[] = [
  /* ══ WORKSPACE ═════════════════════════════════════════════════════
   * The day, the week, and the four things you do inside them. This is
   * the box you are in most days, so it is the box at the top.
   */
  {
    key: "today",
    href: "/day",
    label: "Today",
    // The front door. `/day` was the best planning surface in the system
    // and spent months with no nav entry at all; it is now the first line
    // of the first box.
    icon: "◈",
    group: "workspace",
    modes: ALL,
    phoneModes: ALL,
  },
  {
    key: "calendar",
    href: "/calendar",
    label: "Calendar",
    icon: "▦",
    // Calendar came BACK into the nav on 2026-08-18. It left on 14 Aug for
    // the Plan strip on the grounds that four surfaces answered "what am I
    // doing" and only three shared a tab row. The boxes remove that
    // argument: inside WORKSPACE it is plainly one of six things you do
    // this week, not a fourth peer floating beside Inbox and Advisor.
    // It is still the fourth chip in the Plan strip; both doors are fine
    // now that the box says what the room is.
    group: "workspace",
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "week",
    href: "/week",
    label: "Work Diary",
    icon: "▤",
    group: "workspace",
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "capture",
    href: "/capture",
    label: "Feed the System",
    short: "Feed",
    // Renamed from "Capture" on Jay's sheet. The old label named the
    // mechanism; this one names the job — and the job is the habit.
    icon: "＋",
    group: "workspace",
    modes: ALL,
    phoneModes: ALL,
  },
  {
    key: "tasks",
    href: "/planner",
    label: "Tasks",
    icon: "✓",
    // Carries the open-task count. See `badge()` in the shell.
    group: "workspace",
    modes: ALL,
    phoneModes: ALL,
  },
  {
    key: "review",
    href: "/reviews",
    label: "Weekly Review",
    icon: "◇",
    group: "workspace",
    modes: ALL,
    phoneModes: [],
  },

  /* ══ MONEY ═════════════════════════════════════════════════════════
   * Three lines, exactly as the sheet has it after the crossings-out:
   * Health, Food and Property left this box — the first two for LIFE
   * PLAN, and Property because it is a venture, which is what Ventures
   * already says.
   */
  {
    key: "finances",
    href: "/life/money",
    label: "Finances",
    icon: "£",
    // Debt, Accounts, Net worth, Cashflow and Buffer are all tabs here.
    group: "money",
    modes: ALL,
    // No phone slot. The bar is a grid of exactly five and Advisor took
    // the slot this used to hold — the sheet promotes the advisor, and
    // confirming a balance is a desk job in a way asking a question is
    // not. It is one tap from the Money box.
    phoneModes: [],
  },
  {
    key: "ventures",
    href: "/empire",
    label: "Ventures",
    icon: "⬢",
    // Estate, Holdings and Opportunities are reached from inside this
    // page and from ⌘K. Three more lines in the box would make Money the
    // biggest box in a sidebar whose point is that Workspace is.
    group: "money",
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "vehicles",
    href: "/life/money/vehicles",
    label: "Vehicles",
    icon: "⬒",
    group: "money",
    modes: ALL,
    phoneModes: [],
  },

  /* ══ LIFE PLAN ═════════════════════════════════════════════════════
   * Health and Food arrive here from MONEY, where they never belonged.
   * "Family" is the sheet's word for the people module and is the better
   * word: /life/people is a list of the people you owe time to.
   *
   * MOTIVATION is on the sheet and is NOT here, because there is no
   * /motivation route — it is one of the ten ghosts deleted on 17 Aug. A
   * nav entry pointing at a 404 is worse than no entry: it teaches you
   * the nav lies. Build the page and this is a four-line diff.
   */
  {
    key: "health",
    href: "/life/health",
    label: "Health",
    icon: "◍",
    group: "life",
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "food",
    href: "/life/food",
    label: "Food",
    icon: "◑",
    group: "life",
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "family",
    href: "/life/people",
    label: "Family",
    icon: "◎",
    group: "life",
    modes: ALL,
    phoneModes: [],
  },

  /* ══ INFORMATION LIBRARY ═══════════════════════════════════════════
   * What is written down, as against what is happening. "Principles" was
   * crossed out on the sheet and rewritten "Life Principles"; the longer
   * name is the one used here.
   */
  {
    key: "library",
    href: "/library",
    label: "Library",
    icon: "▥",
    group: "library",
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "principles",
    href: "/library/principles",
    label: "Life Principles",
    icon: "⌘",
    group: "library",
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "documents",
    href: "/library/notes",
    label: "Documents",
    // The note vault, under the sheet's name for it. Captured documents
    // land here once confirmed, so "Documents" is what it holds.
    icon: "▢",
    group: "library",
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "debts",
    href: "/life/debts",
    label: "Debt Pay Off Plan",
    short: "Debt",
    icon: "◔",
    // The longest label in the sidebar and the reason `min-w-0 flex-1
    // truncate` has to stay on the label span.
    group: "library",
    modes: ALL,
    phoneModes: [],
  },

  /* ══ TOP BAR ═══════════════════════════════════════════════════════
   * "MOVE TO TOP BAR — INBOX, ADVISOR." Both are glanced at rather than
   * gone to, and both read across every box, so neither belongs inside
   * one. Inbox keeps its count.
   */
  {
    key: "inbox",
    href: "/inbox",
    label: "Inbox",
    icon: "▣",
    group: null,
    topbar: true,
    modes: ALL,
    phoneModes: ALL,
  },
  {
    key: "advisor",
    href: "/advisor",
    label: "Advisor",
    icon: "✦",
    group: null,
    topbar: true,
    modes: ALL,
    // On the phone bar as well as in the header. Below `xl` the header's
    // own links are hidden, and a control promoted to the top bar must not
    // vanish at the width it is most often read on.
    phoneModes: ALL,
  },

  /* ══ REGISTRY ONLY ═════════════════════════════════════════════════
   * No box, no top bar. Every one of these has a real link pointing at it
   * from inside a page, or is reached by the brand mark or a strip, and
   * ⌘K finds all of them by name. They are in the registry so that stays
   * true — an address you can only reach by typing it is a page nobody
   * opens.
   */
  {
    key: "brain",
    href: "/dashboard",
    label: "Brain",
    icon: "◈",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "life",
    href: "/life",
    label: "Life",
    icon: "☼",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "body",
    href: "/life/body",
    label: "Body",
    icon: "◍",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "estate",
    href: "/estate",
    label: "Estate",
    icon: "▦",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "holdings",
    href: "/holdings",
    label: "Holdings",
    icon: "◈",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "opportunities",
    href: "/opportunities",
    label: "Opportunities",
    icon: "✦",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "goals",
    href: "/goals",
    label: "Horizon",
    icon: "◇",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "checkin",
    href: "/checkin",
    label: "Close",
    icon: "◫",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "reflect",
    href: "/reflect",
    label: "Reflect",
    icon: "☾",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "diagnose",
    href: "/diagnose",
    label: "Diagnose",
    icon: "⌖",
    group: null,
    hidden: true,
    modes: ALL,
    phoneModes: [],
  },
  {
    key: "account",
    href: "/account",
    label: "Account",
    icon: "◌",
    group: null,
    hidden: true,
    // In every mode and in no box. It is the one page you need exactly
    // once — to set a password — and then almost never again, so it must
    // be REACHABLE from anywhere and prominent nowhere.
    modes: ALL,
    phoneModes: [],
  },
];

/** How many columns the phone bar has. Every mode must fill exactly this. */
export const PHONE_SLOTS = 5;

/**
 * The sidebar, as boxes. Groups with no items are dropped rather than
 * rendered as an empty box with a title — a title promising nothing is
 * the same lie as a nav item pointing at a 404.
 */
export function navBoxes(
  items: NavItem[] = NAV
): { group: NavGroup; items: NavItem[] }[] {
  return NAV_GROUPS.map((group) => ({
    group,
    items: items.filter((i) => i.group === group.key && !i.hidden),
  })).filter((b) => b.items.length > 0);
}

/** The header's own links — Inbox and Advisor, in registry order. */
export function topbarNav(items: NavItem[] = NAV): NavItem[] {
  return items.filter((i) => i.topbar);
}
