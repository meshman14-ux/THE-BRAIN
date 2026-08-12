/* ------------------------------------------------------------------ *
 * STANDING — the eight areas, mostly computed
 *
 * The keystone of LIFE_OS v2, and the fault it fixes is the deepest one
 * in the system: the eight area scores were supposed to SUMMARISE the
 * modules beneath them, and instead they were typed by hand. The summary
 * and the thing it summarised had no wire between them, so the summary
 * went stale the moment it was written and could only be refreshed by
 * asking Jay again — a truth with a typing cost, which by the law is a
 * truth that will be empty within a season.
 *
 * So each area is scored FROM the module beneath it wherever a module
 * exists. Seven of the eight can speak; Home & Admin cannot, and is
 * asked for rather than guessed at.
 *
 * Three rules, and the first is not optional:
 *
 *   1. **A computed score must show its working.** Not "Training: 3" but
 *      "3 — trained twice a week against your own four." A number you
 *      cannot interrogate is a number you stop believing, and the moment
 *      you stop believing it you stop opening the page.
 *   2. **Unmeasured is not zero.** An area with nothing beneath it yet
 *      returns null and says which input is missing. Scoring it 0 would
 *      accuse Jay of a failure that is actually the system's own silence.
 *   3. **A computed score is a measurement, not a verdict.** It measures
 *      what the system can see, which is not the same as how a life is
 *      going. The page says so once, permanently.
 * ------------------------------------------------------------------ */

import { type BodyContract, type MoneyContract } from "./lifeos";
import { type PersonRow, personStatus } from "./logic";

/** How a score came to exist. The UI must be able to tell these apart. */
export type ScoreSource = "computed" | "typed" | "unmeasured";

export type AreaScore = {
  /** The pillar's name, which is its stable identity in the database. */
  area: string;
  /** 0–10, or null when nothing can speak yet. Null is never zero. */
  score: number | null;
  source: ScoreSource;
  /** The working. Always present, even when the answer is "I cannot tell". */
  working: string;
};

/** A fraction (0–1) as a 0–10 score. The only arithmetic in this file. */
export function asScore(fraction: number): number {
  return Math.max(0, Math.min(10, Math.round(fraction * 10)));
}

/* ------------------------------------------------------------------ *
 * The scorers, one per area that can speak
 * ------------------------------------------------------------------ */

export type StandingInput = {
  body: BodyContract;
  money: MoneyContract;
  people: PersonRow[];
  /** Names of the areas each person belongs to, by person id. */
  personArea: Record<string, string | null>;
  /** ate_well flags across the recent window, most recent first. */
  ateWell: (boolean | null)[];
  /**
   * Days in the last week with a cooked meal logged, from `fedState`.
   * Null when the kitchen has no history at all.
   *
   * Free truth, and it is NOT used as a score — `meals` keeps only the
   * last cooking of each meal, so this always undercounts, and scoring a
   * lossy count would punish him for the system's own gaps. It is used to
   * make the unmeasured line say what IS known instead of "nothing".
   */
  cookedDays?: number | null;
  /** Journal entry dates, for the reflection rhythm. */
  journalDates: string[];
  /** Vehicles and their four dates. Null means never recorded. */
  vehicles: {
    tax_due: string | null;
    mot_due: string | null;
    insurance_due: string | null;
    next_service: string | null;
  }[];
  /** How many debts can still close, for Money's denominator. */
  debtsTotal: number;
  todayIso: string;
};

/** Training & Fitness — against the four a week Jay set for himself. */
export function scoreTraining(i: StandingInput): AreaScore {
  const { trainingPerWeek } = i.body;
  if (trainingPerWeek == null) {
    return {
      area: "Training & Fitness",
      score: null,
      source: "unmeasured",
      working: "No sessions logged yet, so there is nothing to score.",
    };
  }
  const per = trainingPerWeek;
  return {
    area: "Training & Fitness",
    score: asScore(per / 4),
    source: "computed",
    working: `Trained ${per}× a week over the last fortnight, against your own standard of four.`,
  };
}

