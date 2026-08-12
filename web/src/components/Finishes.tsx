"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  FINISH_KINDS,
  FINISH_KIND_LABEL,
  type Finish,
  type FinishKind,
  type MonthTally,
  type Momentum,
} from "@/lib/finishes";

/**
 * The finish line — twelve months, and whether each one counted.
 *
 * This is the answer to the one measure Jay's own twelve-month test was
 * missing: a version of "momentum" that can actually be failed. Most of it
 * fills itself from completed High tasks and completed diagnostics; the
 * button exists only for finishes the system has no way of seeing.
 *
 * The current month is drawn as provisional rather than judged, the same
 * discipline the reflection streak uses for the week still being lived.
 */
export default function Finishes({
  tallies,
  momentum,
  recent,
  nudge,
}: {
  tallies: MonthTally[];
  momentum: Momentum;
  recent: Finish[];
  nudge: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<FinishKind>("milestone");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Marks the moment a finish lands. Completion is the reward loop this
  // whole system runs on, and it was the one moment the UI never marked.
  const [justFinished, setJustFinished] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function record() {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("finishes").insert({ title: t, kind });
    setBusy(false);
    if (error) {
      setErr("That didn't save — try again.");
      return;
    }
    setTitle("");
    setOpen(false);
    setJustFinished(true);
    setTimeout(() => setJustFinished(false), 800);
    router.refresh();
  }

  const tone =
    momentum.state === "compounding"
      ? "var(--good)"
      : momentum.state === "drift"
        ? "var(--warn)"
        : "var(--accent)";

  return (
    <div className={`panel${justFinished ? " celebrate" : ""}`}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <p className="label">◆ Months that counted</p>
        <p className="mono text-[0.8rem] font-bold ml-auto" style={{ color: tone }}>
          {momentum.counted}/{momentum.of}
        </p>
      </div>

      {/* twelve months, oldest left */}
      <div className="flex items-end gap-1.5 h-[46px] mt-3" role="presentation">
        {tallies.map((t) => (
          <div
            key={t.month}
            title={`${t.month}: ${t.count} finish${t.count === 1 ? "" : "es"}${
              t.current ? " (this month, still going)" : ""
            }`}
            className="flex-1 rounded-[3px] min-h-[4px]"
            style={{
              // Height reads volume; colour reads the only thing that
              // matters — did anything close at all.
              height: `${Math.min(100, Math.max(8, t.count * 28))}%`,
              background: t.counted ? "var(--accent)" : "var(--border-bright)",
              opacity: t.current && !t.counted ? 0.5 : 1,
              outline: t.current ? "1px dashed var(--border-bright)" : undefined,
              outlineOffset: "1px",
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mono text-[0.58rem] text-[var(--faint)] mt-1">
        <span>{tallies[0]?.month}</span>
        <span>{tallies.at(-1)?.month} · now</span>
      </div>

      <p className="text-[0.78rem] text-[var(--muted)] mt-3 leading-relaxed">
        {momentum.line}
      </p>

      {nudge && (
        <p
          className="text-[0.76rem] mt-2 leading-relaxed"
          style={{ color: "var(--warn)" }}
        >
          {nudge}
        </p>
      )}

      {recent.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <p className="label mb-2">Lately</p>
          <div className="grid gap-1">
            {recent.slice(0, 5).map((f) => (
              <div key={f.id} className="flex items-baseline gap-2 text-[0.76rem]">
                <span className="mono text-[0.62rem] text-[var(--faint)] shrink-0">
                  {f.on.slice(8)}/{f.on.slice(5, 7)}
                </span>
                <span className="min-w-0 flex-1 truncate">{f.title}</span>
                <span className="text-[0.6rem] text-[var(--faint)] shrink-0 uppercase tracking-[0.05em]">
                  {f.source === "recorded" ? FINISH_KIND_LABEL[f.kind] : f.source}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        {!open ? (
          <button onClick={() => setOpen(true)} className="chip">
            + Something finished
          </button>
        ) : (
          <div className="grid gap-2">
            <input
              className="input"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What closed? e.g. cleared the Barclays card"
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) record();
              }}
            />
            <div className="flex gap-1 flex-wrap">
              {FINISH_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className="chip"
                  data-active={kind === k}
                >
                  {FINISH_KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                disabled={busy || !title.trim()}
                onClick={record}
                className="btn text-[0.85rem]"
              >
                Record it
              </button>
              <button onClick={() => setOpen(false)} className="chip">
                Cancel
              </button>
            </div>
            <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed">
              Only for things the system cannot see. Completed High tasks and
              finished diagnostics already count themselves.
            </p>
          </div>
        )}
      </div>

      {err && (
        <p className="text-[0.76rem] mt-2" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}
    </div>
  );
}
