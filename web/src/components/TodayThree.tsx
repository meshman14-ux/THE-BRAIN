"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/** Everything the row needs, resolved server-side — no lookups here. */
export type TodayItem = {
  id: string;
  title: string;
  areaLabel: string | null;
  system: "life" | "empire" | null;
  reason: string;
  done: boolean;
};

/**
 * Today's three, tickable. The list arrives already capped by `pickThree` —
 * this component renders what it is given and never re-expands it.
 */
export default function TodayThree({
  items,
  openTotal,
}: {
  items: TodayItem[];
  openTotal: number;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function toggle(t: TodayItem) {
    setBusy(t.id);
    await supabase
      .from("tasks")
      .update(
        t.done
          ? { status: "open", completed_at: null }
          : { status: "done", completed_at: new Date().toISOString() }
      )
      .eq("id", t.id);
    setBusy(null);
    router.refresh();
  }

  if (items.length === 0) {
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

  return (
    <div className="grid gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-3 ${
            t.system === "empire" ? "sys-empire" : "sys-life"
          }`}
          style={{ opacity: t.done ? 0.55 : 1 }}
        >
          <button
            aria-label={t.done ? `Reopen: ${t.title}` : `Done: ${t.title}`}
            disabled={busy === t.id}
            onClick={() => toggle(t)}
            className="shrink-0 w-6 h-6 rounded-[7px] border cursor-pointer mt-[1px]"
            style={{
              borderColor: t.done ? "var(--good)" : "var(--border-bright)",
              background: t.done ? "var(--good)" : "transparent",
              color: "var(--on-accent)",
            }}
          >
            {t.done ? "✓" : ""}
          </button>
          <div className="min-w-0 flex-1">
            <p
              className="text-[0.9rem] font-medium leading-snug"
              style={{
                textDecoration: t.done ? "line-through" : "none",
              }}
            >
              {t.title}
            </p>
            <p className="text-[0.72rem] text-[var(--faint)] mt-1">
              {t.areaLabel ?? "No area"} · {t.reason}
            </p>
          </div>
        </div>
      ))}
      <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
        Just three, surfaced for you —{" "}
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
