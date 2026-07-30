"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { InboxItem, Pillar } from "@/lib/types";
import { taskTitleFromCapture, noteFromCapture } from "@/lib/logic";

type Props = { items: InboxItem[]; pillars: Pillar[] };

export default function Triage({ items, pillars }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function route(
    item: InboxItem,
    kind: "task" | "note",
    pillarId: string | null
  ) {
    setBusyId(item.id);
    setErr("");

    const table = kind === "task" ? "tasks" : "notes";
    const payload: Record<string, unknown> =
      kind === "task"
        ? { title: taskTitleFromCapture(item.raw_text), pillar_id: pillarId }
        : { ...noteFromCapture(item.raw_text), pillar_id: pillarId };

    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      setErr(error.message);
      setBusyId(null);
      return;
    }

    await supabase
      .from("inbox")
      .update({
        status: "routed",
        triaged_at: new Date().toISOString(),
        routed_type: kind,
        routed_id: data.id,
      })
      .eq("id", item.id);

    setBusyId(null);
    setOpenId(null);
    router.refresh();
  }

  async function discard(item: InboxItem) {
    setBusyId(item.id);
    await supabase
      .from("inbox")
      .update({ status: "discarded", triaged_at: new Date().toISOString() })
      .eq("id", item.id);
    setBusyId(null);
    router.refresh();
  }

  if (!items.length) {
    return (
      <div className="card p-9 text-center">
        <div className="text-4xl mb-3">✨</div>
        <p className="font-semibold">Inbox zero</p>
        <p className="text-sm text-[var(--muted)] mt-2">
          Nothing waiting. That&apos;s the state to keep it in.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {err && <p className="text-sm text-[var(--bad)]">⚠ {err}</p>}

      {items.map((item) => {
        const open = openId === item.id;
        const busy = busyId === item.id;
        return (
          <div key={item.id} className="card p-4">
            <p className="text-[0.94rem] leading-relaxed whitespace-pre-wrap">
              {item.raw_text}
            </p>
            <p className="text-xs text-[var(--faint)] mt-2">
              {new Date(item.captured_at).toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>

            {!open ? (
              <div className="flex flex-wrap gap-2 mt-3.5">
                <button
                  className="btn text-sm py-2 px-3.5"
                  onClick={() => setOpenId(item.id)}
                  disabled={busy}
                >
                  Make it a task
                </button>
                <button
                  className="btn btn-ghost text-sm py-2 px-3.5"
                  onClick={() => route(item, "note", null)}
                  disabled={busy}
                >
                  Keep as note
                </button>
                <button
                  className="btn btn-ghost text-sm py-2 px-3.5 ml-auto"
                  onClick={() => discard(item)}
                  disabled={busy}
                >
                  Bin
                </button>
              </div>
            ) : (
              <div className="mt-3.5 border-t border-[var(--border)] pt-3.5">
                <p className="label mb-2.5">Which area? (optional)</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className="chip hover:text-[var(--text)]"
                    onClick={() => route(item, "task", null)}
                    disabled={busy}
                  >
                    none
                  </button>
                  {pillars.map((p) => (
                    <button
                      key={p.id}
                      className="chip hover:text-[var(--text)]"
                      style={{
                        borderColor:
                          p.system === "life"
                            ? "var(--life-dim)"
                            : "var(--empire-dim)",
                      }}
                      onClick={() => route(item, "task", p.id)}
                      disabled={busy}
                    >
                      {p.emoji} {p.name}
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-ghost text-sm py-2 px-3.5 mt-3"
                  onClick={() => setOpenId(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
