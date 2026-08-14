/* ------------------------------------------------------------------ *
 * Holdings — what the empire owns
 *
 * `assets` and `investments` shipped with the v1 schema on 2026-07-30 and
 * both are EMPTY. Between them they are read in three places already —
 * `/life/money` sums them for net worth and cashflow, `/empire/[id]`
 * reads asset value as a division's spend — so every one of those figures
 * has rendered `£—` since the day it shipped. Nothing has ever been able
 * to put a row in.
 *
 * TWO TABLES, NOT ONE, AND THE DIFFERENCE IS THE DESIGN. An ASSET is
 * something owned and RUN: a trailer, a property, a van. It earns and it
 * costs, monthly, and both figures are facts about how it is being
 * operated. An INVESTMENT is something owned and HELD: it has a cost
 * basis, a current value and a date that value was true on, and there is
 * no monthly anything. Merging them would mean one row shape carrying
 * four columns that are always null, and the net worth calculation
 * already reads them separately for exactly this reason.
 *
 * THE LAW, as everywhere: absence is not zero. A held asset with no value
 * contributes nothing to a total AND makes that total a floor rather than
 * a figure. Net worth is the one number in this system where every
 * convenient default lies in the flattering direction — an unknown debt
 * understates what is owed, an unknown asset understates what is owned —
 * so both halves report their own completeness and the page says which.
 * ------------------------------------------------------------------ */

import type { Asset, Investment } from "./types";
import { daysUntil, toNumberOrNull } from "./logic";

/* ------------------------------------------------------------------ *
 * 1 · The vocabularies
 * ------------------------------------------------------------------ */

/**
 * `assets.kind` and `investments.kind` are free text with no check
 * constraint, so these are labels the app gives meaning to rather than
 * anything the database enforces — the same standing `notes.kind` has.
 *
 * `kindLabel` therefore falls back to the raw value rather than to
 * "Other": a row written in the SQL editor with `kind = 'boat'` should
 * read as "boat", not be silently relabelled into a category it is not.
 */
export const ASSET_KINDS = ["property", "vehicle", "equipment", "stock", "cash", "other"] as const;
export const INVESTMENT_KINDS = ["fund", "share", "crypto", "pension", "other"] as const;

const LABELS: Record<string, string> = {
  property: "Property",
  vehicle: "Vehicle",
  equipment: "Equipment",
  stock: "Stock",
  cash: "Cash",
  fund: "Fund",
  share: "Shares",
  crypto: "Crypto",
  pension: "Pension",
  other: "Other",
};

export function kindLabel(kind: string): string {
  return LABELS[kind] ?? kind;
}

/**
 * `assets.status` defaults to `held`. Anything else is treated as sold —
 * `netWorth` and `cashflow` in `logic.ts` both filter on `!== "sold"`,
 * and this keeps that one definition rather than adding a second.
 */
export function isHeld(status: string): boolean {
  return status !== "sold";
}

/* ------------------------------------------------------------------ *
 * 2 · One asset — what it earns, what it costs, what it yields
 * ------------------------------------------------------------------ */

export type AssetLine = {
  asset: Asset;
  held: boolean;
  /** Income minus cost, monthly. Null unless at least one is recorded. */
  netMonthly: number | null;
  /**
   * Annual net return as a percentage of the asset's value.
   *
   * Null without BOTH a value and a monthly figure, and null at a value
   * of zero rather than Infinity. A yield is the number that would drive
   * a keep-or-sell decision, so a guessed one is the most expensive kind
   * of wrong this module could produce.
   */
  yieldPct: number | null;
  /** Which figures are missing, so the row can say so rather than imply zero. */
  missing: ("value" | "income" | "cost")[];
};

export function assetLine(asset: Asset): AssetLine {
  const value = toNumberOrNull(asset.value);
  const income = toNumberOrNull(asset.income_monthly);
  const cost = toNumberOrNull(asset.cost_monthly);

  const missing: ("value" | "income" | "cost")[] = [];
  if (value == null) missing.push("value");
  if (income == null) missing.push("income");
  if (cost == null) missing.push("cost");

  // A recorded income with no recorded cost is "earns this, costs unknown"
  // — the net is still the best available figure and the row says the cost
  // is missing. Neither recorded means there is nothing to net at all.
  const netMonthly = income == null && cost == null ? null : (income ?? 0) - (cost ?? 0);

  const yieldPct =
    value == null || value === 0 || netMonthly == null
      ? null
      : Math.round(((netMonthly * 12) / value) * 1000) / 10;

  return { asset, held: isHeld(asset.status), netMonthly, yieldPct, missing };
}

/* ------------------------------------------------------------------ *
 * 3 · One investment — what it has done, and when that was last true
 * ------------------------------------------------------------------ */

export type InvestmentLine = {
  investment: Investment;
  /** Current value minus cost basis. Null without both. */
  gain: number | null;
  /** The same as a percentage of what was put in. Null at a zero basis. */
  gainPct: number | null;
  /**
   * Days since `as_of`. Null when no date is recorded.
   *
   * A valuation is a fact about a DAY, not a standing truth, and a fund
   * priced in March shown beside one priced this morning is two different
   * kinds of number under one heading. The page says how old each is.
   */
  ageDays: number | null;
  /** Older than a quarter. Reported, never corrected — nothing here guesses. */
  stale: boolean;
};

/** A valuation older than this is called out. One quarter, matching the
 *  one review cadence in the system that looks at money seriously. */
export const VALUATION_STALE_DAYS = 92;

