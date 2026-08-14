import type { Metric, MetricReading } from "./types";
import { debtTotal } from "./logic";
import { DERIVED_METRICS } from "./metrics";

/* ------------------------------------------------------------------ *
 * The derived half — reading another table's truth as a series
 *
 * `DERIVED_METRICS` in `metrics.ts` decides WHICH numbers may not be
 * typed into `metric_readings`. This file is the other half of that
 * bargain: having refused the entry box, it owes the metric a real
 * series read from wherever the number actually lives. A read-only
 * metric that then shows nothing would be strictly worse than the
 * duplicate writer it was protecting against.
 *
 * These readings are NEVER written back. They are assembled per request
 * and handed to the same `summarise()` every recorded metric goes
 * through, so the board renders one kind of row and the difference is
 * only in whether it accepts input.
 * ------------------------------------------------------------------ */

/**
 * The client, typed structurally — the same technique `links-server.ts`
 * uses and for the same reason. Only the two shapes this file actually
 * calls are declared, so a query it does not make cannot be made by
 * accident. `PromiseLike` rather than `Promise` because Supabase's
 * builder is a thenable, not a Promise.
 */
type QueryLike = PromiseLike<{ data: unknown[] | null }>;
type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => QueryLike & {
      order: (col: string, opts: { ascending: boolean }) => QueryLike;
    };
  };
};

export type DerivedSeries = {
  readings: Pick<MetricReading, "taken_on" | "value">[];
  /**
   * Why the series is short or absent, when it is. Shown on the row so
   * "no trend" and "no data" cannot look like the same thing.
   */
  caveat: string | null;
};

const EMPTY: DerivedSeries = { readings: [], caveat: null };

/**
 * Every derived metric's series, keyed by metric id.
 *
 * Only queries the tables the metrics present actually need — a board
 * with no health metrics does not read `health_days`.
 */
export async function derivedSeries(
  supabase: LooseClient,
  metrics: Metric[],
  todayIso: string
): Promise<Record<string, DerivedSeries>> {
  const wanted = metrics.filter((m) => m.name in DERIVED_METRICS);
  if (wanted.length === 0) return {};

  const healthNames = new Set(["Steps", "Sleep", "Weight"]);
  const needsHealth = wanted.some((m) => healthNames.has(m.name));
  const needsDebt = wanted.some((m) => m.name === "Debt remaining");

  const [health, debts] = await Promise.all([
    needsHealth
      ? supabase
          .from("health_days")
          .select("on_date, steps, sleep_hours, weight_kg")
          .order("on_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    needsDebt
      ? supabase.from("debts").select("current_balance, status")
      : Promise.resolve({ data: [] }),
  ]);

  const days = (health.data ?? []) as {
    on_date: string;
    steps: number | null;
    sleep_hours: number | null;
    weight_kg: number | null;
  }[];

  const out: Record<string, DerivedSeries> = {};
  for (const m of wanted) {
    out[m.id] =
      m.name === "Steps"
        ? fromHealth(days, "steps")
        : m.name === "Sleep"
          ? fromHealth(days, "sleep_hours")
          : m.name === "Weight"
            ? fromHealth(days, "weight_kg")
            : m.name === "Debt remaining"
              ? fromDebts(
                  (debts.data ?? []) as { current_balance: number | null; status: string }[],
                  todayIso
                )
              : EMPTY;
  }
  return out;
}

/**
 * One `health_days` column as a series.
 *
 * A NULL column produces NO reading — never a zero. `health_days` has
 * every measure nullable precisely so a day carrying only a weight is a
 * valid day, and turning that day's missing step count into 0 would
 * invent a day spent motionless.
 */
function fromHealth(
  days: { on_date: string; steps: number | null; sleep_hours: number | null; weight_kg: number | null }[],
  column: "steps" | "sleep_hours" | "weight_kg"
): DerivedSeries {
  const readings = days
    .filter((d) => d[column] != null)
    .map((d) => ({ taken_on: d.on_date, value: Number(d[column]) }));
  return {
    readings,
    caveat:
      readings.length === 0
        ? "Nothing recorded yet — this arrives from Health Connect on your phone."
        : null,
  };
}

/**
 * The debt total as a series of exactly one point, dated today.
 *
 * WHY ONE POINT AND NOT A TREND. `debts.current_balance` is a snapshot:
 * it holds what is owed now, and every update overwrites the last. There
 * is no history to read, so a trend here would have to be invented. The
 * genuine source of a debt trend is `debt_payments`, which is empty —
 * when it fills, this becomes a real series and the caveat goes.
 *
 * A partial total is withheld entirely rather than shown, which is the
 * one rule this metric already has written on it: a figure covering some
 * creditors was presented as a total once, and this module exists partly
 * to stop that happening again.
 */
function fromDebts(
  debts: { current_balance: number | null; status: string }[],
  todayIso: string
): DerivedSeries {
  const total = debtTotal(debts);
  if (!total.complete) {
    return {
      readings: [],
      caveat:
        total.knownCount === 0
          ? "No balances recorded, so there is nothing to total."
          : `Known across ${total.knownCount} of ${total.knownCount + total.unknownCount} creditors — a partial figure is not a total.`,
    };
  }
  return {
    readings: [{ taken_on: todayIso, value: total.known }],
    caveat: "Balances are a snapshot, so there is no history behind this figure yet.",
  };
}
