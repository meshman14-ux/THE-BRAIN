import { describe, expect, it } from "vitest";
import {
  MONTH_NUDGE_DAY,
  STALE_AFTER,
  TRAINING_FLOOR_PER_WEEK,
  type LifeContracts,
  bodyContract,
  floorState,
  moneyContract,
  monthNudge,
  peopleContract,
  rhythmContract,
  stalest,
} from "../src/lib/lifeos";
import type { PersonRow } from "../src/lib/logic";

const TODAY = "2026-08-12";
const shift = (iso: string, by: number) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

/* ================================================================== *
 * BODY
 * ================================================================== */

describe("bodyContract", () => {
  it("counts a fortnight as a weekly rate", () => {
    const days = [0, 2, 4, 7, 9, 11, 13].map((d) => shift(TODAY, -d));
    const b = bodyContract({ trainingDays: days, readinessBand: "green", todayIso: TODAY });
    expect(b.trainingPerWeek).toBe(3.5);
    expect(b.floorHeld).toBe(false);
  });

  it("holds the floor at exactly the standard Jay set", () => {
    const days = [0, 1, 2, 3, 7, 8, 9, 10].map((d) => shift(TODAY, -d));
    const b = bodyContract({ trainingDays: days, readinessBand: null, todayIso: TODAY });
    expect(b.trainingPerWeek).toBe(TRAINING_FLOOR_PER_WEEK);
    expect(b.floorHeld).toBe(true);
  });

  it("nothing logged is UNMEASURED, not a failed floor", () => {
    // The habit board made this mistake once: telling someone who has
    // logged nothing that they are failing is the system inventing a
    // failure out of its own empty table.
    const b = bodyContract({ trainingDays: [], readinessBand: null, todayIso: TODAY });
    expect(b.trainingPerWeek).toBeNull();
    expect(b.floorHeld).toBeNull();
  });

  it("but a real gap in a real history IS a zero", () => {
    // Once any session exists, a fortnight with none in it is reportable.
    const b = bodyContract({
      trainingDays: [shift(TODAY, -40)],
      readinessBand: null,
      todayIso: TODAY,
    });
    expect(b.trainingPerWeek).toBe(0);
    expect(b.floorHeld).toBe(false);
  });

  it("ignores days outside the window and in the future", () => {
    const b = bodyContract({
      trainingDays: [shift(TODAY, -20), shift(TODAY, 3), TODAY],
      readinessBand: null,
      todayIso: TODAY,
    });
    expect(b.trainingPerWeek).toBe(0.5);
  });
});

/* ================================================================== *
 * MONEY
 * ================================================================== */

describe("moneyContract", () => {
  const debt = (o: Record<string, unknown> = {}) => ({
    current_balance: ("current_balance" in o ? o.current_balance : 100) as number | null,
    status: String(o.status ?? "active"),
    recurring: Boolean(o.recurring ?? false),
  });

  it("counts accounts closed, which is the measure that predicts payoff", () => {
    const m = moneyContract({
      debts: [debt({ status: "cleared" }), debt({ status: "cleared" }), debt()],
      missedPayments: 0,
      debtFreeDate: null,
    });
    expect(m.accountsClosed).toBe(2);
  });

  it("excludes standing bills from both the count and the total", () => {
    // A thing that cannot close cannot be a closure, and including it
    // means "debt free" can never become true.
    const m = moneyContract({
      debts: [
        debt({ current_balance: 500 }),
        debt({ current_balance: 9999, recurring: true }),
        debt({ status: "cleared", recurring: true }),
      ],
      missedPayments: 0,
      debtFreeDate: null,
    });
    expect(m.arrearsTotal).toBe(500);
    expect(m.accountsClosed).toBe(0);
  });

  it("reports an unknown total as null rather than zero", () => {
    const m = moneyContract({
      debts: [debt({ current_balance: null }), debt({ current_balance: null })],
      missedPayments: 0,
      debtFreeDate: null,
    });
    expect(m.arrearsTotal).toBeNull();
  });

  it("keeps missed payments as a real zero — the world does not care that it is unmeasured", () => {
    expect(moneyContract({ debts: [], missedPayments: 0, debtFreeDate: null }).overdueCount).toBe(0);
  });
});

/* ================================================================== *
 * PEOPLE
 * ================================================================== */

describe("peopleContract", () => {
  const person = (o: Record<string, unknown> = {}): PersonRow =>
    ({
      id: String(o.id ?? Math.random()),
      name: String(o.name ?? "Someone"),
      relationship: null,
      last_contact: ("last_contact" in o ? o.last_contact : shift(TODAY, -3)) as string | null,
      cadence_days: ("cadence_days" in o ? o.cadence_days : 7) as number | null,
      birthday: ("birthday" in o ? o.birthday : null) as string | null,
      pillar_id: null,
      notes: null,
    }) as PersonRow;

  it("counts everyone past their own cadence, not just the surfaced three", () => {
    const late = Array.from({ length: 5 }, (_, i) =>
      person({ id: `p${i}`, last_contact: shift(TODAY, -30), cadence_days: 7 })
    );
    expect(peopleContract({ people: late, todayIso: TODAY }).overdueContacts).toBe(5);
  });

  it("someone never contacted is UNSET, not overdue — there is no clock to be past", () => {
    const c = peopleContract({
      people: [person({ last_contact: null, cadence_days: 14 })],
      todayIso: TODAY,
    });
    expect(c.overdueContacts).toBe(0);
    expect(c.unset).toBe(1);
  });

  it("names the next occasion, or nothing at all", () => {
    const withBirthday = person({ birthday: shift(TODAY, 10), name: "Mum" });
    const c = peopleContract({ people: [withBirthday], todayIso: TODAY });
    expect(c.nextOccasion?.name).toBe("Mum");
    expect(peopleContract({ people: [person()], todayIso: TODAY }).nextOccasion).toBeNull();
  });
});

