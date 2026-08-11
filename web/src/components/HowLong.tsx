"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { actualOptions } from "@/lib/planner";

/**
 * The one-tap "how long?" ask that follows marking a task done.
 *
 * This is the only capture path for `tasks.actual_min`, and it exists because
 * the calibration multiplier is impossible without the second number — the
 * column would stay empty forever and the planner's estimate correction would
 * never activate. The ask never blocks the done write: the task is already
 * done by the time this renders, so ignoring it costs nothing and writes
 * nothing. Skip dismisses without writing — NULL, never zero.
 *
 * With an estimate the chips bracket it (half · planned · 1.5× · 2×) so the
 * answer is a ratio; without one they are plain durations. Either way it is
 * one tap, matching the venture-onboarder discipline everywhere else.
 */
export default function HowLong({
  taskId,
  durationMin,
  onSettled,
}: {
  taskId: string;
  durationMin: number | null | undefined;
  /** Called after a chip writes or skip dismisses — the parent hides the ask. */
  onSettled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function record(minutes: number) {
    setBusy(true);
    await supabase
      .from("tasks")
      .update({ actual_min: minutes })
      .eq("id", taskId);
    setBusy(false);
    onSettled();
    router.refresh();
  }

  const planned = typeof durationMin === "number" && durationMin > 0;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-dashed border-[var(--border-bright)] px-3 py-2"
      role="group"
      aria-label="How long did it take?"
    >
      <span className="text-[0.72rem] text-[var(--muted)] mr-1">
        How long?
      </span>
      {actualOptions(durationMin).map((m) => (
        <button
          key={m}
          className="chip"
          disabled={busy}
          onClick={() => record(m)}
        >
          {planned && m === durationMin ? `as planned · ${m}m` : `${m}m`}
        </button>
      ))}
      <button
        className="text-[0.72rem] text-[var(--faint)] ml-auto"
        disabled={busy}
        onClick={onSettled}
        aria-label="Skip recording how long it took"
      >
        skip
      </button>
    </div>
  );
}
