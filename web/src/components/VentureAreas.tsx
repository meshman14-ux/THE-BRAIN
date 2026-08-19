"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type AreaKey,
  type ComplianceFacts,
  type LegalStructure,
  type VentureTier,
  type VentureType,
  AREAS,
  CADENCE_WORD,
  LEGAL_LABEL,
  PLAN_SECTIONS,
  RAG_COLOUR,
  TIER_LABEL,
  TIER_MEANING,
  TIERS,
  areaUnlocked,
  checklistGaps,
  checklistState,
  generateChecklist,
  lockedAreas,
  planProgress,
  ragFor,
  sortChecklist,
  tierFor,
} from "@/lib/venture";
import { formatGBP } from "@/lib/logic";

/**
 * The five areas from Jay's note — Document File, Business Plan, One-Page
 * Summary, Task List, Checklist — as cards on the venture's own page that
 * EXPAND IN PLACE. No tabs, no sub-pages, no modal: click a card and it
 * opens underneath, the venture stays on screen. Each section carries
 * id="area-<key>" so /empire/<slug>#area-checklist deep-links.
 *
 * Gating is the point, not a nicety: an Idea shows one card (Checklist),
 * never five disabled ones. The locked areas get one honest line at the
 * bottom — a greyed-out promise teaches you to stop opening the page.
 */

type Doc = { id: string; title: string; url: string | null; note: string | null; created_at: string };
type PlanRow = { id: string; section: string; body: string | null };
type CheckRow = {
  id: string;
  rule_key: string | null;
  title: string;
  due_on: string | null;
  done_at: string | null;
  guidance_url: string | null;
  note: string | null;
};
type TaskRow = { id: string; title: string; status: string; priority: string; due_date: string | null };

export type VentureAreasProps = {
  ventureId: string;
  ventureName: string;
  stage: string;
  status: string;
  tier: string | null;
  legalStructure: string | null;
  ventureGroup: string | null;
  employsPeople: boolean | null;
  vatRegistered: boolean | null;
  lastTouchedAt: string | null;
  createdAt: string | null;
  oneLiner: string | null;
  budget: number | null;
  monthlyCost: number | null;
  fundingRoute: string | null;
  documents: Doc[];
  planSections: PlanRow[];
  checklist: CheckRow[];
  tasks: TaskRow[];
  /** An existing project of this venture to hang quick-added tasks off. */
  projectId: string | null;
  today: string;
};

const GROUPS: VentureType[] = ["property", "trade", "retail", "digital", "service", "charity", "other"];

function factsOf(p: Pick<VentureAreasProps, "ventureGroup" | "legalStructure" | "employsPeople" | "vatRegistered">): ComplianceFacts {
  const type = (GROUPS as string[]).includes(p.ventureGroup ?? "")
    ? (p.ventureGroup as VentureType)
    : null;
  const legal =
    p.legalStructure != null && p.legalStructure in LEGAL_LABEL
      ? (p.legalStructure as LegalStructure)
      : null;
  return { type, legal, employsPeople: p.employsPeople, vatRegistered: p.vatRegistered };
}

