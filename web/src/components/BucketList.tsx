"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Goal } from "@/lib/types";
import { somedayGoals, HORIZON_LABEL } from "@/lib/logic";

/**
 * The bucket list, and the moment that justifies it existing here.
 *
 * A bucket-list item is a goal with `status = 'someday'` — no date, no plan.
 * Promoting one is a single field change back to `active`, which is exactly
 * why this lives in `goals` and not in a notes app: the thing you wrote down
 * years ago becomes the thing you are actually doing without being retyped,
 * and it keeps its id, its area and anything already hung off it.
 */
export default function BucketList({ goals }: { goals: Goal[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [date, setDate] = useState("");

  const items = somedayGoals(goals);

  async function add() {
    const t = title.trim();
    if (t === "") return;
    setBusy("add");
    setError(null);
    const { error: err } = await supabase
      .from("goals")
      .insert({ title: t, status: "someday", progress: 0 });
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    setTitle("");
    router.refresh();
  }

  /**
   * The promotion. Status is the only field that has to change — a date is
   * offered because deciding "by when" is usually the same thought, but an
   * item can be promoted without one and simply sits in the undated list.
   */
  async function promote(id: string) {
    setBusy(id);
    setError(null);
    const patch: Record<string, unknown> = { status: "active" };
    if (date !== "") patch.target_date = date;
    const { error: err } = await supabase.from("goals").update(patch).eq("id", id);
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    setPromoting(null);
    setDate("");
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    const { error: err } = await supabase
      .from("goals")
      .update({ status: "dropped" })
      .eq("id", id);
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Something you want to do before you die"
          aria-label="Add to the bucket list"
        />
        <button
          className="btn shrink-0"
          onClick={add}
          disabled={busy === "add" || title.trim() === ""}
        >
          {busy === "add" ? "…" : "Add"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-4 py-3.5">
          <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
            Nothing on the list yet. A bucket-list item is a goal with no date
            and no plan — write it down now, decide when later. The point of
            keeping it here rather than in a notebook is that promoting one
            into a real goal takes a single tap.
          </p>
        </div>
      ) : (
        <div className="grid gap-1.5">
          {items.map((g) => (
            <div
              key={g.id}
              className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[0.84rem] font-medium min-w-0 flex-1">
                  {g.title}
                </span>
                <span className="flex gap-1.5 shrink-0">
                  <button
                    className="chip"
                    onClick={() =>
                      setPromoting(promoting === g.id ? null : g.id)
                    }
                    disabled={busy === g.id}
                    style={{ color: "var(--accent)" }}
                  >
                    Promote →
                  </button>
                  <button
                    className="chip"
                    onClick={() => remove(g.id)}
                    disabled={busy === g.id}
                    title="Off the list"
                  >
                    ×
                  </button>
                </span>
              </div>

              {promoting === g.id && (
                <div className="mt-2.5 pt-2.5 border-t border-[var(--border)] grid gap-2">
                  <p className="text-[0.74rem] text-[var(--muted)] leading-relaxed">
                    This becomes a live goal. Give it a date if you have one —
                    it will file itself under the right horizon. Without one it
                    joins the undated list, which is honest: you have decided
                    to do it, not when.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="date"
                      className="input flex-1 min-w-[150px]"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      aria-label="Target date"
                    />
                    <button
                      className="btn shrink-0"
                      onClick={() => promote(g.id)}
                      disabled={busy === g.id}
                    >
                      {busy === g.id ? "…" : "Make it a goal"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[0.74rem]" style={{ color: "var(--bad)" }}>
          Didn&apos;t save: {error}
        </p>
      )}

      <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
        {items.length > 0 && `${items.length} on the list. `}
        These sit under <b>{HORIZON_LABEL.someday}</b> — the one horizon with
        no deadline attached to it.
      </p>
    </div>
  );
}
