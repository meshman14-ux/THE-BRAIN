import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SeasonSwitch from "@/components/SeasonSwitch";
import Finishes from "@/components/Finishes";
import {
  collectFinishes,
  currentMonthNudge,
  momentum,
  monthsCounted,
} from "@/lib/finishes";
import { readinessFor } from "@/lib/hybrid";
import { type Advice, advise } from "@/lib/cog";
import { loadCogBundle } from "@/lib/cogserver";
import { COG_ENABLED } from "@/lib/flags";
import Momentum from "@/components/Momentum";
import { setupLine, setupSteps } from "@/lib/setup";
import { loadSetupFacts } from "@/lib/setupserver";
import { loadLifeBoard } from "@/lib/boardserver";
import Board from "@/components/Board";
import type { ParentReport } from "@/lib/parents";
import {
  allReadings as bodySignals,
  type CookedMealRow,
  type HealthDayRow,
  type JournalRow,
} from "@/lib/training";
import {
  type Season,
  SEASON_LABEL,
  alertsForSeason,
  annotate,
  daysInSeason,
  seasonKind,
} from "@/lib/season";
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
  focusList,
  openCount,
  splitDormant,
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
  type PersonRow,
  greetingFor,
  watchtowerAlerts,
  ALERT_TONE,
  streakHistory,
  taskSplit,
  habitConsistency,
  debtCleared,
  cashThisMonth,
  daysUntil,
  isExternal,
  readCheckin,
  checkinProgress,
  normaliseTab,
  BRAIN_TABS,
  BRAIN_TAB_LABEL,
  BRAIN_TAB_QUESTION,
  type BrainTab,
} from "@/lib/logic";
import { bodyContract, moneyContract, peopleContract, rhythmContract } from "@/lib/lifeos";
import { oneLine, silenceFor } from "@/lib/oneline";
import { verseOfDay } from "@/lib/gita";
import { creedFrom, creedLineOfDay } from "@/lib/creed";
import { divisionHref } from "@/lib/references";
import SeedPillars from "@/components/SeedPillars";
import Focus, { type FocusItem } from "@/components/Focus";
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

