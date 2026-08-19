import "server-only";

/**
 * The queries behind the module. Everything else in `venture/` is pure, so
 * this file is the only one that knows the database exists — which is what
 * lets 90-odd tests cover the rules without a connection.
 */

import { createClient } from "@/lib/supabase/server";
import { type ChecklistItem, nextObligationDays } from "./checklist";
import {
  type DimensionScores,
  type RagResult,
  type Rag,
  ventureRag,
  ventureScore,
} from "./scoring";
import { type KpiWithReading } from "./summary";
import { type VentureModuleRow, readTier } from "./types";

export const VENTURE_COLUMNS =
  "id, name, status, stage, one_liner, external_system, created_at, venture_group, tier, irl, venture_type, legal_structure, employs_people, turnover_band, vat_registered, last_touched_at, dormant_since, kill_criteria";

export type PortfolioRow = {
  venture: VentureModuleRow;
  rag: RagResult;
  score: ReturnType<typeof ventureScore>;
  overdue: number;
  kpiCount: number;
  checklistOpen: number;
};

export type Portfolio = {
  rows: PortfolioRow[];
  rags: Rag[];
};

/**
 * The whole portfolio in four queries rather than four per venture: the
 * ventures, their open checklist items, their KPIs' latest readings, and
 * their most recent score. Twenty-three ventures × four round trips is the
 * kind of page that gets opened once.
 */
export async function loadPortfolio(today: string): Promise<Portfolio> {
  const supabase = await createClient();
  const [{ data: ventures }, { data: checklist }, { data: kpis }, { data: readings }, { data: scores }] =
    await Promise.all([
      supabase.from("ventures").select(VENTURE_COLUMNS).order("sort_order"),
      supabase
        .from("venture_checklist_items")
        .select("id, venture_id, rule_key, title, category, obligation, due_date, cadence, done, done_on, guidance_url, note"),
      supabase.from("venture_kpis").select("id, venture_id, active"),
      supabase
        .from("venture_kpi_readings")
        .select("venture_id, taken_on")
        .order("taken_on", { ascending: false }),
      supabase
        .from("venture_scores")
        .select("venture_id, scored_on, demand, economics, capability, capacity, capital, compliance, defensibility, momentum")
        .order("scored_on", { ascending: false }),
    ]);

  const all = ((ventures ?? []) as VentureModuleRow[]).filter((v) => !v.external_system);
  const items = (checklist ?? []) as (ChecklistItem & { venture_id: string })[];
  const lastReading = new Map<string, string>();
  for (const r of (readings ?? []) as { venture_id: string; taken_on: string }[]) {
    if (!lastReading.has(r.venture_id)) lastReading.set(r.venture_id, r.taken_on);
  }
  const latestScore = new Map<string, DimensionScores>();
  for (const s of (scores ?? []) as ({ venture_id: string } & DimensionScores)[]) {
    if (!latestScore.has(s.venture_id)) latestScore.set(s.venture_id, s);
  }

  const rows: PortfolioRow[] = all.map((v) => {
    const mine = items.filter((i) => i.venture_id === v.id);
    const rag = ventureRag({
      tier: readTier(v.tier),
      lastTouched: v.last_touched_at ?? v.created_at ?? null,
      lastReading: lastReading.get(v.id) ?? null,
      nextObligationDays: nextObligationDays(mine, today),
      today,
    });
    return {
      venture: v,
      rag,
      score: ventureScore(latestScore.get(v.id) ?? {}),
      overdue: mine.filter((i) => i.obligation && !i.done && i.due_date && i.due_date < today).length,
      kpiCount: ((kpis ?? []) as { venture_id: string; active: boolean }[]).filter(
        (k) => k.venture_id === v.id && k.active
      ).length,
      checklistOpen: mine.filter((i) => !i.done).length,
    };
  });

  return { rows, rags: rows.map((r) => r.rag.rag) };
}

export type VentureModuleData = {
  venture: VentureModuleRow;
  checklist: ChecklistItem[];
  tasks: VentureTaskRow[];
  plan: Record<string, string>;
  documents: DocumentRow[];
  kpis: KpiWithReading[];
  score: DimensionScores;
  rag: RagResult;
};

export type VentureTaskRow = {
  id: string;
  title: string;
  notes: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  promoted_task_id: string | null;
};

