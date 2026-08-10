"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { HealthDay } from "@/lib/logic";

/**
 * Today's floor.
 *
 * One tap is a complete entry. Weighing food is the most abandoned habit in
 * this whole domain, so the default rung is a weight and a yes/no — enough
 * to see a trend, which is the only thing that actually decides anything.
 *
 * Every field writes on its own and every field is nullable, so a day with
 * only a weight is a valid day. That matters more than it looks: if a
 * partial entry were rejected, the day with one number would become a day
 * with none.
 */
export default function HealthToday({
  date,
  initial,
}: {
  date: string;
  initial: HealthDay | null;
}) {
  const [row, setRow] = useState<Partial<HealthDay>>(initial ?? {});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function save(field: string, patch: Partial<HealthDay>) {
    const next = { ...row, ...patch };
    setRow(next);
    setBusy(field);
    setErr("");
    const { error } = await supabase.from("health_days").upsert(
      {
        on_date: date,
        rmssd: next.rmssd ?? null,
        sleep_hours: next.sleep_hours ?? null,
        weight_kg: next.weight_kg ?? null,
        ate_well: next.ate_well ?? null,
        protein_g: next.protein_g ?? null,
        calories: next.calories ?? null,
        // Typed, not synced. When an import lands it writes its own source,
        // and the two must stay distinguishable.
        source: "manual",
      },
      { onConflict: "user_id,on_date" }
    );
    setBusy(null);
    if (error) setErr(error.message);
    else router.refresh();
  }

  const num = (v: string): number | null => {
    const s = v.trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="grid gap-3">
      {err && (
        <p className="text-[0.78rem] m-0" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}

      {/* -- the one tap -------------------------------------------- */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[0.86rem]">Ate well today?</span>
        {[
          { label: "Yes", value: true },
          { label: "Not really", value: false },
        ].map((o) => (
          <button
            key={o.label}
            className="chip"
            disabled={busy === "ate_well"}
            data-active={row.ate_well === o.value ? "true" : "false"}
            onClick={() =>
              save("ate_well", { ate_well: row.ate_well === o.value ? null : o.value })
            }
          >
            {o.label}
          </button>
        ))}
        <span className="text-[0.7rem] text-[var(--faint)]">
          {row.ate_well == null ? "unanswered — tap either, or neither" : "tap again to clear"}
        </span>
      </div>

      {/* -- the numbers, all optional ------------------------------ */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field
          label="Weight (kg)"
          value={row.weight_kg}
          busy={busy === "weight_kg"}
          onSave={(v) => save("weight_kg", { weight_kg: num(v) })}
        />
        <Field
          label="Sleep (hours)"
          value={row.sleep_hours}
          busy={busy === "sleep_hours"}
          onSave={(v) => save("sleep_hours", { sleep_hours: num(v) })}
        />
        <Field
          label="rMSSD (ms)"
          hint="what the readiness band is computed from"
          value={row.rmssd}
          busy={busy === "rmssd"}
          onSave={(v) => save("rmssd", { rmssd: num(v) })}
        />
        <Field
          label="Protein (g)"
          hint="the next rung — skip it and nothing breaks"
          value={row.protein_g}
          busy={busy === "protein_g"}
          onSave={(v) => save("protein_g", { protein_g: num(v) })}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  busy,
  onSave,
}: {
  label: string;
  hint?: string;
  value: number | null | undefined;
  busy: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  return (
    <label className="grid gap-1" style={{ opacity: busy ? 0.6 : 1 }}>
      <span className="label">{label}</span>
      <input
        className="input mono text-[0.9rem]"
        type="number"
        inputMode="decimal"
        step="0.1"
        placeholder="—"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== (value == null ? "" : String(value))) onSave(draft);
        }}
      />
      {hint && <span className="text-[0.68rem] text-[var(--faint)]">{hint}</span>}
    </label>
  );
}
