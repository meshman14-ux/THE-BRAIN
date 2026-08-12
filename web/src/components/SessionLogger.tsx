"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DailyPlan, Exercise } from "@/lib/hybrid";

type Logged = { exercise_id: string; amount: number; load_kg: number; rir: number | null };

/**
 * The logger.
 *
 * One set at a time, written the moment it is tapped — a session logged at
 * the end is a session logged from memory, and the RIR is the first thing
 * memory rounds off. The workout row is created lazily by the FIRST set, so
 * opening the page and walking away leaves nothing behind.
 *
 * Every field can be skipped. RIR especially: an unlogged RIR is null, not
 * zero, and the engine deliberately still counts that set as hard work,
 * because punishing incomplete logging just stops the logging.
 */
export default function SessionLogger({
  plan,
  library,
  workoutId,
  logged,
  today,
}: {
  plan: DailyPlan;
  library: Record<string, Pick<Exercise, "id" | "name" | "unit" | "cues">>;
  /** An existing workout for today, if the session was already started. */
  workoutId: string | null;
  logged: Logged[];
  today: string;
}) {
  const [wid, setWid] = useState(workoutId);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const doneFor = (id: string) => logged.filter((l) => l.exercise_id === id);

  /** The workout row, created on the first set and never before it. */
  async function ensureWorkout(): Promise<string | null> {
    if (wid) return wid;
    const { data, error } = await supabase
      .from("workouts")
      .insert({ on_date: today, kind: plan.kind })
      .select("id")
      .single();
    if (error || !data) {
      setErr("Could not start the session — try again.");
      return null;
    }
    setWid(data.id);
    return data.id;
  }

  async function logSet(
    exercise_id: string,
    amount: number,
    load_kg: number,
    rir: number | null
  ) {
    setBusy(true);
    setErr("");
    const id = await ensureWorkout();
    if (!id) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("training_sets").insert({
      workout_id: id,
      exercise_id,
      amount,
      load_kg,
      rir,
      sort_order: logged.length + 1,
    });
    setBusy(false);
    if (error) {
      setErr("That set did not save — try again.");
      return;
    }
    router.refresh();
  }

  /** Close the session: the RPE and the clock, both optional. */
  async function finish(minutes: number | null) {
    if (!wid) return;
    setBusy(true);
    await supabase
      .from("workouts")
      .update({ rpe, minutes })
      .eq("id", wid);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {err && <p className="text-[0.78rem] text-[var(--bad)]">⚠ {err}</p>}

      {plan.blocks.map((block) => (
        <section key={block.kind + block.title} className="panel grid gap-2.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="label">{block.kind}</p>
            <h3 className="text-[0.95rem] font-semibold">{block.title}</h3>
          </div>
          <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
            {block.why}
          </p>

          {block.items.map((item) => {
            const ex = library[item.exercise_id];
            if (!ex) return null;
            const done = doneFor(ex.id);
            const isOpen = open === ex.id;
            return (
              <div
                key={ex.id}
                className="rounded-[10px] border border-[var(--border)] px-3 py-2.5 grid gap-1.5"
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[0.86rem] font-medium">{ex.name}</span>
                  <span className="mono text-[0.7rem] text-[var(--muted)]">
                    {item.sets} × {item.target.min}–{item.target.max}{" "}
                    {item.target.unit === "seconds" ? "s" : item.target.unit}
                    {item.rir != null ? ` @ ${item.rir} RIR` : ""}
                  </span>
                  <span
                    className="mono text-[0.7rem] ml-auto"
                    style={{
                      color: done.length >= item.sets ? "var(--good)" : "var(--faint)",
                    }}
                  >
                    {done.length}/{item.sets}
                  </span>
                </div>

                {item.note && (
                  <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
                    {item.note}
                  </p>
                )}

                {done.length > 0 && (
                  <p className="mono text-[0.68rem] text-[var(--muted)]">
                    {done
                      .map(
                        (d) =>
                          `${d.amount}${item.target.unit === "seconds" ? "s" : ""}${
                            d.load_kg !== 0 ? ` +${d.load_kg}kg` : ""
                          }${d.rir != null ? ` @${d.rir}` : ""}`
                      )
                      .join(" · ")}
                  </p>
                )}

                {isOpen ? (
                  <SetEntry
                    unit={item.target.unit}
                    suggested={item.target.max}
                    busy={busy}
                    cues={ex.cues}
                    onCancel={() => setOpen(null)}
                    onLog={(amount, load, rir) => {
                      void logSet(ex.id, amount, load, rir);
                      setOpen(null);
                    }}
                  />
                ) : (
                  <button
                    className="chip self-start"
                    disabled={busy}
                    onClick={() => setOpen(ex.id)}
                  >
                    Log a set
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}

      {/* -- closing the session -------------------------------------- */}
      {wid && (
        <section className="panel grid gap-2.5">
          <p className="label">Close the session</p>
          <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
            How hard was the whole thing, taken about half an hour after? RPE
            × minutes is what prices this session against your last month —
            skip it and the session still counts, it just cannot be compared.
          </p>
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className="chip mono w-9 justify-center px-0 text-center"
                data-active={rpe === n}
                disabled={busy}
                onClick={() => setRpe(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            {[30, 45, 60, 75, 90].map((m) => (
              <button
                key={m}
                className="chip"
                disabled={busy || rpe == null}
                onClick={() => void finish(m)}
              >
                {m} min
              </button>
            ))}
            <button
              className="text-[0.72rem] text-[var(--faint)] ml-auto"
              disabled={busy}
              onClick={() => void finish(null)}
            >
              save without the clock
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One set, entered in as few taps as possible.
 *
 * The amount is pre-filled with the top of today's target range, because
 * that is the number most often correct and a wrong prefill is one tap to
 * fix. Load defaults to bodyweight-only; RIR is genuinely optional.
 */
function SetEntry({
  unit,
  suggested,
  busy,
  cues,
  onLog,
  onCancel,
}: {
  unit: string;
  suggested: number;
  busy: boolean;
  cues: string[];
  onLog: (amount: number, load: number, rir: number | null) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(suggested));
  const [load, setLoad] = useState("0");
  const [rir, setRir] = useState<number | null>(null);

  const n = Number(amount);
  const l = Number(load);
  const valid = Number.isFinite(n) && n > 0 && Number.isFinite(l);

  return (
    <div className="grid gap-2 rounded-[8px] border border-dashed border-[var(--border-bright)] p-2.5">
      {cues.length > 0 && (
        <p className="text-[0.68rem] text-[var(--faint)] leading-relaxed">
          {cues[0]}
        </p>
      )}
      <div className="flex gap-2 flex-wrap items-end">
        <label className="grid gap-1">
          <span className="label">{unit === "seconds" ? "Seconds" : unit}</span>
          <input
            className="input mono"
            style={{ width: "5.5rem" }}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className="label">Added kg</span>
          <input
            className="input mono"
            style={{ width: "5.5rem" }}
            inputMode="decimal"
            value={load}
            onChange={(e) => setLoad(e.target.value)}
          />
        </label>
      </div>
      <div>
        <span className="label">Reps in reserve — optional</span>
        <div className="flex gap-1 flex-wrap mt-1">
          {[0, 1, 2, 3, 4].map((r) => (
            <button
              key={r}
              className="chip mono w-8 justify-center px-0 text-center"
              data-active={rir === r}
              onClick={() => setRir(rir === r ? null : r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <button
          className="btn"
          disabled={busy || !valid}
          onClick={() => onLog(n, l, rir)}
        >
          Log it
        </button>
        <button
          className="text-[0.74rem] text-[var(--faint)]"
          onClick={onCancel}
        >
          cancel
        </button>
      </div>
    </div>
  );
}