export default async function TheBrain({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = normaliseTab((await searchParams).tab);
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
    { data: tonight },
    { data: creed },
    { data: vehicles },
    { data: healthDays },
    { data: journalHistory },
    { data: cookedMeals },
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
      .select("id, title, pillar_id, project_id, do_date, due_date, priority, status, duration_min, created_at"),
    supabase.from("projects").select("pillar_id, due_date, status").eq("status", "active"),
    supabase
      .from("ventures")
      .select("id, name, pillar_id, stage, progress, one_liner, status, sort_order, external_system, meta")
      .order("sort_order"),
    supabase.from("metrics").select("id, name, unit, direction, pillar_id"),
    supabase.from("metric_readings").select("metric_id, taken_on, value"),
    supabase.from("habits").select("id, name").eq("active", true),
    supabase.from("habit_logs").select("habit_id, done_on"),
    supabase.from("people").select("id, name, last_contact, cadence_days, birthday"),
    supabase.from("assets").select("id, name, kind, income_monthly, cost_monthly, status"),
    supabase.from("inbox").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("journal").select("mood, energy").eq("entry_date", toIso(new Date())).maybeSingle(),
    // The creed only. The principle notes are deliberately NOT read here:
    // they are a place he goes, never something that arrives (§A3, and
    // PRINCIPLES_NEVER_PUSH in types.ts).
    supabase.from("notes").select("body").eq("kind", "creed").limit(1).maybeSingle(),
    supabase
      .from("vehicles")
      .select("id, name, status, tax_due, mot_due, insurance_due, next_service"),
    /* BODY absorbs HEALTH and FOOD (v2 step 8). The dashboard's body
     * contract used to report a null readiness band because nothing here
     * ever asked for one — a stub, and the honest fix is to ask. All
     * three feeds are free: two already sync, and the third is written by
     * the cook button. */
    supabase
      .from("health_days")
      .select("on_date, rmssd, resting_hr, sleep_hours, steps, active_minutes, source")
      .order("on_date", { ascending: false })
      .limit(90),
    supabase
      .from("journal")
      .select("entry_date, mood, energy")
      .order("entry_date", { ascending: false })
      .limit(90),
    supabase
      .from("meals")
      .select("last_cooked_on, protein_g, estimates")
      .not("last_cooked_on", "is", null),
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

  // Dormant work leaves every count and queue on this page. Deadlines are
  // exempt inside isDormant, so nothing the watchtower cares about is here.
  const { live: liveTasks, dormant: dormantTasks } = splitDormant(
    allTasks,
    today
  );
  const open = openCount(liveTasks);
  const split = taskSplit(liveTasks, allPillars);
  const dueSoon = dueWithin(
    [
      ...allTasks,
      ...(((projects ?? []) as { due_date: string | null; status: string }[]) || []),
    ],
    today
  );

  const progress = todayProgress(liveTasks, today);
  // Three visible, two on deck. `todayProgress` deliberately still counts
  // only what is set for today: the drawer is planning space, so opening it
  // must never move the TODAY n/3 counter.
  const focus = focusList(liveTasks, today);
  const toFocusItem = (t: Task): FocusItem => {
    const p = t.pillar_id ? pillarById.get(t.pillar_id) : null;
    return {
      id: t.id,
      title: t.title,
      areaLabel: p ? `${p.emoji ?? ""} ${p.name}`.trim() : null,
      system: p?.system ?? null,
      reason: REASON_TEXT[todayReason(t, today)],
      priority: t.priority,
      done: t.status === "done",
      durationMin: t.duration_min ?? null,
    };
  };
  const todayCount = liveTasks.filter(
    (t) => isOpenWork(t) && t.do_date != null && t.do_date <= today
  ).length;

  const bySystem = (sys: "life" | "empire") => {
    const ids = new Set(areasFor(allPillars, sys).map((p) => p.id));
    return liveTasks
      .filter((t) => isOpenWork(t) && t.pillar_id != null && ids.has(t.pillar_id))
      .slice(0, 5);
  };
  const lifeTasks = bySystem("life");
  const empireTasks = bySystem("empire");

  /* -- the season ---------------------------------------------------- *
   *
   * Fetched here rather than in a child so the first paint already knows
   * what the system expects of him — the same reasoning as the mode
   * attribute. A season is never absent: "quiet" is the neutral position.
   * -------------------------------------------------------------------- */

  const { data: seasonRows } = await supabase
    .from("seasons")
    .select("id, kind, started_on, ended_on, note")
    .order("started_on", { ascending: false })
    .limit(12);
  const seasons = (seasonRows ?? []) as Season[];
  const season = seasonKind(seasons);
  const seasonDays = daysInSeason(seasons, today);

  /* -- finishes: the momentum test, made failable --------------------- *
   *
   * Mostly derived — completed High tasks and completed diagnostics count
   * themselves, so the measure fills without being fed. The `finishes`
   * table holds only what has no timestamp anywhere else.
   * -------------------------------------------------------------------- */

  const [{ data: doneTasks }, { data: doneRuns }, { data: recorded }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, priority, status, completed_at")
        .eq("status", "done")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(400),
      supabase
        .from("diagnostic_runs")
        .select("id, kind, completed_at, subject_id")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(200),
      supabase
        .from("finishes")
        .select("id, title, happened_on, kind")
        .order("happened_on", { ascending: false })
        .limit(200),
    ]);

  const ventureName = new Map(allVentures.map((v) => [v.id, v.name]));
  const finishes = collectFinishes(
    (doneTasks ?? []) as {
      id: string;
      title: string;
      priority: string;
      status: string;
      completed_at: string | null;
    }[],
    ((doneRuns ?? []) as {
      id: string;
      kind: string;
      completed_at: string | null;
      subject_id: string;
    }[]).map((r) => ({ ...r, subject_name: ventureName.get(r.subject_id) ?? null })),
    (recorded ?? []) as {
      id: string;
      title: string;
      happened_on: string;
      kind: string;
    }[]
  );
  const tallies = monthsCounted(finishes, today);
  const momentumNow = momentum(tallies);
  const finishNudge = currentMonthNudge(tallies, today);

  /* -- the watchtower ----------------------------------------------- */

  const everyAlert = watchtowerAlerts({
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
    // Vehicle obligations, at last. The dates were always deadlines; they
    // were just filed as attributes of a vehicle instead.
    vehicles: (vehicles ?? []) as {
      id: string;
      name: string;
      status: string;
      tax_due: string | null;
      mot_due: string | null;
      insurance_due: string | null;
      next_service: string | null;
    }[],
    todayIso: today,
  });

  /* The watchtower, told what season it is.
   *
   * In a busy or minimum season an untouched division is PARKED, not
   * dropped, so the empire bookkeeping alerts go quiet — but they are
   * counted and said out loud rather than silently removed, and deadlines
   * and people are never suppressed by any season. */
  const { shown: shownAlerts, silenced } = alertsForSeason(everyAlert, season);

  /* -- THE ONE LINE ------------------------------------------------- *
   *
   * LIFE_OS v2, step 6. Everything above narrows to a single sentence,
   * ranked by who is doing the punishing: the world, then the floor Jay
   * declared, then the month, then a stale figure — and then silence,
   * which is the product. Everything else exists to earn the right to
   * print it.
   */
  /* Readiness, from every feed that speaks — wearable, check-in, kitchen.
   * The engine returns a null band rather than a guess when the evidence
   * is too thin, and that null travels all the way through: the contract
   * carries it, the standing board treats it as unmeasured, and nothing
   * downstream invents a number to fill the hole. */
  const bodyReadings = bodySignals(
    (healthDays ?? []) as HealthDayRow[],
    (journalHistory ?? []) as JournalRow[],
    (cookedMeals ?? []) as CookedMealRow[]
  );
  const readinessToday = readinessFor(bodyReadings, today);

  const lifeContracts = {
    body: bodyContract({
      trainingDays: trainingDays,
      readinessBand: readinessToday.band,
      todayIso: today,
    }),
    money: moneyContract({
      debts: [],
      missedPayments: 0,
      debtFreeDate: null,
    }),
    people: peopleContract({
      people: (people ?? []) as PersonRow[],
      todayIso: today,
    }),
    rhythm: rhythmContract({ season, tallies }),
  };
  const todaysLine = oneLine({
    contracts: lifeContracts,
    // Only the alerts the WORLD punishes reach the top rank.
    worldAlerts: everyAlert
      .filter((a) => a.kind === "legal")
      .map((a) => ({ text: a.text, href: a.href })),
    finishesThisMonth: finishes.filter((f) => f.on.slice(0, 7) === today.slice(0, 7)).length,
    staleAges: [],
    lastSaid: {},
    todayIso: today,
  });
  const line =
    todaysLine.kind === "silence" ? silenceFor(lifeContracts) : todaysLine;

  /* -- LIFE_OS annotates EMPIRE_OS ---------------------------------- *
   *
   * Step 7. Jay chose annotation over capping, and it is the better
   * answer: capping DELETES information, and an expectation you cannot
   * see is an expectation you cannot weigh. So nothing is removed here.
   * A drifting division still says it is drifting; it just also says the
   * season was one slot wide while it drifted.
   *
   * The whole risk is that this becomes wallpaper, so `annotate` attaches
   * a clause only when one genuinely explains — a narrowed season or a
   * measurably breached floor — and only to alerts that are JUDGEMENTS
   * about attention. A lapsed MOT gets nothing: the world is not
   * interested in how his week went.
   */
  /* -- the parent board ---------------------------------------------- *
   *
   * Five LIFE_OS areas, each reporting its one truth. THE BRAIN reads the
   * reports and never the tables underneath — that is what stops a command
   * centre from slowly becoming a second copy of everything below it.
   *
   * Shared with /life through one loader, so the tile summarising Standing
   * and the page showing it in full cannot disagree. Wrapped, because a
   * failure here must cost a panel and not the dashboard. */
  let board: ParentReport[] = [];
  try {
    board = (await loadLifeBoard(today)).reports;
  } catch {
    board = [];
  }

  /* -- what the system still needs ----------------------------------- *
   *
   * One line, or none. Wrapped for the same reason THE COG is: a failure
   * in the newest thing on the page must not take down the page. */
  let setupNeeded: string | null = null;
  try {
    setupNeeded = setupLine(setupSteps(await loadSetupFacts()));
  } catch {
    setupNeeded = null;
  }

  /* -- THE COG ------------------------------------------------------ *
   *
   * Fetched here rather than from the client so the card arrives with the
   * page instead of popping in a second later. Wrapped because a failure
   * in the newest module must not take down the screen everything else
   * lives on: no advice is a missing card, never a missing dashboard. */
  let cogAdvice: Advice | null = null;
  if (COG_ENABLED) {
    try {
      const bundle = await loadCogBundle(today);
      cogAdvice = advise(bundle.state, bundle.profile, bundle.config);
    } catch {
      cogAdvice = null;
    }
  }

  const alerts = annotate(shownAlerts, {
    season,
    capacity: lifeContracts.rhythm.capacity,
    trainingPerWeek: lifeContracts.body.trainingPerWeek,
    floorHeld: lifeContracts.body.floorHeld,
  });

  /* -- ventures ----------------------------------------------------- */

  const orderedVentures = sortVentures(allVentures);
  const liveVentures = orderedVentures.filter((v) => !isShelved(v));
  const parked = backlog(allVentures);
  const building = inDevelopment(allVentures);

  /* -- header strings ------------------------------------------------ */

  // Logged means the FLOOR is answered — mood and energy. Anything more is
  // the ceiling, and the dashboard must not imply he owes it.
  const closed = checkinProgress(readCheckin(tonight)).logged;

  const greet = greetingFor(now.getHours());
  const verse = verseOfDay(today);
  // Borrowed wisdom and his own, side by side. Both rotate by date, both
  // deterministic, so the hero reads the same on the server and after
  // hydration. The offset keeps them from ever landing on the same rhythm.
  const creedLine = creedLineOfDay(creedFrom(creed?.body), today, 1);
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
    { label: "Vehicles", href: "/life/vehicles" },
    { label: "Family", href: "/family" },
  ];
  // Personal, Daily Wall, Mind Map and Me left this sidebar on 2026-08-12.
  // Each was an honest placeholder, but a sidebar entry that never delivers
  // is a promise being broken every time the page loads, and the cost is
  // paid by the entries that DO work — they get read with the same doubt.
  const plan: NavItem[] = [
    { label: "Motivation", href: "/motivation" },
    { label: "Library", href: "/library" },
    { label: "Principles", href: "/library/principles" },
    { label: "Documents", href: "/documents" },
    { label: "Reviews", href: "/reviews" },
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
          {/* The "MAP ↗" foot went with /map — a link to a page that only
              ever said it did not exist yet. The group keeps its name. */}
          <NavGroup title="My Arms" items={arms} />
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

        {/* -- main column ------------------------------------------ *
         *
         * Four tabs, and the rule that keeps them honest: a tab exists only
         * if it answers a question the other three cannot. The v1 dashboard
         * put all four answers in one column, so "what am I doing next" had
         * to be read past a streak chart to reach.
         *
         * The tab is a URL parameter rather than React state. That keeps
         * this a Server Component, makes every tab a real address the
         * watchtower can link into, and means the back button does what a
         * back button does.
         */}
        <div className="grid gap-5 min-w-0">
          {/* The season governs what every tab below expects of him, so
              it sits above them rather than inside one. */}
          <SeasonSwitch current={season} daysIn={seasonDays} />

          <TabBar tab={tab} attention={alerts.length} />

          {tab === "now" && (
            <>
          {/* -- HERO ------------------------------------------------- *
           *
           * Three blocks, in the order they are wanted: who and when, the
           * two numbers, then the words. On a phone they simply stack in
           * that order; from 640px the first two share a row and the quotes
           * take the full width beneath.
           *
           * The greeting is `basis-full` below `sm` on purpose. It used to
           * be `flex-1` at every width, which does not wrap — it just gives
           * up whatever the streak box wants and keeps the rest. At 390px
           * that left it about 165px, so the eyebrow ran to five lines and
           * "Good afternoon, Jay" to three. Wrapping is the behaviour that
           * was wanted; `flex-1` is the one thing that prevents it.
           */}
          {/* `.panel-hero` is depth 3: the day's ground, lit from the top
              left in whichever machine is being worn. Decoration only —
              every fact here is in the text. */}
          <div className="panel-hero flex items-start gap-4 flex-wrap">
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
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
            {/* -- THE ONE LINE --------------------------------------- *
             *
             * One sentence, ranked by who is doing the punishing, and
             * silence is a legitimate answer — the one the whole system
             * is trying to earn. It sits above the verse because it is
             * the only thing here that might need acting on today.
             */}
            <div className="min-w-0 basis-full">
              <p
                className="text-[0.92rem] leading-relaxed font-medium"
                style={{
                  color:
                    line.kind === "world"
                      ? "var(--bad)"
                      : line.kind === "floor"
                        ? "var(--warn)"
                        : line.kind === "silence"
                          ? "var(--muted)"
                          : "var(--text)",
                }}
              >
                {line.kind !== "silence" && (
                  <span className="mono text-[0.62rem] uppercase tracking-[0.1em] mr-2">
                    {line.kind}
                  </span>
                )}
                {line.line}
                {line.href && line.kind !== "silence" && (
                  <>
                    {" "}
                    <Link
                      href={line.href}
                      className="font-semibold no-underline"
                      style={{ color: "var(--accent)" }}
                    >
                      →
                    </Link>
                  </>
                )}
              </p>
            </div>

            {/* The words come last. They are the part he reads, not the part
                he acts on, so they yield the top of the card to the numbers
                and take the whole width once they get there. */}
            <div className="min-w-0 basis-full">
              <blockquote
                className="pl-3 max-w-[62ch] flex items-baseline gap-2.5 flex-wrap"
                style={{ borderLeft: "2px solid var(--accent)" }}
              >
                <span className="text-[0.82rem] italic text-[var(--muted)] leading-relaxed">
                  “{verse.v}”
                </span>
                <span className="mono text-[0.62rem] text-[var(--faint)] shrink-0">
                  {verse.ref}
                </span>
              </blockquote>
              {creedLine && (
                <blockquote
                  className="mt-2 pl-3 max-w-[62ch] flex items-baseline gap-2.5 flex-wrap"
                  style={{ borderLeft: "2px solid var(--warn)" }}
                >
                  <span className="serif text-[0.88rem] leading-relaxed">
                    {creedLine}
                  </span>
                  <span className="mono text-[0.62rem] text-[var(--faint)] shrink-0">
                    YOUR OWN HAND
                  </span>
                </blockquote>
              )}
            </div>
          </div>

          {/* -- THE BOARD -------------------------------------------- *
           *
           * Below the one line and the pulse, and that order holds: the
           * line says the single thing that needs him today, the pulse
           * says what to do next, and this says how the whole picture
           * stands. Specific first, general after. */}
          {board.length > 0 && <Board reports={board} />}

          {/* -- setup, while anything is missing --------------------- *
           *
           * ONE line, and none at all once it is done. Every module here
           * reports "unmeasured" rather than inventing a zero, which is
           * why the numbers can be trusted — and also why a system with
           * empty tables looks broken instead of hungry. This is the
           * difference, said once.
           *
           * It sits below the advice rather than above it, because it is
           * about making the system better at its job rather than about
           * today. And it vanishes completely when the work is done: a
           * prompt that congratulates you daily for being set up is a
           * prompt you train yourself to skip, and the one line at the top
           * of this card needs that habit intact. */}
          {setupNeeded && (
            <Link
              href="/setup"
              className="panel card-hover no-underline text-[var(--text)] flex items-baseline gap-3"
            >
              <span className="mono text-[0.62rem] uppercase tracking-[0.1em] shrink-0 text-[var(--faint)]">
                Setup
              </span>
              <span className="text-[0.8rem] leading-snug flex-1 min-w-0 text-[var(--muted)]">
                {setupNeeded}
              </span>
              <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">→</span>
            </Link>
          )}

          {/* -- THE COG ---------------------------------------------- *
           *
           * Below the one line, and that order is the design. The line
           * above answers "what is wrong" and is allowed to say nothing
           * is; this answers "what next". Two different questions, two
           * different voices, and the one that reports a lapsed MOT keeps
           * the top of the screen over the one that suggests a good use
           * of the next hour.
           *
           * Behind a flag because this is the first module that writes to
           * a BRAIN table on his behalf rather than surfacing and letting
           * him decide. It fails silently: if the engine cannot read the
           * day, the dashboard is exactly what it was before. */}
          {cogAdvice && <Momentum advice={cogAdvice} />}

          {/* -- weekly review pointer ------------------------------- */}
          <Link
            href="/reviews"
            className="mono text-[0.68rem] font-bold no-underline text-center py-1"
            style={{ color: "var(--accent)" }}
          >
            {reviewText} · optional depth, today has the essentials
          </Link>

          {/* -- the daily close ------------------------------------- */}
          <Link
            href="/checkin"
            className="panel card-hover no-underline text-[var(--text)] flex items-center gap-3"
          >
            <span className="text-[1.1rem] shrink-0" aria-hidden>
              ◫
            </span>
            <span className="min-w-0 flex-1">
              <span className="label block">The daily close</span>
              <span className="text-[0.82rem] text-[var(--muted)] block mt-1 leading-snug">
                {closed
                  ? "Tonight is logged. The rest is there if you want it."
                  : "Two taps logs today. Everything under that line is optional."}
              </span>
            </span>
            <span
              className="mono text-[0.66rem] shrink-0"
              style={{ color: closed ? "var(--good)" : "var(--faint)" }}
            >
              {closed ? "LOGGED" : "→"}
            </span>
          </Link>

          {/* -- FOCUS · three visible, two on deck ------------------ */}
          <Panel
            title="◎ Focus"
            hint="three, and two behind a drawer"
            action={
              <Link
                href="/capture"
                className="text-[0.74rem] font-semibold no-underline"
                style={{ color: "var(--accent)" }}
              >
                + CAPTURE
              </Link>
            }
          >
            <Focus
              visible={focus.visible.map(toFocusItem)}
              onDeck={focus.onDeck.map(toFocusItem)}
              openTotal={focus.openTotal}
              beyond={focus.beyond}
            />
          </Panel>

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
            {dormantTasks.length > 0 && (
              <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
                {dormantTasks.length} dormant — untouched for 30 days, so
                {dormantTasks.length === 1 ? " it has" : " they have"} left the
                counts. Still in{" "}
                <Link
                  href="/planner"
                  className="font-semibold no-underline"
                  style={{ color: "var(--accent)" }}
                >
                  Tasks →
                </Link>
              </p>
            )}
          </Panel>
            </>
          )}

          {/* ================= ATTENTION ============================ *
           *
           * Everything that is going wrong, and nothing that is not. The
           * watchtower is NOT truncated here the way it was on the old
           * single column: this tab is the place you come to read all of
           * it, so hiding the seventh alert behind a "+3 more" would make
           * the tab pointless. `sortWorstFirst` is already applied by
           * `watchtowerAlerts`, so the order is the answer.
           */}
          {tab === "attention" && (
            <>
              {alerts.length === 0 ? (
                <Panel title="⚠ Needs attention" hint="nothing is slipping">
                  <Empty cta={{ href: "/planner", label: "Look at the work anyway" }}>
                    Nothing overdue, nobody out of touch past their cadence, no
                    division drifting from its own claim. This tab is empty when
                    the system has nothing to tell you, which is the point of
                    it having its own tab.
                  </Empty>
                  {silenced.length > 0 && (
                    <p className="text-[0.74rem] text-[var(--faint)] mt-3 leading-relaxed m-0">
                      {silenced.length} empire alert
                      {silenced.length === 1 ? " is" : "s are"} quiet this{" "}
                      {SEASON_LABEL[season].toLowerCase()} — parked on purpose,
                      not missed. They come back when the season does.
                    </p>
                  )}
                </Panel>
              ) : (
                <section className="panel" style={{ borderColor: "var(--bad)" }}>
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
                    {alerts.map((a, i) => (
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
                          {/* The life beside the judgement, never instead of
                              it. Quieter and smaller, because it is context
                              and not the finding. */}
                          {a.annotation && (
                            <span className="block text-[0.7rem] text-[var(--faint)] mt-0.5">
                              {a.annotation}
                            </span>
                          )}
                        </span>
                        <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">
                          →
                        </span>
                      </Link>
                    ))}
                  </div>
                  {silenced.length > 0 && (
                    <p className="text-[0.72rem] text-[var(--faint)] mt-3 pt-2.5 border-t border-[var(--border)] leading-relaxed m-0">
                      {silenced.length} more, quiet this{" "}
                      {SEASON_LABEL[season].toLowerCase()} — empire bookkeeping
                      measures attention, and this season has already been
                      declared not to have it. Deadlines and people are never
                      silenced.
                    </p>
                  )}
                </section>
              )}

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
            </>
          )}

          {/* ================= SYSTEMS ============================== *
           *
           * The two subsystems as doorways, not as summaries. §A2's rule
           * is that the command centre reads and the subsystems write, so
           * everything here links somewhere that can be acted on.
           */}
          {tab === "systems" && (
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

              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  label="👟 Steps"
                  value={steps ? Math.round(steps.value).toLocaleString("en-GB") : "—"}
                />
                <MiniStat label="😴 Sleep" value={sleep ? `${sleep.value}h` : "—"} />
              </div>

              <div>
                <p className="label">Debt-free goal</p>
                <Link
                  href="/life/debts"
                  className="rounded-[10px] border border-[var(--border)] px-3.5 py-3 mt-2 block no-underline text-[var(--text)] card-hover"
                >
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
                      ? `From a peak of ${formatGBP(cleared.peak)}. The creditors →`
                      : "A partial figure — the creditors behind it live in Debts →"}
                  </p>
                </Link>
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
                      // Its own dashboard, unless it is a pointer row.
                      const href = isExternal(v) ? null : divisionHref(v.name);
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
                      return href ? (
                        <Link
                          key={v.id}
                          href={href}
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
          )}

          {/* ================= TREND ================================ *
           *
           * The only backward look in the whole command centre, and it has
           * its own tab so it stays that way. A streak bar is interesting,
           * but it is not a decision — put it beside today's three and it
           * competes with them for the same attention while answering a
           * different question.
           */}
          {tab === "trend" && (
            <>
          {/* -- MONTHS THAT COUNTED --------------------------------- *
           *
           * The answer to the only measure his own twelve-month test was
           * missing: a version of "momentum" that can be failed. It leads
           * the Trend tab because it is the longest-horizon thing here.
           * -------------------------------------------------------- */}
          <Finishes
            tallies={tallies}
            momentum={momentumNow}
            recent={finishes}
            nudge={finishNudge}
          />

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
                      className={`flex-1 rounded-[2px]${hit ? " lit" : ""}`}
                      style={{
                        height: hit ? `${30 + (i % 3) * 3}%` : "14%",
                        minHeight: 5,
                        background: hit ? "var(--fill-warn)" : "var(--border)",
                        opacity: hit ? 1 : 0.7,
                        // Each bar arrives a beat after the one before it, so
                        // the fortnight draws itself left to right.
                        animation: hit
                          ? `grow-y 0.4s cubic-bezier(0.22,1,0.36,1) both ${i * 30}ms`
                          : undefined,
                        transformOrigin: "bottom center",
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

          {/* -- the advisor ----------------------------------------- */}
          <Panel title="Advisor" hint="briefing + retrieval, advisory only">
            <Empty cta={{ href: "/advisor", label: "Open the advisor" }}>
              The morning brief is assembled from your own data — what is
              slipping, what is set for today, what is still unanswered — and
              costs nothing to produce. Ask it anything over your own notes and
              it answers with the sources attached. It cannot change anything
              here; everything it says is yours to act on.
            </Empty>
          </Panel>

              <Link
                href="/reviews"
                className="panel card-hover no-underline block text-[var(--text)]"
              >
                <p className="label">The weekly review</p>
                <p className="text-[0.82rem] text-[var(--muted)] mt-1.5 leading-relaxed">
                  {reviewText.toLowerCase()}. Four questions, the fourth being
                  what got in the way — which is the one that turns a streak
                  into a reason.
                </p>
              </Link>
            </>
          )}

          <p className="mono text-[0.62rem] tracking-[0.12em] text-[var(--faint)] text-center uppercase">
            The brain reads both · tasks are shared · each system owns its own data
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The four tabs.
 *
 * Links, not buttons: the tab is in the URL, so this stays server-rendered
 * and every tab is an address something else can point at — the phone nav,
 * a notification, the advisor's brief.
 *
 * Attention carries its count IN THE LABEL rather than as a badge beside
 * it. A badge is a decoration you learn to stop seeing; a tab that reads
 * "Attention · 4" states the fact in the same breath as the name, and a tab
 * that reads "Attention" with nothing after it is telling you something
 * too.
 */
function TabBar({ tab, attention }: { tab: BrainTab; attention: number }) {
  return (
    <div className="grid gap-2">
      <nav
        className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5"
        aria-label="Command centre sections"
      >
        {BRAIN_TABS.map((t) => {
          const active = t === tab;
          const count = t === "attention" && attention > 0 ? ` · ${attention}` : "";
          return (
            <Link
              key={t}
              href={t === "now" ? "/dashboard" : `/dashboard?tab=${t}`}
              aria-current={active ? "page" : undefined}
              className="chip no-underline shrink-0"
              data-active={active ? "true" : "false"}
              style={
                t === "attention" && attention > 0 && !active
                  ? { color: "var(--bad)", borderColor: "var(--bad)" }
                  : undefined
              }
            >
              {BRAIN_TAB_LABEL[t]}
              {count}
            </Link>
          );
        })}
      </nav>
      <p className="text-[0.72rem] text-[var(--faint)]">{BRAIN_TAB_QUESTION[tab]}</p>
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
