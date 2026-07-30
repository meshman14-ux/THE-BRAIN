"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InboxItem } from "@/lib/types";

const QUEUE_KEY = "brain-capture-queue-v1";

/** Reads the offline queue from localStorage. */
function readQueue(): string[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: string[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
}

export default function Capture() {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [recent, setRecent] = useState<InboxItem[]>([]);
  const [queued, setQueued] = useState(0);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const supabase = createClient();

  const loadRecent = async () => {
    const { data } = await supabase
      .from("inbox")
      .select("id, raw_text, captured_at, status")
      .eq("status", "open")
      .order("captured_at", { ascending: false })
      .limit(5);
    setRecent((data ?? []) as InboxItem[]);
  };

  /** Push anything captured while offline. */
  const flushQueue = async () => {
    const q = readQueue();
    if (!q.length) return;
    const rows = q.map((raw_text) => ({ raw_text, source: "pwa-offline" }));
    const { error } = await supabase.from("inbox").insert(rows);
    if (!error) {
      writeQueue([]);
      setQueued(0);
      setToast(`Synced ${q.length} offline capture${q.length > 1 ? "s" : ""}`);
      loadRecent();
    }
  };

  useEffect(() => {
    boxRef.current?.focus();
    setQueued(readQueue().length);
    loadRecent();
    flushQueue();
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    const raw = text.trim();
    if (!raw || saving) return;
    setSaving(true);

    const { error } = await supabase
      .from("inbox")
      .insert({ raw_text: raw, source: "app" });

    if (error) {
      // Offline or failed — never lose the thought.
      const q = readQueue();
      q.push(raw);
      writeQueue(q);
      setQueued(q.length);
      flash("Saved offline — will sync");
    } else {
      flash("Captured");
      loadRecent();
    }

    setText("");
    setSaving(false);
    boxRef.current?.focus();
  }

  return (
    <div className="grid gap-5">
      <form onSubmit={save} className="card p-4 grid gap-3">
        <textarea
          ref={boxRef}
          className="input min-h-[132px] resize-y leading-relaxed"
          placeholder="What's on your mind?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
          }}
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--faint)]">
            {queued > 0 ? `${queued} waiting to sync` : "⌘/Ctrl + Enter"}
          </span>
          <button
            className="btn ml-auto"
            type="submit"
            disabled={saving || !text.trim()}
          >
            {saving ? "Saving…" : "Capture"}
          </button>
        </div>
      </form>

      {toast && (
        <div className="text-sm text-[var(--good)] font-semibold">✓ {toast}</div>
      )}

      {recent.length > 0 && (
        <section>
          <p className="label mb-2.5">Waiting in the inbox</p>
          <ul className="grid gap-2 list-none p-0 m-0">
            {recent.map((r) => (
              <li
                key={r.id}
                className="card px-4 py-3 text-sm text-[var(--muted)] leading-relaxed"
              >
                {r.raw_text.length > 140
                  ? r.raw_text.slice(0, 140) + "…"
                  : r.raw_text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
