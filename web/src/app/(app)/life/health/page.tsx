import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { toIso } from "@/lib/logic";
import { leadWithLogger, restart, restartLine } from "@/lib/restart";
import LogSession, { RecentSessions } from "@/components/LogSession";
import {
  LIBRARY,
  SKILL_TREES,
  advise,
  deriveState,
  generatePlan,
  readinessFor,
  weekShape,
  workloadRatio,
  SEASON_SESSIONS,
} from "@/lib/hybrid";
import {
  allReadings,
  attemptsFrom,
  fedState,
  profileFrom,
  sessionsFrom,
  todaysKind,
  type AthleteProfileRow,
  type CookedMealRow,
  type HealthDayRow,
  type JournalRow,
  type SkillAttemptRow,
  type TrainingSetRow,
  type WorkoutRow,
} from "@/lib/training";
import { seasonKind } from "@/lib/season";
import type { Season } from "@/lib/season";
import { hexWeek, weekProgressLine } from "@/lib/cockpit";
import RingGauge from "@/components/hud/RingGauge";
import HudPanel from "@/components/hud/HudPanel";
import HexWeek from "@/components/hud/HexWeek";

export const dynamic = "force-dynamic";

/**
 * The cockpit home.
 *
 * Two states, not one, and the split is the whole design carried over
 * from the page this replaces: `leadWithLogger(state)` still decides
 * everything, because the honest failure mode of a health cockpit is a
 * gorgeous ring reading a score it cannot compute. With nothing logged
 * yet, this opens on the same LogSession button as before — dressed as
 * "AWAITING TELEMETRY", never as a blank ring.
 */
