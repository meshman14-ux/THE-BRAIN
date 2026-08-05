import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Review } from "@/lib/types";
import {
  toIso,
  formatDayLong,
  reviewPeriod,
  daysUntilWeeklyReview,
  obstacleTally,
  obstacleHeadline,
  readObstacles,
  obstacleLabel,
  MIN_REVIEWS_FOR_TALLY,
} from "@/lib/logic";
import { refsForBranch } from "@/lib/references";
import WeeklyReview from "@/components/WeeklyReview";
import { Panel, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The review rituals. Three of them, as decided: daily 2 minutes, weekly 20,
 * quarterly an hour. Monthly is deliberately absent (§A3 item 7).
 *
 * The weekly one is built. Its fourth question — what got in the way — is
 * where Jay's three circled obstacles become data about his actual life:
 * once three reviews exist, the page can say which one keeps costing him
 * weeks. Below three it says nothing, because one bad week is not a pattern.
 */
export default async function Reviews() {
  const supabase = await createClient();
  const today = toIso(new Date());
  const period = reviewPeriod(today);

  const { data: reviews } = await supabase
    .from("reviews")
    .select(
      "id, kind, period_start, period_end, wins, friction, next_focus, completed_at, meta"
    )
    .eq("kind", "weekly")
    .order("period_start", { ascending: false });

  const weekly = (reviews ?? []) as Review[];
  const existing = weekly.find((r) => r.period_start === period.start) ?? null;
  const tally = obstacleTally(weekly);
  const headline = obstacleHeadline(tally);
  const until = daysUntilWeeklyReview(today);
  const refs = refsForBranch("reviews");

  return (
    <div className="max-w-[860px] mx-auto grid gap-7">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">Rituals</p>
          <p className="mono text-[0.72rem] text-[var(--faint)]">
            {formatDayLong(today)}
          </p>
          <Link
            href="/dashboard"
            className="ml-auto text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
          >
            ← THE BRAIN
          </Link>
        </div>
        <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold mt-1.5">
          Weekly review
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2.5 max-w-[68ch] leading-relaxed">
          Twenty minutes, four questions. It ends the week rather than
          starting one — the last question is what actually got in the way,
          and after three of these it stops being a question and starts being
          evidence.{" "}
          {until === 0
            ? "It lands today."
            : `Next one lands in ${until} day${until === 1 ? "" : "s"}.`}
        </p>
      </header>

      {/* -- what keeps costing him weeks ---------------------------- */}
      {tally.enough ? (
        <section
          className="card p-4 sm:p-5 grid gap-3"
          style={{ borderLeft: `4px solid ${headline ? "var(--warn)" : "var(--border-bright)"}` }}
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="label">What keeps getting in the way</h2>
            <span className="mono text-[0.68rem] text-[var(--faint)]">
              across {tally.reviews} reviews
            </span>
          </div>

          {headline ? (
            <p className="text-[1rem] sm:text-[1.05rem] font-semibold leading-snug">
              {headline}
            </p>
          ) : tally.counts.length === 0 ? (
            <p className="text-[0.84rem] text-[var(--muted)] leading-relaxed">
              You have logged {tally.reviews} reviews and named no obstacles in
              any of them. Either the weeks have been clean, or the question is
              being skipped.
            </p>
          ) : (
            <p className="text-[0.84rem] text-[var(--muted)] leading-relaxed">
              No single obstacle stands out — the top two are level. That is a
              real answer, not a missing one.
            </p>
          )}

          <div className="grid gap-2 mt-1">
            {tally.counts.map((c) => (
              <div key={c.key} className="grid gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[0.82rem] font-medium">{c.label}</span>
                  <span className="mono text-[0.68rem] text-[var(--faint)] ml-auto">
                    {c.count}/{tally.reviews}
                  </span>
                </div>
                <Bar
                  percent={(c.count / tally.reviews) * 100}
                  colour={
                    tally.top?.key === c.key ? "var(--warn)" : "var(--faint)"
                  }
                  height={6}
                />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-4 py-3.5">
          <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
            {weekly.length === 0
              ? "No reviews yet."
              : `${weekly.length} review${weekly.length === 1 ? "" : "s"} logged.`}{" "}
            Once there are {MIN_REVIEWS_FOR_TALLY}, this panel will tell you
            which obstacle keeps costing you weeks. It stays quiet until then —
            a pattern drawn from{" "}
            {weekly.length === 1 ? "one week" : `${weekly.length} weeks`} would
            be a guess wearing a number.
          </p>
        </section>
      )}

      {/* -- the form ------------------------------------------------ */}
      <WeeklyReview
        periodStart={period.start}
        periodEnd={period.end}
        existing={existing}
      />

      {/* -- the record ---------------------------------------------- */}
      {weekly.length > 0 && (
        <Panel title="Past reviews" hint="newest first">
          <div className="grid gap-2">
            {weekly.map((r) => {
              const obs = readObstacles(r.meta);
              return (
                <div
                  key={r.id}
                  className="rounded-[10px] border border-[var(--border)] px-3.5 py-3"
                >
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <span className="mono text-[0.7rem] font-bold">
                      {r.period_start} → {r.period_end}
                    </span>
                    {r.period_start === period.start && (
                      <span
                        className="text-[0.62rem] font-bold uppercase tracking-[0.06em]"
                        style={{ color: "var(--accent)" }}
                      >
                        this one
                      </span>
                    )}
                    {obs.length > 0 && (
                      <span className="flex gap-1.5 flex-wrap ml-auto">
                        {obs.map((o) => (
                          <span
                            key={o}
                            className="text-[0.62rem] font-bold uppercase tracking-[0.06em] px-1.5 py-[2px] rounded-[5px] border"
                            style={{
                              color: "var(--warn)",
                              borderColor: "var(--border-bright)",
                            }}
                          >
                            {obstacleLabel(o)}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {r.next_focus && (
                    <p className="text-[0.8rem] mt-1.5 leading-snug">
                      <span className="text-[var(--faint)]">Focus: </span>
                      {r.next_focus}
                    </p>
                  )}
                  {r.wins && (
                    <p className="text-[0.78rem] text-[var(--muted)] mt-1 leading-snug">
                      {r.wins}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* -- the other two rituals ----------------------------------- */}
      <Panel title="The other rituals" hint="not built yet — the weekly is the one that pays">
        <div className="grid gap-1.5">
          <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
            <b className="text-[var(--text)]">Daily, 2 minutes.</b> Tick the
            habits, pick tomorrow&apos;s three.{" "}
            <Link href="/life" className="no-underline" style={{ color: "var(--accent)" }}>
              habits are on LIFE_OS →
            </Link>
          </p>
          <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
            <b className="text-[var(--text)]">Quarterly, an hour.</b> Rescore
            every area, retire what is dead.{" "}
            <Link href="/life" className="no-underline" style={{ color: "var(--accent)" }}>
              area scores →
            </Link>
          </p>
          <p className="text-[0.78rem] text-[var(--faint)] leading-relaxed mt-1">
            There is no monthly review, on purpose. Three cadences you keep
            beat five you abandon.
          </p>
        </div>
      </Panel>

      {refs.length > 0 && (
        <Panel
          title="Reference shelf"
          hint="how other people run a review"
          action={
            <Link
              href="/library"
              className="text-[0.74rem] font-semibold no-underline"
              style={{ color: "var(--accent)" }}
            >
              FULL LIBRARY →
            </Link>
          }
        >
          <div className="grid gap-1.5">
            {refs.map((r) => (
              <a
                key={r.url}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 no-underline text-[var(--text)] card-hover block"
              >
                <p className="text-[0.84rem] font-medium">
                  {r.title} <span className="text-[var(--faint)]">↗</span>
                </p>
                <p className="text-[0.74rem] text-[var(--muted)] mt-0.5 leading-snug">
                  {r.why}
                </p>
              </a>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
