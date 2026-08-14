import Link from "next/link";
import { SEASON_LABEL, type SeasonKind } from "@/lib/season";
import { ALERT_TONE, daysUntil, type WatchAlert } from "@/lib/logic";
import type { Task } from "@/lib/types";
import { Empty, Panel } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * The dashboard's ATTENTION tab — what is going wrong
 *
 * Lifted out of `page.tsx` on 2026-08-14 with NO change to its logic.
 * The page was 1,650 lines reading 19 tables, which is not a page, and
 * every feature that landed made it longer because it was the only place
 * anything got shown.
 *
 * The split is deliberately dumb: the page still loads every row and
 * derives every figure, and hands the results down as props. Moving the
 * derivation too would have been tidier and would also have made this a
 * rewrite of the most-used screen in the system, with no component tests
 * underneath it. One thing at a time.
 *
 * This tab is the one that is allowed to be empty. An empty Attention
 * tab is the system saying nothing is slipping, which is worth its own
 * address precisely because it is a real answer rather than an absence.
 * ------------------------------------------------------------------ */

export default function AttentionTab({
  alerts,
  silenced,
  dueSoon,
  season,
  today,
}: {
  /** Already annotated by the page. `annotate` attaches the "why now"
   *  so an alert cannot become wallpaper. */
  alerts: (WatchAlert & { annotation: string | null })[];
  /** Empire alerts the season is holding back. Parked, never missed. */
  silenced: { kind: string }[];
  /** Tasks and projects with a deadline inside the window. */
  dueSoon: (Task | { due_date: string | null; status: string })[];
  season: SeasonKind;
  today: string;
}) {
  return (
    <>
            {alerts.length === 0 ? (
              <Panel title="⚠ Needs attention" hint="nothing is slipping">
                <Empty cta={{ href: "/planner", label: "Look at the work anyway" }}>
                  Nothing overdue, nobody out of touch past their cadence, no
                  division drifting from its own claim. This tab is empty when
                  the system has nothing to tell you, which is the point of
                  it having its own tab.
                </Empty>
                {silenced.length > 0 && (
                  <p className="text-[0.74rem] text-[var(--faint)] mt-3 leading-relaxed m-0">
                    {silenced.length} empire alert
                    {silenced.length === 1 ? " is" : "s are"} quiet this{" "}
                    {SEASON_LABEL[season].toLowerCase()} — parked on purpose,
                    not missed. They come back when the season does.
                  </p>
                )}
              </Panel>
            ) : (
              <section className="panel" style={{ borderColor: "var(--bad)" }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-[0.95rem]">⚠️</span>
                  <p
                    className="text-[0.7rem] font-bold tracking-[0.14em] uppercase"
                    style={{ color: "var(--bad)" }}
                  >
                    Needs attention · {alerts.length}
                  </p>
                </div>
                <div className="grid gap-1.5 mt-3">
                  {alerts.map((a, i) => (
                    <Link
                      key={`${a.kind}-${i}`}
                      href={a.href}
                      className="flex items-center gap-2.5 no-underline text-[var(--text)] py-1"
                    >
                      <span
                        aria-hidden
                        className="w-[6px] h-[6px] rounded-full shrink-0"
                        style={{ background: ALERT_TONE[a.kind] }}
                      />
                      <span
                        className="mono text-[0.62rem] font-bold shrink-0 w-[62px]"
                        style={{ color: ALERT_TONE[a.kind] }}
                      >
                        {a.label}
                      </span>
                      <span className="text-[0.8rem] flex-1 min-w-0 leading-snug">
                        {a.text}
                        {/* The life beside the judgement, never instead of
                            it. Quieter and smaller, because it is context
                            and not the finding. */}
                        {a.annotation && (
                          <span className="block text-[0.7rem] text-[var(--faint)] mt-0.5">
                            {a.annotation}
                          </span>
                        )}
                      </span>
                      <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">
                        →
                      </span>
                    </Link>
                  ))}
                </div>
                {silenced.length > 0 && (
                  <p className="text-[0.72rem] text-[var(--faint)] mt-3 pt-2.5 border-t border-[var(--border)] leading-relaxed m-0">
                    {silenced.length} more, quiet this{" "}
                    {SEASON_LABEL[season].toLowerCase()} — empire bookkeeping
                    measures attention, and this season has already been
                    declared not to have it. Deadlines and people are never
                    silenced.
                  </p>
                )}
              </section>
            )}

          {/* -- DEADLINES · due now --------------------------------- */}
          <Panel title="◔ Deadlines · due now" hint="next 7 days, overdue included">
            {dueSoon.length === 0 ? (
              <Empty cta={{ href: "/week", label: "Plan the week" }}>
                Nothing due — you&apos;re on top of it. A task earns a place here
                by having a real due date, which is a fact about the world rather
                than a wish.
              </Empty>
            ) : (
              <div className="grid gap-1.5">
                {dueSoon.slice(0, 8).map((t, i) => {
                  const d = daysUntil(t.due_date ?? null, today);
                  const late = d != null && d < 0;
                  return (
                    <div
                      key={"id" in t ? String(t.id) : i}
                      className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
                    >
                      <span className="text-[0.82rem] flex-1 min-w-0 truncate">
                        {"title" in t ? String(t.title) : "Project deadline"}
                      </span>
                      <span
                        className="mono text-[0.66rem] shrink-0"
                        style={{ color: late ? "var(--bad)" : "var(--warn)" }}
                      >
                        {d == null
                          ? t.due_date
                          : late
                            ? `${Math.abs(d)}d late`
                            : d === 0
                              ? "today"
                              : `${d}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
    </>
  );
}
