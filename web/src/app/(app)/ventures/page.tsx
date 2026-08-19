import Link from "next/link";
import { loadDecidedProposalKeys, loadPortfolio } from "@/lib/venture/server";
import {
  RAG_WORD,
  compareRag,
  portfolioLine,
  tierFromIrl,
} from "@/lib/venture/scoring";
import {
  proposeDormancy,
  proposeKpiSeed,
  proposePeerGap,
  proposeTierDisagreement,
} from "@/lib/venture/proposals";
import { TIER_LABEL, UNSORTED, groupOf, readTier } from "@/lib/venture/types";
import { divisionHref } from "@/lib/references";
import { toIso } from "@/lib/logic";
import { Panel } from "@/components/ui";
import VentureProposals from "@/components/venture/VentureProposals";

export const dynamic = "force-dynamic";

/**
 * THE PORTFOLIO — every venture on one page, grouped by what it belongs
 * with and coloured by whether it is doing what a venture at ITS tier
 * should be doing.
 *
 * That last clause is the whole design. Judged absolutely, an idea earning
 * nothing is failing and this page opens as sixteen red rows — which says
 * exactly as much as a page with none. Judged against its own tier, red
 * means something a reasonable person would act on today.
 *
 * `/empire` answers "how is the business doing"; `/estate` answers "what is
 * earning". This answers the third question neither does: **which of these
 * needs me, and why.**
 */
export default async function VenturesPage() {
  const today = toIso(new Date());
  const [portfolio, decided] = await Promise.all([
    loadPortfolio(today),
    loadDecidedProposalKeys(),
  ]);
  const rows = portfolio.rows;

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const g = groupOf(r.venture);
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  // Unsorted last: it is a queue to be drained, not a category.
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === UNSORTED ? 1 : b === UNSORTED ? -1 : a.localeCompare(b)
  );

  const hrefFor: Record<string, string> = {};
  for (const r of rows) hrefFor[r.venture.id] = divisionHref(r.venture.name);

  const drafts = [
    ...proposeDormancy(rows.map((r) => r.venture), today),
    ...proposeKpiSeed(rows.map((r) => ({ venture: r.venture, kpiCount: r.kpiCount }))),
    ...proposeTierDisagreement(rows.map((r) => r.venture), (v) => tierFromIrl(v.irl)),
    ...proposePeerGap(
      rows.map((r) => ({ venture: r.venture, has: r.venture.legal_structure != null })),
      { key: "legal_structure", noun: "a legal structure" }
    ),
  ].filter((d) => !decided.has(`${d.kind}:${d.venture_id}`));

  const unsorted = rows.filter((r) => !readTier(r.venture.tier)).length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1>Ventures</h1>
        <p className="text-[0.85rem] text-[var(--muted)]">{portfolioLine(portfolio.rags)}</p>
        {unsorted > 0 && (
          <p className="text-[0.78rem]" style={{ color: "var(--warn)" }}>
            {unsorted} not yet sorted. Until a venture has a tier it is read as an idea — the
            floor, never the ceiling — so its colour is the kindest honest guess rather than a
            judgement.
          </p>
        )}
      </header>

      <VentureProposals drafts={drafts} hrefFor={hrefFor} />

      {ordered.length === 0 ? (
        <Panel title="Nothing yet">
          <p className="text-[0.85rem] text-[var(--muted)]">
            No ventures. They live in EMPIRE_OS; this page is the lens over them.
          </p>
        </Panel>
      ) : (
        ordered.map(([group, members]) => (
          <Panel
            key={group}
            title={group}
            hint={`${members.length} ${members.length === 1 ? "venture" : "ventures"}`}
          >
            <ul className="flex flex-col">
              {[...members]
                .sort((a, b) =>
                  compareRag(
                    { rag: a.rag, name: a.venture.name },
                    { rag: b.rag, name: b.venture.name }
                  )
                )
                .map((r) => {
                  const tier = readTier(r.venture.tier);
                  const tone =
                    r.rag.rag === "red"
                      ? "var(--bad)"
                      : r.rag.rag === "amber"
                        ? "var(--warn)"
                        : "var(--good)";
                  return (
                    <li
                      key={r.venture.id}
                      // `min-w-0` on the ROW, not on the text: a truncating
                      // child contributes its whole string to the track's
                      // min-content, and this is where that bites (§A7).
                      className="min-w-0 flex items-center gap-2.5 py-2 border-b border-[var(--line)] last:border-0"
                    >
                      <span
                        className="shrink-0 w-2 h-2 rounded-full"
                        style={{ background: tone }}
                        title={RAG_WORD[r.rag.rag]}
                        aria-label={RAG_WORD[r.rag.rag]}
                      />
                      <Link
                        href={hrefFor[r.venture.id]}
                        className="min-w-0 flex-1 truncate text-[0.88rem] no-underline"
                      >
                        {r.venture.name}
                      </Link>
                      <span className="mono text-[0.65rem] shrink-0 hidden sm:inline" style={{ color: "var(--faint)" }}>
                        {tier ? TIER_LABEL[tier].toUpperCase() : "UNSORTED"}
                      </span>
                      <span className="mono text-[0.7rem] shrink-0 w-10 text-right" style={{ color: "var(--faint)" }}>
                        {r.score.score ?? "—"}
                      </span>
                      <span
                        className="text-[0.7rem] shrink-0 hidden md:inline w-[13rem] truncate text-right"
                        style={{ color: r.rag.rag === "green" ? "var(--faint)" : tone }}
                      >
                        {r.rag.reason}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </Panel>
        ))
      )}

      <p className="text-[0.72rem] text-[var(--faint)]">
        A score is the mean of the eight dimensions that were answered, rescaled to 0–100, with
        the basis always shown on the venture&rsquo;s own page. A dash means nothing has been
        scored — which is not the same as scoring badly.
      </p>
    </div>
  );
}
