import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Pillar, Task } from "@/lib/types";
import {
  toIso,
  formatDayLong,
  isoWeekNumber,
  focusList,
  splitDormant,
} from "@/lib/logic";
import {
  DAY_END_MIN,
  DAY_START_MIN,
  dayLayout,
  slotStarts,
  toHHMM,
} from "@/lib/planner";
import { FLOOR_SLOTS, floorWeek } from "@/lib/floor";
import { loadFloorSignals } from "@/lib/floorserver";
import { verseOfDay } from "@/lib/gita";
import { creedFrom, creedLineOfDay } from "@/lib/creed";

export const dynamic = "force-dynamic";

/**
 * THE DAILY SHEET — the onboarding profile's proof condition, made real.
 *
 * Jay's stated interface is paper: print in the morning, work off the sheet,
 * tick it by hand, photograph it back through Capture at night. So the sheet
 * is built for a pen — the floor at the top as three real tick boxes,
 * today's three, the obligations that punish lateness, the hour spine, and
 * ruled space that belongs to the pen and not the app.
 *
 * Assembled at print time from live rows rather than drafted by a scheduled
 * job: a background job would need to act as Jay with no session — a
 * service-role key, the trade this repo has always refused (§A8 item 12).
 * Opening the page at 07:00 IS the morning refresh; every line on it is
 * arithmetic over what the database already holds, so it costs nothing and
 * cannot hallucinate. The Anthropic-drafted narrative can layer on later
 * without changing this page's contract.
 */

const PX_PER_MIN = 0.62; // ~37px per hour — 16 hours fits a portrait A4

