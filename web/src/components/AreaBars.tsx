"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Pillar } from "@/lib/types";
import {
  rankAreasByNeed,
  averageScore,
  focusArea,
  scoreBarPercent,
  mondayOf,
} from "@/lib/logic";

/**
 * Life areas, worst first — the ranked bar list JAY_OS is built around.
 *
 * The list is capped at what it is: all thirteen areas, sorted so the one
 * that needs him most is at the top. Tapping a row opens the only editor the
 * dashboard has — score, one status line, and the focus flag. Everything
 * else on the page is read-only on purpose.
 */
export default function AreaBars({
  areas,
  today,
}: {
  areas: Pillar[];
  today: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const ranked = rankAreasByNeed(areas);
  const avg = averageScore(areas);
  const focus = focusArea(areas, today);
  const scoredCount = areas.filter((a) => a.score != null).length;

  async function save(id: string, patch: Partial<Pillar>) {
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("pillars").update(patch).eq("id", id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-2.5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="mono text-[0.78rem] font-semibold">
          AVG {avg == null ? "—" : avg.toFixed(1)} / 10
        </span>
        <span className="text-[0.7rem] text-[var(--faint)]">
          {scoredCount === 0
            ? "nothing scored yet"
            : scoredCount < areas.length
              ? `${scoredCount} of ${areas.length} scored — unscored areas sit at the bottom, not at zero`
              : "all areas scored"}
        </span>
      </div>

      {scoredCount === 0 && (
        <p className="rounded-[10px] border border-dashed border-[var(--border-bright)] px-4 py-3.5 text-[0.82rem] text-[var(--muted)] leading-relaxed">
          Score each area out of 10 and the list sorts itself worst-first —
          that ranking is the whole point of this panel. Tap an area to score
          it. Two minutes, once a week, is enough.
        </p>
      )}

      <div className="grid gap-1.5">
        {ranked.map((a, i) => {
          const isFocus = focus?.id === a.id;
          const isOpen = open === a.id;
          const pct = scoreBarPercent(a.score);
          const worst = i === 0 && a.score != null;
          return (
            <div
              key={a.id}
              className="rounded-[10px] border px-3.5 py-2.5"
              style={{
                borderColor: isFocus ? "var(--accent)" : "var(--border)",
                background: isFocus ? "var(--accent-soft)" : undefined,
              }}
            >
              <button
                className="w-full text-left bg-transparent border-0 p-0 cursor-pointer font-[inherit] text-[var(--text)]"
                onClick={() => setOpen(isOpen ? null : a.id)}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[0.85rem] font-medium">
                    {a.emoji} {a.name}
                  </span>
                  {isFocus && (
                    <span
                      className="text-[0.62rem] font-bold uppercase tracking-[0.08em] px-1.5 py-[2px] rounded-[5px]"
                      style={{
                        background: "var(--accent)",
                        color: "var(--on-accent)",
                      }}
                    >
                      This week&apos;s focus
                    </span>
                  )}
                  {worst && !isFocus && (
                    <span
                      className="text-[0.62rem] font-bold uppercase tracking-[0.08em]"
                      style={{ color: "var(--bad)" }}
                    >
                      needs attention
                    </span>
                  )}
                  <span className="mono text-[0.74rem] ml-auto shrink-0">
                    {a.score == null ? "—" : a.score}/10
                  </span>
                </div>
                <div
                  className="mt-2 w-full rounded-full overflow-hidden bg-[var(--bg-2)] border border-[var(--border)]"
                  style={{ height: 7 }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background:
                        a.score == null
                          ? "transparent"
                          : a.score <= 3
                            ? "var(--bad)"
                            : a.score <= 6
                              ? "var(--warn)"
                              : "var(--good)",
                    }}
                  />
                </div>
              </button>

              {isOpen && (
                <Editor
                  area={a}
                  busy={busy}
                  isFocus={isFocus}
                  onScore={(n) => save(a.id, { score: n })}
                  onClear={() => save(a.id, { score: null })}
                  onStatus={(s) => save(a.id, { status_line: s || null })}
                  onFocus={() =>
                    save(a.id, {
                      focus_week: isFocus ? null : mondayOf(today),
                    })
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      {err && (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          ⚠ {err}
        </p>
      )}
    </div>
  );
}

function Editor({
  area,
  busy,
  isFocus,
  onScore,
  onClear,
  onStatus,
  onFocus,
}: {
  area: Pillar;
  busy: boolean;
  isFocus: boolean;
  onScore: (n: number) => void;
  onClear: () => void;
  onStatus: (s: string) => void;
  onFocus: () => void;
}) {
  const [line, setLine] = useState(area.status_line ?? "");
  return (
    <div className="grid gap-2.5 mt-3 pt-3 border-t border-[var(--border)]">
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            className="chip"
            data-active={area.score === n}
            disabled={busy}
            onClick={() => onScore(n)}
          >
            {n}
          </button>
        ))}
        {area.score != null && (
          <button
            className="chip"
            disabled={busy}
            onClick={onClear}
            title="Back to not-scored — which is not the same as zero"
          >
            clear
          </button>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onStatus(line.trim());
        }}
      >
        <input
          className="input flex-1"
          placeholder='One honest line — "Debt-heavy — plan in motion"'
          value={line}
          maxLength={80}
          onChange={(e) => setLine(e.target.value)}
        />
        <button className="btn" disabled={busy || line.trim() === (area.status_line ?? "")}>
          Save
        </button>
      </form>
      <button className="btn btn-ghost justify-self-start" disabled={busy} onClick={onFocus}>
        {isFocus ? "Drop as this week's focus" : "Make this week's focus"}
      </button>
    </div>
  );
}
