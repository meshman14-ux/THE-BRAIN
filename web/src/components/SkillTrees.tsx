"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MASTERY_LABEL,
  type Mastery,
  type SkillNode,
  type SkillTree,
} from "@/lib/hybrid";
import HudPanel from "@/components/hud/HudPanel";

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

/* ------------------------------------------------------------------ *
 * Layout — a real DAG position, not an illustration
 *
 * `depth(node)` is the longest path back to a root (a node with no
 * `requires`), so a node that converges from two different lines — the
 * whole reason these are trees and not ladders — sits at the depth of
 * its HARDEST prerequisite rather than its easiest. Nodes at the same
 * depth stack vertically; there is no attempt to avoid edge crossings
 * beyond that, because the honest picture of a converging tree has some.
 * ------------------------------------------------------------------ */
type Positioned = NodeView & { x: number; y: number };

const SPACING_X = 150;
const SPACING_Y = 96;
const MARGIN_X = 74;
const MARGIN_Y = 46;

function layout(nodes: NodeView[]): { positioned: Positioned[]; width: number; height: number } {
  const byId = new Map(nodes.map((n) => [n.node.id, n]));
  const cache = new Map<string, number>();
  function depthOf(id: string, seen: Set<string>): number {
    if (cache.has(id)) return cache.get(id)!;
    if (seen.has(id)) return 0; // a cycle would be a data error, not a crash
    const n = byId.get(id);
    if (!n || n.node.requires.length === 0) {
      cache.set(id, 0);
      return 0;
    }
    const d = 1 + Math.max(...n.node.requires.map((r) => depthOf(r, new Set(seen).add(id))));
    cache.set(id, d);
    return d;
  }

  const withDepth = nodes.map((n) => ({ n, depth: depthOf(n.node.id, new Set()) }));
  const maxDepth = Math.max(0, ...withDepth.map((x) => x.depth));
  const byDepth = new Map<number, typeof withDepth>();
  for (const x of withDepth) byDepth.set(x.depth, [...(byDepth.get(x.depth) ?? []), x]);

  let maxRows = 1;
  const positioned: Positioned[] = [];
  for (const [d, arr] of byDepth) {
    maxRows = Math.max(maxRows, arr.length);
    arr.forEach((x, i) => {
      positioned.push({ ...x.n, x: MARGIN_X + d * SPACING_X, y: MARGIN_Y + i * SPACING_Y });
    });
  }

  return {
    positioned,
    width: MARGIN_X * 2 + maxDepth * SPACING_X,
    height: MARGIN_Y * 2 + Math.max(0, maxRows - 1) * SPACING_Y,
  };
}

/**
 * The four skill trees, drawn as constellations — one starmap per tree
 * rather than one combined map, so each tree's own DAG lays out cleanly
 * whatever its shape. Mastery is never edited directly — it is derived
 * from the attempt log on the server every time this page loads; the
 * only write this component can make is logging a new attempt.
 */
