/**
 * Motivation — deliberately thin, per the cockpit spec: "a thing you
 * wrote, and when." No title, no tags, no mood score — those would be a
 * second capture form, and the whole point of this module is that it
 * costs nothing to use.
 */

import type { MotivationEntry } from "./types";

/** Long enough for a real thought, short enough that this stays a line
 * and not a journal entry — `journal`/`notes` already own the longer
 * forms of writing. */
export const MOTIVATION_MAX_LEN = 500;

export function readMotivationBody(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MOTIVATION_MAX_LEN);
}

export function motivationFrom(
  rows: { id: string; body: string; created_at: string }[]
): MotivationEntry[] {
  return rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at }));
}

/** The cockpit widget shows the most recent one line, or says why not. */
export function latestMotivation(entries: MotivationEntry[]): MotivationEntry | null {
  return entries.length === 0 ? null : entries[0];
}
