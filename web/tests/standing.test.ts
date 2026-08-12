import { describe, expect, it } from "vitest";
import {
  REFLECTION_WEEKS,
  type StandingInput,
  areaToAsk,
  asScore,
  scoreMind,
  scoreMoney,
  scoreNutrition,
  scorePeopleArea,
  scoreTraining,
  scoreVehicles,
  standingAverage,
  standingBoard,
} from "../src/lib/standing";
import type { PersonRow } from "../src/lib/logic";

const TODAY = "2026-08-12";
const shift = (iso: string, by: number) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

const input = (over: Partial<StandingInput> = {}): StandingInput => ({
  body: { trainingPerWeek: null, readinessBand: null, floorHeld: null },
  money: { accountsClosed: 0, debtFreeDate: null, arrearsTotal: null, overdueCount: 0 },
  people: [],
  personArea: {},
  ateWell: [],
  journalDates: [],
  vehicles: [],
  debtsTotal: 0,
  todayIso: TODAY,
  ...over,
});

const person = (o: Record<string, unknown> = {}): PersonRow =>
  ({
    id: String(o.id ?? Math.random()),
    name: String(o.name ?? "Someone"),
    relationship: null,
    last_contact: ("last_contact" in o ? o.last_contact : shift(TODAY, -2)) as string | null,
    cadence_days: ("cadence_days" in o ? o.cadence_days : 7) as number | null,
    birthday: null,
    pillar_id: null,
    notes: null,
  }) as PersonRow;

/* ================================================================== *
 * The rule that matters most: every score shows its working, and
 * "unmeasured" is never confused with "bad".
 * ================================================================== */

describe("every scorer shows its working", () => {
  it("returns a non-empty explanation in every state, including ignorance", () => {
    const empty = input();
    for (const s of [
      scoreTraining(empty),
      scoreNutrition(empty),
      scoreMind(empty),
      scoreVehicles(empty),
      scoreMoney(empty),
      scorePeopleArea(empty, "Family"),
    ]) {
      expect(s.working.length, s.area).toBeGreaterThan(10);
      // Ignorance is reported as ignorance, never as a zero.
      expect(s.score, s.area).toBeNull();
      expect(s.source, s.area).toBe("unmeasured");
    }
  });
});

describe("asScore", () => {
  it("maps a fraction onto 0–10 and cannot leave the scale", () => {
    expect(asScore(0)).toBe(0);
    expect(asScore(0.5)).toBe(5);
    expect(asScore(1)).toBe(10);
    expect(asScore(1.7)).toBe(10);
    expect(asScore(-2)).toBe(0);
  });
});

describe("scoreTraining", () => {
  it("scores against the four a week Jay set, and says so", () => {
    const s = scoreTraining(
      input({ body: { trainingPerWeek: 2, readinessBand: null, floorHeld: false } })
    );
    expect(s.score).toBe(5);
    expect(s.working).toContain("2×");
    expect(s.working).toContain("four");
  });

  it("tops out at the standard rather than rewarding overreach", () => {
    const s = scoreTraining(
      input({ body: { trainingPerWeek: 7, readinessBand: null, floorHeld: true } })
    );
    expect(s.score).toBe(10);
  });
});

describe("scoreNutrition", () => {
  it("scores only the days actually answered", () => {
    // Five days answered, three good. The two nulls are not failures —
    // they are days he did not say, and they leave the sum entirely.
    const s = scoreNutrition(input({ ateWell: [true, false, true, null, false, true, null] }));
    expect(s.score).toBe(6);
    expect(s.working).toContain("3 of the 5");
  });
});

describe("scoreMind", () => {
  it("counts WEEKS, so one missed evening is not a collapse", () => {
    // Four entries, all inside the same week: one week hit, not four.
    const oneWeek = [0, 1, 2, 3].map((d) => shift(TODAY, -d));
    expect(scoreMind(input({ journalDates: oneWeek })).score).toBe(
      Math.round((1 / REFLECTION_WEEKS) * 10)
    );
  });

  it("gives full marks for one entry in each of the four weeks", () => {
    const spread = [0, 8, 15, 22].map((d) => shift(TODAY, -d));
    const s = scoreMind(input({ journalDates: spread }));
    expect(s.score).toBe(10);
    expect(s.working).toContain(`4 of the last ${REFLECTION_WEEKS}`);
  });
});