export function investmentLine(investment: Investment, todayIso: string): InvestmentLine {
  const value = toNumberOrNull(investment.current_value);
  const basis = toNumberOrNull(investment.cost_basis);
  const gain = value == null || basis == null ? null : value - basis;
  const gainPct =
    gain == null || basis == null || basis === 0
      ? null
      : Math.round((gain / Math.abs(basis)) * 1000) / 10;

  const ago = investment.as_of ? daysUntil(investment.as_of, todayIso) : null;
  const ageDays = ago == null ? null : Math.max(0, -ago);

  return {
    investment,
    gain,
    gainPct,
    ageDays,
    stale: ageDays != null && ageDays > VALUATION_STALE_DAYS,
  };
}

/* ------------------------------------------------------------------ *
 * 4 · The totals, and how much of each is actually known
 * ------------------------------------------------------------------ */

export type HoldingsTotals = {
  /** Held assets at their recorded value. Null when none is recorded. */
  assetValue: number | null;
  /** Investments at their recorded current value. Null when none is. */
  investmentValue: number | null;
  /** Net monthly across held assets. Null when nothing is recorded. */
  netMonthly: number | null;
  assetCount: number;
  investmentCount: number;
  /** Rows counted in the totals versus rows that exist. */
  valuedAssets: number;
  valuedInvestments: number;
  /**
   * Every held row carries a value, so the totals are figures rather than
   * floors. Derived rather than stored, so it maintains itself — the
   * moment the last figure is entered it stops being provisional with no
   * flag anyone has to remember to flip. This is `debtTotal`'s rule, and
   * it matters more here: an understated asset total flatters nothing,
   * but an understated one on the same page as an understated debt makes
   * a net worth that could be wrong in either direction.
   */
  complete: boolean;
};

export function holdingsTotals(
  assets: Asset[],
  investments: Investment[]
): HoldingsTotals {
  const held = assets.filter((a) => isHeld(a.status));
  const assetValues = held.map((a) => toNumberOrNull(a.value));
  const invValues = investments.map((i) => toNumberOrNull(i.current_value));
  const valuedAssets = assetValues.filter((v) => v != null).length;
  const valuedInvestments = invValues.filter((v) => v != null).length;

  const lines = held.map(assetLine);
  const nets = lines.map((l) => l.netMonthly).filter((n): n is number => n != null);

  return {
    assetValue: valuedAssets === 0 ? null : sum(assetValues),
    investmentValue: valuedInvestments === 0 ? null : sum(invValues),
    netMonthly: nets.length === 0 ? null : nets.reduce((a, b) => a + b, 0),
    assetCount: held.length,
    investmentCount: investments.length,
    valuedAssets,
    valuedInvestments,
    complete:
      held.length + investments.length > 0 &&
      valuedAssets === held.length &&
      valuedInvestments === investments.length,
  };
}

function sum(xs: (number | null)[]): number {
  return xs.reduce<number>((total, x) => total + (x ?? 0), 0);
}

/* ------------------------------------------------------------------ *
 * 5 · The order they appear in
 * ------------------------------------------------------------------ */

/**
 * Sold rows last, then largest first, then by name.
 *
 * Largest first rather than worst first, which is the departure from the
 * rest of the system and it is deliberate: an asset is not a problem to
 * be fixed, and "worst" here would mean lowest yield, which would put a
 * house the family lives in below a trailer. Size is the honest ordering
 * for a list of things owned. **A row with no value sorts below every
 * valued one** — unknown is not "worth nothing", it is unknown, and
 * sorting it as zero would bury it exactly when it needs entering.
 */
export function rankAssets(lines: AssetLine[]): AssetLine[] {
  return [...lines].sort((a, b) => {
    if (a.held !== b.held) return a.held ? -1 : 1;
    const av = toNumberOrNull(a.asset.value);
    const bv = toNumberOrNull(b.asset.value);
    if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
    if (av != null && bv != null && av !== bv) return bv - av;
    return a.asset.name.localeCompare(b.asset.name);
  });
}

/** Same rule for investments: valued first, largest first, then by name. */
export function rankInvestments(lines: InvestmentLine[]): InvestmentLine[] {
  return [...lines].sort((a, b) => {
    const av = toNumberOrNull(a.investment.current_value);
    const bv = toNumberOrNull(b.investment.current_value);
    if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
    if (av != null && bv != null && av !== bv) return bv - av;
    return a.investment.name.localeCompare(b.investment.name);
  });
}

/* ------------------------------------------------------------------ *
 * 6 · The one line
 * ------------------------------------------------------------------ */

/**
 * What the page leads with, or null when it has nothing to say.
 *
 * Ranked by which silence costs the most. An empty table is worth naming
 * because three figures elsewhere in the system are blank because of it.
 * An unvalued row is next, because it makes a total a floor. A stale
 * valuation is last: the figure is still a figure, just an old one.
 */
export function holdingsLine(
  totals: HoldingsTotals,
  investmentLines: InvestmentLine[]
): string | null {
  if (totals.assetCount === 0 && totals.investmentCount === 0) {
    return "Nothing recorded yet, which is why net worth, cashflow and every division's spend read as a dash.";
  }
  const unvaluedAssets = totals.assetCount - totals.valuedAssets;
  const unvaluedInv = totals.investmentCount - totals.valuedInvestments;
  const unvalued = unvaluedAssets + unvaluedInv;
  if (unvalued > 0) {
    return `${unvalued} of ${totals.assetCount + totals.investmentCount} holdings have no value recorded, so the total is a floor rather than a figure.`;
  }
  const stale = investmentLines.filter((l) => l.stale).length;
  if (stale > 0) {
    return `${stale} valuation${stale === 1 ? "" : "s"} older than a quarter.`;
  }
  return null;
}
