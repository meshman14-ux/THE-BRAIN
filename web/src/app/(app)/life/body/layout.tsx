import { createClient } from "@/lib/supabase/server";
import { toIso, currentStreak } from "@/lib/logic";
import { attemptsFrom, type SkillAttemptRow, type WorkoutRow } from "@/lib/training";
import { SKILL_TREES, deriveState, treeProgress } from "@/lib/hybrid";
import { levelFor, rankFor, totalXp } from "@/lib/cockpit";
import { RankBadge, XPFill } from "@/components/hud/XPBar";
import CockpitTabs from "@/components/hud/CockpitTabs";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * The MARK-VII cockpit shell — scoped to /life/body/** ONLY.
 *
 * `.sys-cockpit` on this one wrapper is what re-skins every existing
 * component underneath (SessionLogger, SkillTrees, HealthToday, Panel /
 * Empty / Bar from ui.tsx) with zero changes to their own code — see the
 * long comment on `.sys-cockpit` in globals.css for why that works. Every
 * OTHER route in the app renders exactly as it did before this file
 * existed, because nothing outside this subtree ever sees the class.
 *
 * Level, rank and streak are computed here rather than per-page, so the
 * top bar reads the same number on every tab — the alternative (each page
 * deriving its own) is the same class of drift the schema-capture note in
 * CLAUDE.md exists to prevent.
 * ------------------------------------------------------------------ */
export default async function BodyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: workoutRows }, { data: attemptRows }] = await Promise.all([
    supabase.from("workouts").select("id, on_date, kind, minutes, rpe"),
    supabase.from("skill_attempts").select("node_id, on_date, amount, strict"),
  ]);

  const workouts = (workoutRows ?? []) as WorkoutRow[];
  const attempts = attemptsFrom((attemptRows ?? []) as SkillAttemptRow[]);

  // "Closed" mirrors SessionLogger's own finish() call — a session with an
  // RPE or a clocked length was actually wrapped up, not just started.
  const closed = workouts
    .filter((w) => w.minutes != null || w.rpe != null)
    .map(() => ({ closed: true as const }));

  const xp = totalXp(closed, attempts);
  const level = levelFor(xp);

  const ownedRungs = SKILL_TREES.reduce((sum, tree) => {
    const state = deriveState(tree, attempts);
    return sum + treeProgress(tree, state).owned;
  }, 0);
  const rank = rankFor(ownedRungs);

  const streak = currentStreak(workouts.map((w) => w.on_date), today);

  return (
    <div className="sys-cockpit hud-dotgrid">
      <div className="hud-scanlines" aria-hidden="true" />
      <header
        className="panel hud-panel"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "12px 16px",
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span className="hud-corner" data-c="tl" />
        <span className="hud-corner" data-c="tr" />
        <span className="hud-corner" data-c="bl" />
        <span className="hud-corner" data-c="br" />
        <span className="hud-serial">BRN.OS // HLTH.MOD.07</span>

        <RankBadge rank={rank} />
        <XPFill level={level} />

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 24 }}>
          <span className="mono" style={{ fontSize: 13, color: "rgba(214,239,255,.75)", letterSpacing: "0.14em" }}>
            {new Date(today + "T00:00:00Z").toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).toUpperCase()}
          </span>
          {streak > 0 && (
            <span className="mono" style={{ color: "var(--hud-orange)", fontWeight: 700, letterSpacing: "0.1em", fontSize: 13 }}>
              ● IGNITION ×{streak}
            </span>
          )}
        </div>
      </header>

      <CockpitTabs />

      {children}
    </div>
  );
}
