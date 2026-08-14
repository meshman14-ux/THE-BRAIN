import Link from "next/link";
import Finishes from "@/components/Finishes";
import { Empty, Panel } from "@/components/ui";

/**
 * Local to this tab now, and it was only ever used here.
 *
 * The guard is `<= 0` rather than `=== 0`, copied verbatim from the page.
 * A first pass wrote `=== 0`, which is the same for every input this
 * actually receives and is still a logic change — and this split's whole
 * safety argument is that no logic changed.
 */
function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n / total) * 100);
}

/* ------------------------------------------------------------------ *
 * The dashboard's TREND tab — am I getting better
 *
 * Lifted out of `page.tsx` on 2026-08-14 with NO change to its logic,
 * the second of four. The page still loads every row and derives every
 * figure; this takes the results as props.
 *
 * It is the only tab that looks backwards, which is why it earns its own
 * address: the other three all answer questions about now, and a
 * fortnight of history mixed in among them reads as noise rather than as
 * a trend.
 * ------------------------------------------------------------------ */


type TrendProps = {
  /** 14 days of training history, newest last. */
  bars: ReturnType<typeof import("@/lib/logic").streakHistory>;
  consistency: ReturnType<typeof import("@/lib/logic").habitConsistency>;
  finishNudge: ReturnType<typeof import("@/lib/finishes").currentMonthNudge>;
  finishes: ReturnType<typeof import("@/lib/finishes").collectFinishes>;
  momentumNow: ReturnType<typeof import("@/lib/finishes").momentum>;
  reviewText: string;
  tallies: ReturnType<typeof import("@/lib/finishes").monthsCounted>;
  split: ReturnType<typeof import("@/lib/logic").taskSplit>;
};

export default function TrendTab(props: TrendProps) {
  const {
    bars,
    consistency,
    finishNudge,
    finishes,
    momentumNow,
    reviewText,
    tallies,
    split,
  } = props;
  return (
    <>
        {/* -- MONTHS THAT COUNTED --------------------------------- *
         *
         * The answer to the only measure his own twelve-month test was
         * missing: a version of "momentum" that can be failed. It leads
         * the Trend tab because it is the longest-horizon thing here.
         * -------------------------------------------------------- */}
        <Finishes
          tallies={tallies}
          momentum={momentumNow}
          recent={finishes}
          nudge={finishNudge}
        />

        {/* -- PRODUCTIVITY · at a glance -------------------------- */}
        <Panel title="Productivity · at a glance">
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr_0.9fr] items-center">
            {/* streak, last 14 days */}
            <div>
              <p className="label" style={{ color: "var(--warn)" }}>
                Streak · last 14 days
              </p>
              <div className="flex items-end gap-[3px] h-[38px] mt-2.5">
                {bars.map((hit, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-[2px]${hit ? " lit" : ""}`}
                    style={{
                      height: hit ? `${30 + (i % 3) * 3}%` : "14%",
                      minHeight: 5,
                      background: hit ? "var(--fill-warn)" : "var(--border)",
                      opacity: hit ? 1 : 0.7,
                      // Each bar arrives a beat after the one before it, so
                      // the fortnight draws itself left to right.
                      animation: hit
                        ? `grow-y 0.4s cubic-bezier(0.22,1,0.36,1) both ${i * 30}ms`
                        : undefined,
                      transformOrigin: "bottom center",
                    }}
                    title={hit ? "trained" : "no log"}
                  />
                ))}
              </div>
              <p className="text-[0.68rem] text-[var(--faint)] mt-2 leading-snug">
                Builds daily as you keep the streak. Today is the last bar.
              </p>
            </div>

            {/* life vs empire */}
            <div>
              <p className="label">Open tasks · life vs empire</p>
              <div
                className="flex h-[14px] rounded-full overflow-hidden mt-2.5"
                style={{ background: "var(--border)" }}
              >
                <div
                  style={{
                    width: `${pct(split.life, split.life + split.empire)}%`,
                    background: "var(--life)",
                  }}
                />
                <div
                  style={{
                    width: `${pct(split.empire, split.life + split.empire)}%`,
                    background: "var(--empire)",
                  }}
                />
              </div>
              <div className="flex gap-3.5 mt-2 flex-wrap">
                <span className="mono text-[0.68rem]" style={{ color: "var(--life)" }}>
                  ● LIFE {split.life}
                </span>
                <span className="mono text-[0.68rem]" style={{ color: "var(--empire)" }}>
                  ● EMPIRE {split.empire}
                </span>
                <span className="mono text-[0.68rem] text-[var(--faint)] ml-auto">
                  {split.done} DONE
                </span>
              </div>
            </div>

            {/* habit consistency */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-[76px] h-[76px] rounded-full flex items-center justify-center"
                style={{
                  background: `conic-gradient(var(--accent) ${(consistency ?? 0) * 3.6}deg, var(--border) 0deg)`,
                }}
              >
                <div
                  className="w-[56px] h-[56px] rounded-full flex items-center justify-center"
                  style={{ background: "var(--card)" }}
                >
                  <span
                    className="mono text-[0.85rem] font-bold"
                    style={{
                      color: consistency == null ? "var(--faint)" : "var(--accent)",
                    }}
                  >
                    {consistency == null ? "—" : `${consistency}%`}
                  </span>
                </div>
              </div>
              <p className="label text-center">Habit consistency · 7d</p>
            </div>
          </div>
        </Panel>

        {/* -- the advisor ----------------------------------------- */}
        <Panel title="Advisor" hint="briefing + retrieval, advisory only">
          <Empty cta={{ href: "/advisor", label: "Open the advisor" }}>
            The morning brief is assembled from your own data — what is
            slipping, what is set for today, what is still unanswered — and
            costs nothing to produce. Ask it anything over your own notes and
            it answers with the sources attached. It cannot change anything
            here; everything it says is yours to act on.
          </Empty>
        </Panel>

            <Link
              href="/reviews"
              className="panel card-hover no-underline block text-[var(--text)]"
            >
              <p className="label">The weekly review</p>
              <p className="text-[0.82rem] text-[var(--muted)] mt-1.5 leading-relaxed">
                {reviewText.toLowerCase()}. Four questions, the fourth being
                what got in the way — which is the one that turns a streak
                into a reason.
              </p>
            </Link>
    </>
  );
}
