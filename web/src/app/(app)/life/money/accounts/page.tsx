import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { toIso } from "@/lib/logic";
import DebtsView from "@/components/Debts";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * ACCOUNTS — the creditors themselves
 *
 * Its own route since 2026-08-14, and the rule behind that is a test
 * rather than taste: a sub-module gets a PATH if you can DO something
 * there, and stays a query filter if it only SHOWS the parent's data.
 * Editing a balance is doing.
 *
 * It also closes a duplication. This subject had TWO addresses —
 * `/life/debts` and `/life/money?tab=accounts` — and two addresses for
 * one thing is how the sprawl started last time. Both now land here.
 * ------------------------------------------------------------------ */

export default async function AccountsPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: debts }, { data: payments }] = await Promise.all([
    supabase
      .from("debts")
      .select(
        "id, creditor, kind, reference, original_amount, current_balance, status, plan_amount, plan_frequency, plan_day, plan_start, notes, apr, recurring, sort_order, meta"
      )
      .order("sort_order"),
    supabase.from("debt_payments").select("debt_id, paid_on, amount"),
  ]);

  return (
    <div className="sys-life grid gap-5 max-w-[820px]">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">LIFE_OS · Money</p>
          <Link href="/life/money" className="text-[0.72rem] no-underline text-[var(--muted)]">
            ← Money
          </Link>
        </div>
        <h1 className="text-[1.6rem] font-semibold mt-1.5 leading-tight">Accounts</h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 max-w-[62ch] leading-relaxed">
          Every creditor, what closes and what merely recurs. A standing bill
          cannot be paid off, so it is never counted as debt that will one day
          be gone.
        </p>
      </header>

      <DebtsView
        debts={(debts ?? []) as never}
        payments={(payments ?? []) as never}
        today={today}
      />
    </div>
  );
}
