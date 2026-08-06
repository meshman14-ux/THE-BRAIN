/**
 * The advisor — locked decision 6.
 *
 *   "AI = briefing + retrieval advisor. Morning brief from own data;
 *    ask-anything over notes with citations; review assistant drafting from
 *    evidence. **Advisory, never autonomous.**"
 *
 * Three rules run through everything here.
 *
 * **Advisory, never autonomous.** Nothing in this file, and nothing in the
 * routes that use it, writes to the database. The advisor produces text he
 * reads and acts on himself. There is no path from a model's output to a
 * row — see ADVISOR_NEVER_WRITES.
 *
 * **Nothing is asserted without a citation.** An answer is built from his own
 * notes, each one numbered, and a claim with no [n] beside it is a claim the
 * system made up. `uncitedSentences` finds those and the UI shows them as
 * unsupported rather than quietly presenting them as fact.
 *
 * **The brief is a push surface; the answer is a pull surface.** He goes to
 * the advisor and asks — so his principle library is fair game there. The
 * morning brief arrives unasked, so PRINCIPLES_NEVER_PUSH applies to it in
 * full. That distinction is the whole of §A7's "pulled, never pushed" rule,
 * and it is enforced here rather than remembered.
 */

import type { Note, Pillar, Task, Venture } from "./types";
import { PRINCIPLES_NEVER_PUSH } from "./types";
import {
  addDays,
  daysUntil,
  isOpenWork,
  toTextOrNull,
  type WatchAlert,
} from "./logic";

/**
 * Written down so a future change has to read it. The advisor answers
 * questions and drafts text; it never creates a task, edits a goal, moves a
 * date, or files anything. If a future feature wants it to, that is a
 * conversation with Jay, not a refactor.
 */
export const ADVISOR_NEVER_WRITES = true;

/* ------------------------------------------------------------------ *
 * Retrieval
 * ------------------------------------------------------------------ */

export type Source = {
  /** 1-based, and what the model is told to cite. */
  n: number;
  id: string;
  title: string;
  kind: string;
  /** The passage the answer may lean on — never the whole note. */
  passage: string;
  score: number;
};

/** Stop words, kept short: at this vault size a long list mostly hurts. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "for",
  "with", "is", "are", "was", "were", "be", "been", "it", "its", "this",
  "that", "these", "those", "i", "my", "me", "you", "your", "what", "how",
  "when", "why", "do", "does", "did", "should", "would", "can", "could",
  "about", "from", "into", "have", "has", "had", "will", "any", "all",
  "there", "here", "which", "who", "some", "than", "then", "get", "got",
]);

export function terms(query: string): string[] {
  return (query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * How well one note answers a question.
 *
 * Deliberately a plain scorer rather than vector search. `notes.embedding` is
 * `vector(1536)` and pgvector is enabled, but the vault currently holds
 * eleven notes — semantic search over eleven rows is slower, costs an
 * embedding provider, and ranks *worse* than matching the words he used.
 * `RETRIEVAL_CEILING` records the point at which that stops being true.
 */
export const RETRIEVAL_CEILING = 200;

export function scoreNote(
  note: Pick<Note, "title" | "body" | "tags">,
  queryTerms: string[]
): number {
  if (queryTerms.length === 0) return 0;
  const title = (note.title ?? "").toLowerCase();
  const body = (note.body ?? "").toLowerCase();
  const tags = (note.tags ?? []).join(" ").toLowerCase();

  let score = 0;
  for (const t of queryTerms) {
    // A hit in the title is worth more than a hit buried in the body: he
    // titled it that for a reason.
    if (title.includes(t)) score += 3;
    if (tags.includes(t)) score += 2;
    const hits = body.split(t).length - 1;
    if (hits > 0) score += 1 + Math.min(hits - 1, 3) * 0.25;
  }
  // Every term present beats one term present many times.
  const covered = queryTerms.filter(
    (t) => title.includes(t) || body.includes(t) || tags.includes(t)
  ).length;
  return score * (covered / queryTerms.length);
}

/** The most relevant window of a note, so the model reads the right part. */
export function passageFor(body: string | null, queryTerms: string[], width = 320): string {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= width) return text;
  const lower = text.toLowerCase();
  let best = 0;
  let bestHits = -1;
  for (let start = 0; start < text.length; start += 80) {
    const window = lower.slice(start, start + width);
    const hits = queryTerms.filter((t) => window.includes(t)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = start;
    }
  }
  const slice = text.slice(best, best + width).trim();
  return `${best > 0 ? "…" : ""}${slice}${best + width < text.length ? "…" : ""}`;
}

