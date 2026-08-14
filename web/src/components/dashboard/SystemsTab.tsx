import Link from "next/link";
import { Bar } from "@/components/ui";
import { formatGBP, isExternal, scoreBarPercent } from "@/lib/logic";
import { divisionHref } from "@/lib/references";
import { STAGE_COLOUR, STAGE_LABEL, type Pillar, type Venture } from "@/lib/types";

/** Moved with the markup that used it; the page had no other caller. */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-[var(--border)] px-3 py-2.5">
      <p className="label">{label}</p>
      <p className="mono text-[1.05rem] font-bold mt-1">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The dashboard's SYSTEMS tab — how are LIFE and EMPIRE
 *
 * Lifted out of `page.tsx` on 2026-08-14, third of four, with no change
 * to its logic. The biggest of the four at 239 lines, and the one whose
 * props list is longest — which is itself the finding: this tab reads
 * across both subsystems, so it needs a slice of nearly everything the
 * page derives.
 *
 * §A2's rule is that the command centre READS and the subsystems WRITE,
 * so everything here is a doorway rather than a summary: every figure
 * links somewhere that can be acted on.
 * ------------------------------------------------------------------ */

type SystemsProps = {
  empireAreas: Pillar[];
  lifeAvg: number | null;
  empireAvg: number | null;
  lifeWorst: Pillar | null;
  liveVentures: Venture[];
  building: Venture[];
  parked: Venture[];
  debt: { value: number } | null;
  cleared: { peak: number; latest: number; percent: number } | null;
  steps: { value: number } | null;
  sleep: { value: number } | null;
  netMonth: number | null;
};

