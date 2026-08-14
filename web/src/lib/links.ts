/**
 * The `links` table, and what a backlink actually is.
 *
 * `links` has existed since the v1 schema (2026-07-30) and until now nothing
 * in the app has written or read a single row. It is the universal join from
 * locked decision 5 — typed tables plus one link table plus `meta` jsonb —
 * and it is what turns eleven notes from a shelf into a vault.
 *
 * ---------------------------------------------------------------------------
 * THE ONE IDEA THAT MATTERS: STORED DIRECTED, READ BOTH WAYS.
 *
 * A row is `(from_type, from_id) -> (to_type, to_id)`. That direction is real
 * — you linked a note TO an area, not the other way round — and the database
 * enforces uniqueness on the whole tuple including `relation`.
 *
 * But "what links here" is a question about a NEIGHBOURHOOD, not a direction.
 * If backlinks only looked at rows pointing AT you, then linking a note to an
 * area would show on the note and be invisible on the area, which is exactly
 * the failure that makes people stop linking things. So `neighbours()` looks
 * down both columns and returns the far end either way.
 *
 * The consequence worth stating: a link is created once and appears on both
 * pages. There is no second row, no sync, and nothing to keep in step.
 * ---------------------------------------------------------------------------
 */

/**
 * What can be linked.
 *
 * Deliberately a closed set. `from_type` is free text in the database, so
 * nothing stops a future caller writing `"widget"` — and then the link is
 * unreadable, unrenderable and effectively lost. Validating against this
 * registry at the seam is what keeps the table honest, in the same way
 * `INLINE_FIELDS` guards the inline editor.
 */
export type LinkableType =
  | "note"
  | "pillar"
  | "goal"
  | "project"
  | "task"
  | "venture"
  | "person";

export const LINKABLE_TYPES: LinkableType[] = [
  "note",
  "pillar",
  "goal",
  "project",
  "task",
  "venture",
  "person",
];

export type LinkableSpec = {
  /** Singular, as it appears on a chip. */
  label: string;
  /** The table it lives in, so a caller can resolve the title. */
  table: string;
  /** Which column holds the human name. `notes` uses `title`, most use it too. */
  titleColumn: string;
  /**
   * Where tapping it goes.
   *
   * `item` means the id addresses a page of its own. `list` means the closest
   * page that shows it — a task has no page, so a task link lands on the
   * planner. That is recorded rather than hidden, because a chip that looks
   * like a deep link and lands on a list is a small lie, and the UI dims the
   * ones that cannot be opened precisely.
   */
  reach: "item" | "list";
  href: (id: string) => string;
};

export const LINKABLE: Record<LinkableType, LinkableSpec> = {
  note: {
    label: "Note",
    table: "notes",
    titleColumn: "title",
    reach: "item",
    href: (id) => `/library/notes/${id}`,
  },
  pillar: {
    label: "Area",
    table: "pillars",
    titleColumn: "name",
    reach: "item",
    href: (id) => `/pillar/${id}`,
  },
  venture: {
    label: "Division",
    table: "ventures",
    titleColumn: "name",
    reach: "item",
    // `/empire/[id]` resolves a uuid as well as a name-derived slug, so the
    // id is safe here and survives a rename — which the hand-mapped version
    // of this did not.
    href: (id) => `/empire/${id}`,
  },
  goal: {
    label: "Goal",
    table: "goals",
    titleColumn: "title",
    reach: "list",
    href: () => `/goals`,
  },
  project: {
    label: "Project",
    table: "projects",
    titleColumn: "title",
    reach: "list",
    href: () => `/goals`,
  },
  task: {
    label: "Task",
    table: "tasks",
    titleColumn: "title",
    reach: "list",
    href: () => `/planner`,
  },
  person: {
    label: "Person",
    table: "people",
    titleColumn: "name",
    reach: "list",
    href: () => `/life/people`,
  },
};

export function isLinkableType(v: unknown): v is LinkableType {
  return typeof v === "string" && (LINKABLE_TYPES as string[]).includes(v);
}

/**
 * The relation vocabulary — one entry, on purpose.
 *
 * The column defaults to `relates_to` and every row written so far would use
 * it. A richer vocabulary (`supports`, `contradicts`, `evidence_for`) is easy
 * to add and hard to remove, and decision 2 is explicit that the hierarchy
 * must not feel bureaucratic: asking "what KIND of link is this?" on every
 * link is a second question standing between a thought and it being recorded.
 *
 * When a second relation earns its place it will be because something in the
 * UI needs to render it differently. Until then one relation is not a
 * limitation, it is the absence of a decision nobody needed to make.
 */
