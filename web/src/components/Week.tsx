"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Pillar, type Task, PRIORITY_COLOUR, DAY_LABELS } from "@/lib/types";
import { weekOffset, toIso, tasksOnDay, unscheduled } from "@/lib/logic";

export default function Week({
  tasks,
  pillars,
}: {
  tasks: Task[];
  pillars: Pillar[];
}) {
  const [offset, setOffset] = useState(0); // weeks from now
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const byId = Object.fromEntries(pillars.map((p) => [p.id, p]));

  const { dates, todayIso } = useMemo(() => {
    const now = new Date();
    return { dates: weekOffset(now, offset), todayIso: toIso(now) };
  }, [offset]);

  /** Assign or clear a do_date. Clicking the same day again unschedules. */
  async function setDay(t: Task, iso: string | null) {
    setBusy(true);
    await supabase
      .from("tasks")
      .update({ do_date: t.do_date === iso ? null : iso })
      .eq("id", t.id);
    setBusy(false);
    router.refresh();
  }

  const pool = unscheduled(tasks, dates);

  const Card = ({ t }: { t: Task }) => {
    const p = t.pillar_id ? byId[t.pillar_id] : null;
    return (
      <div className="rounded-[9px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2">
        <p className="text-[0.78rem] leading-snug font-medium">{t.title}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          {p && (
            <span className="text-[0.62rem] text-[var(--muted)] truncate">
              {p.emoji} {p.name}
            </span>
          )}
          <span
            className="text-[0.6rem] font-bold ml-auto shrink-0"
            style={{ color: PRIORITY_COLOUR[t.priority] }}
          >
            {t.priority.toUpperCase()}
          </span>
        </div>
        {/* seven-slot strip: tap a day to schedule */}
        <div className="flex gap-[3px] mt-2">
          {dates.map((iso, i) => {
            const active = t.do_date === iso;
            return (
              <button
                key={iso}
                onClick={() => setDay(t, iso)}
                disabled={busy}
                title={iso}
                className="flex-1 min-w-0 h-[19px] rounded-[5px] text-[9px] font-bold"
                style={{
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--on-accent)" : "var(--faint)",
                }}
              >
                {DAY_LABELS[i][0]}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-5">
      {/* week nav */}
      <div className="flex items-center gap-2">
        <button className="chip" onClick={() => setOffset(offset - 1)}>
          ‹ Prev
        </button>
        <button className="chip" onClick={() => setOffset(0)} data-active={offset === 0}>
          This week
        </button>
        <button className="chip" onClick={() => setOffset(offset + 1)}>
          Next ›
        </button>
        <span className="mono text-xs text-[var(--faint)] ml-auto">
          {dates[0]} → {dates[6]}
        </span>
      </div>

      {/* seven day columns */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        {dates.map((iso, i) => {
          const isToday = iso === todayIso;
          const cards = tasksOnDay(tasks, iso);
          return (
            <div
              key={iso}
              className="rounded-[11px] overflow-hidden border"
              style={{
                borderColor: isToday ? "var(--accent)" : "var(--border)",
                background: isToday ? "var(--accent-soft)" : "var(--bg-2)",
              }}
            >
              <div
                className="px-2.5 py-2 border-b border-[var(--border)]"
                style={
                  isToday
                    ? { background: "var(--accent)", color: "var(--on-accent)" }
                    : undefined
                }
              >
                <div className="text-[0.7rem] font-bold">{DAY_LABELS[i]}</div>
                <div className="mono text-[0.62rem] opacity-80">
                  {iso.slice(8)}/{iso.slice(5, 7)}
                </div>
              </div>
              <div className="p-1.5 grid gap-1.5 min-h-[70px]">
                {cards.map((t) => (
                  <Card key={t.id} t={t} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* unscheduled pool */}
      <section>
        <div className="flex items-baseline gap-3 mb-2.5">
          <p className="label">Unscheduled</p>
          <span className="mono text-xs text-[var(--faint)]">{pool.length}</span>
        </div>
        {pool.length === 0 ? (
          <p className="card px-4 py-3.5 text-sm text-[var(--faint)]">
            Everything open has a day. That&apos;s a planned week.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {pool.map((t) => (
              <Card key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
