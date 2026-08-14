import HealthPage from "../health/page";
import FoodPage from "../food/page";
import { createClient } from "@/lib/supabase/server";
import { toIso } from "@/lib/logic";
import { leadWithLogger, restart, restartLine } from "@/lib/restart";
import LogSession, { RecentSessions } from "@/components/LogSession";
import { ParentHeader, ParentSection } from "@/components/ParentShell";
import { normaliseView, parentById } from "@/lib/parents";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * BODY — Training, Readiness and Food
 *
 * Nutrition is an INPUT to readiness, not a neighbour of it. Filing them
 * as sibling routes is why fifty meals sat in a library that the
 * readiness score could not see.
 *
 * The Health and Food pages are COMPOSED rather than rewritten. Each is
 * already a self-contained async server component that fetches its own
 * data, so nesting them costs nothing and means the compression cannot
 * break what currently works. Both old routes still answer.
 *
 * WHAT CHANGED ON 2026-08-14, and why. This page used to say "nothing on
 * this page needs typing, which is why it will still be true in
 * December", and it kept Training off the page deliberately — the
 * reasoning being that training "fills itself from the watch rather than
 * from a tap".
 *
 * That was wrong in the way an assumption is wrong rather than a fact:
 * the watch is not connected, `workouts` has never held a row, and the
 * page therefore said nothing at all. Asked directly, Jay's answer was
 * that Training & Fitness is a priority he WANTS rather than one he has —
 * it is his lowest-scoring area at 2 out of 10, and `habit_logs` holds
 * exactly one row, ever.
 *
 * So the page now opens on a button rather than on a score. Readiness
 * still exists and is still correct; it simply stops being the first
 * thing you meet, because a well-built panel that says "needs 14 days of
 * readings" is a panel you look at once.
 * ------------------------------------------------------------------ */

export default async function BodyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const parent = parentById("body")!;
  const view = normaliseView(parent, sp.tab);
  const today = toIso(new Date());

  const supabase = await createClient();
  const { data: workoutRows } = await supabase
    .from("workouts")
    .select("id, on_date, kind")
    .order("on_date", { ascending: false });

  const sessions = (workoutRows ?? []) as { id: string; on_date: string; kind: string }[];
  const state = restart(sessions, today);

  return (
    <div className="sys-life grid gap-7 max-w-[900px]">
      <ParentHeader
        parent={parent}
        view={view}
        // The header line follows the state rather than describing the
        // module. At zero it says what one session is worth; it never
        // opens by naming a target that has never been met.
        line={
          leadWithLogger(state)
            ? restartLine(state)
            : "Readiness and fuel, in one place."
        }
        working={
          leadWithLogger(state)
            ? "Readiness and the skill trees are underneath this and still work — they need sessions before they can say anything, which is what the button is for."
            : "Fuel fills itself from the meals you mark cooked; readiness comes from the watch. Training is the one tap."
        }
      />

      <ParentSection id="training" title="Training" view={view}>
        <div className="grid gap-3">
          <LogSession state={state} today={today} />
          {/* The last few, plainly. No streak and no grade: at this stage a
              streak of one is not a streak, and a broken one is a fact
              nobody needs reminding of. */}
          <RecentSessions sessions={sessions.slice(0, 8)} />
        </div>
      </ParentSection>

      <ParentSection id="readiness" title="Readiness" view={view}>
        <HealthPage />
      </ParentSection>

      <ParentSection id="food" title="Food" view={view}>
        <FoodPage />
      </ParentSection>
    </div>
  );
}
