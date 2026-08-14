import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { toIso, dueWithin } from "@/lib/logic";
import Vehicles from "@/components/Vehicles";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * VEHICLES — the deadlines, beside the money they cost
 *
 * Its own route since 2026-08-14: editing an MOT date is DOING, and doing
 * needs a place.
 *
 * Filed under Money rather than beside it, which is the correction that
 * matters here. A vehicle is a recurring cost and a set of legal
 * deadlines; filing it as neither — filing it as "a vehicle" — is
 * precisely why four MOT dates sat unrecorded for months and the
 * Zafira's lapsed unnoticed on 8 July. It is still lapsed today.
 * ------------------------------------------------------------------ */

export default async function VehiclesPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const { data } = await supabase
    .from("vehicles")
    .select(
      "id, name, registration, make_model, tax_due, mot_due, insurance_due, last_service, next_service, status, pillar_id, sort_order, notes"
    )
    .order("sort_order");

  const vehicles = (data ?? []) as {
    id: string;
    status: string;
    tax_due: string | null;
    mot_due: string | null;
    insurance_due: string | null;
  }[];

  // Same window the Money page used, so the two cannot disagree about
  // what "needs attention" means.
  const due = vehicles.flatMap((v) =>
    [v.tax_due, v.mot_due, v.insurance_due]
      .filter((d): d is string => d != null)
      .map((d) => ({ due_date: d, status: v.status === "active" ? "open" : "done" }))
  );
  const soon = dueWithin(due, today, 30);

  return (
    <div className="sys-life grid gap-5 max-w-[820px]">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">LIFE_OS · Money</p>
          <Link href="/life/money" className="text-[0.72rem] no-underline text-[var(--muted)]">
            ← Money
          </Link>
        </div>
        <h1 className="text-[1.6rem] font-semibold mt-1.5 leading-tight">Vehicles</h1>
        {/* A blank date means NOT RECORDED, never clear — the distinction
            that let one MOT lapse unnoticed. */}
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 max-w-[62ch] leading-relaxed">
          {soon.length > 0
            ? `${soon.length} thing${soon.length === 1 ? "" : "s"} needs attention in the next 30 days.`
            : "Nothing due in the next 30 days. A blank date means not recorded, not clear."}
        </p>
      </header>

      <Vehicles vehicles={vehicles as never} today={today} />
    </div>
  );
}