export type DocumentRow = {
  id: string;
  title: string;
  kind: string | null;
  external_url: string | null;
  drive_url: string | null;
  storage_path: string | null;
  expires_on: string | null;
  note: string | null;
};

/** Everything one venture's five cards need, in one pass. */
export async function loadVentureModule(
  ventureId: string,
  today: string
): Promise<VentureModuleData | null> {
  const supabase = await createClient();
  const [
    { data: venture },
    { data: checklist },
    { data: tasks },
    { data: plan },
    { data: documents },
    { data: kpis },
    { data: readings },
    { data: scores },
  ] = await Promise.all([
    supabase.from("ventures").select(VENTURE_COLUMNS).eq("id", ventureId).maybeSingle(),
    supabase
      .from("venture_checklist_items")
      .select("id, rule_key, title, category, obligation, due_date, cadence, done, done_on, guidance_url, note")
      .eq("venture_id", ventureId),
    supabase
      .from("venture_tasks")
      .select("id, title, notes, priority, status, due_date, promoted_task_id")
      .eq("venture_id", ventureId)
      .order("created_at"),
    supabase.from("venture_plan_sections").select("section_key, body").eq("venture_id", ventureId),
    supabase
      .from("venture_documents")
      .select("id, title, kind, external_url, drive_url, storage_path, expires_on, note")
      .eq("venture_id", ventureId)
      .order("created_at", { ascending: false }),
    supabase
      .from("venture_kpis")
      .select("id, name, unit, target, direction, cadence, active, sort_order")
      .eq("venture_id", ventureId)
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("venture_kpi_readings")
      .select("kpi_id, taken_on, value")
      .eq("venture_id", ventureId)
      .order("taken_on", { ascending: false }),
    supabase
      .from("venture_scores")
      .select("scored_on, demand, economics, capability, capacity, capital, compliance, defensibility, momentum")
      .eq("venture_id", ventureId)
      .order("scored_on", { ascending: false })
      .limit(1),
  ]);

  if (!venture) return null;
  const v = venture as VentureModuleRow;
  const items = (checklist ?? []) as ChecklistItem[];
  const readingRows = (readings ?? []) as { kpi_id: string; taken_on: string; value: number }[];

  const kpiRows: KpiWithReading[] = ((kpis ?? []) as {
    id: string;
    name: string;
    unit: string | null;
    target: number | null;
    direction: string;
  }[]).map((k) => {
    const latest = readingRows.find((r) => r.kpi_id === k.id) ?? null;
    return {
      id: k.id,
      name: k.name,
      unit: k.unit,
      target: k.target,
      direction: k.direction,
      latest: latest ? { taken_on: latest.taken_on, value: Number(latest.value) } : null,
    };
  });

  const planBodies: Record<string, string> = {};
  for (const row of (plan ?? []) as { section_key: string; body: string | null }[]) {
    planBodies[row.section_key] = row.body ?? "";
  }

  const score = ((scores ?? [])[0] ?? {}) as DimensionScores;

  return {
    venture: v,
    checklist: items,
    tasks: (tasks ?? []) as VentureTaskRow[],
    plan: planBodies,
    documents: (documents ?? []) as DocumentRow[],
    kpis: kpiRows,
    score,
    rag: ventureRag({
      tier: readTier(v.tier),
      lastTouched: v.last_touched_at ?? v.created_at ?? null,
      lastReading: readingRows[0]?.taken_on ?? null,
      nextObligationDays: nextObligationDays(items, today),
      today,
    }),
  };
}

/** The open proposals queue — opinion, never applied until Jay taps. */
export type ProposalRow = {
  id: string;
  venture_id: string | null;
  kind: string;
  label: string;
  rationale: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

export async function loadOpenProposals(): Promise<ProposalRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("venture_proposals")
    .select("id, venture_id, kind, label, rationale, payload, status, created_at")
    .eq("status", "proposed")
    .order("created_at", { ascending: false });
  return (data ?? []) as ProposalRow[];
}

/**
 * Which observations have already been decided, so the same sentence is not
 * put to him twice. Keyed `kind:venture_id`, which is the same key the
 * queue renders by.
 */
export async function loadDecidedProposalKeys(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("venture_proposals")
    .select("kind, venture_id, status")
    .neq("status", "proposed");
  const out = new Set<string>();
  for (const row of (data ?? []) as { kind: string; venture_id: string | null }[]) {
    if (row.venture_id) out.add(`${row.kind}:${row.venture_id}`);
  }
  return out;
}
