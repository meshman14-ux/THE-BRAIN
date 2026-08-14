"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LINKABLE,
  LINKABLE_TYPES,
  DEFAULT_RELATION,
  canLink,
  type LinkRow,
  type LinkableType,
  type Subject,
  type ResolvedEnd,
} from "@/lib/links";


/**
 * What links here — and the box that adds one.
 *
 * The panel is the same on every subject, because a link is symmetric to read
 * even though it is stored with a direction. A note linked to an area shows
 * the area here and shows the note over there, from the one row.
 */
export default function LinkPanel({
  subject,
  ends,
  allLinks,
  title = "Linked",
}: {
  subject: Subject;
  ends: ResolvedEnd[];
  allLinks: LinkRow[];
  title?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<LinkableType>("pillar");
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function search(nextType: LinkableType, text: string) {
    setType(nextType);
    setQ(text);
    setErr("");
    if (text.trim() === "") {
      setOptions([]);
      return;
    }
    const spec = LINKABLE[nextType];
    const { data, error } = await supabase
      .from(spec.table)
      .select(`id, ${spec.titleColumn}`)
      .ilike(spec.titleColumn, `%${text.trim()}%`)
      .limit(8);
    if (error) {
      setErr(error.message);
      return;
    }
    setOptions(
      ((data ?? []) as unknown as Record<string, unknown>[])
        .map((r) => ({ id: String(r.id), title: String(r[spec.titleColumn] ?? "") }))
        .filter((o) => o.title !== "")
    );
  }

  async function add(target: { id: string; title: string }) {
    const check = canLink(allLinks, subject, { type, id: target.id });
    if (!check.ok) {
      setErr(check.reason);
      return;
    }
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("links").insert({
      from_type: subject.type,
      from_id: subject.id,
      to_type: type,
      to_id: target.id,
      relation: DEFAULT_RELATION,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setQ("");
    setOptions([]);
    setAdding(false);
    router.refresh();
  }

  async function remove(linkId: string) {
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("links").delete().eq("id", linkId);
    setBusy(false);
    if (error) setErr(error.message);
    else router.refresh();
  }

  return (
    <section className="panel grid gap-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="label">{title}</h2>
        <span className="text-[0.7rem] text-[var(--faint)]">
          written once, read from both ends
        </span>
        <button className="chip ml-auto" onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "+ link"}
        </button>
      </div>

      {err && (
        <p className="text-[0.8rem] m-0" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}

      {adding && (
        <div className="grid gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {LINKABLE_TYPES.map((t) => (
              <button
                key={t}
                className="chip"
                data-active={type === t ? "true" : "false"}
                onClick={() => void search(t, q)}
              >
                {LINKABLE[t].label}
              </button>
            ))}
          </div>
          <input
            className="input"
            autoFocus
            placeholder={`Find a ${LINKABLE[type].label.toLowerCase()}…`}
            value={q}
            onChange={(e) => void search(type, e.target.value)}
          />
          {options.length > 0 && (
            <ul className="grid gap-1.5 list-none p-0 m-0">
              {options.map((o) => (
                <li key={o.id} className="min-w-0">
                  <button
                    className="chip w-full justify-start"
                    disabled={busy}
                    onClick={() => void add(o)}
                  >
                    <span className="truncate">{o.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {ends.length === 0 ? (
        <p className="text-[0.84rem] text-[var(--muted)] leading-relaxed">
          Nothing linked yet. A link is one row that shows on both things, so
          attaching this to an area also puts it on the area&rsquo;s page.
        </p>
      ) : (
        <ul className="grid gap-1.5 list-none p-0 m-0">
          {ends.map((e) => {
            const spec = LINKABLE[e.type];
            return (
              <li
                key={e.linkId}
                // `min-w-0` on the ROW: the title truncates, and a nowrap
                // child otherwise contributes its whole string to the track.
                // `items-stretch` + a 44px row, so the title ANCHOR fills the
                // row rather than being a 20px line of text inside it. It
                // measured 20.4px before this — the row looked tappable and
                // only the words were. 46 rather than 44 because the row is
                // border-box: 1px of border top and bottom leaves the anchor
                // exactly 44.
                className="min-w-0 flex items-stretch gap-2.5 rounded-[9px] border border-[var(--border)] px-3 min-h-[46px]"
              >
                <span
                  className="mono text-[0.62rem] shrink-0 uppercase tracking-wide flex items-center"
                  style={{ color: "var(--faint)" }}
                >
                  {spec.label}
                </span>
                <Link
                  href={spec.href(e.id)}
                  className="text-[0.85rem] min-w-0 flex-1 flex items-center no-underline"
                  style={{
                    color: "var(--text)",
                    // A chip that looks like a deep link and lands on a list
                    // is a small lie, so the ones without their own page are
                    // visibly softer.
                    opacity: spec.reach === "item" ? 1 : 0.75,
                  }}
                >
                  <span className="truncate">{e.title}</span>
                </Link>
                <button
                  className="chip shrink-0 self-center"
                  disabled={busy}
                  title="Remove this link"
                  onClick={() => void remove(e.linkId)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
