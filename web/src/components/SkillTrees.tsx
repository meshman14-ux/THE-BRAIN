"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MASTERY_LABEL,
  type Mastery,
  type SkillNode,
  type SkillTree,
  type SkillState,
} from "@/lib/hybrid";

export type NodeView = {
  node: SkillNode;
  mastery: Mastery;
  /** Distinct qualifying days so far, and how many the standard needs. */
  qualifying: number;
  needed: number;
  exerciseName: string;
};

export type TreeView = {
  tree: SkillTree;
  nodes: NodeView[];
  owned: number;
  of: number;
  percent: number;
  /** Unlocked and not yet owned — what is actually worth practising. */
  edgeIds: string[];
  focused: boolean;
};

const TONE: Record<Mastery, string> = {
  owned: "var(--good)",
  working: "var(--accent)",
  testing: "var(--warn)",
  locked: "var(--faint)",
};

/**
 * The four trees.
 *
 * A tree is shown as a DAG rather than a list, which in practice means each
 * node names what it requires: a tuck front lever needs scapular strength
 * AND a hollow body, and neither is downstream of the other. Rendering it
 * as a numbered ladder would imply a sequence that does not exist and send
 * someone grinding rung four when the missing piece is off to the side.
 *
 * Mastery is never edited directly — it is derived from the attempt log on
 * the server every time this page loads. The only thing this component can
 * do is add an attempt, which is exactly the point: a flag you can set by
 * hand is a claim that quietly stops being true.
 */
