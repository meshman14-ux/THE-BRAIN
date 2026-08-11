"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Pillar, Task } from "@/lib/types";
import {
  DAY_END_MIN,
  DAY_START_MIN,
  SLOT_MIN,
  type Calibration,
  capacityOf,
  clashing,
  correctedEstimate,
  dayLayout,
  dayLoad,
  durationOf,
  firstFreeSlot,
  formatDuration,
  placementFor,
  slotStarts,
  toHHMM,
  withLanes,
} from "@/lib/planner";

/**
 * The day planner — give a task a time by dropping it on one.
 *
 * Two ways in, on purpose. Dragging is the nice one and works with a mouse;
 * **tap the task, then tap a slot** is the one that works on a phone, and
 * this is a phone-first system, so the tap path is the primary interaction
 * and drag is the enhancement. HTML5 drag events do not fire on touch, and
 * a planner only usable at a desk would be a planner used once.
 *
 * What a drop writes is `meta.time` — the exact field the Google pull has
 * always written and the push has always read. So a task given a slot here
 * leaves for the calendar as a timed event through the sync that already
 * exists, with no new path and no second source of truth.
 *
 * Clashes are drawn side by side and outlined, never resolved. Two things
 * booked at once is a fact about the day; moving one is Jay's call.
 */

/** How tall half an hour is. The whole grid is derived from this. */
const PX_PER_SLOT = 27;
const PX_PER_MIN = PX_PER_SLOT / SLOT_MIN;

