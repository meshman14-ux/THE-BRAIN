"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TIERS, TIER_CADENCE, TIER_LABEL, type Tier } from "@/lib/logic";

/**
 * Add a person in one box.
 *
 * A name is the only required thing, which is the same rule capture follows
 * — the point of entry has to be cheaper than the thought of using it. The
 * tier is offered because it is one tap and it is what makes the row do
 * anything, but leaving it unset is a real choice: the person is on the
 * roster and the system simply is not measuring them yet.
 */
export default function AddPerson() {
  const [name, setName] = useState("");
  const [tier, setTier] = useState<Tier | null>("close");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function add() {
    const clean = name.trim();
    if (clean === "") return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("people").insert({
      name: clean,
      cadence_days: tier == null ? null : TIER_CADENCE[tier],
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <section className="panel grid gap-2.5">
      <h2 className="label">Add someone</h2>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Their name. Nothing else is required."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <button className="btn shrink-0" disabled={busy || name.trim() === ""} onClick={add}>
          Add
        </button>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {TIERS.map((t) => (
          <button
            key={t}
            className="chip"
            data-active={tier === t ? "true" : "false"}
            onClick={() => setTier(tier === t ? null : t)}
          >
            {TIER_LABEL[t]} · {TIER_CADENCE[t]}d
          </button>
        ))}
        <span className="text-[0.7rem] text-[var(--faint)] self-center">
          {tier == null
            ? "No cadence — they will sit on the roster unmeasured until you set one."
            : "Tap again to add them with no cadence at all."}
        </span>
      </div>
      {err && (
        <p className="text-[0.78rem] m-0" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}
    </section>
  );
}
