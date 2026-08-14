/* ------------------------------------------------------------------ *
 * LIFE_OS — the four contracts
 *
 * THE BRAIN does not read LIFE_OS tables. It reads these four objects,
 * and nothing else. Sixteen fields in total, deliberately: a summary big
 * enough to need scrolling is a summary nobody reads, and a command centre
 * that reaches into another module's rows is a command centre that breaks
 * every time those rows change shape.
 *
 * THE LAW this file serves, from the v2 diagnosis:
 *
 *   > TRUTH MUST BE FREE. A measurement that costs a manual entry will not
 *   > survive contact with a busy season.
 *
 * So every field here is DERIVED from rows that already exist. Nothing in
 * this file asks Jay for anything. Where a truth genuinely cannot be
 * derived — nobody but him knows a debt balance — the contract reports the
 * absence rather than a zero, so the staleness test can ask for it later
 * at the one moment it matters.
 *
 * Absence is not zero, here as everywhere: every field that could be
 * unknown is nullable, and a null means "nothing to say", never "none".
 * ------------------------------------------------------------------ */

import {
  type PersonRow,
  type ReadinessBand,
  cadenceWatchtower,
  daysUntil,
  occasions,
  personStatus,
} from "./logic";
import { type SeasonKind, expectationsFor } from "./season";
import { type MonthTally, momentum } from "./finishes";

/* ------------------------------------------------------------------ *
 * 1 · BODY — can I work?
 * ------------------------------------------------------------------ */

/** The standard Jay set for himself. Not a population norm — his number. */
export const TRAINING_FLOOR_PER_WEEK = 4;

/** The window the floor is judged over. A fortnight, so one bad week
 *  does not read as a collapse and two in a row cannot hide. */
export const TRAINING_WINDOW_DAYS = 14;

export type BodyContract = {
  /** Sessions per week across the last fortnight. Null when nothing logged. */
  trainingPerWeek: number | null;
  /** Today's readiness band, or null when the evidence is too thin. */
  readinessBand: ReadinessBand | null;
  /**
   * Whether the training floor is being held. NULL when it cannot be
   * judged — no sessions logged at all is not a failed floor, it is an
   * unmeasured one, and calling it failed would be the system inventing
   * a failure out of its own empty table.
   */
  floorHeld: boolean | null;
};

export function bodyContract(input: {
  trainingDays: string[];
  readinessBand: ReadinessBand | null;
  todayIso: string;
}): BodyContract {
  const { trainingDays, readinessBand, todayIso } = input;
  const inWindow = trainingDays.filter((d) => {
    const ago = -(daysUntil(d, todayIso) ?? 0);
    return ago >= 0 && ago < TRAINING_WINDOW_DAYS;
  });
  // No history at all means unmeasured, not zero. Once ANY session exists,
  // a fortnight with none in it is a real and reportable zero.
  const measurable = trainingDays.length > 0;
  const perWeek = measurable
    ? Math.round((inWindow.length / (TRAINING_WINDOW_DAYS / 7)) * 10) / 10
    : null;
  return {
    trainingPerWeek: perWeek,
    readinessBand,
    floorHeld: perWeek == null ? null : perWeek >= TRAINING_FLOOR_PER_WEEK,
  };
}

/* ------------------------------------------------------------------ *
 * 2 · MONEY — am I getting out?
 * ------------------------------------------------------------------ */

export type MoneyContract = {
  /**
   * Accounts closed. Gal & McShane (JMR 2012): the NUMBER of accounts
   * closed — independent of the amounts — predicted eliminating all debt.
   * It leads this contract for that reason.
   */
  accountsClosed: number;
  /** Projected clear date, or null when nothing can be projected. */
  debtFreeDate: string | null;
  /** Total owed on debts that can actually reach zero. Null if unknown. */
  arrearsTotal: number | null;
  /** Payments missed. A world-punishes signal, so never null — zero is zero. */
  overdueCount: number;
};

type DebtLike = {
  current_balance: number | null;
  status: string;
  recurring?: boolean;
};

export function moneyContract(input: {
  debts: DebtLike[];
  missedPayments: number;
  debtFreeDate: string | null;
}): MoneyContract {
  const { debts, missedPayments, debtFreeDate } = input;
  // Standing bills are excluded from both counts: a thing that cannot
  // close cannot be a closure, and including it means "debt free" can
  // never become true.
  const closing = debts.filter((d) => !d.recurring);
  const known = closing
    .filter((d) => d.status === "active")
    .map((d) => d.current_balance)
    .filter((b): b is number => typeof b === "number");
  return {
    accountsClosed: closing.filter((d) => d.status !== "active").length,
    debtFreeDate,
    arrearsTotal: known.length === 0 ? null : known.reduce((a, b) => a + b, 0),
    overdueCount: missedPayments,
  };
}

/* ------------------------------------------------------------------ *
 * 3 · PEOPLE — am I present?
 * ------------------------------------------------------------------ */

export type PeopleContract = {
  /** How many are past the cadence Jay himself set. */
  overdueContacts: number;
  /** The next birthday or occasion inside the window, or null. */
  nextOccasion: { name: string; inDays: number } | null;
  /**
   * People with a cadence set but no contact ever logged. Not overdue —
   * there is no clock to be past — but the reason this module is empty,
   * and the staleness test needs to be able to say so.
   */
  unset: number;
};

export function peopleContract(input: {
  people: PersonRow[];
  todayIso: string;
}): PeopleContract {
  const { people, todayIso } = input;
  const watch = cadenceWatchtower(people, todayIso);
  const overdue =
    watch.surfaced.filter((s) => s.state === "overdue").length + watch.alsoOverdue;
  const next = occasions(people, todayIso)[0] ?? null;
  return {
    overdueContacts: overdue,
    nextOccasion: next ? { name: next.name, inDays: next.inDays } : null,
    unset: people.filter((p) => personStatus(p, todayIso).state === "never").length,
  };
}

