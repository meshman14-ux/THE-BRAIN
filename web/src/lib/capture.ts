/**
 * Capture doors — the pure half of file capture (photo / document upload).
 *
 * The capture module's law is unchanged by files: everything lands in the
 * INBOX and gets a home at triage. A file is not a new kind of record — it is
 * an inbox item that happens to carry an attachment, so it survives its own
 * routing exactly as a typed thought does.
 *
 * Files live in the private `captures` bucket under `<user_id>/…`, read back
 * through short-lived signed URLs. The bucket is never public — a photographed
 * bill is exactly the kind of thing the cog-docs precedent exists for.
 */

/** What the document door accepts. Images included — a screenshot is a document. */
export const ACCEPT_DOCUMENT = ".pdf,.docx,.txt,.csv,image/*";
/** What the photo door accepts. `capture` on the input sends phones to the camera. */
export const ACCEPT_PHOTO = "image/*";

/**
 * Upload ceiling. Supabase free tier allows 50MB per object; 20MB is plenty
 * for a phone photo or a scanned PDF and keeps a fat video from eating the
 * project's storage by accident.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function fileTooLarge(bytes: number): boolean {
  return bytes > MAX_UPLOAD_BYTES;
}

/**
 * A storage key must be predictable and safe; a filename off a phone is
 * neither. Keep letters, digits, dot, dash and underscore; collapse the rest.
 * The original name is preserved in the inbox row's text, so nothing is lost
 * by being strict here.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split("/").pop()?.split("\\").pop() ?? "";
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || "file";
}

/**
 * `<user_id>/<timestamp>-<name>` — the leading folder is the user id, which is
 * exactly what the bucket's RLS policies check. `nowMs` is injected so this
 * stays testable (the clock is never read in lib code).
 */
export function attachmentPath(userId: string, filename: string, nowMs: number): string {
  return `${userId}/${nowMs}-${sanitizeFilename(filename)}`;
}

/**
 * The inbox row's text for a file capture. Triage turns `raw_text` into a task
 * title or a note, so this must read as words, not as a path: "Photo —
 * receipt.jpg" routes cleanly; a storage key does not.
 */
export function captureLine(kind: "photo" | "document", filename: string): string {
  const label = kind === "photo" ? "Photo" : "Document";
  return `${label} — ${filename}`;
}

export type Attachment = { path: string; mime: string | null; size: number | null };

/**
 * `inbox.meta` is jsonb, so never trust what comes out of it (§A7). Returns
 * the attachment when `meta.attachment.path` is a real string, null otherwise
 * — a malformed row degrades to a plain text capture, never a crash.
 */
export function readAttachment(meta: unknown): Attachment | null {
  if (typeof meta !== "object" || meta === null) return null;
  const att = (meta as Record<string, unknown>).attachment;
  if (typeof att !== "object" || att === null) return null;
  const rec = att as Record<string, unknown>;
  if (typeof rec.path !== "string" || rec.path.trim() === "") return null;
  return {
    path: rec.path,
    mime: typeof rec.mime === "string" ? rec.mime : null,
    size: typeof rec.size === "number" && Number.isFinite(rec.size) ? rec.size : null,
  };
}

/** How long a triage view of a file stays valid. Five minutes — the cog-docs rule. */
export const SIGNED_URL_SECONDS = 300;
