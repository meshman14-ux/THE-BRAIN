/**
 * The One-Page Summary — the fourth area on Jay's sheet, and the only one
 * with no table behind it.
 *
 * It is ASSEMBLED, never generated. Every line is arithmetic over rows that
 * already exist: the plan he wrote, the KPIs he logged, the checklist he
 * ticked. That is the same bargain the morning brief makes in §A3 decision
 * 6 — it costs nothing, needs no API key, and cannot hallucinate a number
 * he never entered.
 *
 * A missing input produces no line rather than a hedged one. A summary that
 * pads itself to a page is a page nobody reads twice.
 */

import { type ChecklistItem, nextObligation, obligationsOverdue } from "./checklist";
import { type RagResult } from "./scoring";
import { PLAN_SECTIONS } from "./templates";
import { type VentureModuleRow, TIER_LABEL, readTier } from "./types";

export type KpiWithReading = {
  id: string;
  name: string;
  unit: string | null;
  target: number | null;
  direction: "up" | "down" | string;
  latest: { taken_on: string; value: number } | null;
};

export type SummaryInput = {
  venture: VentureModuleRow;
  plan: Record<string, string | null | undefined>;
  kpis: KpiWithReading[];
  checklist: ChecklistItem[];
  score: { score: number | null; basis: string };
  rag: RagResult;
  today: string;
};

export type SummaryLine = { label: string; value: string };

export type OnePageSummary = {
  headline: string;
  /** The plan's own words, where he has written them. Never paraphrased. */
  paragraphs: { title: string; body: string }[];
  facts: SummaryLine[];
  /** What the summary could not say, and why. Honest beats complete. */
  missing: string[];
};

const fmt = (n: number, unit: string | null): string => {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(2);
  if (!unit) return v;
  if (unit === "£") return `£${v}`;
  if (unit === "%") return `${v}%`;
  return `${v} ${unit}`;
};

/**
 * The three sections worth handing someone: what it is, what it earns, and
 * what is in the way. Anything he has not written is left out and named at
 * the bottom, so the page is short and the gap is obvious.
 */
export function onePageSummary(input: SummaryInput): OnePageSummary {
  const { venture, plan, kpis, checklist, score, rag, today } = input;
  const tier = readTier(venture.tier);

  const headline = venture.one_liner?.trim() || venture.name;

  const KEY_SECTIONS = ["problem", "offer", "unit", "next"];
  const paragraphs = PLAN_SECTIONS.filter((s) => KEY_SECTIONS.includes(s.key))
    .map((s) => ({ title: s.title, body: (plan[s.key] ?? "").trim() }))
    .filter((p) => p.body !== "");

  const facts: SummaryLine[] = [];
  if (tier) facts.push({ label: "Where it is", value: TIER_LABEL[tier] });
  if (score.score != null) {
    facts.push({ label: "Score", value: `${score.score} · ${score.basis}` });
  }
  facts.push({ label: "State", value: rag.reason });

  for (const k of kpis.filter((x) => x.latest)) {
    const latest = k.latest as { taken_on: string; value: number };
    const target = k.target != null ? ` of ${fmt(k.target, k.unit)}` : "";
    facts.push({
      label: k.name,
      value: `${fmt(latest.value, k.unit)}${target} · ${latest.taken_on}`,
    });
  }

  const overdue = obligationsOverdue(checklist, today);
  const next = nextObligation(checklist, today);
  if (overdue.length) {
    facts.push({
      label: "Overdue",
      value: `${overdue.length} statutory ${overdue.length === 1 ? "item" : "items"}`,
    });
  } else if (next?.due_date) {
    facts.push({ label: "Next obligation", value: `${next.title} · ${next.due_date}` });
  }

  const missing: string[] = [];
  if (!venture.one_liner?.trim()) missing.push("a one-line description");
  if (!paragraphs.length) missing.push("any of the plan");
  if (!kpis.some((k) => k.latest)) missing.push("a single KPI reading");
  if (!checklist.length) missing.push("a checklist");

  return { headline, paragraphs, facts, missing };
}

/**
 * The summary as plain text, for the one thing a summary is actually for:
 * handing it to somebody. Copy, paste, send — no export format, no library.
 */
export function summaryText(s: OnePageSummary, name: string): string {
  const lines: string[] = [name, "=".repeat(name.length), "", s.headline, ""];
  for (const p of s.paragraphs) {
    lines.push(p.title.toUpperCase(), p.body, "");
  }
  for (const f of s.facts) lines.push(`${f.label}: ${f.value}`);
  if (s.missing.length) {
    lines.push("", `Not recorded: ${s.missing.join(", ")}.`);
  }
  return lines.join("\n");
}
