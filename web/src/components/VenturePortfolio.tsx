import Link from "next/link";
import { Panel } from "@/components/ui";
import { divisionHref } from "@/lib/references";
import {
  RAG_COLOUR,
  TIER_LABEL,
  checklistState,
  ragFor,
  tierFor,
} from "@/lib/venture";
import type { Venture } from "@/lib/types";

/**
 * The portfolio lens — every venture in one panel, grouped by what it
 * belongs with and coloured by whether it is doing what a venture at ITS
 * tier should be doing. (Harvested from the parallel venture-module
 * branch's /ventures page, landed as a panel on /empire rather than a
 * second route: /empire is already the portfolio's address.)
 *
 * Judged absolutely, an idea earning nothing is failing and this opens as
 * sixteen red rows — which says exactly as much as a page with none.
 * Judged against its own tier, red means something a reasonable person
 * would act on today. MAINFRAME never appears (§A1).
 */

type PortfolioVenture = Pick<Venture, "id" | "name" | "stage" | "status" | "external_system"> & {
  tier: string | null;
  venture_group: string | null;
  last_touched_at: string | null;
  created_at: string | null;
};

type CheckItem = {
  venture_id: string;
  due_on: string | null;
  done_at: string | null;
};

const UNSORTED = "Not yet sorted";

export default function VenturePortfolio({
  ventures,
  checklistItems,
  today,
}: {
  ventures: PortfolioVenture[];
  checklistItems: CheckItem[];
  today: string;
}) {
  const rows = ventures
    .filter((v) => v.external_system == null)
    .map((v) => {
      const { tier, assumed } = tierFor({
        stage: v.stage,
        status: v.status,
        tier: v.tier,
      });
      const mine = checklistItems.filter((c) => c.venture_id === v.id);
      const check = checklistState(
        mine.map((c, i) => ({ id: String(i), title: "", due_on: c.due_on, done_at: c.done_at })),
        today
      );
      const rag = ragFor({
        tier,
        todayIso: today,
        lastTouchedIso: v.last_touched_at,
        createdAtIso: v.created_at,
        nextObligationIso: check.nextDue,
        overdueObligation: check.overdue > 0,
      });
      return { v, tier, assumed, rag };
    });

  if (rows.length === 0) return null;

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const g = r.v.venture_group ?? UNSORTED;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  // Unsorted last: it is a queue to be drained, not a category.
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === UNSORTED ? 1 : b === UNSORTED ? -1 : a.localeCompare(b)
  );

  const ragRank = { red: 0, amber: 1, green: 2, none: 3 } as const;
  const unsorted = rows.filter((r) => r.assumed).length;
  const red = rows.filter((r) => r.rag.rag === "red").length;
  const amber = rows.filter((r) => r.rag.rag === "amber").length;

  return (
    <Panel
      title="Portfolio"
      hint={
        red + amber === 0
          ? "every venture inside its own tier's expectation"
          : `${red} red · ${amber} amber — judged against each venture's own tier, never absolutely`
      }
    >
      {unsorted > 0 && (
        <p className="text-[0.74rem] leading-relaxed" style={{ color: "var(--warn)" }}>
          {unsorted} not yet sorted — their tier is assumed from stage, so the colour is the
          kindest honest guess rather than a judgement. Each venture&apos;s own page has the
          picker.
        </p>
      )}
      <div className="grid gap-3">
        {ordered.map(([group, members]) => (
          <div key={group} className="grid gap-1">
            <p className="label">{group}</p>
            <ul className="grid list-none p-0 m-0">
              {[...members]
                .sort(
                  (a, b) =>
                    ragRank[a.rag.rag] - ragRank[b.rag.rag] ||
                    a.v.name.localeCompare(b.v.name)
                )
                .map((r) => (
                  <li
                    key={r.v.id}
                    // min-w-0 on the ROW: a truncating child contributes its
                    // whole string to the track's min-content (§A7 rule 3).
                    className="min-w-0 flex items-center gap-2.5 py-1.5 border-b border-[var(--border)] last:border-0"
                  >
                    <span
                      className="shrink-0 w-2 h-2 rounded-full"
                      style={{ background: RAG_COLOUR[r.rag.rag] }}
                      title={r.rag.why}
                      aria-label={r.rag.rag}
                    />
                    <Link
                      href={divisionHref(r.v.name)}
                      className="min-w-0 flex-1 truncate text-[0.86rem] no-underline text-[var(--text)]"
                    >
                      {r.v.name}
                    </Link>
                    <span
                      className="mono text-[0.64rem] shrink-0 hidden sm:inline"
                      style={{ color: "var(--faint)" }}
                    >
                      {TIER_LABEL[r.tier].toUpperCase()}
                      {r.assumed ? "?" : ""}
                    </span>
                    <span
                      className="text-[0.7rem] shrink-0 hidden md:inline max-w-[15rem] truncate text-right"
                      style={{
                        color: r.rag.rag === "green" || r.rag.rag === "none" ? "var(--faint)" : RAG_COLOUR[r.rag.rag],
                      }}
                    >
                      {r.rag.why}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}