export default function VentureAreas(props: VentureAreasProps) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState<AreaKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const { tier, assumed } = tierFor({
    stage: props.stage as never,
    status: props.status,
    tier: props.tier,
  });
  const check = checklistState(props.checklist, props.today);
  const rag = ragFor({
    tier,
    todayIso: props.today,
    lastTouchedIso: props.lastTouchedAt,
    createdAtIso: props.createdAt,
    nextObligationIso: check.nextDue,
    overdueObligation: check.overdue > 0,
  });
  const plan = planProgress(props.planSections);
  const openTasks = props.tasks.filter((t) => t.status !== "done" && t.status !== "dropped");

  // PromiseLike, not Promise: supabase's query builders are thenables.
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setErr("");
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setErr("That did not save — try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  const setTier = (t: VentureTier) =>
    run(() => supabase.from("ventures").update({ tier: t }).eq("id", props.ventureId));
  const setStructure = (s: LegalStructure) =>
    run(() => supabase.from("ventures").update({ legal_structure: s }).eq("id", props.ventureId));
  const setGroup = (g: string) =>
    run(() => supabase.from("ventures").update({ venture_group: g }).eq("id", props.ventureId));
  const setFact = (col: "employs_people" | "vat_registered", value: boolean) =>
    run(() => supabase.from("ventures").update({ [col]: value }).eq("id", props.ventureId));

  const cardLine: Record<AreaKey, string> = {
    checklist:
      check.overdue > 0
        ? `${check.overdue} OVERDUE · ${check.open} open`
        : check.open + check.done === 0
          ? "nothing generated yet"
          : `${check.open} open · ${check.done} done${check.nextDue ? ` · next due ${check.nextDue}` : ""}`,
    tasks: openTasks.length === 0 ? "no open work" : `${openTasks.length} open`,
    summary: "assembled from what is already recorded",
    plan: plan.filled === 0 ? "nothing written yet" : `${plan.filled} of ${plan.total} sections`,
    documents: props.documents.length === 0 ? "empty file" : `${props.documents.length} filed`,
  };

  return (
    <section className="grid gap-3">
      {/* -- the module header: tier, structure, RAG ------------------- */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <p className="label">Venture module</p>
        <span
          className="mono text-[0.68rem] font-bold uppercase tracking-[0.08em]"
          style={{ color: RAG_COLOUR[rag.rag] }}
          title={rag.why}
        >
          {rag.rag === "none" ? "unjudged" : rag.rag} · {rag.why}
        </span>
        {err && (
          <span className="text-[0.72rem] ml-auto" style={{ color: "var(--bad)" }}>
            {err}
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 grid gap-1.5">
          <p className="label">
            Tier{" "}
            {assumed && (
              <span className="text-[var(--faint)] normal-case tracking-normal">
                — assumed from stage, pick one to make it a decision
              </span>
            )}
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {TIERS.map((t) => (
              <button
                key={t}
                className="chip tap"
                data-active={t === tier && !assumed ? "true" : "false"}
                disabled={busy}
                onClick={() => void setTier(t)}
                title={TIER_MEANING[t]}
              >
                {TIER_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 grid gap-1.5">
          <p className="label">
            Legal structure{" "}
            {props.legalStructure == null && (
              <span className="normal-case tracking-normal" style={{ color: "var(--warn)" }}>
                — not set, so structure-specific obligations are withheld
              </span>
            )}
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(LEGAL_LABEL) as LegalStructure[]).map((s) => (
              <button
                key={s}
                className="chip tap"
                data-active={props.legalStructure === s ? "true" : "false"}
                disabled={busy}
                onClick={() => void setStructure(s)}
              >
                {LEGAL_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap items-baseline">
            <span className="label">Group</span>
            {GROUPS.map((g) => (
              <button
                key={g}
                className="chip tap"
                data-active={props.ventureGroup === g ? "true" : "false"}
                disabled={busy}
                onClick={() => void setGroup(g)}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="flex gap-x-4 gap-y-1.5 flex-wrap items-baseline">
            <span className="flex gap-1.5 items-baseline">
              <span className="label">Employs anyone</span>
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  className="chip tap"
                  data-active={props.employsPeople === v ? "true" : "false"}
                  disabled={busy}
                  onClick={() => void setFact("employs_people", v)}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </span>
            <span className="flex gap-1.5 items-baseline">
              <span className="label">VAT registered</span>
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  className="chip tap"
                  data-active={props.vatRegistered === v ? "true" : "false"}
                  disabled={busy}
                  onClick={() => void setFact("vat_registered", v)}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>

      {/* -- the cards -------------------------------------------------- */}
      {AREAS.filter((a) => areaUnlocked(a.key, tier)).map((a) => {
        const isOpen = open === a.key;
        return (
          <div key={a.key} id={`area-${a.key}`} className="card">
            <button
              className="w-full text-left px-4 py-3 flex items-baseline gap-3 flex-wrap bg-transparent border-0 cursor-pointer"
              onClick={() => setOpen(isOpen ? null : a.key)}
              aria-expanded={isOpen}
            >
              <span className="text-[0.92rem] font-semibold">{a.name}</span>
              <span className="text-[0.74rem] text-[var(--muted)]">{a.question}</span>
              <span
                className="mono text-[0.7rem] ml-auto"
                style={{
                  color:
                    a.key === "checklist" && check.overdue > 0 ? "var(--bad)" : "var(--faint)",
                }}
              >
                {cardLine[a.key]} {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 grid gap-3 border-t border-[var(--border)] pt-3">
                {a.key === "checklist" && (
                  <ChecklistPanel {...props} busy={busy} run={run} supabase={supabase} />
                )}
                {a.key === "tasks" && (
                  <TasksPanel {...props} busy={busy} run={run} supabase={supabase} openTasks={openTasks} />
                )}
                {a.key === "summary" && <SummaryPanel {...props} plan={plan} check={check} openCount={openTasks.length} />}
                {a.key === "plan" && <PlanPanel {...props} busy={busy} run={run} supabase={supabase} />}
                {a.key === "documents" && (
                  <DocumentsPanel {...props} busy={busy} run={run} supabase={supabase} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* -- the locked areas: one honest line -------------------------- */}
      {lockedAreas(tier).length > 0 && (
        <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
          {lockedAreas(tier)
            .map((a) => a.name)
            .join(" · ")}{" "}
          unlock as the venture moves past {TIER_LABEL[tier].toLowerCase()} — a card it cannot
          fill yet would only be an empty promise.
        </p>
      )}
    </section>
  );
}

/* ================================================================== */

type PanelCtx = VentureAreasProps & {
  busy: boolean;
  run: (fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;
  supabase: ReturnType<typeof createClient>;
};

function ChecklistPanel(p: PanelCtx) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const items = sortChecklist(p.checklist);
  const facts = factsOf(p);
  const gaps = checklistGaps(facts);

  async function generate() {
    const rules = generateChecklist({
      facts,
      existingRuleKeys: new Set(p.checklist.map((c) => c.rule_key).filter((k): k is string => k != null)),
    });
    if (rules.length === 0) return;
    await p.run(() =>
      p.supabase.from("venture_checklist_items").insert(
        rules.map((r) => ({
          venture_id: p.ventureId,
          rule_key: r.key,
          title: r.title,
          guidance_url: r.guidanceUrl,
          // Cadence travels in the note so the row needs no extra column.
          note: r.note ? `${CADENCE_WORD[r.cadence]} · ${r.note}` : CADENCE_WORD[r.cadence],
        }))
      )
    );
  }

  async function add() {
    const t = title.trim();
    if (!t) return;
    const ok = await p.run(() =>
      p.supabase.from("venture_checklist_items").insert({
        venture_id: p.ventureId,
        title: t,
        due_on: due || null,
      })
    );
    if (ok) {
      setTitle("");
      setDue("");
    }
  }

  const tick = (item: CheckRow) =>
    p.run(() =>
      p.supabase
        .from("venture_checklist_items")
        .update({ done_at: item.done_at ? null : new Date().toISOString() })
        .eq("id", item.id)
    );

  return (
    <>
      <p
        className="text-[0.72rem] leading-relaxed rounded-[9px] px-3 py-2 border border-dashed border-[var(--border)]"
        style={{ color: "var(--warn)" }}
      >
        Generated items are prompts with a GOV.UK link each, not advice — thresholds and
        deadlines move at every Budget. Confirm anything with a penalty attached against the
        linked guidance before relying on it.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button className="btn" disabled={p.busy} onClick={() => void generate()}>
          Generate from the rules
        </button>
        {gaps.length > 0 && (
          <span className="text-[0.72rem] text-[var(--muted)] self-center">
            The generator does not yet know: {gaps.join(" · ")}. Answer above and the list
            grows — nothing is ever guessed.
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[0.78rem] text-[var(--faint)]">
          Nothing yet. Generate from the rules, or add the first obligation by hand.
        </p>
      ) : (
        <ul className="grid gap-1.5 list-none p-0 m-0">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
            >
              <button
                className="tap shrink-0 mt-[2px] w-[18px] h-[18px] rounded-[5px] border cursor-pointer"
                style={{
                  borderColor: i.done_at ? "var(--good)" : "var(--border-bright, var(--border))",
                  background: i.done_at ? "var(--good)" : "transparent",
                }}
                aria-pressed={i.done_at != null}
                disabled={p.busy}
                onClick={() => void tick(i)}
                title={i.done_at ? "Mark not done" : "Mark done"}
              />
              <span className="min-w-0 flex-1 grid gap-0.5">
                <span
                  className="text-[0.84rem] leading-snug"
                  style={{
                    color: i.done_at ? "var(--faint)" : "var(--text)",
                    textDecoration: i.done_at ? "line-through" : "none",
                  }}
                >
                  {i.title}
                  {i.guidance_url && (
                    <>
                      {" "}
                      <a
                        href={i.guidance_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono text-[0.68rem] no-underline"
                        style={{ color: "var(--accent)" }}
                      >
                        guidance ↗
                      </a>
                    </>
                  )}
                </span>
                {i.note && !i.done_at && (
                  <span className="text-[0.7rem] text-[var(--muted)] leading-snug">{i.note}</span>
                )}
              </span>
              {i.due_on && !i.done_at && (
                <span
                  className="mono text-[0.68rem] shrink-0"
                  style={{ color: i.due_on < p.today ? "var(--bad)" : "var(--faint)" }}
                >
                  {i.due_on < p.today ? "overdue " : "due "}
                  {i.due_on}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 flex-wrap">
        <input
          className="input flex-1 min-w-[160px]"
          placeholder="Add an obligation by hand"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="input w-[150px]"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date"
        />
        <button className="btn" disabled={p.busy || title.trim() === ""} onClick={() => void add()}>
          Add
        </button>
      </div>
      <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
        Vehicle tax, MOT and insurance are deliberately not listed here — the{" "}
        <Link href="/life/money/vehicles" className="no-underline" style={{ color: "var(--accent)" }}>
          vehicles page
        </Link>{" "}
        owns those dates and the watchtower already fires on them.
      </p>
    </>
  );
}

function TasksPanel(p: PanelCtx & { openTasks: TaskRow[] }) {
  const [title, setTitle] = useState("");

  async function add() {
    const t = title.trim();
    if (!t) return;
    let projectId = p.projectId;
    if (projectId == null) {
      // The venture has no project yet, and tasks reach a venture through
      // one — that is the existing model, kept rather than a second path.
      const { data, error } = await p.supabase
        .from("projects")
        .insert({ title: p.ventureName, venture_id: p.ventureId, status: "active" })
        .select("id")
        .single();
      if (error || !data) return;
      projectId = data.id as string;
    }
    const ok = await p.run(() =>
      p.supabase.from("tasks").insert({ title: t, project_id: projectId, priority: "Med", status: "open" })
    );
    if (ok) setTitle("");
  }

  const done = (t: TaskRow) =>
    p.run(() => p.supabase.from("tasks").update({ status: "done" }).eq("id", t.id));

  return (
    <>
      {p.openTasks.length === 0 ? (
        <p className="text-[0.78rem] text-[var(--faint)]">
          No open work hangs off this venture. The box below is the whole floor.
        </p>
      ) : (
        <ul className="grid gap-1.5 list-none p-0 m-0">
          {p.openTasks.map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
            >
              <span className="text-[0.84rem] leading-snug min-w-0 flex-1">{t.title}</span>
              <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">{t.priority}</span>
              <button
                className="chip tap shrink-0"
                disabled={p.busy}
                onClick={() => void done(t)}
              >
                Done
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Name the next move"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn" disabled={p.busy || title.trim() === ""} onClick={() => void add()}>
          Add
        </button>
      </div>
      <p className="text-[0.7rem] text-[var(--faint)]">
        Tasks land in the shared pool — the{" "}
        <Link href="/planner" className="no-underline" style={{ color: "var(--accent)" }}>
          Planner
        </Link>{" "}
        and{" "}
        <Link href="/day" className="no-underline" style={{ color: "var(--accent)" }}>
          Today
        </Link>{" "}
        see them like any other work.
      </p>
    </>
  );
}

function SummaryPanel(
  p: VentureAreasProps & {
    plan: { filled: number; total: number };
    check: { open: number; done: number; overdue: number };
    openCount: number;
  }
) {
  // Assembled, never stored: every line is read from a field that already
  // has one home, so the summary can never disagree with the page above it.
  const rows: [string, string][] = [
    ["What it is", p.oneLiner ?? "no one-liner recorded"],
    ["Stage", p.stage],
    ["Cost to start", formatGBP(p.budget)],
    ["Running cost / month", formatGBP(p.monthlyCost)],
    ["Funded by", p.fundingRoute ?? "not answered"],
    ["Plan", `${p.plan.filled} of ${p.plan.total} sections written`],
    ["Open work", p.openCount === 0 ? "none" : `${p.openCount} task(s)`],
    [
      "Obligations",
      p.check.overdue > 0
        ? `${p.check.overdue} OVERDUE`
        : `${p.check.open} open · ${p.check.done} done`,
    ],
    ["Documents", `${p.documents.length} filed`],
  ];
  return (
    <div className="grid gap-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-3">
          <span className="label w-[170px] shrink-0">{k}</span>
          <span className="text-[0.84rem] min-w-0">{v}</span>
        </div>
      ))}
      <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed mt-1">
        Assembled live from the venture&apos;s own records — nothing here is typed twice, so it
        cannot drift from the page above it.
      </p>
    </div>
  );
}

function PlanPanel(p: PanelCtx) {
  const bySection = new Map(p.planSections.map((r) => [r.section, r.body ?? ""]));

  const save = (section: string, body: string) =>
    p.run(() =>
      p.supabase
        .from("venture_plan_sections")
        .upsert(
          { venture_id: p.ventureId, section, body: body.trim() === "" ? null : body, updated_at: new Date().toISOString() },
          { onConflict: "venture_id,section" }
        )
    );

  return (
    <div className="grid gap-3">
      {PLAN_SECTIONS.map((s) => (
        <div key={s.key} className="grid gap-1">
          <p className="label">{s.name}</p>
          <textarea
            className="input"
            rows={2}
            placeholder={s.prompt}
            defaultValue={bySection.get(s.key) ?? ""}
            onBlur={(e) => {
              const next = e.target.value;
              if (next !== (bySection.get(s.key) ?? "")) void save(s.key, next);
            }}
          />
        </div>
      ))}
      <p className="text-[0.7rem] text-[var(--faint)]">
        Saves on blur, section by section — half a plan is still a plan.
      </p>
    </div>
  );
}

function DocumentsPanel(p: PanelCtx) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  async function add() {
    const t = title.trim();
    if (!t) return;
    const ok = await p.run(() =>
      p.supabase.from("venture_documents").insert({
        venture_id: p.ventureId,
        title: t,
        url: url.trim() || null,
      })
    );
    if (ok) {
      setTitle("");
      setUrl("");
    }
  }

  return (
    <>
      {p.documents.length === 0 ? (
        <p className="text-[0.78rem] text-[var(--faint)]">
          Empty file. Photographed paperwork goes through{" "}
          <Link href="/capture" className="no-underline" style={{ color: "var(--accent)" }}>
            Capture
          </Link>{" "}
          as always — this file is for naming where a venture&apos;s documents live.
        </p>
      ) : (
        <ul className="grid gap-1.5 list-none p-0 m-0">
          {p.documents.map((d) => (
            <li
              key={d.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
            >
              <span className="text-[0.84rem] leading-snug min-w-0 flex-1">
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-underline"
                    style={{ color: "var(--accent)" }}
                  >
                    {d.title} ↗
                  </a>
                ) : (
                  d.title
                )}
                {d.note && <span className="text-[var(--muted)]"> — {d.note}</span>}
              </span>
              <span className="mono text-[0.66rem] text-[var(--faint)] shrink-0">
                {d.created_at.slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 flex-wrap">
        <input
          className="input flex-1 min-w-[140px]"
          placeholder="Document name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="input flex-1 min-w-[140px]"
          placeholder="Link (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn" disabled={p.busy || title.trim() === ""} onClick={() => void add()}>
          File it
        </button>
      </div>
    </>
  );
}