export const RELATIONS = ["relates_to"] as const;
export type Relation = (typeof RELATIONS)[number];
export const DEFAULT_RELATION: Relation = "relates_to";

export type LinkRow = {
  id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  relation: string;
};

/** One end of a link — a thing, not a row. */
export type LinkEnd = {
  type: LinkableType;
  id: string;
  /** The row that connects it, so the UI can offer to remove exactly that. */
  linkId: string;
  relation: string;
};

export type Subject = { type: LinkableType; id: string };

/** A link end with its name resolved. Lives here, not in the server module,
 *  so a client component can import the type without reaching for
 *  `server-only`. */
export type ResolvedEnd = LinkEnd & { title: string };

/**
 * The tuple the database is unique on, as a string.
 *
 * Used to dedupe BEFORE writing, so the common case is not a round trip that
 * comes back with a constraint violation. The uniqueness is still the
 * database's job — this only stops the UI offering a link that already
 * exists.
 */
export function linkKey(l: {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  relation: string;
}): string {
  return [l.from_type, l.from_id, l.to_type, l.to_id, l.relation].join("|");
}

/**
 * Would this link be a duplicate of one already held, in EITHER direction?
 *
 * The database's unique index is directional: A->B and B->A are two distinct
 * rows and both are allowed. For a system that reads links both ways that
 * would mean the same relationship rendered twice on both pages, so the check
 * here is deliberately stricter than the constraint.
 */
export function alreadyLinked(
  links: LinkRow[],
  a: Subject,
  b: Subject,
  relation: string = DEFAULT_RELATION
): boolean {
  return links.some(
    (l) =>
      l.relation === relation &&
      ((l.from_type === a.type &&
        l.from_id === a.id &&
        l.to_type === b.type &&
        l.to_id === b.id) ||
        (l.from_type === b.type &&
          l.from_id === b.id &&
          l.to_type === a.type &&
          l.to_id === a.id))
  );
}

export type LinkCheck = { ok: true } | { ok: false; reason: string };

/**
 * Can these two be linked?
 *
 * Three refusals, and each one is a thing that would otherwise render as
 * noise rather than fail loudly.
 */
export function canLink(
  links: LinkRow[],
  a: Subject,
  b: Subject,
  relation: string = DEFAULT_RELATION
): LinkCheck {
  if (!isLinkableType(a.type) || !isLinkableType(b.type)) {
    return { ok: false, reason: "That is not something the vault can link." };
  }
  // A thing linked to itself is a row that says nothing and shows up in its
  // own backlinks forever.
  if (a.type === b.type && a.id === b.id) {
    return { ok: false, reason: "That is already this." };
  }
  if (alreadyLinked(links, a, b, relation)) {
    return { ok: false, reason: "Already linked." };
  }
  return { ok: true };
}

/**
 * The far end of a link, from where you are standing — or null if the link
 * does not touch you at all.
 *
 * A self-link would return the subject itself, so it is filtered here as well
 * as refused at creation: rows written before this module existed, or by hand
 * in the SQL editor, must not be able to make a page list itself.
 */
export function otherEnd(link: LinkRow, subject: Subject): LinkEnd | null {
  const touchesFrom =
    link.from_type === subject.type && link.from_id === subject.id;
  const touchesTo = link.to_type === subject.type && link.to_id === subject.id;
  if (!touchesFrom && !touchesTo) return null;
  if (touchesFrom && touchesTo) return null; // self-link

  const type = touchesFrom ? link.to_type : link.from_type;
  const id = touchesFrom ? link.to_id : link.from_id;
  if (!isLinkableType(type)) return null; // unknown type — unrenderable
  return { type, id, linkId: link.id, relation: link.relation };
}

/**
 * Everything connected to a subject, whichever way the row points.
 *
 * Deduped by (type, id): if two rows connect the same pair — possible when
 * a second relation is added later, or when A->B and B->A were both written
 * before `alreadyLinked` existed — the neighbourhood shows the thing once.
 * The FIRST row wins, so removing it is what the UI offers; the duplicate
 * surfaces the next time the page loads rather than both vanishing at once.
 */
