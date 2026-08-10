"use client";

import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

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
    const { error } = await supabase
      .from(f.table)
      .update({ [f.column]: parsed.value })
      .eq("id", id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
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
      onClick={() => setEditing(true)}
      disabled={busy}
      title={`Edit ${f.label.toLowerCase()}`}
      className={`bg-transparent border-0 border-b border-dashed p-0 font-[inherit] text-[inherit] cursor-pointer text-left ${className}`}
      style={{
        borderBottomColor: "var(--border-bright)",
        color: missing ? "var(--faint)" : "var(--text)",
        fontStyle: missing ? "italic" : undefined,
        opacity: busy ? 0.5 : 1,
      }}
    >
      {missing ? f.placeholder : display(f.kind, value)}
    </button>
  );
}

function display(kind: string, value: string | number): string {
  if (kind === "money") return formatGBP(Number(value));
  if (kind === "int") return String(value);
  return String(value);
}
