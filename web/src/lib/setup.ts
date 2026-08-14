/* ------------------------------------------------------------------ *
 * Setup — everything standing between the system and being useful
 *
 * THE BRAIN has always known what it is missing. Every module reports
 * "unmeasured" rather than inventing a zero, which is the right behaviour
 * and the reason the numbers can be trusted. But those admissions were
 * scattered across eight screens, and an admission you have to go looking
 * for is one nobody acts on. The figures panel on /life proved the
 * arithmetic in miniature: eight null balances across two pages is eight
 * navigations and nobody does eight navigations; eight rows on the screen
 * you are already on is eight taps, and people do that.
 *
 * This is that idea applied to the whole system. One list, every gap,
 * ranked by what filling it turns on.
 *
 * THREE RULES it inherits, and one it adds:
 *
 *   · **Say what it unlocks, not what to do.** "Log one session — the
 *     training floor cannot be judged until something is logged" is a
 *     reason. "Log a workout" is an instruction, and instructions get
 *     followed twice and then ignored.
 *   · **Never nag.** This page is somewhere you go, never something that
 *     arrives. The dashboard carries one line while gaps remain and
 *     nothing at all once they are filled.
 *   · **Finish honestly.** A completed step stays visible, greyed, rather
 *     than vanishing — a list that silently shortens gives no sense of
 *     having got anywhere.
 *   · **The world outranks the system.** A lapsed MOT is a fine. Every
 *     other gap here is this system being unable to score something. That
 *     is not the same kind of urgent, and the order says so.
 * ------------------------------------------------------------------ */

import type { InlineKey } from "./inline";

/** One figure that can be typed straight into the list. */
export type FigureRow = {
  key: InlineKey;
  id: string;
  /** Which thing this is about — "Council Tax", "BMW · ME54 JAY". */
  subject: string;
};

export type SetupStep = {
  id: string;
  /** What is missing, in his words. */
  title: string;
  /** What filling it turns on. The reason, never the instruction. */
  unlocks: string;
  /** True when there is nothing left to do here. */
  done: boolean;
  /**
   * Whether the OUTSIDE WORLD punishes this gap rather than the system
   * merely being unable to score. Exactly one category qualifies.
   */
  worldPunishes: boolean;
  /** How many modules stop saying "unmeasured" once this is filled. */
  unlockCount: number;
  /** Figures typed here. Absent when the step is somewhere to go. */
  figures?: FigureRow[];
  /** Where to go, when it cannot be typed into a list. */
  href?: string;
  cta?: string;
  /** One-off wiring rather than a thing to type. Shown apart. */
  oneOff?: boolean;
};

export type SetupFacts = {
  debts: { id: string; creditor: string; status: string; current_balance: number | null }[];
  vehicles: {
    id: string;
    name: string;
    registration: string | null;
    status: string;
    tax_due: string | null;
    mot_due: string | null;
    insurance_due: string | null;
    next_service: string | null;
  }[];
  /** Sessions ever logged. */
  workoutCount: number;
  /** Days of wearable or imported health data. */
  healthDayCount: number;
  /** Journal entries that actually carry a mood or energy figure. */
  bandedJournalCount: number;
  /** Open tasks under the keystone habit's pillar. */
  keystoneTaskCount: number;
  keystonePillarName: string | null;
  /** Meals with a cooking ever logged. */
  cookedMealCount: number;
  reviewCount: number;
  /** Areas that can only be typed, and have no score yet. */
  unscoredTypedAreas: string[];
  /**
   * Metrics that accept a reading and have never had one. DERIVED metrics
   * are excluded — nobody can record those by hand, so listing them here
   * would be asking for something the system refuses to accept.
   */
  unrecordedMetrics: string[];
  /** Held assets plus investments. Zero is why three figures read `£—`. */
  holdingCount: number;
};

/**
 * Every gap, ranked.
 *
 * The ordering is deliberate and it is not "most figures first". A single
 * MOT date outranks eight debt balances because one of them is a fine and
 * the other is a slower answer to a question only this system is asking.
 */
