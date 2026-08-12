/**
 * THE COG — the simulation, as a gate.
 *
 * The blueprint shipped this as a standalone `tsx` script and a separate CI
 * step. It is a vitest file here instead, for one reason: a check that runs
 * in its own command is a check somebody forgets to run. This repo's gate is
 * `npx vitest run`, so the ninety-day sweep belongs inside it.
 *
 * What it is for: a weights change can pass every unit test and still make
 * the engine behave badly in aggregate — pushing deep work on empty tanks,
 * producing four priorities in a minimum season, drifting out of 0–100.
 * These are properties over a distribution of days, not facts about one, so
 * they need a distribution to test against.
 *
 * Days are generated from a seeded PRNG, so a failure here is reproducible
 * rather than a Heisenbug that vanishes on rerun.
 */
import { describe, expect, it } from "vitest";
import { advise, defaultConfig } from "../../src/lib/cog";
import type { Band, MomentumState, Season } from "../../src/lib/cog";
import { baseProfile, baseState } from "./base-state";

const DAYS = 90;
const SEED = 20260813;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticDays(): MomentumState[] {
  const rnd = mulberry32(SEED);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const out: MomentumState[] = [];

  for (let i = 0; i < DAYS; i++) {
    const s = baseState();
    const date = new Date(Date.parse("2026-08-13T00:00:00Z") + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    s.date = date;
    s.now = `${date}T07:30:00`;
    s.season = pick<Season>(["quiet", "quiet", "quiet", "busy", "minimum"]);

    const hasCheckin = rnd() > 0.15;
    s.signals.energyBand = hasCheckin ? (pick([1, 2, 3, 3, 4, 4, 5]) as Band) : null;
    s.signals.energySource = hasCheckin ? "checkin" : "none";
    s.missingInputs = hasCheckin ? ["health"] : ["health", "checkin", "sleep"];
    s.signals.sleepBand = hasCheckin && rnd() > 0.3 ? (pick([2, 3, 4, 4]) as Band) : null;
    s.signals.yesterdayCompletionRatio = Math.round(rnd() * 100) / 100;
    s.signals.keystoneHitYesterday = rnd() > 0.35;
    s.signals.keystoneDoneToday = rnd() > 0.6;
    s.signals.inboxCount = Math.floor(rnd() * 25);
    s.signals.pulsesRejectedToday = rnd() > 0.9 ? 3 : 0;
    s.signals.calendarLoadRatio = Math.round(rnd() * 80) / 100;

    if (rnd() > 0.9) {
      s.calendar = { source: "none", busy: [] };
      s.missingInputs = [...s.missingInputs, "calendar"];
    } else if (rnd() > 0.7) {
      // A genuinely crowded day, which is where the focus fallback lives.
      s.calendar = {
        source: "google",
        busy: [
          { start: `${date}T08:00:00`, end: `${date}T13:00:00` },
          { start: `${date}T14:00:00`, end: `${date}T21:00:00` },
        ],
      };
    }
    if (rnd() > 0.8) s.tasks = s.tasks.slice(0, 1 + Math.floor(rnd() * 3));
    if (rnd() > 0.95) s.tasks = [];
    out.push(s);
  }
  return out;
}

const DAYS_UNDER_TEST = syntheticDays();
const run = (s: MomentumState) => advise(s, baseProfile(), defaultConfig);

describe(`the engine over ${DAYS} synthetic days`, () => {
  it("is deterministic on every one of them", () => {
    for (const s of DAYS_UNDER_TEST) {
      expect(JSON.stringify(run(s)), s.date).toBe(JSON.stringify(run(s)));
    }
  });

  it("never exceeds three priorities, and never more than one in a minimum season", () => {
    for (const s of DAYS_UNDER_TEST) {
      const a = run(s);
      expect(a.priorities.length, s.date).toBeLessThanOrEqual(3);
      // The floor never flexes: a minimum season is a declaration that
      // there is room for one thing, and the engine honouring that is the
      // difference between a season being real and being decorative.
      if (s.season === "minimum") expect(a.priorities.length, s.date).toBeLessThanOrEqual(1);
    }
  });

  it("keeps momentum inside 0–100", () => {
    for (const s of DAYS_UNDER_TEST) {
      const m = run(s).report.momentumIndicator;
      expect(m, s.date).toBeGreaterThanOrEqual(0);
      expect(m, s.date).toBeLessThanOrEqual(100);
    }
  });

  it("explains everything it ever says", () => {
    for (const s of DAYS_UNDER_TEST) {
      const a = run(s);
      const all = [...a.priorities, ...(a.focusSlot ? [a.focusSlot] : []), a.pulse, ...a.microActions];
      for (const rec of all) {
        expect(rec.rationale, `${s.date}: ${JSON.stringify(rec)}`).toBeTruthy();
        expect(rec.ruleTrace.length, s.date).toBeGreaterThan(0);
      }
    }
  });

  it("labels a degraded report whenever an input is missing", () => {
    for (const s of DAYS_UNDER_TEST) {
      if (s.missingInputs.length > 0) expect(run(s).report.degraded, s.date).toBe(true);
    }
  });

  it("never pushes deep work on an empty tank", () => {
    // Rule N4's whole purpose. This is the invariant most likely to break
    // silently when someone retunes energyFit, because no unit test looks
    // at the combination of a low band and a deep task being the top pick.
    for (const s of DAYS_UNDER_TEST) {
      const a = run(s);
      if (s.signals.energyBand === null || s.signals.energyBand > 2) continue;
      if (!["do-task", "start-focus"].includes(a.pulse.kind)) continue;
      const target = a.priorities.find((p) => p.taskId === a.pulse.refId);
      const task = target && s.tasks.find((t) => t.id === target.taskId);
      expect(task?.energy, `${s.date}: pushed deep work at band ${s.signals.energyBand}`).not.toBe(
        "deep"
      );
    }
  });

  it("never produces a focus slot that ends before it starts", () => {
    // The blueprint's F3 bug, caught in aggregate rather than in the one
    // hand-written case that happened to hit it.
    for (const s of DAYS_UNDER_TEST) {
      const slot = run(s).focusSlot;
      if (!slot) continue;
      expect(slot.end > slot.start, `${s.date}: ${slot.start} → ${slot.end}`).toBe(true);
      expect(slot.durationMin, s.date).toBeGreaterThan(0);
    }
  });

  it("goes quiet after three refusals rather than carrying on", () => {
    for (const s of DAYS_UNDER_TEST) {
      if (s.signals.pulsesRejectedToday < defaultConfig.pulseFatigueLimit) continue;
      // N1 outranks N2 by design — a day with no reading at all still asks
      // once — so the assertion is that it is never a fresh instruction.
      const kind = run(s).pulse.kind;
      expect(["none", "checkin"], s.date).toContain(kind);
    }
  });

  it("survives a day with no tasks at all", () => {
    const empty = DAYS_UNDER_TEST.filter((s) => s.tasks.length === 0);
    expect(empty.length, "the generator should produce some empty days").toBeGreaterThan(0);
    for (const s of empty) {
      const a = run(s);
      expect(a.priorities).toHaveLength(0);
      expect(a.pulse.message).toBeTruthy();
    }
  });
});
