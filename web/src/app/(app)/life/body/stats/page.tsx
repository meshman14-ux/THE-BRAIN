import { createClient } from "@/lib/supabase/server";
import { toIso, addDays } from "@/lib/logic";
import { readinessFor, workloadRatio } from "@/lib/hybrid";
import {
  allReadings,
  attemptsFrom,
  sessionsFrom,
  type CookedMealRow,
  type HealthDayRow,
  type JournalRow,
  type SkillAttemptRow,
  type TrainingSetRow,
  type WorkoutRow,
} from "@/lib/training";
import { ATTEMPT_XP_SOFT, ATTEMPT_XP_STRICT, mondayOf } from "@/lib/cockpit";
import HudPanel from "@/components/hud/HudPanel";
import TrendChart from "@/components/hud/TrendChart";

export const dynamic = "force-dynamic";

/**
 * The 2×3 trend grid — every panel real, every panel honest about what it
 * cannot yet see. Nothing here is a prediction: the load-ratio panel is
 * labelled a spike detector, never an injury predictor, exactly as
 * `/life/body/readiness` already is about the same number.
 */
export default async function StatsPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: healthDays }, { data: journal }, { data: workoutRows }, { data: setRows }, { data: attemptRows }, { data: cooked }] =
    await Promise.all([
      supabase
        .from("health_days")
        .select("on_date, rmssd, resting_hr, sleep_hours, steps, active_minutes, weight_kg, source")
        .order("on_date", { ascending: true })
        .limit(180),
      supabase.from("journal").select("entry_date, mood, energy").order("entry_date", { ascending: false }).limit(90),
      supabase.from("workouts").select("id, on_date, kind, minutes, rpe").order("on_date", { ascending: false }).limit(120),
      supabase.from("training_sets").select("workout_id, exercise_id, amount, load_kg, rir, sort_order").order("sort_order"),
      supabase.from("skill_attempts").select("node_id, on_date, amount, strict").order("on_date", { ascending: true }),
      supabase.from("meals").select("last_cooked_on, protein_g, estimates").not("last_cooked_on", "is", null),
    ]);

  const days = (healthDays ?? []) as (HealthDayRow & { weight_kg: number | string | null })[];
  const weightSeries = days.map((d) => (d.weight_kg == null ? null : Number(d.weight_kg))).filter((v): v is number => v != null);
  const sleepSeries = days
    .slice(-14)
    .map((d) => (d.sleep_hours == null ? null : Number(d.sleep_hours)))
    .filter((v): v is number => v != null);

  const workouts = (workoutRows ?? []) as WorkoutRow[];
  const trainingSessions = sessionsFrom(workouts, (setRows ?? []) as TrainingSetRow[]);

  // Sets logged per week, last 8 weeks — grouped by the same Monday-anchor
  // hexWeek uses, so "this week" always means the same thing across the module.
  const volumeByWeek = new Map<string, number>();
  for (const s of trainingSessions) {
    const wk = mondayOf(s.on);
    volumeByWeek.set(wk, (volumeByWeek.get(wk) ?? 0) + s.sets.length);
  }
  const last8Mondays = Array.from({ length: 8 }, (_, i) => mondayOf(addDays(today, -7 * (7 - i))));
  const volumeSeries = last8Mondays.map((m) => volumeByWeek.get(m) ?? 0);

  const meals = (cooked ?? []) as CookedMealRow[];
  const readings = allReadings(days as HealthDayRow[], (journal ?? []) as JournalRow[], meals);
  const readinessSeries = Array.from({ length: 30 }, (_, i) => addDays(today, -(29 - i)))
    .map((d) => readinessFor(readings, d).score)
    .filter((v): v is number => v != null);

  const ratioSeries = Array.from({ length: 6 }, (_, i) => mondayOf(addDays(today, -7 * (5 - i))))
    .map((m) => workloadRatio(trainingSessions, m).ratio)
    .filter((v): v is number => v != null);
  const currentRatio = workloadRatio(trainingSessions, today);

  const attempts = attemptsFrom((attemptRows ?? []) as SkillAttemptRow[]);
  const xpSeries = attempts.reduce<number[]>((acc, a) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
    acc.push(prev + (a.strict ? ATTEMPT_XP_STRICT : ATTEMPT_XP_SOFT));
    return acc;
  }, []);

  return (
    <div className="grid gap-5" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <header>
        <p className="label">Body · stats</p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: 6 }}>Trends</h1>
      </header>

      <div className="hud-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <HudPanel serial="CHT.W90" title="WEIGHT · 90D" hint={weightSeries.length ? `${weightSeries[weightSeries.length - 1]} KG` : undefined}>
          <TrendChart values={weightSeries} axisLeft="-90D" axisRight="NOW" />
        </HudPanel>

        <HudPanel serial="CHT.VOL" title="TRAINING VOLUME · SETS/WK" hint={volumeSeries.length ? `${volumeSeries[volumeSeries.length - 1]}` : undefined}>
          <TrendChart values={volumeSeries} variant="bar" axisLeft="-8WK" axisRight="NOW" />
        </HudPanel>

        <HudPanel serial="CHT.SLP" title="SLEEP · 14D" hint={sleepSeries.length ? `Ø ${(sleepSeries.reduce((a, b) => a + b, 0) / sleepSeries.length).toFixed(1)}H` : undefined}>
          <TrendChart values={sleepSeries} variant="bar" axisLeft="-14D" axisRight="NOW" />
        </HudPanel>

        <HudPanel serial="CHT.RDY" title="READINESS · 30D" hint={readinessSeries.length ? `${readinessSeries[readinessSeries.length - 1]}` : undefined}>
          <TrendChart
            values={readinessSeries}
            bands={[
              { fromPct: 0, toPct: 40, tone: "safe" },
              { fromPct: 40, toPct: 100, tone: "warn" },
            ]}
            axisLeft="-30D"
            axisRight="NOW"
          />
        </HudPanel>

        <HudPanel serial="CHT.ACR" title="LOAD RATIO · A:C" hint={currentRatio.ratio != null ? currentRatio.ratio.toFixed(2) : undefined}>
          <TrendChart values={ratioSeries} baseline={1} axisLeft="-6WK" axisRight="NOW" />
          <p className="microcopy" style={{ marginTop: 8, fontSize: 11, color: "rgba(214,239,255,.45)" }}>
            SPIKE DETECTOR, NOT AN INJURY PREDICTOR · SAFE BAND 0.8–1.3
          </p>
        </HudPanel>

        <HudPanel serial="CHT.SXP" title="SKILL XP · CUMULATIVE" hint={xpSeries.length ? `${xpSeries[xpSeries.length - 1].toLocaleString()}` : undefined}>
          <TrendChart values={xpSeries} axisLeft={`-${attempts.length} ATTEMPTS`} axisRight="NOW" />
        </HudPanel>
      </div>
    </div>
  );
}