/* ================================================================== *
 * RHYTHM
 * ================================================================== */

describe("rhythmContract", () => {
  // A settled month is one that is over: `current` is the month still
  // being lived, and momentum() excludes it from the rate.
  const tally = (month: string, counted: boolean) => ({
    month,
    counted,
    count: counted ? 1 : 0,
    current: false,
  });

  it("carries the capacity the season supports — what EMPIRE_OS reads", () => {
    expect(rhythmContract({ season: "quiet", tallies: [] }).capacity).toBe(3);
    expect(rhythmContract({ season: "busy", tallies: [] }).capacity).toBe(1);
  });

  it("passes the momentum test's silence through rather than faking a rate", () => {
    // Under three settled months the test says nothing. Reporting 1/1 here
    // would be a confident number built on one data point.
    const thin = rhythmContract({ season: "quiet", tallies: [tally("2026-08", true)] });
    expect(thin.monthsCounted).toBeNull();
  });

  it("reports the rate once there is enough to rate", () => {
    const r = rhythmContract({
      season: "quiet",
      tallies: [tally("2026-06", true), tally("2026-07", false), tally("2026-08", true)],
    });
    expect(r.monthsCounted).toEqual({ counted: 2, of: 3 });
  });

  it("flags minimum mode without flexing anything", () => {
    expect(rhythmContract({ season: "minimum", tallies: [] }).minimumMode).toBe(true);
    expect(rhythmContract({ season: "quiet", tallies: [] }).minimumMode).toBe(false);
  });
});

/* ================================================================== *
 * THE BRAIN's three tests
 * ================================================================== */

const contracts = (over: Partial<LifeContracts> = {}): LifeContracts => ({
  body: { trainingPerWeek: 4, readinessBand: "green", floorHeld: true },
  money: { accountsClosed: 0, debtFreeDate: null, arrearsTotal: null, overdueCount: 0 },
  people: { overdueContacts: 0, nextOccasion: null, unset: 0 },
  rhythm: { season: "quiet", capacity: 3, monthsCounted: null, minimumMode: false },
  ...over,
});

describe("floorState", () => {
  it("is held when every leg is measurably intact", () => {
    expect(floorState(contracts()).held).toBe(true);
  });

  it("names what is breached, with the evidence attached", () => {
    const f = floorState(
      contracts({ body: { trainingPerWeek: 2, readinessBand: null, floorHeld: false } })
    );
    expect(f.held).toBe(false);
    expect(f.breached[0]).toContain("2×");
    expect(f.breached[0]).toContain(String(TRAINING_FLOOR_PER_WEEK));
  });

  it("an unmeasured leg is unmeasured — never counted as kept OR broken", () => {
    const f = floorState(
      contracts({ body: { trainingPerWeek: null, readinessBand: null, floorHeld: null } })
    );
    expect(f.held).toBeNull();
    expect(f.breached).toEqual([]);
    expect(f.unmeasured).toContain("training");
  });

  it("a real breach outranks an unmeasured leg", () => {
    // If one leg is definitely broken, the floor is definitely not held —
    // the uncertainty elsewhere cannot rescue it.
    const f = floorState(
      contracts({
        body: { trainingPerWeek: null, readinessBand: null, floorHeld: null },
        money: { accountsClosed: 0, debtFreeDate: null, arrearsTotal: null, overdueCount: 2 },
      })
    );
    expect(f.held).toBe(false);
    expect(f.breached.some((b) => b.includes("missed"))).toBe(true);
  });

  it("treats a roster with no contact dates as unmeasured, not as compliance", () => {
    const f = floorState(
      contracts({ people: { overdueContacts: 0, nextOccasion: null, unset: 3 } })
    );
    expect(f.held).toBeNull();
    expect(f.unmeasured).toContain("contact");
  });
});

describe("monthNudge", () => {
  it("says nothing before the 25th, however empty the month", () => {
    expect(monthNudge(0, "2026-08-06")).toBeNull();
    expect(monthNudge(0, `2026-08-${MONTH_NUDGE_DAY - 1}`)).toBeNull();
  });

  it("speaks from the 25th when nothing has closed", () => {
    expect(monthNudge(0, `2026-08-${MONTH_NUDGE_DAY}`)).toContain("finished");
  });

  it("stays quiet when something did finish", () => {
    expect(monthNudge(1, "2026-08-28")).toBeNull();
  });
});

describe("stalest", () => {
  it("returns ONE, the most overdue — never a list", () => {
    const s = stalest([
      { what: "debt balances", days: 40 },
      { what: "area scores", days: 60 },
    ]);
    // Area scores are 39 days over their 21-day half-life; balances only 5.
    expect(s?.what).toBe("area scores");
  });

  it("says nothing while everything is fresh", () => {
    expect(stalest([{ what: "debt balances", days: 10 }])).toBeNull();
  });

  it("ignores a truth that has never been entered rather than calling it stale", () => {
    // Never-entered is a different problem from gone-stale, and conflating
    // them means the nudge fires on day one of a fresh system.
    expect(stalest([{ what: "vehicle dates", days: null }])).toBeNull();
  });

  it("prices each truth by its own half-life", () => {
    expect(STALE_AFTER["debt balances"]).toBe(35);
    expect(STALE_AFTER["vehicle dates"]).toBe(90);
    expect(STALE_AFTER["area scores"]).toBe(21);
  });
});
