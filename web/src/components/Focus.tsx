"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PriorityMark } from "./ui";
import HowLong from "./HowLong";

/** Everything a row needs, resolved server-side — no lookups here. */
export type FocusItem = {
  id: string;
  title: string;
  areaLabel: string | null;
  system: "life" | "empire" | null;
  reason: string;
  priority: "High" | "Med" | "Low";
  done: boolean;
  durationMin: number | null;
};

/**
 * Focus: three visible, two on deck behind a drawer.
 *
 * The three are today. The two are the answer to "and then what?", which is
 * a question Jay asks at a different moment and should not have to read past
 * the three to reach. Rendering five would make it a list, and the dashboard
 * exists to not be a list — so the drawer starts closed and the two never
 * appear beside the three.
 *
 * Priority rides channel 3 and has no colour: `PriorityMark` fills a dot and
 * `.prio` thickens the left bar, both from currentColor. That is what lets a
 * row carry an overdue status AND a High priority without either mark
 * becoming ambiguous.
 */
export default function Focus({
  visible,
  onDeck,
  openTotal,
  beyond,
}: {
  visible: FocusItem[];
  onDeck: FocusItem[];
  openTotal: number;
  beyond: number;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // The task whose "how long?" ask is showing. One at a time: finishing a
  // second task moves the ask rather than stacking prompts.
  const [asking, setAsking] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function toggle(t: FocusItem) {
    setBusy(t.id);
    await supabase
      .from("tasks")
      .update(
        t.done
          ? // Reopening un-finishes the task, so the recorded time goes with
            // it — a partial figure would poison the multiplier.
            { status: "open", completed_at: null, actual_min: null }
          : { status: "done", completed_at: new Date().toISOString() }
      )
      .eq("id", t.id);
    setBusy(null);
    setAsking(t.done ? null : t.id);
    router.refresh();
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-4 py-3.5">
        <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
          Nothing open, so nothing surfaced. Capture what is on your mind and
          the system will hand three of them back — never more.
        </p>
        <Link
          href="/capture"
          className="inline-block mt-2.5 text-[0.78rem] font-semibold no-underline"
          style={{ color: "var(--accent)" }}
        >
          Capture a thought →
        </Link>
      </div>
    );
  }

  const row = (t: FocusItem, dim: boolean) => (
    <div key={t.id} className="grid gap-1.5">
    <div
      data-p={t.priority}
      className={`prio flex items-start gap-3 rounded-[10px] border border-[var(--border)] pr-3.5 py-3 ${
        t.system === "empire" ? "sys-empire" : "sys-life"
      }`}
      style={{ opacity: t.done ? 0.55 : dim ? 0.8 : 1, color: "var(--sys)" }}
    >
      <button
        aria-label={t.done ? `Reopen: ${t.title}` : `Done: ${t.title}`}
        disabled={busy === t.id}
        onClick={() => toggle(t)}
        className={`shrink-0 w-6 h-6 rounded-[7px] border cursor-pointer mt-[1px]${
          t.done ? " pop lit" : ""
        }`}
        style={{
          borderColor: t.done ? "var(--good)" : "var(--border-bright)",
          background: t.done ? "var(--good)" : "transparent",
          color: "var(--on-accent)",
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      >
        {t.done ? "✓" : ""}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className="text-[0.9rem] font-medium leading-snug text-[var(--text)]"
          style={{ textDecoration: t.done ? "line-through" : "none" }}
        >
          {t.title}
        </p>
        <p className="text-[0.72rem] text-[var(--faint)] mt-1 flex items-center gap-1.5">
          <PriorityMark priority={t.priority} />
          <span>
            {t.areaLabel ?? "No area"} · {t.reason}
          </span>
        </p>
      </div>
    </div>
    {asking === t.id && t.done && (
      <HowLong
        taskId={t.id}
        durationMin={t.durationMin}
        onSettled={() => setAsking(null)}
      />
    )}
    </div>
  );

  return (
    <div className="grid gap-2">
      {visible.map((t) => row(t, false))}

      {onDeck.length > 0 && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="chip self-start"
            data-active={open ? "true" : "false"}
          >
            {open ? "Hide" : "And then"} · {onDeck.length} on deck
          </button>
          {open && (
            <div className="grid gap-2 pl-3 border-l border-dashed border-[var(--border-bright)]">
              <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
                Not today. This is what the three become when one of them is
                finished.
              </p>
              {onDeck.map((t) => row(t, true))}
            </div>
          )}
        </>
      )}

      <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
        Three surfaced{beyond > 0 ? `, ${beyond} more not shown` : ""} —{" "}
        <Link
          href="/planner"
          className="font-semibold no-underline"
          style={{ color: "var(--accent)" }}
        >
          {openTotal} open in Tasks →
        </Link>
      </p>
    </div>
  );
}
