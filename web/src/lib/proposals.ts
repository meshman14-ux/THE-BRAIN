/**
 * The confirm screen's pure half — reading a capture and its proposals.
 *
 * The rule the whole engine turns on: `captures` is evidence,
 * `capture_proposals` is opinion, and the real tables stay clean until an
 * explicit Accept. Nothing here writes; it decides what the screen SAYS.
 */

export type CaptureStatus = "pending" | "processing" | "extracted" | "failed" | string;
export type ProposalStatus = "proposed" | "accepted" | "rejected" | "applied" | "failed" | string;

export type CaptureRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  status: CaptureStatus;
  doc_type: string | null;
  title: string | null;
  confidence: number | null;
  error: string | null;
  captured_at: string;
  extraction?: unknown;
  drive_url?: string | null;
  drive_folder_key?: string | null;
  drive_filename?: string | null;
};

export type ProposalRow = {
  id: string;
  target_table: string;
  target_id: string | null;
  action: string;
  label: string;
  rationale: string | null;
  confidence: number | null;
  status: ProposalStatus;
  error: string | null;
  payload?: unknown;
};

/** What the capture list shows for a row, in Jay's words rather than the column's. */
export function captureLine(c: CaptureRow): string {
  switch (c.status) {
    case "pending":
      return "Waiting to be read";
    case "processing":
      return "Reading it now…";
    case "failed":
      return c.error ? `Could not read it — ${c.error}` : "Could not read it";
    case "extracted":
      return c.title ?? "Read, waiting on you";
    default:
      return c.title ?? c.status;
  }
}

/** Only an extracted capture has anything to confirm. */
export function isConfirmable(c: CaptureRow): boolean {
  return c.status === "extracted";
}

/**
 * Confidence as a word, never a bare number. Below the floor the screen says
 * "check this one" rather than showing a decimal nobody can act on. Null is
 * "not scored" and must never read as zero — the system's oldest law.
 */
export const LOW_CONFIDENCE = 0.7;
export function confidenceWord(c: number | null | undefined): string | null {
  if (typeof c !== "number" || !Number.isFinite(c)) return null;
  if (c >= 0.9) return "clear";
  if (c >= LOW_CONFIDENCE) return "readable";
  return "hard to read — check it";
}

/** `unclear[]` from the extraction, validated. jsonb is never trusted (§A7). */
export function readUnclear(extraction: unknown): string[] {
  if (typeof extraction !== "object" || extraction === null) return [];
  const u = (extraction as Record<string, unknown>).unclear;
  if (!Array.isArray(u)) return [];
  return u.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

/** The sheet code, when the page was one of THE BRAIN's own printed sheets. */
export function readSheetCode(extraction: unknown): string | null {
  if (typeof extraction !== "object" || extraction === null) return null;
  const s = (extraction as Record<string, unknown>).sheet_code;
  return typeof s === "string" && s.trim() !== "" ? s.trim().toUpperCase() : null;
}

/** Which module a proposal lands in, said plainly. */
const TABLE_WORDS: Record<string, string> = {
  vehicles: "Vehicles",
  debts: "Money",
  tasks: "Tasks",
  notes: "The vault",
  people: "People",
  assets: "What you own",
  inbox: "Inbox",
  metric_readings: "Metrics",
  finishes: "Finishes",
  people_contacts: "People",
};
export function targetWord(table: string): string {
  return TABLE_WORDS[table] ?? table;
}

/** "Adds a new row" vs "changes one you already have" — the difference that matters. */
export function actionWord(action: string): string {
  return action === "insert" ? "new" : "update";
}

/** A proposal still awaiting a decision. */
export function isOpen(p: ProposalRow): boolean {
  return p.status === "proposed";
}

export type ProposalTally = {
  open: number;
  applied: number;
  rejected: number;
  failed: number;
  /** True when every proposal has been decided — the capture is finished with. */
  settled: boolean;
};

export function tally(proposals: ProposalRow[]): ProposalTally {
  const open = proposals.filter(isOpen).length;
  return {
    open,
    applied: proposals.filter((p) => p.status === "applied").length,
    rejected: proposals.filter((p) => p.status === "rejected").length,
    failed: proposals.filter((p) => p.status === "failed").length,
    settled: proposals.length > 0 && open === 0,
  };
}

/**
 * Order for the confirm screen: undecided first (that is the work), then
 * failures (they need a human), then everything settled. Within a group,
 * updates to existing rows before new rows — changing a number you already
 * track is a smaller decision than creating something.
 */
const RANK: Record<string, number> = { proposed: 0, failed: 1, applied: 2, rejected: 3 };
export function rankProposals(proposals: ProposalRow[]): ProposalRow[] {
  return [...proposals].sort((a, b) => {
    const r = (RANK[a.status] ?? 4) - (RANK[b.status] ?? 4);
    if (r !== 0) return r;
    if (a.action !== b.action) return a.action === "update" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/** One line above the list saying what is being asked of him. */
export function confirmLine(t: ProposalTally): string {
  if (t.open === 0 && t.applied === 0) return "Nothing to confirm on this one.";
  if (t.open === 0) return `Done — ${t.applied} accepted.`;
  return `${t.open} thing${t.open === 1 ? "" : "s"} to confirm.`;
}
