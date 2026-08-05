/**
 * The creed.
 *
 * Three lines Jay wrote by hand — two in red pen in the margin of a book,
 * one his own sidebar mission. They are not from the book and they are not
 * paraphrased anywhere in this file. If you change the wording, you have
 * changed something he wrote down for a reason.
 *
 * It rotates by date exactly as `gita.ts` does: same day, same line, on the
 * server and in the browser, so the hero never flickers on hydration. The
 * two live in the same visual family on purpose — the verse is borrowed
 * wisdom, the creed is his own, and they belong side by side.
 *
 * The system of record is the `creed` note in Supabase (§A4). `CREED` below
 * is the fallback so a dropped read shows his words rather than an empty
 * box — never a second source of truth to edit independently.
 */

export const CREED: string[] = [
  "We must all suffer one of two things: the pain of discipline or the pain of regret.",
  "Mastering others is strength. Mastering yourself is true power.",
  "Make the most of the time left alive.",
];

/** Where the lines came from, shown small beside them. */
export const CREED_ATTRIBUTION = "his own hand";

/**
 * Split a stored creed body into its lines.
 *
 * Blank-line separated in the database, but a single-newline body reads the
 * same to a human, so both are accepted. Whitespace-only lines are dropped
 * rather than rendered as an empty quote.
 */
export function creedLines(body: string | null | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * The creed as stored, falling back to the lines in this file.
 *
 * Supabase is the system of record; this only decides what to show when the
 * note has not been read. It never merges the two — a half-stored creed
 * silently topped up from a constant would be the worst of both.
 */
export function creedFrom(body: string | null | undefined): string[] {
  const stored = creedLines(body);
  return stored.length > 0 ? stored : CREED;
}

/**
 * The line of the day, by date. Same contract as `verseOfDay`: deterministic
 * from the ISO string alone, with an `offset` so two panels on one screen can
 * differ without either lying about which day it is.
 *
 * Returns null for an empty list — a caller with no creed shows nothing,
 * rather than a stray pair of quote marks.
 */
export function creedLineOfDay(
  lines: string[],
  todayIso: string,
  offset: number = 0
): string | null {
  if (lines.length === 0) return null;
  const [y, m, d] = todayIso.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
  const i = (((dayNumber + offset) % lines.length) + lines.length) % lines.length;
  return lines[i];
}
