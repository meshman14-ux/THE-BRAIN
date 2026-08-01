"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * One tap, one log. The streak itself is derived from habit_logs by
 * `currentStreak` on the server — nothing is stored that could go stale.
 */
export default function TrainToday({
  habitId,
  today,
  loggedToday,
}: {
  habitId: string;
  today: string;
  loggedToday: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function log() {
    setBusy(true);
    // Upsert on the (habit_id, done_on) primary key — tapping twice is a no-op.
    await supabase
      .from("habit_logs")
      .upsert({ habit_id: habitId, done_on: today }, { onConflict: "habit_id,done_on" });
    setBusy(false);
    router.refresh();
  }

  if (loggedToday) {
    return (
      <p className="text-[0.7rem] font-semibold mt-1.5" style={{ color: "var(--good)" }}>
        ✓ Trained today
      </p>
    );
  }

  return (
    <button
      className="chip mt-1.5"
      onClick={log}
      disabled={busy}
      style={{ color: "var(--accent)" }}
    >
      {busy ? "…" : "Trained today?"}
    </button>
  );
}
