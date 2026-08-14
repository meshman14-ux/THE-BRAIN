import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Note } from "@/lib/types";
import { neighbours, isEditableNote, type LinkRow } from "@/lib/links";
import { resolveEnds } from "@/lib/links-server";
import NoteEditor from "@/components/NoteEditor";
import LinkPanel from "@/components/LinkPanel";

export const dynamic = "force-dynamic";

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: note }, { data: links }, { data: pillars }] = await Promise.all([
    supabase
      .from("notes")
      .select("id, title, body, kind, tags, starred, pillar_id, meta, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("links").select("id, from_type, from_id, to_type, to_id, relation"),
    supabase
      .from("pillars")
      .select("id, name, emoji, system, sort_order")
      .eq("active", true)
      .order("sort_order"),
  ]);

  if (!note) notFound();
  const n = note as Note;
  const allLinks = (links ?? []) as LinkRow[];
  const ends = neighbours(allLinks, { type: "note", id });
  const resolved = await resolveEnds(supabase as unknown as Parameters<typeof resolveEnds>[0], ends);

  return (
    <div className="max-w-[760px] mx-auto grid gap-6">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">The library · vault</p>
          <Link
            href="/library/notes"
            className="ml-auto text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
          >
            ← all notes
          </Link>
        </div>
      </header>

      {isEditableNote(n) ? (
        <NoteEditor
          note={n}
          pillars={(pillars ?? []) as { id: string; name: string; emoji: string | null }[]}
        />
      ) : (
        <section className="panel grid gap-2">
          <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
            This is a {n.kind}, not a note. It is read at{" "}
            <Link href="/library/principles" style={{ color: "var(--accent)" }}>
              the principle library
            </Link>{" "}
            and is deliberately not editable here — the marks in its `meta`
            exist nowhere else, and a general-purpose editor would overwrite
            them on the first save.
          </p>
        </section>
      )}

      <LinkPanel
        subject={{ type: "note", id }}
        ends={resolved}
        allLinks={allLinks}
      />
    </div>
  );
}
