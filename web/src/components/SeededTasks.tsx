"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dismissedKeys, type SeedSuggestion } from "@/lib/diagnostics";

/**
 * The diagnostics' standing offer: things Jay said were wrong, offered back
 * as tasks. One tap adds; one tap declines, durably, into the run's own
 * `meta`. Nothing is ever created on his behalf — the finish screen's rule,
 * held here too.
 */
export default function SeededTasks({
  suggestions,
}: {
  suggestions: SeedSuggestion[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  if (suggestions.length === 0) return null;

  async function add(s: SeedSuggestion) {
    setBusy(s.key);
    await supabase.from("tasks").insert({
      title: s.title,
      priority: "High",
      status: "open",
      ...(s.pillarId ? { pillar_id: s.pillarId } : {}),
    });
    setBusy(null);
    // The created task's title is the dedup — the suggestion satisfies
    // itself on the next render, no bookkeeping row anywhere.
    router.refresh();
  }

  async function dismiss(s: SeedSuggestion) {
    setBusy(s.key);
    // Read-merge-write on the run's meta: dismissing one suggestion must
    // not clobber whatever else the jsonb holds.
    const { data } = await supabase
      .from("diagnostic_runs")
      .select("meta")
      .eq("id", s.runId)
      .maybeSingle();
    const meta =
      typeof data?.meta === "object" && data?.meta != null
        ? (data.meta as Record<string, unknown>)
        : {};
    const dismissed = new Set(dismissedKeys(meta));
    dismissed.add(s.key);
    await supabase
      .from("diagnostic_runs")
      .update({ meta: { ...meta, dismissed_suggestions: [...dismissed] } })
      .eq("id", s.runId);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="card p-4 grid gap-3">
      <div>
        <p className="label">From your diagnostics · {suggestions.length}</p>
        <p className="text-[0.72rem] text-[var(--faint)] mt-1 leading-relaxed">
          You named these yourself, in a triage. Add makes one a High task;
          dismiss retires it until a newer run says it again.
        </p>
      </div>
      <div className="grid gap-1.5">
        {suggestions.map((s) => (
          <div
            key={`${s.runId}:${s.key}`}
            className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] px-3 py-2"
            style={{ opacity: busy === s.key ? 0.6 : 1 }}
          >
            <p className="text-[0.8rem] leading-snug min-w-0 flex-1">
              {s.title}
            </p>
            <button
              className="chip shrink-0"
              disabled={busy != null}
              onClick={() => add(s)}
            >
              Add
            </button>
            <button
              className="shrink-0 text-[0.72rem] text-[var(--faint)] cursor-pointer bg-transparent border-0 p-0 font-[inherit]"
              disabled={busy != null}
              onClick={() => dismiss(s)}
              aria-label={`Dismiss: ${s.title}`}
            >
              dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
