import { createClient } from "@/lib/supabase/server";
import Planner from "@/components/Planner";
import type { Pillar, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const supabase = await createClient();

  const [{ data: tasks }, { data: pillars }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, pillar_id, do_date, due_date, priority, status")
      .in("status", ["open", "doing", "done"])
      .order("created_at", { ascending: false }),
    supabase
      .from("pillars")
      .select("id, system, name, emoji, standard, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
  ]);

  return (
    <div>
      <header className="mb-5">
        <p className="label">Kanban</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Planner</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-[62ch]">
          Every task tagged to the area it serves. Move it right to start it, right
          again to finish it.
        </p>
      </header>

      <Planner
        tasks={(tasks ?? []) as Task[]}
        pillars={(pillars ?? []) as Pillar[]}
      />
    </div>
  );
}
