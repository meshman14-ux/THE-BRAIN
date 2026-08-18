"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Measurement = {
  on_date: string;
  chest_cm: number | null;
  waist_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  body_fat_pct: number | null;
};

const FIELDS: { key: keyof Omit<Measurement, "on_date">; label: string; unit: string }[] = [
  { key: "chest_cm", label: "Chest", unit: "cm" },
  { key: "waist_cm", label: "Waist", unit: "cm" },
  { key: "arm_cm", label: "Arm", unit: "cm" },
  { key: "thigh_cm", label: "Thigh", unit: "cm" },
  { key: "body_fat_pct", label: "Body fat", unit: "%" },
];

/**
 * Today's tape measure, one field at a time. Upserted against `on_date`, so
 * a second entry the same day corrects the first rather than duplicating
 * it — the same idempotence `people_contacts` and the daily check-in hold.
 * Every field is independently optional: a waist-only day is a complete
 * entry, not a partial one.
 */
export default function MeasurementEntry({ today, initial }: { today: string; initial: Measurement | null }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map((f) => [f.key, initial?.[f.key] != null ? String(initial[f.key]) : ""])
    )
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function save() {
    setBusy(true);
    setErr("");
    setSaved(false);
    const row: Record<string, unknown> = { on_date: today };
    for (const f of FIELDS) {
      const raw = values[f.key].trim();
      row[f.key] = raw === "" ? null : Number(raw);
    }
    const { error } = await supabase.from("body_measurements").upsert(row, { onConflict: "user_id,on_date" });
    setBusy(false);
    if (error) {
      setErr("That did not save — try again.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {FIELDS.map((f) => (
          <label key={f.key} className="grid gap-1">
            <span className="label">
              {f.label} ({f.unit})
            </span>
            <input
              className="input mono"
              style={{ width: "6.5rem" }}
              inputMode="decimal"
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save today's tape"}
        </button>
        {saved && <span style={{ color: "#7ce8c4", fontSize: 12 }}>✓ saved</span>}
        {err && <span style={{ color: "var(--bad)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  );
}