/* ------------------------------------------------------------------ *
 * 4 · RHYTHM — what season is it, and has it counted?
 * ------------------------------------------------------------------ */

export type RhythmContract = {
  season: SeasonKind;
  /** Ventures the declared season supports. What EMPIRE_OS reads. */
  capacity: number;
  /** Months with at least one visible finish, of the months judged. */
  monthsCounted: { counted: number; of: number } | null;
  /** True in the declared reset. The floor still does not flex. */
  minimumMode: boolean;
};

export function rhythmContract(input: {
  season: SeasonKind;
  tallies: MonthTally[];
}): RhythmContract {
  const { season, tallies } = input;
  const m = momentum(tallies);
  return {
    season,
    capacity: expectationsFor(season).activeVentureSlots,
    // Under three settled months the momentum test says nothing, and this
    // passes that silence through rather than reporting a confident 1/1.
    monthsCounted: m.of >= 3 ? { counted: m.counted, of: m.of } : null,
    minimumMode: season === "minimum",
  };
}

/* ------------------------------------------------------------------ *
 * The four together
 * ------------------------------------------------------------------ */

export type LifeContracts = {
  body: BodyContract;
  money: MoneyContract;
  people: PeopleContract;
  rhythm: RhythmContract;
};

/* ------------------------------------------------------------------ *
 * THE BRAIN's three tests
 *
 * The command centre applies exactly these to the contracts above, and
 * nothing else. Everything LIFE_OS knows beyond this is available on
 * request and never pushed — that is what "one line a day" costs.
 * ------------------------------------------------------------------ */

export type FloorState = {
  /** True only when every leg is measurably intact. Null when unmeasured. */
  held: boolean | null;
  /** Which legs are breached, in plain words. Empty when none are. */
  breached: string[];
  /** Which legs cannot be judged at all. Named, so they can be fixed. */
  unmeasured: string[];
};

/**
 * TEST 1 — is the floor intact?
 *
 * The only test that can produce a warning, and the only one about things
 * Jay has already declared he will do. An unmeasured leg is reported as
 * unmeasured rather than counted as either kept or broken: the system
 * accusing him on the strength of its own empty table is the mistake the
 * habit board already made once.
 */
export function floorState(c: LifeContracts): FloorState {
  const breached: string[] = [];
  const unmeasured: string[] = [];

  if (c.body.floorHeld == null) unmeasured.push("training");
  else if (!c.body.floorHeld) {
    breached.push(
      `trained ${c.body.trainingPerWeek}× a week against your own ${TRAINING_FLOOR_PER_WEEK}`
    );
  }

  if (c.people.overdueContacts > 0) {
    breached.push(
      `${c.people.overdueContacts} past the cadence you set`
    );
  } else if (c.people.unset > 0 && c.people.overdueContacts === 0) {
    unmeasured.push("contact");
  }

  if (c.money.overdueCount > 0) {
    breached.push(`${c.money.overdueCount} payment${c.money.overdueCount === 1 ? "" : "s"} missed`);
  }

  return {
    held: breached.length > 0 ? false : unmeasured.length > 0 ? null : true,
    breached,
    unmeasured,
  };
}

/** The day of the month before which "nothing finished" is not yet news. */
export const MONTH_NUDGE_DAY = 25;

/**
 * TEST 2 — has the month counted?
 *
 * Never before the 25th. A month is not a failure on the 6th, and saying
 * so would train the line out of usefulness by the time it matters.
 */
export function monthNudge(
  finishesThisMonth: number,
  todayIso: string
): string | null {
  const day = Number(todayIso.slice(8, 10));
  if (day < MONTH_NUDGE_DAY) return null;
  if (finishesThisMonth > 0) return null;
  // The days remaining are the evidence that makes this actionable. "The
  // month has not counted" is a verdict; "and there are five days left"
  // is a window, and one of those two is worth reading.
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const left = lastDay - day;
  return left === 0
    ? "Nothing has visibly finished this month, and today is the last day of it."
    : `Nothing has visibly finished this month yet, with ${left} day${left === 1 ? "" : "s"} left.`;
}

/**
 * Half-lives, in days, for the truths that genuinely cost typing.
 *
 * ONE table, and it stays one. The parent-area work wanted its own
 * per-parent version and that would have been two tables disagreeing
 * within a month — so a parent maps to the truth it depends on
 * (`PARENT_TRUTH` in `parents.ts`) and reads the half-life from here.
 *
 * Each number is the honest half-life of the thing itself, not a uniform
 * policy: a debt balance moves weekly, an MOT date does not move at all
 * until it does, and a goal can sit untouched for six months without
 * having gone off.
 */
export const STALE_AFTER: Record<string, number> = {
  "debt balances": 35,
  "vehicle dates": 90,
  "area scores": 21,
  "health data": 7,
  "the roster": 30,
  goals: 180,
};

export type StaleTruth = { what: string; days: number; overBy: number };

/**
 * TEST 3 — is anything going stale?
 *
 * Returns ONE, oldest first, never a list. A list of everything rotting is
 * a list nobody acts on, and the point of charging a typing cost at all is
 * that it gets paid at the single moment it is worth paying.
 */
export function stalest(
  ages: { what: string; days: number | null }[]
): StaleTruth | null {
  const over = ages
    .filter((a): a is { what: string; days: number } => a.days != null)
    .map((a) => ({ ...a, overBy: a.days - (STALE_AFTER[a.what] ?? Infinity) }))
    .filter((a) => a.overBy > 0)
    .sort((a, b) => b.overBy - a.overBy);
  return over[0] ?? null;
}
