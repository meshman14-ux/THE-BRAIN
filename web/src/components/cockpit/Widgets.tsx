import Link from "next/link";
import type { MonthTally } from "@/lib/finishes";
import { personStatus, type PersonRow } from "@/lib/logic";

/** Just what `personStatus` and the strip actually need — the page's own
 * query selects fewer columns than the full `PersonRow` contract. */
type PersonForStrip = Pick<PersonRow, "id" | "name" | "last_contact" | "cadence_days">;
import type { ParentReport } from "@/lib/parents";
import type { MotivationEntry } from "@/lib/cockpit/types";
import HudPanel from "@/components/hud/HudPanel";
import NoSignal from "./NoSignal";

/* ------------------------------------------------------------------ *
 * The permanent people strip — every named person, overdue ones
 * RINGED rather than badged (spec: a ring is a shape you keep noticing;
 * a badge is a count you learn to stop reading).
 * ------------------------------------------------------------------ */
export function PeopleStrip({
  people,
  today,
}: {
  people: PersonForStrip[];
  today: string;
}) {
  if (people.length === 0) {
    return (
      <NoSignal tag="NO ROSTER" href="/life/family" cta="Add someone">
        Nobody is on the roster yet, so there is nothing to watch.
      </NoSignal>
    );
  }
  return (
    <div className="hud-people-strip">
      {people.map((p) => {
        const status = personStatus({ ...p, relationship: null, birthday: null }, today);
        const overdue = status.state === "overdue";
        const initial = p.name.trim().charAt(0).toUpperCase() || "?";
        return (
          <span
            key={p.id}
            className="hud-person-chip"
            data-overdue={overdue ? "true" : "false"}
            title={
              overdue
                ? `${p.name} — ${status.since}d since you spoke, you said ${p.cadence_days}`
                : p.name
            }
          >
            {initial}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The module grid — LIFE + EMPIRE parents as compact tiles. Colour
 * carries STATE (green/warn/bad), never module identity — identity is
 * the name itself, per the existing channel-4 rule (§A3 decision 11:
 * "module: glyph + micro-label, no colour"). A fifth colour channel for
 * "which module" would collide with channel 2 the first time a tile is
 * both a module AND showing a warn line.
 * ------------------------------------------------------------------ */
const STATE_COLOUR: Record<ParentReport["state"], string> = {
  ok: "var(--hud-good)",
  note: "var(--hud-orange)",
  warn: "var(--hud-red)",
};

export function ModuleGrid({
  life,
  empire,
}: {
  life: ParentReport[];
  empire: ParentReport[];
}) {
  const all = [...life, ...empire];
  if (all.length === 0) {
    return (
      <NoSignal tag="NO SIGNAL">Neither board has reported yet.</NoSignal>
    );
  }
  return (
    <div className="hud-module-grid">
      {all.map((r) => (
        <div key={r.id} className="hud-panel" style={{ padding: "8px 10px" }}>
          <p
            className="mono"
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.1em",
              color: STATE_COLOUR[r.state],
              textTransform: "uppercase",
            }}
          >
            ■ {r.id}
          </p>
          <p className="text-[0.72rem] leading-snug mt-1" style={{ color: "var(--hud-core)" }}>
            {r.line}
          </p>
          {r.score != null && (
            <p className="mono text-[0.62rem] mt-1" style={{ color: "var(--hud-cyan)" }}>
              {r.score}/10
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Months that counted — honest to what `finishes.ts` actually tracks
 * (calendar MONTHS, not weeks — the mockup's own "weeks" label would
 * have been an invented granularity). One hex per month, `counted`
 * filled, `current` pulsing, everything else the empty outline.
 * ------------------------------------------------------------------ */
export function MonthsHex({ tallies }: { tallies: MonthTally[] }) {
  if (tallies.length === 0) {
    return <NoSignal tag="NO SIGNAL">No finishes recorded yet — nothing to count.</NoSignal>;
  }
  return (
    <div className="hud-hexrow" role="img" aria-label="Months that counted">
      {tallies.map((t) => {
        const state = t.current ? "today" : t.counted ? "done" : "pending";
        const label = t.month.slice(5, 7);
        return (
          <div key={t.month} className="hud-hex" data-s={state} title={`${t.month} — ${t.counted ? `${t.count} finished` : "nothing yet"}`}>
            <svg viewBox="0 0 44 50">
              <polygon
                points="22,2 41,13 41,37 22,48 3,37 3,13"
                fill={t.counted ? "var(--hud-cyan)" : "transparent"}
                stroke={state === "pending" ? "rgba(30,74,102,.9)" : "var(--hud-cyan)"}
                strokeWidth={1.2}
              />
            </svg>
            <span className="d">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cloud OS · Files — the spec's window onto Drive. No Drive OAuth
 * exists in this app (only Google Calendar does, and that needs its
 * own credentials, §A8 item 11) — building one is real, undocumented
 * work outside this pass. Rather than fake a file list, this says so.
 * `drive_folders` (22 rows) already exists from the capture-engine
 * merge and is the real routing table this widget would read once the
 * connection exists.
 * ------------------------------------------------------------------ */
export function CloudFilesWidget() {
  return (
    <NoSignal tag="NOT CONNECTED" href="/capture" cta="Feed the System instead">
      No Drive connection. `drive_folders` (22 routes) is already seeded and
      ready for one — until then, Capture is the real door in.
    </NoSignal>
  );
}

/* ------------------------------------------------------------------ *
 * The advisor strip — reads the SAME contract the rest of the page
 * reads (constraint 9), never a second query. Ends in one action, or
 * says plainly there is not enough data yet (constraint 10).
 * ------------------------------------------------------------------ */
export function AdvisorStrip({
  line,
}: {
  line: { kind: string; line: string; href?: string };
}) {
  if (line.kind === "silence") {
    return (
      <NoSignal tag="ADVISOR">
        Nothing is asking for attention right now — that is the answer, not a gap.
      </NoSignal>
    );
  }
  return (
    <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--hud-core)" }}>
      {line.line}
      {line.href && (
        <>
          {" "}
          <Link href={line.href} className="font-semibold no-underline" style={{ color: "var(--hud-cyan)" }}>
            →
          </Link>
        </>
      )}
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Motivation — "a thing you wrote, and when." The widget only shows
 * the latest; the full log and the write box live at /life/motivation.
 * ------------------------------------------------------------------ */
export function MotivationWidget({ latest }: { latest: MotivationEntry | null }) {
  if (!latest) {
    return (
      <NoSignal tag="NO SIGNAL" href="/life/motivation" cta="Write one">
        Nothing written yet.
      </NoSignal>
    );
  }
  return (
    <div>
      <p className="text-[0.82rem] italic leading-relaxed" style={{ color: "var(--hud-core)" }}>
        “{latest.body}”
      </p>
      <p className="mono text-[0.6rem] mt-1.5" style={{ color: "var(--hud-dim)" }}>
        {new Date(latest.createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })}
        {"  ·  "}
        <Link href="/life/motivation" className="font-semibold no-underline" style={{ color: "var(--hud-cyan)" }}>
          all of them →
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The floor — BODY · EMPIRE · MIND, the headline metric Jay chose at
 * onboarding: consistency, not scores. Derived entirely from rows the
 * system already collects (src/lib/floor.ts), so it starts counting the
 * day anything lands and never asks to be fed.
 * ------------------------------------------------------------------ */
export function FloorStrip({
  week,
  line,
}: {
  week: {
    hits: number;
    of: number;
    perSlot: { body: number; empire: number; mind: number };
    today: { body: boolean; empire: boolean; mind: boolean };
    days: { day: string; hit: boolean }[];
  };
  line: string;
}) {
  const empty = week.perSlot.body + week.perSlot.empire + week.perSlot.mind === 0;
  if (empty) {
    return (
      <NoSignal tag="NO SIGNAL" href="/day/print" cta="Print today's sheet">
        Nothing has landed this week. The floor counts itself the moment a
        training tick, a venture task, or a journal line arrives.
      </NoSignal>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--hud-core)" }}>
        {line}
      </p>
      <div className="flex gap-1.5" role="img" aria-label={`Floor hit ${week.hits} of ${week.of} days`}>
        {week.days.map((d) => (
          <span
            key={d.day}
            title={d.day}
            className="h-2 flex-1 rounded-full"
            style={{
              background: d.hit ? "var(--hud-good)" : "transparent",
              border: `1px solid ${d.hit ? "var(--hud-good)" : "var(--hud-dim)"}`,
            }}
          />
        ))}
      </div>
      <p className="mono text-[0.62rem]" style={{ color: "var(--hud-dim)" }}>
        TODAY · BODY {week.today.body ? "✓" : "—"} · EMPIRE {week.today.empire ? "✓" : "—"} ·
        MIND {week.today.mind ? "✓" : "—"}
      </p>
    </div>
  );
}

export { HudPanel };
