import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FloorSignals } from "./floor";

/**
 * The floor's evidence, read from the rows the system already collects —
 * one loader shared by the printed sheet and the dashboard headline, so the
 * two can never disagree about whether a day landed.
 */

const BODY_HABIT = "Training";
const MIND_HABITS = ["Read a page", "Nightly reflection"];

function isoDaysAgo(todayIso: string, n: number): string {
  const t = new Date(`${todayIso.slice(0, 10)}T00:00:00Z`);
  return new Date(t.getTime() - n * 86400000).toISOString().slice(0, 10);
}

export async function loadFloorSignals(todayIso: string): Promise<FloorSignals> {
  const supabase = await createClient();
  const since = isoDaysAgo(todayIso, 6);

  const [{ data: habits }, { data: logs }, { data: workouts }, { data: doneTasks }, { data: projects }, { data: journal }] =
    await Promise.all([
      supabase.from("habits").select("id, name"),
      supabase.from("habit_logs").select("habit_id, done_on").gte("done_on", since),
      supabase.from("workouts").select("on_date").gte("on_date", since),
      supabase
        .from("tasks")
        .select("project_id, completed_at")
        .eq("status", "done")
        .not("completed_at", "is", null)
        .not("project_id", "is", null)
        .gte("completed_at", `${since}T00:00:00Z`),
      supabase.from("projects").select("id, venture_id").not("venture_id", "is", null),
      supabase.from("journal").select("entry_date").gte("entry_date", since),
    ]);

  const habitId = new Map((habits ?? []).map((h) => [h.name as string, h.id as string]));
  const bodyId = habitId.get(BODY_HABIT);
  const mindIds = new Set(MIND_HABITS.map((n) => habitId.get(n)).filter(Boolean));

  const trainingDays = new Set<string>();
  const mindHabitDays = new Set<string>();
  for (const l of logs ?? []) {
    if (l.habit_id === bodyId) trainingDays.add(l.done_on as string);
    if (mindIds.has(l.habit_id as string)) mindHabitDays.add(l.done_on as string);
  }

  const ventureProjects = new Set((projects ?? []).map((p) => p.id as string));
  const empireDays = new Set<string>();
  for (const t of doneTasks ?? []) {
    if (t.project_id != null && ventureProjects.has(t.project_id as string)) {
      empireDays.add((t.completed_at as string).slice(0, 10));
    }
  }

  return {
    trainingDays,
    workoutDays: new Set((workouts ?? []).map((w) => w.on_date as string)),
    empireDays,
    mindHabitDays,
    journalDays: new Set((journal ?? []).map((j) => j.entry_date as string)),
  };
}
