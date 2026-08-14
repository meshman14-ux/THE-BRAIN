import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Metric, MetricReading } from "@/lib/types";
import {
  toIso,
  formatGBP,
  latestReading,
  normaliseMoneyTab,
  normaliseStrategy,
  MONEY_TABS,
  MONEY_TAB_LABEL,
  MONEY_TAB_QUESTION,
  netWorth,
  cashflow,
  buffer,
  type PayoffDebt,
} from "@/lib/logic";
import MoneyTabs from "@/components/MoneyTabs";
import { Panel, Kpi, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * Money & Security — the MONEY parent area.
 *
 * Six views of one question on one page. Four answer "where do I stand" at
 * four different ranges, and the comparison between them is most of the
 * value — which is why they were never four routes.
 *
 * Accounts and Vehicles are PAGES under this one rather than tabs on it,
 * since 2026-08-14. Both are places you DO something — edit a balance,
 * record an MOT date — and doing needs a place; the four tabs left here
 * only SHOW what this page already fetched. That is the whole rule, and
 * it also closes a duplication: each of those subjects had two addresses
 * before, which is how the sprawl started last time.
 *
 * The rule the whole page obeys is the one formatGBP already encoded:
 * an unknown renders as a dash, never as a zero. That matters most here,
 * because every "helpful" default in a money view lies in the flattering
 * direction — an unknown debt makes net worth look higher, an unrecorded
 * outgoing makes the buffer look longer.
 * ------------------------------------------------------------------ */

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; strategy?: string }>;
}) {
  const sp = await searchParams;
  const tab = normaliseMoneyTab(sp.tab);
  const strategy = normaliseStrategy(sp.strategy);

  const supabase = await createClient();
  const today = toIso(new Date());

  const [
    { data: debtRows },
    { data: assetRows },
    { data: investmentRows },
    { data: metricRows },
    { data: readingRows },
  ] = await Promise.all([
    supabase
      .from("debts")
      .select(
        "id, creditor, status, current_balance, original_amount, plan_amount, plan_frequency, apr, meta"
      )
      .order("sort_order"),
    supabase.from("assets").select("value, income_monthly, cost_monthly, status"),
    supabase.from("investments").select("current_value"),
    supabase.from("metrics").select("id, name, unit, direction, pillar_id"),
    supabase.from("metric_readings").select("metric_id, taken_on, value"),
  ]);

  const raw = (debtRows ?? []) as (PayoffDebt & { meta: unknown })[];
  const debts: PayoffDebt[] = raw.map((d) => ({
    id: d.id,
    creditor: d.creditor,
    status: d.status,
    current_balance: d.current_balance,
    original_amount: d.original_amount,
    plan_amount: d.plan_amount,
    plan_frequency: d.plan_frequency,
    apr: d.apr,
  }));

  // meta is jsonb, so the stamp is read defensively like every other one.
  const confirmedOn: Record<string, string | null> = {};
  for (const d of raw) {
    const m =
      typeof d.meta === "object" && d.meta !== null && !Array.isArray(d.meta)
        ? (d.meta as Record<string, unknown>)
        : {};
    const v = m.balance_confirmed_on;
    confirmedOn[d.id] =
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }

  const assets = (assetRows ?? []) as {
    value: number | null;
    income_monthly: number | null;
    cost_monthly: number | null;
    status: string;
  }[];
  const investments = (investmentRows ?? []) as { current_value: number | null }[];

  const metrics = (metricRows ?? []) as Metric[];
  const readings = (readingRows ?? []) as MetricReading[];
  const latestNamed = (name: string): number | null => {
    const m = metrics.find((x) => x.name === name);
    if (!m) return null;
    const r = latestReading(readings.filter((x) => x.metric_id === m.id));
    return r ? Number(r.value) : null;
  };

  const worth = netWorth({ assets, investments, debts });
  const flow = cashflow({
    incomeMonthly: latestNamed("Monthly income"),
    assets,
    debts,
  });
  const buf = buffer(latestNamed("Savings buffer"), latestNamed("Monthly outgoings"));

  return (
    <div className="sys-life grid gap-5 max-w-[820px]">
      <header>
        <p className="label">LIFE_OS · Money &amp; Security</p>
        <h1 className="text-[1.6rem] font-semibold mt-1.5 leading-tight">Money</h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 max-w-[62ch] leading-relaxed">
          Four views of the same question, at four ranges. Anything the system
          has not been told renders as a dash rather than a zero — every
          convenient default in a money view lies in the flattering direction.
        </p>
      </header>

      <nav className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" aria-label="Money views">
        {MONEY_TABS.map((t) => (
          <Link
            key={t}
            href={t === "debt" ? "/life/money" : `/life/money?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className="chip no-underline shrink-0"
            data-active={t === tab ? "true" : "false"}
          >
            {MONEY_TAB_LABEL[t]}
          </Link>
        ))}
      </nav>
      <p className="text-[0.72rem] text-[var(--faint)] -mt-3">
        {MONEY_TAB_QUESTION[tab]}
      </p>

      {tab === "debt" && (
        <>
          <MoneyTabs
            debts={debts}
            strategy={strategy}
            confirmedOn={confirmedOn}
            today={today}
          />
          <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed">
            Interest rates, references, payment days and the plan schedule live
            on{" "}
            <Link
              href="/life/money/accounts"
              className="font-semibold no-underline"
              style={{ color: "var(--accent)" }}
            >
              the Accounts tab
            </Link>
            .
          </p>
        </>
      )}



      {tab === "worth" && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Net worth"
              value={formatGBP(worth.net)}
              tone={worth.net != null && worth.net < 0 ? "bad" : "text"}
              note={
                worth.net == null
                  ? "Nothing recorded yet"
                  : worth.complete
                    ? "Every input confirmed"
                    : "A ceiling, not a figure"
              }
            />
            <Kpi label="Assets" value={formatGBP(worth.assets)} tone="faint" />
            <Kpi label="Investments" value={formatGBP(worth.investments)} tone="faint" />
            <Kpi label="Debt" value={formatGBP(worth.debts)} tone="faint" />
          </div>
          <Panel title="Why it says ceiling">
            <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
              {worth.complete
                ? "Every asset, investment and debt has a confirmed figure, so this is a number rather than an estimate."
                : "With any debt balance unconfirmed the debt side is understated, which makes net worth OVERSTATED — the flattering direction. So this reads as a ceiling until every input is in. A total that quietly flatters you is worse than no total."}
            </p>
            {/* This page READS the holdings; it is not where they are kept.
                Until Phase 5 there was nowhere at all, which is why both
                figures above have always been a dash. */}
            <Link href="/holdings" className="chip no-underline self-start">
              Assets and investments →
            </Link>
          </Panel>
        </>
      )}

      {tab === "cashflow" && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="In" value={formatGBP(flow.income)} tone="good" />
            <Kpi label="Out" value={formatGBP(flow.costs)} tone="warn" />
            <Kpi
              label="Of which debt"
              value={formatGBP(flow.debtPayments || null)}
              tone="faint"
            />
            <Kpi
              label="Left"
              value={formatGBP(flow.net)}
              tone={flow.net != null && flow.net < 0 ? "bad" : "text"}
            />
          </div>
          {!flow.measurable && (
            <Panel title="Nothing to compare against yet">
              <Empty>
                No income has been recorded, so &ldquo;left over&rdquo; is a dash
                rather than a negative number. &ldquo;I have not been told what
                comes in&rdquo; and &ldquo;nothing comes in&rdquo; are different
                facts, and showing the second would be alarming and wrong.
                Record a reading against the Monthly income metric and this
                starts answering.
              </Empty>
            </Panel>
          )}
        </>
      )}

      {tab === "buffer" && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            <Kpi
              label="Months of cover"
              value={buf.months == null ? "—" : buf.months.toFixed(1)}
              tone={buf.thin ? "bad" : buf.months == null ? "faint" : "good"}
              note={buf.thin ? "Under three months" : undefined}
            />
            <Kpi label="Savings" value={formatGBP(buf.savings)} tone="faint" />
            <Kpi label="Monthly out" value={formatGBP(buf.monthlyOut)} tone="faint" />
          </div>
          <Panel title="How long you would last">
            <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
              {buf.months == null
                ? "Both halves are figures you record: a savings total and what a month actually costs. Neither is guessed, because a buffer computed from an invented outgoings number is a number you might trust with a decision — and it would be the wrong one."
                : buf.thin
                  ? `${buf.months} months. Three is the usual floor, and you are under it — which is worth knowing before it is worth panicking about.`
                  : `${buf.months} months of cover at your recorded outgoings.`}
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
