"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LOW_PROFIT_FLOOR,
  type VentureMonth,
  monthKey,
  profitPerHour,
  readVentureMonths,
} from "@/lib/logic";

/**
 * The monthly capture — the three numbers a division is judged by, asked
 * where the division lives. Revenue, costs, hours this month; each writes
 * on blur into `ventures.meta.months["YYYY-MM"]`, each independently, so a
 * month can hold one figure without pretending to hold three. Skip leaves
 * NULL and the profit-per-hour column shows a dash — never a number built
 * on a shrug.
 *
 * This is what feeds the watchtower's exit-gate rule: three complete
 * months under £5/hr and the question is asked out loud. Until three
 * months exist, the rule stays silent — the same discipline as the
 * obstacle tally.
 */
export default function DivisionMonth({
  ventureId,
  months: initialMonths,
  today,
}: {
  ventureId: string;
  months: Record<string, VentureMonth>;
  today: string;
}) {
  const [months, setMonths] = useState(initialMonths);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const nowKey = monthKey(today);
  const current: VentureMonth = months[nowKey] ?? {
    revenue: null,
    costs: null,
    hours: null,
  };

  // The three most recent keys: this month plus the two before it.
  const [y, mo] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const recentKeys = [0, 1, 2].map((back) => {
    const d = new Date(Date.UTC(y, mo - 1 - back, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  async function write(field: keyof VentureMonth, raw: string) {
    const trimmed = raw.trim();
    // Empty clears back to "not recorded" — never to zero.
    const value = trimmed === "" ? null : Number(trimmed);
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      setNote("That needs to be a plain number.");
      return;
    }
    if (value === (current[field] ?? null)) return;
    setBusy(true);
    setNote("");
    // Read-merge-write on the live row: this jsonb also holds onboarding
    // answers, and a month figure must never clobber them.
    const { data } = await supabase
      .from("ventures")
      .select("meta")
      .eq("id", ventureId)
      .maybeSingle();
    const meta =
      typeof data?.meta === "object" && data?.meta != null
        ? (data.meta as Record<string, unknown>)
        : {};
    const held = readVentureMonths(meta);
    const nextMonth = { ...(held[nowKey] ?? current), [field]: value };
    const { error } = await supabase
      .from("ventures")
      .update({
        meta: { ...meta, months: { ...held, [nowKey]: nextMonth } },
      })
      .eq("id", ventureId);
    setBusy(false);
    if (error) {
      setNote("That didn't save — try again.");
      return;
    }
    setMonths({ ...held, [nowKey]: nextMonth });
    router.refresh();
  }

  const gbp = (v: number | null) =>
    v == null ? "" : String(Math.round(v * 100) / 100);

  const field = (
    label: string,
    key: keyof VentureMonth,
    hint: string
  ) => (
    <label className="grid gap-1 min-w-0">
      <span className="label">{label}</span>
      <input
        className="input mono"
        inputMode="decimal"
        defaultValue={gbp(current[key])}
        placeholder="—"
        disabled={busy}
        aria-label={`${label} for this month`}
        onBlur={(e) => void write(key, e.target.value)}
      />
      <span className="text-[0.64rem] text-[var(--faint)]">{hint}</span>
    </label>
  );

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {field("Revenue £", "revenue", "this month, so far is fine")}
        {field("Costs £", "costs", "everything it spent")}
        {field("Hours", "hours", "this month, not per week")}
      </div>
      {note && <p className="text-[0.74rem] text-[var(--bad)]">⚠ {note}</p>}

      {/* -- the heartbeat, three months of it ---------------------- */}
      <div className="grid gap-1">
        {recentKeys.map((k) => {
          const pph = profitPerHour(months[k]);
          const label = k === nowKey ? `${k} · so far` : k;
          return (
            <div
              key={k}
              className="flex items-baseline gap-2 text-[0.78rem]"
            >
              <span className="mono text-[var(--muted)]">{label}</span>
              <span
                className="mono ml-auto"
                style={{
                  color:
                    pph == null
                      ? "var(--faint)"
                      : pph < LOW_PROFIT_FLOOR
                        ? "var(--warn)"
                        : "var(--good)",
                }}
              >
                {pph == null ? "£—/hr" : `£${pph.toFixed(2)}/hr`}
              </span>
            </div>
          );
        })}
        <p className="text-[0.68rem] text-[var(--faint)] leading-relaxed mt-1">
          Profit per hour needs all three figures — a missing one shows a
          dash, never a guess. Three complete months under £
          {LOW_PROFIT_FLOOR}/hr and the watchtower asks the exit question.
        </p>
      </div>
    </div>
  );
}
