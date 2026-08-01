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
  SYSTEM_BLURB,
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
  rankAreasByNeed,
  averageScore,
  scoreBarPercent,
  inDevelopment,
  backlog,
  sortVentures,
  isShelved,
} from "@/lib/logic";
import { VENTURE_BRANCH } from "@/lib/references";
import SeedPillars from "@/components/SeedPillars";
import TodayThree, { type TodayItem } from "@/components/TodayThree";
import TrainToday from "@/components/TrainToday";
import { Panel, Empty, Tag, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

const REASON_TEXT: Record<TodayReason, string> = {
  "do-today": "set for today",
  deadline: "deadline inside 7 days",
  high: "high priority",
  next: "next up",
};

/* ------------------------------------------------------------------ *
 * THE BRAIN — the command centre.
 *
 * It reads over both systems and owns nothing except today's three.
 * LIFE_OS (/life) and EMPIRE_OS (/empire) are where the detail lives;
 * this page tells you which one needs you, then gets out of the way.
 * ------------------------------------------------------------------ */

type NavItem = { label: string; href: string; badge?: number; note?: string };

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
    supabase.from("inbox").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  // A failed read must never masquerade as an empty account — the seed
  // screen is for a genuinely fresh user, not for a dropped connection or an
  // expired token. Throw and let the error boundary say something went wrong.
  if (pillarsError) throw new Error(`pillars query failed: ${pillarsError.message}`);

  const allPillars = (pillars ?? []) as Pillar[];
  if (allPillars.length === 0) return <SeedPillars />;

  const allTasks = (tasks ?? []) as Task[];
  const allVentures = (ventures ?? []) as Venture[];
  const pillarById = new Map(allPillars.map((p) => [p.id, p]));

  const lifeAreas = areasFor(allPillars, "life");
  const empireAreas = areasFor(allPillars, "empire");

  /* -- the numbers ----------------------------------------------- */

  const allMetrics = (metrics ?? []) as Metric[];
  const allReadings = (readings ?? []) as MetricReading[];
  const debtMetric = allMetrics.find((m) => m.name === "Debt remaining");
  const debt = debtMetric
    ? latestReading(allReadings.filter((r) => r.metric_id === debtMetric.id))
    : null;

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

  const open = openCount(allTasks);
  const dueSoon = dueWithin(
    [
      ...allTasks,
      ...(((projects ?? []) as { due_date: string | null; status: string }[]) || []),
    ],
    today
  ).length;

  /* -- today ------------------------------------------------------ */

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
    (t) =>
      (t.status === "open" || t.status === "doing") &&
      t.do_date != null &&
      t.do_date <= today
  ).length;

  /* -- system summaries ------------------------------------------- */

  const lifeAvg = averageScore(lifeAreas);
  const empireAvg = averageScore(empireAreas);
  const lifeTop = rankAreasByNeed(lifeAreas).slice(0, 3);
  const empireTop = rankAreasByNeed(empireAreas).slice(0, 3);
  const building = inDevelopment(allVentures);
  const parked = backlog(allVentures);
  const topVentures = sortVentures(allVentures)
    .filter((v) => !isShelved(v))
    .slice(0, 3);

  /* -- header strings ---------------------------------------------- */

  const wk = isoWeekNumber(today);
  const q = quarterOf(today);
  const reviewIn = daysUntilWeeklyReview(today);
  const reviewText =
    reviewIn === 0
      ? "WEEKLY REVIEW TODAY"
      : reviewIn === 1
        ? "WEEKLY REVIEW TOMORROW"
        : `WEEKLY REVIEW IN ${reviewIn} DAYS`;

  const workspace: NavItem[] = [
    { label: "Today", href: "/today", badge: todayCount },
    { label: "Calendar", href: "/calendar" },
    { label: "Work Diary", href: "/diary" },
    { label: "Inbox", href: "/inbox", badge: inboxCount ?? 0 },
    { label: "Feed the System", href: "/feed" },
    { label: "Advisor", href: "/advisor", note: "AI" },
    { label: "Dashboard", href: "/dashboard" },
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
      {/* -- THE BRAIN top bar ------------------------------------- */}
      <div className="card px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="mono text-[0.8rem] font-semibold leading-none">THE BRAIN</p>
          <p className="label mt-1">Command centre</p>
        </div>
        <p className="mono text-[0.66rem] text-[var(--faint)] mx-auto hidden sm:block">
          THE BRAIN / DASHBOARD
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
        </aside>

        {/* -- main column ------------------------------------------ */}
        <div className="grid gap-5 min-w-0">
          {/* hero */}
          <div className="card p-4 sm:p-5 flex items-end gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-[1.9rem] sm:text-[2.3rem] font-semibold leading-none">
                {formatDayLong(today)}
              </h1>
              <p className="text-[0.82rem] text-[var(--muted)] mt-2.5">
                Two minutes is the whole job.
              </p>
            </div>
            <span
              className="mono text-[0.72rem] font-bold px-2.5 py-1.5 rounded-[8px]"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              TODAY {progress.done}/{progress.of}
            </span>
            <div className="ml-auto text-right shrink-0">
              <Link
                href="/week"
                className="mono text-[0.7rem] font-bold no-underline"
                style={{ color: "var(--accent)" }}
              >
                WK {wk} · Q{q} · {reviewText}
              </Link>
              <p className="text-[0.66rem] text-[var(--faint)] mt-1">
                Optional depth · today has the essentials
              </p>
            </div>
          </div>

          {/* KPI strip — cross-system */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <div className="card p-4">
              <p className="label">Debt</p>
              <p
                className="mono text-[1.5rem] sm:text-[1.75rem] font-semibold leading-none mt-2"
                style={{ color: debt ? "var(--bad)" : "var(--faint)" }}
              >
                {formatGBP(debt?.value ?? null)}
              </p>
              <p className="text-[0.7rem] text-[var(--faint)] mt-1.5">
                {debt ? `As at ${debt.taken_on}` : "No reading yet"}
              </p>
            </div>
            <div className="card p-4">
              <p className="label">Due 7d</p>
              <p
                className="mono text-[1.5rem] sm:text-[1.75rem] font-semibold leading-none mt-2"
                style={{ color: dueSoon > 0 ? "var(--warn)" : "var(--text)" }}
              >
                {dueSoon}
              </p>
              <p className="text-[0.7rem] text-[var(--faint)] mt-1.5">
                Deadlines, overdue included
              </p>
            </div>
            <Link href="/planner" className="card card-hover p-4 no-underline text-[var(--text)]">
              <p className="label">Tasks</p>
              <p className="mono text-[1.5rem] sm:text-[1.75rem] font-semibold leading-none mt-2">
                {open}
              </p>
              <p className="text-[0.7rem] text-[var(--faint)] mt-1.5">Open across both systems</p>
            </Link>
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

          {/* -- the two systems ----------------------------------- */}
          <div className="grid gap-5 lg:grid-cols-2 items-start">
            {/* LIFE_OS */}
            <div className="sys-life">
              <Panel
                title="LIFE_OS"
                hint={SYSTEM_BLURB.life.toLowerCase()}
                action={
                  <Link
                    href="/life"
                    className="text-[0.74rem] font-semibold no-underline"
                    style={{ color: "var(--sys)" }}
                  >
                    OPEN →
                  </Link>
                }
              >
                <p className="mono text-[0.78rem] font-semibold">
                  AVG {lifeAvg == null ? "—" : lifeAvg.toFixed(1)} / 10
                  <span className="text-[var(--faint)] font-normal">
                    {" "}
                    · {lifeAreas.length} areas
                  </span>
                </p>
                {lifeAvg == null ? (
                  <Empty cta={{ href: "/life", label: "Score the areas" }}>
                    Nothing scored yet. LIFE_OS ranks your personal areas
                    worst-first once you have — that ranking is what this panel
                    summarises.
                  </Empty>
                ) : (
                  <div className="grid gap-2">
                    {lifeTop.map((a) => (
                      <MiniArea key={a.id} area={a} />
                    ))}
                  </div>
                )}
                <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
                  The three that need you most. The full list, the scores and
                  this week&apos;s focus live in LIFE_OS.
                </p>
              </Panel>
            </div>

            {/* EMPIRE_OS */}
            <div className="sys-empire">
              <Panel
                title="EMPIRE_OS"
                hint={SYSTEM_BLURB.empire.toLowerCase()}
                action={
                  <Link
                    href="/empire"
                    className="text-[0.74rem] font-semibold no-underline"
                    style={{ color: "var(--sys)" }}
                  >
                    OPEN →
                  </Link>
                }
              >
                <p className="mono text-[0.78rem] font-semibold">
                  {building.length} in dev
                  <span className="text-[var(--faint)] font-normal">
                    {" "}
                    · {parked.length} parked · AVG{" "}
                    {empireAvg == null ? "—" : empireAvg.toFixed(1)} / 10
                  </span>
                </p>
                {topVentures.length === 0 ? (
                  <Empty cta={{ href: "/empire", label: "Open EMPIRE_OS" }}>
                    No live ventures. The CEO dashboard is where divisions get
                    created and moved along the path to revenue.
                  </Empty>
                ) : (
                  <div className="grid gap-2">
                    {topVentures.map((v) => {
                      const branch = VENTURE_BRANCH[v.name];
                      const inner = (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="text-[0.84rem] font-semibold leading-snug">
                              {v.name}
                            </p>
                            {v.one_liner && (
                              <p className="text-[0.72rem] text-[var(--muted)] mt-0.5 leading-snug">
                                {v.one_liner}
                              </p>
                            )}
                          </div>
                          <Tag colour={STAGE_COLOUR[v.stage]}>{STAGE_LABEL[v.stage]}</Tag>
                        </>
                      );
                      const cls =
                        "flex items-start gap-2.5 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5";
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
                    })}
                  </div>
                )}
                <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
                  Furthest along first. Stages, progress, priorities and the
                  20-year objective live in EMPIRE_OS.
                </p>
              </Panel>
            </div>
          </div>

          {/* today */}
          <div className="grid gap-5 lg:grid-cols-[3fr_2fr] items-start">
            <Panel title="Today" hint="three things, never more">
              <TodayThree items={picked} openTotal={open} />
            </Panel>

            <Panel title="AI digest" hint="Phase 7 · not wired yet">
              <Empty cta={{ href: "/advisor", label: "What the Advisor will be" }}>
                One paragraph each morning, drawn from your own data: what
                moved yesterday, what is due, which area is quietly slipping.
                Advisory, never autonomous — it drafts, you decide.
              </Empty>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One area, read-only — the full editor lives in its own system. */
function MiniArea({ area }: { area: Pillar }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[0.82rem] font-medium min-w-0 truncate">
          {area.emoji} {area.name}
        </span>
        <span className="mono text-[0.72rem] ml-auto shrink-0">
          {area.score == null ? "—" : area.score}/10
        </span>
      </div>
      <div className="mt-2">
        <Bar
          percent={scoreBarPercent(area.score)}
          height={6}
          colour={
            area.score == null
              ? "transparent"
              : area.score <= 3
                ? "var(--bad)"
                : area.score <= 6
                  ? "var(--warn)"
                  : "var(--good)"
          }
        />
      </div>
      {area.status_line && (
        <p className="text-[0.7rem] text-[var(--muted)] mt-1.5 leading-snug">
          {area.status_line}
        </p>
      )}
    </div>
  );
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
