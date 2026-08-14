"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type DiagAnswers,
  areaTriageScore,
  bankFor,
  healthFromScore,
  scoreBasisLine,
  taskCandidates,
  ventureTriageScore,
} from "@/lib/diagnostics";

/**
 * The diagnostic runner — one question at a time, venture-onboarder
 * discipline throughout:
 *
 *   · every answer writes the moment it is given, into the run's jsonb;
 *   · skipping writes nothing — the key simply never exists, and the
 *     score's basis line owns up to it ("62 · 4 of 5 signals");
 *   · resumable forever: the run row holds the answers, so reopening
 *     lands on the first unanswered question.
 *
 * The run row is created lazily on the first answer — abandoning at
 * question one leaves no debris. On completion the score is computed
 * here (pure arithmetic from diagnostics.ts), written to the run, and —
 * for a venture triage — folded onto ventures.health. The finish screen
 * offers the text answers back as real tasks, one tap each, never
 * created automatically.
 */
export default function DiagnosticRun({
  subjectType,
  subjectId,
  subjectName,
  pillarId,
  kind,
  runId: initialRunId,
  initialAnswers,
  home,
}: {
  subjectType: "venture" | "area";
  subjectId: string;
  subjectName: string;
  /** Venture's pillar (or the area itself) so created tasks land in an area. */
  pillarId: string | null;
  kind: "triage" | "deep";
  /** An open (incomplete) run to resume, if one exists. */
  runId: string | null;
  initialAnswers: DiagAnswers;
  home: string;
}) {
  const bank = bankFor(subjectType, kind);
  const firstUnanswered = bank.findIndex((q) => initialAnswers[q.key] == null);

  const [runId, setRunId] = useState(initialRunId);
  const [answers, setAnswers] = useState<DiagAnswers>(initialAnswers);
  const [i, setI] = useState(firstUnanswered === -1 ? bank.length : firstUnanswered);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState<string[]>([]);

  const router = useRouter();
  const supabase = createClient();
  const done = i >= bank.length;
  const q = done ? null : bank[i];

  async function persist(next: DiagAnswers): Promise<boolean> {
    setErr("");
    if (runId) {
      const { error } = await supabase
        .from("diagnostic_runs")
        .update({ answers: next })
        .eq("id", runId);
      if (error) setErr("That didn't save — try again.");
      return !error;
    }
    const { data, error } = await supabase
      .from("diagnostic_runs")
      .insert({
        subject_type: subjectType,
        subject_id: subjectId,
        kind,
        answers: next,
      })
      .select("id")
      .single();
    if (error || !data) {
      setErr("That didn't save — try again.");
      return false;
    }
    setRunId(data.id);
    return true;
  }

  async function answer(value: string | number) {
    if (!q) return;
    setBusy(true);
    const next = { ...answers, [q.key]: value };
    const ok = await persist(next);
    setBusy(false);
    if (!ok) return;
    setAnswers(next);
    setDraft("");
    advance(next);
  }

  function skip() {
    setDraft("");
    advance(answers);
  }

  async function advance(current: DiagAnswers) {
    if (i + 1 < bank.length) {
      setI(i + 1);
      return;
    }
    setI(bank.length);
    await finish(current);
  }

  async function finish(current: DiagAnswers) {
    if (!runId) return; // nothing answered, nothing to close
    const s =
      subjectType === "venture"
        ? ventureTriageScore(current)
        : areaTriageScore(current);
    await supabase
      .from("diagnostic_runs")
      .update({
        completed_at: new Date().toISOString(),
        // Deep runs enrich the record; the score stays a triage instrument.
        ...(kind === "triage"
          ? { score: s.score, answered: s.answered, of_total: s.ofTotal }
          : {}),
      })
      .eq("id", runId);
    if (kind === "triage" && subjectType === "venture" && s.score != null) {
      await supabase
        .from("ventures")
        .update({ health: healthFromScore(s.score) })
        .eq("id", subjectId);
    }
    router.refresh();
  }

  async function makeTask(key: string, title: string) {
    setBusy(true);
    const { error } = await supabase.from("tasks").insert({
      title: `${subjectName} — ${title}`,
      priority: "High",
      status: "open",
      ...(pillarId ? { pillar_id: pillarId } : {}),
    });
    setBusy(false);
    if (!error) setMade((m) => [...m, key]);
  }

  /* ---------------- finish screen ---------------- */
  if (done) {
    const s =
      subjectType === "venture"
        ? ventureTriageScore(answers)
        : areaTriageScore(answers);
    const candidates = taskCandidates(bank, answers);
    return (
      <div className="card p-5 sm:p-6 grid gap-4">
        <div>
          <p className="label">
            {kind === "deep" ? "Deep dive complete" : "Triage complete"}
          </p>
          <h2 className="serif text-[1.4rem] mt-1.5">{subjectName}</h2>
          {kind === "triage" && (
            <p className="mono text-[1.05rem] mt-2 font-bold">
              {s.score != null ? (
                <>
                  Health {scoreBasisLine(s)}
                  <span className="text-[0.72rem] font-normal text-[var(--faint)] block mt-1">
                    Equal weights, skipped signals excluded — recomputable by
                    hand from your answers.
                  </span>
                </>
              ) : (
                "No score — nothing scoreable was answered."
              )}
            </p>
          )}
        </div>

        {candidates.length > 0 && (
          <div>
            <p className="label mb-2">Your answers, offered back as tasks</p>
            <div className="grid gap-2">
              {candidates.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
                >
                  <span className="text-[0.84rem] flex-1 min-w-0">{c.title}</span>
                  {made.includes(c.key) ? (
                    <span
                      className="text-[0.72rem] font-bold shrink-0"
                      style={{ color: "var(--good)" }}
                    >
                      ✓ Task made
                    </span>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => makeTask(c.key, c.title)}
                      className="chip shrink-0"
                    >
                      + Make it a task
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[0.7rem] text-[var(--faint)] mt-2">
              One tap each, never automatic. Untapped answers stay answers.
            </p>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Link href={home} className="btn no-underline text-[0.85rem]">
            Back to {subjectType === "venture" ? "the division" : "the area"} →
          </Link>
          <Link href="/diagnose" className="btn-ghost btn no-underline text-[0.85rem]">
            Diagnose another
          </Link>
        </div>
        {err && (
          <p className="text-[0.78rem]" style={{ color: "var(--bad)" }}>
            {err}
          </p>
        )}
      </div>
    );
  }

  /* ---------------- question screen ---------------- */
  const progress = (i / bank.length) * 100;
  return (
    <div className="card overflow-hidden">
      <div className="h-[3px] bg-[var(--bg-2)]">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progress}%`, background: "var(--accent)" }}
        />
      </div>
      <div className="p-5 sm:p-6">
        <p className="label">
          {q!.stage} · {i + 1} of {bank.length}
        </p>
        <div className="flex items-start gap-2 mt-2">
          <h2 className="serif text-[1.25rem] leading-snug">{q!.q}</h2>
          <span className="hintwrap shrink-0 mt-1" tabIndex={0} aria-label="Why this is asked">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border border-[var(--border-bright)] text-[0.66rem] font-bold text-[var(--faint)] cursor-help"
            >
              i
            </span>
            <span className="hintpop" role="tooltip">
              {q!.hint}
            </span>
          </span>
        </div>

        <div className="mt-4">
          {q!.type === "choice" ? (
            <div className="grid gap-2">
              {q!.choices!.map((c) => (
                <button
                  key={c.value}
                  disabled={busy}
                  onClick={() => answer(c.value)}
                  className="text-left input cursor-pointer hover:border-[var(--accent)] font-semibold text-[0.9rem]"
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <>
              <input
                className="input"
                inputMode={q!.type === "text" ? "text" : "decimal"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={q!.placeholder}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) answer(draft.trim());
                }}
              />
              <button
                disabled={busy || !draft.trim()}
                onClick={() => answer(draft.trim())}
                className="btn mt-3 text-[0.88rem]"
              >
                Save answer
              </button>
            </>
          )}
        </div>
        {err && (
          <p className="text-[0.78rem] mt-3" style={{ color: "var(--bad)" }}>
            {err}
          </p>
        )}
      </div>
      <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-2)] flex items-center justify-between">
        <span className="text-[0.72rem] text-[var(--faint)]">
          {Object.keys(answers).length === 0
            ? "Nothing saved yet — the run is created on your first answer"
            : `${Object.keys(answers).length} answer${
                Object.keys(answers).length > 1 ? "s" : ""
              } saved · resumable any time`}
        </span>
        <button
          onClick={skip}
          className="text-[0.76rem] font-bold bg-transparent border-0 cursor-pointer p-0 text-[var(--muted)] hover:text-[var(--accent)]"
        >
          Skip →
        </button>
      </div>
    </div>
  );
}
