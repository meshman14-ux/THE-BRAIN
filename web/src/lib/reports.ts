/* ------------------------------------------------------------------ *
 * Turning what the subsystems already know into parent reports
 *
 * Pure: contracts in, reports out. No database, no clock.
 *
 * THE ONE RULE THAT SHAPED THIS FILE: it does not measure anything. Every
 * number here comes from a contract or a board that already computed it —
 * `bodyContract`, `moneyContract`, `peopleContract`, `standingBoard`.
 *
 * That was not the obvious way to write it. The obvious way is to take raw
 * rows and derive a report, and a draft of this file did exactly that: it
 * counted training sessions against four-a-week over a fortnight, which is
 * character-for-character what `bodyContract` already does with
 * TRAINING_FLOOR_PER_WEEK and TRAINING_WINDOW_DAYS. It counted closed
 * accounts and cited Gal & McShane, which is what `moneyContract` already
 * does. Three measurements, two implementations each.
 *
 * Two implementations of one measurement do not stay equal. One gets
 * tuned, the other does not, and six weeks later the dashboard and the
 * page it links to disagree about whether the floor held — at which point
 * both are worthless, because the reader has no way to tell which lied.
 *
 * So the flow is one-directional and shallow:
 *
 *     rows → contracts (lifeos.ts) ─┐
 *     rows → board     (standing.ts)─┴→ reports.ts → the dashboard board
 *
 * If a report needs a fact nothing computes yet, the fix is to add it to
 * the contract, not to compute it here.
 * ------------------------------------------------------------------ */

import {
  type Layer,
  type ParentReport,
  type ParentState,
  staleAfterFor,
} from "./parents";
import {
  TRAINING_FLOOR_PER_WEEK,
  type BodyContract,
  type MoneyContract,
  type PeopleContract,
} from "./lifeos";
import type { AreaScore } from "./standing";

const daysBetween = (from: string, to: string): number =>
  Math.round(
    (Date.parse(to.slice(0, 10) + "T00:00:00Z") -
      Date.parse(from.slice(0, 10) + "T00:00:00Z")) /
      86_400_000
  );

/**
 * Staleness, in the same words everywhere. Null when nothing has aged.
 *
 * The half-life comes from the one table in `lifeos.ts`, reached through
 * `staleAfterFor`. Nothing here decides how long a truth lasts.
 */
export function stalenessFor(
  parentId: string,
  lastTouched: string | null,
  todayIso: string,
  what: string
): string | null {
  // Never typed and typed long ago are DIFFERENT FACTS. A parent with no
  // timestamp at all is unmeasured, and calling that stale would accuse
  // him of neglecting something he was never asked for.
  if (!lastTouched) return null;
  const limit = staleAfterFor(parentId);
  if (limit == null) return null;
  const age = daysBetween(lastTouched, todayIso);
  if (age <= limit) return null;
  const weeks = Math.floor(age / 7);
  return `${what} last updated ${weeks >= 2 ? `${weeks} weeks` : `${age} days`} ago.`;
}

const report = (
  id: string,
  layer: Layer,
  state: ParentState,
  line: string,
  extra: Partial<ParentReport> = {}
): ParentReport => ({
  id,
  layer,
  state,
  line,
  score: extra.score ?? null,
  working: extra.working ?? null,
  stale: extra.stale ?? null,
});

/* ------------------------------------------------------------------ *
 * BODY — from the body contract
 * ------------------------------------------------------------------ */

/**
 * Reads `floorHeld` and `trainingPerWeek` and says them in words.
 *
 * The three-way null is the whole subtlety and it is the contract's, not
 * this function's: `floorHeld === null` means UNMEASURED, not failed.
 * Nothing logged is a fact about the logging — or about a watch that has
 * not synced — and reporting it as a breached floor would be the system
 * accusing him out of its own empty table.
 */
export function bodyReport(
  body: BodyContract,
  todayIso: string,
  opts: { lastReading?: string | null } = {}
): ParentReport {
  const stale = stalenessFor("body", opts.lastReading ?? null, todayIso, "Health data");

  if (body.floorHeld === null) {
    return report("body", "life", "note", "No training logged to judge.", {
      working:
        "Either it stopped or nothing is syncing. Both are worth knowing and only one of them is about you.",
      stale,
    });
  }

  const perWeek = body.trainingPerWeek ?? 0;
  const state: ParentState = body.floorHeld
    ? "ok"
    : perWeek >= TRAINING_FLOOR_PER_WEEK / 2
      ? "note"
      : "warn";

  return report(
    "body",
    "life",
    state,
    body.floorHeld
      ? `Training is holding — ${perWeek} a week.`
      : `Trained ${perWeek}× a week against your own ${TRAINING_FLOOR_PER_WEEK}.`,
    {
      score: Math.min(10, Math.round((perWeek / TRAINING_FLOOR_PER_WEEK) * 10)),
      working: `Your own standard is ${TRAINING_FLOOR_PER_WEEK} a week, judged over a fortnight so one bad week is not a collapse.`,
      stale,
    }
  );
}

