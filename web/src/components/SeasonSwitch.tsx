"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  SEASON_ICON,
  SEASON_KINDS,
  SEASON_LABEL,
  SEASON_MEANING,
  type SeasonKind,
  expectationsFor,
} from "@/lib/season";

/**
 * One control, three positions.
 *
 * Switching a season is not a setting — it is a period ending and another
 * beginning, so the write closes the open row and opens a new one. That
 * keeps the history, which is the point: in November the system can say
 * "September was busy" instead of judging September by October's standards.
 *
 * Minimum mode lives on the same switch rather than beside it, because two
 * controls would mean a state you can be in without having chosen it — and
 * the entire value of minimum mode is that it is DECLARED.
 */
export default function SeasonSwitch({
  current,
  daysIn,
}: {
  current: SeasonKind;
  /** Days the current season has run, or null if never declared. */
  daysIn: number | null;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function choose(kind: SeasonKind) {
    if (kind === current) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setErr("");
    const today = new Date().toISOString().slice(0, 10);

    // Close the open season first. The unique index means a failure here
    // would block the insert anyway, so an error must stop the whole move
    // rather than leave two open rows or none.
    const { error: closeErr } = await supabase
      .from("seasons")
      .update({ ended_on: today })
      .is("ended_on", null);
    if (closeErr) {
      setBusy(false);
      setErr("Could not close the current season — nothing was changed.");
      return;
    }

    const { error } = await supabase
      .from("seasons")
      .insert({ kind, started_on: today });
    setBusy(false);
    if (error) {
      setErr("The season did not change. Try again.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const exp = expectationsFor(current);

  return (
    <div className="panel">
      <div className="flex items-baseline gap-3 flex-wrap">
        <p className="label">Season</p>
        <p className="text-[0.86rem] font-semibold">
          {SEASON_ICON[current]} {SEASON_LABEL[current]}
          <span className="text-[var(--faint)] font-normal">
            {daysIn == null ? " · not yet declared" : ` · day ${daysIn + 1}`}
          </span>
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="chip ml-auto"
          aria-expanded={open}
        >
          {open ? "Close" : "Change"}
        </button>
      </div>

      <p className="text-[0.76rem] text-[var(--muted)] mt-2 leading-relaxed">
        {SEASON_MEANING[current]}
      </p>

      <div className="flex gap-3 flex-wrap mt-3 text-[0.7rem] text-[var(--faint)]">
        <span>
          Active ventures: <b className="mono">{exp.activeVentureSlots}</b>
        </span>
        <span>
          Focus slots: <b className="mono">{exp.focusSlots}</b>
        </span>
        <span>Floor: {exp.floor.join(" · ")}</span>
      </div>

      {open && (
        <div className="grid gap-2 mt-4 pt-3 border-t border-[var(--border)]">
          {SEASON_KINDS.map((k) => {
            const on = k === current;
            return (
              <button
                key={k}
                disabled={busy}
                onClick={() => choose(k)}
                className="text-left rounded-[9px] border px-3.5 py-3 cursor-pointer"
                style={{
                  borderColor: on ? "var(--accent)" : "var(--border)",
                  background: on ? "var(--accent-soft)" : "var(--card)",
                }}
              >
                <p className="text-[0.86rem] font-semibold">
                  {SEASON_ICON[k]} {SEASON_LABEL[k]}
                  {on && (
                    <span
                      className="text-[0.66rem] font-bold ml-2"
                      style={{ color: "var(--accent)" }}
                    >
                      NOW
                    </span>
                  )}
                </p>
                <p className="text-[0.74rem] text-[var(--muted)] mt-1 leading-relaxed">
                  {SEASON_MEANING[k]}
                </p>
              </button>
            );
          })}
          <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
            Changing the season closes the current one and starts a new one
            today, so the history is kept. Nothing is deleted and no venture
            is touched — only what the system expects of you changes.
          </p>
        </div>
      )}

      {err && (
        <p className="text-[0.76rem] mt-2" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}
    </div>
  );
}