export function neighbours(links: LinkRow[], subject: Subject): LinkEnd[] {
  const seen = new Set<string>();
  const out: LinkEnd[] = [];
  for (const l of links) {
    const end = otherEnd(l, subject);
    if (!end) continue;
    const k = `${end.type}:${end.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(end);
  }
  return out;
}

/**
 * The neighbourhood grouped by type, in registry order.
 *
 * Registry order rather than count order, so the same subject renders its
 * links in the same arrangement every time. A group that reorders itself as
 * links are added is a page you have to re-read.
 */
export function groupedNeighbours(
  links: LinkRow[],
  subject: Subject
): { type: LinkableType; items: LinkEnd[] }[] {
  const all = neighbours(links, subject);
  const out: { type: LinkableType; items: LinkEnd[] }[] = [];
  for (const t of LINKABLE_TYPES) {
    const items = all.filter((n) => n.type === t);
    if (items.length > 0) out.push({ type: t, items });
  }
  return out;
}

/** How many things this subject is connected to. */
export function linkCount(links: LinkRow[], subject: Subject): number {
  return neighbours(links, subject).length;
}

/* ------------------------------------------------------------------ *
 * Notes — the writing side
 * ------------------------------------------------------------------ */

/**
 * A note's display title.
 *
 * `notes.title` is nullable and the floor for writing one is a body and
 * nothing else — asking for a title before a thought can be recorded is the
 * same obstacle as asking for an area. So a titleless note is titled by its
 * own first line, which is what the author would have typed anyway.
 *
 * Returns null rather than a placeholder when there is genuinely nothing, so
 * the caller decides how to render an empty note rather than being handed the
 * word "Untitled" it cannot distinguish from a real title.
 */
export function noteTitle(
  note: { title?: string | null; body?: string | null },
  max = 72
): string | null {
  const t = (note.title ?? "").trim();
  if (t !== "") return t;
  const firstLine = (note.body ?? "")
    .split("\n")
    .map((l) => l.trim())
    // Skip a leading markdown heading marker rather than showing it.
    .map((l) => l.replace(/^#{1,6}\s+/, ""))
    .find((l) => l !== "");
  if (!firstLine) return null;
  return firstLine.length > max ? firstLine.slice(0, max - 1).trimEnd() + "…" : firstLine;
}

/**
 * Is there anything here worth saving?
 *
 * A note with only whitespace is not a note. This is the same rule as
 * `toNumberOrNull` rejecting "  " — the check is on the trimmed value, so an
 * accidental tap cannot create a row that then has to be cleaned up.
 */
export function noteHasContent(note: {
  title?: string | null;
  body?: string | null;
}): boolean {
  return ((note.title ?? "") + (note.body ?? "")).trim() !== "";
}

/**
 * Search the vault.
 *
 * Word matching over title, body and tags — the same choice `advisor.ts`
 * makes and for the same reason: with eleven notes, matching the words he
 * used beats a semantic ranking, and `RETRIEVAL_CEILING` records the count at
 * which that stops being true. Every term must match somewhere (AND, not OR),
 * because with a vault this small an OR query returns the whole vault.
 */
export function searchNotes<
  T extends { title?: string | null; body?: string | null; tags?: string[] }
>(notes: T[], query: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t !== "");
  if (terms.length === 0) return notes;
  return notes.filter((n) => {
    const hay = [n.title ?? "", n.body ?? "", ...(n.tags ?? [])]
      .join(" ")
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/**
 * Tags, tidied.
 *
 * Lower-cased, de-duplicated, order preserved, blanks dropped. Order matters
 * because the first tag is the one a narrow row shows, and it should be the
 * one that was typed first rather than whatever sorting decides.
 */
export function parseTags(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim().toLowerCase().replace(/\s+/g, "-");
    if (t !== "" && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Which notes may be edited here.
 *
 * `principle` and `creed` are Jay's collected material and his own three
 * lines. They are read at `/library/principles`, they carry his marks in
 * `meta`, and the vault's editor must not offer to overwrite them — an
 * accidental save would destroy `jay_marked` / `jay_circled` provenance that
 * exists nowhere else. The vault writes and edits `note` and nothing else.
 */
export function isEditableNote(note: { kind?: string | null }): boolean {
  return (note.kind ?? "note") === "note";
}
