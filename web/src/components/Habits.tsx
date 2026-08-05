"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Habit, HabitLog } from "@/lib/types";
import { habitRows, habitsDoneToday } from "@/lib/logic";

/**
 * The six daily habits, one tap each, with the streak where he can see it.
 *
 * Jay marked "Track your progress visually", so the streak is on the row —
 * not behind a click. The first three (make the bed, drink water, read a
 * page) are the morning wins he circled.
 *
 * Tapping is idempotent by construction: `habit_logs` has a primary key on
 * (habit_id, done_on), so the upsert is a no-op the second time rather than
 * a duplicate-key error. Tapping a ticked habit unticks it — a mis-tap that
 * cannot be undone would make him stop trusting the streak.
 */
export default function Habits({
  habits,
  logs,
  today,
}: {
  habits: Habit[];
  logs: HabitLog[];
  today: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = habitRows(habits, logs, today, 7);
  const { done, of } = habitsDoneToday(habits, logs, today);

  async function toggle(habitId: string, doneToday: boolean) {
    setBusy(habitId);
    setError(null);
    const { error: err } = doneToday
      ? await supabase
          .from("habit_logs")
          .delete()
          .eq("habit_id", habitId)
          .eq("done_on", today)
      : await supabase
          .from("habit_logs")
          .upsert(
            { habit_id: habitId, done_on: today },
            { onConflict: "habit_id,done_on" }
          );
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  if (habits.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-4 py-3.5">
        <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
          No habits set up. A habit is a thing you do daily whether or not it
          feels like a good idea that morning.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      <div className="flex items-baseline gap-3">
        <p className="mono text-[0.72rem] font-bold">
          {done}/{of}
        </p>
        <p className="text-[0.74rem] text-[var(--muted)]">
          {done === of
            ? "All of today's done."
            : done === 0
              ? "None ticked yet today."
              : `${of - done} left today.`}
        </p>
      </div>

      <div className="grid gap-1.5">
        {rows.map((r) => (
          <button
            key={r.habit.id}
            onClick={() => toggle(r.habit.id, r.doneToday)}
            disabled={busy === r.habit.id}
            aria-pressed={r.doneToday}
            className="rounded-[10px] border px-3 py-2.5 flex items-center gap-3 text-left card-hover disabled:opacity-60"
            style={{
              borderColor: r.doneToday ? "var(--good)" : "var(--border)",
              background: r.doneToday ? "var(--card-hover)" : "transparent",
            }}
          >
            {/* the tick */}
            <span
              aria-hidden
              className="w-[22px] h-[22px] rounded-[7px] shrink-0 flex items-center justify-center text-[0.72rem] font-bold"
              style={{
                border: `1.5px solid ${r.doneToday ? "var(--good)" : "var(--border-bright)"}`,
                background: r.doneToday ? "var(--good)" : "transparent",
                color: r.doneToday ? "var(--on-accent)" : "transparent",
              }}
            >
              ✓
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[0.84rem] font-medium leading-snug">
                {r.habit.name}
              </span>
              <span className="block text-[0.68rem] text-[var(--faint)] mt-0.5">
                {r.hits} of the last 7 days
              </span>
            </span>

            {/* seven dots — the visible progress he asked for */}
            <span className="flex gap-[3px] shrink-0" aria-hidden>
              {r.history.map((hit, i) => (
                <span
                  key={i}
                  className="w-[7px] h-[14px] rounded-[2px]"
                  style={{
                    background: hit ? "var(--good)" : "var(--bg-2)",
                    border: hit ? "none" : "1px solid var(--border)",
                  }}
                />
              ))}
            </span>

            <span
              className="mono text-[0.9rem] font-bold shrink-0 w-[2.2em] text-right"
              style={{
                color: r.streak > 0 ? "var(--good)" : "var(--faint)",
              }}
              title={`${r.streak}-day streak`}
            >
              {r.streak}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <p className="text-[0.74rem]" style={{ color: "var(--bad)" }}>
          Didn&apos;t save: {error}
        </p>
      )}
    </div>
  );
}
