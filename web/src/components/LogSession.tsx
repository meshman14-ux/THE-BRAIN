"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  KIND_LABEL,
  SESSION_KINDS,
  type Restart,
  type SessionKind,
  kindLabel,
  logLabel,
  restartLine,
} from "@/lib/restart";
import { Panel } from "@/components/ui";

/**
 * One tap logs a session.
 *
 * `workouts` has never held a row. Everything built for it so far assumed
 * the data would arrive from a watch — HYBRID's readiness, the set-by-set
 * logger, the skill trees — and the watch is not connected. So this is the
 * rung underneath all of it: a button that writes a row and asks nothing.
 *
 * THE KIND IS OPTIONAL AND THE BUTTON DOES NOT WAIT FOR IT. Tapping the
 * main button logs `other` immediately; the four kind chips are a second,
 * equal way in, not a required first step. That is decision 12 — a floor
 * that costs nothing, a ceiling that is always present and never demanded
 * — applied to the one module that had no floor at all.
 *
 * Idempotence is deliberately NOT enforced here. `people_contacts` and
 * `habit_logs` are unique per day because a second tap is a mis-tap; two
 * sessions in one day is a real thing that happens and must not silently
 * become one. Undo covers the mis-tap instead.
 */
export default function LogSession({
  state,
  today,
}: {
  state: Restart;
  today: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justLogged, setJustLogged] = useState<string | null>(null);

  async function log(kind: SessionKind) {
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase
      .from("workouts")
      .insert({ on_date: today, kind })
      .select("id")
      .single();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setJustLogged(data?.id ?? null);
    router.refresh();
  }

  /**
   * Undo, and it stays available rather than vanishing after a moment.
   * A logger with no undo is a logger you hesitate before using, and
   * hesitation is the entire thing this component exists to remove.
   */
  async function undo(id: string) {
    setBusy(true);
    const { error: err } = await supabase.from("workouts").delete().eq("id", id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setJustLogged(null);
    router.refresh();
  }

  return (
    <Panel
      title="Training"
      hint={state.stage === "cold" ? "nothing logged yet" : undefined}
    >
      <div className="grid gap-3">
        <p className="text-[0.85rem] text-[var(--muted)] leading-relaxed m-0">
          {restartLine(state)}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="btn"
            disabled={busy}
            onClick={() => void log("other")}
          >
            {logLabel(state)}
          </button>
          {justLogged && (
            <button
              className="chip"
              disabled={busy}
              onClick={() => void undo(justLogged)}
            >
              Undo
            </button>
          )}
        </div>

        {/* Not a follow-up question — a second door. Each of these logs
            immediately, so naming the kind costs the same one tap as not
            naming it. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="label">or say what it was</span>
          {SESSION_KINDS.filter((k) => k !== "other").map((k) => (
            <button key={k} className="chip" disabled={busy} onClick={() => void log(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-[0.72rem] m-0" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}

        {/* The floor is named ONLY when `showFloor` says so. The rule lives
            in restart.ts and the component obeys it rather than deciding
            for itself — "0 of 4" on a page opened at zero is four failures
            before breakfast, which is the argument that took the habit
            board from six tracked habits down to one. */}
        {state.showFloor && state.perWeek != null && (
          <p className="text-[0.72rem] text-[var(--faint)] m-0">
            {state.recent} in the last fortnight · {state.perWeek} a week
          </p>
        )}
      </div>
    </Panel>
  );
}

/** The recent sessions, as a plain list. No streak, no chart, no grade. */
export function RecentSessions({
  sessions,
}: {
  sessions: { id: string; on_date: string; kind: string }[];
}) {
  if (sessions.length === 0) return null;
  return (
    <ul className="grid gap-1.5 list-none p-0 m-0">
      {sessions.map((s) => (
        // `min-w-0` on the row, beside the truncate — a nowrap child
        // contributes its whole string to the track's min-content.
        <li
          key={s.id}
          className="min-w-0 flex items-baseline gap-2 text-[0.78rem] text-[var(--muted)]"
        >
          <span className="mono text-[var(--faint)] shrink-0">{s.on_date}</span>
          <span className="truncate">{kindLabel(s.kind)}</span>
        </li>
      ))}
    </ul>
  );
}
