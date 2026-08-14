"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Opportunity } from "@/lib/types";
import { formatGBP } from "@/lib/logic";
import {
  STAGES,
  type Stage,
  STAGE_LABEL,
  pipelineLine,
  pipelineTotals,
  rankDeals,
  stageLabel,
  toDeal,
  winRate,
} from "@/lib/pipeline";
import InlineValue from "@/components/InlineValue";
import { Empty, Panel } from "@/components/ui";

/**
 * The deal board.
 *
 * `opportunities` has had a nav item and a phone slot in EMPIRE mode
 * since the mode switch was built, pointing at a placeholder saying this
 * page would exist. It exists.
 *
 * THE QUESTION IT ANSWERS IS "WHOSE MOVE IS IT", which is why it sorts
 * worst-first — most overdue a decision — where the holdings board sorts
 * largest-first. A deal with a value and a stage and no next step is one
 * nobody has agreed to do anything about, and that is the state this
 * board exists to make visible.
 *
 * The stage is one tap. The value, the next step and its date all edit in
 * place. Nothing is required beyond a title.
 */
export default function DealBoard({
  opportunities,
  people,
  today,
}: {
  opportunities: Opportunity[];
  people: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [personId, setPersonId] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const deals = rankDeals(opportunities.map((o) => toDeal(o, today)));
  const totals = pipelineTotals(deals);
  const line = pipelineLine(deals);
  const rate = winRate(deals);

  const open = deals.filter((d) => d.open);
  const closed = deals.filter((d) => !d.open);
  const shown = showClosed ? deals : open;

  async function add() {
    const trimmed = title.trim();
    if (trimmed === "") {
      setError("It needs a title.");
      return;
    }
    setError("");
    setBusy("new");
    const { error: err } = await supabase.from("opportunities").insert({
      title: trimmed,
      person_id: personId === "" ? null : personId,
    });
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    setTitle("");
    setPersonId("");
    router.refresh();
  }

  async function setStage(id: string, stage: Stage) {
    setBusy(id);
    const { error: err } = await supabase.from("opportunities").update({ stage }).eq("id", id);
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  const personName = (id: string | null) =>
    id == null ? null : (people.find((p) => p.id === id)?.name ?? null);

  return (
    <div className="grid gap-4">
      <Panel
        title="On the table"
        hint={totals.complete ? "every deal estimated" : "a floor, not a figure"}
      >
        <div className="flex gap-6 flex-wrap">
          <div className="min-w-0">
            <p className="label m-0">Open</p>
            <p className="mono text-[1.25rem] leading-none mt-1.5 m-0">
              {formatGBP(totals.openValue)}
            </p>
            <p className="text-[0.68rem] text-[var(--faint)] mt-1 m-0">
              {totals.openCount} deal{totals.openCount === 1 ? "" : "s"}
              {totals.unestimated > 0 && ` · ${totals.unestimated} unestimated`}
            </p>
          </div>
          <div className="min-w-0">
            <p className="label m-0">Won</p>
            <p className="mono text-[1.25rem] leading-none mt-1.5 m-0">
              {formatGBP(totals.wonValue)}
            </p>
            <p className="text-[0.68rem] text-[var(--faint)] mt-1 m-0">
              {totals.wonCount} closed
            </p>
          </div>
          <div className="min-w-0">
            <p className="label m-0">Win rate</p>
            {/* Silent below five closed deals: one win in two is "50%" and
                means nothing, and a number that means nothing invites a
                decision. `obstacleTally` keeps the same discipline. */}
            <p className="mono text-[1.25rem] leading-none mt-1.5 m-0">
              {rate.pct == null ? "—" : `${rate.pct}%`}
            </p>
            <p className="text-[0.68rem] text-[var(--faint)] mt-1 m-0">
              {rate.pct == null
                ? `needs ${5 - rate.closed} more closed`
                : `across ${rate.closed}`}
            </p>
          </div>
        </div>
        {line && <p className="text-[0.78rem] text-[var(--muted)] mt-1 m-0">{line}</p>}
      </Panel>

      {closed.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            className="chip"
            data-active={showClosed ? "true" : "false"}
            aria-pressed={showClosed}
            onClick={() => setShowClosed(!showClosed)}
          >
            {showClosed ? "Hide" : "Show"} closed · {closed.length}
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <Panel title="Deals">
          <Empty>
            What is on the table: the job, what it would be worth, and — the part
            that matters — what happens next and when. A deal with no next step is
            how one goes quiet.
          </Empty>
        </Panel>
      ) : (
        <ul className="grid gap-3 list-none p-0 m-0">
          {shown.map((d) => {
            const o = d.opportunity;
            return (
              <li
                key={o.id}
                className={`panel min-w-0 grid gap-2.5 ${d.open ? "" : "panel-quiet"}`}
              >
                <div className="flex items-start gap-3 flex-wrap min-w-0">
                  <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    <h3 className="serif text-[1.02rem] leading-tight m-0">{o.title}</h3>
                    <p className="text-[0.72rem] text-[var(--faint)] mt-1 m-0">
                      {stageLabel(o.stage)}
                      {personName(o.person_id) && ` · ${personName(o.person_id)}`}
                      {o.kind && ` · ${o.kind}`}
                    </p>
                  </div>
                  {/* The state is always spelled out, never colour alone —
                      every badge in this system says what it is. */}
                  {d.attention !== "clear" && (
                    <span
                      className="chip shrink-0"
                      style={{
                        color: d.attention === "overdue" ? "var(--bad)" : "var(--warn)",
                        borderColor: d.attention === "overdue" ? "var(--bad)" : "var(--warn)",
                      }}
                    >
                      {d.attention === "overdue"
                        ? `${-(d.daysToStep ?? 0)} days late`
                        : d.attention === "today"
                          ? "due today"
                          : "no next step"}
                    </span>
                  )}
                </div>

                <div className="flex gap-x-6 gap-y-2 flex-wrap text-[0.82rem]">
                  <Field label="Worth">
                    <InlineValue field="opportunities.value_est" id={o.id} value={o.value_est} />
                  </Field>
                  <Field label="Next">
                    <InlineValue field="opportunities.next_step" id={o.id} value={o.next_step} />
                  </Field>
                  <Field label="By">
                    <InlineValue
                      field="opportunities.next_step_date"
                      id={o.id}
                      value={o.next_step_date}
                    />
                  </Field>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {STAGES.map((s) => (
                    <button
                      key={s}
                      className="chip"
                      data-active={o.stage === s ? "true" : "false"}
                      aria-pressed={o.stage === s}
                      disabled={busy === o.id}
                      onClick={() => void setStage(o.id, s)}
                    >
                      {STAGE_LABEL[s]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Panel title="New deal" hint="a title is the floor">
        <div className="grid gap-2.5">
          <input
            className="input"
            placeholder="What is on the table?"
            aria-label="Deal title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          {people.length > 0 && (
            <select
              className="input w-auto"
              aria-label="Who"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">Nobody yet</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn" disabled={busy === "new"} onClick={() => void add()}>
              Add
            </button>
            {error && (
              <span className="text-[0.72rem]" style={{ color: "var(--bad)" }}>
                {error}
              </span>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <span className="label">{label}</span>
      {children}
    </span>
  );
}
