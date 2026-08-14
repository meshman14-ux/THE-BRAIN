import Link from "next/link";
import PlanTabs from "@/components/PlanTabs";
import { createClient } from "@/lib/supabase/server";
import DayPlanner from "@/components/DayPlanner";
import type { Pillar, Task } from "@/lib/types";
import { addDays, toIso, formatDayLong } from "@/lib/logic";
import { calibration } from "@/lib/planner";

export const dynamic = "force-dynamic";

/**
 * One day, on the clock.
 *
 * The week screen decides *which day* a task happens; this decides *when*.
 * They are different questions and they deserve different screens — a
 * seven-column grid with hour rows is unreadable on a phone, and the phone
 * is where the plan gets consulted.
 */
export default async function DayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const today = toIso(new Date());
  const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;

  const supabase = await createClient();

  const [{ data: tasks }, { data: pillars }, { data: finished }] = await Promise.all([
    // This day's work, plus everything with no day at all — the pool has to
    // include loose tasks or the planner can only rearrange, never commit.
    supabase
      .from("tasks")
      .select(
        "id, title, pillar_id, do_date, due_date, priority, status, notes, duration_min, actual_min, energy, meta"
      )
      .in("status", ["open", "doing"])
      .or(`do_date.eq.${day},do_date.is.null`),
    supabase
      .from("pillars")
      .select("id, system, name, emoji, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
    // The calibration sample: finished work that carries both numbers.
    supabase
      .from("tasks")
      .select("duration_min, actual_min")
      .eq("status", "done")
      .not("duration_min", "is", null)
      .not("actual_min", "is", null)
      .order("completed_at", { ascending: false })
      .limit(60),
  ]);

  const cal = calibration(
    (finished ?? []) as { duration_min: number | null; actual_min: number | null }[]
  );

  const nav = (iso: string, label: string) => (
    <Link href={`/day?d=${iso}`} className="chip no-underline">
      {label}
    </Link>
  );

  return (
    <div className="grid gap-5">
      <PlanTabs active="day" />
      <header>
        <p className="label">The hour grid</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">
          {day === today ? "Today" : formatDayLong(day)}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-[62ch]">
          Give a task a time by dropping it on one. Whatever lands here leaves
          for Google as a timed event through the sync that already exists —
          the slot is written to the same field the calendar has always read.
        </p>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        {nav(addDays(day, -1), "‹ Prev")}
        {day !== today && nav(today, "Today")}
        {nav(addDays(day, 1), "Next ›")}
        {/* Week and Calendar used to be chips here. They are both in the
            Plan strip at the top of this page now, and a second route to
            the same place two inches below the first is how a page starts
            feeling arbitrary. The date controls keep this row. */}
      </div>

      <DayPlanner
        dayIso={day}
        dayLabel={formatDayLong(day)}
        tasks={(tasks ?? []) as Task[]}
        pillars={(pillars ?? []) as Pillar[]}
        calibration={cal}
      />
    </div>
  );
}
