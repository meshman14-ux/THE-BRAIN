import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SeasonSwitch from "@/components/SeasonSwitch";
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
import { setupLine, setupSteps } from "@/lib/setup";
import { loadSetupFacts } from "@/lib/setupserver";
import { loadLifeBoard } from "@/lib/boardserver";
import type { ParentReport } from "@/lib/parents";
import {
  allReadings as bodySignals,
  type CookedMealRow,
  type HealthDayRow,
  type JournalRow,
} from "@/lib/training";
import {
  type Season,
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
} from "@/lib/types";
import {
  toIso,
  isoWeekNumber,
  quarterOf,
  daysUntilWeeklyReview,
  latestReading,
  currentStreak,
  dueWithin,
  focusList,
  splitDormant,
  todayProgress,
  todayReason,
  type TodayReason,
  areasFor,
  averageScore,
  rankAreasByNeed,
  inDevelopment,
  backlog,
  sortVentures,
  isShelved,
  isOpenWork,
  type PersonRow,
  greetingFor,
  watchtowerAlerts,
  streakHistory,
  taskSplit,
  habitConsistency,
  debtCleared,
  cashThisMonth,
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
import SeedPillars from "@/components/SeedPillars";
import { type FocusItem } from "@/components/Focus";
import AttentionTab from "@/components/dashboard/AttentionTab";
import NowTab from "@/components/dashboard/NowTab";
import SystemsTab from "@/components/dashboard/SystemsTab";
import TrendTab from "@/components/dashboard/TrendTab";
import MotionToggle from "@/components/cockpit/MotionToggle";
import { loadMotivation } from "@/lib/cockpit/queries";
import { latestMotivation } from "@/lib/cockpit/motivation";
import {
  PeopleStrip,
  ModuleGrid,
  MonthsHex,
  CloudFilesWidget,
  AdvisorStrip,
  MotivationWidget,
  HudPanel,
} from "@/components/cockpit/Widgets";

export const dynamic = "force-dynamic";

const REASON_TEXT: Record<TodayReason, string> = {
  "do-today": "set for today",
  deadline: "deadline inside 7 days",
  high: "high priority",
  next: "next up",
};

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
  let empireBoard: ParentReport[] = [];
  let empireShapeLine = "";
  try {
    const loaded = await loadLifeBoard(today);
    board = loaded.reports;
    empireBoard = loaded.empire;
    empireShapeLine = loaded.shape.line;
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

  /* -- motivation ----------------------------------------------------- *
   *
   * The only genuinely new read the cockpit rebuild adds — everything
   * else on this page was already being fetched. Wrapped for the same
   * reason THE COG and setup are: a failure in the newest thing must
   * cost one widget, never the dashboard.
   */
  let latestMotive: ReturnType<typeof latestMotivation> = null;
  try {
    latestMotive = latestMotivation(await loadMotivation(supabase, 1));
  } catch {
    latestMotive = null;
  }

  const peopleForStrip = ((people ?? []) as {
    id: string;
    name: string;
    last_contact: string | null;
    cadence_days: number | null;
  }[]).map((p) => ({
    id: p.id,
    name: p.name,
    last_contact: p.last_contact,
    cadence_days: p.cadence_days,
  }));

  return (
    <div className="grid gap-5">
      {/* -- top bar ---------------------------------------------- *
       *
       * Sidebar is gone — the real nav lives in the four boxes at
       * (app)/layout.tsx now, and a second copy here was the dead-list
       * duplication an earlier pass on this file flagged. What is left is
       * search, the motion controls (spec: three independently-switchable
       * levels) and the one action that always belongs one tap away.
       */}
      <div className="hud-panel px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="mono text-[0.8rem] font-semibold leading-none tracking-[0.14em]" style={{ color: "var(--hud-core)" }}>
            THE BRAIN
          </p>
          <p className="mono text-[0.62rem] mt-1" style={{ color: "var(--hud-dim)" }}>
            ONE OS · LIFE + EMPIRE
          </p>
        </div>
        <p className="mono text-[0.66rem] mx-auto hidden sm:block" style={{ color: "var(--hud-dim)" }}>
          COMMAND CENTRE
        </p>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <MotionToggle />
          <Link href="/feed" className="chip no-underline">
            ⬆ Import
          </Link>
          <Link href="/capture" className="btn no-underline text-[0.8rem] py-2 px-3.5">
            + Capture
          </Link>
        </div>
      </div>

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
          <div className="hud-split">
            <NowTab
              closed={closed}
              cogAdvice={cogAdvice}
              creedLine={creedLine}
              empireBoard={empireBoard}
              empireShapeLine={empireShapeLine}
              empireTasks={empireTasks}
              focus={focus}
              greet={greet}
              lifeTasks={lifeTasks}
              line={line}
              progress={progress}
              reviewText={reviewText}
              setupNeeded={setupNeeded}
              split={split}
              streak={streak}
              dormantTasks={dormantTasks}
              today={today}
              verse={verse}
              wk={wk}
              q={q}
              board={board}
              toFocusItem={toFocusItem}
            />
            {/* -- the system column ------------------------------- *
             *
             * Everything the spec asked for that NowTab does not already
             * answer: the module grid (colour is state, never identity —
             * channel 4 stays glyph + label, per §A3 decision 11), the
             * permanent people strip, months that counted, the cloud-files
             * door, the advisor's one line, and the newest module. Every
             * widget reads a value already computed above — nothing here
             * re-derives a figure the page itself already owns.
             */}
            <div className="grid gap-4 content-start">
              <HudPanel title="MODULES">
                <ModuleGrid life={board} empire={empireBoard} />
              </HudPanel>
              <HudPanel title="PEOPLE">
                <PeopleStrip people={peopleForStrip} today={today} />
              </HudPanel>
              <HudPanel title="MONTHS THAT COUNTED">
                <MonthsHex tallies={tallies} />
              </HudPanel>
              <HudPanel title="ADVISOR">
                <AdvisorStrip line={line} />
              </HudPanel>
              <HudPanel title="MOTIVATION">
                <MotivationWidget latest={latestMotive} />
              </HudPanel>
              <HudPanel title="CLOUD OS · FILES">
                <CloudFilesWidget />
              </HudPanel>
            </div>
          </div>
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
            <AttentionTab
              alerts={alerts}
              silenced={silenced}
              dueSoon={dueSoon}
              season={season}
              today={today}
            />
          )}

          {/* ================= SYSTEMS ============================== *
           *
           * The two subsystems as doorways, not as summaries. §A2's rule
           * is that the command centre reads and the subsystems write, so
           * everything here links somewhere that can be acted on.
           */}
          {tab === "systems" && (
            <SystemsTab
              empireAreas={empireAreas}
              lifeAvg={lifeAvg}
              empireAvg={empireAvg}
              lifeWorst={lifeWorst}
              liveVentures={liveVentures}
              building={building}
              parked={parked}
              debt={debt}
              cleared={cleared}
              steps={steps}
              sleep={sleep}
              netMonth={netMonth}
            />
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
            <TrendTab
              bars={bars}
              consistency={consistency}
              finishNudge={finishNudge}
              finishes={finishes}
              momentumNow={momentumNow}
              reviewText={reviewText}
              tallies={tallies}
              split={split}
            />
          )}

        <p className="mono text-[0.62rem] tracking-[0.12em] text-[var(--faint)] text-center uppercase">
          The brain reads both · tasks are shared · each system owns its own data
        </p>
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