export default function SkillTrees({
  trees,
  today,
}: {
  trees: TreeView[];
  today: string;
}) {
  const [open, setOpen] = useState<{ treeId: string; nodeId: string } | null>(null);
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function logAttempt(nodeId: string, amount: number, strict: boolean) {
    setBusy(true);
    setErr("");
    const { error } = await supabase
      .from("skill_attempts")
      .upsert(
        { node_id: nodeId, on_date: today, amount, strict },
        { onConflict: "user_id,node_id,on_date" }
      );
    setBusy(false);
    setLogging(false);
    if (error) {
      setErr("That attempt did not save — try again.");
      return;
    }
    router.refresh();
  }

  async function toggleFocus(treeId: string, focused: boolean) {
    setBusy(true);
    const { data } = await supabase.from("athlete_profile").select("focus_skills").maybeSingle();
    const held: string[] = data?.focus_skills ?? [];
    const next = focused ? held.filter((t) => t !== treeId) : [...new Set([...held, treeId])];
    await supabase.from("athlete_profile").upsert({ focus_skills: next }, { onConflict: "user_id" });
    setBusy(false);
    router.refresh();
  }

  const openView = open && trees.find((t) => t.tree.id === open.treeId)?.nodes.find((n) => n.node.id === open.nodeId);
  const openTree = open && trees.find((t) => t.tree.id === open.treeId);

  return (
    <div className="grid gap-5" style={{ position: "relative" }}>
      {err && <p className="text-[0.78rem] text-[var(--bad)]">⚠ {err}</p>}

      {trees.map((t) => {
        const { positioned, width, height } = layout(t.nodes);
        return (
          <HudPanel key={t.tree.id} serial={`CONST.${t.tree.id.slice(0, 3).toUpperCase()}`}>
            <div className="flex items-baseline gap-2 flex-wrap" style={{ marginBottom: 4 }}>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 600 }}>{t.tree.name}</h2>
              <span className="mono" style={{ fontSize: 12, color: "rgba(214,239,255,.6)" }}>
                {t.owned}/{t.of} rungs
              </span>
              <button
                className="chip ml-auto"
                data-active={t.focused}
                disabled={busy}
                onClick={() => void toggleFocus(t.tree.id, t.focused)}
                title={t.focused ? "Stop working this one — nothing is lost" : "Work this one. Two at a time is about the ceiling."}
              >
                {t.focused ? "In focus" : "Work this"}
              </button>
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={`${t.tree.name} skill tree`}>
              {t.nodes.flatMap((n) =>
                n.node.requires.map((reqId) => {
                  const a = positioned.find((p) => p.node.id === reqId);
                  const b = positioned.find((p) => p.node.id === n.node.id);
                  if (!a || !b) return null;
                  const lit = (a.mastery === "owned" || a.mastery === "testing") && n.mastery !== "locked";
                  const mx = (a.x + b.x) / 2;
                  const my = (a.y + b.y) / 2 - 12;
                  return (
                    <path
                      key={`${reqId}-${n.node.id}`}
                      className="hud-edge"
                      data-lit={lit}
                      d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
                    />
                  );
                })
              )}

              {positioned.map((n) => {
                const isEdge = t.edgeIds.includes(n.node.id);
                const R = 21;
                return (
                  <g
                    key={n.node.id}
                    className="hud-node"
                    data-m={n.mastery}
                    data-edge={isEdge}
                    data-locked={n.mastery === "locked"}
                    tabIndex={0}
                    role="button"
                    aria-label={`${n.node.name}, ${MASTERY_LABEL[n.mastery]}`}
                    onClick={() => setOpen({ treeId: t.tree.id, nodeId: n.node.id })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen({ treeId: t.tree.id, nodeId: n.node.id });
                      }
                    }}
                  >
                    <circle className="hud-hitring" cx={n.x} cy={n.y} r={R + 8} fill="transparent" stroke="transparent" />
                    <circle className="c" cx={n.x} cy={n.y} r={R} strokeWidth={1.5} />
                    {n.mastery === "working" && isEdge && (
                      <circle
                        className="hud-progring"
                        cx={n.x}
                        cy={n.y}
                        r={R + 5}
                        strokeDasharray={`${((2 * Math.PI * (R + 5)) * n.qualifying) / Math.max(1, n.needed)} ${2 * Math.PI * (R + 5)}`}
                        transform={`rotate(-90 ${n.x} ${n.y})`}
                      />
                    )}
                    {n.mastery === "testing" && (
                      <circle cx={n.x} cy={n.y} r={R + 5} fill="none" stroke="rgba(79,195,247,.7)" strokeWidth={1.5} />
                    )}
                    {n.mastery === "owned" && <circle cx={n.x} cy={n.y} r={5} fill="var(--hud-core)" />}
                    <text x={n.x} y={n.y + R + 20}>
                      {n.node.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </HudPanel>
        );
      })}

      <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", fontSize: 11 }} className="mono">
        <span><span style={{ color: "var(--hud-core)" }}>●</span> OWNED</span>
        <span><span style={{ color: "var(--hud-cyan)" }}>◉</span> TESTING</span>
        <span><span style={{ color: "var(--hud-core)" }}>◐</span> WORKING</span>
        <span style={{ opacity: 0.5 }}><span>○</span> LOCKED</span>
      </div>

      {/* -- the drawer -------------------------------------------------- */}
      <aside className="hud-drawer" data-open={open != null} aria-label="Skill detail" aria-hidden={open == null}>
        {open && openView && openTree && (
          <>
            <button
              onClick={() => {
                setOpen(null);
                setLogging(false);
              }}
              aria-label="Close drawer"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "transparent",
                border: "1px solid var(--hud-hair)",
                color: "var(--hud-cyan)",
                width: 26,
                height: 26,
                cursor: "pointer",
              }}
            >
              ×
            </button>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "var(--hud-cyan)" }}>
              {MASTERY_LABEL[openView.mastery].toUpperCase()}
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.14em", color: "var(--hud-core)", marginTop: 2 }}>
              {openView.node.name}
            </h3>

            <div style={{ marginTop: 16 }}>
              <p className="lbl">Standard</p>
              <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 4 }}>
                {openView.node.standard.hold_s != null ? `${openView.node.standard.hold_s}s hold` : `${openView.node.standard.reps} reps`}
                {" — "}
                {openView.qualifying}/{openView.needed} qualifying days.
              </p>
            </div>

            {openView.node.requires.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p className="lbl">Requires (all of these)</p>
                <ul style={{ listStyle: "none", padding: 0, marginTop: 6 }}>
                  {openView.node.requires.map((r) => {
                    const dep = openTree.nodes.find((x) => x.node.id === r);
                    const met = dep?.mastery === "owned";
                    return (
                      <li key={r} style={{ fontSize: 13, padding: "3px 0", color: met ? "rgba(214,239,255,.6)" : "var(--hud-orange)" }}>
                        {met ? "✓" : "○"} {dep?.node.name ?? r}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <p className="lbl">Form criteria</p>
              <ul style={{ listStyle: "none", padding: 0, marginTop: 6 }}>
                {openView.node.standard.form.map((f, i) => (
                  <li key={i} style={{ display: "flex", gap: 8, fontSize: 13, padding: "3px 0", color: "rgba(214,239,255,.85)" }}>
                    <span className="mono" style={{ color: "var(--hud-cyan)" }}>[ ]</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {openView.node.note && (
              <p style={{ marginTop: 16, fontSize: 12, color: "rgba(214,239,255,.55)", lineHeight: 1.5, fontStyle: "italic" }}>
                {openView.node.note}
              </p>
            )}

            <div style={{ marginTop: 16 }}>
              {logging ? (
                <AttemptEntry
                  unit={openView.node.standard.hold_s != null ? "seconds" : "reps"}
                  suggested={openView.node.standard.hold_s ?? openView.node.standard.reps ?? 1}
                  busy={busy}
                  onCancel={() => setLogging(false)}
                  onLog={(amount, strict) => void logAttempt(openView.node.id, amount, strict)}
                />
              ) : (
                openView.mastery !== "locked" && (
                  <button className="btn" onClick={() => setLogging(true)}>
                    [ LOG ATTEMPT ]
                  </button>
                )
              )}
            </div>
          </>
        )}
      </aside>
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
