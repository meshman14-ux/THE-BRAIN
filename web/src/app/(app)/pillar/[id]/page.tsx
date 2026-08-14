import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Pillar } from "@/lib/types";
import { refsForPillar } from "@/lib/references";
import { neighbours, type LinkRow } from "@/lib/links";
import { resolveEnds } from "@/lib/links-server";
import LinkPanel from "@/components/LinkPanel";

export const dynamic = "force-dynamic";

export default async function PillarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pillar } = await supabase
    .from("pillars")
    .select("id, system, name, emoji, standard, sort_order, active")
    .eq("id", id)
    .maybeSingle();

  if (!pillar) notFound();
  const p = pillar as Pillar;

  const [
    { data: goals },
    { data: projects },
    { data: tasks },
    { data: notes },
    { data: links },
  ] = await Promise.all([
      supabase
        .from("goals")
        .select("id, title, target_date, progress")
        .eq("pillar_id", id)
        .eq("status", "active"),
      supabase
        .from("projects")
        .select("id, title, due_date")
        .eq("pillar_id", id)
        .eq("status", "active"),
      supabase
        .from("tasks")
        .select("id, title, do_date, energy")
        .eq("pillar_id", id)
        .eq("status", "open")
        .order("do_date", { nullsFirst: false }),
      supabase
        .from("notes")
        .select("id, title, created_at")
        .eq("pillar_id", id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("links")
        .select("id, from_type, from_id, to_type, to_id, relation"),
    ]);

  // "What links here" — the other half of Phase 3. The link was written on
  // the note; it shows up on the area because `neighbours` reads both columns
  // rather than only the one pointing this way.
  const allLinks = (links ?? []) as LinkRow[];
  const linkEnds = await resolveEnds(
    supabase as unknown as Parameters<typeof resolveEnds>[0],
    neighbours(allLinks, { type: "pillar", id })
  );

  const sysClass = p.system === "life" ? "sys-life" : "sys-empire";
  const systemHref = p.system === "life" ? "/life" : "/empire";
  const systemLabel = p.system === "life" ? "LIFE_OS" : "EMPIRE_OS";
  const refs = refsForPillar(p.name);

  return (
    <div className={`${sysClass} max-w-[860px] mx-auto grid gap-7`}>
      <header>
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href={systemHref}
            className="text-sm text-[var(--muted)] no-underline hover:text-[var(--text)]"
          >
            ← {systemLabel}
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-[var(--faint)] no-underline hover:text-[var(--text)]"
          >
            · THE BRAIN
          </Link>
        </div>
        <div className="flex items-start gap-4 mt-4">
          <span className="text-4xl leading-none select-none">
            {p.emoji ?? "◆"}
          </span>
          <div className="min-w-0">
            <p
              className="text-xs font-bold tracking-[0.12em] uppercase"
              style={{ color: "var(--accent)" }}
            >
              {p.system === "life" ? "LIFE_OS" : "EMPIRE_OS"}
            </p>
            <h1 className="text-[1.7rem] font-semibold mt-1">{p.name}</h1>
            {p.standard && (
              <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
                <span className="text-[var(--faint)]">Standard — </span>
                {p.standard}
              </p>
            )}
          </div>
        </div>
      </header>

      <Section title="Goals" empty="No goals set for this pillar yet.">
        {goals?.map((g) => (
          <Row key={g.id} title={g.title} meta={g.target_date ?? undefined} />
        ))}
      </Section>

      <Section title="Projects" empty="No active projects here.">
        {projects?.map((pr) => (
          <Row key={pr.id} title={pr.title} meta={pr.due_date ?? undefined} />
        ))}
      </Section>

      <Section title="Open tasks" empty="Nothing open. Either done, or not started.">
        {tasks?.map((t) => (
          <Row
            key={t.id}
            title={t.title}
            meta={t.do_date ?? undefined}
            chip={t.energy}
          />
        ))}
      </Section>

      {/* Filed here by `notes.pillar_id` — a note has ONE home area, the
          same "exactly one home" rule the rest of the system keeps. Links
          below are the other thing: a note can relate to many subjects
          without any of them owning it. */}
      <Section title="Notes" empty="No notes filed against this pillar.">
        {notes?.map((n) => (
          <Row
            key={n.id}
            title={n.title ?? "(untitled)"}
            meta={new Date(n.created_at).toLocaleDateString()}
          />
        ))}
      </Section>

      <LinkPanel
        subject={{ type: "pillar", id }}
        ends={linkEnds}
        allLinks={allLinks}
        title="What links here"
      />

      {refs.length > 0 && (
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <h2
              className="text-xs font-bold tracking-[0.12em] uppercase"
              style={{ color: "var(--accent)" }}
            >
              Reference shelf
            </h2>
            <Link
              href="/library"
              className="ml-auto text-[0.72rem] font-semibold no-underline"
              style={{ color: "var(--accent)" }}
            >
              FULL LIBRARY →
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {refs.map((r) => (
              <a
                key={r.url}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card card-hover px-4 py-3 no-underline text-[var(--text)] block"
              >
                <p className="text-[0.84rem] font-medium leading-snug">
                  {r.title} <span className="text-[var(--faint)]">↗</span>
                </p>
                <p className="text-[0.72rem] text-[var(--muted)] mt-0.5 leading-snug">
                  {r.why}
                </p>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children?: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = !arr || (Array.isArray(arr) && arr.length === 0);
  return (
    <section>
      <h2
        className="text-xs font-bold tracking-[0.12em] uppercase mb-3"
        style={{ color: "var(--accent)" }}
      >
        {title}
      </h2>
      {isEmpty ? (
        <p className="text-sm text-[var(--faint)] card px-4 py-3.5">{empty}</p>
      ) : (
        <div className="grid gap-2">{arr}</div>
      )}
    </section>
  );
}

function Row({
  title,
  meta,
  chip,
}: {
  title: string;
  meta?: string;
  chip?: string;
}) {
  return (
    <div className="card px-4 py-3.5 flex items-center gap-3">
      <span className="text-sm flex-1 min-w-0">{title}</span>
      {chip && <span className="chip">{chip}</span>}
      {meta && (
        <span className="text-xs text-[var(--faint)] shrink-0">{meta}</span>
      )}
    </div>
  );
}
