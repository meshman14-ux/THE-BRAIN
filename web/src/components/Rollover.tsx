"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/types";
import { addDays } from "@/lib/logic";

/**
 * The day's leftovers, settled one tap each at the close.
 *
 * Every open task still carrying today's (or an older) `do_date` is offered
 * three exits: tomorrow, back to the pool, or dropped. This is Sunsama's
 * shutdown rule wearing THE BRAIN's discipline: each choice writes on tap,
 * nothing gates, and a task left unsettled tonight is simply offered again
 * tomorrow. What it prevents is the silent third state — scheduled in the
 * past, neither planned nor unplanned, just old.
 *
 * Rolling or pooling clears any time slot the task held: the slot belonged
 * to a day that is over, and carrying "09:00" into tomorrow unexamined would
 * be the calendar quietly deciding the morning.
 */
export default function Rollover({
  tasks,
  today,
}: {
  tasks: Task[];
  today: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [settled, setSettled] = useState(0);
  const router = useRouter();
  const supabase = createClient();

  async function settle(
    t: Task,
    patch: { do_date?: string | null; status?: "dropped" }
  ) {
    setBusy(t.id);
    // The slot dies with the day; the date decision is the patch's.
    const meta = { ...((t.meta as Record<string, unknown>) ?? {}) };
    delete meta.time;
    await supabase
      .from("tasks")
      .update({ ...patch, meta })
      .eq("id", t.id);
    setBusy(null);
    setSettled((n) => n + 1);
    router.refresh();
  }

  if (tasks.length === 0) {
    if (settled === 0) return null;
    return (
      <section className="panel">
        <p className="label">Today's leftovers</p>
        <p className="text-[0.86rem] mt-2 leading-relaxed text-[var(--muted)]">
          All settled. Tomorrow starts with what you chose, not with what
          slipped.
        </p>
      </section>
    );
  }

  return (
    <section className="panel grid gap-3">
      <div className="flex items-baseline gap-2">
        <p className="label">Optional</p>
      </div>
      <p className="text-[0.95rem] font-medium leading-snug">
        {tasks.length === 1
          ? "One thing set for today is still open."
          : `${tasks.length} things set for today are still open.`}
      </p>
      <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed -mt-1.5">
        Roll it, pool it, or drop it — a date left in the past is how a
        backlog rots. Leaving them is fine too; they will be offered again
        tomorrow.
      </p>
      <div className="grid gap-2">
        {tasks.map((t) => (
          <div
            key={t.id}
            className="rounded-[10px] border border-[var(--border)] px-3 py-2.5"
            style={{ opacity: busy === t.id ? 0.6 : 1 }}
          >
            <p className="text-[0.86rem] font-medium leading-snug">{t.title}</p>
            {t.do_date != null && t.do_date < today && (
              <p className="text-[0.68rem] text-[var(--faint)] mt-0.5">
                set for {t.do_date}
              </p>
            )}
            <div className="flex gap-1.5 mt-2 flex-wrap">
              <button
                className="chip"
                disabled={busy === t.id}
                onClick={() => settle(t, { do_date: addDays(today, 1) })}
              >
                Tomorrow
              </button>
              <button
                className="chip"
                disabled={busy === t.id}
                onClick={() => settle(t, { do_date: null })}
                title="Unschedule it — back to the pool, still open"
              >
                Back to pool
              </button>
              <button
                className="chip"
                disabled={busy === t.id}
                onClick={() => settle(t, { status: "dropped" })}
                title="Not going to happen — dropped, not deleted"
              >
                Drop
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
