"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OBSTACLES, OBSTACLE_LABEL, type Review } from "@/lib/types";
import { readObstacles, obstacleKey, obstacleLabel, formatDayLong } from "@/lib/logic";

/**
 * The weekly review — 20 minutes, four questions.
 *
 * The fourth is the one Jay asked for: what got in the way. His three
 * circled obstacles are offered as defaults because he named them, and
 * anything else he types is stored beside them, so the list can grow past
 * the book without a migration. It all goes in `reviews.meta.obstacles`.
 */
export default function WeeklyReview({
  periodStart,
  periodEnd,
  existing,
}: {
  periodStart: string;
  periodEnd: string;
  existing: Review | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [wins, setWins] = useState(existing?.wins ?? "");
  const [friction, setFriction] = useState(existing?.friction ?? "");
  const [nextFocus, setNextFocus] = useState(existing?.next_focus ?? "");
  const [obstacles, setObstacles] = useState<string[]>(
    readObstacles(existing?.meta)
  );
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    wins !== (existing?.wins ?? "") ||
    friction !== (existing?.friction ?? "") ||
    nextFocus !== (existing?.next_focus ?? "") ||
    JSON.stringify(obstacles) !== JSON.stringify(readObstacles(existing?.meta));

  function toggle(key: string) {
    setSaved(false);
    setObstacles((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function addOther() {
    const key = obstacleKey(other);
    if (key === "") return;
    setSaved(false);
    setObstacles((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setOther("");
  }

  const custom = obstacles.filter(
    (k) => !(OBSTACLES as readonly string[]).includes(k)
  );

  async function save() {
    setBusy(true);
    setError(null);
    const meta = { ...(existing?.meta ?? {}), obstacles };
    const { error: err } = await supabase.from("reviews").upsert(
      {
        kind: "weekly",
        period_start: periodStart,
        period_end: periodEnd,
        wins: wins.trim() || null,
        friction: friction.trim() || null,
        next_focus: nextFocus.trim() || null,
        meta,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,kind,period_start" }
    );
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="card p-4 sm:p-5 grid gap-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="label">The week just gone</h2>
        <span className="mono text-[0.68rem] text-[var(--faint)]">
          {formatDayLong(periodStart)} → {formatDayLong(periodEnd)}
        </span>
        {existing?.completed_at && (
          <span
            className="text-[0.66rem] font-bold uppercase tracking-[0.06em] ml-auto"
            style={{ color: "var(--good)" }}
          >
            ✓ already reviewed
          </span>
        )}
      </div>

      <Field
        label="What went well"
        hint="the wins, however small"
        value={wins}
        onChange={(v) => {
          setWins(v);
          setSaved(false);
        }}
        placeholder="Three sessions in the gym. Called the council about the arrears."
      />

      <Field
        label="What didn't"
        hint="honestly — the dashboard never flatters you, and neither should this"
        value={friction}
        onChange={(v) => {
          setFriction(v);
          setSaved(false);
        }}
        placeholder="Never opened the Amazon research. Third week."
      />

      {/* -- the step Jay asked for -------------------------------- */}
      <div className="grid gap-2.5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">What got in the way</p>
          <span className="text-[0.7rem] text-[var(--faint)]">
            the three you circled, plus anything else
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {OBSTACLES.map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              data-active={obstacles.includes(key)}
              onClick={() => toggle(key)}
            >
              {obstacles.includes(key) ? "✓ " : ""}
              {OBSTACLE_LABEL[key]}
            </button>
          ))}
          {custom.map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              data-active
              onClick={() => toggle(key)}
              title="Tap to remove"
            >
              ✓ {obstacleLabel(key)} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOther();
              }
            }}
            placeholder="Something else — the van, the weather, a phone call"
            aria-label="Another obstacle"
          />
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={addOther}
            disabled={obstacleKey(other) === ""}
          >
            Add
          </button>
        </div>
      </div>

      <Field
        label="Next week's focus"
        hint="one clear outcome, not a list"
        value={nextFocus}
        onChange={(v) => {
          setNextFocus(v);
          setSaved(false);
        }}
        placeholder="Get every creditor balance confirmed."
        rows={2}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn" onClick={save} disabled={busy || !dirty}>
          {busy
            ? "Saving…"
            : existing
              ? "Update this review"
              : "Save this review"}
        </button>
        {saved && !dirty && (
          <span className="text-[0.76rem]" style={{ color: "var(--good)" }}>
            Saved.
          </span>
        )}
        {error && (
          <span className="text-[0.76rem]" style={{ color: "var(--bad)" }}>
            Didn&apos;t save: {error}
          </span>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline gap-3 flex-wrap">
        <p className="label">{label}</p>
        <span className="text-[0.7rem] text-[var(--faint)]">{hint}</span>
      </div>
      <textarea
        className="input"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
