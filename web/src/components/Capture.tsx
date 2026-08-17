"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { InboxItem } from "@/lib/types";
import {
  ACCEPT_DOCUMENT,
  ACCEPT_PHOTO,
  attachmentPath,
  captureLine,
  fileTooLarge,
  MAX_UPLOAD_BYTES,
  mimeRejected,
} from "@/lib/capture";

import type { CaptureDoor } from "@/lib/push";
import {
  captureLine as captureStatusLine,
  type CaptureRow,
} from "@/lib/proposals";

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

export default function Capture({ door = null }: { door?: CaptureDoor | null }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"photo" | "document" | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<InboxItem[]>([]);
  const [captures, setCaptures] = useState<CaptureRow[]>([]);
  const [queued, setQueued] = useState(0);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const supabase = createClient();

  const loadRecent = async () => {
    const { data } = await supabase
      .from("inbox")
      .select("id, raw_text, captured_at, status")
      .eq("status", "open")
      .order("captured_at", { ascending: false })
      .limit(5);
    setRecent((data ?? []) as InboxItem[]);

    // Documents still worth a decision: anything not fully settled, newest
    // first. A capture nobody confirmed must never become invisible.
    const { data: caps } = await supabase
      .from("captures")
      .select("id, storage_path, mime_type, status, doc_type, title, confidence, error, captured_at")
      .neq("status", "confirmed")
      .order("captured_at", { ascending: false })
      .limit(6);
    setCaptures((caps ?? []) as CaptureRow[]);
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
    // A relay landing (?door=…) wants the door in view, not the keyboard up.
    if (door) {
      document.getElementById(`door-${door}`)?.scrollIntoView({ block: "center" });
    } else {
      boxRef.current?.focus();
    }
    setQueued(readQueue().length);
    loadRecent();
    flushQueue();
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (msg: string) => {
    setError("");
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

  /**
   * The photo and document doors. The file goes to the private `captures`
   * bucket first, then an inbox row points at it — so a file capture joins
   * the same triage queue as a typed one, and never bypasses it.
   *
   * Unlike text, a file cannot queue in localStorage, so a failed upload says
   * so plainly. The file is still on the device; nothing is lost by retrying.
   */
  async function handleFile(kind: "photo" | "document", file: File | undefined) {
    if (!file || uploading) return;
    setError("");

    if (fileTooLarge(file.size)) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the ceiling is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB. A photo of the page beats a scan of the book.`
      );
      return;
    }

    if (mimeRejected(file.type)) {
      setError(
        `The captures bucket takes photos and PDFs only — ${file.type} is not one. Photograph the page, or print it to PDF first.`
      );
      return;
    }

    setUploading(kind);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      setError("No signed-in session — sign in again, then retry. The file is still on your device.");
      setUploading(null);
      return;
    }

    const path = attachmentPath(uid, file.name, Date.now());
    const { error: upErr } = await supabase.storage
      .from("captures")
      .upload(path, file, { contentType: file.type || undefined });

    if (upErr) {
      setError(`The upload failed (${upErr.message}). The file is still on your device — try again.`);
      setUploading(null);
      return;
    }

    // The evidence row. `captures.user_id` has NO default, so it is set
    // explicitly — a row without an owner is invisible to RLS forever after.
    const { data: capture, error: capErr } = await supabase
      .from("captures")
      .insert({
        user_id: uid,
        storage_path: path,
        mime_type: file.type || "image/jpeg",
        source: kind,
      })
      .select("id")
      .single();

    if (capErr || !capture) {
      // The file is in storage but nothing points at it. Fall back to the
      // inbox so the capture still exists as something Jay can see and act on.
      await supabase.from("inbox").insert({
        raw_text: captureLine(kind, file.name),
        source: kind === "photo" ? "photo" : "upload",
        meta: { attachment: { path, mime: file.type || null, size: file.size } },
      });
      setError(
        `Uploaded, but the reader could not be started (${capErr?.message ?? "unknown"}). It is in your inbox as a plain photo.`
      );
      setUploading(null);
      loadRecent();
      return;
    }

    flash(kind === "photo" ? "Photo captured — reading it…" : "Document captured — reading it…");
    setUploading(null);

    // Extraction runs under the caller's token, so RLS applies to it too.
    // A failure here is not a lost capture: the row stays, marked failed, and
    // the list offers a retry.
    const { error: fnErr } = await supabase.functions.invoke("capture-process", {
      body: { capture_id: capture.id },
    });
    if (fnErr) {
      setError(
        `Stored safely, but reading it failed (${fnErr.message}). Open it from the list to try again.`
      );
    }
    router.push(`/capture/${capture.id}`);
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

      {/* The other three doors. Hidden inputs, real buttons — `capture` on the
          photo input sends a phone straight to the camera. */}
      <input
        ref={photoRef}
        type="file"
        accept={ACCEPT_PHOTO}
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFile("photo", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={docRef}
        type="file"
        accept={ACCEPT_DOCUMENT}
        className="hidden"
        onChange={(e) => {
          handleFile("document", e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <section>
        <p className="label mb-2.5">Other ways in</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            id="door-photo"
            className={`btn tap text-sm py-2.5 ${door === "photo" ? "" : "btn-ghost"}`}
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={uploading !== null}
          >
            {uploading === "photo" ? "Uploading…" : "📷 Take a photo"}
          </button>
          <button
            id="door-document"
            className={`btn tap text-sm py-2.5 ${door === "document" ? "" : "btn-ghost"}`}
            type="button"
            onClick={() => docRef.current?.click()}
            disabled={uploading !== null}
          >
            {uploading === "document" ? "Uploading…" : "📄 Upload a PDF or scan"}
          </button>
          <Link href="/setup" className="btn btn-ghost tap text-sm py-2.5 text-center">
            📋 Answer the questions
          </Link>
        </div>
        <p className="text-xs text-[var(--faint)] mt-2 leading-relaxed">
          A photo or document lands in the inbox like anything else and gets a
          home at triage. No passwords, bank logins or PINs — not even in a photo.
        </p>
      </section>

      {toast && (
        <div className="text-sm text-[var(--good)] font-semibold">✓ {toast}</div>
      )}
      {error && <p className="text-sm text-[var(--bad)]">⚠ {error}</p>}

      {captures.length > 0 && (
        <section>
          <p className="label mb-2.5">Documents read</p>
          <ul className="grid gap-2 list-none p-0 m-0">
            {captures.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/capture/${c.id}`}
                  className="card px-4 py-3 flex items-center gap-2 no-underline"
                >
                  <span className="min-w-0 flex-1 text-sm leading-relaxed truncate">
                    {captureStatusLine(c)}
                  </span>
                  <span className="chip shrink-0 text-xs">
                    {c.status === "extracted" ? "confirm" : c.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
