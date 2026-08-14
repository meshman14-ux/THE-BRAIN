import { describe, it, expect } from "vitest";
import {
  CADENCE_DAYS,
  DEFAULT_CADENCE,
  DERIVED_METRICS,
  TREND_WINDOW_DAYS,
  canRecord,
  derivedSource,
  formatChange,
  formatReading,
  freshness,
  metricBand,
  metricsLine,
  parseReading,
  rankMetrics,
  readCadence,
  readMetricNote,
  sparkPath,
  sparkPoints,
  summarise,
  targetMet,
  targetProgress,
  trend,
} from "../src/lib/metrics";
import type { Metric } from "../src/lib/types";

const TODAY = "2026-08-14";

function metric(over: Partial<Metric & { target: number | null; meta: unknown }> = {}) {
  return {
    id: "m1",
    name: "Monthly income",
    unit: "£",
    direction: "up",
    pillar_id: null,
    target: null,
    meta: {},
    ...over,
  };
}

const r = (taken_on: string, value: number) => ({ taken_on, value });

/* ------------------------------------------------------------------ */

describe("derived metrics — the numbers that may not be typed here", () => {
  it("names the four numbers that already have a home", () => {
    expect(Object.keys(DERIVED_METRICS).sort()).toEqual([
      "Debt remaining",
      "Sleep",
      "Steps",
      "Weight",
    ]);
  });

  it("refuses a reading against a derived metric", () => {
    expect(canRecord({ name: "Debt remaining" })).toBe(false);
    expect(canRecord({ name: "Steps" })).toBe(false);
  });

  // The specific bug the registry exists to prevent: a partial debt figure
  // typed here once and presented as a total.
  it("sends the debt figure back to where it is summed", () => {
    expect(derivedSource("Debt remaining")?.home).toBe("debts");
    expect(derivedSource("Debt remaining")?.href).toBe("/life/money");
  });

  // Fails OPEN, and must: the point of the module is metrics of his own.
  it("lets an unknown metric be recorded", () => {
    expect(derivedSource("Books read")).toBeNull();
    expect(canRecord({ name: "Books read" })).toBe(true);
  });

  it("does not match on case or partial name", () => {
    expect(canRecord({ name: "steps" })).toBe(true);
    expect(canRecord({ name: "Steps per day" })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe("readCadence — meta is jsonb, so nothing out of it is trusted", () => {
  it("reads a real cadence", () => {
    expect(readCadence({ cadence: "weekly" })).toBe("weekly");
    expect(readCadence({ cadence: "quarterly" })).toBe("quarterly");
  });

  it("defaults to monthly when absent", () => {
    expect(readCadence({})).toBe(DEFAULT_CADENCE);
    expect(readCadence({ cadence: undefined })).toBe("monthly");
  });

  it("degrades rather than throwing on rubbish", () => {
    expect(readCadence(null)).toBe("monthly");
    expect(readCadence("weekly")).toBe("monthly");
    expect(readCadence([1, 2, 3])).toBe("monthly");
    expect(readCadence({ cadence: 7 })).toBe("monthly");
    expect(readCadence({ cadence: "hourly" })).toBe("monthly");
  });

  it("orders the cadence days sensibly", () => {
    expect(CADENCE_DAYS.daily).toBeLessThan(CADENCE_DAYS.weekly);
    expect(CADENCE_DAYS.weekly).toBeLessThan(CADENCE_DAYS.monthly);
    expect(CADENCE_DAYS.monthly).toBeLessThan(CADENCE_DAYS.quarterly);
  });
});

describe("readMetricNote", () => {
  it("finds either key the seeded rows use", () => {
    expect(readMetricNote({ note: "Partial by his own account" })).toBe(
      "Partial by his own account"
    );
    expect(readMetricNote({ why: "Months of cover" })).toBe("Months of cover");
  });

  it("returns null for anything unusable", () => {
    expect(readMetricNote({})).toBeNull();
    expect(readMetricNote({ note: "   " })).toBeNull();
    expect(readMetricNote({ note: 12 })).toBeNull();
    expect(readMetricNote(null)).toBeNull();
    expect(readMetricNote([])).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("freshness — never read is not the same as lapsed", () => {
  it("reports never when there is nothing", () => {
    expect(freshness([], "monthly", TODAY)).toEqual({
      daysSince: null,
      overdue: false,
      never: true,
    });
  });

  it("is not overdue inside its cadence", () => {
    const f = freshness([r("2026-08-01", 1)], "monthly", TODAY);
    expect(f.daysSince).toBe(13);
    expect(f.overdue).toBe(false);
    expect(f.never).toBe(false);
  });

  it("is overdue past it", () => {
    const f = freshness([r("2026-06-01", 1)], "monthly", TODAY);
    expect(f.daysSince).toBe(74);
    expect(f.overdue).toBe(true);
  });

  it("reads the LATEST reading, not the first", () => {
    const f = freshness([r("2026-01-01", 1), r("2026-08-13", 2)], "weekly", TODAY);
    expect(f.daysSince).toBe(1);
    expect(f.overdue).toBe(false);
  });

  // A reading dated tomorrow is nonsense but must not produce a negative
  // "days ago" that reads as a countdown.
  it("floors a future reading at zero days", () => {
    expect(freshness([r("2026-09-01", 1)], "daily", TODAY).daysSince).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe("trend — one reading is a value, not a trend", () => {
  it("says nothing at all with no readings", () => {
    const t = trend([], TODAY, 90, "up");
    expect(t).toEqual({ change: null, pct: null, verdict: null, basis: 0 });
  });

  it("says nothing with one, and says how close it is", () => {
    const t = trend([r("2026-08-01", 100)], TODAY, 90, "up");
    expect(t.change).toBeNull();
    expect(t.verdict).toBeNull();
    expect(t.basis).toBe(1);
  });

  it("measures across the window", () => {
    const t = trend([r("2026-07-01", 100), r("2026-08-01", 150)], TODAY, 90, "up");
    expect(t.change).toBe(50);
    expect(t.pct).toBe(50);
    expect(t.basis).toBe(2);
  });

  it("ignores readings older than the window", () => {
    const t = trend(
      [r("2020-01-01", 1), r("2026-07-01", 100), r("2026-08-01", 150)],
      TODAY,
      90,
      "up"
    );
    expect(t.basis).toBe(2);
    expect(t.change).toBe(50);
  });

  // The whole reason `direction` is on the table.
  it("judges a fall as better for a down metric and worse for an up one", () => {
    const falling = [r("2026-07-01", 1000), r("2026-08-01", 800)];
    expect(trend(falling, TODAY, 90, "down").verdict).toBe("better");
    expect(trend(falling, TODAY, 90, "up").verdict).toBe("worse");
  });

  it("judges a rise the other way round", () => {
    const rising = [r("2026-07-01", 800), r("2026-08-01", 1000)];
    expect(trend(rising, TODAY, 90, "up").verdict).toBe("better");
    expect(trend(rising, TODAY, 90, "down").verdict).toBe("worse");
  });

  it("calls an unchanged number flat rather than either", () => {
    const t = trend([r("2026-07-01", 500), r("2026-08-01", 500)], TODAY, 90, "up");
    expect(t.verdict).toBe("flat");
    expect(t.change).toBe(0);
  });

  it("refuses a percentage against a zero baseline", () => {
    const t = trend([r("2026-07-01", 0), r("2026-08-01", 40)], TODAY, 90, "up");
    expect(t.change).toBe(40);
    expect(t.pct).toBeNull();
  });

  it("uses the absolute baseline so a negative start does not flip the sign", () => {
    const t = trend([r("2026-07-01", -200), r("2026-08-01", -100)], TODAY, 90, "up");
    expect(t.change).toBe(100);
    expect(t.pct).toBe(50);
  });

  it("reads in date order however the rows arrive", () => {
    const t = trend([r("2026-08-01", 150), r("2026-07-01", 100)], TODAY, 90, "up");
    expect(t.change).toBe(50);
  });
});

/* ------------------------------------------------------------------ */

describe("targetProgress", () => {
  it("is null without a target", () => {
    expect(targetProgress([r("2026-08-01", 50)], null, "up")).toBeNull();
    expect(targetProgress([r("2026-08-01", 50)], undefined, "up")).toBeNull();
  });

  it("is null without a reading — not zero", () => {
    expect(targetProgress([], 100, "up")).toBeNull();
  });

  it("measures an up metric against the target", () => {
    expect(targetProgress([r("2026-08-01", 25)], 100, "up")).toBe(0.25);
  });

  // The one that would be wrong the obvious way round.
  it("measures a down metric from where it STARTED", () => {
    const paying = [r("2026-01-01", 10000), r("2026-08-01", 2000)];
    expect(targetProgress(paying, 0, "down")).toBe(0.8);
  });

  it("clamps rather than reporting over 100%", () => {
    expect(targetProgress([r("2026-08-01", 250)], 100, "up")).toBe(1);
    const over = [r("2026-01-01", 1000), r("2026-08-01", -50)];
    expect(targetProgress(over, 0, "down")).toBe(1);
  });

  it("never returns a negative share", () => {
    expect(targetProgress([r("2026-08-01", -40)], 100, "up")).toBe(0);
    const worse = [r("2026-01-01", 1000), r("2026-08-01", 1500)];
    expect(targetProgress(worse, 0, "down")).toBe(0);
  });

  it("reports a down metric that started already met as met, not as a fraction", () => {
    expect(targetProgress([r("2026-08-01", 50)], 100, "down")).toBe(1);
  });

  it("refuses to invent a journey for a down metric that started above and has no span", () => {
    // start == target, and now above it: there is no distance to measure.
    expect(targetProgress([r("2026-01-01", 100), r("2026-08-01", 120)], 100, "down")).toBeNull();
  });
});

describe("targetMet — the fact a clamped bar hides", () => {
  it("is null when either half is missing", () => {
    expect(targetMet(null, 100, "up")).toBeNull();
    expect(targetMet(50, null, "up")).toBeNull();
  });

  it("respects direction", () => {
    expect(targetMet(100, 100, "up")).toBe(true);
    expect(targetMet(99, 100, "up")).toBe(false);
    expect(targetMet(100, 100, "down")).toBe(true);
    expect(targetMet(101, 100, "down")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("sparkPoints", () => {
  it("is null below two readings", () => {
    expect(sparkPoints([], 100, 20)).toBeNull();
    expect(sparkPoints([r("2026-08-01", 5)], 100, 20)).toBeNull();
    expect(sparkPath(null)).toBeNull();
  });

  it("spans the box, oldest on the left", () => {
    const p = sparkPoints([r("2026-07-01", 0), r("2026-08-01", 10)], 100, 20, 2)!;
    expect(p).toHaveLength(2);
    expect(p[0].x).toBe(2);
    expect(p[1].x).toBe(98);
  });

  it("inverts y so a rising number rises", () => {
    const p = sparkPoints([r("2026-07-01", 0), r("2026-08-01", 10)], 100, 20, 2)!;
    expect(p[0].y).toBeGreaterThan(p[1].y);
  });

  // A flat series must not become a NaN path that renders as nothing.
  it("draws a flat series down the middle rather than dividing by zero", () => {
    const p = sparkPoints([r("2026-07-01", 7), r("2026-08-01", 7)], 100, 20, 2)!;
    expect(p.every((q) => Number.isFinite(q.y))).toBe(true);
    expect(p[0].y).toBe(p[1].y);
    expect(p[0].y).toBe(10);
  });

  it("sorts by date rather than trusting the array", () => {
    const p = sparkPoints([r("2026-08-01", 10), r("2026-07-01", 0)], 100, 20, 2)!;
    expect(p[0].y).toBeGreaterThan(p[1].y);
  });

  it("renders points as an SVG attribute", () => {
    const p = sparkPoints([r("2026-07-01", 0), r("2026-08-01", 10)], 100, 20, 2);
    expect(sparkPath(p)).toBe("2,18 98,2");
  });
});

/* ------------------------------------------------------------------ */

describe("summarise", () => {
  it("gathers a recordable metric's whole state", () => {
    const s = summarise(
      metric({ target: 4000, meta: { cadence: "monthly" } }),
      [r("2026-06-01", 1000), r("2026-08-01", 2000)],
      TODAY
    );
    expect(s.recordable).toBe(true);
    expect(s.cadence).toBe("monthly");
    expect(s.latest).toEqual({ taken_on: "2026-08-01", value: 2000 });
    expect(s.trend.verdict).toBe("better");
    expect(s.progress).toBe(0.5);
    expect(s.met).toBe(false);
    expect(s.fresh.overdue).toBe(false);
  });

  it("marks a derived metric read-only and carries its reason", () => {
    const s = summarise(
      metric({ id: "m2", name: "Debt remaining", direction: "down", meta: { note: "Partial" } }),
      [],
      TODAY
    );
    expect(s.recordable).toBe(false);
    expect(s.derived?.home).toBe("debts");
    expect(s.note).toBe("Partial");
  });

  it("says nothing rather than zero for an untouched metric", () => {
    const s = summarise(metric(), [], TODAY);
    expect(s.latest).toBeNull();
    expect(s.trend.change).toBeNull();
    expect(s.progress).toBeNull();
    expect(s.met).toBeNull();
    expect(s.fresh.never).toBe(true);
  });

  it("reads over a season by default", () => {
    expect(TREND_WINDOW_DAYS).toBe(90);
  });
});

/* ------------------------------------------------------------------ */

describe("rankMetrics — lapsed, then unknown, then working, then derived", () => {
  const lapsed = summarise(metric({ id: "a", name: "Alpha" }), [r("2026-01-01", 1)], TODAY);
  const never = summarise(metric({ id: "b", name: "Bravo" }), [], TODAY);
  const current = summarise(metric({ id: "c", name: "Charlie" }), [r("2026-08-10", 1)], TODAY);
  const derived = summarise(metric({ id: "d", name: "Steps", unit: "steps/day" }), [], TODAY);

  it("bands them", () => {
    expect(metricBand(lapsed)).toBe(1);
    expect(metricBand(never)).toBe(2);
    expect(metricBand(current)).toBe(3);
    expect(metricBand(derived)).toBe(4);
  });

  it("orders by band", () => {
    const order = rankMetrics([derived, current, never, lapsed]).map((s) => s.metric.name);
    expect(order).toEqual(["Alpha", "Bravo", "Charlie", "Steps"]);
  });

  // Unknown is not failing — the same call `pillars.score` makes.
  it("ranks a never-read metric below a lapsed one", () => {
    expect(metricBand(never)).toBeGreaterThan(metricBand(lapsed));
  });

  // A derived metric with no data is the health page's problem, not this one's.
  it("keeps a derived metric last however stale it looks", () => {
    const staleDerived = summarise(
      metric({ id: "e", name: "Weight", unit: "kg" }),
      [r("2020-01-01", 90)],
      TODAY
    );
    expect(metricBand(staleDerived)).toBe(4);
    expect(rankMetrics([staleDerived, current]).map((s) => s.metric.name)).toEqual([
      "Charlie",
      "Weight",
    ]);
  });

  it("puts the most overdue first inside the lapsed band", () => {
    const older = summarise(metric({ id: "f", name: "Zulu" }), [r("2020-01-01", 1)], TODAY);
    expect(rankMetrics([lapsed, older]).map((s) => s.metric.name)).toEqual(["Zulu", "Alpha"]);
  });

  it("is stable and alphabetical everywhere else", () => {
    const c2 = summarise(metric({ id: "g", name: "Aardvark" }), [r("2026-08-11", 1)], TODAY);
    expect(rankMetrics([current, c2]).map((s) => s.metric.name)).toEqual(["Aardvark", "Charlie"]);
  });
});

/* ------------------------------------------------------------------ */

describe("parseReading — a reading is an event, so blank is an error", () => {
  it("takes a number", () => {
    expect(parseReading("2400")).toEqual({ ok: true, value: 2400 });
    expect(parseReading(" 12.5 ")).toEqual({ ok: true, value: 12.5 });
    expect(parseReading("-40")).toEqual({ ok: true, value: -40 });
  });

  it("takes an honest zero", () => {
    expect(parseReading("0")).toEqual({ ok: true, value: 0 });
  });

  // Number("") and Number("  ") are both 0. This is the trap.
  it("refuses a blank rather than storing it as zero", () => {
    expect(parseReading("")).toEqual({ ok: false, error: "Needs a number." });
    expect(parseReading("   ")).toEqual({ ok: false, error: "Needs a number." });
  });

  it("refuses anything that is not a number", () => {
    expect(parseReading("about four thousand").ok).toBe(false);
    expect(parseReading("£2,400").ok).toBe(false);
    expect(parseReading("Infinity").ok).toBe(false);
  });
});

describe("formatReading / formatChange", () => {
  it("renders money as money and a missing figure as a dash", () => {
    expect(formatReading(2400, "£")).toBe("£2,400");
    expect(formatReading(null, "£")).toBe("£—");
    expect(formatReading(null, "kg")).toBe("—");
    expect(formatReading(null, null)).toBe("—");
  });

  it("gives a non-money unit its own words", () => {
    expect(formatReading(8432, "steps/day")).toBe("8,432 steps/day");
    expect(formatReading(7.5, "hours")).toBe("7.5 hours");
    expect(formatReading(12, null)).toBe("12");
  });

  it("keeps a decimal on a small number and drops it on a large one", () => {
    expect(formatReading(82.4, "kg")).toBe("82.4 kg");
    expect(formatReading(2400.6, "£")).toBe("£2,401");
  });

  it("writes a change with its sign, and says so when there is none", () => {
    expect(formatChange(500, "£")).toBe("+£500");
    expect(formatChange(-500, "£")).toBe("−£500");
    expect(formatChange(0, "£")).toBe("no change");
    expect(formatChange(null, "£")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("metricsLine — quiet once there is nothing to say", () => {
  const lapsed = summarise(metric({ id: "a", name: "Monthly income" }), [r("2026-01-01", 1)], TODAY);
  const never = summarise(metric({ id: "b", name: "Savings buffer" }), [], TODAY);
  const current = summarise(metric({ id: "c", name: "Charlie" }), [r("2026-08-10", 1)], TODAY);

  it("names the single lapsed metric", () => {
    expect(metricsLine([lapsed, current])).toBe(
      "Monthly income was last recorded 225 days ago."
    );
  });

  it("counts them once there is more than one", () => {
    const two = summarise(metric({ id: "z", name: "Zulu" }), [r("2026-02-01", 1)], TODAY);
    expect(metricsLine([lapsed, two])).toBe("2 metrics are past their own cadence.");
  });

  it("falls back to the never-recorded count", () => {
    expect(metricsLine([never, current])).toBe(
      "1 metric has never been recorded, so it has no trend yet."
    );
  });

  it("pluralises the never-recorded count", () => {
    const n2 = summarise(metric({ id: "d", name: "Delta" }), [], TODAY);
    expect(metricsLine([never, n2])).toBe(
      "2 metrics have never been recorded, so they have no trend yet."
    );
  });

  // A page that congratulates you daily is a page you learn to skim.
  it("says nothing when everything is current", () => {
    expect(metricsLine([current])).toBeNull();
    expect(metricsLine([])).toBeNull();
  });

  // Derived metrics are never anybody's homework here.
  it("ignores a derived metric with no readings", () => {
    const steps = summarise(metric({ id: "e", name: "Steps" }), [], TODAY);
    expect(metricsLine([current, steps])).toBeNull();
  });
});
