import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Pillar, SYSTEM_BLURB } from "@/lib/types";
import { areasFor } from "@/lib/logic";
import {
  PILLAR_REFS,
  BRANCH_REFS,
  branchForVenture,
  type RefLink,
} from "@/lib/references";
import { placeholderFor } from "@/lib/placeholders";

export const dynamic = "force-dynamic";

/**
 * The library — every reference shelf in one place, grouped the way the
 * system is grouped. Each shelf also lives on its own branch or area page;
 * this is the aerial view. Curated 2026-08-01, UK-focused throughout.
 */
export default async function Library() {
  const supabase = await createClient();
  const [{ data: pillars }, { data: ventures }] = await Promise.all([
    supabase
      .from("pillars")
      .select("id, system, name, emoji, standard, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
    supabase.from("ventures").select("name, sort_order").order("sort_order"),
  ]);

  const all = (pillars ?? []) as Pillar[];
  const life = areasFor(all, "life");
  const empire = areasFor(all, "empire");

  // Branch shelves that belong to LIFE (routes exist as placeholder pages).
  const lifeBranches = ["finance", "debt-payoff", "health", "food"];
  const planBranches = ["motivation", "reviews"];
  // Divisions come from the ventures table rather than a hand-kept list, so
  // a venture added or renamed shows up here without anyone editing a file.
  const divisionSlugs = ((ventures ?? []) as { name: string }[])
    .map((v) => branchForVenture(v.name))
    .filter((s): s is string => s != null);

  return (
    <div className="max-w-[920px] mx-auto grid gap-8">
      <header>
        <p className="label">The library</p>
        <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold mt-1.5">
          Reference shelves
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2.5 max-w-[68ch] leading-relaxed">
          Curated links for every branch of the system — the authoritative
          source where one exists (GOV.UK, NHS, HSE, FSA), the best practical
          guide where one doesn&apos;t. Each shelf also appears on its own
          page; this is all of them at once. House rules apply: GBP
          everywhere, no beef, Gita welcome.
        </p>
      </header>

      {/* -- LIFE_OS ------------------------------------------------ */}
      <section className="sys-life grid gap-4">
        <div className="flex items-baseline gap-3">
          <h2
            className="text-sm font-bold tracking-[0.12em] uppercase"
            style={{ color: "var(--sys)" }}
          >
            LIFE_OS
          </h2>
          <span className="text-xs text-[var(--faint)]">{SYSTEM_BLURB.life}</span>
          <Link
            href="/life"
            className="ml-auto text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--sys)" }}
          >
            OPEN →
          </Link>
        </div>
        {life.map((p) => (
          <Shelf
            key={p.id}
            title={`${p.emoji ?? ""} ${p.name}`.trim()}
            href={`/pillar/${p.id}`}
            hrefLabel="area"
            refs={PILLAR_REFS[p.name] ?? []}
          />
        ))}
        {lifeBranches.map((slug) => (
          <Shelf
            key={slug}
            title={placeholderFor(slug)?.name ?? slug}
            href={`/${slug}`}
            hrefLabel="branch"
            refs={BRANCH_REFS[slug] ?? []}
          />
        ))}
      </section>

      {/* -- EMPIRE_OS ---------------------------------------------- */}
      <section className="sys-empire grid gap-4">
        <div className="flex items-baseline gap-3">
          <h2
            className="text-sm font-bold tracking-[0.12em] uppercase"
            style={{ color: "var(--sys)" }}
          >
            EMPIRE_OS
          </h2>
          <span className="text-xs text-[var(--faint)]">{SYSTEM_BLURB.empire}</span>
          <Link
            href="/empire"
            className="ml-auto text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--sys)" }}
          >
            OPEN →
          </Link>
        </div>
        {empire.map((p) => (
          <Shelf
            key={p.id}
            title={`${p.emoji ?? ""} ${p.name}`.trim()}
            href={`/pillar/${p.id}`}
            hrefLabel="area"
            refs={PILLAR_REFS[p.name] ?? []}
          />
        ))}
        <h3 className="label mt-2">Divisions</h3>
        {divisionSlugs.map((slug) => (
          <Shelf
            key={slug}
            title={placeholderFor(slug)?.name ?? slug}
            href={`/${slug}`}
            hrefLabel="branch"
            refs={BRANCH_REFS[slug] ?? []}
          />
        ))}
      </section>

      {/* -- Method ------------------------------------------------- */}
      <section className="grid gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-bold tracking-[0.12em] uppercase text-[var(--accent)]">
            Method
          </h2>
          <span className="text-xs text-[var(--faint)]">
            how the system itself is run
          </span>
        </div>
        {planBranches.map((slug) => (
          <Shelf
            key={slug}
            title={placeholderFor(slug)?.name ?? slug}
            href={`/${slug}`}
            hrefLabel="branch"
            refs={BRANCH_REFS[slug] ?? []}
          />
        ))}
      </section>

      <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
        A link earns its place by being useful, not by being a link. If one
        rots or a better one exists, replace it in
        <span className="mono"> src/lib/references.ts</span> — the shelves
        everywhere update together.
      </p>
    </div>
  );
}

function Shelf({
  title,
  href,
  hrefLabel,
  refs,
}: {
  title: string;
  href: string;
  hrefLabel: string;
  refs: RefLink[];
}) {
  if (refs.length === 0) return null;
  return (
    <div className="card p-4">
      <div className="flex items-baseline gap-2.5 mb-2.5">
        <h3 className="text-[0.95rem] font-semibold">{title}</h3>
        <Link
          href={href}
          className="text-[0.7rem] font-semibold no-underline ml-auto shrink-0"
          style={{ color: "var(--accent)" }}
        >
          {hrefLabel} →
        </Link>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {refs.map((r) => (
          <a
            key={r.url}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[10px] border border-[var(--border)] px-3 py-2.5 no-underline text-[var(--text)] card-hover block"
          >
            <p className="text-[0.8rem] font-medium leading-snug">
              {r.title} <span className="text-[var(--faint)]">↗</span>
            </p>
            <p className="text-[0.7rem] text-[var(--muted)] mt-0.5 leading-snug">
              {r.why}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
