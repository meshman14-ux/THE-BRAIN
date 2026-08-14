"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Asset, Investment, Venture } from "@/lib/types";
import { formatGBP } from "@/lib/logic";
import {
  ASSET_KINDS,
  INVESTMENT_KINDS,
  assetLine,
  holdingsLine,
  holdingsTotals,
  investmentLine,
  kindLabel,
  rankAssets,
  rankInvestments,
} from "@/lib/holdings";
import InlineValue from "@/components/InlineValue";
import { Empty, Panel } from "@/components/ui";

/**
 * The holdings board — what the empire owns.
 *
 * `assets` and `investments` have been read by `/life/money` and every
 * division cockpit since the day they shipped, and both have always been
 * empty, so every figure they feed has rendered `£—`. This is the first
 * writer either has had.
 *
 * TWO SECTIONS, NOT ONE LIST. An asset is owned and RUN — it earns and it
 * costs, monthly. An investment is owned and HELD — it has a basis, a
 * value and the date that value was true on. Merging them would give one
 * row shape four columns that are always null.
 *
 * Every figure edits in place through `InlineValue`, so a dash on this
 * page is the input for the thing it is admitting it does not know.
 * Nothing here has a Save button and nothing is required: a holding with
 * a name and no value is a real holding, and it is counted as a row while
 * being left out of the total.
 */
