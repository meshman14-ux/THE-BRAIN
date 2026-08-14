"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type ImportPlan,
  importPlan,
  planSummary,
  toUpsertRows,
} from "@/lib/samsung";

/**
 * The Samsung Health import — the ingest path, stage one.
 *
 * Samsung Health has no consumer cloud API, so the honest route today is
 * its own export: Settings → Download personal data → a folder of CSVs.
 * Jay picks the files, the parser turns them into a PLAN, the plan is
 * shown, and nothing is written until he says so. Never auto-commit —
 * the same rule the advisor and the diagnostic hold.
 *
 * The write is an upsert per day carrying ONLY the fields the export
 * held, so a hand-typed figure survives an import that did not bring
 * that field. Stage two — zero taps, via a Health Connect companion on
 * the phone — is recorded in CLAUDE.md; this screen is what exists.
 */
export default function ImportHealth() {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [written, setWritten] = useState<number | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setNote("");
    setWritten(null);
    const loaded = await Promise.all(
      Array.from(files).map(async (f) => ({ name: f.name, text: await f.text() }))
    );
    setPlan(importPlan(loaded));
    setBusy(false);
  }

  async function write() {
    if (!plan) return;
    const rows = toUpsertRows(plan);
    if (rows.length === 0) return;
    setBusy(true);
    setNote("");
    // Chunked so a two-year export does not ship as one giant request.
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from("health_days")
        .upsert(rows.slice(i, i + 200), { onConflict: "user_id,on_date" });
      if (error) {
        setBusy(false);
        setNote(`Stopped at day ${i + 1} of ${rows.length}: ${error.message}`);
        return;
      }
    }
    setBusy(false);
    setWritten(rows.length);
    setPlan(null);
    router.refresh();
  }

  const dayCount = plan ? Object.keys(plan.days).length : 0;
  const range = plan && dayCount > 0 ? Object.keys(plan.days).sort() : null;

  return (
    <div className="grid gap-3">
      <p className="text-[0.78rem] text-[var(--muted)] leading-relaxed">
        In Samsung Health: <span className="font-semibold">Settings →
        Download personal data</span>, unzip it, and pick the CSV files here
        (steps, sleep, weight and food all work — any selection is fine).
        Nothing is written until you confirm.
      </p>

      <label className="chip self-start cursor-pointer">
        {busy && !plan ? "Reading…" : "Choose export files"}
        <input
          type="file"
          multiple
          accept=".csv,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => void pick(e.target.files)}
        />
      </label>

      {written != null && (
        <p className="text-[0.78rem]" style={{ color: "var(--good)" }}>
          {written} day{written === 1 ? "" : "s"} written. The page above is
          already reading them.
        </p>
      )}

      {note && <p className="text-[0.78rem] text-[var(--bad)]">⚠ {note}</p>}

      {plan && (
        <div className="rounded-[10px] border border-[var(--border)] px-3.5 py-3 grid gap-2">
          {dayCount === 0 ? (
            <p className="text-[0.78rem] text-[var(--muted)] leading-relaxed">
              Nothing recognisable in{" "}
              {plan.unrecognised.length === 1 ? "that file" : "those files"}.
            </p>
          ) : (
            <>
              <p className="text-[0.82rem] font-medium">
                {dayCount} day{dayCount === 1 ? "" : "s"}
                {range ? ` · ${range[0]} → ${range[range.length - 1]}` : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {planSummary(plan).map((s) => (
                  <span key={s.field} className="chip pointer-events-none">
                    {s.field} · {s.days}d
                  </span>
                ))}
              </div>
              <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
                Only these fields are written — anything you typed by hand for
                a day the export lacks is untouched. rMSSD is not in Samsung&apos;s
                export, so readiness stays waiting for a source that measures
                it.
              </p>
              <button className="btn self-start" disabled={busy} onClick={() => void write()}>
                {busy ? "Writing…" : `Write ${dayCount} day${dayCount === 1 ? "" : "s"}`}
              </button>
            </>
          )}

          {plan.unrecognised.length > 0 && (
            <div className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
              Not recognised:{" "}
              {plan.unrecognised.map((u) => u.file).join(" · ")}
              {plan.unrecognised.some((u) => u.headers.length > 0) && (
                <span>
                  {" "}
                  — first columns seen:{" "}
                  {plan.unrecognised
                    .filter((u) => u.headers.length > 0)
                    .map((u) => u.headers.slice(0, 4).join(", "))
                    .join(" | ")}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
