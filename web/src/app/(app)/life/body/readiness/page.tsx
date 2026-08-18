import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  toIso,
  loadState,
  bigFourBests,
  nutritionState,
  MOVEMENT_LABEL,
  NUTRITION_RUNG_LABEL,
  LOAD_SPIKE_RATIO,
  currentStreak,
  type HealthDay,
  type Workout,
  type Lift,
} from "@/lib/logic";
import { BAND_LABEL, readinessFor } from "@/lib/hybrid";
import {
  allReadings,
  type CookedMealRow,
  type HealthDayRow,
  type JournalRow,
} from "@/lib/training";
import HealthToday from "@/components/HealthToday";
import ImportHealth from "@/components/ImportHealth";
import RingGauge from "@/components/hud/RingGauge";
import HudPanel from "@/components/hud/HudPanel";

export const dynamic = "force-dynamic";

/**
 * The readiness detail.
 *
 * §2 of the brief: the HYBRID score (0–100 + confidence) is now the ONE
 * display model, here and on `/life/body` and `/life/body/train` — the
 * hero this page opens on switched from `logic.ts`'s three-band
 * `readinessBand()` to `readinessFor()`, so the number and its colour can
 * never come from two disagreeing models. `readinessBand()` itself is
 * untouched and still used by its own tests; nothing here deletes it.
 *
 * Everything BELOW the hero — the daily floor, the load spike detector,
 * the Big 4 and the nutrition rungs, the Samsung import — is the same
 * real functionality the page already had, restyled rather than
 * replaced. A restyle that quietly drops the one-tap daily input would
 * be the empty-state failure §7 warns about, just moved one level down.
 */
