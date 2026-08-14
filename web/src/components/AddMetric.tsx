"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Pillar } from "@/lib/types";
import { DEFAULT_CADENCE } from "@/lib/metrics";
import { Panel } from "@/components/ui";

/**
 * Define a metric.
 *
 * THE FLOOR IS A NAME. Unit, direction and area are all optional and all
 * changeable afterwards, because the moment worth capturing is the one
 * where he decides a number matters — asking four questions there is how
 * that moment gets postponed and then forgotten.
 *
 * Direction defaults to `up` because the column does, and it is the only
 * field a wrong default actually costs anything: a `down` metric read as
 * `up` reports progress as decline. So it is the one thing offered
 * alongside the name rather than hidden behind a disclosure.
 */
export default function AddMetric({ pillars }: { pillars: Pillar[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [pillarId, setPillarId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("A metric needs a name.");
      return;
    }
    setError("");
    setBusy(true);
    const { error: err } = await supabase.from("metrics").insert({
      name: trimmed,
      // An empty unit is NULL, never "" — a blank string would render as a
      // trailing space after every figure and read as a unit that failed.
      unit: unit.trim() === "" ? null : unit.trim(),
      direction,
      pillar_id: pillarId === "" ? null : pillarId,
      meta: { cadence: DEFAULT_CADENCE },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setName("");
    setUnit("");
    setPillarId("");
    setDirection("up");
    router.refresh();
  }

  return (
    <Panel title="New metric" hint="A number you want to watch move">
      <div className="grid gap-2.5">
        <div className="flex gap-2 flex-wrap">
          <input
            className="input min-w-0 basis-full sm:basis-0 sm:flex-1"
            placeholder="What is it called?"
            aria-label="Metric name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          <input
            className="input w-[6.5rem] shrink-0"
            placeholder="unit"
            aria-label="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="label">Good is</span>
          <button
            className="chip"
            data-active={direction === "up" ? "true" : "false"}
            aria-pressed={direction === "up"}
            onClick={() => setDirection("up")}
          >
            Up
          </button>
          <button
            className="chip"
            data-active={direction === "down" ? "true" : "false"}
            aria-pressed={direction === "down"}
            onClick={() => setDirection("down")}
          >
            Down
          </button>

          <select
            className="input ml-auto w-auto shrink-0"
            aria-label="Area"
            value={pillarId}
            onChange={(e) => setPillarId(e.target.value)}
          >
            <option value="">No area</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn" disabled={busy} onClick={() => void add()}>
            Add metric
          </button>
          {error && (
            <span className="text-[0.72rem]" style={{ color: "var(--bad)" }}>
              {error}
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}
