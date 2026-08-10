"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type PersonRow,
  type PersonStatus,
  type Occasion,
  type Tier,
  TIERS,
  TIER_CADENCE,
  TIER_LABEL,
  TIER_HINT,
  tierForCadence,
  personStatus,
} from "@/lib/logic";
import InlineValue from "./InlineValue";

/**
 * The people module.
 *
 * Three things stacked, in the order Jay asked for them: the cadence
 * watchtower as the hero, the occasions strip, and depth notes as an
 * optional ceiling on any contact log.
 *
 * The single most important design decision here is what it does NOT do.
 * A personal CRM that lists eleven overdue friends produces guilt, and
 * guilt produces avoidance — the app gets closed rather than the calls
 * getting made. So the hero surfaces at most three and states the rest as
 * a number. Three is a thing you can do something about tonight.
 */
export default function People({
  people,
  watch,
  occasionList,
  today,
}: {
  people: PersonRow[];
  watch: { surfaced: PersonStatus[]; alsoOverdue: number; unset: number };
  occasionList: Occasion[];
  today: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  /**
   * One tap logs a conversation and resets the clock.
   *
   * Two writes, and both matter: the log is the history, and
   * `people.last_contact` is what the cadence is measured against. The
   * unique key on (person_id, contacted_on) makes it idempotent, so a
   * double tap records one conversation rather than inflating a frequency.
   */
  async function logContact(p: PersonRow, withNote?: string) {
    setBusy(p.id);
    setErr("");
    const { error } = await supabase
      .from("people_contacts")
      .upsert(
        { person_id: p.id, contacted_on: today, note: withNote?.trim() || null },
        { onConflict: "person_id,contacted_on" }
      );
    if (!error) {
      await supabase.from("people").update({ last_contact: today }).eq("id", p.id);
    }
    setBusy(null);
    setNoteFor(null);
    setNote("");
    if (error) setErr(error.message);
    else router.refresh();
  }

  async function setTier(p: PersonRow, tier: Tier) {
    setBusy(p.id);
    setErr("");
    const { error } = await supabase
      .from("people")
      .update({ cadence_days: TIER_CADENCE[tier] })
      .eq("id", p.id);
    setBusy(null);
    if (error) setErr(error.message);
    else router.refresh();
  }

  return (
    <div className="grid gap-5">
      {err && (
        <p className="text-[0.82rem] m-0" style={{ color: "var(--bad)" }}>
          {err}
        </p>
      )}

      {/* -- HERO · the cadence watchtower -------------------------- */}
      <section className="panel grid gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="label">Out of touch</h2>
          <span className="text-[0.7rem] text-[var(--faint)]">
            at most three, worst first
          </span>
        </div>

        {watch.surfaced.length === 0 ? (
          <p className="text-[0.84rem] text-[var(--muted)] leading-relaxed">
            {watch.unset > 0
              ? `Nobody is overdue. ${watch.unset} ${
                  watch.unset === 1 ? "person has" : "people have"
                } no cadence set, so the system is not measuring them yet — set one below and it starts.`
              : "Nobody is overdue. That is the whole message; there is no list underneath it."}
          </p>
        ) : (
          <>
            <ul className="grid gap-2 list-none p-0 m-0">
              {watch.surfaced.map((s) => (
                <li
                  key={s.person.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border px-3.5 py-3"
                  style={{ borderColor: "var(--border-bright)" }}
                >
                  <span className="min-w-0">
                    <span className="text-[0.92rem] font-medium block leading-snug">
                      {s.person.name}
                    </span>
                    <span className="text-[0.72rem] text-[var(--faint)] block mt-0.5">
                      {s.since} days · you said {s.person.cadence_days}
                      {s.person.relationship ? ` · ${s.person.relationship}` : ""}
                    </span>
                  </span>
                  <span className="ml-auto flex gap-1.5 shrink-0">
                    <button
                      className="btn text-[0.78rem] py-2 px-3"
                      disabled={busy === s.person.id}
                      onClick={() => logContact(s.person)}
                    >
                      Spoke today
                    </button>
                    <button
                      className="chip"
                      disabled={busy === s.person.id}
                      onClick={() =>
                        setNoteFor(noteFor === s.person.id ? null : s.person.id)
                      }
                    >
                      + note
                    </button>
                  </span>
                  {noteFor === s.person.id && (
                    // The depth note is the ceiling: logging never requires
                    // one, and one is never asked for.
                    <span className="basis-full flex gap-2">
                      <input
                        className="input"
                        autoFocus
                        placeholder="What was said. Optional, and it stays optional."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") logContact(s.person, note);
                          if (e.key === "Escape") setNoteFor(null);
                        }}
                      />
                      <button
                        className="btn shrink-0"
                        disabled={busy === s.person.id}
                        onClick={() => logContact(s.person, note)}
                      >
                        Log
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {watch.alsoOverdue > 0 && (
              <p className="text-[0.74rem] text-[var(--faint)] leading-relaxed">
                {watch.alsoOverdue} more {watch.alsoOverdue === 1 ? "is" : "are"} past
                their cadence. They are not listed on purpose — a list of eleven people
                you have let down is a page you close rather than a page you act on.
              </p>
            )}
          </>
        )}
      </section>

      {/* -- occasions ---------------------------------------------- */}
      <section className="panel grid gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="label">Coming up</h2>
          <span className="text-[0.7rem] text-[var(--faint)]">next 60 days</span>
        </div>
        {occasionList.length === 0 ? (
          <p className="text-[0.84rem] text-[var(--muted)] leading-relaxed">
            No birthdays recorded inside the next two months. A birthday you
            learn about on the day is a text; one you learn about a fortnight
            out is a present, which is the whole reason this strip exists.
          </p>
        ) : (
          <ul className="grid gap-1.5 list-none p-0 m-0">
            {occasionList.map((o) => (
              <li
                key={`${o.personId}-${o.on}`}
                className="flex items-center gap-3 text-[0.85rem]"
              >
                <span
                  aria-hidden
                  className="w-[6px] h-[6px] rounded-full shrink-0"
                  style={{ background: o.soon ? "var(--warn)" : "var(--border-bright)" }}
                />
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                <span className="mono text-[0.72rem] shrink-0 text-[var(--faint)]">
                  {o.on}
                </span>
                <span
                  className="mono text-[0.72rem] shrink-0 w-[4.5rem] text-right"
                  style={{ color: o.soon ? "var(--warn)" : "var(--muted)" }}
                >
                  {o.inDays === 0 ? "today" : `${o.inDays}d`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* -- the roster --------------------------------------------- */}
      <section className="panel grid gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="label">The roster</h2>
          <span className="text-[0.7rem] text-[var(--faint)]">
            tap a tier — it sets the cadence
          </span>
        </div>
        {people.length === 0 ? (
          <p className="text-[0.84rem] text-[var(--muted)] leading-relaxed">
            Nobody on the roster yet. Add the handful you would actually notice
            drifting — fifteen is a relationship practice, a hundred is a
            database.
          </p>
        ) : (
          <ul className="grid gap-2 list-none p-0 m-0">
            {people.map((p) => {
              const s = personStatus(p, today);
              const tier = tierForCadence(p.cadence_days);
              return (
                <li
                  key={p.id}
                  className="rounded-[10px] border border-[var(--border)] px-3.5 py-3 grid gap-2"
                  style={{ opacity: busy === p.id ? 0.6 : 1 }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[0.92rem] font-medium">{p.name}</span>
                    {p.relationship && (
                      <span className="text-[0.72rem] text-[var(--faint)]">
                        {p.relationship}
                      </span>
                    )}
                    <span
                      className="mono text-[0.68rem] ml-auto shrink-0"
                      style={{ color: STATE_COLOUR[s.state] }}
                    >
                      {/* Status is never colour alone — the word is always here. */}
                      {STATE_LABEL[s.state]}
                      {s.since != null ? ` · ${s.since}d` : ""}
                    </span>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {TIERS.map((t) => (
                      <button
                        key={t}
                        className="chip"
                        title={TIER_HINT[t]}
                        data-active={tier === t ? "true" : "false"}
                        disabled={busy === p.id}
                        onClick={() => setTier(p, t)}
                      >
                        {TIER_LABEL[t]} · {TIER_CADENCE[t]}d
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.76rem] text-[var(--muted)]">
                    <span>
                      Last contact{" "}
                      <InlineValue
                        field="people.last_contact"
                        id={p.id}
                        value={p.last_contact}
                      />
                    </span>
                    <span>
                      Birthday{" "}
                      <InlineValue field="people.birthday" id={p.id} value={p.birthday} />
                    </span>
                    <span>
                      Every{" "}
                      <InlineValue
                        field="people.cadence_days"
                        id={p.id}
                        value={p.cadence_days}
                      />{" "}
                      days
                    </span>
                    <button
                      className="ml-auto chip"
                      disabled={busy === p.id}
                      onClick={() => logContact(p)}
                    >
                      Spoke today
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const STATE_COLOUR = {
  overdue: "var(--bad)",
  due: "var(--warn)",
  ok: "var(--good)",
  no_cadence: "var(--faint)",
  never: "var(--faint)",
} as const;

const STATE_LABEL = {
  overdue: "OVERDUE",
  due: "DUE",
  ok: "IN TOUCH",
  no_cadence: "NO CADENCE",
  never: "NEVER LOGGED",
} as const;
