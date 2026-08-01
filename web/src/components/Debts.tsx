"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type Debt,
  type DebtPayment,
  type PlanFrequency,
  DEBT_KIND_LABEL,
} from "@/lib/types";
import {
  debtTotal,
  missedPayments,
  nextPaymentDue,
  payoffMonths,
  sortDebts,
} from "@/lib/logic";

/**
 * The debts board.
 *
 * Two rules drive everything here.
 *
 * One: an unknown balance is never shown as £0. Jay confirmed his headline
 * figure covers only some of his creditors, so the total says so out loud
 * until every balance is in. A partial figure presented as a total is the kind
 * of number that quietly convinces someone they are nearly done.
 *
 * Two: entering a balance has to be fast, because he will be doing it with a
 * creditor on the phone. One tap, type, blur — no dialogs, no page reload.
 */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default function Debts({
  debts,
  payments,
  today,
}: {
  debts: Debt[];
  payments: DebtPayment[];
  today: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function save(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    setErr("");
    const { error } = await supabase.from("debts").update(patch).eq("id", id);
    setBusy(null);
    if (error) setErr(error.message);
    else router.refresh();
  }

  if (debts.length === 0) {
    return (
      <div className="card p-6 max-w-[60ch]">
        <p className="font-semibold text-[0.95rem] m-0">No debts recorded</p>
        <p className="text-[0.85rem] text-[var(--muted)] mt-2 leading-relaxed m-0">
          Add each creditor as you find out about them. A balance you have not
          confirmed yet is fine — leave it blank and the total will say it is
          incomplete rather than pretend otherwise.
        </p>
      </div>
    );
  }

  const total = debtTotal(debts);
  const ordered = sortDebts(debts);
  const next = nextPaymentDue(payments, today);
  const missed = missedPayments(payments, today);

  return (
    <div className="grid gap-5">
      {/* ---- the honest total ---- */}
      <section className="card p-5">
        <p className="label">Total owed</p>
        <p className="mono text-[2rem] font-bold mt-1.5 leading-none m-0">
          {GBP.format(total.known)}
        </p>
        <p className="text-[0.82rem] mt-2.5 leading-relaxed m-0">
          {total.complete ? (
            <span className="text-[var(--muted)]">
              Across all {total.knownCount} creditors. This figure is complete.
            </span>
          ) : (
            <span style={{ color: "var(--warn)" }}>
              Known across {total.knownCount} of{" "}
              {total.knownCount + total.unknownCount} creditors —{" "}
              {total.unknownCount} balance
              {total.unknownCount === 1 ? "" : "s"} still to confirm. The real
              total is higher.
            </span>
          )}
        </p>

        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3.5 pt-3.5 border-t border-[var(--border)] text-[0.8rem]">
          <span className="text-[var(--muted)]">
            Next payment:{" "}
            <b className="mono text-[var(--text)]">
              {next ? `${GBP.format(next.amount)} on ${next.due_on}` : "none scheduled"}
            </b>
          </span>
          {missed.length > 0 && (
            <span style={{ color: "var(--bad)" }}>
              {missed.length} payment{missed.length === 1 ? "" : "s"} past due
            </span>
          )}
        </div>
      </section>

      {err && (
        <p className="text-[0.82rem] m-0" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}

      {/* ---- the creditors ---- */}
      <ul className="grid gap-2.5 list-none p-0 m-0">
        {ordered.map((d) => {
          const unknown = d.current_balance == null;
          const months = payoffMonths(d);
          return (
            <li key={d.id} className="card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-semibold text-[0.95rem] m-0">{d.creditor}</h3>
                <span className="text-[0.7rem] uppercase tracking-wide text-[var(--faint)]">
                  {DEBT_KIND_LABEL[d.kind] ?? d.kind}
                </span>
                {d.status !== "active" && (
                  <span
                    className="text-[0.7rem] uppercase tracking-wide"
                    style={{ color: "var(--good)" }}
                  >
                    {d.status}
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3 mt-3">
                <div>
                  <label className="label block" htmlFor={`bal-${d.id}`}>
                    Balance
                  </label>
                  <input
                    id={`bal-${d.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    className="input mt-1.5 text-[0.9rem] mono"
                    placeholder="not confirmed"
                    defaultValue={d.current_balance ?? ""}
                    disabled={busy === d.id}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const val = raw === "" ? null : Number(raw);
                      if (val === (d.current_balance ?? null)) return;
                      if (val != null && (Number.isNaN(val) || val < 0)) {
                        setErr("A balance cannot be negative.");
                        return;
                      }
                      save(d.id, { current_balance: val });
                    }}
                  />
                </div>

                <div>
                  <label className="label block" htmlFor={`plan-${d.id}`}>
                    Payment
                  </label>
                  <input
                    id={`plan-${d.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    className="input mt-1.5 text-[0.9rem] mono"
                    placeholder="no plan"
                    defaultValue={d.plan_amount ?? ""}
                    disabled={busy === d.id}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const val = raw === "" ? null : Number(raw);
                      if (val === (d.plan_amount ?? null)) return;
                      save(d.id, { plan_amount: val });
                    }}
                  />
                </div>

                <div>
                  <label className="label block" htmlFor={`freq-${d.id}`}>
                    Frequency
                  </label>
                  <select
                    id={`freq-${d.id}`}
                    className="input mt-1.5 text-[0.9rem]"
                    defaultValue={d.plan_frequency ?? ""}
                    disabled={busy === d.id}
                    onChange={(e) =>
                      save(d.id, {
                        plan_frequency: (e.target.value || null) as
                          | PlanFrequency
                          | null,
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <p className="text-[0.76rem] mt-2.5 m-0 text-[var(--muted)]">
                {unknown
                  ? "Balance not confirmed — ring them and fill this in."
                  : months != null
                    ? `Clear in about ${months} month${months === 1 ? "" : "s"} at this rate.`
                    : d.plan_amount == null
                      ? "No payment plan agreed yet."
                      : "Add a frequency to see how long this takes to clear."}
                {d.reference && (
                  <span className="mono"> · ref {d.reference}</span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
