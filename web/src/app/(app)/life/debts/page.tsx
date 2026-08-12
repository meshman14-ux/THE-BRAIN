import { createClient } from "@/lib/supabase/server";
import DebtsView from "@/components/Debts";
import type { Debt, DebtPayment } from "@/lib/types";
import { toIso } from "@/lib/logic";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: debts }, { data: payments }] = await Promise.all([
    supabase
      .from("debts")
      .select(
        "id, creditor, kind, reference, original_amount, current_balance, status, plan_amount, plan_frequency, plan_day, plan_start, pillar_id, venture_id, notes, sort_order, recurring"
      )
      .order("sort_order"),
    supabase
      .from("debt_payments")
      .select("id, debt_id, amount, due_on, paid_on, status")
      .order("due_on"),
  ]);

  return (
    <div className="sys-life grid gap-7">
      <header>
        <p className="label">LIFE_OS · Money & Security</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Debts</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-[62ch] leading-relaxed">
          Every creditor, what is owed, and the plan. A balance you have not
          confirmed stays blank rather than counting as zero — the total says
          how much of the picture is real.
        </p>
      </header>

      <DebtsView
        debts={(debts ?? []) as Debt[]}
        payments={(payments ?? []) as DebtPayment[]}
        today={today}
      />
    </div>
  );
}
