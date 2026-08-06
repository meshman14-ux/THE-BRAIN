import crypto from "node:crypto";

/**
 * Encryption for the stored Google tokens.
 *
 * Its own module, separate from `google.ts`, for one reason: `google.ts`
 * is `server-only` and therefore cannot be imported by a test. This is the
 * part that most needs testing — a silent failure here does not throw, it
 * just stores something that will never decrypt, and the symptom arrives
 * days later as a connection that mysteriously needs redoing.
 *
 * AES-256-GCM. The ciphertext lands in a row the owner can read, and "the
 * owner" includes anything running in his browser, so plaintext there would
 * be one XSS away from being someone else's refresh token.
 */

/**
 * A 32-byte key from whatever he put in the environment variable.
 *
 * Accepts a base64 32-byte key as-is; anything else is hashed to length, so
 * a short or oddly-encoded secret is a weaker key rather than a crash on
 * the first sync.
 */
export function keyFrom(secret: string): Buffer {
  const b64 = Buffer.from(secret, "base64");
  if (b64.length === 32) return b64;
  return crypto.createHash("sha256").update(secret).digest();
}

/** iv.tag.ciphertext, each base64url. */
export function encryptWith(key: Buffer, plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

/**
 * Null on anything that will not decrypt — a wrong key, a tampered
 * ciphertext, a malformed payload, or a value written before the secret was
 * rotated. Null makes the connection read as broken, which is the truth and
 * is recoverable by reconnecting. Throwing here would take the page down.
 */
export function decryptWith(key: Buffer, payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, enc] = parts.map((p) => Buffer.from(p, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
