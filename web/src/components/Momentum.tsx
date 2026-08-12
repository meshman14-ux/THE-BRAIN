"use client";

import { useState } from "react";
import Link from "next/link";
import { type Advice, confidenceWord } from "@/lib/cog";

/* ------------------------------------------------------------------ *
 * THE COG — the Momentum card
 *
 * It sits BELOW the one line, and the split is the whole design: the one
 * line answers "what is wrong", and can legitimately say nothing is. This
 * answers "what next", which is a different question and gets a different
 * voice. Neither overwrites the other, and the one line keeps the top of
 * the card because a lapsed MOT outranks a good suggestion.
 *
 * Every recommendation here can be accepted, changed or refused, and the
 * rationale is always one tap away. That is not decoration — an advisor
 * that cannot show its working is an oracle, and refusing is the only
 * thing that makes accepting mean anything. Three refusals and it goes
 * quiet for the day, by rule.
 * ------------------------------------------------------------------ */

type Verdict = "accepted" | "modified" | "rejected";

export default function Momentum({ advice }: { advice: Advice }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { report, pulse, priorities, focusSlot, identityAlignment } = advice;

  async function send(v: Verdict) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cog/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetKind: "pulse",
          targetId: pulse.refId ?? pulse.id,
          verdict: v,
          correlationId: pulse.correlationId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not record that.");
      setVerdict(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that.");
    } finally {
      setBusy(false);
    }
  }

  const tone =
    report.band === "rolling"
      ? "var(--good)"
      : report.band === "steady"
        ? "var(--accent)"
        : "var(--warn)";

  return (
    <section className="panel">
      {/* -- the number, and what it is made of --------------------- */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="mono text-[1.7rem] font-bold leading-none" style={{ color: tone }}>
          {report.momentumIndicator}
        </span>
        <span className="text-[0.85rem] font-semibold">{BAND_WORD[report.band]}</span>
        {/* Confidence, said in words. The score already renormalises over
            present inputs so a missing sensor does not crater it — but
            that leaves a 73 built on two signals looking exactly like a 73
            built on seven. This is the part that tells them apart, and it
            never reads as certainty because the engine is modelling a
            person. */}
        <span
          className="mono text-[0.6rem] uppercase tracking-[0.12em] ml-auto"
          title={`${Math.round(report.confidence * 100)}% confidence, from ${Math.round(
            report.inputCompleteness * 100
          )}% of the usual evidence`}
          style={{
            color:
              confidenceWord(report.confidence) === "high"
                ? "var(--muted)"
                : confidenceWord(report.confidence) === "fair"
                  ? "var(--faint)"
                  : "var(--warn)",
          }}
        >
          {confidenceWord(report.confidence)} confidence
        </span>
      </div>

      {/* The missing inputs are stated, never hidden. A score built on
          four signals out of eleven is a different claim from one built
          on all eleven, and the reader is entitled to know which. */}
      {report.degraded && (
        <p className="text-[0.68rem] text-[var(--faint)] leading-relaxed mt-1.5 m-0">
          Running without {report.missingInputs.join(", ").replace(/_/g, " ")}. Weights
          renormalise over what is present — a missing sensor is not a zero.
        </p>
      )}

      {/* -- the pulse ---------------------------------------------- */}
      {pulse.kind !== "none" && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <p className="text-[0.9rem] leading-snug font-medium m-0">
            {pulse.kind === "checkin" ? (
              <Link href="/checkin" className="no-underline" style={{ color: "var(--accent)" }}>
                {pulse.message}
              </Link>
            ) : (
              pulse.message
            )}
          </p>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mono text-[0.6rem] uppercase tracking-[0.1em] text-[var(--faint)] mt-1.5 bg-transparent border-0 p-0 cursor-pointer"
          >
            {open ? "hide why" : "why"}
          </button>
          {open && (
            <p className="text-[0.74rem] text-[var(--muted)] leading-relaxed mt-1 m-0">
              {pulse.rationale}
              <span className="mono text-[0.62rem] text-[var(--faint)] ml-2">
                {pulse.ruleTrace
                  .filter((r) => r.fired)
                  .map((r) => r.ruleId)
                  .join(" · ")}
                {" · "}
                {Math.round(pulse.confidence * 100)}%
              </span>
            </p>
          )}

          {/* Refusing is a first-class answer, sitting at the same weight
              as accepting. A card where the only button agrees with it is
              a card that has stopped asking. */}
          <div className="flex items-center gap-2 mt-2.5">
            {verdict ? (
              <span className="text-[0.72rem] text-[var(--muted)]">{VERDICT_WORD[verdict]}</span>
            ) : (
              <>
                <Verb label="Do it" onClick={() => send("accepted")} busy={busy} primary />
                <Verb label="Something else" onClick={() => send("modified")} busy={busy} />
                <Verb label="Not now" onClick={() => send("rejected")} busy={busy} />
              </>
            )}
          </div>
          {error && (
            <p className="text-[0.7rem] mt-1.5 m-0" style={{ color: "var(--bad)" }}>
              {error}
            </p>
          )}
        </div>
      )}

      {/* -- the three, and the block ------------------------------- */}
      {priorities.length > 0 && (
        <ol className="mt-3 pt-3 border-t border-[var(--border)] grid gap-1.5 list-none p-0 m-0">
          {priorities.map((p) => (
            <li key={p.taskId} className="flex items-baseline gap-2.5">
              <span className="mono text-[0.62rem] font-bold w-[14px] shrink-0 text-[var(--faint)]">
                {p.rank}
              </span>
              <span className="text-[0.8rem] flex-1 min-w-0 leading-snug">
                {p.title}
                <span className="block text-[0.68rem] text-[var(--faint)] mt-0.5">
                  {p.rationale}
                  {/* Only said when it is worth saying. A ranking this
                      close is a coin toss, and announcing a coin toss in
                      the same tone as a clear winner is the failure the
                      confidence model exists to prevent. */}
                  {confidenceWord(p.confidence) === "low" && (
                    <span style={{ color: "var(--warn)" }}> — close call, your judgement.</span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {focusSlot && (
        <p className="text-[0.74rem] text-[var(--muted)] leading-relaxed mt-2.5 m-0">
          <span className="mono text-[0.68rem]">
            {focusSlot.start.slice(11, 16)}–{focusSlot.end.slice(11, 16)}
          </span>{" "}
          · {focusSlot.quality} block
          {/* Where the block came from matters: a Google-backed slot means
              he is free, a planner-backed one only means he meant to be. */}
          <span className="text-[var(--faint)]"> ({SOURCE_WORD[focusSlot.source]})</span>
        </p>
      )}

      {/* -- identity: observed, never judged ------------------------ */}
      {identityAlignment.drifts.length > 0 && (
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed mt-2.5 pt-2.5 border-t border-[var(--border)] m-0">
          {identityAlignment.drifts[0].observation}
        </p>
      )}
    </section>
  );
}

function Verb({
  label,
  onClick,
  busy,
  primary,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-[0.72rem] px-2.5 py-1 rounded-md border cursor-pointer disabled:opacity-50"
      style={{
        borderColor: primary ? "var(--accent)" : "var(--border)",
        color: primary ? "var(--accent)" : "var(--muted)",
        background: "transparent",
      }}
    >
      {label}
    </button>
  );
}

const BAND_WORD = {
  rolling: "Rolling — protect it",
  steady: "Steady",
  low: "Low — shrink the target",
} as const;

const VERDICT_WORD = {
  accepted: "On today's list.",
  modified: "Noted — you picked your own.",
  rejected: "Noted. Three of those and it goes quiet for the day.",
} as const;

const SOURCE_WORD = {
  google: "from your calendar",
  planner: "from what you pinned",
  "config-default": "your usual window",
} as const;
