import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toIso } from "@/lib/logic";
import { ParentHeader, ParentSection } from "@/components/ParentShell";
import { normaliseView, parentById } from "@/lib/parents";
import {
  MAINTENANCE_LOAD,
  type Division,
  type DivisionRow,
  divisionsFrom,
  divisionsIn,
  empireShape,
  pipelineSplit,
} from "@/lib/empire";
import { divisionHref } from "@/lib/references";
import { Empty } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * One EMPIRE parent
 *
 * Five parents share this page, because they differ in WHAT is filed
 * under them and not in how you read them. The one place that varies is
 * Pipeline, which splits into a queue and a menu — two different
 * promises, and the only parent where the distinction changes what the
 * page should say.
 *
 * A COMPONENT rather than a route. `/empire/[id]` already owns this level
 * of the path for the division cockpits, and Next.js will not accept two
 * differently-named dynamic segments as siblings. Delegating from there
 * keeps the honest URL — `/empire/property` — without inventing
 * `/empire/area/property` to dodge a framework rule.
 * ------------------------------------------------------------------ */

export default async function EmpireParent({
  parentId,
  tab,
}: {
  parentId: string;
  tab?: string;
}) {
  const parent = parentById(parentId);
  // Only EMPIRE parents render here. Anything else is a wrong turn.
  if (!parent || parent.layer !== "empire") notFound();

  const view = normaliseView(parent, tab);
  const supabase = await createClient();
  const today = toIso(new Date());

  const { data: ventureRows } = await supabase
    .from("ventures")
    .select("id, name, status, stage, one_liner, created_at, meta")
    .order("sort_order");

  const all = divisionsFrom((ventureRows ?? []) as DivisionRow[]);
  const mine = divisionsIn(all, parent.id);
  const load = MAINTENANCE_LOAD[parent.id];
  const shape = empireShape(all);

  /* -- what this parent says about itself --------------------------- */

  const live = mine.filter((d) => d.live);
  const line =
    mine.length === 0
      ? `Nothing filed under ${parent.name} yet.`
      : parent.id === "pipeline"
        ? pipelineSplit(all).line
        : live.length === 0
          ? `${mine.length} filed, none running.`
          : `${live.length} running.`;

  return (
    <div className="sys-empire grid gap-7 max-w-[900px]">
      <ParentHeader
        parent={parent}
        view={view}
        line={line}
        state={mine.length === 0 ? "note" : "ok"}
        working={load?.line}
      />

      {parent.id === "pipeline" ? (
        <>
          {/* Queue and menu are different PROMISES, and the page says which
              is which rather than presenting ten equal ideas. */}
          <ParentSection id="queue" title="Queue — you said you will start these" view={view}>
            <DivisionList divisions={pipelineSplit(all).queue} today={today} />
          </ParentSection>
          <ParentSection id="menu" title="Menu — you might, and nothing expects it" view={view}>
            <DivisionList divisions={pipelineSplit(all).menu} today={today} />
          </ParentSection>
        </>
      ) : (
        parent.views.map((v) => (
          <ParentSection key={v.id} id={v.id} title={v.label} view={view}>
            <DivisionList
              divisions={
                // The first view of every parent is the running ones, the
                // second is everything else. Two views, one rule.
                v.id === parent.views[0].id ? live : mine.filter((d) => !d.live)
              }
              today={today}
            />
          </ParentSection>
        ))
      )}

      {/* The one number the old flat structure could not produce. It sits
          on every parent page rather than only one, because the ratio is
          the point of the grouping and it is worth meeting wherever you
          land. */}
      <section className="panel">
        <p className="label m-0">The shape</p>
        <p className="text-[0.84rem] leading-relaxed mt-2 m-0">{shape.line}</p>
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed mt-2 m-0">
          Counted across running divisions only — an idea that would one day earn without you
          is not earning anything today, and counting intentions is how a portfolio flatters
          itself.
        </p>
      </section>
    </div>
  );
}

function DivisionList({ divisions, today }: { divisions: Division[]; today: string }) {
  if (divisions.length === 0) {
    return <Empty>Nothing here yet.</Empty>;
  }
  return (
    <ul className="grid gap-1.5 list-none p-0 m-0">
      {divisions.map((d) => (
        <li key={d.id} className="rounded-[9px] border border-[var(--border)] px-3 py-2.5">
          <Link
            href={divisionHref(d.name)}
            className="flex items-baseline gap-2.5 no-underline text-[var(--text)]"
          >
            <span className="text-[0.86rem] font-medium min-w-0 flex-1">
              {d.name}
              {d.oneLiner && (
                <span className="block text-[0.72rem] text-[var(--faint)] mt-0.5 leading-snug">
                  {d.oneLiner}
                </span>
              )}
            </span>
            {/* The proving ground is marked wherever it appears. It is the
                one thing everything else is meant to stay quiet around. */}
            {d.proving && (
              <span
                className="mono text-[0.56rem] font-bold uppercase tracking-[0.1em] shrink-0"
                style={{ color: "var(--accent)" }}
              >
                Proving
              </span>
            )}
            {d.operated && (
              <span className="mono text-[0.56rem] uppercase tracking-[0.1em] shrink-0 text-[var(--faint)]">
                Operated
              </span>
            )}
            {d.stage && (
              <span className="mono text-[0.6rem] uppercase tracking-[0.08em] shrink-0 text-[var(--faint)]">
                {d.stage}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
