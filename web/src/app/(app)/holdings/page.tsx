import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Asset, Investment, Venture } from "@/lib/types";
import { toIso } from "@/lib/logic";
import Holdings from "@/components/Holdings";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * Holdings — Phase 5's first half.
 *
 * `assets` and `investments` have been read since the v1 schema shipped
 * and have never held a row, so every figure they feed has rendered a
 * dash: net worth on `/life/money`, the cashflow costs beside it, and
 * "spent so far" on all seventeen division cockpits.
 *
 * It belongs to EMPIRE_OS rather than beside the Money page on purpose.
 * `/life/money` READS these rows to answer "how am I doing?"; this page
 * is where they are kept. That is §A2's rule — the command centre reads,
 * the subsystems write — applied one level down.
 *
 * It sits at `/holdings` and NOT at `/empire/holdings`, which would have
 * been the tidier address and is a trap: `/empire/[id]` resolves a
 * division by uuid **or** by name-derived slug, so a static
 * `/empire/holdings` segment would win over the dynamic one and a
 * division ever named "Holdings" would become unreachable with nothing
 * going red. `/opportunities` is already top-level for the same family
 * of reasons, so this matches it.
 * ------------------------------------------------------------------ */

export default async function HoldingsPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: assetRows }, { data: investmentRows }, { data: ventureRows }] =
    await Promise.all([
      supabase
        .from("assets")
        .select(
          "id, name, kind, venture_id, pillar_id, value, income_monthly, cost_monthly, status, acquired_on"
        ),
      supabase
        .from("investments")
        .select("id, name, kind, platform, pillar_id, units, cost_basis, current_value, as_of"),
      supabase.from("ventures").select("id, name, status, external_system").order("name"),
    ]);

  const assets = (assetRows ?? []) as Asset[];
  const investments = (investmentRows ?? []) as Investment[];
  // MAINFRAME is a pointer row, never a subject (§A1) — an asset can no
  // more belong to it than a diagnostic run can.
  const ventures = ((ventureRows ?? []) as Pick<
    Venture,
    "id" | "name" | "status" | "external_system"
  >[]).filter((v) => v.external_system == null);

  return (
    <div className="sys-empire grid gap-6 max-w-[900px]">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">EMPIRE_OS · Holdings</p>
          <Link href="/empire" className="text-[0.72rem] no-underline text-[var(--muted)]">
            ← Divisions
          </Link>
        </div>
        <h1 className="text-[1.6rem] font-semibold mt-1.5 leading-tight">What it owns</h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 max-w-[62ch] leading-relaxed">
          Two kinds of owning, kept apart because they answer different questions.
          An asset is run — it earns and it costs every month. An investment is
          held — what went in, what it is worth, and when that was last true.
          Every figure here edits where it stands.
        </p>
      </header>

      <Holdings
        assets={assets}
        investments={investments}
        ventures={ventures}
        today={today}
      />
    </div>
  );
}
