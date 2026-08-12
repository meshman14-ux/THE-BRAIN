import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  type Goal,
  type Habit,
  type HabitLog,
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
  type PersonRow,
  areasFor,
  openCount,
  isUntouched,
  isLive,
  habitsDoneToday,
  bucketGoalsByHorizon,
  horizonsFor,
  lifeGoalsFor,
  HORIZON_LABEL,
  daysUntil,
  isOverdue,
} from "@/lib/logic";
import Standing, { type StandingArea } from "@/components/Standing";
import { bodyContract, moneyContract } from "@/lib/lifeos";
import { standingAverage, standingBoard } from "@/lib/standing";
import { type CookedMealRow, fedState } from "@/lib/training";
import Habits from "@/components/Habits";
import BucketList from "@/components/BucketList";
import Unknowns from "@/components/Unknowns";
import { unknowns } from "@/lib/inline";
import { Panel, Kpi, Empty } from "@/components/ui";

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
    { data: debtRows },
    { data: vehicleRows },
    { data: peopleRows },
    { data: workoutRows },
    { data: healthRows },
    { data: journalRows },
    { data: cookedRows },
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
      .select("id, title, pillar_id, do_date, due_date, priority, status, created_at"),
    // Every goal, not just the active ones: the bucket list is
    // status = 'someday', and filtering it out here would hide it.
    supabase
      .from("goals")
      .select(
        "id, title, description, pillar_id, vision_id, target_date, progress, status"
      ),
    supabase.from("projects").select("pillar_id, due_date, status").eq("status", "active"),
    supabase.from("metrics").select("id, name, unit, direction, pillar_id"),
    supabase.from("metric_readings").select("metric_id, taken_on, value"),
    supabase
      .from("habits")
      .select("id, name, cadence, pillar_id, active, meta, tracked, keystone")
      .eq("active", true)
      .order("name"),
    supabase.from("habit_logs").select("habit_id, done_on"),
    supabase
      .from("debts")
      .select("id, creditor, status, current_balance")
      .order("sort_order"),
    supabase
      .from("vehicles")
      .select("id, name, registration, status, tax_due, mot_due, insurance_due, next_service")
      .order("sort_order"),
    // What STANDING scores the areas FROM. Every one of these is a row
    // that already exists — no new typing anywhere.
    supabase
      .from("people")
      .select("id, name, relationship, last_contact, cadence_days, birthday, pillar_id"),
    supabase.from("workouts").select("on_date").order("on_date", { ascending: false }).limit(60),
    supabase
      .from("health_days")
      .select("on_date, ate_well")
      .order("on_date", { ascending: false })
      .limit(14),
    supabase
      .from("journal")
      .select("entry_date")
      .order("entry_date", { ascending: false })
      .limit(40),
    // The kitchen. Free truth: the cook button already writes this.
    supabase
      .from("meals")
      .select("last_cooked_on, protein_g, estimates")
      .not("last_cooked_on", "is", null),
  ]);

  // The gaps, gathered. Every figure the system is missing across debts and
  // vehicles, so fixing eight of them is eight taps rather than eight
  // navigations — which is the difference between it happening and not.
  const debtsForGaps = (debtRows ?? []) as {
    id: string;
    creditor: string;
    status: string;
    current_balance: number | null;
  }[];
  const vehiclesForGaps = (vehicleRows ?? []) as {
    id: string;
    name: string;
    registration: string | null;
    status: string;
    tax_due: string | null;
    mot_due: string | null;
    insurance_due: string | null;
  }[];
  const gaps = unknowns({ debts: debtsForGaps, vehicles: vehiclesForGaps });
  const gapValues: Record<string, string | number | null> = {};
  for (const d of debtsForGaps) {
    gapValues[`debts.current_balance:${d.id}`] = d.current_balance;
  }
  for (const v of vehiclesForGaps) {
    gapValues[`vehicles.tax_due:${v.id}`] = v.tax_due;
    gapValues[`vehicles.mot_due:${v.id}`] = v.mot_due;
    gapValues[`vehicles.insurance_due:${v.id}`] = v.insurance_due;
  }

  const allPillars = (pillars ?? []) as Pillar[];
  const life = areasFor(allPillars, "life");

  /* -- STANDING · the eight areas, mostly computed ------------------ *
   *
   * The keystone of LIFE_OS v2. Each area is scored FROM the module
   * beneath it wherever a module exists, so the summary and the thing it
   * summarises finally have a wire between them. Nothing here asks Jay
   * for anything: every input is a row that already exists.
   */
  // `pillar_id` lives on the row, not on PersonRow — the cadence helpers
  // deliberately know nothing about areas — so the two are kept apart and
  // joined here, which is the only place that needs both.
  const peopleWithArea = (peopleRows ?? []) as (PersonRow & {
    pillar_id: string | null;
  })[];
  const peopleForStanding: PersonRow[] = peopleWithArea;
  const pillarNameById = new Map(allPillars.map((p) => [p.id, p.name]));
  const standingInput = {
    body: bodyContract({
      trainingDays: ((workoutRows ?? []) as { on_date: string }[]).map((w) => w.on_date),
      readinessBand: null,
      todayIso: today,
    }),
    money: moneyContract({
      debts: (debtRows ?? []) as { current_balance: number | null; status: string }[],
      missedPayments: 0,
      debtFreeDate: null,
    }),
    people: peopleForStanding,
    personArea: Object.fromEntries(
      peopleWithArea.map((p) => [
        p.id,
        p.pillar_id ? (pillarNameById.get(p.pillar_id) ?? null) : null,
      ])
    ),
    ateWell: ((healthRows ?? []) as { ate_well: boolean | null }[]).map((h) => h.ate_well),
    cookedDays: fedState((cookedRows ?? []) as CookedMealRow[], today).cookedDays,
    journalDates: ((journalRows ?? []) as { entry_date: string }[]).map((j) => j.entry_date),
    vehicles: ((vehicleRows ?? []) as {
      tax_due: string | null;
      mot_due: string | null;
      insurance_due: string | null;
      next_service: string | null;
    }[]).map((v) => ({
      tax_due: v.tax_due,
      mot_due: v.mot_due,
      insurance_due: v.insurance_due,
      next_service: v.next_service ?? null,
    })),
    debtsTotal: ((debtRows ?? []) as unknown[]).length,
    todayIso: today,
  };
  const board = standingBoard(
    life.map((p) => ({ name: p.name, score: p.score ?? null })),
    standingInput
  );
  const standingAreas: StandingArea[] = board.map((b) => {
    const pillar = life.find((p) => p.name === b.area)!;
    return { ...b, id: pillar.id, emoji: pillar.emoji, standard: pillar.standard };
  });
  const average = standingAverage(board);
  const lifeIds = new Set(life.map((p) => p.id));

  const allGoals = (goals ?? []) as Goal[];
  const lifeGoals = lifeGoalsFor(allGoals, lifeIds);
  const horizons = bucketGoalsByHorizon(lifeGoals, today, "life");
  const lifeScale = horizonsFor("life").filter((h) => h !== "someday");

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

  const allHabits = (habits ?? []) as Habit[];
  const allLogs = (habitLogs ?? []) as HabitLog[];

  // Training keeps its own headline tile: the streak is the one habit number
  // that belongs beside the money, not buried in a list of six.
  const training = allHabits.find((h) => h.name === "Training");
  const trainingDays = training
    ? allLogs.filter((l) => l.habit_id === training.id).map((l) => l.done_on)
    : [];
  const streak = currentStreak(trainingDays, today);
  const habitsToday = habitsDoneToday(allHabits, allLogs, today);

  const open = openCount(lifeTasks);
  const dueSoon = dueWithin([...lifeTasks, ...lifeProjects], today).length;

  /* -- area status ------------------------------------------------- */

  // Active goals only. The query now returns every status so the bucket
  // list is visible, but an area's count means live work, not wishes.
  const counts = countsByPillar(
    allGoals.filter(isLive),
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
        <div className="flex gap-2 mt-3.5 flex-wrap">
          <Link href="/life/debts" className="chip no-underline">
            £ Debts · the creditors
          </Link>
          <Link href="/life/vehicles" className="chip no-underline">
            ⛭ Vehicles · tax, MOT, insurance
          </Link>
        </div>
      </header>

      {/* -- what the system does not know -------------------------- *
       *
       * A panel, deliberately, and not an alert: it never enters the
       * watchtower and never arrives unasked. It is here because this is
       * the page he is already on when he wonders what the debt total
       * actually is, and the honest answer to that is upstairs in this
       * list.
       */}
      {gaps.length > 0 && (
        <Panel title="◌ Not yet known" hint="each one edits here">
          <Unknowns items={gaps} values={gapValues} />
        </Panel>
      )}

      {/* -- KPI strip --------------------------------------------- */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Debt"
          value={formatGBP(debt?.value ?? null)}
          tone={debt ? "bad" : "faint"}
          href="/life/debts"
          note={
            debt == null
              ? "No reading yet"
              : debtMove == null
                ? `As at ${debt.taken_on} · creditors →`
                : `${debtMove <= 0 ? "↓" : "↑"} ${formatGBP(Math.abs(debtMove))} in 30 days · creditors →`
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
          <p className="text-[0.7rem] text-[var(--faint)] mt-1.5 leading-snug">
            {training
              ? `Tick it below · ${habitsToday.done}/${habitsToday.of} habits today`
              : "No training habit set up"}
          </p>
        </div>
      </div>

      {/* -- daily habits -------------------------------------------- */}
      <div id="habits" className="scroll-mt-20" />
      <Panel
        title="Daily habits"
        hint="one tap · the streak is the point"
        action={
          <Link
            href="/reviews"
            className="text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
          >
            WEEKLY REVIEW →
          </Link>
        }
      >
        <Habits habits={allHabits} logs={allLogs} today={today} />
      </Panel>

      {/* -- horizons + the bucket list ------------------------------ */}
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr] items-start">
        <Panel
          title="Horizons"
          hint="month · six months · annual · 5 year · 10 year"
        >
          {lifeScale.every((h) => horizons.buckets[h].length === 0) &&
          horizons.undated.length === 0 ? (
            <Empty cta={{ href: "/goals", label: "Set a goal" }}>
              No life goals with a date on them. LIFE_OS runs on a different
              scale to the business — months and decades, not quarters and
              reporting years — and a goal files itself under the right one as
              soon as it has a date.
            </Empty>
          ) : (
            <div className="grid gap-3">
              {lifeScale.map((h) => {
                const gs = horizons.buckets[h];
                if (gs.length === 0) return null;
                return (
                  <div key={h}>
                    <div className="flex items-baseline gap-2.5">
                      <p className="label">{HORIZON_LABEL[h]}</p>
                      <span className="mono text-[0.66rem] text-[var(--faint)]">
                        {gs.length}
                      </span>
                    </div>
                    <div className="grid gap-1.5 mt-1.5">
                      {gs.map((g) => {
                        const late = isOverdue(g, today);
                        const days = daysUntil(g.target_date, today);
                        return (
                          <Link
                            key={g.id}
                            href="/goals"
                            className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 no-underline text-[var(--text)] card-hover flex items-center gap-2.5"
                          >
                            <span className="text-[0.82rem] font-medium min-w-0 flex-1">
                              {g.title}
                            </span>
                            <span
                              className="mono text-[0.66rem] shrink-0"
                              style={{
                                color: late ? "var(--bad)" : "var(--faint)",
                              }}
                            >
                              {g.target_date == null
                                ? "no date"
                                : late
                                  ? `${Math.abs(days ?? 0)}d late`
                                  : `${days}d`}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {horizons.undated.length > 0 && (
                <div>
                  <div className="flex items-baseline gap-2.5">
                    <p className="label">No date yet</p>
                    <span className="mono text-[0.66rem] text-[var(--faint)]">
                      {horizons.undated.length}
                    </span>
                  </div>
                  <p className="text-[0.74rem] text-[var(--faint)] mt-1 leading-relaxed">
                    {horizons.undated.map((g) => g.title).join(" · ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title="The bucket list"
          hint="no date, no plan — yet"
          action={
            <span className="mono text-[0.68rem] text-[var(--faint)]">
              {horizons.buckets.someday.length}
            </span>
          }
        >
          <BucketList goals={allGoals} />
        </Panel>
      </div>

      {/* -- areas + status ----------------------------------------- */}
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr] items-start">
        <Panel
          title="Standing · the eight areas"
          hint={`${average.computed} of ${average.of} computed, worst first`}
        >
          <Standing areas={standingAreas} average={average} />
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
