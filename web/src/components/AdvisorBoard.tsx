"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countVote, POSITION_WORD, type Opinion } from "@/lib/reflect";
import { functionErrorMessage } from "@/lib/fnerror";

type Seat = { key: string; name: string; brief: string; bias: string };

type Hearing = {
  session_id?: string;
  casting?: string;
  seats?: Seat[];
  opinions?: Opinion[];
  verdict?: string;
  recommendation?: string;
  dissent?: string;
};

/**
 * The board of advisors.
 *
 * Named AdvisorBoard, not Board: `Board.tsx` is LIFE_OS's five-area panel and
 * has been since the parents landed.
 *
 * Ten seats in a stable registry, three to five cast per question, always
 * including the Sceptic — a unanimous board is one advisor with extra steps.
 *
 * The DISSENT is displayed as prominently as the verdict, and stored with it.
 * In six months the useful question is not what was decided; it is who was
 * against it, and whether they were right.
 */
export default function AdvisorBoard({ seats }: { seats: Seat[] }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [out, setOut] = useState<Hearing | null>(null);
  const supabase = createClient();

  const seatName = (key: string) =>
    out?.seats?.find((s) => s.key === key)?.name ??
    seats.find((s) => s.key === key)?.name ??
    key;

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setErr("");
    setOut(null);
    const { data, error } = await supabase.functions.invoke("advisor", {
      body: { mode: "board", question: q },
    });
    if (error) {
      // The function's own words, not supabase-js's generic line.
      setErr(`The board could not sit — ${await functionErrorMessage(error)}`);
    } else {
      setOut(data as Hearing);
    }
    setBusy(false);
  }

  const vote = out?.opinions ? countVote(out.opinions) : null;

  return (
    <div className="grid gap-5">
      <section className="card p-4 grid gap-3">
        <textarea
          className="input min-h-[88px] resize-y leading-relaxed"
          placeholder="Ask them something you are genuinely undecided about."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          className="btn tap text-sm py-2.5 ml-auto"
          onClick={ask}
          disabled={busy || !question.trim()}
        >
          {busy ? "The board is sitting…" : "Put it to the board"}
        </button>
      </section>

      {err && <p className="text-sm text-[var(--bad)]">⚠ {err}</p>}

      {out && (
        <>
          {out.casting && (
            <div>
              <p className="label">Who was seated</p>
              <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">{out.casting}</p>
            </div>
          )}

          <section className="grid gap-2">
            {(out.opinions ?? []).map((o, i) => (
              <div key={`${o.seat_key}-${i}`} className="card p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-[0.94rem] min-w-0 flex-1">
                    {seatName(o.seat_key)}
                  </p>
                  <span className="chip shrink-0 text-xs">
                    {POSITION_WORD[o.position] ?? o.position}
                  </span>
                </div>
                <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">{o.argument}</p>
              </div>
            ))}
          </section>

          <section className="card p-4">
            <p className="label">The verdict {vote && `· ${vote.line}`}</p>
            <p className="text-[0.98rem] mt-1.5 leading-relaxed">{out.verdict}</p>

            {out.recommendation && (
              <>
                <p className="label mt-4">What to do this week</p>
                <p className="text-[0.98rem] mt-1.5 leading-relaxed">{out.recommendation}</p>
              </>
            )}
          </section>

          {/* As prominent as the verdict, on purpose. */}
          {out.dissent && (
            <section className="card p-4 border-[var(--warn)]">
              <p className="label" style={{ color: "var(--warn)" }}>
                The dissent
              </p>
              <p className="text-[0.98rem] mt-1.5 leading-relaxed">{out.dissent}</p>
              <p className="text-xs text-[var(--faint)] mt-2 leading-relaxed">
                Kept with the verdict. In six months the useful question is
                whether this was right.
              </p>
            </section>
          )}

          {vote?.unanimous && (
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Every seat agreed. The casting is told to seat conflict, so that
              is information about the question rather than a strong answer.
            </p>
          )}
        </>
      )}

      <section>
        <p className="label mb-2.5">The registry · {seats.length} seats</p>
        <ul className="grid gap-2 list-none p-0 m-0">
          {seats.map((s) => (
            <li key={s.key} className="card px-4 py-3">
              <p className="text-sm font-semibold">{s.name}</p>
              <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">{s.brief}</p>
              {/* Every seat states its bias, because a panel that hides its
                  biases is just an opinion with a title. */}
              <p className="text-xs text-[var(--faint)] mt-1 leading-relaxed">Bias: {s.bias}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
