import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  type Metric,
  type MetricReading,
  type Pillar,
  type Task,
} from "@/lib/types";
import {
  toIso,
  formatDayLong,
  formatGBP,
  latestReading,
  metricChange,
  currentStreak,
  dueWithin,
  countsByPillar,
  areasFor,
  openCount,
  isUntouched,
} from "@/lib/logic";
import AreaBars from "@/components/AreaBars";
import TrainToday from "@/components/TrainToday";
import { Panel, Kpi } from "@/components/ui";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * LIFE_OS — you as a person.
 *
 * The eight personal areas, worst first, with the only editor the
 * scores have. Business lives in EMPIRE_OS; the command centre reads
 * over both. Tasks with no area belong to THE BRAIN's counts, not to
 * either system — so the numbers here are life-scoped on purpose.
 * ------------------------------------------------------------------ */

export default async function LifeOs() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [
    { data: pillars },
    { data: tasks },
    { data: goals },
    { data: projects },
    { data: metrics },
    { data: readings },
    { data: habits },
    { data: habitLogs },
  ] = await Promise.all([
    supabase
      .from("pillars")
      .select(
        "id, system, name, emoji, standard, sort_order, active, score, status_line, focus_week"
      )
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("tasks")
      .select("id, title, pillar_id, do_date, due_date, priority, status"),
    supabase.from("goals").select("pillar_id").eq("status", "active"),
    supabase.from("projects").select("pillar_id, due_date, status").eq("status", "active"),
    supabase.from("metrics").select("id, name, unit, direction, pillar_id"),
    supabase.from("metric_readings").select("metric_id, taken_on, value"),
    supabase.from("habits").select("id, name").eq("active", true),
    supabase.from("habit_logs").select("habit_id, done_on"),
  ]);

  const allPillars = (pillars ?? []) as Pillar[];
  const life = areasFor(allPillars, "life");
  const lifeIds = new Set(life.map((p) => p.id));

  const allTasks = (tasks ?? []) as Task[];
  const lifeTasks = allTasks.filter((t) => t.pillar_id != null && lifeIds.has(t.pillar_id));
  const lifeProjects = ((projects ?? []) as {
    pillar_id: string | null;
    due_date: string | null;
    status: string;
  }[]).filter((p) => p.pillar_id != null && lifeIds.has(p.pillar_id));

  /* -- the numbers ------------------------------------------------ */

  const allMetrics = (metrics ?? []) as Metric[];
  const allReadings = (readings ?? []) as MetricReading[];
  const debtMetric = allMetrics.find((m) => m.name === "Debt remaining");
  const debtReadings = debtMetric
    ? allReadings.filter((r) => r.metric_id === debtMetric.id)
    : [];
  const debt = latestReading(debtReadings);
  const debtMove = metricChange(debtReadings, today, 30);

  const training = ((habits ?? []) as { id: string; name: string }[]).find(
    (h) => h.name === "Training"
  );
  const trainingDays = training
    ? ((habitLogs ?? []) as { habit_id: string; done_on: string }[])
        .filter((l) => l.habit_id === training.id)
        .map((l) => l.done_on)
    : [];
  const streak = currentStreak(trainingDays, today);
  const trainedToday = trainingDays.includes(today);

  const open = openCount(lifeTasks);
  const dueSoon = dueWithin([...lifeTasks, ...lifeProjects], today).length;

  /* -- area status ------------------------------------------------- */

  const counts = countsByPillar(
    goals ?? [],
    lifeProjects,
    lifeTasks.filter((t) => t.status === "open")
  );
  const statusFor = (p: Pillar): string => {
    if (p.status_line) return p.status_line;
    if (p.name === "Training & Fitness" && streak > 0)
      return `Training logged, ${streak}-day streak`;
    if (p.name === "Money & Security" && debt)
      return `Debt at ${formatGBP(debt.value)} — plan in motion`;
    const c = counts[p.id];
    if (isUntouched(c)) return "Untouched — nothing hung off it yet";
    return `${c.goals} goals · ${c.projects} projects · ${c.tasks} open`;
  };

  return (
    <div className="sys-life grid gap-7">
      {/* ---------------------------------------------------------- */}
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p
            className="text-xs font-bold tracking-[0.14em] uppercase"
            style={{ color: "var(--sys)" }}
          >
            LIFE_OS
          </p>
          <p className="mono text-[0.72rem] text-[var(--faint)]">
            {formatDayLong(today)}
          </p>
          <Link
            href="/dashboard"
            className="ml-auto text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
          >
            ← THE BRAIN
          </Link>
        </div>
        <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold mt-1.5">
          Personal Life OS
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2.5 max-w-[68ch] leading-relaxed">
          You as a person — the eight areas, scored honestly and sorted so the
          one that needs you most is on top. Business is EMPIRE_OS&apos;s
          problem.
        </p>
      </header>

      {/* -- KPI strip --------------------------------------------- */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Debt"
          value={formatGBP(debt?.value ?? null)}
          tone={debt ? "bad" : "faint"}
          note={
            debt == null
              ? "No reading yet"
              : debtMove == null
                ? `As at ${debt.taken_on}`
                : `${debtMove <= 0 ? "↓" : "↑"} ${formatGBP(Math.abs(debtMove))} in 30 days`
          }
        />
        <Kpi
          label="Due 7d"
          value={String(dueSoon)}
          tone={dueSoon > 0 ? "warn" : "text"}
          note="Life deadlines, overdue included"
        />
        <Kpi
          label="Tasks"
          value={String(open)}
          note="Open in life areas"
          href="/planner"
        />
        <div className="card p-4">
          <p className="label">Training</p>
          <p
            className="mono text-[1.5rem] sm:text-[1.75rem] font-semibold leading-none mt-2"
            style={{ color: streak > 0 ? "var(--good)" : "var(--faint)" }}
          >
            {streak}
            <span className="text-[0.9rem]"> day{streak === 1 ? "" : "s"}</span>
          </p>
          {training ? (
            <TrainToday habitId={training.id} today={today} loggedToday={trainedToday} />
          ) : (
            <p className="text-[0.7rem] text-[var(--faint)] mt-1.5">No habit set up</p>
          )}
        </div>
      </div>

      {/* -- areas + status ----------------------------------------- */}
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr] items-start">
        <Panel title="Life areas · needs attention first" hint="worst first, on purpose">
          <AreaBars areas={life} today={today} />
        </Panel>

        <Panel title="Area status" hint="one honest line each">
          <div className="grid gap-1.5">
            {life.map((p) => (
              <Link
                key={p.id}
                href={`/pillar/${p.id}`}
                className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 no-underline text-[var(--text)] card-hover block"
              >
                <p className="text-[0.8rem] font-medium">
                  {p.emoji} {p.name}
                </p>
                <p
                  className="text-[0.72rem] mt-0.5 leading-snug"
                  style={{
                    color: p.status_line ? "var(--muted)" : "var(--faint)",
                  }}
                >
                  {statusFor(p)}
                </p>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
