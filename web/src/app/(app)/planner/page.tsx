import { createClient } from "@/lib/supabase/server";
import PlanTabs from "@/components/PlanTabs";
import Planner from "@/components/Planner";
import SeededTasks from "@/components/SeededTasks";
import { seedSuggestions, type SeedRun } from "@/lib/diagnostics";
import type { Pillar, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const supabase = await createClient();

  const [{ data: tasks }, { data: pillars }, { data: runs }, { data: ventures }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, pillar_id, do_date, due_date, priority, status, duration_min, created_at")
        .in("status", ["open", "doing", "done"])
        .order("created_at", { ascending: false }),
      supabase
        .from("pillars")
        .select("id, system, name, emoji, standard, sort_order, active")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("diagnostic_runs")
        .select("id, subject_type, subject_id, kind, answers, meta, completed_at")
        .not("completed_at", "is", null),
      supabase.from("ventures").select("id, name, pillar_id"),
    ]);

  // The dedup is against EVERY task ever created, not just the open board —
  // a suggestion done and finished must not come back as a fresh offer.
  const { data: allTitles } = await supabase.from("tasks").select("title");
  const suggestions = seedSuggestions(
    (runs ?? []) as SeedRun[],
    (ventures ?? []) as { id: string; name: string; pillar_id: string | null }[],
    (pillars ?? []) as { id: string; name: string }[],
    ((allTitles ?? []) as { title: string }[]).map((t) => t.title)
  );

  return (
    <div>
      <PlanTabs active="board" />
      <header className="mb-5">
        <p className="label">Kanban</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Planner</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-[62ch]">
          Every task tagged to the area it serves. Move it right to start it, right
          again to finish it.
        </p>
      </header>

      {suggestions.length > 0 && (
        <div className="mb-5">
          <SeededTasks suggestions={suggestions} />
        </div>
      )}

      <Planner
        tasks={(tasks ?? []) as Task[]}
        pillars={(pillars ?? []) as Pillar[]}
        today={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
