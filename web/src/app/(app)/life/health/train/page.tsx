import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { toIso } from "@/lib/logic";
import { SEASON_LABEL, seasonKind } from "@/lib/season";
import type { Season } from "@/lib/season";
import {
  BAND_LABEL,
  LIBRARY,
  SEASON_SESSIONS,
  SKILL_TREES,
  advise,
  deriveState,
  drivers,
  generatePlan,
  readinessFor,
  weekShape,
  workloadRatio,
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
import SessionLogger from "@/components/SessionLogger";
import { Empty } from "@/components/ui";
import HudPanel from "@/components/hud/HudPanel";

export const dynamic = "force-dynamic";

/**
 * Today's session.
 *
 * Everything on this page is assembled by the HYBRID engine from rows this
 * database already holds — the page itself decides nothing. Its whole job
 * is to fetch, adapt, and lay out what the engine returns, including the
 * parts where the engine says it does not know.
 */
export default async function TrainPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [
    { data: healthDays },
    { data: journal },
    { data: workouts },
    { data: sets },
    { data: attempts },
    { data: profileRow },
    { data: seasons },
    { data: cooked },
  ] = await Promise.all([
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
      .from("workouts")
      .select("id, on_date, kind, minutes, rpe")
      .order("on_date", { ascending: false })
      .limit(60),
    supabase
      .from("training_sets")
      .select("workout_id, exercise_id, amount, load_kg, rir, sort_order")
      .order("sort_order"),
    supabase.from("skill_attempts").select("node_id, on_date, amount, strict"),
    supabase
      .from("athlete_profile")
      .select("bodyweight_kg, sessions_per_week, equipment, focus_skills, landmarks")
      .maybeSingle(),
    supabase.from("seasons").select("id, kind, started_on, ended_on, note"),
    // BODY absorbs FOOD. What he cooked is one of the larger inputs to
    // whether he can train, and `last_cooked_on` is already written by a
    // button he presses for his own reasons — so this costs him nothing.
    supabase
      .from("meals")
      .select("last_cooked_on, protein_g, estimates")
      .not("last_cooked_on", "is", null),
  ]);

  /* -- adapt ------------------------------------------------------- */

  const meals = (cooked ?? []) as CookedMealRow[];
  const readings = allReadings(
    (healthDays ?? []) as HealthDayRow[],
    (journal ?? []) as JournalRow[],
    meals
  );
  const fed = fedState(meals, today);
  const sessions = sessionsFrom(
    (workouts ?? []) as WorkoutRow[],
    (sets ?? []) as TrainingSetRow[]
  );
  const profile = profileFrom((profileRow ?? null) as AthleteProfileRow | null);
  const allAttempts = attemptsFrom((attempts ?? []) as SkillAttemptRow[]);

  // Mastery is derived from the log every time, never stored.
  const skillState = SKILL_TREES.reduce(
    (acc, tree) => ({ ...acc, ...deriveState(tree, allAttempts) }),
    {} as Record<string, "locked" | "testing" | "working" | "owned">
  );

  /* -- the engine -------------------------------------------------- */

  // The season is a declaration about the month, and the plan respects it
  // rather than arguing with it: five sessions in quiet, three in busy, one
  // in minimum — and the floor never flexes.
  const kind = seasonKind((seasons ?? []) as Season[]);
  const shape = weekShape(SEASON_SESSIONS[kind]);
  const { kind: sessionKind, everythingRecent } = todaysKind(shape, sessions, today);

  const readiness = readinessFor(readings, today);
  const plan = generatePlan({
    on: today,
    kind: everythingRecent ? "rest" : sessionKind,
    readiness,
    profile,
    trees: SKILL_TREES,
    skillState,
    recentIds: sessions
      .filter((s) => s.on >= today.slice(0, 8) + "01")
      .flatMap((s) => s.sets.map((x) => x.exercise_id)),
  });
  const ratio = workloadRatio(sessions, today);
  const advice = advise({
    todayIso: today,
    readiness,
    sessions,
    library: LIBRARY,
    trees: SKILL_TREES,
    skillState,
    profile,
  });

  const todaysWorkout = (workouts ?? []).find(
    (w: WorkoutRow) => w.on_date === today
  );
  const loggedToday = todaysWorkout
    ? sessions.find((s) => s.id === todaysWorkout.id)?.sets ?? []
    : [];

  const libraryProps = Object.fromEntries(
    [...LIBRARY.values()].map((e) => [
      e.id,
      { id: e.id, name: e.name, unit: e.unit, cues: e.cues },
    ])
  );

  const { down, up } = drivers(readiness);

  return (
    <div className="grid gap-5 max-w-[820px]">
      <header>
        <p className="label">
          Training · {SEASON_LABEL[kind].toLowerCase()} season ·{" "}
          {SEASON_SESSIONS[kind]} sessions/wk
        </p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">{plan.headline}</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-[64ch]">
          {everythingRecent
            ? "Every session in this week's rotation has been trained in the last three days. That makes today a rest day — adaptation happens now, not in the session."
            : `Today is ${plan.kind.replace("-", " ")}. ${plan.adjustment.reason}`}
        </p>
      </header>

      {/* -- readiness ------------------------------------------------ */}
      <HudPanel
        title="◈ Readiness"
        hint={
          readiness.score != null
            ? `${Math.round(readiness.confidence * 100)}% of the usual evidence`
            : "not enough to say"
        }
      >
        {readiness.score == null ? (
          <Empty>{readiness.reason}</Empty>
        ) : (
          <div className="grid gap-2">
            <div className="flex items-baseline gap-3">
              <span
                className="mono text-[2rem] font-bold leading-none"
                style={{
                  color:
                    readiness.band === "green"
                      ? "var(--good)"
                      : readiness.band === "amber"
                        ? "var(--warn)"
                        : "var(--bad)",
                }}
              >
                {readiness.score}
              </span>
              <span className="text-[0.9rem] font-semibold">
                {BAND_LABEL[readiness.band!]}
              </span>
            </div>
            {(down.length > 0 || up.length > 0) && (
              <p className="text-[0.78rem] text-[var(--muted)] leading-relaxed">
                {down.length > 0
                  ? `Pulled down by ${down.map((d) => d.line).join(", and ")}.`
                  : ""}
                {up.length > 0
                  ? ` Held up by ${up.map((d) => d.line).join(", and ")}.`
                  : ""}
              </p>
            )}
            {readiness.missing.length > 0 && (
              <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
                Not heard from today: {readiness.missing.join(", ").replace(/_/g, " ")}.
              </p>
            )}
          </div>
        )}

        {/* -- the kitchen ------------------------------------------- *
         *
         * Shown whether or not there is a score, because "am I feeding
         * myself" is a different question from "can I train today" and
         * the answer to it survives the engine having nothing to say.
         * It links to Food rather than restating it: two modules, one
         * body, and this is the seam between them. */}
        <p className="text-[0.74rem] text-[var(--muted)] leading-relaxed mt-3 pt-2.5 border-t border-[var(--border)] m-0">
          {fed.line}{" "}
          <Link href="/life/health/food" className="no-underline" style={{ color: "var(--accent)" }}>
            Food →
          </Link>
        </p>
      </HudPanel>

      {/* -- the session ---------------------------------------------- */}
      {plan.blocks.length === 0 ? (
        <Empty>
          Nothing to prescribe with the equipment on your profile. Add what
          you actually own and the plan fills itself in.
        </Empty>
      ) : (
        <SessionLogger
          plan={plan}
          library={libraryProps}
          workoutId={todaysWorkout?.id ?? null}
          logged={loggedToday}
          today={today}
        />
      )}

      {/* -- what the advisor has to say ------------------------------ */}
      {Object.values(advice).flat().length > 0 && (
        <HudPanel title="◇ Advice" hint="four channels, none allowed to drown the others">
          <div className="grid gap-3">
            {Object.entries(advice).map(([channel, items]) =>
              items.length === 0 ? null : (
                <div key={channel}>
                  <p className="label mb-1">{channel}</p>
                  <div className="grid gap-1.5">
                    {items.map((a, i) => (
                      <p
                        key={i}
                        className="text-[0.78rem] leading-relaxed"
                        style={{
                          color:
                            a.severity === "warn"
                              ? "var(--warn)"
                              : "var(--muted)",
                        }}
                      >
                        {a.line}
                        {a.action?.href && (
                          <>
                            {" "}
                            <Link
                              href={a.action.href}
                              className="font-semibold no-underline"
                              style={{ color: "var(--accent)" }}
                            >
                              {a.action.label} →
                            </Link>
                          </>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </HudPanel>
      )}

      {/* -- load ------------------------------------------------------ */}
      <HudPanel title="◷ Load" hint="a conversation, never a gate">
        <p className="text-[0.8rem] text-[var(--muted)] leading-relaxed">
          {ratio.line}
          {ratio.ratio != null && (
            <span className="mono text-[var(--faint)]">
              {" "}
              ({ratio.ratio.toFixed(2)})
            </span>
          )}
        </p>
      </HudPanel>

      <p className="text-[0.74rem] text-[var(--faint)]">
        <Link
          href="/life/health/skills"
          className="font-semibold no-underline"
          style={{ color: "var(--accent)" }}
        >
          Skills →
        </Link>
        {"  ·  "}
        <Link
          href="/life/health"
          className="font-semibold no-underline"
          style={{ color: "var(--accent)" }}
        >
          Health
        </Link>
      </p>
    </div>
  );
}
