import { createClient } from "@/lib/supabase/server";
import type { Goal, Pillar, Project, TaskStatus } from "@/lib/types";
import { toIso } from "@/lib/logic";
import GoalsView from "@/components/Goals";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const supabase = await createClient();

  const [{ data: goals }, { data: projects }, { data: tasks }, { data: pillars }] =
    await Promise.all([
      supabase
        .from("goals")
        .select("id, title, description, pillar_id, vision_id, target_date, progress, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("projects")
        .select("id, title, description, pillar_id, goal_id, start_date, due_date, status")
        .order("created_at", { ascending: false }),
      // Only what progress needs — a project's percentage is done ÷ counted.
      supabase.from("tasks").select("id, project_id, status").not("project_id", "is", null),
      supabase
        .from("pillars")
        .select("id, system, name, emoji, standard, sort_order, active")
        .eq("active", true)
        .order("sort_order"),
    ]);

  return (
    <GoalsView
      goals={(goals ?? []) as Goal[]}
      projects={(projects ?? []) as Project[]}
      tasks={(tasks ?? []) as { id: string; project_id: string | null; status: TaskStatus }[]}
      pillars={(pillars ?? []) as Pillar[]}
      today={toIso(new Date())}
    />
  );
}
