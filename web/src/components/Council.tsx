"use client";

import { useEffect, useRef, useState } from "react";
import {
  COUNCIL_MODES,
  OPENING_LINE,
  TURN_WINDOW,
  councilBlocks,
  inlineSegments,
  isCouncilMode,
  windowTurns,
  type CouncilMode,
  type CouncilTurn,
} from "@/lib/council";

/**
 * The table — the council's chat.
 *
 * The conversation lives in localStorage, and that is a decision rather
 * than a shortcut: this is trolley state, not records — the Meals tick-off
 * rule. A council session is something you have, not something the system
 * files; Supabase stays the system of record precisely because nothing here
 * is a record. Clearing the table forgets it, and that is the point.
 *
 * The transcript is read on mount in an effect — browser-only state, the
 * ThemeToggle pattern, and the reason this file is on the eslint
 * exception list for `set-state-in-effect`.
 */

const STORE_KEY = "brain-council-v1";

type Stored = { turns: CouncilTurn[]; mode: CouncilMode };

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { turns: [], mode: "table" };
    const parsed = JSON.parse(raw) as { turns?: unknown; mode?: unknown };
    return {
      // The sanitiser the route uses, used here for the same reason: jsonb
      // rules apply to localStorage too — never trust what comes out of it.
      turns: windowTurns(parsed.turns),
      mode: isCouncilMode(parsed.mode) ? parsed.mode : "table",
    };
  } catch {
    return { turns: [], mode: "table" };
  }
}

function save(turns: CouncilTurn[], mode: CouncilMode) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ turns, mode }));
  } catch {
    // A full store loses persistence, not the conversation on screen.
  }
}

