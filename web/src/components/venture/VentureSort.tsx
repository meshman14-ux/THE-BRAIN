"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type Tier,
  type VentureModuleRow,
  LEGAL_LABEL,
  LEGAL_STRUCTURES,
  TIERS,
  TIER_LABEL,
  TYPE_LABEL,
  VENTURE_TYPES,
  readTier,
} from "@/lib/venture/types";
import { IRL_RUNGS, irlLabel, tierFromIrl } from "@/lib/venture/scoring";

/**
 * Sorting a venture: which group it belongs to, how far along it is, what
 * kind of thing it is, and how it is owned.
 *
 * This is the step the whole module waits on. With `tier` and `irl` null on
 * every venture the portfolio is one giant "Not yet sorted" group and every
 * RAG is a guess — so this had to be four taps, not a form.
 *
 * Nothing is required and every control writes on its own. A skipped answer
 * writes NULL, and NULL means "not answered" everywhere it is read.
 */
export default function VentureSort({
  venture,
  groups,
}: {
  venture: VentureModuleRow;
  groups: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function set(patch: Partial<VentureModuleRow>) {
    setBusy(true);
    setNote("");
    const { error } = await supabase.from("ventures").update(patch).eq("id", venture.id);
    setBusy(false);
    if (error) setNote(`Could not save — ${error.message}`);
    else router.refresh();
  }

  const tier = readTier(venture.tier);
  const derived = tierFromIrl(venture.irl);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="label">Where it is</p>
        <div className="flex gap-1.5 flex-wrap">
          {TIERS.map((t: Tier) => (
            <button
              key={t}
              className="chip tap"
              onClick={() => set({ tier: tier === t ? null : t })}
              disabled={busy}
              aria-pressed={tier === t}
              style={
                tier === t
                  ? { borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 600 }
                  : undefined
              }
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
        {tier && derived && derived !== tier && (
          <p className="text-[0.72rem]" style={{ color: "var(--warn)" }}>
            Filed as {TIER_LABEL[tier]}; the evidence — {irlLabel(venture.irl)} — describes a{" "}
            {TIER_LABEL[derived]} venture. Stated and derived are both kept; neither is corrected.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="label">Evidence · IRL</p>
        <div className="flex gap-1 flex-wrap">
          {IRL_RUNGS.map((r) => (
            <button
              key={r.level}
              className="chip tap mono"
              title={`${r.label} — ${r.evidence}`}
              onClick={() => set({ irl: venture.irl === r.level ? null : r.level })}
              disabled={busy}
              aria-pressed={venture.irl === r.level}
              style={
                venture.irl === r.level
                  ? { borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 600 }
                  : undefined
              }
            >
              {r.level}
            </button>
          ))}
        </div>
        <p className="text-[0.72rem] text-[var(--faint)]">
          {venture.irl
            ? `${irlLabel(venture.irl)} — ${
                IRL_RUNGS.find((r) => r.level === venture.irl)?.evidence
              }`
            : "Rung 5 is the first that needs somebody outside the family to have paid."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="label">Group</span>
          <input
            className="input tap"
            list="venture-groups"
            defaultValue={venture.venture_group ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (venture.venture_group ?? "")) return;
              set({ venture_group: v === "" ? null : v });
            }}
          />
          <datalist id="venture-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1 min-w-0">
          <span className="label">Kind</span>
          <select
            className="input tap"
            defaultValue={venture.venture_type ?? ""}
            onChange={(e) => set({ venture_type: e.target.value || null })}
          >
            <option value="">not set</option>
            {VENTURE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 min-w-0">
          <span className="label">Owned as</span>
          <select
            className="input tap"
            defaultValue={venture.legal_structure ?? ""}
            onChange={(e) => set({ legal_structure: e.target.value || null })}
          >
            <option value="">not set</option>
            {LEGAL_STRUCTURES.map((l) => (
              <option key={l} value={l}>
                {LEGAL_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="label">Also</span>
        <button
          className="chip tap"
          onClick={() => set({ employs_people: venture.employs_people === true ? null : true })}
          aria-pressed={venture.employs_people === true}
        >
          {venture.employs_people === true ? "✓ " : ""}Employs someone
        </button>
        <button
          className="chip tap"
          onClick={() => set({ vat_registered: venture.vat_registered === true ? null : true })}
          aria-pressed={venture.vat_registered === true}
        >
          {venture.vat_registered === true ? "✓ " : ""}VAT registered
        </button>
      </div>

      <p className="text-[0.72rem] text-[var(--faint)]">
        The legal structure is what the checklist is built from. Without it the list defaults to
        sole trader, which is wrong for anything incorporated and quietly lists the wrong statutes.
      </p>
      {note && (
        <p className="text-[0.75rem]" style={{ color: "var(--bad)" }}>
          {note}
        </p>
      )}
    </div>
  );
}
