"use client";

import { useState } from "react";
import Link from "next/link";
import {
  type AdvisorState,
  type AnswerCheck,
  type Brief,
  type Source,
} from "@/lib/advisor";
import { formatDayLong } from "@/lib/logic";
import { Panel, Empty, Tag } from "@/components/ui";

/**
 * The advisor page.
 *
 * Two halves, deliberately unequal. The brief is assembled from his own data
 * and is always right; the answer is written by a model and has to prove
 * itself with citations. The page never lets the second borrow the
 * credibility of the first — an answer arrives with its sources attached,
 * and anything it asserted without one is called out.
 */
export default function Advisor({
  state,
  missing,
  brief,
  noteCount,
  pushableCount,
  principleCount,
  suggestions,
}: {
  state: AdvisorState;
  missing: string[];
  brief: Brief;
  noteCount: number;
  pushableCount: number;
  principleCount: number;
  suggestions: string[];
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [check, setCheck] = useState<AnswerCheck | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);

  async function askIt(q: string) {
    const text = q.trim();
    if (text.length < 3) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setAnswer(null);
    setCheck(null);
    setSources([]);
    try {
      const res = await fetch("/api/advisor/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `That didn't work (${res.status}).`);
        return;
      }
      setSources(json.sources ?? []);
      if (json.answer == null) {
        setNote(
          json.reason === "nothing-matched"
            ? "Nothing in your vault matches that. The advisor answers from what you have written down — it does not answer from the world."
            : json.reason === "unconfigured"
              ? "These are the passages that matched. Writing an answer over them needs a Claude API key; finding them did not."
              : "The model declined to answer that one."
        );
        return;
      }
      setAnswer(json.answer);
      setCheck(json.check ?? null);
      if (json.truncated) {
        setNote("The answer was cut off at the length limit.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function draftReview() {
    setReviewBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/advisor/review", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not draft the review.");
        return;
      }
      setEvidence(json.evidence ?? []);
      setDraft(json.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReviewBusy(false);
    }
  }

  const ready = state === "ready";

  return (
    <div className="grid gap-6">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">Advisor</p>
          <p className="mono text-[0.72rem] text-[var(--faint)]">
            {formatDayLong(brief.date)}
          </p>
        </div>
        <h1 className="text-[1.7rem] sm:text-[2rem] font-semibold mt-1.5">
          {brief.greeting}.
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2.5 max-w-[68ch] leading-relaxed">
          Advisory, never autonomous. It reads your own data and answers from
          your own notes with the sources attached. It cannot create a task,
          change a date, or file anything — everything here is yours to act on.
        </p>
      </header>

      {/* -- the brief: assembled, not written -------------------- */}
      <Panel
        title="This morning"
        hint="assembled from your own data — no model involved"
      >
        {brief.quiet ? (
          <Empty>
            Nothing is slipping, nothing is due, and the habits are ticked. A
            quiet brief is a real result, not an empty one.
          </Empty>
        ) : (
          <ol className="grid gap-1.5 list-none p-0 m-0">
            {brief.items.map((item, i) => (
              <li key={`${item.kind}-${i}`}>
                <Link
                  href={item.href}
                  className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3.5 py-2.5 no-underline text-[var(--text)] card-hover"
                >
                  <span
                    aria-hidden
                    className="w-[6px] h-[6px] rounded-full shrink-0 mt-[7px]"
                    style={{
                      background:
                        item.rank === 0 ? "var(--bad)" : item.rank <= 2 ? "var(--warn)" : "var(--faint)",
                    }}
                  />
                  <span className="text-[0.86rem] leading-snug">{item.text}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
          Drawn from {pushableCount} note{pushableCount === 1 ? "" : "s"} plus
          your tasks, habits, debts and divisions.
          {principleCount > 0 && (
            <>
              {" "}
              Your {principleCount} principles are deliberately not in here —
              they are somewhere you go, never something that arrives. Ask for
              them below and they are fair game.
            </>
          )}
        </p>
      </Panel>

      {/* -- ask ---------------------------------------------------- */}
      <Panel
        title="Ask your own notes"
        hint={`${noteCount} note${noteCount === 1 ? "" : "s"} in the vault`}
      >
        {state === "unconfigured" && (
          <div className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-3.5 py-3 grid gap-1.5">
            <p className="text-[0.82rem] leading-relaxed">
              <b>Search works; the written answer does not.</b> Ask below and
              you get the passages that matched, ranked. A Claude API key adds
              an answer written over them with the citations attached.
            </p>
            <p className="label">Still missing</p>
            <ul className="grid gap-1">
              {missing.map((k) => (
                <li key={k} className="mono text-[0.8rem]">
                  {k}{" "}
                  <span className="text-[var(--faint)]">
                    — from console.anthropic.com, into Vercel and .env.local
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(
          <>
            <div className="flex gap-2 flex-wrap">
              <input
                className="input flex-1 min-w-[16rem]"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) askIt(question);
                }}
                placeholder={
                  state === "unconfigured"
                    ? "Search your notes…"
                    : "What did I write down about…"
                }
                aria-label="Ask your notes"
              />
              <button
                className="btn shrink-0"
                disabled={busy || question.trim().length < 3}
                onClick={() => askIt(question)}
              >
                {busy ? "Reading…" : state === "unconfigured" ? "Search" : "Ask"}
              </button>
            </div>

            {suggestions.length > 0 && !answer && (
              <div className="flex gap-1.5 flex-wrap">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip"
                    disabled={busy}
                    onClick={() => {
                      setQuestion(s);
                      askIt(s);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {note && (
              <p className="text-[0.82rem] leading-relaxed text-[var(--muted)]">
                {note}
              </p>
            )}

            {answer && (
              <div className="grid gap-3">
                <p className="text-[0.9rem] leading-relaxed whitespace-pre-wrap">
                  {answer}
                </p>

                {check && !check.grounded && (
                  <div
                    className="rounded-[10px] border px-3.5 py-3 grid gap-1.5"
                    style={{ borderColor: "var(--warn)" }}
                  >
                    <p className="label" style={{ color: "var(--warn)" }}>
                      Not fully grounded
                    </p>
                    {check.invalid.length > 0 && (
                      <p className="text-[0.8rem] leading-relaxed">
                        It cited {check.invalid.map((n) => `[${n}]`).join(", ")},
                        which is not a source it was given. Treat that as made up.
                      </p>
                    )}
                    {check.uncited.length > 0 && (
                      <>
                        <p className="text-[0.8rem] leading-relaxed">
                          {check.uncited.length} sentence
                          {check.uncited.length === 1 ? "" : "s"} assert something
                          with no source behind{" "}
                          {check.uncited.length === 1 ? "it" : "them"}:
                        </p>
                        <ul className="grid gap-1 list-disc pl-5 m-0">
                          {check.uncited.slice(0, 3).map((s) => (
                            <li
                              key={s}
                              className="text-[0.78rem] text-[var(--muted)] leading-snug"
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {sources.length > 0 && (
              <div className="grid gap-1.5">
                <p className="label">Sources</p>
                {sources.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-[10px] border border-[var(--border)] px-3.5 py-2.5"
                  >
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="mono text-[0.72rem]" style={{ color: "var(--accent)" }}>
                        [{s.n}]
                      </span>
                      <span className="text-[0.84rem] font-medium">{s.title}</span>
                      {s.kind !== "note" && <Tag colour="var(--faint)">{s.kind}</Tag>}
                    </div>
                    <p className="text-[0.76rem] text-[var(--muted)] mt-1 leading-snug">
                      {s.passage}
                    </p>
                  </div>
                ))}
                <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
                  These passages are the only thing the model was shown. It
                  cannot cite a note it never saw.
                </p>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* -- the review assistant ---------------------------------- */}
      {ready && (
        <Panel
          title="Draft this week's review"
          hint="from evidence, for you to edit"
          action={
            <button className="btn btn-ghost" disabled={reviewBusy} onClick={draftReview}>
              {reviewBusy ? "Reading the week…" : "Draft it"}
            </button>
          }
        >
          {evidence.length === 0 && !draft ? (
            <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
              It reads what actually happened — what you finished, what
              slipped, the habits, how much of the week got a purpose — and
              drafts the three answers from that. Nothing is saved: you copy
              what you want into{" "}
              <Link href="/reviews" style={{ color: "var(--accent)" }}>
                the review
              </Link>{" "}
              yourself.
            </p>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <p className="label">The evidence</p>
                <ul className="grid gap-1 list-disc pl-5 m-0">
                  {evidence.map((l) => (
                    <li key={l} className="text-[0.8rem] text-[var(--muted)] leading-snug">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
              {draft ? (
                <>
                  <div className="grid gap-1">
                    <p className="label">The draft</p>
                    <p className="text-[0.88rem] leading-relaxed whitespace-pre-wrap">
                      {draft}
                    </p>
                  </div>
                  <Link href="/reviews" className="btn no-underline justify-self-start">
                    Open the review to write it up
                  </Link>
                </>
              ) : (
                <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--warn)" }}>
                  The week is too thinly recorded to draft from. That is not a
                  failure of the advisor — there is nothing on record to
                  review yet.
                </p>
              )}
            </div>
          )}
        </Panel>
      )}

      {error && (
        <p className="text-[0.82rem]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed max-w-[68ch]">
        Everything on this page is a suggestion. The advisor has no ability to
        write to your system — it cannot make a task, move a date, tick a
        habit, or file a review. That is locked decision 6, and it is enforced
        in the code rather than promised here.
      </p>
    </div>
  );
}