/* ------------------------------------------------------------------ *
 * MONEY — from the money contract
 * ------------------------------------------------------------------ */

/**
 * Accounts closed, not pounds paid.
 *
 * That choice is the contract's: Gal & McShane (JMR 2012) found the COUNT
 * of accounts closed predicted eliminating all debt, independent of the
 * amounts. It is also the only debt measure that produces a finish, which
 * is the currency this system runs on.
 */
export function moneyReport(
  money: MoneyContract,
  todayIso: string,
  opts: { openAccounts: number; lastConfirmed?: string | null }
): ParentReport {
  const stale = stalenessFor("money", opts.lastConfirmed ?? null, todayIso, "Balances");

  // A missed payment is the world's business, not the system's opinion,
  // so it outranks everything else this area could say.
  if (money.overdueCount > 0) {
    return report(
      "money",
      "life",
      "warn",
      `${money.overdueCount} payment${money.overdueCount === 1 ? "" : "s"} past due.`,
      {
        working:
          "A missed payment is a fact about the world rather than a judgement — and the world charges for it.",
        stale,
      }
    );
  }

  const total = opts.openAccounts + money.accountsClosed;

  // Nothing confirmed is UNMEASURED, and must not read as "nothing owed".
  if (total > 0 && money.arrearsTotal == null && money.accountsClosed === 0) {
    return report("money", "life", "note", `${total} creditors, none confirmed.`, {
      working:
        "No balance has been entered, so there is no total and no date this could finish. Nothing here is a claim that you owe nothing.",
      stale,
    });
  }

  if (opts.openAccounts === 0) {
    return report(
      "money",
      "life",
      money.accountsClosed > 0 ? "ok" : "note",
      money.accountsClosed > 0
        ? "Every account that could close, has."
        : "No accounts recorded that can close.",
      { stale }
    );
  }

  return report(
    "money",
    "life",
    stale ? "note" : "ok",
    `${opts.openAccounts} account${opts.openAccounts === 1 ? "" : "s"} left to close.`,
    {
      score: total === 0 ? null : Math.round((money.accountsClosed / total) * 10),
      working:
        total === 0
          ? null
          : `${money.accountsClosed} of ${total} closed. Accounts closed — not pounds paid — is what predicts getting out.`,
      stale,
    }
  );
}

/* ------------------------------------------------------------------ *
 * PEOPLE — from the people contract
 * ------------------------------------------------------------------ */

/**
 * Deliberately gentle: it never reaches `warn`.
 *
 * A person is not a deadline, and being told off about your mother is how
 * a module gets closed and never opened again. The cadence was his own,
 * and the line says so.
 */
export function peopleReport(
  people: PeopleContract,
  opts: { tracked: number; worst?: { name: string; days: number } | null } = { tracked: 0 }
): ParentReport {
  if (opts.tracked === 0) {
    return report("people", "life", "note", "Nobody is on the roster yet.", {
      working: "One name and a cadence is enough to switch this on.",
    });
  }
  if (people.overdueContacts === 0) {
    // A roster where nobody has ever been contacted is not "everyone is
    // fine" — there is no clock running to be past.
    if (people.unset > 0 && people.unset === opts.tracked) {
      return report("people", "life", "note", "Nobody has been logged as contacted yet.", {
        working: `${people.unset} on the roster with a cadence set and no contact recorded, so nothing can be overdue.`,
      });
    }
    return report("people", "life", "ok", "Everyone is within the cadence you set.");
  }

  const worst = opts.worst ?? null;
  return report(
    "people",
    "life",
    "note",
    worst
      ? `${worst.name} — ${worst.days} days since you spoke.`
      : `${people.overdueContacts} past the cadence you set.`,
    {
      score: Math.max(
        0,
        Math.round(((opts.tracked - people.overdueContacts) / opts.tracked) * 10)
      ),
      working:
        people.overdueContacts > 1
          ? `${people.overdueContacts} of ${opts.tracked} are past the cadence you set for them.`
          : "You set the cadence yourself; nothing here is a rule somebody else made.",
    }
  );
}

