"use client";

import { useState } from "react";
import {
  ChecklistPanel,
  DocumentsPanel,
  PlanPanel,
  SummaryPanel,
  TasksPanel,
} from "./AreaPanels";
import { checklistLine } from "@/lib/venture/checklist";
import type { ChecklistItem } from "@/lib/venture/checklist";
import { planProgress } from "@/lib/venture/templates";
import type { DimensionScores, RagResult } from "@/lib/venture/scoring";
import type { KpiWithReading } from "@/lib/venture/summary";
import type { DocumentRow, VentureTaskRow } from "@/lib/venture/server";
import {
  type AreaKey,
  type VentureModuleRow,
  AREA_DEFS,
  areasFor,
  lockedLine,
  readTier,
} from "@/lib/venture/types";

/**
 * THE FIVE CARDS — Jay's handwritten note of 19 Aug, built.
 *
 * They EXPAND IN PLACE. No tabs, no sub-pages, no modal: tap a card and it
 * opens underneath, with the venture still on screen above it. That follows
 * the v1 spec's "one scrolling page, sticky deep-linkable sections", and
 * each section keeps an `id="area-<key>"` so a link to
 * `/empire/<slug>#area-checklist` still lands on the right one.
 *
 * A venture only earns the fields it can fill (`areasFor`), so an idea gets
 * ONE card rather than five disabled ones — and the areas it has not earned
 * get one honest line at the bottom instead of a greyed-out promise.
 */
export default function VentureAreaCards({
  venture,
  checklist,
  tasks,
  plan,
  documents,
  kpis,
  score,
  rag,
  today,
  open: initial,
}: {
  venture: VentureModuleRow;
  checklist: ChecklistItem[];
  tasks: VentureTaskRow[];
  plan: Record<string, string>;
  documents: DocumentRow[];
  kpis: KpiWithReading[];
  score: DimensionScores;
  rag: RagResult;
  today: string;
  open?: AreaKey | null;
}) {
  const [open, setOpen] = useState<AreaKey | null>(initial ?? null);
  const tier = readTier(venture.tier);
  const areas = areasFor(tier);
  const locked = lockedLine(tier);

  const face: Record<AreaKey, string> = {
    checklist: checklistLine(checklist, today),
    tasks: tasks.length
      ? `${tasks.filter((t) => t.status !== "done" && t.status !== "dropped").length} open · ${
          tasks.filter((t) => t.promoted_task_id).length
        } in the day plan`
      : "Nothing yet.",
    summary: kpis.some((k) => k.latest)
      ? `${kpis.filter((k) => k.latest).length} of ${kpis.length} measured`
      : "Assembled from what exists.",
    plan: (() => {
      const p = planProgress(plan);
      return `${p.written} of ${p.total} answered`;
    })(),
    documents: documents.length
      ? `${documents.length} recorded · ${
          documents.filter((d) => d.expires_on).length
        } with an expiry`
      : "Nothing recorded.",
  };

  return (
    <div className="flex flex-col gap-2.5">
      {areas.map((area) => {
        const isOpen = open === area.key;
        return (
          <section key={area.key} id={`area-${area.key}`} className="panel min-w-0 scroll-mt-20">
            <button
              className="w-full text-left min-w-0"
              onClick={() => setOpen(isOpen ? null : area.key)}
              aria-expanded={isOpen}
            >
              <div className="flex items-baseline gap-3 min-w-0">
                <h2 className="label">{area.title}</h2>
                <span className="mono text-[0.7rem] ml-auto shrink-0" style={{ color: "var(--faint)" }}>
                  {face[area.key]}
                </span>
                <span className="shrink-0 text-[0.8rem]" style={{ color: "var(--accent)" }}>
                  {isOpen ? "−" : "+"}
                </span>
              </div>
              <p className="text-[0.75rem] text-[var(--muted)] mt-1 leading-snug">
                {area.question}
              </p>
            </button>

            {isOpen && (
              <div className="mt-3.5 pt-3.5 border-t border-[var(--line)]">
                {area.key === "checklist" && (
                  <ChecklistPanel venture={venture} items={checklist} today={today} />
                )}
                {area.key === "tasks" && (
                  <TasksPanel ventureId={venture.id} ventureName={venture.name} tasks={tasks} />
                )}
                {area.key === "summary" && (
                  <SummaryPanel
                    venture={venture}
                    plan={plan}
                    kpis={kpis}
                    checklist={checklist}
                    score={score}
                    rag={rag}
                    today={today}
                  />
                )}
                {area.key === "plan" && <PlanPanel ventureId={venture.id} plan={plan} />}
                {area.key === "documents" && (
                  <DocumentsPanel ventureId={venture.id} documents={documents} today={today} />
                )}
              </div>
            )}
          </section>
        );
      })}

      {locked && <p className="text-[0.75rem] text-[var(--faint)] px-1">{locked}</p>}

      {areas.length < 5 && (
        <p className="text-[0.72rem] text-[var(--faint)] px-1">
          {AREA_DEFS.documents.title} and the rest arrive as this moves up a tier. Nothing is
          hidden from you — there is simply nothing in them yet.
        </p>
      )}
    </div>
  );
}
