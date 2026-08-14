"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Note } from "@/lib/types";
import { noteTitle, noteHasContent, parseTags } from "@/lib/links";

/**
 * One note, edited where it stands.
 *
 * Same discipline as InlineValue: no Save-and-navigate, blur commits, and a
 * skipped field writes NULL rather than "". Delete asks once, because a note
 * is the one thing here with no other copy — a task can be re-made from the
 * thing that needed doing, a thought cannot.
 */
export default function NoteEditor({
  note,
  pillars,
}: {
  note: Note;
  pillars: { id: string; name: string; emoji: string | null }[];
}) {
  const [title, setTitle] = useState(note.title ?? "");
  const [body, setBody] = useState(note.body ?? "");
  const [tags, setTags] = useState(note.tags.join(", "));
  const [pillarId, setPillarId] = useState(note.pillar_id ?? "");
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function save() {
    if (!noteHasContent({ title, body })) return;
    setErr("");
    const { error } = await supabase
      .from("notes")
      .update({
        title: title.trim() === "" ? null : title.trim(),
        body: body.trim() === "" ? null : body.trim(),
        tags: parseTags(tags),
        pillar_id: pillarId === "" ? null : pillarId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", note.id);
    if (error) {
      setErr(error.message);
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
    router.refresh();
  }

  async function remove() {
    setErr("");
    // The link rows are NOT cleaned up here, and that is deliberate rather
    // than an oversight: `links` has no foreign keys — it cannot, the target
    // could be any table — so a dangling row is normal and `resolveEnds`
    // already drops what no longer resolves. Deleting them here would need a
    // two-sided sweep that could half-fail; leaving them costs one skipped
    // chip on the next render.
    const { error } = await supabase.from("notes").delete().eq("id", note.id);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/library/notes");
    router.refresh();
  }

  const heading = noteTitle({ title, body });

  return (
    <section className="panel grid gap-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h1 className="text-[1.35rem] font-semibold m-0 min-w-0">
          {heading ?? "Empty note"}
        </h1>
        {saved && (
          <span className="mono text-[0.66rem]" style={{ color: "var(--good)" }}>
            SAVED
          </span>
        )}
      </div>

      {err && (
        <p className="text-[0.82rem] m-0" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}

      <textarea
        className="input min-h-[11rem] resize-y"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={save}
        placeholder="The thought."
      />

      <input
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        placeholder="Title — leave it and the first line becomes one"
      />

      <input
        className="input"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        onBlur={save}
        placeholder="Tags, comma separated"
      />

      <select
        className="input"
        value={pillarId}
        aria-label="Area"
        onChange={(e) => {
          setPillarId(e.target.value);
          // A select has no meaningful blur, so it commits on change.
          window.setTimeout(save, 0);
        }}
      >
        <option value="">No area</option>
        {pillars.map((p) => (
          <option key={p.id} value={p.id}>
            {p.emoji ? `${p.emoji} ` : ""}
            {p.name}
          </option>
        ))}
      </select>

      <div className="flex gap-2 items-center flex-wrap">
        {confirming ? (
          <>
            <button className="btn" style={{ background: "var(--bad)" }} onClick={remove}>
              Delete for good
            </button>
            <button className="chip" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button className="chip" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
        <span className="text-[0.72rem] text-[var(--faint)] ml-auto">
          Saves when you look away
        </span>
      </div>
    </section>
  );
}