/** One line of the format, with its bold and italic runs styled. */
function Line({ text }: { text: string }) {
  const segs = inlineSegments(text);
  return (
    <>
      {segs.map((s, i) =>
        s.style === "strong" ? (
          <strong key={i} className="font-semibold tracking-wide">
            {s.text}
          </strong>
        ) : s.style === "em" ? (
          <em key={i} className="text-[var(--muted)]">
            {s.text}
          </em>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}

/** A council answer: blockquote sections drawn as sections, prose as prose. */
function CouncilText({ text }: { text: string }) {
  const blocks = councilBlocks(text);
  return (
    <div className="grid gap-2.5">
      {blocks.map((b, i) =>
        b.kind === "quote" ? (
          <div
            key={i}
            className="border-l-2 pl-3.5 py-0.5 grid gap-1"
            style={{ borderColor: "var(--accent)" }}
          >
            {b.lines.map((l, j) =>
              l.trim().length === 0 ? (
                <div key={j} aria-hidden className="h-1" />
              ) : (
                <p key={j} className="text-[0.9rem] leading-relaxed m-0">
                  <Line text={l} />
                </p>
              )
            )}
          </div>
        ) : (
          <p key={i} className="text-[0.9rem] leading-relaxed m-0">
            <Line text={b.lines[0]} />
          </p>
        )
      )}
    </div>
  );
}

export default function Council({
  configured,
  missing,
}: {
  configured: boolean;
  missing: string[];
}) {
  const [turns, setTurns] = useState<CouncilTurn[]>([]);
  const [mode, setMode] = useState<CouncilMode>("table");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = load();
    setTurns(stored.turns);
    setMode(stored.mode);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, busy]);

  const current = COUNCIL_MODES.find((m) => m.key === mode) ?? COUNCIL_MODES[0];

  function wearMode(next: CouncilMode) {
    setMode(next);
    save(turns, next);
  }

  async function send() {
    const text = input.trim();
    if (text.length === 0 || busy) return;

    const asked: CouncilTurn[] = [...turns, { role: "user", text }];
    setTurns(asked);
    save(asked, mode);
    setInput("");
    setBusy(true);
    setNote(null);
    setError(null);

    try {
      const res = await fetch("/api/advisor/table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: asked, mode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `That didn't work (${res.status}).`);
        return;
      }
      if (json.reply == null) {
        setNote(
          json.reason === "unconfigured"
            ? "The council cannot sit without a Claude API key."
            : "The council declined that one."
        );
        return;
      }
      const answered: CouncilTurn[] = [
        ...asked,
        { role: "assistant", text: json.reply },
      ];
      setTurns(answered);
      save(answered, mode);
      if (json.truncated) {
        setNote("The answer was cut off at the length limit.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function clearTable() {
    if (turns.length === 0) return;
    if (!confirm("Clear the table? The conversation is not stored anywhere else.")) return;
    setTurns([]);
    setNote(null);
    setError(null);
    save([], mode);
  }

  return (
    <div className="grid gap-4">
      {!configured && (
        <div className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-3.5 py-3 grid gap-1.5">
          <p className="text-[0.82rem] leading-relaxed">
            <b>The council cannot sit yet.</b> Unlike the ask box, there is no
            half of this that works without a model — the table is the model
            wearing the spec.
          </p>
          <p className="label">Still missing</p>
          <ul className="grid gap-1">
            {missing.map((k) => (
              <li key={k} className="mono text-[0.8rem]">
                {k}{" "}
                <span className="text-[var(--faint)]">
                  — from console.anthropic.com, into Vercel and .env.local
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* -- the modes -------------------------------------------------- */}
      <div className="grid gap-1.5">
        <div className="flex gap-1.5 flex-wrap">
          {COUNCIL_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className="chip tap"
              style={
                m.key === mode
                  ? { borderColor: "var(--accent)", color: "var(--accent)" }
                  : undefined
              }
              aria-pressed={m.key === mode}
              onClick={() => wearMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
          {current.line}
        </p>
      </div>

      {/* -- the conversation ------------------------------------------- */}
      <section className="card p-4 grid gap-4">
        {turns.length === 0 ? (
          <div
            className="border-l-2 pl-3.5 py-0.5"
            style={{ borderColor: "var(--accent)" }}
          >
            <p className="text-[0.94rem] leading-relaxed m-0">{OPENING_LINE}</p>
          </div>
        ) : (
          turns.map((t, i) =>
            t.role === "user" ? (
              <div
                key={i}
                className="justify-self-end max-w-[85%] rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
              >
                <p className="text-[0.88rem] leading-relaxed m-0 whitespace-pre-wrap">
                  {t.text}
                </p>
              </div>
            ) : (
              <CouncilText key={i} text={t.text} />
            )
          )
        )}

        {busy && (
          <p className="text-[0.82rem] text-[var(--muted)] m-0">
            The council is sitting…
          </p>
        )}
        {note && (
          <p className="text-[0.82rem] text-[var(--muted)] m-0 leading-relaxed">
            {note}
          </p>
        )}
        {error && (
          <p className="text-[0.82rem] m-0" style={{ color: "var(--bad)" }}>
            ⚠ {error}
          </p>
        )}
        <div ref={endRef} />
      </section>

      {/* -- the composer ----------------------------------------------- */}
      <div className="grid gap-2">
        <textarea
          className="input min-h-[76px] resize-y leading-relaxed"
          placeholder="State your business."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Put it to the table"
        />
        <div className="flex gap-2 items-center">
          <button
            className="btn tap text-sm py-2.5"
            disabled={busy || !configured || input.trim().length === 0}
            onClick={send}
          >
            {busy ? "The council is sitting…" : current.button}
          </button>
          <button
            className="btn btn-ghost tap text-sm py-2.5 ml-auto"
            disabled={busy || turns.length === 0}
            onClick={clearTable}
          >
            Clear the table
          </button>
        </div>
      </div>

      <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed max-w-[68ch]">
        The conversation lives in this browser only — the last {TURN_WINDOW}{" "}
        turns travel with each question, and clearing the table forgets it.
        The council answers back; it cannot make a task, move a date, or file
        anything.
      </p>
    </div>
  );
}
