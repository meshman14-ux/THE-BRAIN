import { describe, it, expect } from "vitest";
import {
  ASSET_KINDS,
  INVESTMENT_KINDS,
  VALUATION_STALE_DAYS,
  assetLine,
  holdingsLine,
  holdingsTotals,
  investmentLine,
  isHeld,
  kindLabel,
  rankAssets,
  rankInvestments,
} from "../src/lib/holdings";
import type { Asset, Investment } from "../src/lib/types";

const TODAY = "2026-08-14";

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    name: "Trailer",
    kind: "equipment",
    venture_id: null,
    pillar_id: null,
    value: null,
    income_monthly: null,
    cost_monthly: null,
    status: "held",
    ...over,
  };
}

function investment(over: Partial<Investment> = {}): Investment {
  return {
    id: "i1",
    name: "Global fund",
    kind: "fund",
    platform: null,
    pillar_id: null,
    units: null,
    cost_basis: null,
    current_value: null,
    as_of: null,
    ...over,
  };
}

/* ------------------------------------------------------------------ */

describe("the vocabularies are labels, not constraints", () => {
  it("labels the kinds it knows", () => {
    expect(kindLabel("property")).toBe("Property");
    expect(kindLabel("crypto")).toBe("Crypto");
  });

  // A row written by hand with kind = 'boat' should read as "boat", not be
  // relabelled into a category it is not.
  it("falls back to the raw value rather than to Other", () => {
    expect(kindLabel("boat")).toBe("boat");
    expect(kindLabel("")).toBe("");
  });

  it("offers a kind list for each table", () => {
    expect(ASSET_KINDS).toContain("property");
    expect(INVESTMENT_KINDS).toContain("pension");
    expect(ASSET_KINDS).not.toContain("pension");
  });

  // `netWorth` and `cashflow` in logic.ts both filter on `!== "sold"`.
  // One definition, kept here rather than duplicated.
  it("treats anything but sold as held", () => {
    expect(isHeld("held")).toBe(true);
    expect(isHeld("leased")).toBe(true);
    expect(isHeld("sold")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("assetLine", () => {
  it("nets income against cost", () => {
    const l = assetLine(asset({ income_monthly: 900, cost_monthly: 300 }));
    expect(l.netMonthly).toBe(600);
  });

  it("says nothing when neither figure is recorded", () => {
    const l = assetLine(asset());
    expect(l.netMonthly).toBeNull();
    expect(l.missing).toEqual(["value", "income", "cost"]);
  });

  // "Earns this, costs unknown" is still the best available figure.
  it("nets against a missing half and reports which half is missing", () => {
    const l = assetLine(asset({ income_monthly: 900 }));
    expect(l.netMonthly).toBe(900);
    expect(l.missing).toContain("cost");
    expect(l.missing).not.toContain("income");
  });

  it("computes an annual yield on value", () => {
    const l = assetLine(asset({ value: 120_000, income_monthly: 1000, cost_monthly: 400 }));
    // 600 × 12 = 7,200 on 120,000 = 6%
    expect(l.yieldPct).toBe(6);
  });

  it("handles a negative yield without flinching", () => {
    const l = assetLine(asset({ value: 12_000, cost_monthly: 100 }));
    expect(l.yieldPct).toBe(-10);
  });

  // A yield would drive a keep-or-sell decision, so a guessed one is the
  // most expensive thing this module could produce.
  it("refuses a yield without a value", () => {
    expect(assetLine(asset({ income_monthly: 900 })).yieldPct).toBeNull();
  });

  it("refuses a yield without a monthly figure", () => {
    expect(assetLine(asset({ value: 50_000 })).yieldPct).toBeNull();
  });

  it("returns null rather than Infinity at a zero value", () => {
    const l = assetLine(asset({ value: 0, income_monthly: 100 }));
    expect(l.yieldPct).toBeNull();
  });

  it("marks a sold asset as not held", () => {
    expect(assetLine(asset({ status: "sold" })).held).toBe(false);
  });

  // Supabase returns numerics as strings often enough that this matters.
  it("reads a numeric that arrived as a string", () => {
    const l = assetLine(asset({ value: "1000" as unknown as number, income_monthly: 10 }));
    expect(l.yieldPct).toBe(12);
  });
});

/* ------------------------------------------------------------------ */

describe("investmentLine", () => {
  it("computes gain and percentage", () => {
    const l = investmentLine(investment({ cost_basis: 1000, current_value: 1250 }), TODAY);
    expect(l.gain).toBe(250);
    expect(l.gainPct).toBe(25);
  });

  it("reports a loss as a loss", () => {
    const l = investmentLine(investment({ cost_basis: 1000, current_value: 700 }), TODAY);
    expect(l.gain).toBe(-300);
    expect(l.gainPct).toBe(-30);
  });

  it("says nothing without both halves", () => {
    expect(investmentLine(investment({ current_value: 500 }), TODAY).gain).toBeNull();
    expect(investmentLine(investment({ cost_basis: 500 }), TODAY).gain).toBeNull();
  });

  it("refuses a percentage against a zero basis", () => {
    const l = investmentLine(investment({ cost_basis: 0, current_value: 500 }), TODAY);
    expect(l.gain).toBe(500);
    expect(l.gainPct).toBeNull();
  });

  // A valuation is a fact about a DAY. A fund priced in March shown beside
  // one priced this morning is two different kinds of number.
  it("ages the valuation", () => {
    const l = investmentLine(investment({ as_of: "2026-08-01" }), TODAY);
    expect(l.ageDays).toBe(13);
    expect(l.stale).toBe(false);
  });

  it("calls a valuation older than a quarter stale", () => {
    const l = investmentLine(investment({ as_of: "2026-01-01" }), TODAY);
    expect(l.stale).toBe(true);
    expect(VALUATION_STALE_DAYS).toBe(92);
  });

  it("has no age at all without a date, and is not therefore stale", () => {
    const l = investmentLine(investment({ current_value: 500 }), TODAY);
    expect(l.ageDays).toBeNull();
    expect(l.stale).toBe(false);
  });

  it("floors a future valuation at zero days", () => {
    expect(investmentLine(investment({ as_of: "2026-12-01" }), TODAY).ageDays).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe("holdingsTotals", () => {
  it("is null throughout with nothing recorded", () => {
    const t = holdingsTotals([], []);
    expect(t.assetValue).toBeNull();
    expect(t.investmentValue).toBeNull();
    expect(t.netMonthly).toBeNull();
    expect(t.complete).toBe(false);
  });

  it("sums what is known and counts what is not", () => {
    const t = holdingsTotals(
      [asset({ id: "a1", value: 1000 }), asset({ id: "a2", value: null })],
      [investment({ current_value: 500 })]
    );
    expect(t.assetValue).toBe(1000);
    expect(t.investmentValue).toBe(500);
    expect(t.assetCount).toBe(2);
    expect(t.valuedAssets).toBe(1);
    expect(t.complete).toBe(false);
  });

  it("is complete once every row carries a value", () => {
    const t = holdingsTotals(
      [asset({ value: 1000 })],
      [investment({ current_value: 500 })]
    );
    expect(t.complete).toBe(true);
  });

  // The whole reason `complete` is derived rather than stored.
  it("becomes complete the moment the last figure is entered", () => {
    const before = holdingsTotals([asset({ id: "a1", value: 1 }), asset({ id: "a2" })], []);
    const after = holdingsTotals(
      [asset({ id: "a1", value: 1 }), asset({ id: "a2", value: 2 })],
      []
    );
    expect(before.complete).toBe(false);
    expect(after.complete).toBe(true);
  });

  it("leaves a sold asset out of the totals and the counts", () => {
    const t = holdingsTotals(
      [asset({ id: "a1", value: 1000 }), asset({ id: "a2", value: 9999, status: "sold" })],
      []
    );
    expect(t.assetValue).toBe(1000);
    expect(t.assetCount).toBe(1);
    expect(t.complete).toBe(true);
  });

  it("nets the monthly figures across held assets", () => {
    const t = holdingsTotals(
      [
        asset({ id: "a1", income_monthly: 900, cost_monthly: 300 }),
        asset({ id: "a2", cost_monthly: 100 }),
      ],
      []
    );
    expect(t.netMonthly).toBe(500);
  });

  // Absence is not zero: a row with no monthly figures at all does not
  // drag the net down, it simply is not in it.
  it("ignores an asset with no monthly figures rather than counting it as zero", () => {
    const t = holdingsTotals(
      [asset({ id: "a1", income_monthly: 900 }), asset({ id: "a2" })],
      []
    );
    expect(t.netMonthly).toBe(900);
  });
});

/* ------------------------------------------------------------------ */

describe("ranking", () => {
  it("puts the largest first, which is not the same as worst first", () => {
    const lines = [
      assetLine(asset({ id: "a", name: "Small", value: 100 })),
      assetLine(asset({ id: "b", name: "Big", value: 90_000 })),
    ];
    expect(rankAssets(lines).map((l) => l.asset.name)).toEqual(["Big", "Small"]);
  });

  // Unknown is not "worth nothing" — and sorting it as zero would bury it
  // exactly when it needs entering.
  it("sorts an unvalued asset below every valued one", () => {
    const lines = [
      assetLine(asset({ id: "a", name: "Unknown" })),
      assetLine(asset({ id: "b", name: "Tiny", value: 1 })),
    ];
    expect(rankAssets(lines).map((l) => l.asset.name)).toEqual(["Tiny", "Unknown"]);
  });

  it("puts sold assets last however valuable", () => {
    const lines = [
      assetLine(asset({ id: "a", name: "Sold", value: 99_999, status: "sold" })),
      assetLine(asset({ id: "b", name: "Held", value: 1 })),
    ];
    expect(rankAssets(lines).map((l) => l.asset.name)).toEqual(["Held", "Sold"]);
  });

  it("breaks a value tie on the name", () => {
    const lines = [
      assetLine(asset({ id: "a", name: "Zebra", value: 100 })),
      assetLine(asset({ id: "b", name: "Apple", value: 100 })),
    ];
    expect(rankAssets(lines).map((l) => l.asset.name)).toEqual(["Apple", "Zebra"]);
  });

  it("ranks investments the same way", () => {
    const lines = [
      investmentLine(investment({ id: "a", name: "Unpriced" }), TODAY),
      investmentLine(investment({ id: "b", name: "Small", current_value: 10 }), TODAY),
      investmentLine(investment({ id: "c", name: "Large", current_value: 5000 }), TODAY),
    ];
    expect(rankInvestments(lines).map((l) => l.investment.name)).toEqual([
      "Large",
      "Small",
      "Unpriced",
    ]);
  });
});

/* ------------------------------------------------------------------ */

describe("holdingsLine — ranked by which silence costs most", () => {
  it("names what an empty table is costing elsewhere", () => {
    const line = holdingsLine(holdingsTotals([], []), []);
    expect(line).toContain("net worth");
    expect(line).toContain("dash");
  });

  it("counts unvalued rows next, and says the total is a floor", () => {
    const totals = holdingsTotals([asset({ id: "a1", value: 100 }), asset({ id: "a2" })], []);
    expect(holdingsLine(totals, [])).toBe(
      "1 of 2 holdings have no value recorded, so the total is a floor rather than a figure."
    );
  });

  it("mentions a stale valuation only once everything is valued", () => {
    const inv = investment({ current_value: 500, as_of: "2026-01-01" });
    const totals = holdingsTotals([], [inv]);
    expect(holdingsLine(totals, [investmentLine(inv, TODAY)])).toBe(
      "1 valuation older than a quarter."
    );
  });

  // A board that congratulates you is a board you stop reading.
  it("says nothing when everything is recorded and fresh", () => {
    const inv = investment({ current_value: 500, as_of: TODAY });
    const totals = holdingsTotals([asset({ value: 10 })], [inv]);
    expect(holdingsLine(totals, [investmentLine(inv, TODAY)])).toBeNull();
  });
});
