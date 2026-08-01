import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  type Goal,
  type Metric,
  type MetricReading,
  type Pillar,
  type Project,
  type Task,
  type Venture,
  type Vision,
  STAGE_COLOUR,
  STAGE_LABEL,
  VENTURE_STAGES,
} from "@/lib/types";
import {
  toIso,
  weekOf,
  formatDayLong,
  formatGBP,
  formatCount,
  latestReading,
  metricChange,
  countsByVenture,
  sortVentures,
  inDevelopment,
  backlog,
  ventureRollup,
  weekPriorities,
  slotLabel,
  bucketGoalsByHorizon,
  HORIZONS,
  HORIZON_LABEL,
  daysUntil,
  isShelved,
} from "@/lib/logic";
import { Panel, Empty, Kpi, Bar, Tag } from "@/components/ui";

export const dynamic = "force-dynamic";

/** The number the empire is measured against, if he has ever logged one. */
const DEBT_METRIC = "Debt remaining";
const INCOME_METRIC = "Monthly income";

export default async function EmpirePage() {
  const supabase = await createClient();
  const today = toIso(new Date());
  const week = weekOf(new Date());

  const [
    { data: ventures },
    { data: projects },
    { data: tasks },
    { data: goals },
    { data: pillars },
    { data: metrics },
    { data: readings },
    { data: visions },
  ] = await Promise.all([
    supabase
      .from("ventures")
      .select(
        "id, name, pillar_id, stage, progress, one_liner, status, sort_order, external_system, external_url"
      )
      .order("sort_order"),
    supabase.from("projects").select("id, venture_id, pillar_id, status"),
    supabase
      .from("tasks")
      .select("id, title, notes, pillar_id, project_id, do_date, due_date, priority, status"),
    supabase.from("goals").select("id, title, target_date, progress, status, pillar_id"),
    supabase.from("pillars").select("id, name, emoji, system").eq("active", true),
    supabase.from("metrics").select("id, name, unit, direction, pillar_id"),
    supabase.from("metric_readings").select("metric_id, taken_on, value"),
    supabase
      .from("vision")
      .select("id, title, statement, horizon_years, system, meta")
      .eq("active", true)
      .order("horizon_years", { ascending: false }),
  ]);

  const allVentures = (ventures ?? []) as Venture[];
  const allProjects = (projects ?? []) as (Project & { venture_id: string | null })[];
  const allTasks = (tasks ?? []) as Task[];
  const allGoals = (goals ?? []) as Goal[];
  const pillarById = new Map(
    ((pillars ?? []) as Pick<Pillar, "id" | "name" | "emoji" | "system">[]).map((p) => [
      p.id,
      p,
    ])
  );

  /* -- the money ------------------------------------------------- */

  const allMetrics = (metrics ?? []) as Metric[];
  const allReadings = (readings ?? []) as MetricReading[];
  const readingsFor = (name: string) => {
    const m = allMetrics.find((x) => x.name === name);
    return m ? allReadings.filter((r) => r.metric_id === m.id) : [];
  };

  const debtReadings = readingsFor(DEBT_METRIC);
  const debt = latestReading(debtReadings);
  const debtMove = metricChange(debtReadings, today, 30);

  // "This month" means readings taken inside the current calendar month.
  // With none, the figure is absent rather than zero — see formatGBP.
  const monthPrefix = today.slice(0, 7);
  const income = latestReading(
    readingsFor(INCOME_METRIC).filter((r) => r.taken_on.startsWith(monthPrefix))
  );

  /* -- the ventures ---------------------------------------------- */

  const counts = countsByVenture(allProjects, allTasks);
  const ordered = sortVentures(allVentures);
  const building = inDevelopment(allVentures);
  const parked = backlog(allVentures);

  /* -- the vision ------------------------------------------------ */

  const allVisions = (visions ?? []) as Vision[];
  const longView =
    allVisions.find((v) => (v.horizon_years ?? 0) >= 20) ?? allVisions[0] ?? null;
  // A target figure lives in `meta` rather than a speculative column. Until
  // one is set, the tile shows a dash — the empire has no 20-year number yet
  // and the dashboard will not invent one.
  const target = Number(
    (longView?.meta as Record<string, unknown> | null)?.["target_amount"] ?? NaN
  );

  const priorities = weekPriorities(allTasks, week);
  const { buckets, undated } = bucketGoalsByHorizon(allGoals, today);

  return (
    <div className="sys-empire grid gap-7">
      {/* ---------------------------------------------------------- */}
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p
            className="text-xs font-bold tracking-[0.14em] uppercase"
            style={{ color: "var(--sys)" }}
          >
            EMPIRE_OS
          </p>
          <p className="mono text-[0.72rem] text-[var(--faint)]">
            {formatDayLong(today)}
          </p>
        </div>
        <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold mt-1.5">
          CEO Dashboard
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2.5 max-w-[68ch] leading-relaxed">
          Where the empire actually stands today — honest, early-stage numbers.
          The foundation is getting debt-free while the first businesses reach
          revenue.
        </p>
      </header>

      {/* -- KPI tiles --------------------------------------------- */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Debt remaining"
          value={formatGBP(debt?.value ?? null)}
          tone={debt ? "bad" : "faint"}
          note={
            debt == null
              ? "No reading logged yet"
              : debtMove == null
                ? `As at ${debt.taken_on}`
                : `${debtMove <= 0 ? "↓" : "↑"} ${formatGBP(Math.abs(debtMove))} in 30 days`
          }
        />
        <Kpi
          label="Businesses in dev"
          value={formatCount(building.length)}
          tone={building.length ? "accent" : "faint"}
          note={
            parked.length
              ? `${parked.length} more parked in the backlog`
              : "Live, and not yet earning"
          }
        />
        <Kpi
          label="Income this month"
          value={formatGBP(income?.value ?? null)}
          tone={income ? "good" : "faint"}
          note={
            income
              ? `Logged ${income.taken_on}`
              : "Nothing has landed — a dash, not a zero"
          }
        />
        <Kpi
          label="20-year target"
          value={formatGBP(Number.isFinite(target) ? target : null)}
          tone={Number.isFinite(target) ? "text" : "faint"}
          note={longView ? longView.title : "No vision set"}
        />
      </div>

      {/* -- divisions + priorities -------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Panel
          title="Business divisions"
          hint={`${allVentures.length} on the books`}
        >
          {ordered.length === 0 ? (
            <Empty>
              No divisions yet. A division is a thing that could one day pay
              you — it starts as an idea and earns its way along the stages.
            </Empty>
          ) : (
            <div className="grid gap-1.5">
              {ordered.map((v) => {
                const c = counts[v.id] ?? { projects: 0, tasks: 0 };
                const shelved = isShelved(v);
                return (
                  <div
                    key={v.id}
                    className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
                    style={{ opacity: shelved ? 0.62 : 1 }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[0.9rem] font-semibold">
                          {v.name}
                        </span>
                        {v.external_system && (
                          <Tag
                            colour="var(--faint)"
                            title="A pointer row. THE BRAIN never reads or copies this system's data."
                          >
                            external
                          </Tag>
                        )}
                      </div>
                      {v.one_liner && (
                        <p className="text-[0.76rem] text-[var(--muted)] mt-0.5 leading-snug">
                          {v.one_liner}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="mono text-[0.68rem] text-[var(--faint)] hidden sm:inline">
                        {c.projects}p · {c.tasks}t
                      </span>
                      <Tag colour={STAGE_COLOUR[v.stage]}>
                        {STAGE_LABEL[v.stage]}
                      </Tag>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
            {ordered.length > 0 &&
              "p = projects, t = open tasks. Both read zero until work is hung off a division."}
          </p>
        </Panel>

        <Panel title="This week's priorities" hint={`${week[0]} → ${week[6]}`}>
          {priorities.length === 0 ? (
            <Empty cta={{ href: "/week", label: "Plan the week" }}>
              Nothing marked High with a day this week. Priority on its own is
              an intention; a priority with a day on it is a plan.
            </Empty>
          ) : (
            <ol className="grid gap-1.5">
              {priorities.map((t, i) => {
                const p = t.pillar_id ? pillarById.get(t.pillar_id) : null;
                return (
                  <li
                    key={t.id}
                    className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
                  >
                    <span
                      className="mono text-[0.72rem] font-bold shrink-0 mt-[2px]"
                      style={{ color: "var(--sys)" }}
                    >
                      {slotLabel(i)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.88rem] font-medium leading-snug">
                        {t.title}
                      </p>
                      <p className="text-[0.74rem] text-[var(--muted)] mt-0.5 leading-snug">
                        {t.notes?.split("\n")[0] ??
                          (p ? `${p.emoji ?? ""} ${p.name}`.trim() : "No reason written down yet")}
                      </p>
                    </div>
                    <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">
                      {t.do_date?.slice(8)}/{t.do_date?.slice(5, 7)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>

      {/* -- goals across horizons --------------------------------- */}
      <Panel
        title="Goals · short to long horizon"
        hint="bucketed by target date"
        action={
          <Link
            href="/goals"
            className="text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--sys)" }}
          >
            VIEW ALL →
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HORIZONS.map((h) => (
            <div key={h} className="grid gap-1.5 content-start">
              <p className="label" style={{ color: "var(--sys)" }}>
                {HORIZON_LABEL[h]}
              </p>
              {buckets[h].length === 0 ? (
                <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed">
                  Nothing here yet.
                </p>
              ) : (
                buckets[h].map((g) => {
                  const d = daysUntil(g.target_date, today);
                  return (
                    <div
                      key={g.id}
                      className="rounded-[9px] border border-[var(--border)] px-3 py-2"
                    >
                      <p className="text-[0.8rem] leading-snug">{g.title}</p>
                      <p className="mono text-[0.64rem] text-[var(--faint)] mt-1">
                        {g.target_date}
                        {d != null && d < 0 && (
                          <span style={{ color: "var(--bad)" }}>
                            {" "}
                            · {Math.abs(d)}d late
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>

        {allGoals.length === 0 ? (
          <Empty cta={{ href: "/goals", label: "Set the first one" }}>
            No goals yet, so all four columns are empty. Areas hold a standard
            forever; goals are the things that finish and therefore need a date.
          </Empty>
        ) : (
          undated.length > 0 && (
            <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
              {undated.length} goal{undated.length === 1 ? "" : "s"} with no
              target date sit in no column. A goal without a date is an
              undecided one, not a twenty-year one.
            </p>
          )
        )}
      </Panel>

      {/* -- build progress ---------------------------------------- */}
      <Panel
        title="Build progress · path to revenue"
        action={
          <span className="mono text-[0.62rem] text-[var(--faint)] hidden sm:inline">
            {VENTURE_STAGES.map((s) => STAGE_LABEL[s]).join(" → ")}
          </span>
        }
      >
        {ordered.length === 0 ? (
          <Empty>Nothing to plot until there is a division to plot.</Empty>
        ) : (
          <div className="grid gap-3">
            {ordered.map((v) => {
              const r = ventureRollup(v);
              const shelved = isShelved(v);
              return (
                <div key={v.id} className="grid gap-1.5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[0.82rem] font-medium min-w-0 truncate">
                      {v.name}
                    </span>
                    <span
                      className="text-[0.66rem] uppercase tracking-[0.06em] font-bold shrink-0"
                      style={{ color: STAGE_COLOUR[v.stage] }}
                    >
                      {STAGE_LABEL[v.stage]}
                    </span>
                    {shelved && (
                      <span className="text-[0.66rem] text-[var(--faint)] shrink-0">
                        shelved
                      </span>
                    )}
                    <span className="mono text-[0.74rem] ml-auto shrink-0">
                      {r.shown}%
                    </span>
                  </div>
                  <Bar
                    percent={r.shown}
                    colour={STAGE_COLOUR[v.stage]}
                    muted={shelved}
                  />
                  {r.drifts && r.stated != null && (
                    <p
                      className="text-[0.7rem] leading-relaxed"
                      style={{ color: "var(--warn)" }}
                    >
                      You have this at <b className="mono">{r.stated}%</b>; the{" "}
                      {STAGE_LABEL[v.stage].toLowerCase()} stage puts it at{" "}
                      <b className="mono">{r.derived}%</b>. One of the two is
                      out of date.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
          <span className="sm:hidden">
            {VENTURE_STAGES.map((s) => STAGE_LABEL[s]).join(" → ")}.{" "}
          </span>
          Reaching a stage is progress, so each bar starts at what its stage is
          worth. A shelved venture reads at half that — same idea, nobody
          moving it. Set a figure by hand and it overrides the stage.
        </p>
      </Panel>

      {/* -- the long view ----------------------------------------- */}
      <footer className="card p-5">
        <p className="label" style={{ color: "var(--sys)" }}>
          The 20-year objective
        </p>
        {longView ? (
          <>
            <p className="serif text-[1.15rem] font-semibold mt-2">
              {longView.title}
            </p>
            {longView.statement && (
              <p className="text-sm text-[var(--muted)] mt-2 max-w-[74ch] leading-relaxed">
                {longView.statement}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--muted)] mt-2 max-w-[74ch] leading-relaxed">
            Nothing written down. Every goal above hangs off a horizon; this is
            the one they all point at, and it is the only line here you cannot
            derive from anything else.
          </p>
        )}
      </footer>
    </div>
  );
}
