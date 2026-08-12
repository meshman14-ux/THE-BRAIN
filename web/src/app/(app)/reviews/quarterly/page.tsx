import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Pillar, Review } from "@/lib/types";
import { obstacleTally, toIso } from "@/lib/logic";
import { collectFinishes, monthKey } from "@/lib/finishes";
import { closingTotal, keystoneHabit, splitDebts } from "@/lib/season";
import {
  mondaysIn,
  quarterBounds,
  readPillarScores,
  scoreDeltas,
  seasonDaysInQuarter,
} from "@/lib/quarter";
import QuarterlyReset, {
  type ResetInitial,
  type ResetPillar,
} from "@/components/QuarterlyReset";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The quarterly reset — decision 7's hour, the last of the three rituals.
 *
 * The evidence comes FIRST and is assembled, never generated: a quarter
 * scored from memory is a mood; scored from the record it is a
 * measurement. Then the walk — three questions, thirteen areas, one
 * focus per system — and an explicit close that is itself a finish.
 */
export default async function QuarterlyPage() {
  const supabase = await createClient();
  const today = toIso(new Date());
  const bounds = quarterBounds(today);

  const [
    { data: pillars },
    { data: weeklies },
    { data: quarterlies },
    { data: doneTasks },
    { data: doneRuns },
    { data: recorded },
    { data: ventures },
    { data: seasons },
    { data: debts },
    { data: habits },
    { data: habitLogs },
  ] = await Promise.all([
    supabase
      .from("pillars")
      .select("id, system, name, emoji, sort_order, active, score")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("reviews")
      .select("period_start, completed_at, meta")
      .eq("kind", "weekly")
      .gte("period_start", bounds.start)
      .lte("period_start", bounds.end),
    supabase
      .from("reviews")
      .select("period_start, wins, friction, next_focus, pillar_scores, completed_at, meta")
      .eq("kind", "quarterly")
      .order("period_start", { ascending: false })
      .limit(4),
    supabase
      .from("tasks")
      .select("id, title, priority, status, completed_at")
      .not("completed_at", "is", null)
      .gte("completed_at", bounds.start)
      .limit(400),
    supabase
      .from("diagnostic_runs")
      .select("id, kind, completed_at, subject_id")
      .not("completed_at", "is", null)
      .gte("completed_at", bounds.start)
      .limit(200),
    supabase
      .from("finishes")
      .select("id, title, happened_on, kind")
      .gte("happened_on", bounds.start)
      .lte("happened_on", bounds.end)
      .limit(200),
    supabase.from("ventures").select("id, name"),
    supabase.from("seasons").select("kind, started_on, ended_on"),
    supabase.from("debts").select("current_balance, status, recurring"),
    supabase
      .from("habits")
      .select("id, name, active, tracked, keystone")
      .eq("active", true),
    supabase
      .from("habit_logs")
      .select("habit_id, done_on")
      .gte("done_on", bounds.start),
  ]);

  const allPillars = ((pillars ?? []) as Pillar[]).filter(
    (p) => p.system === "life" || p.system === "empire"
  );

  /* -- evidence, assembled ------------------------------------------ */

  const ventureName = new Map(
    ((ventures ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name])
  );
  const finishes = collectFinishes(
    (doneTasks ?? []) as {
      id: string; title: string; priority: string; status: string; completed_at: string | null;
    }[],
    ((doneRuns ?? []) as {
      id: string; kind: string; completed_at: string | null; subject_id: string;
    }[]).map((r) => ({ ...r, subject_name: ventureName.get(r.subject_id) ?? null })),
    (recorded ?? []) as { id: string; title: string; happened_on: string; kind: string }[]
  ).filter((f) => f.on >= bounds.start && f.on <= bounds.end);

  const monthsWithFinish = new Set(finishes.map((f) => monthKey(f.on))).size;

  const weeklyRows = (weeklies ?? []) as (Pick<Review, "meta"> & {
    period_start: string;
    completed_at: string | null;
  })[];
  const weekliesDone = weeklyRows.filter((w) => w.completed_at != null).length;
  const weeksSoFar = mondaysIn(
    bounds.start,
    today < bounds.end ? today : bounds.end
  );
  const tally = obstacleTally(weeklyRows);

  const quarterRows = (quarterlies ?? []) as (Pick<
    Review,
    "wins" | "friction" | "next_focus" | "completed_at" | "meta"
  > & { period_start: string; pillar_scores: unknown })[];
  const current = quarterRows.find((q) => q.period_start === bounds.start);
  const previous = quarterRows.find((q) => q.period_start < bounds.start);
  const deltas = scoreDeltas(allPillars, readPillarScores(previous?.pillar_scores));
  const moved = deltas.filter((d) => d.delta != null && d.delta !== 0);

  const seasonSpans = ((seasons ?? []) as {
    kind: string; started_on: string; ended_on: string | null;
  }[])
    .map((s) => ({ kind: s.kind, days: seasonDaysInQuarter(s, bounds, today) }))
    .filter((s) => s.days > 0);

  const debtRows = (debts ?? []) as {
    current_balance: number | null; status: string; recurring?: boolean;
  }[];
  const owed = closingTotal(debtRows);
  const closedDebts = splitDebts(debtRows).closing.filter(
    (d) => d.status !== "active"
  ).length;

  const keystone = keystoneHabit(
    (habits ?? []) as { id: string; name: string; active: boolean; tracked?: boolean; keystone?: boolean }[]
  );
  const keystoneDays = keystone
    ? ((habitLogs ?? []) as { habit_id: string; done_on: string }[]).filter(
        (l) => l.habit_id === keystone.id && l.done_on >= bounds.start && l.done_on <= bounds.end
      ).length
    : null;

  const initial: ResetInitial = {
    wins: current?.wins ?? null,
    friction: current?.friction ?? null,
    next_focus: current?.next_focus ?? null,
    pillar_scores: readPillarScores(current?.pillar_scores),
    completed_at: current?.completed_at ?? null,
    meta:
      typeof current?.meta === "object" && current?.meta != null
        ? (current.meta as Record<string, unknown>)
        : {},
  };

  const evidence: { label: string; value: string }[] = [
    {
      label: "Finishes",
      value:
        finishes.length === 0
          ? "none recorded — that is the finding, not a formatting problem"
          : `${finishes.length} · in ${monthsWithFinish} of the quarter's months`,
    },
    {
      label: "Weekly reviews",
      value: `${weekliesDone} of ${weeksSoFar} weeks so far`,
    },
    {
      label: "Kept costing weeks",
      value:
        tally.enough && tally.top != null
          ? `${tally.top.label} — named in ${tally.top.count} reviews`
          : "under three weekly reviews — one bad week is not a pattern",
    },
    {
      label: "Seasons",
      value:
        seasonSpans.length === 0
          ? "none declared"
          : seasonSpans.map((s) => `${s.kind} ${s.days}d`).join(" · "),
    },
    {
      label: "Areas moved",
      value: previous
        ? moved.length === 0
          ? "none since last quarter's snapshot"
          : moved
              .map((d) => `${d.name} ${d.delta! > 0 ? "+" : ""}${d.delta}`)
              .join(" · ")
        : "first quarterly — this reset takes the first snapshot",
    },
    {
      label: "Debt that can close",
      value:
        owed == null
          ? "£— · no balances confirmed"
          : `£${owed.toLocaleString("en-GB")} owed · ${closedDebts} closed`,
    },
    {
      label: keystone ? `${keystone.name} (keystone)` : "Keystone",
      value:
        keystone == null
          ? "none named"
          : `${keystoneDays} day${keystoneDays === 1 ? "" : "s"} this quarter`,
    },
  ];

  return (
    <div className="grid gap-5 max-w-[760px]">
      <div>
        <p className="label">The quarterly reset · {bounds.label}</p>
        <h1 className="text-[1.5rem] font-semibold leading-tight mt-1">
          One hour, four times a year.
        </h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 leading-relaxed max-w-[64ch]">
          The evidence first — a quarter scored from memory is a mood; scored
          from the record it is a measurement. Then three questions, thirteen
          areas, and one focus per system.
          {bounds.daysLeft > 7 &&
            initial.completed_at == null &&
            ` ${bounds.daysLeft} days of ${bounds.label} remain — the reset is usually the boundary's job, but nothing stops an early one.`}
        </p>
      </div>

      {/* -- the record ---------------------------------------------- */}
      <Panel title="◫ The quarter's evidence" hint="assembled from your own data — nothing generated">
        <div className="grid gap-2">
          {evidence.map((e) => (
            <div key={e.label} className="flex items-baseline gap-3 text-[0.82rem]">
              <span className="text-[var(--faint)] w-[150px] shrink-0">{e.label}</span>
              <span className="text-[var(--text)] leading-relaxed">{e.value}</span>
            </div>
          ))}
        </div>
      </Panel>

      <QuarterlyReset
        periodStart={bounds.start}
        periodEnd={bounds.end}
        label={bounds.label}
        pillars={allPillars.map(
          (p): ResetPillar => ({
            id: p.id,
            name: p.name,
            emoji: p.emoji,
            system: p.system,
            score: p.score ?? null,
          })
        )}
        initial={initial}
      />

      <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
        <Link href="/reviews" className="font-semibold no-underline" style={{ color: "var(--accent)" }}>
          ← Back to the weekly review
        </Link>
      </p>
    </div>
  );
}
