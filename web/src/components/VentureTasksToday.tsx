"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type VentureTaskRow, sortVentureTasks } from "@/lib/venture";

/**
 * Venture work that has been pulled into a day.
 *
 * ONE ROW, TWO VIEWS. Nothing here is a copy of a public.tasks row — this
 * reads venture_tasks directly, the same rows the venture page edits. So
 * a task cannot be marked done in one place and still open in the other,
 * and there is no sync step that can silently fail.
 *
 * It renders as its own block rather than being mixed into the planner:
 * venture work is chosen deliberately, and burying it in the pool is what
 * the separate list was meant to prevent.
 */

export type DayVentureTask = VentureTaskRow & {
  venture_id: string;
  venture_name: string;
};

export default function VentureTasksToday({
  tasks,
  dayIso,
  todayIso,
}: {
  tasks: DayVentureTask[];
  dayIso: string;
  todayIso: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  if (tasks.length === 0) return null;

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (!error) router.refresh();
  }

  const done = (t: DayVentureTask) =>
    run(() =>
      supabase
        .from("venture_tasks")
        .update({ status: "done", done_at: new Date().toISOString() })
        .eq("id", t.id)
    );

  // Sending it back is not the same as dropping it. The task returns to
  // its venture with everything intact; only the day is cleared.
  const putBack = (t: DayVentureTask) =>
    run(() => supabase.from("venture_tasks").update({ do_date: null }).eq("id", t.id));

  const ordered = sortVentureTasks(tasks, todayIso);

  return (
    <section className="grid gap-2">
      <h2 className="text-[0.8rem] uppercase tracking-wide text-[var(--faint)] m-0">
        From your ventures
      </h2>
      <ul className="grid gap-1.5 list-none p-0 m-0">
        {ordered.map((t) => {
          const overdue = t.due_on != null && t.due_on < todayIso;
          return (
            <li
              key={t.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
            >
              <span className="text-[0.84rem] leading-snug min-w-0 flex-1">
                {t.title}
                <Link
                  href={`/empire/${t.venture_id}#area-tasks`}
                  className="mono text-[0.66rem] ml-2 no-underline"
                  style={{ color: "var(--faint)" }}
                >
                  {t.venture_name}
                </Link>
                {overdue && (
                  <span className="mono text-[0.66rem] ml-2" style={{ color: "var(--bad)" }}>
                    OVERDUE {t.due_on}
                  </span>
                )}
              </span>
              <button
                className="chip tap shrink-0"
                disabled={busy}
                title="Send it back to the venture — nothing is lost"
                onClick={() => void putBack(t)}
              >
                Not today
              </button>
              <button className="chip tap shrink-0" disabled={busy} onClick={() => void done(t)}>
                Done
              </button>
            </li>
          );
        })}
      </ul>
      {dayIso !== todayIso && (
        <p className="text-[0.7rem] text-[var(--faint)]">
          Shown because these are dated {dayIso}.
        </p>
      )}
    </section>
  );
}
