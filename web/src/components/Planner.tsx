"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type Pillar,
  type Task,
  type Priority,
  LANES,
  PRIORITY_COLOUR,
} from "@/lib/types";
import { LANE_ORDER, nextStatus, laneTasks } from "@/lib/logic";

export default function Planner({
  tasks,
  pillars,
}: {
  tasks: Task[];
  pillars: Pillar[];
}) {
  const [filter, setFilter] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<string>("");
  const [prio, setPrio] = useState<Priority>("Med");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const byId = Object.fromEntries(pillars.map((p) => [p.id, p]));
  const visible =
    filter === "all" ? tasks : tasks.filter((t) => t.pillar_id === filter);

  // Only offer area chips for areas that actually have tasks — keeps it quiet.
  const used = pillars.filter((p) => tasks.some((t) => t.pillar_id === p.id));

  async function move(t: Task, dir: 1 | -1) {
    const next = nextStatus(t.status, dir);
    if (next === t.status) return;
    setBusy(true);
    await supabase
      .from("tasks")
      .update({
        status: next,
        completed_at: next === "done" ? new Date().toISOString() : null,
      })
      .eq("id", t.id);
    setBusy(false);
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("tasks").insert({
      title: v,
      pillar_id: area || null,
      priority: prio,
      status: "open",
    });
    if (error) setErr(error.message);
    setTitle("");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      {/* add a task */}
      <form onSubmit={add} className="card p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
        <input
          className="input"
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="input sm:w-auto"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          aria-label="Area"
        >
          <option value="">No area</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name}
            </option>
          ))}
        </select>
        <select
          className="input sm:w-auto"
          value={prio}
          onChange={(e) => setPrio(e.target.value as Priority)}
          aria-label="Priority"
        >
          <option value="High">High</option>
          <option value="Med">Med</option>
          <option value="Low">Low</option>
        </select>
        <button className="btn" type="submit" disabled={busy || !title.trim()}>
          Add
        </button>
      </form>
      {err && <p className="text-sm text-[var(--bad)]">⚠ {err}</p>}

      {/* area filter */}
      {used.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            className="chip"
            data-active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          {used.map((p) => (
            <button
              key={p.id}
              className="chip"
              data-active={filter === p.id}
              onClick={() => setFilter(p.id)}
            >
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
      )}

      {/* three lanes */}
      <div className="grid gap-3 md:grid-cols-3">
        {LANES.map((lane) => {
          const cards = laneTasks(visible, lane.key);
          return (
            <div key={lane.key} className="card overflow-hidden">
              <div
                className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2"
                style={{ borderTop: `3px solid ${lane.colour}` }}
              >
                <span className="font-semibold text-sm">{lane.label}</span>
                <span className="mono text-xs text-[var(--faint)] ml-auto">
                  {cards.length}
                </span>
              </div>

              <div className="p-2.5 grid gap-2 min-h-[80px]">
                {cards.length === 0 && (
                  <p className="text-xs text-[var(--faint)] px-2 py-3">
                    Nothing here.
                  </p>
                )}
                {cards.map((t) => {
                  const p = t.pillar_id ? byId[t.pillar_id] : null;
                  const i = LANE_ORDER.indexOf(t.status);
                  const done = t.status === "done";
                  return (
                    <div
                      key={t.id}
                      className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5"
                      style={done ? { opacity: 0.62 } : undefined}
                    >
                      <p
                        className="text-[0.86rem] leading-snug font-medium"
                        style={
                          done
                            ? {
                                textDecoration: "line-through",
                                color: "var(--faint)",
                              }
                            : undefined
                        }
                      >
                        {t.title}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        {p && (
                          <span className="text-[0.68rem] text-[var(--muted)]">
                            {p.emoji} {p.name}
                          </span>
                        )}
                        <span
                          className="text-[0.64rem] font-bold ml-auto"
                          style={{ color: PRIORITY_COLOUR[t.priority] }}
                        >
                          {t.priority.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border)]">
                        <button
                          className="text-[0.7rem] font-semibold text-[var(--muted)] disabled:opacity-0"
                          onClick={() => move(t, -1)}
                          disabled={busy || i === 0}
                        >
                          ‹ Back
                        </button>
                        <button
                          className="text-[0.7rem] font-semibold ml-auto"
                          style={{
                            color: i < 2 ? "var(--accent)" : "var(--good)",
                          }}
                          onClick={() => move(t, 1)}
                          disabled={busy || i === 2}
                        >
                          {i === 0 ? "Start ›" : i === 1 ? "Done ›" : "✓ Done"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
