import { createClient } from "@/lib/supabase/server";
import Week from "@/components/Week";
import HourPurposeGrid, { type JournalDay } from "@/components/HourPurpose";
import type { Pillar, Task } from "@/lib/types";
import { toIso, weekOf } from "@/lib/logic";

export const dynamic = "force-dynamic";

export default async function WeekPage() {
  const supabase = await createClient();
  const now = new Date();
  const today = toIso(now);
  const dates = weekOf(now);

  const [{ data: tasks }, { data: pillars }, { data: journal }] = await Promise.all([
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
    // Only this week's rows: the hour labels are an annotation on the week
    // in front of him, not an archive to scroll.
    supabase
      .from("journal")
      .select("entry_date, meta")
      .gte("entry_date", dates[0])
      .lte("entry_date", dates[6]),
  ]);

  return (
    <div className="grid gap-6">
      <header className="mb-1">
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

      <HourPurposeGrid
        dates={dates}
        todayIso={today}
        journal={(journal ?? []) as JournalDay[]}
      />
    </div>
  );
}