export default function SkillTrees({
  trees,
  today,
}: {
  trees: TreeView[];
  today: string;
}) {
  const [logging, setLogging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function logAttempt(nodeId: string, amount: number, strict: boolean) {
    setBusy(true);
    setErr("");
    // One attempt per node per day, enforced by the unique index too:
    // three good sets in one session is one good session.
    const { error } = await supabase
      .from("skill_attempts")
      .upsert(
        { node_id: nodeId, on_date: today, amount, strict },
        { onConflict: "user_id,node_id,on_date" }
      );
    setBusy(false);
    setLogging(null);
    if (error) {
      setErr("That attempt did not save — try again.");
      return;
    }
    router.refresh();
  }

  async function toggleFocus(treeId: string, focused: boolean) {
    setBusy(true);
    const { data } = await supabase
      .from("athlete_profile")
      .select("focus_skills")
      .maybeSingle();
    const held: string[] = data?.focus_skills ?? [];
    const next = focused
      ? held.filter((t) => t !== treeId)
      : [...new Set([...held, treeId])];
    await supabase
      .from("athlete_profile")
      .upsert({ focus_skills: next }, { onConflict: "user_id" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {err && <p className="text-[0.78rem] text-[var(--bad)]">⚠ {err}</p>}

      {trees.map((t) => (
        <section key={t.tree.id} className="panel grid gap-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-[1.05rem] font-semibold">{t.tree.name}</h2>
            <span className="mono text-[0.72rem] text-[var(--muted)]">
              {t.owned}/{t.of} rungs
            </span>
            <button
              className="chip ml-auto"
              data-active={t.focused}
              disabled={busy}
              onClick={() => void toggleFocus(t.tree.id, t.focused)}
              title={
                t.focused
                  ? "Stop working this one — it stays where it is, nothing is lost"
                  : "Work this one. Two at a time is about the ceiling."
              }
            >
              {t.focused ? "In focus" : "Work this"}
            </button>
          </div>

          <div
            className="h-[6px] rounded-full overflow-hidden"
            style={{ background: "var(--bg-2)" }}
          >
            <div
              className="h-full fill"
              data-tone={t.percent === 100 ? "good" : undefined}
              style={{ width: `${t.percent}%` }}
            />
          </div>

          <div className="grid gap-1.5">
            {t.nodes.map((n) => {
              const isEdge = t.edgeIds.includes(n.node.id);
              const isLogging = logging === n.node.id;
              return (
                <div
                  key={n.node.id}
                  className="rounded-[10px] border px-3 py-2.5 grid gap-1.5"
                  style={{
                    borderColor: isEdge ? "var(--accent)" : "var(--border)",
                    background: n.mastery === "owned" ? "var(--bg-2)" : "transparent",
                    opacity: n.mastery === "locked" ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className="text-[0.86rem] font-medium"
                      style={{
                        textDecoration:
                          n.mastery === "owned" ? "line-through" : "none",
                      }}
                    >
                      {n.node.name}
                    </span>
                    <span
                      className="mono text-[0.62rem] uppercase tracking-[0.08em]"
                      style={{ color: TONE[n.mastery] }}
                    >
                      {MASTERY_LABEL[n.mastery]}
                    </span>
                    {isEdge && (
                      <span
                        className="mono text-[0.62rem] uppercase tracking-[0.08em]"
                        style={{ color: "var(--accent)" }}
                      >
                        · work here
                      </span>
                    )}
                    <span className="mono text-[0.68rem] text-[var(--faint)] ml-auto">
                      {n.node.standard.hold_s != null
                        ? `${n.node.standard.hold_s}s`
                        : `${n.node.standard.reps} reps`}
                      {" × "}
                      {n.qualifying}/{n.needed} days
                    </span>
                  </div>

                  {n.node.requires.length > 0 && (
                    <p className="text-[0.66rem] text-[var(--faint)]">
                      needs{" "}
                      {n.node.requires
                        .map(
                          (r) =>
                            t.nodes.find((x) => x.node.id === r)?.node.name ?? r
                        )
                        .join(" + ")}
                    </p>
                  )}

                  {/* Form criteria are the standard. A hold time without them
                      is how a 20-second tuck lever becomes a 20-second slouch. */}
                  {(isEdge || isLogging) && (
                    <ul className="pl-4 list-disc text-[0.72rem] leading-relaxed text-[var(--muted)]">
                      {n.node.standard.form.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}

                  {n.node.note && isEdge && (
                    <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed italic">
                      {n.node.note}
                    </p>
                  )}

                  {isLogging ? (
                    <AttemptEntry
                      unit={n.node.standard.hold_s != null ? "seconds" : "reps"}
                      suggested={n.node.standard.hold_s ?? n.node.standard.reps ?? 1}
                      busy={busy}
                      onCancel={() => setLogging(null)}
                      onLog={(amount, strict) =>
                        void logAttempt(n.node.id, amount, strict)
                      }
                    />
                  ) : (
                    n.mastery !== "locked" && (
                      <button
                        className="chip self-start"
                        disabled={busy}
                        onClick={() => setLogging(n.node.id)}
                      >
                        {n.mastery === "owned" ? "Log again" : "Log an attempt"}
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One attempt, with the honesty question attached.
 *
 * `strict` is the whole standard. An attempt logged as strict when it was
 * not is the athlete lying to himself through a database, so the button
 * says exactly what it is claiming and the sloppy option is equally easy
 * to press — a soft attempt is still worth recording as practice.
 */
function AttemptEntry({
  unit,
  suggested,
  busy,
  onLog,
  onCancel,
}: {
  unit: "seconds" | "reps";
  suggested: number;
  busy: boolean;
  onLog: (amount: number, strict: boolean) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(suggested));
  const n = Number(amount);
  const valid = Number.isFinite(n) && n > 0;

  return (
    <div className="grid gap-2 rounded-[8px] border border-dashed border-[var(--border-bright)] p-2.5">
      <label className="grid gap-1">
        <span className="label">Best {unit === "seconds" ? "hold" : "set"}</span>
        <input
          className="input mono"
          style={{ width: "6rem" }}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <div className="flex gap-2 flex-wrap items-center">
        <button
          className="btn"
          disabled={busy || !valid}
          onClick={() => onLog(n, true)}
        >
          Every form point met
        </button>
        <button
          className="chip"
          disabled={busy || !valid}
          onClick={() => onLog(n, false)}
        >
          Not quite
        </button>
        <button
          className="text-[0.74rem] text-[var(--faint)] ml-auto"
          onClick={onCancel}
        >
          cancel
        </button>
      </div>
      <p className="text-[0.66rem] text-[var(--faint)] leading-relaxed">
        Only a strict attempt counts toward the standard, and it has to
        happen on separate days — three good sets in one session is one good
        session.
      </p>
    </div>
  );
}
