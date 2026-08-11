import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Week from "@/components/Week";
import HourPurposeGrid, { type JournalDay } from "@/components/HourPurpose";
import AddToCalendar from "@/components/AddToCalendar";
import { Panel, Empty } from "@/components/ui";
import type { Pillar, Task } from "@/lib/types";
import { toIso, weekOf, formatDayLong } from "@/lib/logic";
import {
  PRIORITY_SLOTS_PER_SYSTEM,
  formatDuration,
  systemPriorities,
} from "@/lib/planner";
import { readTaskTime } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export default async function WeekPage() {
  const supabase = await createClient();
  const now = new Date();
  const today = toIso(now);
  const dates = weekOf(now);

  const [{ data: tasks }, { data: pillars }, { data: journal }, { count: linked }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, pillar_id, do_date, due_date, priority, status, duration_min, meta"
        )
        .in("status", ["open", "doing"])
        .order("priority"),
      supabase
        .from("pillars")
        .select("id, system, name, emoji, standard, sort_order, active")
        .eq("active", true)
        .order("sort_order"),
      // Only this week's rows: the hour labels are an annotation on the week
      // in front of him, not an archive to scroll.
      supabase
        .from("journal")
        .select("entry_date, meta")
        .gte("entry_date", dates[0])
        .lte("entry_date", dates[6]),
      supabase.from("integrations").select("id", { count: "exact", head: true }),
    ]);

  const allTasks = (tasks ?? []) as Task[];
  const areas = (pillars ?? []) as Pillar[];
  const priorities = systemPriorities(allTasks, areas, dates);

  const areaById = new Map(areas.map((p) => [p.id, p]));

  /* -- the two lists, five each ---------------------------------- */
  const List = ({
    system,
    title,
    items,
  }: {
    system: "life" | "empire";
    title: string;
    items: Task[];
  }) => (
    <section
      className={`panel grid gap-3 ${system === "life" ? "sys-life" : "sys-empire"}`}
      style={{ borderLeft: "4px solid var(--sys)" }}
      data-mode-only={system === "life" ? "life" : "empire"}
    >
      <div className="flex items-baseline gap-2">
        <p
          className="mono text-[0.7rem] font-bold tracking-[0.12em]"
          style={{ color: "var(--sys)" }}
        >
          {title}
        </p>
        <span className="mono text-[0.62rem] text-[var(--faint)] ml-auto">
          {items.length} / {PRIORITY_SLOTS_PER_SYSTEM}
        </span>
      </div>
      {items.length === 0 ? (
        <Empty cta={{ href: "/planner", label: "Give something a day" }}>
          Nothing from this system has a day inside this week. Priority is not
          a label here — it is a commitment to a day, which is why an
          unscheduled High task does not appear.
        </Empty>
      ) : (
        <ol className="grid gap-1.5">
          {items.map((t, i) => {
            const area = t.pillar_id ? areaById.get(t.pillar_id) : null;
            const time = readTaskTime(t.meta);
            return (
              <li
                key={t.id}
                className="prio flex items-center gap-2.5 rounded-[8px] border border-[var(--border)] pr-2.5 py-2"
                data-p={t.priority === "High" ? 1 : t.priority === "Med" ? 2 : 3}
              >
                <span className="prio-mark ml-3" aria-hidden />
                <span className="mono text-[0.6rem] text-[var(--faint)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[0.82rem] font-medium flex-1 min-w-0 truncate">
                  {t.title}
                </span>
                <span className="mono text-[0.6rem] text-[var(--faint)] shrink-0">
                  {time ? time.start : formatDuration(t.duration_min ?? null)}
                  {area && ` · ${area.emoji ?? ""}`}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );

  return (
    <div className="grid gap-6">
      <header className="mb-1">
        <p className="label">Scheduler</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">This Week</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-[62ch]">
          Put each task on the day you intend to <em>do</em> it — not the day it&apos;s
          due. Unscheduled tasks wait in the pool below.
        </p>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/day" className="chip no-underline">
          ◷ Plan today by the hour →
        </Link>
        <Link href="/week/print" className="chip no-underline">
          ⎙ Printable diary →
        </Link>
        <span className="ml-auto">
          <AddToCalendar connected={(linked ?? 0) > 0} />
        </span>
      </div>

      {/* -- five and five, one machine each -------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <List system="life" title="☼ LIFE_OS · this week" items={priorities.life} />
        <List system="empire" title="♛ EMPIRE_OS · this week" items={priorities.empire} />
      </div>
      {priorities.unassigned > 0 && (
        <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed -mt-3">
          {priorities.unassigned} scheduled task
          {priorities.unassigned === 1 ? "" : "s"} this week belong to neither
          system — real work that has not been told which life it is part of, so
          it appears in neither list rather than being guessed into one.
        </p>
      )}

      <Week tasks={allTasks} pillars={areas} />

      {/* -- the week's days, each a doorway to its own clock --------- */}
      <Panel title="◷ Plan a day by the hour" hint="drag tasks onto time slots">
        <div className="flex gap-1.5 flex-wrap">
          {dates.map((iso) => (
            <Link
              key={iso}
              href={`/day?d=${iso}`}
              className="chip no-underline"
              data-active={iso === today}
            >
              {formatDayLong(iso).split(" ").slice(0, 2).join(" ")}
            </Link>
          ))}
        </div>
      </Panel>

      <HourPurposeGrid
        dates={dates}
        todayIso={today}
        journal={(journal ?? []) as JournalDay[]}
      />
    </div>
  );
}
