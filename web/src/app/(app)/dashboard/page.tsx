import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  type Metric,
  type MetricReading,
  type Pillar,
  type Task,
  type Venture,
  STAGE_COLOUR,
  STAGE_LABEL,
} from "@/lib/types";
import {
  toIso,
  formatDayLong,
  isoWeekNumber,
  quarterOf,
  daysUntilWeeklyReview,
  formatGBP,
  latestReading,
  currentStreak,
  dueWithin,
  pickThree,
  openCount,
  todayProgress,
  todayReason,
  type TodayReason,
  areasFor,
  averageScore,
  rankAreasByNeed,
  scoreBarPercent,
  inDevelopment,
  backlog,
  sortVentures,
  isShelved,
  isOpenWork,
  greetingFor,
  watchtowerAlerts,
  ALERT_TONE,
  streakHistory,
  taskSplit,
  habitConsistency,
  debtCleared,
  cashThisMonth,
  daysUntil,
} from "@/lib/logic";
import { verseOfDay } from "@/lib/gita";
import { branchForVenture } from "@/lib/references";
import SeedPillars from "@/components/SeedPillars";
import TodayThree, { type TodayItem } from "@/components/TodayThree";
import { Panel, Empty, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

const REASON_TEXT: Record<TodayReason, string> = {
  "do-today": "set for today",
  deadline: "deadline inside 7 days",
  high: "high priority",
  next: "next up",
};

type NavItem = { label: string; href: string; badge?: number; note?: string };

/* ------------------------------------------------------------------ *
 * THE BRAIN — the command centre, built to Jay's own design.
 *
 * It reads over both systems and owns nothing but today's three. The
 * watchtower, the two system panels, the shared task list and the
 * productivity strip all come straight from his prototype; the data
 * behind them is real, and anything with no data yet says so plainly
 * rather than showing an invented number.
 * ------------------------------------------------------------------ */

export default async function TheBrain() {
  const supabase = await createClient();
  const now = new Date();
  const today = toIso(now);

  const [
    { data: pillars, error: pillarsError },
    { data: tasks },
    { data: projects },
    { data: ventures },
    { data: metrics },
    { data: readings },
    { data: habits },
    { data: habitLogs },
    { data: people },
    { data: assets },
    { count: inboxCount },
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
      .select("id, title, pillar_id, project_id, do_date, due_date, priority, status"),
    supabase.from("projects").select("pillar_id, due_date, status").eq("status", "active"),
    supabase
      .from("ventures")
      .select("id, name, pillar_id, stage, progress, one_liner, status, sort_order, external_system")
      .order("sort_order"),
    supabase.from("metrics").select("id, name, unit, direction, pillar_id"),
    supabase.from("metric_readings").select("metric_id, taken_on, value"),
    supabase.from("habits").select("id, name").eq("active", true),
    supabase.from("habit_logs").select("habit_id, done_on"),
    supabase.from("people").select("id, name, last_contact, cadence_days, birthday"),
    supabase.from("assets").select("id, name, kind, income_monthly, cost_monthly, status"),
    supabase.from("inbox").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  // A failed read must never masquerade as an empty account — the seed
  // screen is for a genuinely fresh user, not a dropped connection.
  if (pillarsError) throw new Error(`pillars query failed: ${pillarsError.message}`);

  const allPillars = (pillars ?? []) as Pillar[];
  if (allPillars.length === 0) return <SeedPillars />;

  const allTasks = (tasks ?? []) as Task[];
  const allVentures = (ventures ?? []) as Venture[];
  const pillarById = new Map(allPillars.map((p) => [p.id, p]));
  const lifeAreas = areasFor(allPillars, "life");
  const empireAreas = areasFor(allPillars, "empire");

  /* -- the money and the body -------------------------------------- */

  const allMetrics = (metrics ?? []) as Metric[];
  const allReadings = (readings ?? []) as MetricReading[];
  const readingsNamed = (name: string) => {
    const m = allMetrics.find((x) => x.name === name);
    return m ? allReadings.filter((r) => r.metric_id === m.id) : [];
  };
  const debtReadings = readingsNamed("Debt remaining");
  const debt = latestReading(debtReadings);
  const cleared = debtCleared(debtReadings);
  const steps = latestReading(readingsNamed("Steps").filter((r) => r.taken_on === today));
  const sleep = latestReading(readingsNamed("Sleep").filter((r) => r.taken_on === today));

  const allHabits = (habits ?? []) as { id: string; name: string }[];
  const allLogs = (habitLogs ?? []) as { habit_id: string; done_on: string }[];
  const training = allHabits.find((h) => h.name === "Training");
  const trainingDays = training
    ? allLogs.filter((l) => l.habit_id === training.id).map((l) => l.done_on)
    : [];
  const streak = currentStreak(trainingDays, today);
  const bars = streakHistory(trainingDays, today, 14);
  const consistency = habitConsistency(allHabits.map((h) => h.id), allLogs, today, 7);

  const netMonth = cashThisMonth(
    ((assets ?? []) as {
      income_monthly: number | null;
      cost_monthly: number | null;
      status: string;
    }[]) ?? []
  );

  /* -- work --------------------------------------------------------- */

  const open = openCount(allTasks);
  const split = taskSplit(allTasks, allPillars);
  const dueSoon = dueWithin(
    [
      ...allTasks,
      ...(((projects ?? []) as { due_date: string | null; status: string }[]) || []),
    ],
    today
  );

  const progress = todayProgress(allTasks, today);
  const picked: TodayItem[] = pickThree(allTasks, today).map((t) => {
    const p = t.pillar_id ? pillarById.get(t.pillar_id) : null;
    return {
      id: t.id,
      title: t.title,
      areaLabel: p ? `${p.emoji ?? ""} ${p.name}`.trim() : null,
      system: p?.system ?? null,
      reason: REASON_TEXT[todayReason(t, today)],
      done: t.status === "done",
    };
  });
  const todayCount = allTasks.filter(
    (t) => isOpenWork(t) && t.do_date != null && t.do_date <= today
  ).length;

  const bySystem = (sys: "life" | "empire") => {
    const ids = new Set(areasFor(allPillars, sys).map((p) => p.id));
    return allTasks
      .filter((t) => isOpenWork(t) && t.pillar_id != null && ids.has(t.pillar_id))
      .slice(0, 5);
  };
  const lifeTasks = bySystem("life");
  const empireTasks = bySystem("empire");

  /* -- the watchtower ----------------------------------------------- */

  const alerts = watchtowerAlerts({
    tasks: allTasks,
    people: (people ?? []) as {
      id: string;
      name: string;
      last_contact: string | null;
      cadence_days: number | null;
      birthday: string | null;
    }[],
    ventures: allVentures,
    pillars: allPillars,
    todayIso: today,
  });

  /* -- ventures ----------------------------------------------------- */

  const orderedVentures = sortVentures(allVentures);
  const liveVentures = orderedVentures.filter((v) => !isShelved(v));
  const parked = backlog(allVentures);
  const building = inDevelopment(allVentures);

  /* -- header strings ------------------------------------------------ */

  const greet = greetingFor(now.getHours());
  const verse = verseOfDay(today);
  const wk = isoWeekNumber(today);
  const q = quarterOf(today);
  const reviewIn = daysUntilWeeklyReview(today);
  const reviewText =
    reviewIn === 0
      ? "WEEKLY REVIEW TODAY"
      : reviewIn === 1
        ? "WEEKLY REVIEW TOMORROW"
        : `WEEKLY REVIEW IN ${reviewIn} DAYS`;

  const lifeAvg = averageScore(lifeAreas);
  const empireAvg = averageScore(empireAreas);
  const lifeWorst = rankAreasByNeed(lifeAreas).filter((a) => a.score != null)[0] ?? null;

  const workspace: NavItem[] = [
    { label: "Today", href: "/today", badge: todayCount },
    { label: "Calendar", href: "/calendar" },
    { label: "Work Diary", href: "/diary" },
    { label: "Inbox", href: "/inbox", badge: inboxCount ?? 0 },
    { label: "Feed the System", href: "/feed" },
    { label: "Advisor", href: "/advisor", note: "AI" },
    { label: "Tasks", href: "/planner", badge: open },
  ];
  const arms: NavItem[] = [
    { label: "Finance", href: "/finance" },
    { label: "Ventures", href: "/empire" },
    { label: "Health", href: "/health" },
    { label: "Food", href: "/food" },
    { label: "Kathleen St", href: "/kathleen-st" },
    { label: "Vehicles", href: "/vehicles" },
    { label: "Family", href: "/family" },
    { label: "Personal", href: "/personal" },
  ];
  const plan: NavItem[] = [
    { label: "Daily Wall", href: "/daily-wall" },
    { label: "Mind Map", href: "/map" },
    { label: "Motivation", href: "/motivation" },
    { label: "Library", href: "/library" },
    { label: "Documents", href: "/documents" },
    { label: "Reviews", href: "/reviews" },
    { label: "Me", href: "/me" },
  ];

  return (
    <div className="grid gap-5">
      {/* -- top bar ---------------------------------------------- */}
      <div className="card px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="mono text-[0.8rem] font-semibold leading-none tracking-[0.14em]">
            THE BRAIN
          </p>
          <p className="label mt-1">One OS · Life + Empire</p>
        </div>
        <p className="mono text-[0.66rem] text-[var(--faint)] mx-auto hidden sm:block">
          THE BRAIN / COMMAND CENTRE
        </p>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <Link href="/feed" className="chip no-underline">
            ⬆ Import
          </Link>
          <Link href="/capture" className="btn no-underline text-[0.8rem] py-2 px-3.5">
            + Capture
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[210px_1fr] items-start">
        {/* -- sidebar ---------------------------------------------- */}
        <aside className="hidden lg:grid gap-5 sticky top-[72px]">
          <Link
            href="/search"
            className="card card-hover px-3.5 py-2.5 no-underline text-[var(--muted)] text-[0.8rem] flex items-center gap-2"
          >
            <span>Search everything</span>
            <span className="mono text-[0.62rem] ml-auto border border-[var(--border)] rounded-[5px] px-1.5 py-0.5">
              ⌘K
            </span>
          </Link>
          <NavGroup
            title="Systems"
            items={[
              { label: "LIFE_OS", href: "/life" },
              { label: "EMPIRE_OS", href: "/empire" },
            ]}
          />
          <NavGroup title="Workspace" items={workspace} />
          <NavGroup
            title="Mind Map · My Arms"
            items={arms}
            foot={
              <Link
                href="/map"
                className="mono text-[0.66rem] font-bold no-underline"
                style={{ color: "var(--accent)" }}
              >
                MAP ↗
              </Link>
            }
          />
          <NavGroup title="Plan" items={plan} />
          <NavGroup
            title="Pinned"
            items={[{ label: "Debt payoff plan", href: "/debt-payoff" }]}
          />
          <div className="border-t border-[var(--border)] pt-3.5">
            <p className="label">The mission</p>
            <p className="text-[0.76rem] text-[var(--muted)] mt-1.5 leading-relaxed">
              Make the most of the time left alive. Momentum daily · nothing
              slips · empire in sight.
            </p>
          </div>
        </aside>

        {/* -- main column ------------------------------------------ */}
        <div className="grid gap-5 min-w-0">
          {/* -- WATCHTOWER ------------------------------------------ */}
          {alerts.length > 0 && (
            <section className="card p-4 sm:p-5" style={{ borderColor: "var(--bad)" }}>
              <div className="flex items-center gap-2.5">
                <span className="text-[0.95rem]">⚠️</span>
                <p
                  className="text-[0.7rem] font-bold tracking-[0.14em] uppercase"
                  style={{ color: "var(--bad)" }}
                >
                  Needs attention · {alerts.length}
                </p>
              </div>
              <div className="grid gap-1.5 mt-3">
                {alerts.slice(0, 6).map((a, i) => (
                  <Link
                    key={`${a.kind}-${i}`}
                    href={a.href}
                    className="flex items-center gap-2.5 no-underline text-[var(--text)] py-1"
                  >
                    <span
                      aria-hidden
                      className="w-[6px] h-[6px] rounded-full shrink-0"
                      style={{ background: ALERT_TONE[a.kind] }}
                    />
                    <span
                      className="mono text-[0.62rem] font-bold shrink-0 w-[62px]"
                      style={{ color: ALERT_TONE[a.kind] }}
                    >
                      {a.label}
                    </span>
                    <span className="text-[0.8rem] flex-1 min-w-0 leading-snug">
                      {a.text}
                    </span>
                    <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">
                      →
                    </span>
                  </Link>
                ))}
              </div>
              {alerts.length > 6 && (
                <p className="text-[0.7rem] text-[var(--faint)] mt-2">
                  +{alerts.length - 6} more
                </p>
              )}
            </section>
          )}

          {/* -- HERO ------------------------------------------------- */}
          <div className="card p-4 sm:p-5 flex items-start gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p
                className="text-[0.66rem] font-bold tracking-[0.16em] uppercase"
                style={{ color: "var(--accent)" }}
              >
                Brain_OS · command centre · one view, both lives
              </p>
              <h1 className="text-[1.6rem] sm:text-[1.9rem] font-semibold leading-tight mt-1.5">
                {greet.emoji} {greet.word}, Jay
              </h1>
              <p className="text-[0.82rem] text-[var(--muted)] mt-1.5">
                {formatDayLong(today)} · WK {wk} · Q{q}
              </p>
              <blockquote
                className="mt-3 pl-3 max-w-[62ch] flex items-baseline gap-2.5 flex-wrap"
                style={{ borderLeft: "2px solid var(--accent)" }}
              >
                <span className="text-[0.82rem] italic text-[var(--muted)] leading-relaxed">
                  “{verse.v}”
                </span>
                <span className="mono text-[0.62rem] text-[var(--faint)] shrink-0">
                  {verse.ref}
                </span>
              </blockquote>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span
                className="mono text-[0.72rem] font-bold px-2.5 py-1.5 rounded-[8px]"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                TODAY {progress.done}/{progress.of}
              </span>
              <div
                className="text-center rounded-[12px] px-4 py-2.5"
                style={{
                  background: "var(--card-hover)",
                  border: "1px solid var(--border-bright)",
                }}
              >
                <div className="text-[1.3rem] leading-none">🔥</div>
                <div
                  className="mono text-[1.15rem] font-bold mt-0.5"
                  style={{ color: streak > 0 ? "var(--warn)" : "var(--faint)" }}
                >
                  {streak}
                </div>
                <div className="label" style={{ fontSize: "0.55rem" }}>
                  day streak
                </div>
              </div>
            </div>
          </div>

          {/* -- weekly review pointer ------------------------------- */}
          <Link
            href="/week"
            className="mono text-[0.68rem] font-bold no-underline text-center py-1"
            style={{ color: "var(--accent)" }}
          >
            {reviewText} · optional depth, today has the essentials
          </Link>

          {/* -- THE TWO SYSTEMS ------------------------------------- */}
          <div className="grid gap-5 lg:grid-cols-2 items-start">
            {/* ===== LIFE_OS ===== */}
            <section
              className="sys-life card p-4 sm:p-5 grid gap-4"
              style={{ borderLeft: "4px solid var(--sys)" }}
            >
              <Link
                href="/life"
                className="flex items-center gap-2.5 no-underline text-[var(--text)]"
              >
                <span
                  aria-hidden
                  className="w-[9px] h-[9px] rounded-full shrink-0"
                  style={{ background: "var(--sys)" }}
                />
                <span
                  className="mono text-[0.72rem] font-bold tracking-[0.14em]"
                  style={{ color: "var(--sys)" }}
                >
                  LIFE_OS · PERSONAL
                </span>
                <span className="mono text-[0.62rem] text-[var(--faint)] ml-auto">
                  OPEN →
                </span>
              </Link>

              <div>
                <p className="label">Today&apos;s three</p>
                <div className="mt-2">
                  <TodayThree items={picked} openTotal={open} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  label="👟 Steps"
                  value={steps ? Math.round(steps.value).toLocaleString("en-GB") : "—"}
                />
                <MiniStat label="😴 Sleep" value={sleep ? `${sleep.value}h` : "—"} />
              </div>

              <div>
                <p className="label">Debt-free goal</p>
                <div className="rounded-[10px] border border-[var(--border)] px-3.5 py-3 mt-2">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className="mono text-[1.15rem] font-semibold"
                      style={{ color: debt ? "var(--bad)" : "var(--faint)" }}
                    >
                      {formatGBP(debt?.value ?? null)}
                    </span>
                    <span
                      className="mono text-[0.68rem] ml-auto"
                      style={{ color: cleared ? "var(--good)" : "var(--faint)" }}
                    >
                      {cleared ? `${cleared.percent}% CLEARED` : "no trend yet"}
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <Bar percent={cleared?.percent ?? 0} colour="var(--good)" height={6} />
                  </div>
                  <p className="text-[0.68rem] text-[var(--faint)] mt-2 leading-snug">
                    {cleared
                      ? `From a peak of ${formatGBP(cleared.peak)}.`
                      : "Log the balance again and the bar starts showing progress."}
                  </p>
                </div>
              </div>

              <div>
                <p className="label">
                  Life areas · avg {lifeAvg == null ? "—" : lifeAvg.toFixed(1)}/10
                </p>
                {lifeWorst ? (
                  <div className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 mt-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[0.8rem] font-medium min-w-0 truncate">
                        {lifeWorst.emoji} {lifeWorst.name}
                      </span>
                      <span className="mono text-[0.7rem] ml-auto">
                        {lifeWorst.score}/10
                      </span>
                    </div>
                    <div className="mt-2">
                      <Bar
                        percent={scoreBarPercent(lifeWorst.score)}
                        height={5}
                        colour={
                          (lifeWorst.score ?? 0) <= 3
                            ? "var(--bad)"
                            : (lifeWorst.score ?? 0) <= 6
                              ? "var(--warn)"
                              : "var(--good)"
                        }
                      />
                    </div>
                    <p className="text-[0.68rem] text-[var(--muted)] mt-1.5 leading-snug">
                      {lifeWorst.status_line ?? "Needs attention first."}
                    </p>
                  </div>
                ) : (
                  <p className="text-[0.76rem] text-[var(--faint)] mt-1.5 leading-relaxed">
                    Nothing scored yet — LIFE_OS ranks worst-first once you have.
                  </p>
                )}
              </div>
            </section>

            {/* ===== EMPIRE_OS ===== */}
            <section
              className="sys-empire card p-4 sm:p-5 grid gap-4"
              style={{ borderLeft: "4px solid var(--sys)" }}
            >
              <Link
                href="/empire"
                className="flex items-center gap-2.5 no-underline text-[var(--text)]"
              >
                <span
                  aria-hidden
                  className="w-[9px] h-[9px] rounded-full shrink-0"
                  style={{ background: "var(--sys)" }}
                />
                <span
                  className="mono text-[0.72rem] font-bold tracking-[0.14em]"
                  style={{ color: "var(--sys)" }}
                >
                  EMPIRE_OS · BUSINESS
                </span>
                <span className="mono text-[0.62rem] text-[var(--faint)] ml-auto">
                  OPEN →
                </span>
              </Link>

              <div>
                <p className="label">Cash this month</p>
                <div className="rounded-[10px] border border-[var(--border)] px-3.5 py-3 mt-2">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className="mono text-[1.25rem] font-semibold"
                      style={{
                        color:
                          netMonth == null
                            ? "var(--faint)"
                            : netMonth >= 0
                              ? "var(--good)"
                              : "var(--bad)",
                      }}
                    >
                      {formatGBP(netMonth)}
                    </span>
                    <span className="mono text-[0.66rem] text-[var(--faint)] ml-auto">
                      {building.length} in dev
                    </span>
                  </div>
                  <p className="text-[0.68rem] text-[var(--muted)] mt-1.5 leading-snug">
                    {netMonth == null
                      ? "No asset carries an income or cost figure yet — a dash, not a zero."
                      : "Assets earning minus assets costing."}
                  </p>
                </div>
              </div>

              <div>
                <p className="label">Stage board</p>
                <div className="grid gap-1.5 mt-2">
                  {liveVentures.length === 0 ? (
                    <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed">
                      No live divisions.
                    </p>
                  ) : (
                    liveVentures.map((v) => {
                      const branch = branchForVenture(v.name);
                      const inner = (
                        <>
                          <span
                            aria-hidden
                            className="w-[6px] h-[6px] rounded-full shrink-0"
                            style={{ background: STAGE_COLOUR[v.stage] }}
                          />
                          <span className="text-[0.8rem] flex-1 min-w-0 truncate">
                            {v.name}
                          </span>
                          <span
                            className="mono text-[0.62rem] font-bold shrink-0 uppercase"
                            style={{ color: STAGE_COLOUR[v.stage] }}
                          >
                            {STAGE_LABEL[v.stage]}
                          </span>
                        </>
                      );
                      const cls =
                        "flex items-center gap-2.5 rounded-[8px] border border-[var(--border)] px-3 py-2";
                      return branch ? (
                        <Link
                          key={v.id}
                          href={`/${branch}`}
                          className={`${cls} card-hover no-underline text-[var(--text)]`}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div key={v.id} className={cls}>
                          {inner}
                        </div>
                      );
                    })
                  )}
                </div>
                {parked.length > 0 && (
                  <p className="text-[0.68rem] text-[var(--faint)] mt-2 leading-relaxed">
                    Backlog: {parked.map((v) => v.name).join(" · ")}
                  </p>
                )}
              </div>

              <div>
                <p className="label">
                  Empire areas · avg {empireAvg == null ? "—" : empireAvg.toFixed(1)}/10
                </p>
                <p className="text-[0.72rem] text-[var(--muted)] mt-1.5 leading-relaxed">
                  {empireAvg == null
                    ? "Score the five business areas in EMPIRE_OS and this starts telling you something."
                    : `${empireAreas.filter((a) => a.score != null).length} of ${empireAreas.length} scored.`}
                </p>
              </div>

              <Link
                href="/empire"
                className="rounded-[10px] border px-3.5 py-3 no-underline block card-hover"
                style={{ borderColor: "var(--sys)" }}
              >
                <p className="label" style={{ color: "var(--sys)" }}>
                  CEO dashboard · live
                </p>
                <p className="text-[0.82rem] font-semibold mt-1 text-[var(--text)]">
                  See the whole path to revenue →
                </p>
              </Link>
            </section>
          </div>

          {/* -- TASK LIST · both systems ---------------------------- */}
          <Panel
            title="▤ Task list · what's open"
            action={
              <Link
                href="/planner"
                className="text-[0.74rem] font-semibold no-underline"
                style={{ color: "var(--accent)" }}
              >
                ALL TASKS →
              </Link>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <TaskColumn
                system="life"
                label="LIFE"
                count={split.life}
                tasks={lifeTasks}
                today={today}
              />
              <TaskColumn
                system="empire"
                label="EMPIRE"
                count={split.empire}
                tasks={empireTasks}
                today={today}
              />
            </div>
            {split.unassigned > 0 && (
              <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
                {split.unassigned} open task
                {split.unassigned === 1 ? "" : "s"} with no area — real work, but
                it has not been told which life it belongs to.
              </p>
            )}
          </Panel>

          {/* -- DEADLINES · due now --------------------------------- */}
          <Panel title="◔ Deadlines · due now" hint="next 7 days, overdue included">
            {dueSoon.length === 0 ? (
              <Empty cta={{ href: "/week", label: "Plan the week" }}>
                Nothing due — you&apos;re on top of it. A task earns a place here
                by having a real due date, which is a fact about the world rather
                than a wish.
              </Empty>
            ) : (
              <div className="grid gap-1.5">
                {dueSoon.slice(0, 8).map((t, i) => {
                  const d = daysUntil(t.due_date ?? null, today);
                  const late = d != null && d < 0;
                  return (
                    <div
                      key={"id" in t ? String(t.id) : i}
                      className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
                    >
                      <span className="text-[0.82rem] flex-1 min-w-0 truncate">
                        {"title" in t ? String(t.title) : "Project deadline"}
                      </span>
                      <span
                        className="mono text-[0.66rem] shrink-0"
                        style={{ color: late ? "var(--bad)" : "var(--warn)" }}
                      >
                        {d == null
                          ? t.due_date
                          : late
                            ? `${Math.abs(d)}d late`
                            : d === 0
                              ? "today"
                              : `${d}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* -- PRODUCTIVITY · at a glance -------------------------- */}
          <Panel title="Productivity · at a glance">
            <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr_0.9fr] items-center">
              {/* streak, last 14 days */}
              <div>
                <p className="label" style={{ color: "var(--warn)" }}>
                  Streak · last 14 days
                </p>
                <div className="flex items-end gap-[3px] h-[38px] mt-2.5">
                  {bars.map((hit, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-[2px]"
                      style={{
                        height: hit ? `${30 + (i % 3) * 3}%` : "14%",
                        minHeight: 5,
                        background: hit ? "var(--warn)" : "var(--border)",
                        opacity: hit ? 1 : 0.7,
                      }}
                      title={hit ? "trained" : "no log"}
                    />
                  ))}
                </div>
                <p className="text-[0.68rem] text-[var(--faint)] mt-2 leading-snug">
                  Builds daily as you keep the streak. Today is the last bar.
                </p>
              </div>

              {/* life vs empire */}
              <div>
                <p className="label">Open tasks · life vs empire</p>
                <div
                  className="flex h-[14px] rounded-full overflow-hidden mt-2.5"
                  style={{ background: "var(--border)" }}
                >
                  <div
                    style={{
                      width: `${pct(split.life, split.life + split.empire)}%`,
                      background: "var(--life)",
                    }}
                  />
                  <div
                    style={{
                      width: `${pct(split.empire, split.life + split.empire)}%`,
                      background: "var(--empire)",
                    }}
                  />
                </div>
                <div className="flex gap-3.5 mt-2 flex-wrap">
                  <span className="mono text-[0.68rem]" style={{ color: "var(--life)" }}>
                    ● LIFE {split.life}
                  </span>
                  <span className="mono text-[0.68rem]" style={{ color: "var(--empire)" }}>
                    ● EMPIRE {split.empire}
                  </span>
                  <span className="mono text-[0.68rem] text-[var(--faint)] ml-auto">
                    {split.done} DONE
                  </span>
                </div>
              </div>

              {/* habit consistency */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-[76px] h-[76px] rounded-full flex items-center justify-center"
                  style={{
                    background: `conic-gradient(var(--accent) ${(consistency ?? 0) * 3.6}deg, var(--border) 0deg)`,
                  }}
                >
                  <div
                    className="w-[56px] h-[56px] rounded-full flex items-center justify-center"
                    style={{ background: "var(--card)" }}
                  >
                    <span
                      className="mono text-[0.85rem] font-bold"
                      style={{
                        color: consistency == null ? "var(--faint)" : "var(--accent)",
                      }}
                    >
                      {consistency == null ? "—" : `${consistency}%`}
                    </span>
                  </div>
                </div>
                <p className="label text-center">Habit consistency · 7d</p>
              </div>
            </div>
          </Panel>

          {/* -- AI digest ------------------------------------------- */}
          <Panel title="AI digest" hint="Phase 7 · not wired yet">
            <Empty cta={{ href: "/advisor", label: "What the Advisor will be" }}>
              One paragraph each morning, drawn from your own data: what moved
              yesterday, what is due, which area is quietly slipping. Advisory,
              never autonomous — it drafts, you decide.
            </Empty>
          </Panel>

          <p className="mono text-[0.62rem] tracking-[0.12em] text-[var(--faint)] text-center uppercase">
            The brain reads both · tasks are shared · each system owns its own data
          </p>
        </div>
      </div>
    </div>
  );
}

function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n / total) * 100);
}

function NavGroup({
  title,
  items,
  foot,
}: {
  title: string;
  items: NavItem[];
  foot?: React.ReactNode;
}) {
  return (
    <nav className="grid gap-0.5">
      <div className="flex items-baseline gap-2 mb-1.5">
        <p className="label">{title}</p>
        {foot && <span className="ml-auto">{foot}</span>}
      </div>
      {items.map((n) => (
        <Link
          key={n.href + n.label}
          href={n.href}
          className="flex items-center gap-2 px-2.5 py-[7px] rounded-[8px] no-underline text-[0.82rem] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-2)] transition-colors"
        >
          <span className="min-w-0 truncate">{n.label}</span>
          {n.note && (
            <span className="mono text-[0.6rem] text-[var(--faint)] border border-[var(--border)] rounded-[4px] px-1 py-[1px]">
              {n.note}
            </span>
          )}
          {n.badge != null && n.badge > 0 && (
            <span className="mono ml-auto text-[0.64rem] px-1.5 py-0.5 rounded-full bg-[var(--border)] text-[var(--muted)]">
              {n.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-[var(--border)] px-3 py-2.5">
      <p className="label">{label}</p>
      <p className="mono text-[1.05rem] font-bold mt-1">{value}</p>
    </div>
  );
}

function TaskColumn({
  system,
  label,
  count,
  tasks,
  today,
}: {
  system: "life" | "empire";
  label: string;
  count: number;
  tasks: Task[];
  today: string;
}) {
  const colour = system === "life" ? "var(--life)" : "var(--empire)";
  return (
    <div>
      <p
        className="mono text-[0.66rem] font-bold tracking-[0.12em]"
        style={{ color: colour }}
      >
        {label} · {count}
      </p>
      <div className="grid gap-1.5 mt-2.5">
        {tasks.length === 0 ? (
          <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed">
            Nothing open. Capture adds work without deciding anything.
          </p>
        ) : (
          tasks.map((t) => {
            const d = daysUntil(t.due_date, today);
            return (
              <div key={t.id} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="w-[13px] h-[13px] rounded-[4px] border shrink-0"
                  style={{ borderColor: "var(--border-bright)" }}
                />
                <span className="text-[0.8rem] flex-1 min-w-0 truncate">{t.title}</span>
                {d != null && d <= 7 && (
                  <span
                    className="mono text-[0.62rem] shrink-0"
                    style={{ color: d < 0 ? "var(--bad)" : "var(--warn)" }}
                  >
                    {d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "today" : `${d}d`}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