export function setupSteps(f: SetupFacts): SetupStep[] {
  const steps: SetupStep[] = [];

  /* -- 1 · the world ----------------------------------------------- */

  const legalFigures: FigureRow[] = [];
  const serviceFigures: FigureRow[] = [];
  for (const v of f.vehicles) {
    if (v.status !== "active") continue;
    const subject = v.registration ? `${v.name} · ${v.registration}` : v.name;
    // The three the LAW enforces. MOT first: it is the one with the
    // roadside consequence.
    const legal = [
      ["vehicles.mot_due", v.mot_due],
      ["vehicles.tax_due", v.tax_due],
      ["vehicles.insurance_due", v.insurance_due],
    ] as const;
    for (const [key, value] of legal) {
      if (value == null) legalFigures.push({ key, id: v.id, subject });
    }
    // The fourth date is NOT one of them, and keeping it separate is what
    // stops the legal tag becoming decoration. A missed service costs the
    // vehicle; a lapsed MOT costs a fine, an invalid policy and a car you
    // are not allowed to drive. Sixteen rows under one red heading would
    // have said those were the same thing.
    //
    // It is also the date the /life figures panel has never listed, so it
    // was editable everywhere except the one place that asks for it.
    if (v.next_service == null) {
      serviceFigures.push({ key: "vehicles.next_service", id: v.id, subject });
    }
  }

  steps.push({
    id: "vehicle-legal-dates",
    title: `${legalFigures.length || "No"} MOT, tax or insurance date${legalFigures.length === 1 ? "" : "s"} missing`,
    unlocks:
      "The only thing on this list the world enforces rather than this system having an opinion about. A lapsed MOT is a fine, an invalid policy and a car you are not allowed to drive — and right now nothing here can warn you. MOT and tax are both free to look up on gov.uk with the registration.",
    done: legalFigures.length === 0,
    worldPunishes: true,
    unlockCount: 2, // the legal watchtower, and the Vehicles area score
    figures: legalFigures,
  });

  steps.push({
    id: "vehicle-service-dates",
    title: `${serviceFigures.length || "No"} service date${serviceFigures.length === 1 ? "" : "s"} missing`,
    unlocks:
      "Not a legal date — nobody fines you for a late service. It is the fourth of the four the Vehicles score is measured against, so the area cannot reach full marks without it.",
    done: serviceFigures.length === 0,
    worldPunishes: false,
    unlockCount: 1,
    figures: serviceFigures,
  });

  /* -- 2 · the floor ------------------------------------------------ */

  steps.push({
    id: "first-workout",
    title: f.workoutCount === 0 ? "No training session ever logged" : "Training is being logged",
    unlocks:
      "The floor you set yourself is four a week, and it cannot be held or broken until something is logged — so the one line will not claim the floor is intact, and Training & Fitness stays unscored.",
    done: f.workoutCount > 0,
    worldPunishes: false,
    unlockCount: 4, // floor test · one line · standing board · COG keystone
    href: "/life/health/train",
    cta: "Log a session",
  });

  steps.push({
    id: "keystone-task",
    title:
      f.keystoneTaskCount === 0
        ? `No open task under ${f.keystonePillarName ?? "the keystone"}`
        : "The keystone has work under it",
    unlocks:
      "THE COG counts a task as supporting the keystone by its pillar. With none there, the two rules that protect training before the day interferes can never fire.",
    done: f.keystoneTaskCount > 0,
    worldPunishes: false,
    unlockCount: 2, // COG rules P2 and N5
    href: "/planner",
    cta: "Add one",
  });

  /* -- 3 · money ---------------------------------------------------- */

  const debtFigures: FigureRow[] = f.debts
    .filter((d) => d.status === "active" && d.current_balance == null)
    .map((d) => ({ key: "debts.current_balance" as InlineKey, id: d.id, subject: d.creditor }));

  steps.push({
    id: "debt-balances",
    title: `${debtFigures.length || "No"} debt balance${debtFigures.length === 1 ? "" : "s"} unconfirmed`,
    unlocks:
      "Without them there is no total, no projected debt-free date, and Money & Security cannot be scored at all. It is the area with the sharpest goal and the least evidence.",
    done: debtFigures.length === 0,
    worldPunishes: false,
    unlockCount: 3, // money contract · standing board · the one line
    figures: debtFigures,
  });

  /* -- 4 · the body ------------------------------------------------- */

  steps.push({
    id: "health-sync",
    title: f.healthDayCount === 0 ? "Sleep and HRV have never synced" : "Health data is flowing",
    unlocks:
      "The largest single unlock on this list, and it is one install rather than anything to type. The companion app is already built: it wakes up readiness scoring, the sleep band, the whole personal-baseline machinery, and the fuel signal that feeds it.",
    done: f.healthDayCount > 0,
    worldPunishes: false,
    unlockCount: 5,
    href: "/life/health",
    cta: "Set it up",
    oneOff: true,
  });

  steps.push({
    id: "first-bands",
    title:
      f.bandedJournalCount === 0
        ? "Mood and energy have never been recorded"
        : "The nightly close is recording bands",
    unlocks:
      "Thirty seconds at the close. It is what THE COG reads the next morning instead of asking you to check in again, and it is what makes Nutrition & Recovery scoreable.",
    done: f.bandedJournalCount > 0,
    worldPunishes: false,
    unlockCount: 3, // COG momentum · the morning bands · nutrition scoring
    href: "/checkin",
    cta: "Close tonight",
  });

  steps.push({
    id: "first-cook",
    title: f.cookedMealCount === 0 ? "Nothing cooked has been logged" : "The kitchen is being logged",
    unlocks:
      "Fifty meals are in the library and none has ever been marked cooked. One tap on a card is the whole cost, and it is what lets fuel reach readiness.",
    done: f.cookedMealCount > 0,
    worldPunishes: false,
    unlockCount: 2, // the nutrition signal · the fed line
    href: "/life/food",
    cta: "Mark one cooked",
  });

  steps.push({
    id: "first-holding",
    title:
      f.holdingCount === 0 ? "Nothing owned is recorded" : "Holdings are being recorded",
    unlocks:
      "The widest single blank in the system. Net worth cannot be totalled, cashflow has no costs to count, and all seventeen division cockpits show a dash for what has been spent — every one of those reads `assets`, and `assets` is empty.",
    done: f.holdingCount > 0,
    worldPunishes: false,
    unlockCount: 3, // net worth · cashflow costs · every division's spend
    href: "/holdings",
    cta: "Add one",
  });

  steps.push({
    id: "first-metric-reading",
    title:
      f.unrecordedMetrics.length === 0
        ? "Every metric has a reading"
        : `${f.unrecordedMetrics.length} metric${f.unrecordedMetrics.length === 1 ? "" : "s"} never recorded`,
    unlocks:
      "Three real answers are waiting on these numbers, not just a chart: Money's cashflow needs monthly income, its buffer needs outgoings and savings, and the EMPIRE income KPI reads the same income figure. One number each, once a month.",
    done: f.unrecordedMetrics.length === 0,
    worldPunishes: false,
    unlockCount: 3, // money cashflow · money buffer · the EMPIRE income KPI
    href: "/life/metrics",
    cta: "Record one",
  });

  /* -- 5 · the rhythm ----------------------------------------------- */

  steps.push({
    id: "typed-areas",
    title:
      f.unscoredTypedAreas.length === 0
        ? "Every area has a score"
        : `${f.unscoredTypedAreas.join(" and ")} has no score`,
    unlocks:
      "Seven of the eight areas score themselves from rows that already exist. This one cannot be computed from anything, which is exactly why it is the one worth being asked for.",
    done: f.unscoredTypedAreas.length === 0,
    worldPunishes: false,
    unlockCount: 1,
    href: "/life",
    cta: "Score it",
  });

  steps.push({
    id: "first-review",
    title: f.reviewCount === 0 ? "No weekly review yet" : "Reviews are happening",
    unlocks:
      "Twenty minutes a week. It is where the obstacle that keeps costing you weeks becomes visible — the quarterly ritual stays silent until three of these exist.",
    done: f.reviewCount > 0,
    worldPunishes: false,
    unlockCount: 1,
    href: "/reviews",
    cta: "Open it",
  });

  return sortSteps(steps);
}