describe("scorePeopleArea", () => {
  it("scores the fraction inside the cadence, and names the unmeasurable rest", () => {
    const people = [
      person({ id: "a", last_contact: shift(TODAY, -2), cadence_days: 7 }),
      person({ id: "b", last_contact: shift(TODAY, -30), cadence_days: 7 }),
      person({ id: "c", last_contact: null, cadence_days: 7 }),
    ];
    const s = scorePeopleArea(
      input({ people, personArea: { a: "Family", b: "Family", c: "Family" } }),
      "Family"
    );
    expect(s.score).toBe(5); // 1 of 2 measurable
    expect(s.working).toContain("1 of 2");
    expect(s.working).toContain("not yet measurable");
  });

  it("a roster with no contact dates is unmeasured, not a zero", () => {
    // This is Jay's actual state: three people, no dates. Scoring it 0
    // would blame him for the system never having been fed.
    const people = [person({ id: "a", last_contact: null })];
    const s = scorePeopleArea(input({ people, personArea: { a: "Family" } }), "Family");
    expect(s.score).toBeNull();
    expect(s.working).toContain("no clock");
  });
});

describe("scoreVehicles", () => {
  it("counts every date that SHOULD exist, not just the ones recorded", () => {
    // One vehicle, one valid date, three blank: 1 of 4, not 1 of 1.
    const s = scoreVehicles(
      input({
        vehicles: [
          {
            tax_due: shift(TODAY, 200),
            mot_due: null,
            insurance_due: null,
            next_service: null,
          },
        ],
      })
    );
    expect(s.score).toBe(3); // 1/4 → 2.5 → 3
    expect(s.working).toContain("never recorded");
  });

  it("an expired date does not count as current", () => {
    const s = scoreVehicles(
      input({
        vehicles: [
          {
            tax_due: shift(TODAY, -1),
            mot_due: shift(TODAY, 100),
            insurance_due: shift(TODAY, 100),
            next_service: shift(TODAY, 100),
          },
        ],
      })
    );
    expect(s.score).toBe(8); // 3 of 4
  });

  it("says plainly that with no dates it cannot do its job", () => {
    const s = scoreVehicles(
      input({
        vehicles: Array.from({ length: 4 }, () => ({
          tax_due: null,
          mot_due: null,
          insurance_due: null,
          next_service: null,
        })),
      })
    );
    expect(s.score).toBeNull();
    expect(s.working).toContain("cannot");
  });
});

describe("scoreMoney", () => {
  it("scores accounts closed, the measure that predicts payoff", () => {
    const s = scoreMoney(
      input({
        debtsTotal: 4,
        money: { accountsClosed: 2, debtFreeDate: null, arrearsTotal: 500, overdueCount: 0 },
      })
    );
    expect(s.score).toBe(5);
    expect(s.working).toContain("2 of 4");
  });

  it("a missed payment costs more than a closure earns", () => {
    const clean = scoreMoney(
      input({
        debtsTotal: 4,
        money: { accountsClosed: 2, debtFreeDate: null, arrearsTotal: 500, overdueCount: 0 },
      })
    );
    const missed = scoreMoney(
      input({
        debtsTotal: 4,
        money: { accountsClosed: 2, debtFreeDate: null, arrearsTotal: 500, overdueCount: 1 },
      })
    );
    // Two closures earn 5; one missed payment takes it to 3. The world
    // punishes the miss, so it outweighs the progress.
    expect(clean.score).toBe(5);
    expect(missed.score).toBe(3);
    expect(missed.working).toContain("missed");
  });

  it("the penalty is capped, so a bad month cannot go below zero", () => {
    const s = scoreMoney(
      input({
        debtsTotal: 4,
        money: { accountsClosed: 0, debtFreeDate: null, arrearsTotal: 500, overdueCount: 9 },
      })
    );
    expect(s.score).toBe(0);
  });

  it("nothing closed and no balances is UNMEASURED, not a zero", () => {
    // Jay's actual state: 8 creditors, none closed, no figures. Scoring
    // that 0 would say "as bad as this area gets" on the strength of
    // knowing almost nothing — the same mistake as calling an unlogged
    // fortnight a failed training floor.
    const s = scoreMoney(
      input({
        debtsTotal: 8,
        money: { accountsClosed: 0, debtFreeDate: null, arrearsTotal: null, overdueCount: 0 },
      })
    );
    expect(s.score).toBeNull();
    expect(s.source).toBe("unmeasured");
    expect(s.working).toContain("nobody but you");
  });

  it("becomes measurable the moment one balance exists", () => {
    const s = scoreMoney(
      input({
        debtsTotal: 8,
        money: { accountsClosed: 0, debtFreeDate: null, arrearsTotal: 1200, overdueCount: 0 },
      })
    );
    expect(s.score).toBe(0);
    expect(s.source).toBe("computed");
  });

  it("a missed payment makes it measurable too — the world is not waiting for figures", () => {
    const s = scoreMoney(
      input({
        debtsTotal: 8,
        money: { accountsClosed: 0, debtFreeDate: null, arrearsTotal: null, overdueCount: 1 },
      })
    );
    expect(s.source).toBe("computed");
    expect(s.score).toBe(0);
  });
});