export default async function BodyHome() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [
    { data: workoutRows },
    { data: healthDays },
    { data: journal },
    { data: sets },
    { data: attempts },
    { data: profileRow },
    { data: seasons },
    { data: cooked },
  ] = await Promise.all([
    supabase.from("workouts").select("id, on_date, kind, minutes, rpe").order("on_date", { ascending: false }),
    supabase
      .from("health_days")
      .select("on_date, rmssd, resting_hr, sleep_hours, steps, active_minutes, weight_kg, source")
      .order("on_date", { ascending: false })
      .limit(90),
    supabase.from("journal").select("entry_date, mood, energy").order("entry_date", { ascending: false }).limit(90),
    supabase.from("training_sets").select("workout_id, exercise_id, amount, load_kg, rir, sort_order").order("sort_order"),
    supabase.from("skill_attempts").select("node_id, on_date, amount, strict"),
    supabase.from("athlete_profile").select("bodyweight_kg, sessions_per_week, equipment, focus_skills, landmarks").maybeSingle(),
    supabase.from("seasons").select("id, kind, started_on, ended_on, note"),
    supabase.from("meals").select("last_cooked_on, protein_g, estimates").not("last_cooked_on", "is", null),
  ]);

  const sessions = (workoutRows ?? []) as WorkoutRow[];
  const state = restart(sessions, today);
  const days = hexWeek(sessions.map((s) => s.on_date), today);
  const todayRowRaw = (healthDays ?? []).find((d) => d.on_date === today) as
    | (HealthDayRow & { weight_kg: number | string | null })
    | undefined;
  const todayRow = todayRowRaw && {
    steps: todayRowRaw.steps,
    active_minutes: todayRowRaw.active_minutes,
    weight_kg: todayRowRaw.weight_kg == null ? null : Number(todayRowRaw.weight_kg),
    sleep_hours: todayRowRaw.sleep_hours == null ? null : Number(todayRowRaw.sleep_hours),
  };

  if (leadWithLogger(state)) {
    return (
      <div className="grid gap-5 max-w-[820px]">
        <HudPanel serial="TLM.000" title="AWAITING TELEMETRY">
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>{restartLine(state)}</p>
          <div style={{ marginTop: 4 }}>
            <HexWeek days={days} />
          </div>
        </HudPanel>
        <div className="grid gap-3">
          <LogSession state={state} today={today} />
          <RecentSessions sessions={sessions.slice(0, 8)} />
        </div>
        <p className="mono" style={{ fontSize: 11, color: "rgba(79,195,247,.5)", textAlign: "center" }}>
          READINESS · SKILLS · STATS ONLINE ONCE THE FIRST SESSION IS LOGGED
        </p>
      </div>
    );
  }

  /* -- the full cockpit --------------------------------------------- */

  const meals = (cooked ?? []) as CookedMealRow[];
  const readings = allReadings((healthDays ?? []) as HealthDayRow[], (journal ?? []) as JournalRow[], meals);
  const fed = fedState(meals, today);
  const trainingSessions = sessionsFrom(sessions, (sets ?? []) as TrainingSetRow[]);
  const profile = profileFrom((profileRow ?? null) as AthleteProfileRow | null);
  const allAttempts = attemptsFrom((attempts ?? []) as SkillAttemptRow[]);
  const skillState = SKILL_TREES.reduce(
    (acc, tree) => ({ ...acc, ...deriveState(tree, allAttempts) }),
    {} as Record<string, "locked" | "testing" | "working" | "owned">
  );

  const kind = seasonKind((seasons ?? []) as Season[]);
  const shape = weekShape(SEASON_SESSIONS[kind]);
  const { kind: sessionKind, everythingRecent } = todaysKind(shape, trainingSessions, today);
  const readiness = readinessFor(readings, today);
  const plan = generatePlan({
    on: today,
    kind: everythingRecent ? "rest" : sessionKind,
    readiness,
    profile,
    trees: SKILL_TREES,
    skillState,
    recentIds: trainingSessions.filter((s) => s.on >= today.slice(0, 8) + "01").flatMap((s) => s.sets.map((x) => x.exercise_id)),
  });
  const advice = advise({ todayIso: today, readiness, sessions: trainingSessions, library: LIBRARY, trees: SKILL_TREES, skillState, profile });
  const coachLine = Object.values(advice).flat()[0]?.line ?? "Systems nominal. No advisory outstanding — train the plan as given.";
  const ratio = workloadRatio(trainingSessions, today);

  const sysLine = readiness.band === "green" ? "SYS.OK" : readiness.band === "amber" ? "SYS.CAUTION" : readiness.band === "red" ? "SYS.STAND-DOWN" : undefined;

  return (
    <div className="grid gap-5" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div className="hud-home-grid" style={{ alignItems: "start" }}>
        {/* -- left telemetry ------------------------------------------ */}
        <div className="grid gap-4">
          <HudPanel serial="TLM.001" title="TELEMETRY">
            <TelemetryRow label="Steps" value={todayRow?.steps != null ? todayRow.steps.toLocaleString() : "—"} />
            <TelemetryRow
              label="Active"
              value={todayRow?.active_minutes != null ? `${todayRow.active_minutes} MIN` : "—"}
            />
            <TelemetryRow label="Mass" value={todayRow?.weight_kg != null ? `${todayRow.weight_kg} KG` : "—"} />
            <TelemetryRow label="Sleep" value={todayRow?.sleep_hours != null ? hoursLabel(todayRow.sleep_hours) : "—"} />
          </HudPanel>
          <HudPanel serial="WKC.014" title="WEEK CYCLE">
            <HexWeek days={days} />
            <p className="microcopy" style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "rgba(214,239,255,.55)" }}>
              {weekProgressLine(days, profile.sessions_per_week ?? SEASON_SESSIONS[kind]).toUpperCase()}
            </p>
          </HudPanel>
        </div>

        {/* -- centre ring ----------------------------------------------- */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <RingGauge score={readiness.score} confidence={readiness.confidence} band={readiness.band} sysLine={sysLine} />
          {readiness.score == null && (
            <p style={{ fontSize: 12, color: "rgba(214,239,255,.6)", maxWidth: 380, textAlign: "center" }}>{readiness.reason}</p>
          )}
          <div className="mono" style={{ fontSize: 11, display: "flex", gap: 16 }}>
            <Link href="/life/health/readiness" style={{ color: "var(--hud-cyan)", textDecoration: "none" }}>
              CONTRIBUTOR BREAKDOWN ▸
            </Link>
            <Link href="/life/health/food" style={{ color: "var(--hud-cyan)", textDecoration: "none" }}>
              FOOD ▸
            </Link>
          </div>
        </div>

        {/* -- right column ------------------------------------------- */}
        <div className="grid gap-4">
          <HudPanel serial="CCH.7A" title="COACH UPLINK">
            <p style={{ fontSize: 15, lineHeight: 1.5 }}>&ldquo;{coachLine}&rdquo;</p>
          </HudPanel>
          <HudPanel serial="MSN.221" title="TODAY&rsquo;S MISSION">
            <div className="mono" style={{ fontSize: 15, color: "var(--hud-core)", letterSpacing: "0.06em" }}>
              {plan.headline.toUpperCase()}
            </div>
            <p className="microcopy" style={{ marginBottom: 12, fontSize: 12, color: "rgba(214,239,255,.55)" }}>
              {plan.blocks.length} BLOCK{plan.blocks.length === 1 ? "" : "S"} · READINESS-SCALED
            </p>
            <Link href="/life/health/train" className="btn" style={{ textDecoration: "none", display: "inline-block" }}>
              [ ENGAGE ]
            </Link>
          </HudPanel>
        </div>
      </div>

      <div className="hud-ticker">
        <span>
          <span className="k">STEPS</span> {todayRow?.steps ?? "—"}
        </span>
        <span>
          <span className="k">SLP</span> {todayRow?.sleep_hours != null ? hoursLabel(todayRow.sleep_hours) : "—"}
        </span>
        <span>
          <span className="k">LOAD A:C</span> {ratio.ratio != null ? ratio.ratio.toFixed(2) : "—"}
        </span>
        <span>
          <span className="k">FED</span> {fed.cookedDays ?? "—"}/{7}D
        </span>
      </div>
    </div>
  );
}

function TelemetryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: "1px dashed rgba(79,195,247,.12)" }}>
      <span className="lbl">{label}</span>
      <span className="mono" style={{ fontSize: 15 }}>
        {value}
      </span>
    </div>
  );
}

function hoursLabel(h: number): string {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return `${whole}:${String(min).padStart(2, "0")}`;
}
