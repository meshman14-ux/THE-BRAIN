"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inlineField, parseInline, type InlineKey } from "@/lib/inline";
import { formatGBP } from "@/lib/logic";

/**
 * A value that edits itself where it stands.
 *
 * No route change, no form, no Save button. Tap the dash, type, and looking
 * away stores it. Escape puts it back the way it was, because an edit you
 * cannot abandon is an edit you hesitate before starting.
 *
 * A missing value renders as its own prompt — "not confirmed", "not
 * recorded" — never as `N/A` and never as a zero. Zero and "not yet" are
 * different facts, and the whole reason this component exists is that the
 * second one is worth acting on.
 */
export default function InlineValue({
  field,
  id,
  value,
  className = "",
  onSaved,
}: {
  field: InlineKey;
  id: string;
  value: string | number | null;
  className?: string;
  onSaved?: () => void;
}) {
  const f = inlineField(field);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Re-sync when the server hands down a new value — a refresh after somebody
  // else's write, or this component's own, must not leave a stale draft
  // waiting to overwrite it.
  useEffect(() => {
    if (!editing) setDraft(value == null ? "" : String(value));
  }, [value, editing]);

  // A fallback only. The focus that matters happens synchronously inside
  // the tap handler — see `open()` below.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  /**
   * Open the field, and focus it WITHIN the tap that asked for it.
   *
   * This is the whole reason the component was rewritten. `setEditing(true)`
   * schedules a render; the input does not exist until after it, so the
   * `useEffect` above calls `.focus()` once the gesture has already ended.
   * Desktop browsers do not care. **iOS Safari refuses to open the keyboard
   * for a focus that is not inside a user gesture**, so the box appeared,
   * no keyboard came up, and the next tap blurred it shut again — which
   * from the outside looks exactly like tapping doing nothing at all.
   *
   * `flushSync` forces the render to complete before the handler returns,
   * so the input exists and can be focused while the gesture is still
   * live. It is the documented escape hatch for precisely this case.
   */
  function open() {
    flushSync(() => setEditing(true));
    inputRef.current?.focus();
    // Selecting makes overtyping an existing figure one action rather than
    // a clear-then-type, which on a phone is the difference between a tap
    // and a fiddle.
    inputRef.current?.select();
  }

  async function commit() {
    const parsed = parseInline(field, draft);
    if (!parsed.ok) {
      setErr(parsed.error);
      return;
    }
    setErr("");
    setEditing(false);
    if (parsed.value === (value ?? null)) return;
    setBusy(true);

    /* -- the write, and the stamp that has to go with it -------------- *
     *
     * A stamped field records WHEN it was confirmed, because a balance
     * entered today and one entered in March are different facts and only
     * the second should make the page ask again.
     *
     * The existing `meta` is read first and MERGED, never replaced. That
     * is not defensive habit — the monthly Money prompt used to write
     * `meta: { balance_confirmed_on: today }` and silently destroyed every
     * other key on the row, which is how an audit trail written in one
     * place disappears from another. */
    const patch: Record<string, unknown> = { [f.column]: parsed.value };
    if (f.stamp) {
      const { data: current } = await supabase
        .from(f.table)
        .select("meta")
        .eq("id", id)
        .maybeSingle();
      const held =
        typeof current?.meta === "object" && current.meta !== null && !Array.isArray(current.meta)
          ? (current.meta as Record<string, unknown>)
          : {};
      // Clearing a value clears its stamp: "unknown, last confirmed in
      // March" is a contradiction, and leaving the date behind would let a
      // blank pass the staleness test.
      patch.meta =
        parsed.value === null
          ? Object.fromEntries(Object.entries(held).filter(([k]) => k !== f.stamp))
          : { ...held, [f.stamp]: new Date().toISOString().slice(0, 10) };
    }

    const { error } = await supabase.from(f.table).update(patch).eq("id", id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
    onSaved?.();
    router.refresh();
  }

  function cancel() {
    setDraft(value == null ? "" : String(value));
    setErr("");
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="inline-flex flex-col gap-1 align-middle">
        <input
          ref={inputRef}
          className={`input py-1.5 px-2 text-[0.85rem] ${
            f.kind === "money" || f.kind === "int" ? "mono w-[7.5rem]" : ""
          } ${f.kind === "date" ? "w-[9.5rem]" : ""}`}
          type={f.kind === "date" ? "date" : f.kind === "text" ? "text" : "number"}
          inputMode={f.kind === "money" ? "decimal" : undefined}
          step={f.kind === "money" ? "0.01" : f.kind === "int" ? "1" : undefined}
          min={f.min}
          max={f.max}
          value={draft}
          aria-label={f.label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
        />
        {err && (
          <span className="text-[0.68rem]" style={{ color: "var(--bad)" }}>
            {err}
          </span>
        )}
      </span>
    );
  }

  const missing = value == null;
  return (
    <button
      onClick={open}
      disabled={busy}
      title={`Edit ${f.label.toLowerCase()}`}
      // px/py rather than p-0: this is the tap target for every figure in
      // the system, and a bare inline button is about 18px tall.
      //
      // At py-2 the padding got it to 36px, NOT the 44 this comment used
      // to claim — measured 2026-08-13. py-[10px] draws it at 40 and `.tap`
      // adds the last 6px as hit area rather than as height, because this
      // button sits inline inside a sentence and drawing it at 44 would
      // space the prose out around it. The -my-[2px] gives the extra 4px of
      // padding back to the line box, so the sentence does not re-flow.
      className={`tap bg-transparent border-0 border-b border-dashed px-2 py-[10px] -my-[2px] -mx-2 font-[inherit] text-[inherit] cursor-pointer text-left ${className}`}
      style={{
        borderBottomColor: "var(--border-bright)",
        color: missing ? "var(--faint)" : "var(--text)",
        fontStyle: missing ? "italic" : undefined,
        opacity: busy ? 0.5 : 1,
      }}
    >
      {missing ? f.placeholder : display(f.kind, value)}
      {/* A write you cannot see is a write you do not trust, and the whole
          point of blur-to-save is that nothing confirms it. */}
      {saved && (
        <span className="ml-1.5 text-[0.7rem]" style={{ color: "var(--good)" }}>
          saved
        </span>
      )}
    </button>
  );
}

function display(kind: string, value: string | number): string {
  if (kind === "money") return formatGBP(Number(value));
  if (kind === "int") return String(value);
  return String(value);
}
