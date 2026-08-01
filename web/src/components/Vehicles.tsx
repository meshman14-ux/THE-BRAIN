"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type DeadlineState,
  type Vehicle,
  type VehicleDateKey,
  DEADLINE_LABEL,
  VEHICLE_DATE_KEYS,
  VEHICLE_DATE_LABEL,
} from "@/lib/types";
import { sortVehicles, vehicleDeadlines, vehicleWorstState } from "@/lib/logic";

/**
 * The vehicles board.
 *
 * Worst first, and scrupulous about the difference between "lapsed" and
 * "nobody has told me yet". A reminder system that cries wolf about a date it
 * was never given is worse than no reminder system at all, so an unrecorded
 * date renders as a prompt to fill it in — never as a warning, never as fine.
 */

const STATE_COLOUR: Record<DeadlineState, string> = {
  overdue: "var(--bad)",
  due_soon: "var(--warn)",
  ok: "var(--good)",
  not_recorded: "var(--faint)",
};

export default function Vehicles({
  vehicles,
  today,
}: {
  vehicles: Vehicle[];
  today: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function setDate(id: string, key: VehicleDateKey, value: string) {
    setBusy(`${id}:${key}`);
    setErr("");
    const { error } = await supabase
      .from("vehicles")
      .update({ [key]: value || null })
      .eq("id", id);
    setBusy(null);
    if (error) setErr(error.message);
    else router.refresh();
  }

  if (vehicles.length === 0) {
    return (
      <div className="card p-6 max-w-[60ch]">
        <p className="font-semibold text-[0.95rem] m-0">No vehicles yet</p>
        <p className="text-[0.85rem] text-[var(--muted)] mt-2 leading-relaxed m-0">
          Tax, MOT and insurance are hard deadlines with real consequences, and
          they are the easiest thing in a busy life to lose track of. Add a
          vehicle and the dates start watching themselves.
        </p>
      </div>
    );
  }

  const ordered = sortVehicles(vehicles, today);

  return (
    <div className="grid gap-3">
      {err && (
        <p className="text-[0.82rem] m-0" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}

      {ordered.map((v) => {
        const worst = vehicleWorstState(v, today);
        const deadlines = vehicleDeadlines(v, today);
        const inactive = v.status !== "active";
        return (
          <section key={v.id} className="card p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-semibold text-[1.02rem] m-0">{v.name}</h2>
              {v.registration && (
                <span className="mono text-[0.78rem] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)]">
                  {v.registration}
                </span>
              )}
              {inactive && (
                <span className="text-[0.7rem] uppercase tracking-wide text-[var(--faint)]">
                  {v.status}
                </span>
              )}
              <span
                className="ml-auto text-[0.72rem] font-semibold"
                style={{ color: STATE_COLOUR[worst] }}
              >
                {DEADLINE_LABEL[worst]}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
              {deadlines.map((d) => {
                const key = `${v.id}:${d.key}`;
                return (
                  <div key={d.key}>
                    <label
                      className="label block"
                      htmlFor={key}
                      style={{ color: STATE_COLOUR[d.state] }}
                    >
                      {VEHICLE_DATE_LABEL[d.key]}
                    </label>
                    <input
                      id={key}
                      type="date"
                      className="input mt-1.5 text-[0.85rem]"
                      value={d.date ?? ""}
                      disabled={busy === key}
                      onChange={(e) => setDate(v.id, d.key, e.target.value)}
                    />
                    <p className="text-[0.72rem] mt-1 m-0 text-[var(--muted)]">
                      {d.state === "not_recorded"
                        ? "Not recorded"
                        : d.days == null
                          ? ""
                          : d.days < 0
                            ? `${Math.abs(d.days)} days ago`
                            : d.days === 0
                              ? "Today"
                              : `in ${d.days} days`}
                    </p>
                  </div>
                );
              })}
            </div>

            {v.notes && (
              <p className="text-[0.8rem] text-[var(--muted)] mt-3 leading-relaxed m-0">
                {v.notes}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export { STATE_COLOUR };