export default async function ReadinessPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: dayRows }, { data: workoutRows }, { data: liftRows }, { data: journal }, { data: cooked }] =
    await Promise.all([
      supabase
        .from("health_days")
        .select(
          "on_date, steps, active_minutes, rmssd, resting_hr, sleep_hours, weight_kg, ate_well, protein_g, calories, source"
        )
        .order("on_date", { ascending: false })
        .limit(180),
      supabase.from("workouts").select("on_date, kind, minutes, rpe").order("on_date", { ascending: false }).limit(200),
      supabase.from("lifts").select("on_date, movement, weight_kg, reps").order("on_date", { ascending: false }).limit(400),
      supabase.from("journal").select("entry_date, mood, energy").order("entry_date", { ascending: false }).limit(90),
      supabase.from("meals").select("last_cooked_on, protein_g, estimates").not("last_cooked_on", "is", null),
    ]);

  const days = (dayRows ?? []) as HealthDay[];
  const workouts = (workoutRows ?? []) as Workout[];
  const lifts = (liftRows ?? []) as Lift[];

  const meals = (cooked ?? []) as CookedMealRow[];
  const readings = allReadings(days as unknown as HealthDayRow[], (journal ?? []) as JournalRow[], meals);
  const readiness = readinessFor(readings, today);

  const load = loadState(workouts, today);
  const bests = bigFourBests(lifts, today);
  const nutrition = nutritionState(days, today);
  const todayRow = days.find((d) => d.on_date === today) ?? null;
  const streak = currentStreak(
    workouts.map((w) => w.on_date),
    today
  );

  const sysLine =
    readiness.band === "green"
      ? "SYS.OK"
      : readiness.band === "amber"
        ? "SYS.CAUTION"
        : readiness.band === "red"
          ? "SYS.STAND-DOWN"
          : undefined;

  return (
    <div className="grid gap-5 max-w-[820px]">
      {/* -- hero · the ring --------------------------------------------- */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <RingGauge score={readiness.score} confidence={readiness.confidence} band={readiness.band} size={280} sysLine={sysLine} />
        {readiness.score == null ? (
          <p style={{ fontSize: 13, color: "rgba(214,239,255,.6)", maxWidth: 420, textAlign: "center" }}>{readiness.reason}</p>
        ) : (
          <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>{BAND_LABEL[readiness.band!]}</p>
        )}
      </div>

      {readiness.contributions.length > 0 && (
        <HudPanel serial="CTB.014" title="CONTRIBUTOR BREAKDOWN">
          <ContributorList contributions={readiness.contributions} />
          {readiness.missing.length > 0 && (
            <p className="mono" style={{ fontSize: 11, color: "rgba(79,195,247,.5)", marginTop: 10 }}>
              NOT HEARD FROM TODAY: {readiness.missing.join(", ").replace(/_/g, " ").toUpperCase()}
            </p>
          )}
        </HudPanel>
      )}

      {/* -- today's floor ------------------------------------------ */}
      <HudPanel serial="LOG.TDY" title="TODAY" hint="one tap is a complete entry">
        <HealthToday date={today} initial={todayRow} />
      </HudPanel>

      {/* -- load --------------------------------------------------- */}
      <HudPanel serial="CHT.LOD" title="LOAD" hint={`spike detector only · ${LOAD_SPIKE_RATIO}× the four-week average`}>
        {load.reason ? (
          <p style={{ fontSize: 13, color: "rgba(214,239,255,.6)", lineHeight: 1.6 }}>{load.reason}</p>
        ) : (
          <>
            <div className="mono" style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 13 }}>
              <span>THIS WEEK {load.thisWeek}</span>
              <span>USUAL {load.average}</span>
              <span style={{ color: load.spike ? "var(--hud-orange)" : "rgba(214,239,255,.7)" }}>
                {load.spike ? "SPIKE · " : ""}
                {load.ratio}×
              </span>
            </div>
            <div style={{ height: 6, background: "rgba(30,74,102,.5)", border: "1px solid var(--hud-hair2)", marginTop: 8 }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, Math.round(((load.ratio ?? 0) / 2) * 100))}%`,
                  background: load.spike ? "var(--hud-orange)" : "var(--hud-cyan)",
                }}
              />
            </div>
          </>
        )}
        <p className="mono" style={{ fontSize: 11, color: "rgba(79,195,247,.5)", lineHeight: 1.6, marginTop: 8 }}>
          SPIKE DETECTOR, NOT AN INJURY PREDICTOR. STREAK {streak} DAY{streak === 1 ? "" : "S"}.
        </p>
      </HudPanel>

      {/* -- the Big 4 ---------------------------------------------- */}
      <HudPanel serial="LFT.B4" title="THE BIG FOUR" hint="a ceiling — this page works without it">
        {bests.every((b) => b.e1rm == null) ? (
          <p style={{ fontSize: 13, color: "rgba(214,239,255,.5)", lineHeight: 1.6 }}>
            Nothing logged. Four lifts, and the page is complete whether you ever fill them in or not.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {bests.map((b) => (
              <li key={b.movement} style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, minWidth: "8rem" }}>{MOVEMENT_LABEL[b.movement]}</span>
                {b.e1rm == null ? (
                  <span style={{ fontSize: 13, color: "rgba(214,239,255,.4)", fontStyle: "italic" }}>not logged</span>
                ) : (
                  <>
                    <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: "var(--hud-core)" }}>
                      {b.e1rm} kg
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: "rgba(79,195,247,.5)" }}>
                      est. from {b.weight}kg × {b.reps} on {b.on}
                    </span>
                    {b.change != null && (
                      <span
                        className="mono"
                        style={{ fontSize: 11, marginLeft: "auto", color: b.change >= 0 ? "#7ce8c4" : "var(--hud-orange)" }}
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
      </HudPanel>

      {/* -- nutrition ---------------------------------------------- */}
      <HudPanel serial="NUT.RNG" title="NUTRITION" hint={NUTRITION_RUNG_LABEL[nutrition.rung]}>
        <div className="mono" style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 13 }}>
          <span>LOGGED {nutrition.logged} / {nutrition.of} DAYS</span>
          <span>
            WEIGHT{" "}
            {nutrition.weightChange == null ? "—" : `${nutrition.weightChange >= 0 ? "+" : ""}${nutrition.weightChange} KG`}
          </span>
          {nutrition.protein != null && <span>PROTEIN {nutrition.protein} G</span>}
        </div>
      </HudPanel>

      {/* -- the ingest path -------------------------------------- */}
      <HudPanel serial="IMP.SHL" title="IMPORT FROM SAMSUNG HEALTH" hint="the export, parsed — you confirm before anything writes">
        <ImportHealth />
      </HudPanel>

      <p style={{ textAlign: "center", fontSize: "0.74rem" }}>
        <Link href="/life/body/train" style={{ color: "var(--hud-cyan)", textDecoration: "none", fontWeight: 700 }}>
          ← Today&apos;s session
        </Link>
        {"  ·  "}
        <Link href="/life/body" style={{ color: "var(--hud-cyan)", textDecoration: "none", fontWeight: 700 }}>
          Home
        </Link>
      </p>
    </div>
  );
}

function ContributorList({
  contributions,
}: {
  contributions: { key: string; normalised: number; line: string }[];
}) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, borderTop: "1px solid var(--hud-hair2)" }}>
      {contributions.map((c) => {
        const sig = c.normalised > 0.55 ? "+" : c.normalised < 0.45 ? "−" : "■";
        const colour = c.normalised > 0.55 ? "#7ce8c4" : c.normalised < 0.45 ? "var(--hud-orange)" : "var(--hud-cyan)";
        return (
          <li
            key={c.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 8px",
              borderBottom: "1px dashed rgba(79,195,247,.1)",
              fontSize: 13,
            }}
          >
            <span className="mono" style={{ width: 20, textAlign: "center", color: colour }}>
              {sig}
            </span>
            <span className="lbl" style={{ flex: 1, marginLeft: 6 }}>
              {c.key.replace(/_/g, " ")}
            </span>
            <span className="mono" style={{ fontSize: 12 }}>
              {c.line}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
