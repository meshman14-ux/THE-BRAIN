/* ------------------------------------------------------------------ *
 * The one line
 *
 * One line a day, maximum, which means it must rank — and ranking means
 * a strict order, not a score. The order is not about importance in the
 * abstract; it is about who is doing the punishing:
 *
 *   1. The WORLD punishes it — a lapsed MOT, a missed payment. These are
 *      fines and legal consequences, not opinions this system holds.
 *   2. The FLOOR is breached — the things Jay declared he would do.
 *   3. The MONTH has not counted — but never before the 25th.
 *   4. A typed truth has gone STALE — one, oldest first, never a list.
 *   5. SILENCE.
 *
 * Three rules the line obeys, each written because the alternative has
 * already failed somewhere in this system:
 *
 *   · **Never twice running on the same subject.** A repeated line is a
 *     line you learn to skip. If training is still down tomorrow, say
 *     nothing tomorrow — and say it again on the fourth day.
 *   · **Never accuse the system's own emptiness.** If nothing is logged,
 *     the line is about the logging, never about Jay. The habit board
 *     made the other mistake once and stopped being opened.
 *   · **Always carry the evidence.** "Trained twice in the last
 *     fortnight", never "training is low". A line without its evidence
 *     is an instruction, and instructions get followed twice then
 *     ignored.
 *
 * And silence must be LEGIBLE. An empty space reads as broken, so the
 * quiet state is a sentence of its own — "Floor intact. Nothing needs
 * you." That sentence is the product. Everything above it exists to earn
 * the right to print it.
 * ------------------------------------------------------------------ */

import {
  type LifeContracts,
  type StaleTruth,
  floorState,
  monthNudge,
  stalest,
} from "./lifeos";

export type LineKind = "world" | "floor" | "month" | "stale" | "silence";

export type OneLine = {
  kind: LineKind;
  /** The whole message, evidence included. Never a headline plus a body. */
  line: string;
  /** What the line is ABOUT, for the never-twice-running rule. */
  subject: string;
  /** Where to go, when there is somewhere. */
  href?: string;
};

export const SILENCE: OneLine = {
  kind: "silence",
  subject: "silence",
  line: "Floor intact. Nothing needs you.",
};

/** How many days a subject stays quiet after it has been said once. */
export const REPEAT_GAP_DAYS = 3;

export type LineInput = {
  contracts: LifeContracts;
  /** Watchtower alerts the world punishes: legal deadlines. */
  worldAlerts: { text: string; href?: string }[];
  finishesThisMonth: number;
  /** Ages in days of the truths that genuinely cost typing. */
  staleAges: { what: string; days: number | null }[];
  /** Subject → the ISO date it was last said. */
  lastSaid: Record<string, string>;
  todayIso: string;
};

/** Every line the system COULD say today, in strict order. */
export function candidates(input: LineInput): OneLine[] {
  const out: OneLine[] = [];

  // 1 · the world
  for (const a of input.worldAlerts) {
    out.push({
      kind: "world",
      subject: `world:${a.text.slice(0, 24)}`,
      line: a.text,
      href: a.href,
    });
  }

  // 2 · the floor. Only a real breach speaks — an unmeasured leg is the
  // system's own silence and gets rule 2, not an accusation.
  const floor = floorState(input.contracts);
  for (const b of floor.breached) {
    out.push({
      kind: "floor",
      subject: `floor:${b.slice(0, 16)}`,
      line: capitalise(b) + ".",
      href: "/life",
    });
  }

  // 3 · the month, never before the 25th
  const month = monthNudge(input.finishesThisMonth, input.todayIso);
  if (month) {
    out.push({ kind: "month", subject: "month", line: month, href: "/dashboard" });
  }

  // 4 · staleness — one, oldest first
  const stale: StaleTruth | null = stalest(input.staleAges);
  if (stale) {
    out.push({
      kind: "stale",
      subject: `stale:${stale.what}`,
      line: `${capitalise(stale.what)} are ${weeksish(stale.days)} old.`,
      href: "/life",
    });
  }

  return out;
}

/**
 * The line for today, or silence.
 *
 * A subject said inside the gap is skipped rather than delayed — the
 * next-ranked thing gets the slot instead, so a persistent breach does
 * not silence everything behind it for three days.
 */
export function oneLine(input: LineInput): OneLine {
  for (const c of candidates(input)) {
    const said = input.lastSaid[c.subject];
    if (said && daysBetween(said, input.todayIso) < REPEAT_GAP_DAYS) continue;
    return c;
  }
  return SILENCE;
}

/**
 * What silence actually means today, said honestly.
 *
 * "Floor intact" is a claim, and it can only be made when the floor is
 * genuinely measurable. When it is not, the quiet line says so — the
 * system being unable to check is different from the system checking and
 * finding nothing wrong, and pretending otherwise is the one dishonesty
 * this whole file exists to avoid.
 */
export function silenceFor(contracts: LifeContracts): OneLine {
  const floor = floorState(contracts);
  if (floor.held === true) return SILENCE;
  return {
    kind: "silence",
    subject: "silence",
    line: `Nothing needs you — though ${floor.unmeasured.join(" and ")} ${
      floor.unmeasured.length === 1 ? "is" : "are"
    } not being measured yet, so "floor intact" is more than this can honestly say.`,
    href: "/life",
  };
}

/* ------------------------------------------------------------------ */

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "six weeks" reads better than "41 days" for anything past a fortnight. */
function weeksish(days: number): string {
  if (days < 14) return `${days} days`;
  return `${Math.round(days / 7)} weeks`;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(to + "T00:00:00") - Date.parse(from + "T00:00:00")) / 86_400_000
  );
}
