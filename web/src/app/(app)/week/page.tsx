import { createClient } from "@/lib/supabase/server";
import Week from "@/components/Week";
import type { Pillar, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WeekPage() {
  const supabase = await createClient();

  const [{ data: tasks }, { data: pillars }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, pillar_id, do_date, due_date, priority, status")
      .in("status", ["open", "doing"])
      .order("priority"),
    supabase
      .from("pillars")
      .select("id, system, name, emoji, standard, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
  ]);

  return (
    <div>
      <header className="mb-5">
        <p className="label">Scheduler</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">This Week</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-[62ch]">
          Put each task on the day you intend to <em>do</em> it — not the day it&apos;s
          due. Unscheduled tasks wait in the pool below.
        </p>
      </header>

      <Week
        tasks={(tasks ?? []) as Task[]}
        pillars={(pillars ?? []) as Pillar[]}
      />
    </div>
  );
}