export default function SystemsTab({
  empireAreas,
  lifeAvg,
  empireAvg,
  lifeWorst,
  liveVentures,
  building,
  parked,
  debt,
  cleared,
  steps,
  sleep,
  netMonth,
}: SystemsProps) {
  return (
          <div className="grid gap-5 lg:grid-cols-2 items-start">
          {/* ===== LIFE_OS ===== */}
          <section
            className="sys-life card p-4 sm:p-5 grid gap-4"
            style={{ borderLeft: "4px solid var(--sys)" }}
          >
            <Link
              href="/life"
              className="flex items-center gap-2.5 no-underline text-[var(--text)]"
            >
              <span
                aria-hidden
                className="w-[9px] h-[9px] rounded-full shrink-0"
                style={{ background: "var(--sys)" }}
              />
              <span
                className="mono text-[0.72rem] font-bold tracking-[0.14em]"
                style={{ color: "var(--sys)" }}
              >
                LIFE_OS · PERSONAL
              </span>
              <span className="mono text-[0.62rem] text-[var(--faint)] ml-auto">
                OPEN →
              </span>
            </Link>

            <div className="grid grid-cols-2 gap-2">
              <MiniStat
                label="👟 Steps"
                value={steps ? Math.round(steps.value).toLocaleString("en-GB") : "—"}
              />
              <MiniStat label="😴 Sleep" value={sleep ? `${sleep.value}h` : "—"} />
            </div>

            <div>
              <p className="label">Debt-free goal</p>
              <Link
                href="/life/debts"
                className="rounded-[10px] border border-[var(--border)] px-3.5 py-3 mt-2 block no-underline text-[var(--text)] card-hover"
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span
                    className="mono text-[1.15rem] font-semibold"
                    style={{ color: debt ? "var(--bad)" : "var(--faint)" }}
                  >
                    {formatGBP(debt?.value ?? null)}
                  </span>
                  <span
                    className="mono text-[0.68rem] ml-auto"
                    style={{ color: cleared ? "var(--good)" : "var(--faint)" }}
                  >
                    {cleared ? `${cleared.percent}% CLEARED` : "no trend yet"}
                  </span>
                </div>
                <div className="mt-2.5">
                  <Bar percent={cleared?.percent ?? 0} colour="var(--good)" height={6} />
                </div>
                <p className="text-[0.68rem] text-[var(--faint)] mt-2 leading-snug">
                  {cleared
                    ? `From a peak of ${formatGBP(cleared.peak)}. The creditors →`
                    : "A partial figure — the creditors behind it live in Debts →"}
                </p>
              </Link>
            </div>

            <div>
              <p className="label">
                Life areas · avg {lifeAvg == null ? "—" : lifeAvg.toFixed(1)}/10
              </p>
              {lifeWorst ? (
                <div className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 mt-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[0.8rem] font-medium min-w-0 truncate">
                      {lifeWorst.emoji} {lifeWorst.name}
                    </span>
                    <span className="mono text-[0.7rem] ml-auto">
                      {lifeWorst.score}/10
                    </span>
                  </div>
                  <div className="mt-2">
                    <Bar
                      percent={scoreBarPercent(lifeWorst.score)}
                      height={5}
                      colour={
                        (lifeWorst.score ?? 0) <= 3
                          ? "var(--bad)"
                          : (lifeWorst.score ?? 0) <= 6
                            ? "var(--warn)"
                            : "var(--good)"
                      }
                    />
                  </div>
                  <p className="text-[0.68rem] text-[var(--muted)] mt-1.5 leading-snug">
                    {lifeWorst.status_line ?? "Needs attention first."}
                  </p>
                </div>
              ) : (
                <p className="text-[0.76rem] text-[var(--faint)] mt-1.5 leading-relaxed">
                  Nothing scored yet — LIFE_OS ranks worst-first once you have.
                </p>
              )}
            </div>
          </section>

          {/* ===== EMPIRE_OS ===== */}
          <section
            className="sys-empire card p-4 sm:p-5 grid gap-4"
            style={{ borderLeft: "4px solid var(--sys)" }}
          >
            <Link
              href="/empire"
              className="flex items-center gap-2.5 no-underline text-[var(--text)]"
            >
              <span
                aria-hidden
                className="w-[9px] h-[9px] rounded-full shrink-0"
                style={{ background: "var(--sys)" }}
              />
              <span
                className="mono text-[0.72rem] font-bold tracking-[0.14em]"
                style={{ color: "var(--sys)" }}
              >
                EMPIRE_OS · BUSINESS
              </span>
              <span className="mono text-[0.62rem] text-[var(--faint)] ml-auto">
                OPEN →
              </span>
            </Link>

            <div>
              <p className="label">Cash this month</p>
              <div className="rounded-[10px] border border-[var(--border)] px-3.5 py-3 mt-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span
                    className="mono text-[1.25rem] font-semibold"
                    style={{
                      color:
                        netMonth == null
                          ? "var(--faint)"
                          : netMonth >= 0
                            ? "var(--good)"
                            : "var(--bad)",
                    }}
                  >
                    {formatGBP(netMonth)}
                  </span>
                  <span className="mono text-[0.66rem] text-[var(--faint)] ml-auto">
                    {building.length} in dev
                  </span>
                </div>
                <p className="text-[0.68rem] text-[var(--muted)] mt-1.5 leading-snug">
                  {netMonth == null
                    ? "No asset carries an income or cost figure yet — a dash, not a zero."
                    : "Assets earning minus assets costing."}
                </p>
              </div>
            </div>

            <div>
              <p className="label">Stage board</p>
              <div className="grid gap-1.5 mt-2">
                {liveVentures.length === 0 ? (
                  <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed">
                    No live divisions.
                  </p>
                ) : (
                  liveVentures.map((v) => {
                    // Its own dashboard, unless it is a pointer row.
                    const href = isExternal(v) ? null : divisionHref(v.name);
                    const inner = (
                      <>
                        <span
                          aria-hidden
                          className="w-[6px] h-[6px] rounded-full shrink-0"
                          style={{ background: STAGE_COLOUR[v.stage] }}
                        />
                        <span className="text-[0.8rem] flex-1 min-w-0 truncate">
                          {v.name}
                        </span>
                        <span
                          className="mono text-[0.62rem] font-bold shrink-0 uppercase"
                          style={{ color: STAGE_COLOUR[v.stage] }}
                        >
                          {STAGE_LABEL[v.stage]}
                        </span>
                      </>
                    );
                    const cls =
                      "flex items-center gap-2.5 rounded-[8px] border border-[var(--border)] px-3 py-2";
                    return href ? (
                      <Link
                        key={v.id}
                        href={href}
                        className={`${cls} card-hover no-underline text-[var(--text)]`}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div key={v.id} className={cls}>
                        {inner}
                      </div>
                    );
                  })
                )}
              </div>
              {parked.length > 0 && (
                <p className="text-[0.68rem] text-[var(--faint)] mt-2 leading-relaxed">
                  Backlog: {parked.map((v) => v.name).join(" · ")}
                </p>
              )}
            </div>

            <div>
              <p className="label">
                Empire areas · avg {empireAvg == null ? "—" : empireAvg.toFixed(1)}/10
              </p>
              <p className="text-[0.72rem] text-[var(--muted)] mt-1.5 leading-relaxed">
                {empireAvg == null
                  ? "Score the five business areas in EMPIRE_OS and this starts telling you something."
                  : `${empireAreas.filter((a) => a.score != null).length} of ${empireAreas.length} scored.`}
              </p>
            </div>

            <Link
              href="/empire"
              className="rounded-[10px] border px-3.5 py-3 no-underline block card-hover"
              style={{ borderColor: "var(--sys)" }}
            >
              <p className="label" style={{ color: "var(--sys)" }}>
                CEO dashboard · live
              </p>
              <p className="text-[0.82rem] font-semibold mt-1 text-[var(--text)]">
                See the whole path to revenue →
              </p>
            </Link>
          </section>
        </div>
  );
}