/** Nutrition & Recovery — the one-tap "ate to plan" is the whole signal. */
export function scoreNutrition(i: StandingInput): AreaScore {
  const answered = i.ateWell.filter((a): a is boolean => a != null);
  if (answered.length === 0) {
    // The kitchen is not silent even when the check-in is, so say what is
    // actually known before asking for another tap. It still does not
    // become a score: cooked days undercount by design, and a number that
    // punishes him for the system's lossiness is worse than no number.
    const cooked = i.cookedDays;
    return {
      area: "Nutrition & Recovery",
      score: null,
      source: "unmeasured",
      working:
        cooked == null || cooked === 0
          ? "Nothing logged. One tap a day on the health page — ate to plan, yes or no — is all this needs."
          : `${cooked} cooked day${cooked === 1 ? "" : "s"} logged this week, which feeds readiness but is not enough to score by — it only sees meals cooked from the library. One tap a day on the health page closes the gap.`,
    };
  }
  const good = answered.filter(Boolean).length;
  return {
    area: "Nutrition & Recovery",
    score: asScore(good / answered.length),
    source: "computed",
    working: `Ate to plan on ${good} of the ${answered.length} days you answered.`,
  };
}

/** How many complete weeks back the reflection rhythm is judged over. */
export const REFLECTION_WEEKS = 4;

/** Mind & Growth — the reflection rhythm, counted in weeks not days. */
export function scoreMind(i: StandingInput): AreaScore {
  // Weeks, not days: a daily streak punishes one missed evening by
  // resetting to zero, and the reset is what ends the habit.
  const weeks = new Set<string>();
  for (const d of i.journalDates) {
    const ago = daysBetween(d, i.todayIso);
    if (ago < 0 || ago >= REFLECTION_WEEKS * 7) continue;
    weeks.add(String(Math.floor(ago / 7)));
  }
  if (i.journalDates.length === 0) {
    return {
      area: "Mind & Growth",
      score: null,
      source: "unmeasured",
      working:
        "Nothing reflected yet. The daily close writes this — two taps an evening.",
    };
  }
  return {
    area: "Mind & Growth",
    score: asScore(weeks.size / REFLECTION_WEEKS),
    source: "computed",
    working: `Reflected in ${weeks.size} of the last ${REFLECTION_WEEKS} weeks.`,
  };
}

/** Family and Friends & Network — the cadence Jay set, kept or not. */
export function scorePeopleArea(i: StandingInput, area: string): AreaScore {
  const mine = i.people.filter((p) => i.personArea[p.id] === area);
  if (mine.length === 0) {
    return {
      area,
      score: null,
      source: "unmeasured",
      working: `Nobody is filed under ${area} yet.`,
    };
  }
  const statuses = mine.map((p) => personStatus(p, i.todayIso));
  const measurable = statuses.filter(
    (s) => s.state !== "never" && s.state !== "no_cadence"
  );
  if (measurable.length === 0) {
    return {
      area,
      score: null,
      source: "unmeasured",
      working: `${mine.length} ${
        mine.length === 1 ? "person" : "people"
      } here, none with a contact logged — so there is no clock to be past yet.`,
    };
  }
  const within = measurable.filter((s) => s.state !== "overdue").length;
  return {
    area,
    score: asScore(within / measurable.length),
    source: "computed",
    working: `${within} of ${measurable.length} within the cadence you set${
      mine.length > measurable.length
        ? `, and ${mine.length - measurable.length} not yet measurable`
        : ""
    }.`,
  };
}

/** Vehicles — four dates each, and a lapsed one is a legal problem. */
export function scoreVehicles(i: StandingInput): AreaScore {
  if (i.vehicles.length === 0) {
    return {
      area: "Vehicles",
      score: null,
      source: "unmeasured",
      working: "No vehicles recorded.",
    };
  }
  const dates = i.vehicles.flatMap((v) => [
    v.tax_due,
    v.mot_due,
    v.insurance_due,
    v.next_service,
  ]);
  const known = dates.filter((d): d is string => d != null);
  if (known.length === 0) {
    return {
      area: "Vehicles",
      score: null,
      source: "unmeasured",
      working: `${i.vehicles.length} vehicles, no dates recorded — so the one thing this area exists to warn you about, it cannot.`,
    };
  }
  const valid = known.filter((d) => daysBetween(i.todayIso, d) >= 0).length;
  // The denominator is every date that SHOULD exist, not just the known
  // ones: a vehicle with three blank dates is not doing well on one.
  const shouldExist = i.vehicles.length * 4;
  return {
    area: "Vehicles",
    score: asScore(valid / shouldExist),
    source: "computed",
    working: `${valid} of ${shouldExist} dates current across ${i.vehicles.length} vehicles${
      known.length < shouldExist
        ? `, and ${shouldExist - known.length} never recorded`
        : ""
    }.`,
  };
}

