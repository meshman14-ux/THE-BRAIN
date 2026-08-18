import { createClient } from "@/lib/supabase/server";
import { toIso } from "@/lib/logic";
import { SEASON_MEANING, currentSeason, daysInSeason, expectationsFor, seasonKind, type Season } from "@/lib/season";
import { SEASON_SESSIONS, weekShape } from "@/lib/hybrid";
import { sessionsFrom, todaysKind, type TrainingSetRow, type WorkoutRow } from "@/lib/training";
import { hexWeek, weekProgressLine } from "@/lib/cockpit";
import SeasonSwitch from "@/components/SeasonSwitch";
import HudPanel from "@/components/hud/HudPanel";
import HexWeek from "@/components/hud/HexWeek";

export const dynamic = "force-dynamic";

/**
 * The planner.
 *
 * The mockup shows a seven-day forward calendar with a session pinned to
 * each weekday. That is a picture the engine cannot honestly draw: the
 * rotation (`weekShape`) is a CURSOR that advances on what has actually
 * been trained, not a fixed Mon/Wed/Fri schedule, so there is no way to
 * say in advance which weekday a future slot lands on without inventing
 * a schedule the system does not have.
 *
 * What IS honest, and what this page shows instead: the season (real,
 * editable via the same `SeasonSwitch` the dashboard uses — one control,
 * not a duplicate), the rotation it implies for the week, TODAY's actual
 * slot in that rotation, and the week AS LOGGED so far. A forecast beyond
 * today would be a claim the engine cannot back.
 */
export default async function PlannerPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: seasonRows }, { data: workoutRows }, { data: setRows }] = await Promise.all([
    supabase.from("seasons").select("id, kind, started_on, ended_on, note"),
    supabase.from("workouts").select("id, on_date, kind, minutes, rpe").order("on_date", { ascending: false }).limit(60),
    supabase.from("training_sets").select("workout_id, exercise_id, amount, load_kg, rir, sort_order").order("sort_order"),
  ]);

  const seasons = (seasonRows ?? []) as Season[];
  const kind = seasonKind(seasons);
  const exp = expectationsFor(kind);
  const shape = weekShape(SEASON_SESSIONS[kind]);

  const workouts = (workoutRows ?? []) as WorkoutRow[];
  const trainingSessions = sessionsFrom(workouts, (setRows ?? []) as TrainingSetRow[]);
  const { kind: todaySlot, everythingRecent } = todaysKind(shape, trainingSessions, today);

  const days = hexWeek(workouts.map((w) => w.on_date), today);
  const season = currentSeason(seasons);
  const daysIn = daysInSeason(seasons, today);

  return (
    <div className="grid gap-5 max-w-[820px]">
      <header>
        <p className="label">Body · planner</p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: 6 }}>Season &amp; rotation</h1>
      </header>

      <HudPanel serial="SSN.MOD" title="SEASON MODE">
        <SeasonSwitch current={kind} daysIn={daysIn} />
        <p style={{ fontSize: 12, color: "rgba(214,239,255,.6)", lineHeight: 1.6, marginTop: 8 }}>{SEASON_MEANING[kind]}</p>
      </HudPanel>

      <HudPanel serial="ROT.WK" title="THIS SEASON'S ROTATION" hint={`${SEASON_SESSIONS[kind]} sessions / week`}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {shape.map((s, i) => {
            const isToday = !everythingRecent && s === todaySlot;
            return (
              <span
                key={i}
                className="mono"
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  border: `1px solid ${isToday ? "var(--hud-cyan)" : "var(--hud-hair2)"}`,
                  color: isToday ? "var(--hud-core)" : "rgba(214,239,255,.6)",
                  boxShadow: isToday ? "0 0 8px rgba(79,195,247,.35)" : "none",
                }}
              >
                {s} {isToday ? "· TODAY" : ""}
              </span>
            );
          })}
        </div>
        {everythingRecent && (
          <p style={{ fontSize: 12, color: "rgba(214,239,255,.5)", marginTop: 8 }}>
            Everything in the rotation has been trained in the last three days — today reads as rest.
          </p>
        )}
        <p className="microcopy" style={{ marginTop: 12, fontSize: 11, color: "rgba(214,239,255,.45)", textAlign: "center" }}>
          THE ROTATION ADVANCES ON WHAT IS ACTUALLY TRAINED, NOT ON THE CALENDAR — SKILL FREQUENCY HOLDS, VOLUME TRIMS WITH THE SEASON
        </p>
      </HudPanel>

      <HudPanel serial="WKC.014" title="THIS WEEK, AS LOGGED">
        <HexWeek days={days} />
        <p className="microcopy" style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "rgba(214,239,255,.55)" }}>
          {weekProgressLine(days, SEASON_SESSIONS[kind]).toUpperCase()}
        </p>
      </HudPanel>

      <HudPanel serial="FLR.MIN" title="THE FLOOR" hint="survives every season, whatever else narrows">
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {exp.floor.map((f) => (
            <li key={f} className="mono" style={{ fontSize: 12, color: "var(--hud-core)" }}>
              ▹ {f}
            </li>
          ))}
        </ul>
        {season == null && (
          <p style={{ fontSize: 12, color: "rgba(255,159,67,.85)", marginTop: 10 }}>
            No season has ever been declared — running on the quiet-season default until one is.
          </p>
        )}
      </HudPanel>
    </div>
  );
}