export const MAX_SOURCES = 6;

/**
 * The sources an answer is allowed to use.
 *
 * Principles are included: the advisor is somewhere he *goes*, and asking a
 * question is pulling. The rule they are covered by is about arriving
 * uninvited — see `briefSources` for the other side of it.
 */
export function retrieve<T extends Pick<Note, "id" | "title" | "body" | "kind" | "tags">>(
  notes: T[],
  query: string,
  limit = MAX_SOURCES
): Source[] {
  const q = terms(query);
  if (q.length === 0) return [];
  return notes
    .map((n) => ({ note: n, score: scoreNote(n, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.note.id.localeCompare(b.note.id))
    .slice(0, limit)
    .map((x, i) => ({
      n: i + 1,
      id: x.note.id,
      title: toTextOrNull(x.note.title) ?? "Untitled",
      kind: x.note.kind,
      passage: passageFor(x.note.body, q),
      score: Math.round(x.score * 100) / 100,
    }));
}

/* ------------------------------------------------------------------ *
 * Citations
 * ------------------------------------------------------------------ */

/** Every [n] the answer cites, in order, deduplicated. */
export function citedNumbers(answer: string): number[] {
  const out: number[] = [];
  for (const m of (answer ?? "").matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** A citation pointing at a source that does not exist is a fabrication. */
export function invalidCitations(answer: string, sources: Source[]): number[] {
  const valid = new Set(sources.map((s) => s.n));
  return citedNumbers(answer).filter((n) => !valid.has(n));
}

/**
 * Sentences that assert something and cite nothing.
 *
 * The point is not to be strict for its own sake — it is that an answer over
 * his own notes should be traceable to them, and the one failure mode worth
 * catching is a confident sentence with no source behind it. Questions and
 * short connective lines are ignored; they assert nothing.
 */
export function uncitedSentences(answer: string): string[] {
  return (answer ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && !s.endsWith("?") && !/\[\d+\]/.test(s));
}

export type AnswerCheck = {
  cited: number[];
  invalid: number[];
  uncited: string[];
  /** True when every asserting sentence carries a citation that resolves. */
  grounded: boolean;
};

export function checkAnswer(answer: string, sources: Source[]): AnswerCheck {
  const invalid = invalidCitations(answer, sources);
  const uncited = uncitedSentences(answer);
  return {
    cited: citedNumbers(answer),
    invalid,
    uncited,
    grounded: invalid.length === 0 && uncited.length === 0,
  };
}

/* ------------------------------------------------------------------ *
 * The prompt
 * ------------------------------------------------------------------ */

/**
 * The advisor's standing instructions.
 *
 * Short on purpose. Long prompts full of CRITICAL and MUST are written for
 * models that needed shouting at; this one follows plain instructions, and
 * the emphasis would only make it hedge.
 */
export const ADVISOR_SYSTEM = [
  "You are the advisor inside THE BRAIN, Jay's personal operating system.",
  "You answer from the numbered sources you are given and from nothing else.",
  "",
  "Cite every claim with the source number in square brackets, like [2]. If",
  "the sources do not answer the question, say so plainly and stop — a short",
  "honest answer beats a long one built on guesses.",
  "",
  "You are advisory. You never take an action, and you never claim to have",
  "done anything. Suggest what he might do and leave the doing to him.",
  "",
  "Write plainly and a little dry. No exclamation marks, no preamble, no",
  "offers of further help. British spelling, GBP for money.",
].join("\n");

export function buildPrompt(question: string, sources: Source[]): string {
  const block = sources
    .map((s) => `[${s.n}] ${s.title} (${s.kind})\n${s.passage}`)
    .join("\n\n");
  return [
    "Sources from Jay's own notes:",
    "",
    block || "(none — his vault has nothing matching this question)",
    "",
    `Question: ${question.trim()}`,
  ].join("\n");
}

/** Refuse to spend a request on something the sources cannot answer. */
export function worthAsking(question: string, sources: Source[]): boolean {
  return terms(question).length > 0 && sources.length > 0;
}

/* ------------------------------------------------------------------ *
 * The morning brief — assembled, not generated
 * ------------------------------------------------------------------ */

export type BriefItem = {
  kind: "attention" | "today" | "habit" | "money" | "empire" | "calendar";
  text: string;
  href: string;
  /** Lower is louder. */
  rank: number;
};

export type Brief = {
  greeting: string;
  date: string;
  items: BriefItem[];
  /** Said out loud when there is genuinely nothing to raise. */
  quiet: boolean;
};

/**
 * The brief is **assembled from his own data, not written by a model**.
 *
 * Decision 6 calls it a "morning brief from own data", and the honest reading
 * of that is arithmetic, not prose: every line below is a fact the database
 * already knows, so the brief costs nothing, works with no API key, and
 * cannot hallucinate. The model's job is answering questions, not narrating
 * numbers it was handed.
 */
export function morningBrief(input: {
  todayIso: string;
  greeting: string;
  alerts: WatchAlert[];
  tasksToday: Pick<Task, "id" | "title" | "status">[];
  habitsDone: { done: number; of: number };
  debtKnown: number | null;
  debtComplete: boolean;
  onboarded: { done: number; total: number };
  conflicts: number;
  unsynced: number;
}): Brief {
  const items: BriefItem[] = [];

  for (const a of input.alerts.slice(0, 4)) {
    items.push({ kind: "attention", text: a.text, href: a.href, rank: 0 });
  }

  const open = input.tasksToday.filter(isOpenWork);
  if (open.length > 0) {
    items.push({
      kind: "today",
      text:
        open.length === 1
          ? `One thing set for today: ${open[0].title}.`
          : `${open.length} things set for today. First: ${open[0].title}.`,
      href: "/dashboard",
      rank: 1,
    });
  }

  if (input.conflicts > 0) {
    items.push({
      kind: "calendar",
      text: `${input.conflicts} calendar conflict${input.conflicts === 1 ? "" : "s"} waiting on a decision — nothing has been changed on either side.`,
      href: "/calendar",
      rank: 1,
    });
  }

  if (input.habitsDone.of > 0 && input.habitsDone.done < input.habitsDone.of) {
    items.push({
      kind: "habit",
      text: `${input.habitsDone.done} of ${input.habitsDone.of} habits ticked.`,
      href: "/life#habits",
      rank: 3,
    });
  }

  if (input.debtKnown != null && !input.debtComplete) {
    items.push({
      kind: "money",
      text: "The debt total is still partial — some creditors have no balance against them.",
      href: "/life/debts",
      rank: 2,
    });
  }

  if (input.onboarded.done < input.onboarded.total) {
    const left = input.onboarded.total - input.onboarded.done;
    items.push({
      kind: "empire",
      text: `${left} division${left === 1 ? "" : "s"} still to onboard. Each one is seven questions.`,
      href: "/empire",
      rank: 4,
    });
  }

  if (input.unsynced > 0) {
    items.push({
      kind: "calendar",
      text: `${input.unsynced} scheduled task${input.unsynced === 1 ? "" : "s"} not yet in Google.`,
      href: "/calendar",
      rank: 5,
    });
  }

  items.sort((a, b) => a.rank - b.rank);
  return {
    greeting: input.greeting,
    date: input.todayIso,
    items,
    quiet: items.length === 0,
  };
}

/**
 * The sources the brief is allowed to draw on: **never a principle.**
 *
 * This is PRINCIPLES_NEVER_PUSH, enforced rather than remembered. The
 * principle library is somewhere he goes; ninety bullet points of collected
 * advice arriving with the morning brief is exactly the clutter the
 * surface-three design exists to prevent. The creed is the one exception,
 * and only because he wrote it himself.
 */
export function briefSources<T extends Pick<Note, "kind">>(notes: T[]): T[] {
  if (!PRINCIPLES_NEVER_PUSH) return notes;
  return notes.filter((n) => n.kind !== "principle");
}

/* ------------------------------------------------------------------ *
 * The review assistant — evidence, then a draft he edits
 * ------------------------------------------------------------------ */

export type ReviewEvidence = {
  /** What actually got finished, by title. */
  done: string[];
  /** Still open and dated inside the week. */
  slipped: string[];
  habits: { name: string; hits: number; of: number }[];
  hoursAssigned: number;
  hoursOf: number;
  obstacles: string[];
};

/**
 * The evidence a weekly review is drafted from.
 *
 * Facts first, and only facts: what he finished, what slipped, how the habits
 * went, how much of the week got a purpose. A review assistant that opens
 * with an opinion is a review assistant nobody trusts twice.
 */
export function reviewEvidence(input: {
  weekStart: string;
  weekEnd: string;
  tasks: (Pick<Task, "title" | "status" | "do_date"> & { completed_at?: string | null })[];
  habits: { name: string; days: string[] }[];
  hoursAssigned: number;
  hoursOf: number;
  obstacles: string[];
}): ReviewEvidence {
  const inWeek = (d: string | null | undefined) => {
    const s = toTextOrNull(d)?.slice(0, 10);
    return s != null && s >= input.weekStart && s <= input.weekEnd;
  };

  return {
    done: input.tasks
      .filter((t) => t.status === "done" && (inWeek(t.completed_at) || inWeek(t.do_date)))
      .map((t) => t.title),
    slipped: input.tasks
      .filter((t) => isOpenWork(t) && inWeek(t.do_date))
      .map((t) => t.title),
    habits: input.habits.map((h) => ({
      name: h.name,
      hits: h.days.filter((d) => d >= input.weekStart && d <= input.weekEnd).length,
      of: 7,
    })),
    hoursAssigned: input.hoursAssigned,
    hoursOf: input.hoursOf,
    obstacles: input.obstacles,
  };
}

/** The evidence, as the lines the draft prompt is built from. */
export function evidenceLines(e: ReviewEvidence): string[] {
  const lines: string[] = [];
  lines.push(
    e.done.length === 0
      ? "Finished this week: nothing recorded."
      : `Finished this week: ${e.done.join("; ")}.`
  );
  if (e.slipped.length > 0) {
    lines.push(`Set for a day this week and still open: ${e.slipped.join("; ")}.`);
  }
  for (const h of e.habits) {
    lines.push(`${h.name}: ${h.hits} of ${h.of} days.`);
  }
  lines.push(`Hours given a purpose: ${e.hoursAssigned} of ${e.hoursOf}.`);
  if (e.obstacles.length > 0) {
    lines.push(`Obstacles he has named before: ${e.obstacles.join(", ")}.`);
  }
  return lines;
}

export const REVIEW_SYSTEM = [
  "You are drafting a weekly review for Jay from the evidence below.",
  "",
  "Write three short paragraphs, labelled exactly: What went well / What",
  "didn't / Next week's focus. Use only what the evidence says — if it is",
  "thin, say the week is thinly recorded rather than inventing a narrative.",
  "",
  "This is a draft he will edit, not a verdict. Do not congratulate, do not",
  "reassure, and do not tell him what he should feel. Plain and a little dry.",
].join("\n");

export function buildReviewPrompt(e: ReviewEvidence): string {
  return [
    "Evidence for the week:",
    "",
    ...evidenceLines(e).map((l) => `- ${l}`),
    "",
    "Draft the three paragraphs.",
  ].join("\n");
}

/** Whether there is enough on record for a draft to mean anything. */
export const MIN_EVIDENCE_LINES = 2;

export function enoughEvidence(e: ReviewEvidence): boolean {
  return (
    e.done.length + e.slipped.length > 0 ||
    e.habits.some((h) => h.hits > 0) ||
    e.hoursAssigned > 0
  );
}

/* ------------------------------------------------------------------ *
 * What the page says about the connection
 * ------------------------------------------------------------------ */

export type AdvisorState = "unconfigured" | "ready" | "error";

export function advisorState(input: {
  configured: boolean;
  lastError: string | null;
}): AdvisorState {
  if (!input.configured) return "unconfigured";
  return toTextOrNull(input.lastError) != null ? "error" : "ready";
}

/** Suggested questions, drawn from what his vault actually contains. */
export function suggestedQuestions(input: {
  noteCount: number;
  hasPrinciples: boolean;
  ventures: Pick<Venture, "name" | "external_system">[];
  areas: Pick<Pillar, "name">[];
}): string[] {
  const out: string[] = [];
  if (input.hasPrinciples) {
    out.push("What did I write down about starting something new?");
    out.push("What do my principles say about money?");
  }
  const v = input.ventures.find((x) => x.external_system == null);
  if (v) out.push(`What have I written about ${v.name}?`);
  const a = input.areas[0];
  if (a) out.push(`What are my notes on ${a.name}?`);
  return out.slice(0, 4);
}

/** The window the brief looks at for "coming up". */
export const BRIEF_LOOKAHEAD = 7;

export function comingUp<T extends { due_date: string | null; title: string }>(
  items: T[],
  todayIso: string
): T[] {
  const end = addDays(todayIso, BRIEF_LOOKAHEAD);
  return items.filter((i) => {
    const d = toTextOrNull(i.due_date);
    if (d == null) return false;
    return d >= todayIso && d <= end && daysUntil(d, todayIso) != null;
  });
}
