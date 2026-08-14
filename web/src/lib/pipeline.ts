/* ------------------------------------------------------------------ *
 * The pipeline — what is on the table
 *
 * `opportunities` shipped with the v1 schema and is empty. It has had a
 * nav item in EMPIRE mode and a slot on the phone bar since the mode
 * switch was built, pointing at a placeholder page that says the view
 * will exist one day. This is that view.
 *
 * A HOLDING AND A DEAL ARE DIFFERENT QUESTIONS, which is why this is not
 * part of `holdings.ts`. An asset is a thing you own and the question is
 * what it is worth; an opportunity is a thing you are chasing and the
 * question is **whose move is it and when**. That second question is the
 * whole value of the table, and it is the reason the ordering here is
 * worst-first where the holdings board is largest-first.
 *
 * WHAT THIS MODULE DELIBERATELY REFUSES TO DO is weight the pipeline by
 * a per-stage probability. Every CRM does it and it produces a single
 * confident number — and that number would be `value_est` multiplied by
 * a coefficient nobody in this system has ever measured. Inventing one
 * would be the exact failure `debts.apr` already documents: a missing
 * rate treated as zero sorts a real credit card to the bottom of the
 * queue. So the open pipeline is reported as a CEILING with the count of
 * unestimated deals beside it, and the honest number is left honest.
 * ------------------------------------------------------------------ */

import type { Opportunity } from "./types";
import { daysUntil, toNumberOrNull } from "./logic";

/* ------------------------------------------------------------------ *
 * 1 · The stages
 * ------------------------------------------------------------------ */

/**
 * `opportunities.stage` is free text defaulting to `lead`, with no check
 * constraint — the same standing `goals.status` and `projects.status`
 * have. These are the values the app gives meaning to; a value read back
 * from the database may be outside this union and must not crash a page.
 */
export const STAGES = ["lead", "talking", "quoted", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  lead: "Lead",
  talking: "Talking",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

/** The two that end a deal. Everything else is still live. */
export const CLOSED_STAGES: Stage[] = ["won", "lost"];

/**
 * An unrecognised stage is treated as OPEN, and that direction is
 * deliberate. Treating it as closed would silently drop a real deal off
 * the board — the failure would be invisible, because a board is not
 * obviously missing a row. Treating it as open at worst leaves something
 * on screen that should not be there, which is a failure you can see.
 */
export function isOpen(stage: string): boolean {
  return !(CLOSED_STAGES as string[]).includes(stage);
}

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage as Stage] ?? stage;
}

/* ------------------------------------------------------------------ *
 * 2 · Whose move is it
 * ------------------------------------------------------------------ */

/**
 * Why a deal needs looking at, or `clear` when it does not.
 *
 * `unowned` is the state worth having this table for. A deal with a value
 * and a stage and no next step is a deal nobody has agreed to do anything
 * about, and it is how things quietly die — the same failure `dormancy`
 * catches for tasks, and it is caught here at read time and stored
 * nowhere for the same reason.
 */
export type Attention = "overdue" | "today" | "unowned" | "clear";

export type Deal = {
  opportunity: Opportunity;
  open: boolean;
  attention: Attention;
  /** Days until the next step. Negative is overdue. Null without a date. */
  daysToStep: number | null;
  /** Estimated value, or null. Never zero-for-unknown. */
  value: number | null;
};

export function toDeal(o: Opportunity, todayIso: string): Deal {
  const open = isOpen(o.stage);
  const daysToStep = o.next_step_date ? daysUntil(o.next_step_date, todayIso) : null;
  const hasStep = (o.next_step ?? "").trim() !== "" || o.next_step_date != null;

  let attention: Attention = "clear";
  if (open) {
    if (daysToStep != null && daysToStep < 0) attention = "overdue";
    else if (daysToStep === 0) attention = "today";
    else if (!hasStep) attention = "unowned";
  }

  return { opportunity: o, open, attention, daysToStep, value: toNumberOrNull(o.value_est) };
}

/* ------------------------------------------------------------------ *
 * 3 · The order
 * ------------------------------------------------------------------ */

const ATTENTION_RANK: Record<Attention, number> = {
  overdue: 0,
  today: 1,
  unowned: 2,
  clear: 3,
};

/**
 * Worst first, and here that means *most overdue a decision*, not
 * biggest. Closed deals go last whatever they were worth: a won deal is
 * a record, not a thing to do.
 *
 * Inside `clear`, the soonest next step leads and a deal with no date
 * sorts after every dated one — an undated step is not urgent, it is
 * unscheduled, and putting it first would push real deadlines down.
 */
