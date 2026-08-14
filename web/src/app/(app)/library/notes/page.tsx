import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Note } from "@/lib/types";
import { neighbours, type LinkRow } from "@/lib/links";
import NoteVault from "@/components/NoteVault";
import SurfaceTabs from "@/components/SurfaceTabs";
import { LIBRARY_VIEWS } from "@/lib/surfaces";

export const dynamic = "force-dynamic";

/**
 * The vault — Phase 3's writing surface.
 *
 * It lives under `/library` rather than getting its own nav item, and that is
 * a measured decision rather than a shy one: `brain` mode already carries
 * THIRTEEN nav items inside a 1200px header with about 27px to spare, and the
 * layout's own comment says the honest response to a fourteenth is a shorter
 * label or fewer items, not another padding shave. The vault is reference
 * material; `/library` is where reference material lives.
 *
 * The discoverable path is triage: an inbox capture can now be routed to a
 * note as well as to a task, which is the loop §A2 already describes — THE
 * BRAIN owns the inbox and composes everything else.
 */
export default async function NotesPage() {
  const supabase = await createClient();

  const [{ data: notes }, { data: links }, { data: pillars }] = await Promise.all([
    supabase
      .from("notes")
      .select("id, title, body, kind, tags, starred, pillar_id, meta, created_at")
      // Principles and the creed are read at /library/principles and are not
      // editable here — see isEditableNote(). Excluding them keeps the vault
      // a place for what he writes rather than what he collected.
      .eq("kind", "note")
      .order("created_at", { ascending: false }),
    supabase.from("links").select("id, from_type, from_id, to_type, to_id, relation"),
    supabase
      .from("pillars")
      .select("id, name, emoji, system, sort_order")
      .eq("active", true)
      .order("sort_order"),
  ]);

  const all = (notes ?? []) as Note[];
  const allLinks = (links ?? []) as LinkRow[];

  // Link counts are derived here rather than in the client, so the list can
  // stay a server render and the count cannot disagree with the note page.
  const counts: Record<string, number> = {};
  for (const n of all) {
    counts[n.id] = neighbours(allLinks, { type: "note", id: n.id }).length;
  }

  return (
    <div className="max-w-[860px] mx-auto grid gap-6">
      <SurfaceTabs label="Library" views={LIBRARY_VIEWS} active="notes" />
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">The library · vault</p>
          <Link
            href="/library"
            className="ml-auto text-[0.74rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
          >
            ← reference shelves
          </Link>
        </div>
        <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold mt-1.5">Notes</h1>
        <p className="text-sm text-[var(--muted)] mt-2.5 max-w-[68ch] leading-relaxed">
          {all.length === 0
            ? "Nothing written yet. A note needs a body and nothing else — no title, no area, no tags. Everything above that is optional and stays optional."
            : `${all.length} ${all.length === 1 ? "note" : "notes"}. Link one to an area, a division or a task and it shows up on both — write the link once, read it from either end.`}
        </p>
      </header>

      <NoteVault
        notes={all}
        pillars={(pillars ?? []) as { id: string; name: string; emoji: string | null }[]}
        counts={counts}
      />
    </div>
  );
}
