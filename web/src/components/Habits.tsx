"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Habit, HabitLog } from "@/lib/types";
import { habitRows, habitsDoneToday } from "@/lib/logic";
import { keystoneHabit, trackedHabits, untrackedHabits } from "@/lib/season";

/**
 * One habit that counts, and the rest kept quietly.
 *
 * Six checkboxes was the honest reason the board stopped being used: six
 * ways to fail every morning, and a score that was almost never full. Lally
 * (2010) found habits form one at a time and take far longer than the folk
 * "21 days"; six simultaneous starts is six unformed habits, not six habits.
 *
 * So the board now has a KEYSTONE — the single habit the system leads with
 * — and everything else is still active and still worth doing, but is no
 * longer scored. "Keep doing them; stop counting them." Untracked habits
 * are shown below, tickable, with no streak and no place in the fraction,
 * and either state is one tap away from the other.
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
  const [showRest, setShowRest] = useState(false);

  const counted = trackedHabits(habits);
  const quiet = untrackedHabits(habits);
  const keystone = keystoneHabit(habits);

  // The fraction is over the habits that count, so it is achievable. A
  // score you can actually finish is the only kind worth showing.
  const rows = habitRows(counted, logs, today, 7);
  const quietRows = habitRows(quiet, logs, today, 7);
  const { done, of } = habitsDoneToday(counted, logs, today);

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

  /** Move a habit between counted and quiet. Nothing is deleted either way. */
  async function setTracked(habitId: string, tracked: boolean) {
    setBusy(habitId);
    setError(null);
    const { error: err } = await supabase
      .from("habits")
      .update({ tracked })
      .eq("id", habitId);
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

  const row = (
    r: (typeof rows)[number],
    opts: { scored: boolean; keystone: boolean }
  ) => (
    <div
      key={r.habit.id}
      className="rounded-[10px] border flex items-center gap-3"
      style={{
        borderColor: r.doneToday
          ? "var(--good)"
          : opts.keystone
            ? "var(--accent)"
            : "var(--border)",
        background: r.doneToday ? "var(--card-hover)" : "transparent",
      }}
    >
      <button
        onClick={() => toggle(r.habit.id, r.doneToday)}
        disabled={busy === r.habit.id}
        aria-pressed={r.doneToday}
        className="px-3 py-2.5 flex items-center gap-3 text-left card-hover disabled:opacity-60 flex-1 min-w-0 bg-transparent border-0"
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
          <span
            className="block font-medium leading-snug"
            style={{ fontSize: opts.keystone ? "0.95rem" : "0.84rem" }}
          >
            {r.habit.name}
            {opts.keystone && (
              <span
                className="text-[0.6rem] font-bold tracking-[0.12em] ml-2 align-middle"
                style={{ color: "var(--accent)" }}
              >
                KEYSTONE
              </span>
            )}
          </span>
          <span className="block text-[0.68rem] text-[var(--faint)] mt-0.5">
            {opts.scored
              ? `${r.hits} of the last 7 days`
              : "kept, not counted"}
          </span>
        </span>

        {opts.scored && (
          <>
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
              style={{ color: r.streak > 0 ? "var(--good)" : "var(--faint)" }}
              title={`${r.streak}-day streak`}
            >
              {r.streak}
            </span>
          </>
        )}
      </button>

      {/* Counted / quiet, one tap, never a delete. */}
      <button
        onClick={() => setTracked(r.habit.id, !opts.scored)}
        disabled={busy === r.habit.id}
        className="text-[0.62rem] font-semibold tracking-[0.08em] uppercase px-2.5 py-1 mr-2 rounded-[6px] border shrink-0 disabled:opacity-60"
        style={{
          borderColor: "var(--border)",
          color: "var(--faint)",
          background: "transparent",
        }}
        title={
          opts.scored
            ? "Keep doing it, stop scoring it"
            : "Start counting this one again"
        }
      >
        {opts.scored ? "Stop counting" : "Count"}
      </button>
    </div>
  );

  const keystoneRow = keystone
    ? rows.find((r) => r.habit.id === keystone.id)
    : undefined;
  const others = rows.filter((r) => r.habit.id !== keystone?.id);

  return (
    <div className="grid gap-2.5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <p className="mono text-[0.72rem] font-bold">
          {done}/{of}
        </p>
        <p className="text-[0.74rem] text-[var(--muted)]">
          {of === 0
            ? "Nothing is being counted — every habit is kept quietly."
            : done === of
              ? "All of today's done."
              : done === 0
                ? "None ticked yet today."
                : `${of - done} left today.`}
        </p>
      </div>

      <div className="grid gap-1.5">
        {keystoneRow && row(keystoneRow, { scored: true, keystone: true })}
        {others.map((r) => row(r, { scored: true, keystone: false }))}
      </div>

      {quiet.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setShowRest((s) => !s)}
            className="text-[0.72rem] text-[var(--faint)] bg-transparent border-0 p-0 cursor-pointer"
            aria-expanded={showRest}
          >
            {showRest ? "▾" : "▸"} {quiet.length} kept, not counted
          </button>
          {showRest && (
            <>
              <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed mt-2 mb-2">
                Still worth doing, still tickable — just not scored, so they
                cannot make the day look like a failure. Habits form one at a
                time.
              </p>
              <div className="grid gap-1.5">
                {quietRows.map((r) =>
                  row(r, { scored: false, keystone: false })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-[0.74rem]" style={{ color: "var(--bad)" }}>
          Didn&apos;t save: {error}
        </p>
      )}
    </div>
  );
}
