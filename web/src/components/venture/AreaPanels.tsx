"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type ChecklistItem,
  checklistProgress,
  sortChecklist,
} from "@/lib/venture/checklist";
import {
  CADENCE_WORD,
  type Cadence,
  checklistGaps,
  generateChecklist,
  kpiTemplatesFor,
  PLAN_SECTIONS,
  planProgress,
} from "@/lib/venture/templates";
import { onePageSummary, summaryText, type KpiWithReading } from "@/lib/venture/summary";
import { ventureScore } from "@/lib/venture/scoring";
import type { RagResult } from "@/lib/venture/scoring";
import type { DimensionScores } from "@/lib/venture/scoring";
import {
  type VentureModuleRow,
  readLegal,
  readType,
} from "@/lib/venture/types";
import type { DocumentRow, VentureTaskRow } from "@/lib/venture/server";

/**
 * The body of each of the five areas. Every write goes straight to Supabase
 * from the browser under RLS — the house pattern (§A7): server components
 * fetch, client components mutate, and `router.refresh()` afterwards.
 *
 * None of these panels asks for anything it does not need. A row can be
 * created from a title alone, everywhere, and a skipped field writes NULL
 * rather than a zero or an empty string.
 */

function useWriter() {
  const router = useRouter();
  const supabase = createClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true);
    setNote("");
    const { error } = await fn();
    setBusy(false);
    // A failure that does not say what failed is indistinguishable from
    // nothing happening — the lesson of 17 Aug, four times over.
    if (error) setNote(`${label} failed — ${error.message}`);
    else router.refresh();
  }

  return { supabase, run, note, busy };
}

function Note({ children }: { children: string }) {
  if (!children) return null;
  return <p className="text-[0.75rem]" style={{ color: "var(--bad)" }}>{children}</p>;
}

/* ── 1 · Checklist ────────────────────────────────────────────────── */