/**
 * Unfinished first, and within that: the world, then breadth, then the
 * cheap ones. Done steps keep their order at the bottom so the list does
 * not reshuffle under your hands as you work down it.
 */
export function sortSteps(steps: SetupStep[]): SetupStep[] {
  return [...steps].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.worldPunishes !== b.worldPunishes) return a.worldPunishes ? -1 : 1;
    if (a.unlockCount !== b.unlockCount) return b.unlockCount - a.unlockCount;
    return a.id < b.id ? -1 : 1;
  });
}

export type SetupProgress = {
  done: number;
  total: number;
  /** Individual figures still to type, across every step. */
  figures: number;
  /** True when there is nothing left at all. */
  complete: boolean;
};

export function setupProgress(steps: SetupStep[]): SetupProgress {
  const done = steps.filter((s) => s.done).length;
  return {
    done,
    total: steps.length,
    figures: steps.reduce((n, s) => n + (s.figures?.length ?? 0), 0),
    complete: done === steps.length,
  };
}

/** Minutes, rounded to something a human would say. */
export const SECONDS_PER_FIGURE = 20;
export const MINUTES_PER_ACTION = 3;

/**
 * How long the rest of this would take, honestly.
 *
 * A number worth printing because "fourteen things missing" reads as an
 * afternoon and is actually ten minutes, and the gap between those two
 * beliefs is the whole reason none of it has been done.
 */
export function estimateMinutes(steps: SetupStep[]): number {
  const open = steps.filter((s) => !s.done);
  const figures = open.reduce((n, s) => n + (s.figures?.length ?? 0), 0);
  // One-off wiring is excluded from the estimate rather than guessed at:
  // installing an app is not a task with a knowable length, and folding a
  // made-up number into an otherwise honest total spoils the total.
  const actions = open.filter((s) => !s.figures && !s.oneOff).length;
  const mins = (figures * SECONDS_PER_FIGURE) / 60 + actions * MINUTES_PER_ACTION;
  return Math.max(1, Math.round(mins));
}

/**
 * The single line the dashboard carries while anything is missing.
 *
 * Null once it is all done, because a setup prompt that congratulates you
 * daily for being set up is a line you train yourself to skip — and the
 * one line above it needs that habit intact.
 */
export function setupLine(steps: SetupStep[]): string | null {
  const p = setupProgress(steps);
  if (p.complete) return null;
  const open = p.total - p.done;
  const mins = estimateMinutes(steps);
  const figurePart =
    p.figures > 0
      ? `${p.figures} figure${p.figures === 1 ? "" : "s"} to type`
      : `${open} thing${open === 1 ? "" : "s"} to set up`;
  return `${figurePart}, about ${mins} minute${mins === 1 ? "" : "s"} — and ${open} of the ${p.total} parts of this system are waiting on them.`;
}
