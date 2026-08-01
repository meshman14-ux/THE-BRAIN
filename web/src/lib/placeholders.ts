/**
 * The parts of JAY_OS that are drawn on the sidebar but not built yet.
 *
 * Jay needs to see the shape of the whole system, so every planned view has
 * a route today. An unbuilt one renders an honest placeholder — what it will
 * be, and where that work sits in the build order — rather than a 404 or a
 * silent omission. When a view gets built, delete its row here and the
 * placeholder route stops claiming it.
 */

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
    what: "One box over tasks, notes, goals and captures. Retrieval arrives with the notes layer, and gets AI citations with the advisor.",
    phase: "Phase 3 · Notes + links",
  },
  {
    slug: "today",
    name: "Today",
    what: "The day view: your three, the diary hours, and nothing else. The dashboard's Today panel is the seed of it.",
    phase: "Phase 6 · Review rituals",
  },
  {
    slug: "calendar",
    name: "Calendar",
    what: "Two-way sync with a dedicated Google calendar — THE BRAIN writes only to its own calendar, never your main one. Until then, the Week view schedules by day.",
    phase: "Phase 7+ · Calendar sync",
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
    slug: "advisor",
    name: "Advisor",
    what: "Ask-anything over your own notes with citations, and a morning brief drawn from your own data. Advisory, never autonomous.",
    phase: "Phase 7 · AI layer",
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
  {
    slug: "kathleen-st",
    name: "Kathleen St",
    what: "The property: arrears, renovation, tenancy. Tracked today as a venture on the CEO dashboard.",
    phase: "Phase 5 · EMPIRE_OS",
  },
  {
    slug: "vehicles",
    name: "Vehicles",
    what: "Tax, MOT and insurance per vehicle, with every renewal seen coming. The Vehicles pillar holds the standard already.",
    phase: "Phase 4 · LIFE_OS",
  },
  {
    slug: "family",
    name: "Family",
    what: "The people ledger — cadences like \"you said 14 days, it has been 47\". The schema for this already exists.",
    phase: "Phase 4 · LIFE_OS",
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
  {
    slug: "reviews",
    name: "Reviews",
    what: "The rituals: daily 2 minutes, weekly 20, quarterly an hour. Monthly deliberately omitted.",
    phase: "Phase 6 · Review rituals",
  },
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
];

export function placeholderFor(slug: string): Placeholder | undefined {
  return PLACEHOLDERS.find((p) => p.slug === slug);
}
