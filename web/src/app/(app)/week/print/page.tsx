import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Pillar, Task } from "@/lib/types";
import { toIso, weekOf, weekOffset, formatDayLong, isoWeekNumber } from "@/lib/logic";
import {
  DAY_END_MIN,
  DAY_START_MIN,
  dayLayout,
  formatDuration,
  slotStarts,
  toHHMM,
} from "@/lib/planner";

export const dynamic = "force-dynamic";

/**
 * The week, on paper.
 *
 * Deliberately not a PDF library. The browser's own "Print → Save as PDF"
 * produces a better-typeset page than anything worth hand-rolling, needs no
 * dependency, and — the part that matters — renders the *live* data through
 * the same components and tokens as the app, so the printed week can never
 * drift from the real one.
 *
 * Hour rows are the spine, because a printed diary is consulted by glancing
 * at a time, not by reading a list. Anything on the day without a slot is
 * printed underneath it, so a task never silently fails to appear on paper
 * just because it has not been given an hour yet.
 */

const PX_PER_MIN = 0.42; // ~40px per hour: fits a week across a landscape sheet

export default async function WeekPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;
  const offset = Number.isFinite(Number(w)) ? Number(w) : 0;
  const now = new Date();
  const today = toIso(now);
  const dates = offset === 0 ? weekOf(now) : weekOffset(now, offset);

  const supabase = await createClient();
  const [{ data: tasks }, { data: pillars }] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, title, pillar_id, do_date, due_date, priority, status, duration_min, meta"
      )
      .in("status", ["open", "doing", "done"])
      .gte("do_date", dates[0])
      .lte("do_date", dates[6]),
    supabase
      .from("pillars")
      .select("id, system, name, emoji, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
  ]);

  const allTasks = (tasks ?? []) as Task[];
  const areas = (pillars ?? []) as Pillar[];
  const areaById = new Map(areas.map((p) => [p.id, p]));

  const slots = slotStarts();
  const gridHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;

  return (
    <div className="printsheet">
      {/* Screen-only chrome. Everything here disappears on paper. */}
      <div className="noprint flex items-center gap-2 flex-wrap mb-4">
        <Link href="/week" className="chip no-underline">
          ‹ Back to the week
        </Link>
        <Link href={`/week/print?w=${offset - 1}`} className="chip no-underline">
          ‹ Prev
        </Link>
        <Link href={`/week/print?w=${offset + 1}`} className="chip no-underline">
          Next ›
        </Link>
        <span className="text-[0.74rem] text-[var(--muted)] ml-auto">
          Print (⌘P / Ctrl-P) → choose <b>Landscape</b> → Save as PDF.
        </span>
      </div>

      <header className="flex items-baseline gap-3 mb-3">
        <h1 className="text-[1.2rem] font-semibold">THE BRAIN · Week {isoWeekNumber(dates[0])}</h1>
        <span className="mono text-[0.72rem] text-[var(--muted)]">
          {formatDayLong(dates[0])} — {formatDayLong(dates[6])}
        </span>
      </header>

      <div className="weekgrid">
        {/* hour gutter */}
        <div>
          <div className="dayhead" aria-hidden />
          <div className="relative" style={{ height: gridHeight }}>
            {slots.map((m) =>
              m % 60 === 0 ? (
                <div
                  key={m}
                  className="mono hourlabel"
                  style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }}
                >
                  {toHHMM(m)}
                </div>
              ) : null
            )}
          </div>
        </div>

        {dates.map((iso) => {
          const { placed, unplaced } = dayLayout(allTasks, iso);
          return (
            <div key={iso} className="daycol">
              <div className="dayhead" data-today={iso === today}>
                <div className="text-[0.72rem] font-bold">
                  {formatDayLong(iso).split(" ")[0]}
                </div>
                <div className="mono text-[0.62rem] opacity-70">
                  {iso.slice(8)}/{iso.slice(5, 7)}
                </div>
              </div>

              <div className="relative slotcol" style={{ height: gridHeight }}>
                {slots.map((m) => (
                  <div
                    key={m}
                    className="slotline"
                    data-hour={m % 60 === 0}
                    style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }}
                  />
                ))}
                {placed.map((p) => {
                  const area = p.task.pillar_id ? areaById.get(p.task.pillar_id) : null;
                  return (
                    <div
                      key={p.task.id}
                      className="block"
                      data-done={p.task.status === "done"}
                      style={{
                        top: (p.startMin - DAY_START_MIN) * PX_PER_MIN + 1,
                        height: Math.max(13, (p.endMin - p.startMin) * PX_PER_MIN - 2),
                      }}
                    >
                      <div className="blocktitle">{p.task.title}</div>
                      <div className="mono blockmeta">
                        {toHHMM(p.startMin)}
                        {area ? ` · ${area.name}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Untimed work still reaches the paper — as a list, honestly
                  labelled, rather than being dropped because it has no hour. */}
              <div className="untimed">
                {unplaced.length === 0 ? (
                  <div className="untimedempty">—</div>
                ) : (
                  unplaced.map((t) => (
                    <div key={t.id} className="untimedrow">
                      <span className="box" aria-hidden />
                      <span className="untimedtitle">{t.title}</span>
                      <span className="mono untimedlen">
                        {formatDuration(t.duration_min ?? null)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="footnote">
        Times are intentions, not appointments. Anything without an hour is
        listed under its day rather than hidden — a plan that quietly drops
        work is worse than one that admits it.
      </p>
    </div>
  );
}