export default function DayPlanner({
  dayIso,
  dayLabel,
  tasks,
  pillars,
  calibration,
}: {
  dayIso: string;
  dayLabel: string;
  /** Open work for this day plus the unscheduled pool the caller chose. */
  tasks: Task[];
  pillars: Pillar[];
  calibration: Calibration;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const byId = useMemo(
    () => Object.fromEntries(pillars.map((p) => [p.id, p])),
    [pillars]
  );

  const { placed, unplaced } = useMemo(() => dayLayout(tasks, dayIso), [tasks, dayIso]);
  const laned = useMemo(() => withLanes(placed), [placed]);
  const clashes = useMemo(() => clashing(placed), [placed]);
  const load = useMemo(() => dayLoad(placed), [placed]);
  const cap = useMemo(() => capacityOf(load.totalMin), [load.totalMin]);

  /** The pool: this day's untimed work, plus anything with no day at all. */
  const pool = useMemo(
    () => [...unplaced, ...tasks.filter((t) => t.do_date == null)],
    [unplaced, tasks]
  );

  const pickedTask = picked ? tasks.find((t) => t.id === picked) ?? null : null;

  /** Write a slot. Also sets do_date, so placing a loose task schedules it. */
  async function place(taskId: string, startMin: number) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    const time = placementFor(startMin, durationOf(t));
    if (!time) {
      setNote("That task is longer than the planner's day — shorten it first.");
      return;
    }
    setBusy(true);
    setNote("");
    const meta = { ...((t.meta as Record<string, unknown>) ?? {}), time };
    const { error } = await supabase
      .from("tasks")
      .update({ meta, do_date: dayIso })
      .eq("id", taskId);
    setBusy(false);
    setPicked(null);
    if (error) setNote("That didn't save — try again.");
    else router.refresh();
  }

  /** Take a task off the clock but leave it on the day. */
  async function unplace(t: Task) {
    setBusy(true);
    const meta = { ...((t.meta as Record<string, unknown>) ?? {}) };
    delete meta.time;
    const { error } = await supabase.from("tasks").update({ meta }).eq("id", t.id);
    setBusy(false);
    if (error) setNote("That didn't save — try again.");
    else router.refresh();
  }

  async function setDuration(t: Task, minutes: number | null) {
    setBusy(true);
    const patch: Record<string, unknown> = { duration_min: minutes };
    // A block already on the clock must keep its start and change its end,
    // otherwise editing the length silently moves the appointment.
    const existing = (t.meta as { time?: { start?: string } } | null)?.time;
    if (existing?.start) {
      const startMin =
        Number(existing.start.slice(0, 2)) * 60 + Number(existing.start.slice(3, 5));
      const time = placementFor(startMin, minutes ?? durationOf({}));
      if (time) patch.meta = { ...((t.meta as Record<string, unknown>) ?? {}), time };
    }
    const { error } = await supabase.from("tasks").update(patch).eq("id", t.id);
    setBusy(false);
    if (error) setNote("That didn't save — try again.");
    else router.refresh();
  }

  const suggestion =
    pickedTask != null
      ? firstFreeSlot(placed, durationOf(pickedTask))
      : null;

  const slots = slotStarts();
  const gridHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;

  return (
    <div className="grid gap-4">
      {/* -- capacity meter ------------------------------------------ */}
      <div className="panel">
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">{dayLabel}</p>
          <p className="mono text-[0.74rem] ml-auto">
            <b>{formatDuration(load.totalMin)}</b>
            <span className="text-[var(--faint)]">
              {" "}
              of {formatDuration(cap.capacityMin)} planned
            </span>
          </p>
        </div>
        <div
          className="h-[6px] rounded-full mt-2.5 overflow-hidden"
          style={{ background: "var(--bg-2)" }}
          role="img"
          aria-label={`${Math.round(cap.ratio * 100)} per cent of the day's capacity planned`}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, cap.ratio * 100)}%`,
              background:
                cap.state === "over"
                  ? "var(--bad)"
                  : cap.state === "full"
                    ? "var(--warn)"
                    : "var(--good)",
            }}
          />
        </div>
        <p className="text-[0.72rem] text-[var(--faint)] mt-2 leading-relaxed">
          {cap.state === "over"
            ? "Over capacity. Something here will not happen — better to decide which now than to discover it at six."
            : cap.state === "full"
              ? "A full day. Capacity stops at 65% of the window on purpose: the rest is the things that are not tasks."
              : "Room left. Capacity is 65% of the visible day — the other third is everything a task list never sees."}
          {load.unestimated > 0 && (
            <>
              {" "}
              {load.unestimated} block{load.unestimated === 1 ? "" : "s"} here
              {load.unestimated === 1 ? " has" : " have"} no estimate, so
              {load.unestimated === 1 ? " it is" : " they are"} drawn at 30
              minutes and counted as unknown rather than as fact.
            </>
          )}
          {calibration.reliable && calibration.multiplier != null && (
            <>
              {" "}
              Your last {calibration.sample} finished tasks ran{" "}
              <b className="mono">{calibration.multiplier.toFixed(2)}×</b> your
              estimates — this day is really about{" "}
              <b className="mono">
                {formatDuration(
                  Math.round(load.totalMin * calibration.multiplier)
                )}
              </b>
              .
            </>
          )}
        </p>
      </div>

      {note && (
        <p className="text-[0.78rem]" style={{ color: "var(--bad)" }}>
          {note}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_260px] items-start">
        {/* -- the clock -------------------------------------------- */}
        <div className="panel overflow-hidden">
          <div className="flex items-baseline gap-2 mb-3">
            <p className="label">The day</p>
            {pickedTask && (
              <p className="text-[0.72rem] ml-auto" style={{ color: "var(--accent)" }}>
                Tap a slot to place “{pickedTask.title.slice(0, 28)}”
                {suggestion != null && ` · first free ${toHHMM(suggestion)}`}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {/* hour gutter */}
            <div className="shrink-0" style={{ width: 42 }}>
              {slots.map((m) =>
                m % 60 === 0 ? (
                  <div
                    key={m}
                    className="mono text-[0.62rem] text-[var(--faint)] text-right pr-1"
                    style={{ height: PX_PER_SLOT * 2, lineHeight: `${PX_PER_SLOT}px` }}
                  >
                    {toHHMM(m)}
                  </div>
                ) : null
              )}
            </div>

            {/* slot column */}
            <div
              className="relative flex-1 min-w-0"
              style={{ height: gridHeight }}
            >
              {slots.map((m) => {
                const top = (m - DAY_START_MIN) * PX_PER_MIN;
                const onHour = m % 60 === 0;
                return (
                  <button
                    key={m}
                    onClick={() => picked && place(picked, m)}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes("text/plain")) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) place(id, m);
                    }}
                    disabled={busy}
                    aria-label={`Place at ${toHHMM(m)}`}
                    className="absolute left-0 right-0 w-full text-left"
                    style={{
                      top,
                      height: PX_PER_SLOT,
                      borderTop: `1px ${onHour ? "solid" : "dotted"} var(--border)`,
                      background: picked ? "var(--accent-soft)" : "transparent",
                      opacity: picked ? 0.5 : 1,
                      cursor: picked ? "copy" : "default",
                    }}
                  />
                );
              })}

              {laned.map((p) => {
                const t = p.task;
                const pillar = t.pillar_id ? byId[t.pillar_id] : null;
                const clash = clashes.has(t.id);
                const width = 100 / p.lanes;
                return (
                  <div
                    key={t.id}
                    className="absolute rounded-[7px] px-2 py-1 overflow-hidden"
                    style={{
                      top: (p.startMin - DAY_START_MIN) * PX_PER_MIN + 1,
                      height: Math.max(18, (p.endMin - p.startMin) * PX_PER_MIN - 2),
                      left: `${p.lane * width}%`,
                      width: `calc(${width}% - 3px)`,
                      background: "var(--accent-soft)",
                      border: `1px solid ${clash ? "var(--bad)" : "var(--accent)"}`,
                      borderLeftWidth: 3,
                    }}
                    title={`${toHHMM(p.startMin)}–${toHHMM(p.endMin)} · ${t.title}`}
                  >
                    <p className="text-[0.7rem] font-semibold leading-tight truncate">
                      {t.title}
                    </p>
                    <p className="mono text-[0.58rem] text-[var(--muted)] truncate">
                      {toHHMM(p.startMin)}–{toHHMM(p.endMin)}
                      {!p.estimated && " · no estimate"}
                      {clash && " · clash"}
                      {pillar && ` · ${pillar.name}`}
                    </p>
                    <button
                      onClick={() => unplace(t)}
                      disabled={busy}
                      aria-label={`Unschedule ${t.title}`}
                      className="absolute top-0 right-0 px-1.5 text-[0.7rem] leading-none py-1 bg-transparent border-0 cursor-pointer text-[var(--faint)] hover:text-[var(--bad)]"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* -- the pool --------------------------------------------- */}
        <div className="panel">
          <p className="label">Waiting · {pool.length}</p>
          <p className="text-[0.7rem] text-[var(--faint)] mt-1.5 mb-3 leading-relaxed">
            Tap one, then tap a slot. Drag works too, if you have a mouse.
          </p>
          {pool.length === 0 ? (
            <p className="text-[0.76rem] text-[var(--muted)] leading-relaxed">
              Nothing waiting. Every task with this day on it has a time.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {pool.map((t) => {
                const on = picked === t.id;
                const pillar = t.pillar_id ? byId[t.pillar_id] : null;
                const corrected = correctedEstimate(durationOf(t), calibration);
                return (
                  <div
                    key={t.id}
                    draggable={!busy}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                    className="rounded-[8px] border px-2.5 py-2 cursor-pointer"
                    style={{
                      borderColor: on ? "var(--accent)" : "var(--border)",
                      background: on ? "var(--accent-soft)" : "var(--card)",
                    }}
                    onClick={() => setPicked(on ? null : t.id)}
                  >
                    <p className="text-[0.78rem] font-medium leading-snug">{t.title}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {pillar && (
                        <span className="text-[0.6rem] text-[var(--faint)] truncate">
                          {pillar.emoji} {pillar.name}
                        </span>
                      )}
                      <span className="mono text-[0.6rem] ml-auto text-[var(--muted)]">
                        {formatDuration(t.duration_min ?? null)}
                        {corrected != null && t.duration_min != null && (
                          <span className="text-[var(--faint)]">
                            {" "}
                            → ~{formatDuration(corrected)}
                          </span>
                        )}
                      </span>
                    </div>
                    {/* the dash is the input: set a length without leaving */}
                    <div className="flex gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                      {[15, 30, 60, 120].map((m) => (
                        <button
                          key={m}
                          disabled={busy}
                          onClick={() => setDuration(t, t.duration_min === m ? null : m)}
                          className="chip flex-1 text-center px-0"
                          data-active={t.duration_min === m}
                        >
                          {m < 60 ? `${m}m` : `${m / 60}h`}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
