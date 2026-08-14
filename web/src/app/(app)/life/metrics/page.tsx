import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Metric, MetricReading, Pillar } from "@/lib/types";
import { toIso, formatDayLong } from "@/lib/logic";
import { summarise, type MetricSummary } from "@/lib/metrics";
import { derivedSeries } from "@/lib/metrics-server";
import MetricBoard from "@/components/MetricBoard";
import AddMetric from "@/components/AddMetric";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * Metrics — Phase 4's last piece.
 *
 * `metrics` and `metric_readings` shipped with the v1 schema and have
 * been read by four pages ever since, all of which found nothing to
 * read: there has never been a writer. This is it.
 *
 * The page holds two kinds of row on purpose (see `metrics.ts`): the
 * numbers only Jay knows, which get an entry box, and the numbers
 * another table already owns, which get the same trend read from there
 * and no box at all. It is one board because they are one question —
 * "what is moving?" — and two behaviours because they have two homes.
 * ------------------------------------------------------------------ */

export default async function Metrics() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: metricRows }, { data: readingRows }, { data: pillarRows }] = await Promise.all([
    supabase
      .from("metrics")
      .select("id, name, unit, direction, pillar_id, target, meta")
      .order("name"),
    supabase.from("metric_readings").select("metric_id, taken_on, value"),
    supabase
      .from("pillars")
      .select("id, system, name, emoji, standard, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
  ]);

  const metrics = (metricRows ?? []) as Metric[];
  const readings = (readingRows ?? []) as MetricReading[];
  const pillars = (pillarRows ?? []) as Pillar[];

  // Only the derived metrics present on this board are resolved, so a
  // board with no health metrics never touches `health_days`.
  const derived = await derivedSeries(supabase, metrics, today);

  const summaries: MetricSummary[] = metrics.map((m) => {
    const own = derived[m.id];
    const series = own
      ? own.readings
      : readings
          .filter((r) => r.metric_id === m.id)
          .map((r) => ({ taken_on: r.taken_on, value: Number(r.value) }));
    return summarise(m, series, today);
  });

  const caveats: Record<string, string | null> = {};
  for (const [id, s] of Object.entries(derived)) caveats[id] = s.caveat;

  return (
    <div className="sys-life grid gap-7">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p
            className="text-xs font-bold tracking-[0.14em] uppercase"
            style={{ color: "var(--sys)" }}
          >
            METRICS
          </p>
          <p className="mono text-[0.72rem] text-[var(--faint)]">{formatDayLong(today)}</p>
          <Link href="/life" className="text-[0.72rem] no-underline text-[var(--muted)]">
            ← LIFE_OS
          </Link>
        </div>
        <h1 className="mt-2">Numbers that move</h1>
        <p className="text-[0.85rem] text-[var(--muted)] mt-1.5 max-w-[62ch]">
          A metric is worth having when it moves and you would act on the movement.
          Anything the system can read for itself — steps, sleep, what you owe — is
          read rather than asked for, so the only numbers here with a box are the
          ones nobody else knows.
        </p>
      </header>

      <MetricBoard summaries={summaries} caveats={caveats} today={today} />

      <AddMetric pillars={pillars} />
    </div>
  );
}