export default async function DayPrintPage() {
  const now = new Date();
  const today = toIso(now);
  const supabase = await createClient();

  const [{ data: tasks }, { data: pillars }, { data: vehicles }, { data: checkItems }, { data: creed }, signals] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, pillar_id, project_id, do_date, due_date, priority, status, duration_min, created_at, meta"
        )
        .in("status", ["open", "doing", "done"]),
      supabase
        .from("pillars")
        .select("id, system, name, emoji, sort_order, active")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("vehicles")
        .select("name, registration, tax_due, mot_due, insurance_due, status"),
      supabase
        .from("venture_checklist_items")
        .select("title, due_on, done_at")
        .is("done_at", null)
        .not("due_on", "is", null),
      supabase.from("notes").select("body").eq("kind", "creed").limit(1).maybeSingle(),
      loadFloorSignals(toIso(new Date())),
    ]);

  const allTasks = (tasks ?? []) as Task[];
  const areas = (pillars ?? []) as Pillar[];
  const areaById = new Map(areas.map((p) => [p.id, p]));
  const { live: liveTasks } = splitDormant(allTasks, today);

  const floor = floorWeek(today, signals);
  const three = focusList(liveTasks, today).visible;

  /* -- obligations: only what the world punishes --------------------- */
  const soon = (d: string | null) =>
    d != null && d <= toIso(new Date(now.getTime() + 14 * 86400000));
  const obligations: { text: string; due: string; overdue: boolean }[] = [];
  for (const t of liveTasks) {
    if (t.status === "done" || t.due_date == null) continue;
    if (soon(t.due_date)) {
      obligations.push({ text: t.title, due: t.due_date, overdue: t.due_date < today });
    }
  }
  for (const v of (vehicles ?? []) as {
    name: string;
    registration: string;
    tax_due: string | null;
    mot_due: string | null;
    insurance_due: string | null;
    status: string;
  }[]) {
    if (v.status !== "active") continue;
    for (const [label, d] of [
      ["tax", v.tax_due],
      ["MOT", v.mot_due],
      ["insurance", v.insurance_due],
    ] as const) {
      if (d != null && soon(d)) {
        obligations.push({ text: `${v.name} (${v.registration}) — ${label}`, due: d, overdue: d < today });
      }
    }
  }
  for (const c of (checkItems ?? []) as { title: string; due_on: string | null }[]) {
    if (c.due_on != null && soon(c.due_on)) {
      obligations.push({ text: c.title, due: c.due_on, overdue: c.due_on < today });
    }
  }
  obligations.sort((a, b) => a.due.localeCompare(b.due));

  /* -- the hour spine ------------------------------------------------ */
  const slots = slotStarts();
  const gridHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
  const { placed, unplaced } = dayLayout(
    liveTasks.filter((t) => t.do_date === today),
    today
  );

  const verse = verseOfDay(today);
  const creedLine = creedLineOfDay(creedFrom(creed?.body), today, 1);

  return (
    <div className="printsheet daysheet">
      {/* Portrait, unlike the week. A later @page wins on this route only. */}
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      <div className="noprint flex items-center gap-2 flex-wrap mb-4">
        <Link href="/day" className="chip no-underline">
          ‹ Back to the day
        </Link>
        <span className="text-[0.74rem] text-[var(--muted)] ml-auto">
          Print (⌘P / Ctrl-P) → <b>Portrait</b> → work off the paper. Photograph
          the ticked sheet into Capture tonight.
        </span>
      </div>

      <header className="flex items-baseline gap-3 mb-2">
        <h1 className="text-[1.2rem] font-semibold">THE BRAIN · Daily Sheet</h1>
        <span className="mono text-[0.72rem] text-[var(--muted)]">
          {formatDayLong(today)} · wk {isoWeekNumber(today)}
        </span>
      </header>

      {/* ── THE FLOOR — never flexes, whatever the season ───────────── */}
      <section className="floorrow">
        {FLOOR_SLOTS.map((f) => (
          <div key={f.slot} className="floorcell" data-hit={floor.today[f.slot]}>
            <span className="floorbox" aria-hidden>
              {floor.today[f.slot] ? "✓" : ""}
            </span>
            <span>
              <span className="floorname">{f.name}</span>
              <span className="floorwhat">{f.what}</span>
            </span>
          </div>
        ))}
        <div className="floortally mono">{floor.hits}/7 this week</div>
      </section>

      {/* ── TODAY'S THREE ───────────────────────────────────────────── */}
      <section className="sheetblock">
        <p className="sheethead">Today&rsquo;s three</p>
        {three.length === 0 ? (
          <p className="untimedempty">Nothing set for today — write them in:</p>
        ) : null}
        {(three.length === 0 ? [null, null, null] : three).map((t, i) => {
          const area = t?.pillar_id ? areaById.get(t.pillar_id) : null;
          return (
            <div key={t?.id ?? i} className="untimedrow">
              <span className="box" aria-hidden />
              <span className="untimedtitle">{t ? t.title : " "}</span>
              {area && <span className="mono untimedlen">{area.name}</span>}
            </div>
          );
        })}
      </section>

      {/* ── OBLIGATIONS — what the world punishes ───────────────────── */}
      <section className="sheetblock">
        <p className="sheethead">Obligations · next 14 days</p>
        {obligations.length === 0 ? (
          <p className="untimedempty">Nothing dated inside a fortnight.</p>
        ) : (
          obligations.slice(0, 8).map((o) => (
            <div key={o.text + o.due} className="untimedrow">
              <span className="box" aria-hidden />
              <span className="untimedtitle" style={o.overdue ? { fontWeight: 700 } : undefined}>
                {o.text}
              </span>
              <span className="mono untimedlen">
                {o.overdue ? "OVERDUE " : ""}
                {o.due.slice(8)}/{o.due.slice(5, 7)}
              </span>
            </div>
          ))
        )}
      </section>

      {/* ── THE DAY, hour by hour — the pen's half of the page ──────── */}
      <section className="sheetblock">
        <p className="sheethead">The day</p>
        <div className="daygrid">
          <div className="relative" style={{ height: gridHeight }}>
            {slots.map((m) =>
              m % 60 === 0 ? (
                <div key={m} className="mono hourlabel" style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }}>
                  {toHHMM(m)}
                </div>
              ) : null
            )}
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
            {placed.map((p) => (
              <div
                key={p.task.id}
                className="block"
                data-done={p.task.status === "done"}
                style={{
                  top: (p.startMin - DAY_START_MIN) * PX_PER_MIN + 1,
                  height: Math.max(14, (p.endMin - p.startMin) * PX_PER_MIN - 2),
                }}
              >
                <div className="blocktitle">{p.task.title}</div>
                <div className="mono blockmeta">{toHHMM(p.startMin)}</div>
              </div>
            ))}
          </div>
        </div>
        {unplaced.length > 0 && (
          <div className="untimed">
            {unplaced.map((t) => (
              <div key={t.id} className="untimedrow">
                <span className="box" aria-hidden />
                <span className="untimedtitle">{t.title}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="footnote">
        “{verse.v}” — Gita {verse.ref}
        {creedLine ? <> · {creedLine}</> : null}
      </p>
    </div>
  );
}
