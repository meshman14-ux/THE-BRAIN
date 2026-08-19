/**
 * Reading the checklist — what is overdue, what is next, and what that
 * means for the venture's colour.
 *
 * A due date that has passed is the one fact in this module that outranks
 * every tier's tolerance, so this file is what `scoring.ts` is fed.
 */

import { daysBetween } from "./scoring";

export type ChecklistItem = {
  id: string;
  rule_key: string | null;
  title: string;
  category: string | null;
  obligation: boolean;
  due_date: string | null;
  cadence: string | null;
  done: boolean;
  done_on: string | null;
  guidance_url: string | null;
  note: string | null;
};

/** Open statutory items whose date has passed. */
export function obligationsOverdue(items: ChecklistItem[], today: string): ChecklistItem[] {
  return items
    .filter((i) => i.obligation && !i.done && i.due_date && i.due_date < today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
}

/** The next open statutory item with a date, overdue ones first. */
export function nextObligation(items: ChecklistItem[], today: string): ChecklistItem | null {
  const dated = items
    .filter((i) => i.obligation && !i.done && i.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  if (!dated.length) return null;
  const overdue = dated.find((i) => (i.due_date as string) < today);
  return overdue ?? dated[0];
}

/**
 * Days until the nearest open obligation — negative when overdue, and NULL
 * when nothing is dated. Null is not "nothing is due": it is "nobody has
 * written down when", which is exactly the state the four DVLA notices
 * were in, so the UI must say which of the two it is looking at.
 */
export function nextObligationDays(items: ChecklistItem[], today: string): number | null {
  const next = nextObligation(items, today);
  if (!next?.due_date) return null;
  return daysBetween(today, next.due_date);
}

export type ChecklistProgress = {
  total: number;
  done: number;
  obligations: number;
  obligationsDone: number;
  undated: number;
};

/**
 * `undated` is the figure worth showing beside the others: an obligation
 * with no date is not being watched by anything, however ticked the rest of
 * the list looks.
 */
export function checklistProgress(items: ChecklistItem[]): ChecklistProgress {
  const obligations = items.filter((i) => i.obligation);
  return {
    total: items.length,
    done: items.filter((i) => i.done).length,
    obligations: obligations.length,
    obligationsDone: obligations.filter((i) => i.done).length,
    undated: obligations.filter((i) => !i.done && !i.due_date).length,
  };
}

/**
 * The order the list is read in: overdue first, then dated by date, then
 * undated obligations, then everything else, then what is already done.
 * Done items stay on the page rather than disappearing — a list that
 * quietly shortens gives no sense of having got anywhere.
 */
export function sortChecklist(items: ChecklistItem[], today: string): ChecklistItem[] {
  const rank = (i: ChecklistItem): number => {
    if (i.done) return 4;
    if (i.due_date && i.due_date < today) return 0;
    if (i.due_date) return 1;
    if (i.obligation) return 2;
    return 3;
  };
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ad = a.due_date ?? "9999-12-31";
    const bd = b.due_date ?? "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.title.localeCompare(b.title);
  });
}

/** One line for the card face. Says the worst true thing, or nothing much. */
export function checklistLine(items: ChecklistItem[], today: string): string {
  if (!items.length) return "Nothing generated yet.";
  const p = checklistProgress(items);
  const overdue = obligationsOverdue(items, today);
  if (overdue.length) {
    return `${overdue.length} overdue · ${p.done} of ${p.total} done`;
  }
  const next = nextObligation(items, today);
  if (next?.due_date) {
    const days = daysBetween(today, next.due_date);
    return `${p.done} of ${p.total} done · next in ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (p.undated) {
    return `${p.done} of ${p.total} done · ${p.undated} with no date`;
  }
  return `${p.done} of ${p.total} done`;
}
