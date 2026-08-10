import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Pillar } from "@/lib/types";
import {
  toIso,
  formatDayLong,
  areaToAsk,
  readCheckin,
  gratitudePrompt,
  reflectionWeeks,
  moodTrend,
  checkinProgress,
  REFLECTION_TARGET,
} from "@/lib/logic";
import CheckinFlow from "@/components/Checkin";
import { Panel, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * The daily close.
 *
 * One ritual, not two. The v2 list carried a "check-in workflow" and a
 * "structured daily review" as separate items; two rituals competing for
 * the same two minutes at the end of the same day is how both get skipped,
 * so they are one page with a floor and a ceiling.
 *
 * The streak counts WEEKS, not days. A daily streak punishes one missed
 * evening by resetting to zero, and the reset is what ends the habit rather
 * than the missed day — so four evenings in a week is a good week, and
 * Tuesday off is just Tuesday off.
 * ------------------------------------------------------------------ */

export default async function CheckinPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: pillars }, { data: todayRow }, { data: history }] = await Promise.all([
    supabase
      .from("pillars")
      .select("id, system, name, emoji, sort_order, active, score")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("journal")
      .select("mood, energy, gratitude, meta")
      .eq("entry_date", today)
      .maybeSingle(),
    supabase
      .from("journal")
      .select("entry_date, mood, energy")
      .order("entry_date", { ascending: false })
      .limit(120),
  ]);

  const areas = (pillars ?? []) as Pillar[];
  const area = areaToAsk(areas, today);
  const checkin = readCheckin(todayRow);
  const progress = checkinProgress(checkin);

  const rows = (history ?? []) as {
    entry_date: string;
    mood: number | null;
    energy: number | null;
  }[];
  const { weeks, streak } = reflectionWeeks(
    rows.map((r) => r.entry_date),
    today
  );
  const trend = moodTrend(rows, today);

  return (
    <div className="grid gap-5 max-w-[720px]">
      <div>
        <h1 className="text-[1.5rem] font-semibold leading-tight">The daily close</h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 leading-relaxed">
          Two taps is the whole obligation. Everything under that line is
          there when you want it and silent when you do not — nothing here
          is required, and skipping a question writes nothing rather than
          writing a blank.
        </p>
      </div>

      <CheckinFlow
        date={today}
        initial={checkin}
        area={area ? { id: area.id, name: area.name, emoji: area.emoji } : null}
        gratitudePrompt={gratitudePrompt(today)}
        dayLabel={formatDayLong(today)}
      />

      {progress.done && (
        <p
          className="mono text-[0.68rem] tracking-[0.1em] text-center uppercase"
          style={{ color: "var(--good)" }}
        >
          Today is closed
        </p>
      )}

      {/* -- the streak, counted in weeks --------------------------- */}
      <Panel
        title="◫ Reflection"
        hint={`${REFLECTION_TARGET}+ evenings makes a week`}
      >
        {rows.length === 0 ? (
          <Empty>
            Nothing logged yet. The bars fill a week at a time rather than a
            day at a time, so one missed evening never resets anything — that
            is the difference between a streak you keep and a streak you
            abandon in February.
          </Empty>
        ) : (
          <>
            <div className="flex items-end gap-1.5 h-[54px]" role="presentation">
              {weeks.map((w, i) => {
                const current = i === weeks.length - 1;
                return (
                  <div
                    key={w.monday}
                    title={`Week of ${w.monday}: ${w.entries} of 7`}
                    className="flex-1 rounded-[3px] min-h-[3px]"
                    style={{
                      height: `${Math.max(6, (w.entries / 7) * 100)}%`,
                      background: w.met ? "var(--accent)" : "var(--border-bright)",
                      // The current week is still being lived, so it is drawn
                      // as provisional rather than as a verdict.
                      opacity: current && !w.met ? 0.5 : 1,
                      outline: current ? "1px dashed var(--border-bright)" : undefined,
                      outlineOffset: "1px",
                    }}
                  />
                );
              })}
            </div>
            <div className="flex gap-4 flex-wrap text-[0.76rem] text-[var(--muted)]">
              <span>
                <b className="mono">{streak}</b> good week{streak === 1 ? "" : "s"} running
              </span>
              <span>
                Mood{" "}
                <b className="mono">{trend.mood == null ? "—" : trend.mood.toFixed(1)}</b>
                {" · "}Energy{" "}
                <b className="mono">
                  {trend.energy == null ? "—" : trend.energy.toFixed(1)}
                </b>{" "}
                <span className="text-[var(--faint)]">
                  over {trend.of} day{trend.of === 1 ? "" : "s"}
                </span>
              </span>
            </div>
            <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
              The last bar is this week, still being lived — it is outlined
              rather than judged. A skipped question contributes no reading,
              so an evening you passed on is not averaged as a bad one.
            </p>
          </>
        )}
      </Panel>

      <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed">
        The weekly review is a longer sit-down and lives at{" "}
        <Link href="/reviews" className="font-semibold no-underline" style={{ color: "var(--accent)" }}>
          /reviews
        </Link>
        . This page is the two-minute version, every night.
      </p>
    </div>
  );
}