export function rankDeals(deals: Deal[]): Deal[] {
  return [...deals].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    const ra = ATTENTION_RANK[a.attention];
    const rb = ATTENTION_RANK[b.attention];
    if (ra !== rb) return ra - rb;
    if (a.attention === "overdue") {
      // Most overdue first: both are negative, so the smaller number leads.
      return (a.daysToStep ?? 0) - (b.daysToStep ?? 0);
    }
    if ((a.daysToStep == null) !== (b.daysToStep == null)) return a.daysToStep == null ? 1 : -1;
    if (a.daysToStep != null && b.daysToStep != null && a.daysToStep !== b.daysToStep) {
      return a.daysToStep - b.daysToStep;
    }
    return a.opportunity.title.localeCompare(b.opportunity.title);
  });
}

/* ------------------------------------------------------------------ *
 * 4 · The totals
 * ------------------------------------------------------------------ */

export type PipelineTotals = {
  openCount: number;
  /** Sum of the estimates that exist. Null when none does. */
  openValue: number | null;
  /** Open deals with no estimate. What makes `openValue` a floor. */
  unestimated: number;
  /** True when every open deal carries an estimate. */
  complete: boolean;
  wonCount: number;
  lostCount: number;
  /** Won value, for deals that carried an estimate. */
  wonValue: number | null;
  needingAttention: number;
};

export function pipelineTotals(deals: Deal[]): PipelineTotals {
  const open = deals.filter((d) => d.open);
  const estimates = open.map((d) => d.value).filter((v): v is number => v != null);
  const won = deals.filter((d) => d.opportunity.stage === "won");
  const wonEstimates = won.map((d) => d.value).filter((v): v is number => v != null);

  return {
    openCount: open.length,
    openValue: estimates.length === 0 ? null : estimates.reduce((a, b) => a + b, 0),
    unestimated: open.length - estimates.length,
    complete: open.length > 0 && estimates.length === open.length,
    wonCount: won.length,
    lostCount: deals.filter((d) => d.opportunity.stage === "lost").length,
    wonValue: wonEstimates.length === 0 ? null : wonEstimates.reduce((a, b) => a + b, 0),
    needingAttention: open.filter((d) => d.attention !== "clear").length,
  };
}

/* ------------------------------------------------------------------ *
 * 5 · The win rate, and the floor it stays silent below
 * ------------------------------------------------------------------ */

/**
 * Five closed deals. Below that a win rate is arithmetic on noise — one
 * win in two is "50%" and means nothing at all — and a number that means
 * nothing is worse than a blank, because it invites a decision.
 *
 * `obstacleTally` keeps the same discipline at three reviews, and
 * `calibration` at eight finished tasks. Same rule, different floor.
 */
export const WIN_RATE_FLOOR = 5;

export function winRate(deals: Deal[]): { pct: number | null; closed: number } {
  const won = deals.filter((d) => d.opportunity.stage === "won").length;
  const lost = deals.filter((d) => d.opportunity.stage === "lost").length;
  const closed = won + lost;
  return {
    pct: closed < WIN_RATE_FLOOR ? null : Math.round((won / closed) * 100),
    closed,
  };
}

/* ------------------------------------------------------------------ *
 * 6 · The one line
 * ------------------------------------------------------------------ */

/**
 * Ranked by what it costs to ignore. An overdue next step is a promise
 * already broken; an unowned deal is one about to be. Silent when the
 * board is clear, because a board that congratulates you is a board you
 * stop reading.
 */
export function pipelineLine(deals: Deal[]): string | null {
  const open = deals.filter((d) => d.open);
  if (open.length === 0) return null;

  const overdue = open.filter((d) => d.attention === "overdue");
  if (overdue.length === 1) {
    const d = overdue[0];
    return `${d.opportunity.title} — next step was ${-(d.daysToStep ?? 0)} days ago.`;
  }
  if (overdue.length > 1) return `${overdue.length} next steps are past their date.`;

  const today = open.filter((d) => d.attention === "today");
  if (today.length > 0) {
    return `${today.length} next step${today.length === 1 ? " is" : "s are"} due today.`;
  }

  const unowned = open.filter((d) => d.attention === "unowned");
  if (unowned.length > 0) {
    return `${unowned.length} open ${unowned.length === 1 ? "deal has" : "deals have"} no next step, which is how they go quiet.`;
  }
  return null;
}
