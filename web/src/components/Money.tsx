"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type PayoffDebt,
  type Strategy,
  type Thermometer,
  STRATEGY_LABEL,
  STRATEGY_HINT,
  formatGBP,
  thermometers,
  payoffPlan,
  strategyCost,
  canAvalanche,
  nextBalanceToConfirm,
  BALANCE_STALE_DAYS,
  addMonths,
} from "@/lib/logic";

/**
 * The debt tab.
 *
 * Two research findings are built into the shape of this rather than
 * written down beside it.
 *
 * Gal & McShane, over roughly six thousand debtors: the number of ACCOUNTS
 * CLOSED — independent of the amount repaid — predicts getting out of debt.
 * So every debt gets its own thermometer and a cleared one visibly goes
 * away. One bar for "total debt" would hide the only progress that
 * reliably predicts finishing.
 *
 * The goal-gradient effect: effort rises as the end becomes visible. So the
 * debt nearest payoff is the one marked, and it is the only one leaning on
 * its percentage. Marking all eight makes none of them the end.
 */
export default function Money({
  debts,
  strategy,
  confirmedOn,
  today,
  onStrategy,
}: {
  debts: PayoffDebt[];
  strategy: Strategy;
  confirmedOn: Record<string, string | null>;
  today: string;
  onStrategy: (s: Strategy) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const bars = thermometers(debts, strategy);
  const plan = payoffPlan(debts, strategy);
  const cost = strategyCost(debts);
  const avalanchePossible = canAvalanche(debts);

  const withDates = debts.map((d) => ({ ...d, confirmedOn: confirmedOn[d.id] ?? null }));
  const ask = nextBalanceToConfirm(withDates, today);

  /**
   * The monthly balance update, one question at a time.
   *
   * `meta.balance_confirmed_on` is stamped alongside the figure, because
   * "£400, confirmed in March" and "£400, confirmed yesterday" are
   * different facts and only the second should stop the page asking.
   */
  async function confirmBalance(id: string, raw: string) {
    const s = raw.trim();
    const value = s === "" ? null : Number(s);
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      setErr("A balance cannot be negative.");
      return;
    }
    setBusy(id);
    setErr("");

    // The existing meta is read and MERGED. Writing `meta: { ... }` whole
    // — which this did until 13 Aug 2026 — replaces the jsonb object and
    // destroys every other key on the row. Two debts carried a `restore`
    // block recording what their `recurring` flag used to be, and a single
    // balance confirmation would have erased both without a trace.
    const { data: current } = await supabase
      .from("debts")
      .select("meta")
      .eq("id", id)
      .maybeSingle();
    const held =
      typeof current?.meta === "object" && current.meta !== null && !Array.isArray(current.meta)
        ? (current.meta as Record<string, unknown>)
        : {};

    const { error } = await supabase
      .from("debts")
      .update({
        current_balance: value,
        meta:
          value === null
            ? Object.fromEntries(
                Object.entries(held).filter(([k]) => k !== "balance_confirmed_on")
              )
            : { ...held, balance_confirmed_on: today },
      })
      .eq("id", id);
    setBusy(null);
    setDraft("");
    if (error) setErr(error.message);
    else router.refresh();
  }

  const clearedCount = bars.filter((b) => b.cleared).length;

  return (
    <div className="grid gap-4">
      {err && (
        <p className="text-[0.82rem] m-0" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}

      {/* -- HERO · total and the date ------------------------------ */}
      <section className="panel grid gap-2">
        <p className="label">Still owed</p>
        <p className="mono text-[2rem] font-semibold leading-none">
          {formatGBP(
            debts
              .filter((d) => d.status === "active" && d.current_balance != null)
              .reduce((s, d) => s + Number(d.current_balance), 0) || null
          )}
        </p>
        {/* A projection is drawn differently from a confirmed figure, and
            says the word — a debt-free date is exactly the kind of number
            he might plan around, so it must never look like a fact. */}
        {plan.months != null ? (
          <p
            className="text-[0.84rem] leading-relaxed"
            style={{
              color: "var(--muted)",
              borderLeft: "2px dashed var(--border-bright)",
              paddingLeft: "10px",
            }}
          >
            <span className="label" style={{ display: "block" }}>
              Projected
            </span>
            Clear in <b className="mono">{plan.months}</b> month
            {plan.months === 1 ? "" : "s"} —{" "}
            <b className="mono">{addMonths(today, plan.months).slice(0, 7)}</b> — if the
            current plans hold.
          </p>
        ) : (
          <p className="text-[0.84rem] text-[var(--faint)] leading-relaxed">
            No debt-free date yet.{" "}
            {plan.unplanned > 0
              ? `${plan.unplanned} debt${plan.unplanned === 1 ? " has" : "s have"} a balance but no payment plan, and a debt with no payment never clears.`
              : "Some balances are still unconfirmed, and a projected date built on a guess is the most damaging figure this page could show."}
          </p>
        )}
      </section>

      {/* -- strategy ----------------------------------------------- */}
      <section className="panel grid gap-2.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="label">Order of attack</h2>
          <span className="text-[0.7rem] text-[var(--faint)]">
            {STRATEGY_HINT[strategy]}
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["avalanche", "snowball"] as Strategy[]).map((s) => (
            <button
              key={s}
              className="chip"
              data-active={strategy === s ? "true" : "false"}
              disabled={s === "avalanche" && !avalanchePossible}
              title={
                s === "avalanche" && !avalanchePossible
                  ? "Needs an interest rate on at least one debt"
                  : STRATEGY_HINT[s]
              }
              onClick={() => onStrategy(s)}
            >
              {STRATEGY_LABEL[s]}
            </button>
          ))}
        </div>

        {!avalanchePossible ? (
          <p className="text-[0.78rem] text-[var(--faint)] leading-relaxed">
            No interest rates recorded, so avalanche cannot be offered —
            &ldquo;highest interest first&rdquo; is meaningless without them, and
            treating a missing rate as 0% would sort an unrecorded credit card
            to the bottom and cost you money. Add a rate on any debt and the
            option appears.
          </p>
        ) : cost.extraMonths != null || cost.extraInterest != null ? (
          <p className="text-[0.78rem] text-[var(--muted)] leading-relaxed">
            Snowball costs{" "}
            <b className="mono">
              {cost.extraInterest != null ? formatGBP(cost.extraInterest) : "—"}
            </b>{" "}
            and{" "}
            <b className="mono">
              {cost.extraMonths != null ? `${cost.extraMonths} month${cost.extraMonths === 1 ? "" : "s"}` : "—"}
            </b>{" "}
            more than avalanche. It is still a fair choice: closing accounts is
            what actually predicts getting out, so the price is shown rather
            than argued about.
          </p>
        ) : (
          <p className="text-[0.78rem] text-[var(--faint)] leading-relaxed">
            The two orderings cannot be priced until every debt has a balance
            and a plan.
          </p>
        )}
      </section>

      {/* -- the monthly prompt ------------------------------------- */}
      {ask && (
        <section className="panel grid gap-2.5" style={{ borderColor: "var(--accent)" }}>
          <h2 className="label" style={{ color: "var(--accent)" }}>
            One question
          </h2>
          <p className="text-[0.9rem] leading-snug">
            What is the balance on <b>{ask.creditor}</b> today?
          </p>
          <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed -mt-1">
            {ask.current_balance == null
              ? "Never confirmed, so it is missing from the total entirely."
              : `Last confirmed ${ask.confirmedOn ?? "at some point"} — over ${BALANCE_STALE_DAYS} days ago.`}
          </p>
          <div className="flex gap-2">
            <input
              className="input mono"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={ask.current_balance == null ? "£" : String(ask.current_balance)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmBalance(ask.id, draft);
              }}
            />
            <button
              className="btn shrink-0"
              disabled={busy === ask.id || draft.trim() === ""}
              onClick={() => confirmBalance(ask.id, draft)}
            >
              Confirm
            </button>
          </div>
        </section>
      )}

      {/* -- the thermometers --------------------------------------- */}
      <section className="panel grid gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="label">Each one, separately</h2>
          <span className="text-[0.7rem] text-[var(--faint)]">
            {clearedCount > 0
              ? `${clearedCount} gone`
              : "closing accounts is what predicts getting out"}
          </span>
        </div>
        <ul className="grid gap-2.5 list-none p-0 m-0">
          {bars.map((b) => (
            <Bar key={b.id} bar={b} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Bar({ bar }: { bar: Thermometer }) {
  if (bar.cleared) {
    // A cleared debt does not vanish from the page — seeing it gone is the
    // reward — but it visibly stops being live.
    return (
      <li className="flex items-center gap-3 opacity-45">
        <span
          className="text-[0.86rem] line-through"
          style={{ textDecorationColor: "var(--good)" }}
        >
          {bar.creditor}
        </span>
        <span className="mono text-[0.7rem] ml-auto" style={{ color: "var(--good)" }}>
          CLEARED
        </span>
      </li>
    );
  }

  return (
    <li className="grid gap-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[0.86rem] font-medium">{bar.creditor}</span>
        {bar.nearest && (
          <span
            className="mono text-[0.62rem] font-bold"
            style={{ color: "var(--accent)" }}
          >
            NEAREST
          </span>
        )}
        <span className="mono text-[0.8rem] ml-auto">
          {bar.balance == null ? (
            <span className="text-[var(--faint)] italic">not confirmed</span>
          ) : (
            formatGBP(bar.balance)
          )}
        </span>
      </div>
      <div
        className="w-full rounded-full overflow-hidden border border-[var(--border)] bg-[var(--bg-2)]"
        style={{ height: bar.nearest ? 10 : 7 }}
        role="presentation"
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${bar.percent ?? 0}%`,
            background: bar.nearest ? "var(--accent)" : "var(--border-bright)",
          }}
        />
      </div>
      <p className="text-[0.7rem] text-[var(--faint)]">
        {bar.percent == null
          ? "No original amount recorded, so there is nothing to be a percentage of."
          : bar.nearest
            ? `${bar.percent}% paid off — the closest one to gone.`
            : `${bar.percent}% paid off`}
      </p>
    </li>
  );
}
