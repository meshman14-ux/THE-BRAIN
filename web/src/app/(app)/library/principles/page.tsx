import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Note, type Pillar } from "@/lib/types";
import { notesOfKind, creedNote, jayMarks } from "@/lib/logic";
import { creedFrom } from "@/lib/creed";
import Principles from "@/components/Principles";
import SurfaceTabs from "@/components/SurfaceTabs";
import { LIBRARY_VIEWS } from "@/lib/surfaces";

export const dynamic = "force-dynamic";

/**
 * The principle library — ten checklists Jay collected, filed under the
 * areas they belong to.
 *
 * Deliberately a destination and never a notification. Nothing on this page
 * is surfaced on the dashboard, in the watchtower, or anywhere else that
 * arrives uninvited: ninety bullet points of general advice pushed at him
 * is precisely the clutter the worst-first design exists to prevent. He
 * comes here when he wants it.
 */
export default async function PrinciplesPage() {
  const supabase = await createClient();

  const [{ data: notes }, { data: pillars }] = await Promise.all([
    supabase
      .from("notes")
      .select("id, title, body, kind, tags, starred, pillar_id, meta, created_at")
      .in("kind", ["principle", "creed"])
      .order("title"),
    supabase
      .from("pillars")
      .select("id, system, name, emoji, standard, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
  ]);

  const all = (notes ?? []) as Note[];
  const principles = notesOfKind(all, "principle");
  const creed = creedNote(all);
  const lines = creedFrom(creed?.body);
  const markedCount = principles.filter((n) => jayMarks(n).any).length;

  return (
    <div className="max-w-[860px] mx-auto grid gap-7">
      <SurfaceTabs label="Library" views={LIBRARY_VIEWS} active="principles" />
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">The library · principles</p>
          <Link
            href="/library"
            className="ml-auto text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
          >
            ← reference shelves
          </Link>
        </div>
        <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold mt-1.5">
          Principles
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2.5 max-w-[68ch] leading-relaxed">
          {principles.length} checklists you collected, filed under the area
          each one serves. They live here and nowhere else — nothing on this
          page will ever appear on your dashboard uninvited.{" "}
          {markedCount > 0 && (
            <>
              <b>{markedCount}</b> of them carry your own marks, and those are
              shown first inside each one.
            </>
          )}
        </p>
      </header>

      {/* The creed sits at the head of the library because it is the only
          thing here he wrote himself. */}
      {lines.length > 0 && (
        <section
          className="card p-4 sm:p-5"
          style={{ borderLeft: "4px solid var(--accent)" }}
        >
          <p
            className="text-[0.62rem] font-bold tracking-[0.16em] uppercase"
            style={{ color: "var(--accent)" }}
          >
            The creed · your own hand
          </p>
          <div className="grid gap-2.5 mt-3">
            {lines.map((l) => (
              <p
                key={l}
                className="serif text-[1rem] sm:text-[1.08rem] leading-snug"
              >
                {l}
              </p>
            ))}
          </div>
          <p className="text-[0.7rem] text-[var(--faint)] mt-3 leading-relaxed">
            Two of these you wrote in red pen in the margin; the third is your
            mission. One of them shows on THE BRAIN each day, beside the verse.
          </p>
        </section>
      )}

      {principles.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-4 py-3.5">
          <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
            No principles filed yet. They are notes with{" "}
            <span className="mono">kind = &apos;principle&apos;</span> — a
            checklist worth keeping, filed against the area it serves.
          </p>
        </div>
      ) : (
        <Principles principles={principles} pillars={(pillars ?? []) as Pillar[]} />
      )}

      <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
        A principle is not a task and never becomes one. If a line here should
        actually get done, capture it — the system will treat it as work
        instead of advice.
      </p>
    </div>
  );
}
