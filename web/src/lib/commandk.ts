/**
 * ⌘K — the pure half.
 *
 * The command centre's search is a LAYER over wherever you already are, not a
 * page you navigate to. That is the whole difference from the `/search` route
 * this replaces: you never leave what you were doing to look something up.
 *
 * Nothing here fetches or navigates; it decides what matches and in what order.
 */

export type TargetKind = "page" | "person" | "venture" | "note" | "vehicle";

export type Target = {
  kind: TargetKind;
  id: string;
  label: string;
  href: string;
  /** Extra words that should match but are not shown as the label. */
  hint?: string;
};

/** Lower-case, strip punctuation — so "a to z" finds "A to Z Traderz". */
export function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Score a target against a query. Higher is better; 0 means no match.
 *
 * The ranking is deliberately simple and explicable, because a search whose
 * ordering you cannot predict is one you stop trusting:
 *   - an exact label match beats everything
 *   - a label that starts with the query beats one that merely contains it
 *   - a word-boundary hit beats a mid-word one
 *   - a hint-only match scores lowest, since it matched something unseen
 */
export function score(target: Target, query: string): number {
  const q = normalise(query);
  if (!q) return 0;
  const label = normalise(target.label);
  const hint = normalise(target.hint ?? "");

  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(label)) return 60;
  if (label.includes(q)) return 40;
  if (hint.includes(q)) return 20;

  // Every word of the query present somewhere — "kath st" finds "Kathleen St".
  const words = q.split(" ").filter(Boolean);
  if (words.length > 1 && words.every((w) => label.includes(w) || hint.includes(w))) return 30;

  return 0;
}

/** Ties break by kind, so a page you can open outranks a row it might mention. */
const KIND_RANK: Record<TargetKind, number> = {
  page: 0,
  venture: 1,
  person: 2,
  vehicle: 3,
  note: 4,
};

export const RESULT_LIMIT = 8;

/**
 * The visible results. An empty query returns nothing rather than everything:
 * a palette that opens onto a wall of options is a menu, and the point of this
 * one is that you already know what you are looking for.
 */
export function search(targets: Target[], query: string, limit = RESULT_LIMIT): Target[] {
  if (!normalise(query)) return [];
  return targets
    .map((t) => ({ t, s: score(t, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s;
      const k = KIND_RANK[a.t.kind] - KIND_RANK[b.t.kind];
      if (k !== 0) return k;
      return a.t.label.localeCompare(b.t.label);
    })
    .slice(0, limit)
    .map((r) => r.t);
}

/** What each kind is called on screen. */
export const KIND_WORD: Record<TargetKind, string> = {
  page: "page",
  person: "person",
  venture: "division",
  note: "note",
  vehicle: "vehicle",
};

/** Move the highlight, wrapping at both ends so holding ↓ never dead-ends. */
export function moveCursor(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (current + delta + count) % count;
}