/** Money & Security — accounts closed, the measure that predicts payoff. */
export function scoreMoney(i: StandingInput): AreaScore {
  const { accountsClosed, overdueCount } = i.money;
  if (i.debtsTotal === 0) {
    return {
      area: "Money & Security",
      score: null,
      source: "unmeasured",
      working: "No debts recorded that can close.",
    };
  }
  // Nothing closed AND no balances confirmed is not a zero — it is a
  // system that has not been fed. Scoring it 0 would say "as bad as this
  // area can get" on the strength of knowing almost nothing, which is the
  // same mistake as calling an unlogged fortnight a failed training floor.
  // The moment ONE balance exists, or one account closes, this becomes
  // measurable and the score below takes over.
  if (accountsClosed === 0 && i.money.arrearsTotal == null && overdueCount === 0) {
    return {
      area: "Money & Security",
      score: null,
      source: "unmeasured",
      working: `${i.debtsTotal} creditors recorded, none closed yet and no balances confirmed. There is nothing to score until the figures go in — and they are the one thing nobody but you can supply.`,
    };
  }
  // A missed payment is the one thing here the world punishes, so it
  // costs more than a closure earns.
  const closedFraction = accountsClosed / i.debtsTotal;
  const penalty = Math.min(0.4, overdueCount * 0.2);
  return {
    area: "Money & Security",
    score: asScore(Math.max(0, closedFraction - penalty)),
    source: "computed",
    working:
      `${accountsClosed} of ${i.debtsTotal} accounts closed` +
      (overdueCount > 0
        ? `, and ${overdueCount} payment${overdueCount === 1 ? "" : "s"} missed.`
        : ".") +
      (i.money.arrearsTotal == null
        ? " No balances confirmed, so the total owed is unknown."
        : ""),
  };
}

/* ------------------------------------------------------------------ *
 * The whole board
 * ------------------------------------------------------------------ */

/** Areas nothing can speak for yet. These stay typed, and only these. */
export const TYPED_AREAS = ["Home & Admin"];

/**
 * All eight, computed where possible and carried through where not.
 *
 * A typed area keeps whatever score is stored against the pillar, and is
 * labelled `typed` so the page can show it differently and the staleness
 * test can age it. Everything else is recomputed on every load, which is
 * the entire point: it cannot go stale because it is never stored.
 */
export function standingBoard(
  areas: { name: string; score: number | null }[],
  input: StandingInput
): AreaScore[] {
  return areas.map((a) => {
    switch (a.name) {
      case "Training & Fitness":
        return scoreTraining(input);
      case "Nutrition & Recovery":
        return scoreNutrition(input);
      case "Mind & Growth":
        return scoreMind(input);
      case "Family":
      case "Friends & Network":
        return scorePeopleArea(input, a.name);
      case "Vehicles":
        return scoreVehicles(input);
      case "Money & Security":
        return scoreMoney(input);
      default:
        return {
          area: a.name,
          score: a.score,
          source: a.score == null ? ("unmeasured" as const) : ("typed" as const),
          working:
            a.score == null
              ? "Nothing here can be measured yet, and it has not been scored."
              : "Scored by you. Nothing beneath this area can speak for it yet.",
        };
    }
  });
}

/**
 * The one area the weekly review should ask about.
 *
 * Only typed areas are candidates — asking about a computed one would be
 * asking a question the system can already answer. The oldest-scored
 * comes first; with only one typed area today it is always that one,
 * which is what makes the weekly ask a real question rather than a form.
 */
export function areaToAsk(board: AreaScore[]): AreaScore | null {
  return board.find((a) => a.source === "typed" || (a.source === "unmeasured" && TYPED_AREAS.includes(a.area))) ?? null;
}

/** Average across the areas that could actually be scored. */
export function standingAverage(board: AreaScore[]): {
  mean: number | null;
  of: number;
  computed: number;
} {
  const scored = board.filter((a) => a.score != null);
  return {
    mean:
      scored.length === 0
        ? null
        : Math.round(
            (scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length) * 10
          ) / 10,
    of: board.length,
    computed: board.filter((a) => a.source === "computed").length,
  };
}

/* ------------------------------------------------------------------ */

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(to + "T00:00:00") - Date.parse(from + "T00:00:00")) / 86_400_000
  );
}
