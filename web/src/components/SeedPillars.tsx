"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Shown only when the account has no pillars yet — the deliberate first run. */
export default function SeedPillars() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function seed() {
    setBusy(true);
    setErr("");
    const supabase = createClient();
    const { error } = await supabase.rpc("seed_pillars");
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="max-w-[560px] mx-auto pt-8">
      <div className="text-center mb-7">
        <div className="text-5xl mb-4 select-none">🧠</div>
        <h1 className="text-[1.7rem] font-semibold">Initialise THE BRAIN</h1>
        <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">
          This plants your thirteen pillars — eight in LIFE_OS, five in EMPIRE_OS —
          each with the standard it holds. You can rename, reword and reorder any
          of them afterwards.
        </p>
      </div>

      <div className="card p-6">
        <p className="label mb-3">LIFE_OS · you as a person</p>
        <ul className="text-sm text-[var(--muted)] grid gap-1.5 mb-5">
          <li>🏋️ Training &amp; Fitness</li>
          <li>🥗 Nutrition &amp; Recovery</li>
          <li>📚 Mind &amp; Growth</li>
          <li>🏡 Family</li>
          <li>🤝 Friends &amp; Network</li>
          <li>🧾 Home &amp; Admin</li>
          <li>💷 Money &amp; Security</li>
        </ul>

        <p className="label mb-3">EMPIRE_OS · you as an owner</p>
        <ul className="text-sm text-[var(--muted)] grid gap-1.5">
          <li>🚀 Ventures</li>
          <li>🏗️ Property &amp; Assets</li>
          <li>📈 Capital &amp; Investments</li>
          <li>📡 Brand &amp; Network</li>
          <li>⚙️ Systems &amp; Tools</li>
        </ul>

        <button className="btn w-full mt-6" onClick={seed} disabled={busy}>
          {busy ? "Planting…" : "Plant the thirteen pillars"}
        </button>
        {err && <p className="text-sm text-[var(--bad)] mt-3">⚠ {err}</p>}
      </div>
    </div>
  );
}