export default function Holdings({
  assets,
  investments,
  ventures,
  today,
}: {
  assets: Asset[];
  investments: Investment[];
  ventures: Pick<Venture, "id" | "name">[];
  today: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<"assets" | "investments">("assets");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("equipment");
  const [ventureId, setVentureId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const assetLines = rankAssets(assets.map(assetLine));
  const invLines = rankInvestments(investments.map((i) => investmentLine(i, today)));
  const totals = holdingsTotals(assets, investments);
  const line = holdingsLine(totals, invLines);

  async function add() {
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("It needs a name.");
      return;
    }
    setError("");
    setBusy(true);
    const { error: err } =
      tab === "assets"
        ? await supabase.from("assets").insert({
            name: trimmed,
            kind,
            // A division is optional. An asset with no division still
            // counts toward net worth; it simply is not any one
            // division's spend.
            venture_id: ventureId === "" ? null : ventureId,
          })
        : await supabase.from("investments").insert({ name: trimmed, kind });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setName("");
    setVentureId("");
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    const { error: err } = await supabase.from("assets").update({ status }).eq("id", id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  const kinds = tab === "assets" ? ASSET_KINDS : INVESTMENT_KINDS;
  const ventureName = (id: string | null) =>
    id == null ? null : (ventures.find((v) => v.id === id)?.name ?? null);

  return (
    <div className="grid gap-4">
      {/* -- the totals ------------------------------------------- */}
      <Panel
        title="What it is worth"
        hint={totals.complete ? "every holding valued" : "a floor, not a figure"}
      >
        <div className="flex gap-6 flex-wrap">
          <Figure label="Assets" value={totals.assetValue} sub={`${totals.assetCount} held`} />
          <Figure
            label="Investments"
            value={totals.investmentValue}
            sub={`${totals.investmentCount} held`}
          />
          <Figure
            label="Net monthly"
            value={totals.netMonthly}
            sub={totals.netMonthly == null ? "nothing recorded" : "from assets"}
          />
        </div>
        {line && <p className="text-[0.78rem] text-[var(--muted)] mt-1 m-0">{line}</p>}
      </Panel>

      {/* -- the two boards --------------------------------------- */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          className="chip"
          data-active={tab === "assets" ? "true" : "false"}
          aria-pressed={tab === "assets"}
          onClick={() => setTab("assets")}
        >
          Assets · {assets.length}
        </button>
        <button
          className="chip"
          data-active={tab === "investments" ? "true" : "false"}
          aria-pressed={tab === "investments"}
          onClick={() => setTab("investments")}
        >
          Investments · {investments.length}
        </button>
      </div>

      {tab === "assets" ? (
        assetLines.length === 0 ? (
          <Panel title="Assets">
            <Empty>
              Things owned and run — a trailer, a property, a van. Each one earns
              and costs a month, and its value is what a division has actually had
              put into it.
            </Empty>
          </Panel>
        ) : (
          <ul className="grid gap-3 list-none p-0 m-0">
            {assetLines.map((l) => (
              // `min-w-0` on the ROW: a nowrap child contributes its whole
              // string to the track's min-content, and capping the text does
              // nothing about that.
              <li
                key={l.asset.id}
                className={`panel min-w-0 grid gap-2.5 ${l.held ? "" : "panel-quiet"}`}
              >
                <div className="flex items-start gap-3 flex-wrap min-w-0">
                  <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    <h3 className="serif text-[1.02rem] leading-tight m-0">{l.asset.name}</h3>
                    <p className="text-[0.72rem] text-[var(--faint)] mt-1 m-0">
                      {kindLabel(l.asset.kind)}
                      {ventureName(l.asset.venture_id) && ` · ${ventureName(l.asset.venture_id)}`}
                      {!l.held && " · sold"}
                    </p>
                  </div>
                  <button
                    className="chip shrink-0"
                    disabled={busy}
                    onClick={() => void setStatus(l.asset.id, l.held ? "sold" : "held")}
                  >
                    {l.held ? "Mark sold" : "Still held"}
                  </button>
                </div>

                <div className="flex gap-x-6 gap-y-2 flex-wrap text-[0.82rem]">
                  <Field label="Value">
                    <InlineValue field="assets.value" id={l.asset.id} value={l.asset.value} />
                  </Field>
                  <Field label="Earns">
                    <InlineValue
                      field="assets.income_monthly"
                      id={l.asset.id}
                      value={l.asset.income_monthly}
                    />
                  </Field>
                  <Field label="Costs">
                    <InlineValue
                      field="assets.cost_monthly"
                      id={l.asset.id}
                      value={l.asset.cost_monthly}
                    />
                  </Field>
                </div>

                {/* Only said when it can be said. A yield needs a value AND a
                    monthly figure, and a guessed one would drive a
                    keep-or-sell decision. */}
                {(l.netMonthly != null || l.yieldPct != null) && (
                  <p className="text-[0.74rem] text-[var(--muted)] m-0">
                    {l.netMonthly != null && `${formatGBP(l.netMonthly)} a month`}
                    {l.yieldPct != null && ` · ${l.yieldPct}% a year on its value`}
                    {l.yieldPct == null && l.netMonthly != null && " · no value, so no yield"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )
      ) : invLines.length === 0 ? (
        <Panel title="Investments">
          <Empty>
            Things owned and held — a fund, a pension, a holding on a platform.
            What went in, what it is worth now, and the date that was true on.
          </Empty>
        </Panel>
      ) : (
        <ul className="grid gap-3 list-none p-0 m-0">
          {invLines.map((l) => (
            <li key={l.investment.id} className="panel min-w-0 grid gap-2.5">
              <div className="min-w-0">
                <h3 className="serif text-[1.02rem] leading-tight m-0">{l.investment.name}</h3>
                <p className="text-[0.72rem] text-[var(--faint)] mt-1 m-0">
                  {kindLabel(l.investment.kind)}
                  {l.investment.platform && ` · ${l.investment.platform}`}
                </p>
              </div>

              <div className="flex gap-x-6 gap-y-2 flex-wrap text-[0.82rem]">
                <Field label="Put in">
                  <InlineValue
                    field="investments.cost_basis"
                    id={l.investment.id}
                    value={l.investment.cost_basis}
                  />
                </Field>
                <Field label="Worth now">
                  <InlineValue
                    field="investments.current_value"
                    id={l.investment.id}
                    value={l.investment.current_value}
                  />
                </Field>
                <Field label="Priced on">
                  <InlineValue
                    field="investments.as_of"
                    id={l.investment.id}
                    value={l.investment.as_of}
                  />
                </Field>
              </div>

              {(l.gain != null || l.ageDays != null) && (
                <p
                  className="text-[0.74rem] m-0"
                  style={{
                    color:
                      l.gain == null
                        ? "var(--muted)"
                        : l.gain > 0
                          ? "var(--good)"
                          : l.gain < 0
                            ? "var(--bad)"
                            : "var(--muted)",
                  }}
                >
                  {l.gain != null &&
                    `${l.gain >= 0 ? "up" : "down"} ${formatGBP(Math.abs(l.gain))}`}
                  {l.gainPct != null && ` · ${l.gainPct}%`}
                  {/* Age is stated rather than corrected. Nothing here guesses
                      what a stale holding is worth today. */}
                  {l.ageDays != null && (
                    <span style={{ color: "var(--faint)" }}>
                      {l.gain != null && " · "}
                      priced {l.ageDays === 0 ? "today" : `${l.ageDays} days ago`}
                      {l.stale && " — over a quarter old"}
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* -- adding one ------------------------------------------- */}
      <Panel title={tab === "assets" ? "New asset" : "New investment"} hint="a name is the floor">
        <div className="grid gap-2.5">
          <input
            className="input"
            placeholder={tab === "assets" ? "What is it?" : "What is it?"}
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {kinds.map((k) => (
              <button
                key={k}
                className="chip"
                data-active={kind === k ? "true" : "false"}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {kindLabel(k)}
              </button>
            ))}
          </div>
          {tab === "assets" && ventures.length > 0 && (
            <select
              className="input w-auto"
              aria-label="Division"
              value={ventureId}
              onChange={(e) => setVentureId(e.target.value)}
            >
              <option value="">No division</option>
              {ventures.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn" disabled={busy} onClick={() => void add()}>
              Add
            </button>
            {error && (
              <span className="text-[0.72rem]" style={{ color: "var(--bad)" }}>
                {error}
              </span>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** A total, or an honest dash. Never a zero standing in for "not yet". */
function Figure({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | null;
  sub: string;
}) {
  return (
    <div className="min-w-0">
      <p className="label m-0">{label}</p>
      <p className="mono text-[1.25rem] leading-none mt-1.5 m-0">{formatGBP(value)}</p>
      <p className="text-[0.68rem] text-[var(--faint)] mt-1 m-0">{sub}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <span className="label">{label}</span>
      {children}
    </span>
  );
}
