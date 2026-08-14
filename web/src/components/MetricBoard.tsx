"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CADENCES,
  CADENCE_LABEL,
  type Cadence,
  type MetricSummary,
  formatChange,
  formatReading,
  metricBand,
  metricsLine,
  parseReading,
  rankMetrics,
  sparkPath,
  sparkPoints,
} from "@/lib/metrics";
import { Bar, Empty, Panel } from "@/components/ui";

/**
 * The metrics board.
 *
 * Two kinds of row, one shape. A RECORDED metric carries an entry box:
 * one number, one tap, and the reading is stored against today. A DERIVED
 * metric carries the same trend and the same sparkline read from wherever
 * its number actually lives, and where the box would be it says why there
 * isn't one and links to the page that owns it.
 *
 * IDEMPOTENT BY CONSTRUCTION. `metric_readings` is unique on
 * `(metric_id, taken_on)`, so recording twice in one day upserts to one
 * row rather than two — the same guarantee `people_contacts` gives the
 * one-tap contact log, and for the same reason: a double tap must never
 * become two facts.
 */
export default function MetricBoard({
  summaries,
  caveats,
  today,
}: {
  summaries: MetricSummary[];
  /** Why a derived series is short or absent, keyed by metric id. */
  caveats: Record<string, string | null>;
  today: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const ranked = rankMetrics(summaries);
  const line = metricsLine(summaries);

  async function record(id: string) {
    const parsed = parseReading(drafts[id] ?? "");
    if (!parsed.ok) {
      setErrors((e) => ({ ...e, [id]: parsed.error }));
      return;
    }
    setErrors((e) => ({ ...e, [id]: "" }));
    setBusy(id);
    const { error } = await supabase
      .from("metric_readings")
      .upsert(
        { metric_id: id, taken_on: today, value: parsed.value },
        { onConflict: "metric_id,taken_on" }
      );
    setBusy(null);
    if (error) {
      setErrors((e) => ({ ...e, [id]: error.message }));
      return;
    }
    setDrafts((d) => ({ ...d, [id]: "" }));
    setSaved(id);
    window.setTimeout(() => setSaved(null), 1600);
    router.refresh();
  }

  /** Cadence and target both live on the metric row, so both write there. */
  async function patch(id: string, patchBody: Record<string, unknown>) {
    setBusy(id);
    const { error } = await supabase.from("metrics").update(patchBody).eq("id", id);
    setBusy(null);
    if (error) {
      setErrors((e) => ({ ...e, [id]: error.message }));
      return;
    }
    router.refresh();
  }

  if (summaries.length === 0) {
    return (
      <Panel title="Metrics">
        <Empty>
          A metric is a number you want to watch move — money in, weight, hours
          billed. Nothing is defined yet, so there is nothing to plot.
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4">
      {/* One line while something is behind, and nothing once it is not.
          A board that congratulates you for being up to date is a board you
          learn to skim, and `setupLine` keeps the same silence. */}
      {line && (
        <p className="text-[0.82rem] text-[var(--muted)]" role="status">
          {line}
        </p>
      )}

      <ul className="grid gap-3 list-none p-0 m-0">
        {ranked.map((s) => {
          const id = s.metric.id;
          const band = metricBand(s);
          const points = sparkPoints(s.readings, 160, 34);
          const path = sparkPath(points);
          const change = formatChange(s.trend.change, s.metric.unit);
          const caveat = caveats[id] ?? null;

          return (
            <li
              key={id}
              // `min-w-0` on the ROW, not on the text inside it: a `truncate`
              // child contributes its whole string to the track's min-content,
              // and capping the text's used size does nothing about that.
              className={`panel min-w-0 grid gap-3 ${band === 4 ? "panel-quiet" : ""}`}
            >
              {/* -- name, latest, trend ------------------------------- */}
              <div className="flex items-start gap-3 flex-wrap min-w-0">
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <h3 className="serif text-[1.02rem] leading-tight m-0">{s.metric.name}</h3>
                  <p className="text-[0.72rem] text-[var(--faint)] mt-1">
                    {s.derived
                      ? `Read from ${s.derived.home}`
                      : s.fresh.never
                        ? "Never recorded"
                        : s.fresh.daysSince === 0
                          ? "Recorded today"
                          : `Last recorded ${s.fresh.daysSince} ${
                              s.fresh.daysSince === 1 ? "day" : "days"
                            } ago`}
                    {!s.derived && ` · ${CADENCE_LABEL[s.cadence]}`}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="mono text-[1.15rem] leading-none m-0">
                    {formatReading(s.latest?.value ?? null, s.metric.unit)}
                  </p>
                  {/* Colour never carries this alone — the word is the fact,
                      and the tint is the decoration. */}
                  {change && (
                    <p
                      className="text-[0.72rem] mt-1.5 m-0"
                      style={{
                        color:
                          s.trend.verdict === "better"
                            ? "var(--good)"
                            : s.trend.verdict === "worse"
                              ? "var(--bad)"
                              : "var(--muted)",
                      }}
                    >
                      {change} · {s.trend.verdict}
                    </p>
                  )}
                  {!change && s.trend.basis === 1 && (
                    <p className="text-[0.72rem] mt-1.5 m-0 text-[var(--faint)]">
                      one reading — no trend yet
                    </p>
                  )}
                </div>
              </div>

              {/* -- the line ------------------------------------------ */}
              {path && (
                <svg
                  viewBox="0 0 160 34"
                  preserveAspectRatio="none"
                  className="w-full h-[34px] block"
                  role="img"
                  aria-label={`${s.metric.name}: ${s.trend.basis} readings, ${
                    change ?? "no change"
                  }`}
                >
                  <polyline
                    points={path}
                    fill="none"
                    stroke="var(--sys)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              )}

              {/* -- the target, when there is one --------------------- */}
              {s.progress != null && (
                <div className="grid gap-1.5">
                  <Bar percent={s.progress * 100} />
                  <p className="text-[0.7rem] text-[var(--faint)] m-0">
                    {Math.round(s.progress * 100)}% of{" "}
                    {formatReading(s.metric.target ?? null, s.metric.unit)}
                    {s.met === true && " · met"}
                  </p>
                </div>
              )}

              {/* -- what the row says about itself -------------------- */}
              {(caveat || s.note) && (
                <p className="text-[0.72rem] text-[var(--faint)] m-0">{caveat ?? s.note}</p>
              )}

              {/* -- the entry box, or the reason there isn't one ------ */}
              {s.derived ? (
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <p className="text-[0.72rem] text-[var(--muted)] m-0 min-w-0 basis-full sm:basis-0 sm:flex-1">
                    {s.derived.why}
                  </p>
                  <Link href={s.derived.href} className="chip shrink-0 no-underline">
                    Open
                  </Link>
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      className="input mono w-[8rem] shrink-0"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      aria-label={`New reading for ${s.metric.name}`}
                      placeholder={s.metric.unit ?? "value"}
                      value={drafts[id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void record(id);
                        }
                      }}
                    />
                    <button
                      className="btn shrink-0"
                      disabled={busy === id}
                      onClick={() => void record(id)}
                    >
                      {s.fresh.daysSince === 0 ? "Replace today" : "Record"}
                    </button>
                    {saved === id && (
                      <span className="text-[0.72rem]" style={{ color: "var(--good)" }}>
                        saved
                      </span>
                    )}
                    <button
                      className="chip ml-auto shrink-0"
                      aria-expanded={open === id}
                      onClick={() => setOpen(open === id ? null : id)}
                    >
                      Settings
                    </button>
                  </div>

                  {errors[id] && (
                    <p className="text-[0.7rem] m-0" style={{ color: "var(--bad)" }}>
                      {errors[id]}
                    </p>
                  )}

                  {open === id && (
                    <div className="grid gap-2.5 pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="label">Ask me</span>
                        {CADENCES.map((c) => (
                          <button
                            key={c}
                            className="chip"
                            data-active={s.cadence === c ? "true" : "false"}
                            aria-pressed={s.cadence === c}
                            onClick={() => void patch(id, { meta: { ...metaOf(s), cadence: c } })}
                          >
                            {CADENCE_LABEL[c as Cadence]}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="label">Target</span>
                        <input
                          className="input mono w-[8rem] shrink-0"
                          type="number"
                          inputMode="decimal"
                          step="any"
                          aria-label={`Target for ${s.metric.name}`}
                          placeholder="none"
                          defaultValue={s.metric.target ?? ""}
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            // An empty box clears the target back to unknown.
                            // Unlike a reading — which is an event and cannot
                            // be blank — a target is a claim, and withdrawing
                            // it has to be as easy as making it.
                            if (raw === "") {
                              if (s.metric.target != null) void patch(id, { target: null });
                              return;
                            }
                            const parsed = parseReading(raw);
                            if (!parsed.ok) {
                              setErrors((er) => ({ ...er, [id]: parsed.error }));
                              return;
                            }
                            if (parsed.value !== s.metric.target) {
                              void patch(id, { target: parsed.value });
                            }
                          }}
                        />
                        <span className="text-[0.7rem] text-[var(--faint)]">
                          {s.metric.direction === "down" ? "aiming down" : "aiming up"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The metric's existing `meta`, so writing a cadence merges rather than
 * replaces. `Money.tsx` wrote `meta: { balance_confirmed_on: … }` once and
 * destroyed every other key on the row; that is the bug this avoids.
 */
function metaOf(s: MetricSummary): Record<string, unknown> {
  const meta = s.metric.meta;
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return {};
  return meta as Record<string, unknown>;
}
