import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { placeholderFor, type Placeholder } from "@/lib/placeholders";
import {
  refsForBranch,
  BRANCH_RELATED,
  BRANCH_ALIASES,
  ventureSlug,
  EXTERNAL_VENTURES,
} from "@/lib/references";
import { STAGE_LABEL, type VentureStage } from "@/lib/types";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * A branch page. The view itself may not be built yet, but the branch is
 * real: it says what it will become, links to where it already lives in the
 * system, and carries its reference shelf — so the page is useful today,
 * not an apology.
 *
 * Resolution order: a hand-written registry row, then a retired-slug alias,
 * then the ventures table itself. That last step is what stops a renamed or
 * newly added division from 404ing while somebody remembers to edit a file.
 */
export default async function BranchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // A renamed branch keeps its old address working rather than dying.
  const alias = BRANCH_ALIASES[slug];
  if (alias) redirect(`/${alias}`);

  let p: Placeholder | undefined = placeholderFor(slug);

  if (!p) {
    const supabase = await createClient();
    const { data: ventures } = await supabase
      .from("ventures")
      .select("name, stage, status, one_liner");
    const match = (ventures ?? []).find(
      (v: { name: string }) =>
        ventureSlug(v.name) === slug && !EXTERNAL_VENTURES.has(v.name)
    ) as
      | { name: string; stage: VentureStage; status: string; one_liner: string | null }
      | undefined;
    if (match) {
      const shelved = match.status !== "active";
      p = {
        slug,
        name: match.name,
        what:
          (match.one_liner ? `${match.one_liner}. ` : "") +
          (shelved
            ? "Parked in the backlog. When it wakes, this page becomes its cockpit."
            : "A live division. This page becomes its cockpit: the projects, the numbers and the next move."),
        phase: `${shelved ? "Backlog" : `${STAGE_LABEL[match.stage]} stage`} · EMPIRE_OS`,
      };
    }
  }

  if (!p) notFound();

  const refs = refsForBranch(slug);
  const related = BRANCH_RELATED[slug] ?? {};

  // Pillar links are per-user ids, so resolve the names at render time.
  let pillarLinks: { id: string; name: string; emoji: string | null }[] = [];
  if (related.pillars?.length) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("pillars")
      .select("id, name, emoji")
      .in("name", related.pillars);
    pillarLinks = data ?? [];
  }

  const hasStrings = (related.routes?.length ?? 0) + pillarLinks.length > 0;

  return (
    <div className="max-w-[720px] mx-auto grid gap-6 pt-4">
      <header className="text-center">
        <p className="label">Not built yet</p>
        <h1 className="text-[1.7rem] font-semibold mt-2">{p.name}</h1>
        <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed max-w-[58ch] mx-auto">
          {p.what}
        </p>
        <p className="mono text-[0.72rem] text-[var(--faint)] mt-3">{p.phase}</p>
      </header>

      {hasStrings && (
        <Panel title="Already in the system" hint="the strings this branch hangs from">
          <div className="grid gap-1.5">
            {pillarLinks.map((pl) => (
              <Link
                key={pl.id}
                href={`/pillar/${pl.id}`}
                className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 no-underline text-[var(--text)] card-hover flex items-center gap-2"
              >
                <span className="text-[0.84rem] font-medium">
                  {pl.emoji} {pl.name}
                </span>
                <span className="text-[0.7rem] text-[var(--faint)] ml-auto">
                  the area this reports into →
                </span>
              </Link>
            ))}
            {related.routes?.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 no-underline text-[var(--text)] card-hover flex items-center gap-2"
              >
                <span className="text-[0.84rem] font-medium">{r.label}</span>
                <span className="text-[0.7rem] text-[var(--faint)] ml-auto">→</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {refs.length > 0 && (
        <Panel
          title="Reference shelf"
          hint="curated, UK-focused"
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

      <div className="flex gap-2 justify-center">
        <Link href="/dashboard" className="btn btn-ghost no-underline">
          ← THE BRAIN
        </Link>
        <Link href="/capture" className="btn no-underline">
          Capture a thought
        </Link>
      </div>
      <p className="text-[0.74rem] text-[var(--faint)] text-center leading-relaxed">
        This page exists so the system&apos;s shape is visible before every part
        of it is built. What you capture now will already be here when it is.
      </p>
    </div>
  );
}