/* ================================================================== *
 * The board
 * ================================================================== */

const AREAS = [
  "Training & Fitness",
  "Nutrition & Recovery",
  "Mind & Growth",
  "Family",
  "Friends & Network",
  "Home & Admin",
  "Vehicles",
  "Money & Security",
].map((name) => ({ name, score: 5 }));

describe("standingBoard", () => {
  it("computes seven of the eight and leaves Home & Admin typed", () => {
    const board = standingBoard(AREAS, input());
    const typed = board.filter((a) => a.source === "typed");
    expect(typed.map((a) => a.area)).toEqual(["Home & Admin"]);
  });

  it("keeps the typed score exactly as it was stored", () => {
    const board = standingBoard(AREAS, input());
    expect(board.find((a) => a.area === "Home & Admin")?.score).toBe(5);
  });

  it("OVERRIDES a stale typed score wherever a module can now speak", () => {
    // This is the whole point of v2. Training was typed as 5; the module
    // beneath it says two sessions a fortnight, so the board says 3.
    const board = standingBoard(
      AREAS,
      input({ body: { trainingPerWeek: 1, readinessBand: null, floorHeld: false } })
    );
    const training = board.find((a) => a.area === "Training & Fitness")!;
    expect(training.source).toBe("computed");
    expect(training.score).toBe(3);
    expect(training.score).not.toBe(5);
  });

  it("returns one entry per area, in the order given", () => {
    const board = standingBoard(AREAS, input());
    expect(board.map((a) => a.area)).toEqual(AREAS.map((a) => a.name));
  });
});

describe("areaToAsk", () => {
  it("only ever asks about an area nothing can speak for", () => {
    const board = standingBoard(AREAS, input());
    const ask = areaToAsk(board);
    expect(ask?.area).toBe("Home & Admin");
  });

  it("never asks about a computed area — the system can already answer that", () => {
    const board = standingBoard(AREAS, input());
    const ask = areaToAsk(board);
    expect(ask?.source).not.toBe("computed");
  });
});

describe("standingAverage", () => {
  it("averages only what could be scored, and says how many were computed", () => {
    const board = standingBoard(
      AREAS,
      input({ body: { trainingPerWeek: 4, readinessBand: null, floorHeld: true } })
    );
    const avg = standingAverage(board);
    // Training (10) and Home & Admin (5) are the only two with scores.
    expect(avg.mean).toBe(7.5);
    expect(avg.of).toBe(8);
    expect(avg.computed).toBe(1);
  });

  it("returns null rather than zero when nothing can be scored", () => {
    const bare = standingBoard(
      AREAS.map((a) => ({ ...a, score: null })),
      input()
    );
    expect(standingAverage(bare).mean).toBeNull();
  });
});
