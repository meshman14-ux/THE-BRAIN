"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AreaScore } from "@/lib/standing";

export type StandingArea = AreaScore & {
  id: string;
  emoji: string | null;
  /** The standard Jay wrote for this area. The best writing in the system. */
  standard: string | null;
};

/**
 * The eight areas, mostly computed.
 *
 * Three things this component must never do, each of them a way the old
 * hand-scored board went wrong:
 *
 *   · **Print a bare number.** Every score carries its working, because a
 *     number you cannot interrogate is a number you stop believing, and
 *     the moment you stop believing it you stop opening the page.
 *   · **Draw an unmeasured area as a low one.** A missing bar is not a
 *     short bar. An area with nothing beneath it yet gets a dash and the
 *     name of the input that would fix it.
 *   · **Offer to edit a computed score.** Typing over a derived number
 *     puts the two back out of step, which is the exact fault v2 exists
 *     to remove. Only the areas nothing can speak for are editable.
 */
export default function Standing({
  areas,
  average,
}: {
  areas: StandingArea[];
  average: { mean: number | null; of: number; computed: number };
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function score(id: string, n: number) {
    setBusy(true);
    setErr("");
    // Home & Admin is one of only two figures in LIFE_OS that a person has
    // to type. A silent failure here is a score that looks set, is not, and
    // then reports itself as merely stale a fortnight later.
    const { error } = await supabase.from("pillars").update({ score: n }).eq("id", id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  const tone = (a: StandingArea) =>
    a.score == null
      ? "var(--faint)"
      : a.score >= 7
        ? "var(--good)"
        : a.score >= 4
          ? "var(--warn)"
          : "var(--bad)";

  // Worst first, and the unmeasured last — an area nobody can score yet is
  // not the most urgent thing on the page, it is the least known.
  const ordered = [...areas].sort((a, b) => {
    if ((a.score == null) !== (b.score == null)) return a.score == null ? 1 : -1;
    return (a.score ?? 0) - (b.score ?? 0);
  });

  return (
    <div className="grid gap-3">
      {err && (
        <p
          className="text-[0.8rem] leading-relaxed m-0"
          style={{ color: "var(--bad)" }}
          role="alert"
        >
          ⚠ That score did not save — {err}
        </p>
      )}
      <div className="flex items-baseline gap-3 flex-wrap">
        <p className="mono text-[1.4rem] font-bold leading-none">
          {average.mean ?? "—"}
        </p>
        <p className="text-[0.78rem] text-[var(--muted)] leading-relaxed">
          {average.mean == null
            ? "Nothing can be scored yet."
            : `across the areas that can be scored · ${average.computed} of ${average.of} computed from the modules beneath them`}
        </p>
      </div>

      <div className="grid gap-2">
        {ordered.map((a) => (
          <div
            key={a.id}
            className="rounded-[10px] border border-[var(--border)] px-3 py-2.5 grid gap-1.5"
          >
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[0.88rem] font-medium">
                {a.emoji} {a.area}
              </span>
              <span
                className="mono text-[0.6rem] uppercase tracking-[0.08em]"
                style={{
                  color:
                    a.source === "computed" ? "var(--accent)" : "var(--faint)",
                }}
              >
                {a.source === "computed"
                  ? "computed"
                  : a.source === "typed"
                    ? "scored by you"
                    : "not measurable yet"}
              </span>
              <span
                className="mono text-[1rem] font-bold ml-auto"
                style={{ color: tone(a) }}
              >
                {a.score ?? "—"}
              </span>
            </div>

            {/* A missing bar, not a short one. */}
            {a.score != null ? (
              <div
                className="h-[5px] rounded-full overflow-hidden"
                style={{ background: "var(--bg-2)" }}
              >
                <div
                  className="h-full fill"
                  data-tone={a.score >= 7 ? "good" : a.score >= 4 ? "warn" : undefined}
                  style={{ width: `${a.score * 10}%` }}
                />
              </div>
            ) : (
              <div
                className="h-[5px] rounded-full border border-dashed"
                style={{ borderColor: "var(--border-bright)" }}
              />
            )}

            {/* The working. Always present, including when it is ignorance. */}
            <p className="text-[0.74rem] text-[var(--muted)] leading-relaxed">
              {a.working}
            </p>

            {a.standard && (
              <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed italic">
                {a.standard}
              </p>
            )}

            {/* Only what nothing can speak for is editable. */}
            {a.source !== "computed" &&
              (editing === a.id ? (
                <div className="flex gap-1 flex-wrap">
                  {Array.from({ length: 11 }, (_, n) => (
                    <button
                      key={n}
                      className="chip mono w-8 justify-center px-0 text-center"
                      data-active={a.score === n}
                      disabled={busy}
                      onClick={() => void score(a.id, n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  className="chip self-start"
                  onClick={() => setEditing(a.id)}
                >
                  {a.score == null ? "Score it" : "Rescore"}
                </button>
              ))}
          </div>
        ))}
      </div>

      {/* Said once, permanently. */}
      <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
        A computed score measures what the system can see, which is not the
        same as how your life is going. It is meant to be checkable, not
        omniscient — if the working looks wrong, the working is the thing to
        argue with.
      </p>
    </div>
  );
}