export function ChecklistPanel({
  venture,
  items,
  today,
}: {
  venture: VentureModuleRow;
  items: ChecklistItem[];
  today: string;
}) {
  const { supabase, run, note, busy } = useWriter();
  const facts = {
    type: readType(venture.venture_type),
    legal: readLegal(venture.legal_structure),
    employsPeople: venture.employs_people,
    vatRegistered: venture.vat_registered,
  };
  const gaps = checklistGaps(facts);
  const drafts = generateChecklist(facts);
  const progress = checklistProgress(items);
  const sorted = sortChecklist(items, today);

  async function generate() {
    // Upsert on (venture_id, rule_key): regenerating never duplicates a
    // rule and never un-ticks one already done, because `done` is not in
    // the payload at all.
    await run("Generating", async () =>
      supabase.from("venture_checklist_items").upsert(
        drafts.map((d) => ({
          venture_id: venture.id,
          rule_key: d.rule_key,
          title: d.title,
          category: d.category,
          obligation: d.obligation,
          cadence: d.cadence,
          note: d.note,
          guidance_url: d.guidance_url,
          source: "generated",
        })),
        { onConflict: "venture_id,rule_key", ignoreDuplicates: true }
      )
    );
  }

  async function tick(item: ChecklistItem) {
    await run("Saving", async () =>
      supabase
        .from("venture_checklist_items")
        .update({ done: !item.done, done_on: item.done ? null : today })
        .eq("id", item.id)
    );
  }

  async function setDue(item: ChecklistItem, raw: string) {
    const value = raw.trim() === "" ? null : raw;
    if (value === item.due_date) return;
    await run("Saving", async () =>
      supabase.from("venture_checklist_items").update({ due_date: value }).eq("id", item.id)
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {gaps.length > 0 && (
        <p className="text-[0.78rem] text-[var(--muted)]">
          Generated from what is known. Still unanswered: {gaps.join(", ")} — until those are
          set the list may name the wrong statutes, which is worse than no list.
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn tap" onClick={generate} disabled={busy}>
          {items.length ? "Regenerate" : "Generate the checklist"}
        </button>
        <span className="text-[0.75rem] text-[var(--faint)]">
          {drafts.length} rules apply · {progress.done} of {progress.total} done
          {progress.undated > 0 && ` · ${progress.undated} with no date`}
        </span>
      </div>
      <Note>{note}</Note>

      {sorted.length === 0 ? (
        <p className="text-[0.82rem] text-[var(--muted)]">
          Nothing generated yet. The list is deterministic — the same answers always produce the
          same rules — so generating it costs nothing and can be re-run whenever a fact changes.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sorted.map((i) => {
            const overdue = !i.done && i.due_date && i.due_date < today;
            return (
              <li
                key={i.id}
                className="min-w-0 flex items-start gap-2.5 py-1.5 border-b border-[var(--line)] last:border-0"
              >
                <button
                  className="chip tap shrink-0 mt-0.5"
                  onClick={() => tick(i)}
                  aria-pressed={i.done}
                  title={i.done ? "Mark not done" : "Mark done"}
                >
                  {i.done ? "✓" : "○"}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[0.85rem] leading-snug"
                    style={{
                      color: i.done ? "var(--muted)" : "var(--text)",
                      textDecoration: i.done ? "line-through" : "none",
                    }}
                  >
                    {i.title}
                    {i.obligation && !i.done && (
                      <span className="mono text-[0.65rem] ml-2" style={{ color: "var(--faint)" }}>
                        REQUIRED
                      </span>
                    )}
                  </p>
                  {i.note && (
                    <p className="text-[0.72rem] text-[var(--faint)] leading-snug mt-0.5">
                      {i.note}
                      {i.guidance_url && (
                        <>
                          {" "}
                          <a
                            href={i.guidance_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--accent)" }}
                          >
                            source
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {i.cadence && (
                    <span className="mono text-[0.62rem] text-[var(--faint)] hidden sm:inline">
                      {CADENCE_WORD[i.cadence as Cadence] ?? i.cadence}
                    </span>
                  )}
                  <input
                    type="date"
                    className="input tap text-[0.72rem] w-[8.5rem]"
                    defaultValue={i.due_date ?? ""}
                    onBlur={(e) => setDue(i, e.target.value)}
                    style={overdue ? { color: "var(--bad)" } : undefined}
                    aria-label={`Due date for ${i.title}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── 2 · Task list ────────────────────────────────────────────────── */

export function TasksPanel({
  ventureId,
  ventureName,
  tasks,
}: {
  ventureId: string;
  ventureName: string;
  tasks: VentureTaskRow[];
}) {
  const { supabase, run, note, busy } = useWriter();
  const [title, setTitle] = useState("");

  async function add() {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    await run("Adding", async () =>
      supabase.from("venture_tasks").insert({ venture_id: ventureId, title: t })
    );
  }

  async function cycle(task: VentureTaskRow) {
    const next = task.status === "open" ? "doing" : task.status === "doing" ? "done" : "open";
    await run("Saving", async () =>
      supabase.from("venture_tasks").update({ status: next }).eq("id", task.id)
    );
  }

  /**
   * THE ONE DOOR into the day plan. A venture task is a thought about a
   * venture; a task is a thing in Jay's week. Promoting creates the real
   * row with NO do_date — the pool, not today — because deciding which day
   * it lands on is what `/day` is for, and a system that schedules on your
   * behalf is one you stop trusting with the calendar.
   */
  async function promote(task: VentureTaskRow) {
    await run("Promoting", async () => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: task.title,
          notes: task.notes ?? `From ${ventureName}.`,
          priority: task.priority,
        })
        .select("id")
        .single();
      if (error) return { error };
      return supabase
        .from("venture_tasks")
        .update({ promoted_task_id: data.id, promoted_at: new Date().toISOString() })
        .eq("id", task.id);
    });
  }

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "dropped");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          className="input tap flex-1 min-w-0"
          placeholder="What is the next move?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn tap shrink-0" onClick={add} disabled={busy || !title.trim()}>
          Add
        </button>
      </div>
      <Note>{note}</Note>

      {open.length === 0 && done.length === 0 ? (
        <p className="text-[0.82rem] text-[var(--muted)]">
          Nothing yet. A title is the whole floor — everything else is optional.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {[...open, ...done].map((t) => (
            <li
              key={t.id}
              className="min-w-0 flex items-center gap-2.5 py-1.5 border-b border-[var(--line)] last:border-0"
            >
              <button className="chip tap shrink-0" onClick={() => cycle(t)}>
                {t.status === "done" ? "✓" : t.status === "doing" ? "▶" : "○"}
              </button>
              <span
                className="min-w-0 flex-1 truncate text-[0.85rem]"
                style={{
                  color: t.status === "done" ? "var(--muted)" : "var(--text)",
                  textDecoration: t.status === "done" ? "line-through" : "none",
                }}
              >
                {t.title}
              </span>
              {t.promoted_task_id ? (
                <span className="mono text-[0.62rem] shrink-0" style={{ color: "var(--faint)" }}>
                  IN THE DAY PLAN
                </span>
              ) : (
                <button className="chip tap shrink-0" onClick={() => promote(t)} disabled={busy}>
                  Send to tasks
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 3 · One-page summary (and the KPIs it reads) ─────────────────── */

export function SummaryPanel({
  venture,
  plan,
  kpis,
  checklist,
  score,
  rag,
  today,
}: {
  venture: VentureModuleRow;
  plan: Record<string, string>;
  kpis: KpiWithReading[];
  checklist: ChecklistItem[];
  score: DimensionScores;
  rag: RagResult;
  today: string;
}) {
  const { supabase, run, note, busy } = useWriter();
  const [copied, setCopied] = useState(false);
  const scored = ventureScore(score);
  const summary = onePageSummary({
    venture,
    plan,
    kpis,
    checklist,
    score: { score: scored.score, basis: scored.basis },
    rag,
    today,
  });
  const templates = kpiTemplatesFor(readType(venture.venture_type));

  async function seedKpis() {
    await run("Seeding", async () =>
      supabase.from("venture_kpis").insert(
        templates.map((t, i) => ({
          venture_id: venture.id,
          name: t.name,
          unit: t.unit,
          direction: t.direction,
          cadence: t.cadence,
          sort_order: i,
        }))
      )
    );
  }

  async function log(kpiId: string, raw: string) {
    const trimmed = raw.trim();
    // A reading is an EVENT, so a blank box is nothing to record rather
    // than a null to write — deleting a reading is what means "unknown".
    if (trimmed === "") return;
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return;
    await run("Logging", async () =>
      supabase
        .from("venture_kpi_readings")
        .upsert(
          { venture_id: venture.id, kpi_id: kpiId, taken_on: today, value },
          { onConflict: "kpi_id,taken_on" }
        )
    );
  }

  async function copy() {
    await navigator.clipboard.writeText(summaryText(summary, venture.name));
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className="serif text-[1.05rem] leading-snug">{summary.headline}</p>

      {summary.paragraphs.map((p) => (
        <div key={p.title}>
          <p className="label">{p.title}</p>
          <p className="text-[0.85rem] leading-relaxed mt-1">{p.body}</p>
        </div>
      ))}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {summary.facts.map((f) => (
          <div key={f.label} className="min-w-0 flex items-baseline gap-2">
            <dt className="label shrink-0">{f.label}</dt>
            <dd className="mono text-[0.78rem] truncate">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <p className="label">This week&rsquo;s numbers</p>
        {kpis.length === 0 ? (
          templates.length ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button className="btn tap" onClick={seedKpis} disabled={busy}>
                Start with {templates.length} for a {venture.venture_type} venture
              </button>
              <span className="text-[0.72rem] text-[var(--faint)]">
                Five is the cap, and the database enforces it.
              </span>
            </div>
          ) : (
            <p className="text-[0.8rem] text-[var(--muted)]">
              Set what kind of venture this is and five starting measures become one tap.
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-1.5">
            {kpis.map((k) => (
              <li key={k.id} className="min-w-0 flex items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-[0.82rem]">{k.name}</span>
                <span className="mono text-[0.72rem] shrink-0" style={{ color: "var(--faint)" }}>
                  {k.latest ? `${k.latest.value} · ${k.latest.taken_on}` : "no reading"}
                </span>
                <input
                  className="input tap w-[5.5rem] shrink-0 text-[0.78rem]"
                  inputMode="decimal"
                  placeholder={k.unit ?? "value"}
                  onBlur={(e) => log(k.id, e.target.value)}
                  aria-label={`Log ${k.name}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {summary.missing.length > 0 && (
        <p className="text-[0.75rem] text-[var(--faint)]">
          Not recorded: {summary.missing.join(", ")}.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="btn tap" onClick={copy}>
          {copied ? "Copied" : "Copy as text"}
        </button>
        <span className="text-[0.72rem] text-[var(--faint)]">
          Assembled from rows that already exist. Nothing here is written by a model.
        </span>
      </div>
      <Note>{note}</Note>
    </div>
  );
}

/* ── 4 · Business plan ────────────────────────────────────────────── */

export function PlanPanel({
  ventureId,
  plan,
}: {
  ventureId: string;
  plan: Record<string, string>;
}) {
  const { supabase, run, note } = useWriter();
  const progress = planProgress(plan);

  async function save(key: string, raw: string) {
    const body = raw.trim();
    if (body === (plan[key] ?? "").trim()) return;
    await run("Saving", async () =>
      supabase.from("venture_plan_sections").upsert(
        {
          venture_id: ventureId,
          section_key: key,
          body: body === "" ? null : body,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "venture_id,section_key" }
      )
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.75rem] text-[var(--faint)]">
        {progress.written} of {progress.total} answered. Each one saves on its own, so half a
        plan is a plan rather than a form you abandoned.
      </p>
      <Note>{note}</Note>
      {PLAN_SECTIONS.map((s) => (
        <div key={s.key} className="min-w-0">
          <p className="label">{s.title}</p>
          <p className="text-[0.72rem] text-[var(--faint)] mb-1">{s.prompt}</p>
          <textarea
            className="input w-full text-[0.85rem] leading-relaxed"
            rows={2}
            defaultValue={plan[s.key] ?? ""}
            onBlur={(e) => save(s.key, e.target.value)}
            aria-label={s.title}
          />
        </div>
      ))}
    </div>
  );
}

/* ── 5 · Document file ────────────────────────────────────────────── */

export function DocumentsPanel({
  ventureId,
  documents,
  today,
}: {
  ventureId: string;
  documents: DocumentRow[];
  today: string;
}) {
  const { supabase, run, note, busy } = useWriter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  async function add() {
    const t = title.trim();
    if (!t) return;
    const link = url.trim();
    setTitle("");
    setUrl("");
    await run("Adding", async () =>
      supabase
        .from("venture_documents")
        .insert({ venture_id: ventureId, title: t, external_url: link === "" ? null : link })
    );
  }

  async function setExpiry(doc: DocumentRow, raw: string) {
    const value = raw.trim() === "" ? null : raw;
    if (value === doc.expires_on) return;
    await run("Saving", async () =>
      supabase.from("venture_documents").update({ expires_on: value }).eq("id", doc.id)
    );
  }

  const sorted = [...documents].sort((a, b) =>
    (a.expires_on ?? "9999-12-31").localeCompare(b.expires_on ?? "9999-12-31")
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="input tap flex-1 min-w-0"
          placeholder="What is it? (insurance schedule, EICR, lease…)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="input tap flex-1 min-w-0"
          placeholder="Where is it? (optional link)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn tap shrink-0" onClick={add} disabled={busy || !title.trim()}>
          Record
        </button>
      </div>
      <Note>{note}</Note>
      <p className="text-[0.72rem] text-[var(--faint)]">
        Photographing a document goes through Feed the System, which files it and proposes what
        it says. This is the index of what exists and what runs out.
      </p>

      {sorted.length === 0 ? (
        <p className="text-[0.82rem] text-[var(--muted)]">
          Nothing recorded. A title alone is enough — the link and the expiry can follow.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sorted.map((d) => {
            const expired = d.expires_on && d.expires_on < today;
            return (
              <li
                key={d.id}
                className="min-w-0 flex items-center gap-2.5 py-1.5 border-b border-[var(--line)] last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-[0.85rem]">
                  {d.external_url || d.drive_url ? (
                    <a
                      href={(d.external_url ?? d.drive_url) as string}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent)" }}
                    >
                      {d.title}
                    </a>
                  ) : (
                    d.title
                  )}
                </span>
                <input
                  type="date"
                  className="input tap text-[0.72rem] w-[8.5rem] shrink-0"
                  defaultValue={d.expires_on ?? ""}
                  onBlur={(e) => setExpiry(d, e.target.value)}
                  aria-label={`Expiry for ${d.title}`}
                  style={expired ? { color: "var(--bad)" } : undefined}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
