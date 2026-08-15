"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type Checkin,
  type CheckinField,
  CHECKIN_FIELDS,
  CHECKIN_FLOOR,
  CHECKIN_PROMPT,
  checkinProgress,
  isAnswered,
  isSettled,
} from "@/lib/logic";

export type CheckinArea = { id: string; name: string; emoji: string | null };

const MOOD_FACES = ["😖", "🙁", "😐", "🙂", "😄"];
const ENERGY_BARS = ["▁", "▃", "▅", "▆", "█"];

/**
 * The daily close.
 *
 * Built on the venture onboarder's pattern, and for the same reason: every
 * answer WRITES ON TAP. There is no Save button, so there is no state in
 * which he answered four questions, got interrupted, and lost them. Close
 * the tab at question three and question three is saved.
 *
 * Skipping writes NULL rather than an empty string. "I did not answer" and
 * "nothing happened" are different facts, and only one of them should turn
 * up in a tally two months from now.
 *
 * The floor is mood and energy — two taps and the day is logged. Everything
 * below that line is the ceiling: always present, never demanded, and each
 * piece stands alone so answering one does not commit him to the rest.
 */
export default function CheckinFlow({
  date,
  initial,
  area,
  gratitudePrompt,
  dayLabel,
}: {
  date: string;
  initial: Checkin;
  area: CheckinArea | null;
  gratitudePrompt: string;
  dayLabel: string;
}) {
  const [c, setC] = useState<Checkin>(initial);
  const [busy, setBusy] = useState<CheckinField | null>(null);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const progress = checkinProgress(c);

  /**
   * One write per answer, upserted on (user_id, entry_date) — the unique
   * key the journal already carries, so a second answer on the same evening
   * updates the row rather than starting a second one.
   */
  async function save(field: CheckinField, patch: Partial<Checkin>) {
    const next = { ...c, ...patch };
    setC(next);
    setBusy(field);
    setErr("");

    /* -- read, then merge ---------------------------------------------- *
     *
     * `meta` on a journal row is SHARED. This form owns six keys; the day
     * planner owns `hours`, written by HourPurpose, which merges correctly.
     * Writing the object whole — which this did until now — deletes every
     * key it does not know about, so the first nightly close on a day with
     * pinned hours silently threw them away.
     *
     * It never showed up because the close has never successfully written:
     * all three journal rows carry hours and none carries a mood. The bug
     * was waiting for the day the close started working. */
    const { data: row } = await supabase
      .from("journal")
      .select("meta")
      .eq("entry_date", date)
      .maybeSingle();
    const held =
      typeof row?.meta === "object" && row.meta !== null && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {};

    const { error } = await supabase.from("journal").upsert(
      {
        entry_date: date,
        mood: next.mood,
        energy: next.energy,
        gratitude: next.gratitude,
        meta: {
          ...held,
          wins: next.wins,
          friction: next.friction,
          tomorrow: next.tomorrow,
          area_id: next.areaId,
          area_score: next.areaScore,
          skipped: next.skipped,
        },
      },
      { onConflict: "user_id,entry_date" }
    );

    /* -- and SAY when it fails ----------------------------------------- *
     *
     * The answer is set in local state before the write, so the tap always
     * looked like it worked. A failed write left the answer on screen and
     * nothing in the database — which is the worst of both, because you
     * stop checking. journal has three rows and not one mood or energy
     * figure in any of them. */
    if (error) {
      setErr(error.message);
      setBusy(null);
      setC(c); // put the optimistic answer back, so the screen is honest
      return;
    }
    // The area score is the one answer that lives somewhere else too: the
    // pillar carries the current score, and the journal carries the fact
    // that it was set tonight. Both, or the dashboard would not move.
    if (field === "area" && next.areaId != null && next.areaScore != null) {
      const { error: areaErr } = await supabase
        .from("pillars")
        .update({ score: next.areaScore })
        .eq("id", next.areaId);
      if (areaErr) setErr(areaErr.message);
    }
    setBusy(null);
    router.refresh();
  }

  /**
   * Skipping leaves the ANSWER null — that is the zero-obligation rule, and
   * it is why a skipped gratitude can never turn up in a tally later. What
   * gets recorded is the skip itself, in its own list, so the flow knows to
   * stop asking and the button visibly does something.
   */
  function skip(field: CheckinField) {
    if (c.skipped.includes(field)) return;
    void save(field, { skipped: [...c.skipped, field] });
  }

  return (
    <div className="grid gap-4">
      {/* A failed write used to be completely invisible here: the answer
          is set in local state first, so the tap looked identical whether
          it saved or not. This is the only thing on the page that can tell
          you the difference. */}
      {err && (
        <p
          className="panel text-[0.82rem] leading-relaxed m-0"
          style={{ color: "var(--bad)", borderColor: "var(--bad)" }}
          role="alert"
        >
          ⚠ That did not save — {err}
        </p>
      )}

      {/* -- where you are ------------------------------------------- */}
      <div className="panel">
        <p className="label">{dayLabel}</p>
        <p className="text-[0.86rem] mt-1.5 leading-relaxed text-[var(--muted)]">
          {progress.logged
            ? `Logged. ${progress.answered} of ${progress.of} answered${
                progress.skipped > 0 ? `, ${progress.skipped} passed on` : ""
              } — the rest is there if you want it.`
            : "Two taps and today is logged. Everything under that is optional."}
        </p>
        <div className="flex gap-1 mt-3" role="presentation">
          {CHECKIN_FIELDS.map((f) => (
            <span
              key={f}
              title={f}
              className="h-[5px] flex-1 rounded-full"
              style={{
                background: isAnswered(c, f)
                  ? CHECKIN_FLOOR.includes(f)
                    ? "var(--good)"
                    : "var(--accent)"
                  : isSettled(c, f)
                    ? "var(--border-bright)"
                    : "var(--border)",
              }}
            />
          ))}
        </div>
      </div>

      {/* -- FLOOR · mood ------------------------------------------- */}
      <Question
        label="Floor"
        prompt={CHECKIN_PROMPT.mood}
        answered={c.mood != null}
        busy={busy === "mood"}
      >
        <div className="flex gap-2 flex-wrap">
          {MOOD_FACES.map((face, i) => (
            <button
              key={face}
              onClick={() => save("mood", { mood: i + 1 })}
              aria-label={`Mood ${i + 1} of 5`}
              aria-pressed={c.mood === i + 1}
              className="chip text-[1.1rem] leading-none py-2 px-3"
              data-active={c.mood === i + 1 ? "true" : "false"}
            >
              {face}
            </button>
          ))}
        </div>
      </Question>

      {/* -- FLOOR · energy ----------------------------------------- */}
      <Question
        label="Floor"
        prompt={CHECKIN_PROMPT.energy}
        answered={c.energy != null}
        busy={busy === "energy"}
      >
        <div className="flex gap-2 flex-wrap">
          {ENERGY_BARS.map((bar, i) => (
            <button
              key={bar}
              onClick={() => save("energy", { energy: i + 1 })}
              aria-label={`Energy ${i + 1} of 5`}
              aria-pressed={c.energy === i + 1}
              className="chip mono text-[1.1rem] leading-none py-2 px-3"
              data-active={c.energy === i + 1 ? "true" : "false"}
            >
              {bar}
            </button>
          ))}
        </div>
      </Question>

      {/* -- CEILING · the area the system picked -------------------- */}
      {area && (
        <Question
          label="Optional"
          prompt={`How is ${area.emoji ?? ""} ${area.name} doing?`.trim()}
          hint="The system picked this one — unscored areas first, then whichever is lowest."
          answered={c.areaScore != null}
          busy={busy === "area"}
          onSkip={() => skip("area")}
        >
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                onClick={() => save("area", { areaId: area.id, areaScore: n })}
                aria-label={`Score ${n} out of 10`}
                aria-pressed={c.areaScore === n}
                className="chip mono w-9 justify-center py-2 px-0 text-center"
                data-active={c.areaScore === n ? "true" : "false"}
              >
                {n}
              </button>
            ))}
          </div>
        </Question>
      )}

      {/* -- CEILING · the four written prompts ---------------------- */}
      <Written
        label="Optional"
        prompt={CHECKIN_PROMPT.wins}
        value={c.wins}
        busy={busy === "wins"}
        onSave={(v) => save("wins", { wins: v })}
        onSkip={() => skip("wins")}
        placeholder="One line is plenty."
      />
      <Written
        label="Optional"
        prompt={CHECKIN_PROMPT.friction}
        value={c.friction}
        busy={busy === "friction"}
        onSave={(v) => save("friction", { friction: v })}
        onSkip={() => skip("friction")}
        placeholder="Naming it is most of the work."
      />
      <Written
        label="Optional"
        prompt={gratitudePrompt}
        hint="This question changes on a Monday and holds for the week."
        value={c.gratitude}
        busy={busy === "gratitude"}
        onSave={(v) => save("gratitude", { gratitude: v })}
        onSkip={() => skip("gratitude")}
      />
      <Written
        label="Optional"
        prompt={CHECKIN_PROMPT.tomorrow}
        hint="One thing. Not a list — the morning will hand you three anyway."
        value={c.tomorrow}
        busy={busy === "tomorrow"}
        onSave={(v) => save("tomorrow", { tomorrow: v })}
        onSkip={() => skip("tomorrow")}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Question({
  label,
  prompt,
  hint,
  answered,
  busy,
  onSkip,
  children,
}: {
  label: string;
  prompt: string;
  hint?: string;
  answered: boolean;
  busy: boolean;
  onSkip?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel grid gap-3" style={{ opacity: busy ? 0.6 : 1 }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="label">{label}</p>
        {answered && (
          <span className="mono text-[0.62rem]" style={{ color: "var(--good)" }}>
            SAVED
          </span>
        )}
        {onSkip && !answered && (
          <button
            onClick={onSkip}
            className="ml-auto text-[0.72rem] text-[var(--faint)] underline cursor-pointer bg-transparent border-0 p-0 font-[inherit]"
          >
            skip
          </button>
        )}
      </div>
      <p className="text-[0.95rem] font-medium leading-snug">{prompt}</p>
      {hint && (
        <p className="text-[0.72rem] text-[var(--faint)] leading-relaxed -mt-1.5">{hint}</p>
      )}
      {children}
    </section>
  );
}

/**
 * A written answer. It saves on blur rather than on a button, which keeps
 * the write-on-tap promise for text: type, look away, it is stored.
 */
function Written({
  label,
  prompt,
  hint,
  value,
  busy,
  onSave,
  onSkip,
  placeholder,
}: {
  label: string;
  prompt: string;
  hint?: string;
  value: string | null;
  busy: boolean;
  onSave: (v: string) => void;
  onSkip: () => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <Question
      label={label}
      prompt={prompt}
      hint={hint}
      answered={value != null}
      busy={busy}
      onSkip={onSkip}
    >
      <textarea
        className="input"
        rows={2}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== (value ?? "")) onSave(draft);
        }}
      />
    </Question>
  );
}