/* ------------------------------------------------------------------ *
 * STANDING — from the standing board
 * ------------------------------------------------------------------ */

/**
 * Takes the COMPUTED board, never the typed `pillars.score` column.
 *
 * Seven of the eight areas score themselves from rows that already exist.
 * A draft of this report read `pillars.score` instead, which would have
 * put the dashboard back on hand-typed numbers that go stale the moment
 * they are written — the exact fault computed Standing was built to fix.
 */
export function standingReport(
  board: AreaScore[],
  todayIso: string,
  opts: { lastScored?: string | null } = {}
): ParentReport {
  const stale = stalenessFor("standing", opts.lastScored ?? null, todayIso, "Area scores");
  const scored = board.filter((a) => a.score != null) as (AreaScore & { score: number })[];
  const unmeasured = board.length - scored.length;

  if (scored.length === 0) {
    return report("standing", "life", "note", "No area can be scored yet.", {
      working: `${board.length} areas, and not one of them has enough underneath it to compute a score.`,
      stale,
    });
  }

  const avg = scored.reduce((a, b) => a + b.score, 0) / scored.length;
  const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));
  const computed = scored.filter((a) => a.source === "computed").length;

  return report(
    "standing",
    "life",
    worst.score <= 3 ? "note" : "ok",
    worst.score <= 3
      ? `${worst.area} is the weakest at ${worst.score} of 10.`
      : `Nothing scoring below ${worst.score} of 10.`,
    {
      score: Math.round(avg),
      working: `Average ${avg.toFixed(1)} across ${scored.length} scored area${
        scored.length === 1 ? "" : "s"
      }, ${computed} of them computed${unmeasured > 0 ? `, ${unmeasured} unmeasured` : ""}.`,
      stale,
    }
  );
}

/* ------------------------------------------------------------------ *
 * HORIZON — from the goals rows
 *
 * The one parent with no contract behind it, because there is nothing to
 * derive: a goal carries its own target date and its own status, and
 * "past its date" is a comparison rather than a measurement.
 * ------------------------------------------------------------------ */

export function horizonReport(
  goals: { target_date: string | null; status: string }[],
  todayIso: string
): ParentReport {
  const live = goals.filter((g) => g.status !== "done" && g.status !== "dropped");
  if (live.length === 0) {
    return report("horizon", "life", "note", "No live goals.", {
      working: "A horizon with nothing on it is not a calm horizon, it is an empty one.",
    });
  }
  const dated = live.filter((g) => g.target_date != null);
  const overdue = dated.filter((g) => g.target_date! < todayIso);
  if (overdue.length > 0) {
    return report(
      "horizon",
      "life",
      "note",
      `${overdue.length} goal${overdue.length === 1 ? "" : "s"} past its own date.`,
      {
        working:
          "Past its date is not failed — it is a date that needs moving or a goal that needs closing. Both are one decision.",
      }
    );
  }
  return report("horizon", "life", "ok", `${live.length} live, none past its date.`, {
    working:
      dated.length < live.length
        ? `${live.length - dated.length} of them have no date, so nothing can tell you whether they are slipping.`
        : null,
  });
}

/* ------------------------------------------------------------------ *
 * EMPIRE — one report per parent, from the divisions inside it
 *
 * Unused until the EMPIRE parents are confirmed. Kept here because the
 * shape is settled even though the placements are not.
 * ------------------------------------------------------------------ */

export function empireParentReport(
  id: string,
  name: string,
  divisions: { name: string; live: boolean; lastTouchedDays: number | null }[]
): ParentReport {
  if (divisions.length === 0) {
    return report(id, "empire", "note", `Nothing filed under ${name} yet.`);
  }
  const live = divisions.filter((d) => d.live);
  if (live.length === 0) {
    return report(id, "empire", "ok", `${divisions.length} filed, none active.`, {
      working: "Parked on purpose is not the same as dropped, and this is the first.",
    });
  }
  const cold = live
    .filter((d) => d.lastTouchedDays != null && d.lastTouchedDays > 30)
    .sort((a, b) => (b.lastTouchedDays ?? 0) - (a.lastTouchedDays ?? 0));
  if (cold.length > 0) {
    return report(id, "empire", "note", `${cold[0].name} — ${cold[0].lastTouchedDays} days untouched.`, {
      working:
        cold.length > 1
          ? `${cold.length} of ${live.length} active here have gone quiet.`
          : `${live.length} active in ${name}.`,
    });
  }
  return report(id, "empire", "ok", `${live.length} active, all touched recently.`);
}
