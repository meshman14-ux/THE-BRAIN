import Link from "next/link";
import { LIFE_PARENTS, boardLine, parentById, type ParentReport } from "@/lib/parents";

/* ------------------------------------------------------------------ *
 * The board — five areas, five lines, one panel
 *
 * What the compression bought. Eleven flat pages became five areas that
 * can each answer for themselves, which means the command centre carries
 * the whole of LIFE_OS in the space one panel used to take.
 *
 * EVERY PARENT SPEAKS, including the healthy ones. An area that goes
 * silent when it is fine is indistinguishable from one that is broken,
 * and a board you cannot see all of is not a board.
 *
 * It sits below the one line and THE COG for the same reason those two
 * are ordered the way they are: the one line says the single thing that
 * needs him today, the pulse says what to do next, and this says how the
 * whole picture stands. Specific first, general after.
 * ------------------------------------------------------------------ */

const TONE: Record<ParentReport["state"], string> = {
  ok: "var(--good)",
  note: "var(--warn)",
  warn: "var(--bad)",
};

export default function Board({ reports }: { reports: ParentReport[] }) {
  return (
    <section className="panel">
      <div className="flex items-baseline gap-3 flex-wrap">
        <p className="label m-0">LIFE_OS · the board</p>
        <p className="text-[0.78rem] font-semibold m-0">{boardLine(reports)}</p>
        <Link
          href="/life"
          className="text-[0.7rem] no-underline ml-auto"
          style={{ color: "var(--accent)" }}
        >
          OPEN →
        </Link>
      </div>

      <ul className="grid gap-0 mt-3 list-none p-0 m-0">
        {reports.map((r) => {
          const parent = parentById(r.id);
          if (!parent) return null;
          return (
            <li key={r.id} className="border-t border-[var(--border)] first:border-t-0">
              <Link
                href={parent.href}
                className="flex items-baseline gap-3 no-underline text-[var(--text)] py-2.5"
              >
                <span
                  aria-hidden
                  className="w-[6px] h-[6px] rounded-full shrink-0 translate-y-[-2px]"
                  style={{ background: TONE[r.state] }}
                />
                <span className="mono text-[0.62rem] font-bold uppercase tracking-[0.1em] shrink-0 w-[68px] text-[var(--faint)]">
                  {parent.name}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[0.82rem] leading-snug"
                    style={{ color: r.state === "ok" ? "var(--text)" : TONE[r.state] }}
                  >
                    {r.line}
                  </span>
                  {/* A score never travels without its working. A number you
                      cannot interrogate is a number you stop believing. */}
                  {r.working && (
                    <span className="block text-[0.7rem] text-[var(--faint)] leading-relaxed mt-0.5">
                      {r.working}
                    </span>
                  )}
                  {r.stale && (
                    <span
                      className="block text-[0.7rem] leading-relaxed mt-0.5"
                      style={{ color: "var(--warn)" }}
                    >
                      {r.stale}
                    </span>
                  )}
                </span>
                {r.score != null && (
                  <span className="mono text-[0.8rem] font-bold shrink-0 text-[var(--faint)]">
                    {r.score}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-[0.68rem] text-[var(--faint)] mt-3 pt-2.5 border-t border-[var(--border)] leading-relaxed m-0">
        {LIFE_PARENTS.length} areas, each answering one question. EMPIRE_OS joins the board
        once its five parents are confirmed — grouping the divisions by how each one earns is
        a judgement only you can make.
      </p>
    </section>
  );
}
