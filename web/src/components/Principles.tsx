"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { type Note, type Pillar } from "@/lib/types";
import {
  filterNotes,
  notesByPillar,
  noteTags,
  jayMarks,
  principleSource,
  parsePrincipleBody,
  markedBulletNumbers,
  highlightSegments,
} from "@/lib/logic";

/**
 * The principle library.
 *
 * Ninety-odd bullet points from ten checklists. The reason this is a page
 * you open rather than a panel that arrives is in `PRINCIPLES_NEVER_PUSH`:
 * general advice pushed at a dashboard is the clutter the rest of the
 * system exists to prevent.
 *
 * Nine of those ninety lines are Jay's — underlined, circled, or written in
 * the margin. Everything about this component is arranged to make those
 * nine findable: his marks sit in their own block above the book's text,
 * the points he flagged are flagged in the list itself, and the words he
 * circled are drawn circled where they actually appear.
 */
export default function Principles({
  principles: notes,
  pillars,
}: {
  principles: Note[];
  pillars: Pillar[];
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [minedOnly, setMinedOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const tags = useMemo(() => noteTags(notes), [notes]);

  const shown = useMemo(() => {
    const base = filterNotes(notes, { query, tag });
    return minedOnly ? base.filter((n) => jayMarks(n).any) : base;
  }, [notes, query, tag, minedOnly]);

  const groups = useMemo(
    () => notesByPillar(shown, pillars),
    [shown, pillars]
  );

  const markedCount = useMemo(
    () => notes.filter((n) => jayMarks(n).any).length,
    [notes]
  );

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOpen = shown.length > 0 && shown.every((n) => open.has(n.id));

  return (
    <div className="grid gap-6">
      {/* -- search + filters ---------------------------------------- */}
      <div className="grid gap-3">
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the principles — a word from any line"
          aria-label="Search principles"
        />
        <div className="flex gap-1.5 flex-wrap items-center">
          <button
            className="chip"
            data-active={tag === null && !minedOnly}
            onClick={() => {
              setTag(null);
              setMinedOnly(false);
            }}
          >
            All {notes.length}
          </button>
          {markedCount > 0 && (
            <button
              className="chip"
              data-active={minedOnly}
              onClick={() => setMinedOnly((v) => !v)}
              title="The ones you marked up yourself"
            >
              ✎ Yours {markedCount}
            </button>
          )}
          <span className="w-px h-4 bg-[var(--border)] mx-1" aria-hidden />
          {tags.map((t) => (
            <button
              key={t.tag}
              className="chip"
              data-active={tag === t.tag}
              onClick={() => setTag(tag === t.tag ? null : t.tag)}
            >
              {t.tag}
              <span className="mono ml-1 text-[0.6rem] opacity-70">{t.count}</span>
            </button>
          ))}
          {shown.length > 0 && (
            <button
              className="chip ml-auto"
              onClick={() =>
                setOpen(allOpen ? new Set() : new Set(shown.map((n) => n.id)))
              }
            >
              {allOpen ? "Collapse all" : "Read all"}
            </button>
          )}
        </div>
      </div>

      {/* -- results -------------------------------------------------- */}
      {shown.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-4 py-3.5">
          <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
            Nothing matches {query.trim() !== "" && <b>“{query.trim()}”</b>}
            {query.trim() !== "" && tag ? " under " : ""}
            {tag && <b>{tag}</b>}. The library holds {notes.length} checklists —
            clear the filters to see them all.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.pillar?.id ?? "unfiled"} className="grid gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="label">
                {g.pillar
                  ? `${g.pillar.emoji ?? ""} ${g.pillar.name}`.trim()
                  : "Unfiled"}
              </h2>
              <span className="mono text-[0.68rem] text-[var(--faint)]">
                {g.notes.length}
              </span>
              {g.pillar && (
                <Link
                  href={`/pillar/${g.pillar.id}`}
                  className="ml-auto text-[0.7rem] font-semibold no-underline"
                  style={{ color: "var(--accent)" }}
                >
                  the area →
                </Link>
              )}
            </div>
            {g.notes.map((n) => (
              <PrincipleCard
                key={n.id}
                note={n}
                open={open.has(n.id)}
                onToggle={() => toggle(n.id)}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PrincipleCard({
  note,
  open,
  onToggle,
}: {
  note: Note;
  open: boolean;
  onToggle: () => void;
}) {
  const marks = jayMarks(note);
  const source = principleSource(note);
  const body = parsePrincipleBody(note.body);
  const flagged = markedBulletNumbers(marks.marked);

  return (
    <article
      className="card overflow-hidden"
      style={marks.any ? { borderColor: "var(--accent)" } : undefined}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 card-hover"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-[0.95rem] font-semibold leading-snug">
            {note.title ?? "Untitled"}
          </h3>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="mono text-[0.64rem] text-[var(--faint)]">
              {body.bullets.length} points
            </span>
            {source && (
              <span className="text-[0.68rem] text-[var(--faint)]">{source}</span>
            )}
            {marks.any && (
              <span
                className="text-[0.62rem] font-bold uppercase tracking-[0.06em] px-1.5 py-[2px] rounded-[5px]"
                style={{
                  color: "var(--accent)",
                  background: "var(--accent-soft)",
                }}
              >
                ✎ your marks
              </span>
            )}
          </div>
        </div>
        <span
          className="mono text-[0.8rem] shrink-0 mt-0.5"
          style={{ color: "var(--faint)" }}
          aria-hidden
        >
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 grid gap-3.5 border-t border-[var(--border)] pt-3.5">
          {/* His hand first — always above the book's text. */}
          {marks.any && <MarksBlock marks={marks} />}

          {body.quote && (
            <p
              className="text-[0.82rem] italic text-[var(--muted)] leading-relaxed pl-3"
              style={{ borderLeft: "2px solid var(--border-bright)" }}
            >
              {body.quote}
            </p>
          )}

          <ol className="grid gap-2">
            {body.bullets.map((b, i) => {
              const n = i + 1;
              const isFlagged = flagged.has(n);
              return (
                <li key={n} className="flex gap-2.5 items-baseline">
                  <span
                    className="mono text-[0.66rem] font-bold shrink-0 w-[1.4em] text-right"
                    style={{
                      color: isFlagged ? "var(--accent)" : "var(--faint)",
                    }}
                  >
                    {n}
                  </span>
                  <span
                    className="text-[0.84rem] leading-relaxed"
                    style={
                      isFlagged
                        ? { color: "var(--text)", fontWeight: 600 }
                        : { color: "var(--muted)" }
                    }
                  >
                    <Circled text={b} phrases={marks.circled} />
                    {isFlagged && (
                      <span
                        className="mono text-[0.6rem] font-bold ml-1.5 align-middle"
                        style={{ color: "var(--accent)" }}
                        title="You wrote Yes beside this"
                      >
                        ✓ YES
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          {body.tail.length > 0 && (
            <div className="grid gap-1">
              {body.tail.map((t, i) => (
                <p
                  key={i}
                  className="text-[0.78rem] text-[var(--faint)] leading-relaxed"
                >
                  {t}
                </p>
              ))}
            </div>
          )}

          {note.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {note.tags.map((t) => (
                <span
                  key={t}
                  className="text-[0.62rem] font-bold uppercase tracking-[0.06em] px-1.5 py-[2px] rounded-[5px] border border-[var(--border-bright)] text-[var(--faint)]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Jay's own marks, visually separated from the book's text. This is the
 * point of the whole page: inside ninety generic bullets, nine are his.
 */
function MarksBlock({ marks }: { marks: ReturnType<typeof jayMarks> }) {
  return (
    <div
      className="rounded-[10px] px-3.5 py-3 grid gap-2"
      style={{
        background: "var(--accent-soft)",
        borderLeft: "3px solid var(--accent)",
      }}
    >
      <p
        className="text-[0.62rem] font-bold tracking-[0.14em] uppercase"
        style={{ color: "var(--accent)" }}
      >
        ✎ Your marks on this page
      </p>

      {marks.handwritten.length > 0 && (
        <div className="grid gap-1">
          {marks.handwritten.map((h) => (
            <p
              key={h}
              className="serif text-[0.88rem] leading-snug"
              style={{ color: "var(--text)" }}
            >
              “{h}”
            </p>
          ))}
          <p className="text-[0.64rem] text-[var(--muted)]">
            written in the margin, in red
          </p>
        </div>
      )}

      {marks.marked.length > 0 && (
        <div>
          <p className="label" style={{ fontSize: "0.58rem" }}>
            You wrote yes
          </p>
          <ul className="grid gap-0.5 mt-1">
            {marks.marked.map((m) => (
              <li key={m} className="text-[0.82rem] font-medium leading-snug">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {marks.circled.length > 0 && (
        <div>
          <p className="label" style={{ fontSize: "0.58rem" }}>
            You circled
          </p>
          <div className="flex gap-1.5 flex-wrap mt-1">
            {marks.circled.map((c) => (
              <span
                key={c}
                className="text-[0.74rem] px-2 py-[3px] rounded-full"
                style={{
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {marks.highlightedAll && (
        <p className="text-[0.76rem] text-[var(--muted)] leading-snug">
          You ran the highlighter down the whole page — all of it mattered.
        </p>
      )}
    </div>
  );
}

/** Draws the words he circled as circled, where they actually appear. */
function Circled({ text, phrases }: { text: string; phrases: string[] }) {
  const segments = highlightSegments(text, phrases);
  return (
    <>
      {segments.map((s, i) =>
        s.hit ? (
          <span
            key={i}
            className="px-[3px] rounded-full"
            style={{
              boxShadow: "inset 0 0 0 1px var(--accent)",
              color: "var(--accent)",
            }}
          >
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}
