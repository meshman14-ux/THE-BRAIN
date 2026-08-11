import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  toIso,
  readinessBand,
  loadState,
  bigFourBests,
  nutritionState,
  READINESS_LABEL,
  MOVEMENT_LABEL,
  NUTRITION_RUNG_LABEL,
  LOAD_SPIKE_RATIO,
  BASELINE_DAYS,
  currentStreak,
  type HealthDay,
  type Workout,
  type Lift,
} from "@/lib/logic";
import HealthToday from "@/components/HealthToday";
import ImportHealth from "@/components/ImportHealth";
import { Panel, Empty, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * The health hub.
 *
 * A zero-obligation floor with three ceilings, and the honesty rules that
 * make each one worth trusting:
 *
 *   Readiness is a BAND around his own rolling baseline, never a 0-100
 *   score. Absolute HRV is meaningless across people; only deviation from
 *   your own normal carries information, and three bands is what the
 *   measurement can support. With too little history it says so rather
 *   than colouring today green.
 *
 *   Load is a SPIKE DETECTOR and says nothing about injury risk. The
 *   acute:chronic ratio's predictive validity does not survive scrutiny,
 *   but "this week is a lot more than you have been doing" is still true
 *   and still useful.
 *
 *   The Big 4 and the nutrition rungs are ceilings. The page works with
 *   both of them empty forever.
 * ------------------------------------------------------------------ */

export default async function HealthPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: dayRows }, { data: workoutRows }, { data: liftRows }] =
    await Promise.all([
      supabase
        .from("health_days")
        .select(
          "on_date, steps, active_minutes, rmssd, resting_hr, sleep_hours, weight_kg, ate_well, protein_g, calories, source"
        )
        .order("on_date", { ascending: false })
        .limit(180),
      supabase
        .from("workouts")
        .select("on_date, kind, minutes, rpe")
        .order("on_date", { ascending: false })
        .limit(200),
      supabase
        .from("lifts")
        .select("on_date, movement, weight_kg, reps")
        .order("on_date", { ascending: false })
        .limit(400),
    ]);

  const days = (dayRows ?? []) as HealthDay[];
  const workouts = (workoutRows ?? []) as Workout[];
  const lifts = (liftRows ?? []) as Lift[];

  const readiness = readinessBand(days, today);
  const load = loadState(workouts, today);
  const bests = bigFourBests(lifts, today);
  const nutrition = nutritionState(days, today);
  const todayRow = days.find((d) => d.on_date === today) ?? null;
  const trainedDays = workouts.map((w) => w.on_date);
  const streak = currentStreak(trainedDays, today);

  const bandColour =
    readiness.band === "green"
      ? "var(--good)"
      : readiness.band === "amber"
        ? "var(--warn)"
        : readiness.band === "red"
          ? "var(--bad)"
          : "var(--faint)";

  return (
    <div className="sys-life grid gap-5 max-w-[820px]">
      <header>
        <p className="label">LIFE_OS · Training &amp; Fitness</p>
        <h1 className="text-[1.6rem] font-semibold mt-1.5 leading-tight">Health</h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 max-w-[62ch] leading-relaxed">
          The floor fills itself from a sync or a single tap. Everything below
          it is there when you want it and silent when you do not.
        </p>
      </header>

      {/* -- HERO · readiness, with its inputs shown ----------------- *
       *
       * The inputs are printed beside the band deliberately. A single
       * number invites precision the measurement cannot support, and a
       * band you cannot check is a band you either over-trust or ignore.
       */}
      <section className="panel grid gap-2.5" style={{ borderColor: bandColour }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="label">Readiness</h2>
          <span className="text-[0.7rem] text-[var(--faint)]">
            against your own {BASELINE_DAYS}-day baseline
          </span>
        </div>

        {readiness.band == null ? (
          <>
            <p className="mono text-[1.6rem] font-semibold leading-none text-[var(--faint)]">
              —
            </p>
            <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
              {readiness.reason}
            </p>
          </>
        ) : (
          <>
            {/* Status is never colour alone — the word carries it. */}
            <p
              className="text-[1.5rem] font-semibold leading-none"
              style={{ color: bandColour }}
            >
              {READINESS_LABEL[readiness.band]}
            </p>
            <p className="text-[0.8rem] text-[var(--muted)] leading-relaxed">
              rMSSD <b className="mono">{readiness.today}</b> against a baseline of{" "}
              <b className="mono">{readiness.baseline}</b> ±
              <b className="mono">{readiness.spread}</b>, over{" "}
              <b className="mono">{readiness.readings}</b> days.
            </p>
          </>
        )}
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
          Three bands rather than a score out of a hundred. Absolute HRV means
          nothing across people — two equally recovered men can differ
          threefold — so only the distance from your own normal says anything,
          and a band is as fine as that distance can honestly be cut.
        </p>
      </section>

      {/* -- today's floor ------------------------------------------ */}
      <Panel title="◍ Today" hint="one tap is a complete entry">
        <HealthToday date={today} initial={todayRow} />
      </Panel>

      {/* -- load --------------------------------------------------- */}
      <Panel
        title="◈ Load"
        hint={`spike detector only · ${LOAD_SPIKE_RATIO}× the four-week average`}
      >
        {load.reason ? (
          <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
            {load.reason}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[0.84rem]">
              <span>
                This week <b className="mono">{load.thisWeek}</b>
              </span>
              <span>
                Usual <b className="mono">{load.average}</b>
              </span>
              <span style={{ color: load.spike ? "var(--warn)" : "var(--muted)" }}>
                {load.spike ? "SPIKE · " : ""}
                <b className="mono">{load.ratio}×</b>
              </span>
            </div>
            <Bar
              percent={Math.min(100, Math.round(((load.ratio ?? 0) / 2) * 100))}
              colour={load.spike ? "var(--warn)" : "var(--accent)"}
            />
          </>
        )}
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
          This is a spike detector and nothing more. The acute:chronic ratio is
          widely quoted as an injury predictor and does not survive scrutiny as
          one, so no claim about injury is made here — only that this week is
          or is not a lot more than you have been doing. Training streak:{" "}
          <b className="mono">{streak}</b> day{streak === 1 ? "" : "s"}.
        </p>
      </Panel>

      {/* -- the Big 4 ---------------------------------------------- */}
      <Panel title="◼ The big four" hint="a ceiling — the hub works without it">
        {bests.every((b) => b.e1rm == null) ? (
          <Empty>
            Nothing logged. Four lifts, and the page is complete whether you
            ever fill them in or not — the estimate uses one formula
            consistently so a set of five and a set of three can be compared
            at all.
          </Empty>
        ) : (
          <ul className="grid gap-2.5 list-none p-0 m-0">
            {bests.map((b) => (
              <li key={b.movement} className="flex items-baseline gap-3 flex-wrap">
                <span className="text-[0.86rem] font-medium min-w-[8rem]">
                  {MOVEMENT_LABEL[b.movement]}
                </span>
                {b.e1rm == null ? (
                  <span className="text-[0.8rem] text-[var(--faint)] italic">
                    not logged
                  </span>
                ) : (
                  <>
                    <span className="mono text-[0.95rem] font-semibold">
                      {b.e1rm} kg
                    </span>
                    <span className="text-[0.72rem] text-[var(--faint)]">
                      est. from {b.weight}kg × {b.reps} on {b.on}
                    </span>
                    {b.change != null && (
                      <span
                        className="mono text-[0.72rem] ml-auto"
                        style={{ color: b.change >= 0 ? "var(--good)" : "var(--warn)" }}
                      >
                        {b.change >= 0 ? "+" : ""}
                        {b.change} kg / 90d
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* -- nutrition ---------------------------------------------- */}
      <Panel title="◒ Nutrition" hint={NUTRITION_RUNG_LABEL[nutrition.rung]}>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[0.84rem]">
          <span>
            Logged <b className="mono">{nutrition.logged}</b> of{" "}
            <b className="mono">{nutrition.of}</b> days
          </span>
          <span>
            Weight{" "}
            <b className="mono">
              {nutrition.weightChange == null
                ? "—"
                : `${nutrition.weightChange >= 0 ? "+" : ""}${nutrition.weightChange} kg`}
            </b>
          </span>
          {nutrition.protein != null && (
            <span>
              Protein <b className="mono">{nutrition.protein} g</b>
            </span>
          )}
        </div>
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
          Three rungs, and the first is the default: a weight and one tap is
          enough to see a trend, which is the only thing that actually decides
          anything. Protein and calories are there for the weeks you care.
          Macros are the top rung and arrive by sync rather than by typing —
          typing macros is data entry, and data entry is what kills the habit
          that was meant to produce the data. Which rung you are on is read
          off what you log rather than chosen in a setting.
        </p>
      </Panel>

      {/* -- the ingest path -------------------------------------- */}
      <Panel
        title="Import from Samsung Health"
        hint="the export, parsed — you confirm before anything writes"
      >
        <ImportHealth />
      </Panel>

      <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed">
        <Link
          href="/life"
          className="font-semibold no-underline"
          style={{ color: "var(--accent)" }}
        >
          Back to LIFE_OS
        </Link>
      </p>
    </div>
  );
}
