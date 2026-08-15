"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type ResetPillar = {
  id: string;
  name: string;
  emoji: string | null;
  system: "life" | "empire";
  score: number | null;
};

export type ResetInitial = {
  wins: string | null;
  friction: string | null;
  next_focus: string | null;
  pillar_scores: Record<string, number>;
  completed_at: string | null;
  meta: Record<string, unknown>;
};

/**
 * The quarterly hour, run with the venture onboarder's discipline: every
 * answer WRITES ON TAP (or on blur, for prose), skipping writes nothing,
 * and reopening resumes exactly where it was left. One row per quarter —
 * `reviews` is unique on (user_id, kind, period_start) — so the hour can
 * be split across three evenings and still be one reset.
 *
 * Closing the quarter is an explicit act, not a side effect of the last
 * answer: the button stamps `completed_at` and records the reset itself
 * as a finish, because closing a quarter IS something that visibly
 * finished — the whole momentum test runs on exactly that currency.
 */
export default function QuarterlyReset({
  periodStart,
  periodEnd,
  label,
  pillars,
  initial,
}: {
  periodStart: string;
  periodEnd: string;
  label: string;
  pillars: ResetPillar[];
  initial: ResetInitial;
}) {
  const [r, setR] = useState<ResetInitial>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [closing, setClosing] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const closed = r.completed_at != null;

  async function save(patch: Partial<ResetInitial>) {
    const next = { ...r, ...patch };
    setR(next);
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("reviews").upsert(
      {
        kind: "quarterly",
        period_start: periodStart,
        period_end: periodEnd,
        wins: next.wins,
        friction: next.friction,
        next_focus: next.next_focus,
        pillar_scores: next.pillar_scores,
        completed_at: next.completed_at,
        meta: next.meta,
      },
      { onConflict: "user_id,kind,period_start" }
    );
    setBusy(false);
    if (error) setErr(error.message);
  }

  /** Scores dual-write, exactly as the daily close does: the pillar
   *  carries the current number, the review carries the snapshot. */
  async function scoreArea(p: ResetPillar, n: number) {
    await save({ pillar_scores: { ...r.pillar_scores, [p.id]: n } });
    const { error: scoreErr } = await supabase
      .from("pillars")
      .update({ score: n })
      .eq("id", p.id);
    if (scoreErr) {
      setErr(scoreErr.message);
      return;
    }
    router.refresh();
  }

  async function closeQuarter() {
    setClosing(true);
    const stamp = new Date().toISOString();
    await save({ completed_at: stamp });
    // The reset is itself a finish — recorded once, on the day it closed.
    await supabase.from("finishes").insert({
      title: `Closed ${label} — the quarterly reset`,
      kind: "milestone",
      happened_on: stamp.slice(0, 10),
    });
    setClosing(false);
    router.refresh();
  }

  const scored = pillars.filter((p) => r.pillar_scores[p.id] != null).length;
  const answered =
    (r.wins ? 1 : 0) + (r.friction ? 1 : 0) + (r.next_focus ? 1 : 0);

  const prose = (
    field: "wins" | "friction" | "next_focus",
    prompt: string,
    hint: string,
    placeholder: string
  ) => (
    <section className="panel grid gap-2.5">
      <div className="flex items-baseline gap-2">
        <p className="label">{field === "next_focus" ? "The reset" : "The quarter"}</p>
        {r[field] && (
          <span className="mono text-[0.62rem]" style={{ color: "var(--good)" }}>
            SAVED
          </span>
        )}
      </div>
      <p className="text-[0.95rem] font-medium leading-snug">{prompt}</p>
      <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed -mt-1">{hint}</p>
      <textarea
        className="input"
        rows={3}
        defaultValue={r[field] ?? ""}
        placeholder={placeholder}
        disabled={closed}
        onBlur={(e) => {
          const v = e.target.value.trim() || null;
          if (v !== r[field]) void save({ [field]: v } as Partial<ResetInitial>);
        }}
      />
    </section>
  );

  const areaWalk = (system: "life" | "empire", title: string) => (
    <section className="panel grid gap-3">
      <p className="label">{title}</p>
      {pillars
        .filter((p) => p.system === system)
        .map((p) => {
          const held = r.pillar_scores[p.id];
          return (
            <div key={p.id} className="grid gap-1.5">
              <p className="text-[0.84rem] font-medium">
                {p.emoji} {p.name}
                {held == null && p.score != null && (
                  <span className="text-[0.68rem] text-[var(--faint)] ml-2">
                    currently {p.score}
                  </span>
                )}
              </p>
              <div className="flex gap-1 flex-wrap">
                {Array.from({ length: 11 }, (_, n) => (
                  <button
                    key={n}
                    className="chip mono w-8 justify-center px-0 text-center"
                    data-active={held === n}
                    disabled={busy || closed}
                    onClick={() => void scoreArea(p, n)}
                    aria-label={`Score ${p.name} ${n} of 10`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
    </section>
  );

  return (
    <div className="grid gap-4">
      {/* -- where the hour is up to -------------------------------- */}
      <div className="panel">
        <p className="text-[0.86rem] leading-relaxed text-[var(--muted)]">
          {closed
            ? `${label} is closed. Everything below is the record — read it, don't edit it.`
            : `${answered} of 3 questions answered · ${scored} of ${pillars.length} areas rescored. Every answer saves as it is given — the hour can be three evenings and still be one reset.`}
        </p>
      </div>

      {prose(
        "wins",
        "What did this quarter actually produce?",
        "Finishes, not effort. The evidence above is the honest starting list.",
        "The things that would still exist if you stopped tomorrow."
      )}
      {prose(
        "friction",
        "What got in the way, all quarter?",
        "The weekly obstacles tally above is what you SAID week by week — this is the pattern you see now, looking back.",
        "Name it plainly. Naming it is most of the work."
      )}

      {areaWalk("life", "Rescore LIFE_OS · 8 areas")}
      {areaWalk("empire", "Rescore EMPIRE_OS · 5 areas")}

      {prose(
        "next_focus",
        "Next quarter: one focus per system.",
        "Two sentences, not two lists. The season switch and the active set are where this becomes enforcement — this is where it becomes words.",
        "LIFE: … EMPIRE: …"
      )}

      {/* -- closing it --------------------------------------------- */}
      {!closed && (
        <section className="panel grid gap-2">
          <p className="text-[0.84rem] font-medium">Close {label}</p>
          <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed">
            Stamps the reset done and records it as a finish — closing a
            quarter is something that visibly finished, and the momentum
            test runs on exactly that currency. Nothing locks: the record
            stays readable forever.
          </p>
          <button
            className="btn self-start"
            disabled={busy || closing}
            onClick={() => void closeQuarter()}
          >
            {closing ? "Closing…" : `Close ${label}`}
          </button>
        </section>
      )}

      {err && <p className="text-[0.76rem] text-[var(--bad)]">⚠ {err}</p>}
    </div>
  );
}
