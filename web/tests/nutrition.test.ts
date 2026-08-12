import { describe, expect, it } from "vitest";
import {
  FED_WINDOW_DAYS,
  type CookedMealRow,
  fedState,
  readingsFromMeals,
} from "../src/lib/training";
import { readinessFor } from "../src/lib/hybrid";
import type { Reading } from "../src/lib/hybrid";

const TODAY = "2026-08-12";
const back = (n: number) => {
  const d = new Date(Date.UTC(2026, 7, 12));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const meal = (over: Partial<CookedMealRow> = {}): CookedMealRow => ({
  last_cooked_on: back(1),
  protein_g: 40,
  estimates: false,
  ...over,
});

/* ================================================================== *
 * The adapter — free truth only
 * ================================================================== */

describe("readingsFromMeals", () => {
  it("turns a cooked meal into a nutrition reading on the day it was cooked", () => {
    const [r] = readingsFromMeals([meal({ last_cooked_on: "2026-08-10" })]);
    expect(r.key).toBe("nutrition");
    expect(r.on).toBe("2026-08-10");
    expect(r.value).toBe(40);
  });

  it("sums a day rather than keeping only the last plate", () => {
    const [r] = readingsFromMeals([
      meal({ last_cooked_on: "2026-08-10", protein_g: 40 }),
      meal({ last_cooked_on: "2026-08-10", protein_g: 25 }),
    ]);
    expect(r.value).toBe(65);
  });

  it("emits nothing for a meal never cooked — absence is not zero", () => {
    // A meal sitting in the library uncooked is not a day he ate nothing.
    expect(readingsFromMeals([meal({ last_cooked_on: null })])).toHaveLength(0);
  });

  it("emits nothing for a meal with no protein figure", () => {
    // The macros were never filled in. That is the system's gap, and
    // reading it as a zero-protein day would be the system inventing a
    // failure out of its own empty column.
    expect(readingsFromMeals([meal({ protein_g: null })])).toHaveLength(0);
  });

  it("marks a day derived when any of its numbers is an estimate", () => {
    const [r] = readingsFromMeals([
      meal({ last_cooked_on: "2026-08-10", estimates: false }),
      meal({ last_cooked_on: "2026-08-10", estimates: true }),
    ]);
    // A guess that knows it is a guess is worth having. The engine
    // discounts `derived` to 0.6, which is the whole point of saying so.
    expect(r.source).toBe("derived");
  });

  it("calls a fully measured day imported, not derived", () => {
    const [r] = readingsFromMeals([meal({ estimates: false })]);
    expect(r.source).toBe("import");
  });

  it("returns readings in date order", () => {
    const out = readingsFromMeals([
      meal({ last_cooked_on: "2026-08-11" }),
      meal({ last_cooked_on: "2026-08-01" }),
      meal({ last_cooked_on: "2026-08-06" }),
    ]);
    expect(out.map((r) => r.on)).toEqual(["2026-08-01", "2026-08-06", "2026-08-11"]);
  });
});

/* ================================================================== *
 * It genuinely reaches readiness
 * ================================================================== */

describe("food reaches the readiness engine", () => {
  /** Enough varied history for nutrition to earn a baseline. */
  const history = (): CookedMealRow[] =>
    Array.from({ length: 30 }, (_, i) => ({
      last_cooked_on: back(i + 1),
      protein_g: 30 + (i % 5) * 8,
      estimates: false,
    }));

  it("contributes a nutrition signal once there is history to compare against", () => {
    const readings = [
      ...readingsFromMeals([...history(), meal({ last_cooked_on: TODAY, protein_g: 90 })]),
    ];
    const r = readinessFor(readings, TODAY, { confidenceFloor: 0 });
    expect(r.contributions.some((c) => c.key === "nutrition")).toBe(true);
  });

  it("a well-fed day reads higher than a badly-fed one, judged against himself", () => {
    const wellFed = readinessFor(
      readingsFromMeals([...history(), meal({ last_cooked_on: TODAY, protein_g: 120 })]),
      TODAY,
      { confidenceFloor: 0 }
    );
    const poorlyFed = readinessFor(
      readingsFromMeals([...history(), meal({ last_cooked_on: TODAY, protein_g: 10 })]),
      TODAY,
      { confidenceFloor: 0 }
    );
    expect(wellFed.score).not.toBeNull();
    expect(poorlyFed.score).not.toBeNull();
    expect(wellFed.score!).toBeGreaterThan(poorlyFed.score!);
  });

  it("never fabricates a score from food alone", () => {
    // One signal out of eleven cannot clear the confidence floor, and the
    // engine declining to guess is the behaviour worth pinning.
    const r = readinessFor(readingsFromMeals(history()), TODAY);
    expect(r.score).toBeNull();
  });

  it("does not drown the signals that actually gate recovery", () => {
    // Fuel is weighted 0.3 against HRV's 1.0 on purpose. A big protein day
    // must not talk over a body saying no.
    const sleepAndHrv: Reading[] = Array.from({ length: 30 }, (_, i) => i + 1).flatMap(
      (i) => [
        // Varied, because a flat series has no spread and the engine
        // correctly refuses to build a baseline from a stuck sensor.
        { key: "hrv", value: 58 + (i % 4) * 3, source: "wearable", on: back(i) } as Reading,
        { key: "sleep_hours", value: 7 + (i % 3) * 0.5, source: "wearable", on: back(i) } as Reading,
      ]
    );
    const withFood = readinessFor(
      [
        ...sleepAndHrv,
        { key: "hrv", value: 20, source: "wearable", on: TODAY },
        ...readingsFromMeals([...history(), meal({ last_cooked_on: TODAY, protein_g: 200 })]),
      ],
      TODAY,
      { confidenceFloor: 0 }
    );
    // HRV well below his own normal still lands amber or red, fuel or no fuel.
    expect(withFood.band).not.toBe("green");
  });
});

/* ================================================================== *
 * Is he feeding himself at all
 * ================================================================== */

describe("fedState", () => {
  it("counts distinct cooked days in the window", () => {
    const s = fedState(
      [meal({ last_cooked_on: back(1) }), meal({ last_cooked_on: back(3) })],
      TODAY
    );
    expect(s.cookedDays).toBe(2);
    expect(s.line).toContain(`2 of the last ${FED_WINDOW_DAYS}`);
  });

  it("counts one day once, however many meals were cooked on it", () => {
    const s = fedState(
      [meal({ last_cooked_on: back(1) }), meal({ last_cooked_on: back(1) })],
      TODAY
    );
    expect(s.cookedDays).toBe(1);
  });

  it("refuses to speak when nothing has ever been cooked", () => {
    // An empty meals table and a fortnight of takeaways look identical
    // from here, and only one of them is worth mentioning.
    const s = fedState([meal({ last_cooked_on: null })], TODAY);
    expect(s.cookedDays).toBeNull();
    expect(s.line).toContain("says nothing");
  });

  it("admits it may be undercounting when the window is empty", () => {
    // `meals` keeps only the LAST cooking of each meal, so this is always
    // an undercount, and a line that hid that would be lying.
    const s = fedState([meal({ last_cooked_on: back(40) })], TODAY);
    expect(s.cookedDays).toBe(0);
    expect(s.line).toContain("undercounting");
  });

  it("ignores a date in the future", () => {
    const s = fedState([meal({ last_cooked_on: "2027-01-01" })], TODAY);
    expect(s.cookedDays).toBe(0);
  });
});
