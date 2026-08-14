"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  HOUR_PURPOSES,
  PURPOSE_LABEL,
  PURPOSE_INITIAL,
  PURPOSE_COLOUR,
  DAY_LABELS,
} from "@/lib/types";
import {
  DAY_HOURS,
  hourKey,
  hourLabel,
  readHours,
  assignHour,
  nextPurpose,
  hourStats,
  purposeSplit,
  type HourMap,
} from "@/lib/logic";

export type JournalDay = { entry_date: string; meta: Record<string, unknown> | null };

/**
 * Give every hour a purpose — the third point of "Use Your Time More
 * Intentionally", which Jay marked Yes.
 *
 * Labels live in `journal.meta.hours` for the day: per-day annotation on a
 * row that already exists per day. No new table, exactly as decision 5
 * keeps `meta` for.
 *
 * The line it exists to render is his book's, not ours: unassigned hours
 * invite distraction. It is stated once, plainly, and never nagged.
 */
export default function HourPurposeGrid({
  dates,
  todayIso,
  journal,
}: {
  dates: string[];
  todayIso: string;
  journal: JournalDay[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  // The day being edited: today when it is in view, otherwise the Monday.
  const [day, setDay] = useState<string>(
    dates.includes(todayIso) ? todayIso : dates[0]
  );
  const active = dates.includes(day) ? day : dates[0];

  // Locally applied edits, so a tap lands instantly and the strip does not
  // wait on a round trip. The server row stays the source of truth.
  const [pending, setPending] = useState<Record<string, HourMap>>({});

  const stored = useMemo(() => {
    const out: Record<string, HourMap> = {};
    for (const d of dates) {
      const row = journal.find((j) => j.entry_date === d);
      out[d] = readHours(row?.meta);
    }
    return out;
  }, [dates, journal]);

  const hoursFor = (d: string): HourMap => pending[d] ?? stored[d] ?? {};

  const dayHours = hoursFor(active);
  const stats = hourStats(dayHours);
  const week = purposeSplit(dates.map((d) => hoursFor(d)));

  async function cycle(hour: number) {
    const current = dayHours[hourKey(hour)] ?? null;
    const next = assignHour(dayHours, hour, nextPurpose(current));
    setPending((p) => ({ ...p, [active]: next }));
    setBusy(true);
    // Upsert on the (user_id, entry_date) unique key. `meta` is merged in
    // the client rather than in SQL because the row may not exist yet, and
    // a jsonb merge cannot create the row it merges into.
    const row = journal.find((j) => j.entry_date === active);
    const meta = { ...(row?.meta ?? {}), hours: next };
    const { error } = await supabase
      .from("journal")
      .upsert({ entry_date: active, meta }, { onConflict: "user_id,entry_date" });
    setBusy(false);
    if (error) {
      // Put the strip back where it was rather than showing a label that
      // was never saved.
      setPending((p) => {
        const copy = { ...p };
        delete copy[active];
        return copy;
      });
      return;
    }
    router.refresh();
  }

  const dayIndex = dates.indexOf(active);

  return (
    <section className="card p-4 sm:p-5 grid gap-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="label">Give every hour a purpose</h2>
        <span className="text-[0.7rem] text-[var(--faint)]">
          this week · tap an hour to cycle it
        </span>
      </div>

      {/* -- which day ---------------------------------------------- */}
      <div className="flex gap-1.5 flex-wrap">
        {dates.map((d, i) => {
          const s = hourStats(hoursFor(d));
          return (
            <button
              key={d}
              className="chip"
              data-active={d === active}
              onClick={() => setDay(d)}
              title={`${d} · ${s.assigned} of ${s.total} hours assigned`}
            >
              {DAY_LABELS[i]}
              {d === todayIso && (
                <span className="ml-1" aria-label="today">
                  ·
                </span>
              )}
              <span className="mono ml-1 text-[0.6rem] opacity-70">
                {s.assigned}
              </span>
            </button>
          );
        })}
      </div>

      {/* -- the hour strip ------------------------------------------ */}
      <div className="grid gap-1.5 grid-cols-4 sm:grid-cols-8">
        {DAY_HOURS.map((h) => {
          const p = dayHours[hourKey(h)] ?? null;
          return (
            <button
              key={h}
              onClick={() => cycle(h)}
              disabled={busy}
              aria-label={`${hourLabel(h)} — ${p ? PURPOSE_LABEL[p] : "no purpose set"}`}
              className="rounded-[9px] px-1 py-2 flex flex-col items-center gap-1 disabled:opacity-60"
              style={{
                border: `1px solid ${p ? PURPOSE_COLOUR[p] : "var(--border)"}`,
                background: p ? PURPOSE_COLOUR[p] : "transparent",
                color: p ? "var(--on-accent)" : "var(--faint)",
              }}
            >
              <span className="mono text-[0.62rem] font-bold leading-none">
                {hourKey(h)}
              </span>
              <span className="text-[0.6rem] font-bold leading-none">
                {p ? PURPOSE_INITIAL[p] : "·"}
              </span>
            </button>
          );
        })}
      </div>

      {/* -- the day's honest line ----------------------------------- */}
      <div className="grid gap-1">
        <p className="text-[0.82rem] leading-relaxed">
          <b className="mono">
            {stats.assigned}/{stats.total}
          </b>{" "}
          hours have a purpose on{" "}
          {dayIndex >= 0 ? DAY_LABELS[dayIndex] : active}
          {active === todayIso ? " (today)" : ""}.{" "}
          {stats.unassigned === 0 ? (
            <span style={{ color: "var(--good)" }}>
              The whole day is spoken for.
            </span>
          ) : (
            <span className="text-[var(--muted)]">
              {stats.unassigned} unassigned. Unassigned hours invite
              distraction.
            </span>
          )}
        </p>
      </div>

      {/* -- the key, doubling as the week's split ------------------- */}
      <div className="grid gap-2">
        <div className="flex items-baseline gap-3">
          <p className="label">This week by label</p>
          <span className="mono text-[0.68rem] text-[var(--faint)]">
            {week.assigned}/{week.total} h
          </span>
          {week.leader && (
            <span className="text-[0.7rem] text-[var(--muted)] ml-auto">
              mostly {PURPOSE_LABEL[week.leader].toLowerCase()}
            </span>
          )}
        </div>

        {/* One stacked bar: proportion is the whole point. */}
        <div
          className="flex w-full h-[10px] rounded-full overflow-hidden border border-[var(--border)] bg-[var(--bg-2)]"
          role="presentation"
        >
          {HOUR_PURPOSES.map((p) =>
            week.counts[p] > 0 && week.total > 0 ? (
              <div
                key={p}
                style={{
                  width: `${(week.counts[p] / week.total) * 100}%`,
                  background: PURPOSE_COLOUR[p],
                }}
                title={`${PURPOSE_LABEL[p]} · ${week.counts[p]}h`}
              />
            ) : null
          )}
        </div>

        <div className="flex gap-x-3.5 gap-y-1 flex-wrap">
          {HOUR_PURPOSES.map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="w-[9px] h-[9px] rounded-[3px] shrink-0"
                style={{ background: PURPOSE_COLOUR[p] }}
              />
              <span className="text-[0.72rem] text-[var(--muted)]">
                {PURPOSE_LABEL[p]}
              </span>
              <span className="mono text-[0.66rem] text-[var(--faint)]">
                {week.counts[p]}h
              </span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="w-[9px] h-[9px] rounded-[3px] shrink-0 border border-[var(--border-bright)]"
            />
            <span className="text-[0.72rem] text-[var(--faint)]">
              Unassigned
            </span>
            <span className="mono text-[0.66rem] text-[var(--faint)]">
              {week.unassigned}h
            </span>
          </span>
        </div>
      </div>

      <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
        {DAY_HOURS.length} waking hours a day, 06:00–22:00. Labelling is
        intention, not a rigid schedule — an hour marked rest counts as much
        as one marked work.
      </p>
    </section>
  );
}
