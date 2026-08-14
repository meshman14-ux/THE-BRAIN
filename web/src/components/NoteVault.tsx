"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Note } from "@/lib/types";
import { noteTitle, noteHasContent, searchNotes, parseTags } from "@/lib/links";

/**
 * The vault: write a note, find a note.
 *
 * The floor is a body and nothing else. Title, area and tags are all here and
 * none of them is asked for — the same zero-obligation shape as the check-in
 * and the roster. A note that costs a title before it can exist is a note that
 * does not get written, and the inbox already proved capture only survives
 * when it asks for nothing.
 */
export default function NoteVault({
  notes,
  pillars,
  counts,
}: {
  notes: Note[];
  pillars: { id: string; name: string; emoji: string | null }[];
  counts: Record<string, number>;
}) {
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [pillarId, setPillarId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const found = useMemo(() => searchNotes(notes, q), [notes, q]);

  async function add() {
    if (!noteHasContent({ title, body })) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("notes").insert({
      // Empty strings become NULL, never "". A skipped field writes NULL —
      // the system-wide law, and the reason `noteTitle` can tell an untitled
      // note from one actually called nothing.
      title: title.trim() === "" ? null : title.trim(),
      body: body.trim() === "" ? null : body.trim(),
      kind: "note",
      tags: parseTags(tags),
      pillar_id: pillarId === "" ? null : pillarId,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setBody("");
    setTitle("");
    setTags("");
    setPillarId("");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      {err && (
        <p className="text-[0.82rem] m-0" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}

      {/* -- write ------------------------------------------------- */}
      <section className="panel grid gap-3">
        <h2 className="label">Write one</h2>
        <textarea
          className="input min-h-[7rem] resize-y"
          placeholder="The thought. Everything else is optional."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        {/* The ceiling, behind one tap. Present, never demanded. */}
        {open ? (
          <div className="grid gap-2.5">
            <input
              className="input"
              placeholder="Title — leave it and the first line becomes one"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              className="input"
              placeholder="Tags, comma separated"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <select
              className="input"
              value={pillarId}
              onChange={(e) => setPillarId(e.target.value)}
              aria-label="Area"
            >
              <option value="">No area</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji ? `${p.emoji} ` : ""}
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex gap-2 items-center flex-wrap">
          <button className="btn" disabled={busy || !noteHasContent({ title, body })} onClick={add}>
            Save
          </button>
          <button className="chip" onClick={() => setOpen((v) => !v)}>
            {open ? "Fewer fields" : "Title, tags, area"}
          </button>
          <span className="text-[0.72rem] text-[var(--faint)] ml-auto">
            A body is enough
          </span>
        </div>
      </section>

      {/* -- find -------------------------------------------------- */}
      {notes.length > 0 && (
        <input
          className="input"
          placeholder={`Search ${notes.length} ${notes.length === 1 ? "note" : "notes"}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}

      {/* -- the vault --------------------------------------------- */}
      {notes.length === 0 ? null : found.length === 0 ? (
        <p className="text-[0.84rem] text-[var(--muted)] leading-relaxed">
          Nothing matches every one of those words. The search is deliberately
          AND rather than OR — with a vault this size, OR returns the vault.
        </p>
      ) : (
        <ul className="grid gap-2 list-none p-0 m-0">
          {found.map((n) => {
            const t = noteTitle(n);
            const linked = counts[n.id] ?? 0;
            return (
              <li key={n.id} className="min-w-0">
                <Link
                  href={`/library/notes/${n.id}`}
                  className="no-underline text-[var(--text)] block rounded-[10px] border border-[var(--border)] px-3.5 py-3 hover:border-[var(--accent)] transition-colors"
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[0.92rem] font-medium min-w-0 truncate">
                      {t ?? "Empty note"}
                    </span>
                    {linked > 0 && (
                      <span className="mono text-[0.66rem] shrink-0 text-[var(--faint)]">
                        {linked} linked
                      </span>
                    )}
                  </span>
                  {n.tags.length > 0 && (
                    <span className="flex gap-1.5 flex-wrap mt-1.5">
                      {n.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[0.66rem] px-1.5 py-0.5 rounded-[5px]"
                          style={{ background: "var(--bg-2)", color: "var(--muted)" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
