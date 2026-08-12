import { describe, expect, it } from "vitest";
import {
  REPEAT_GAP_DAYS,
  SILENCE,
  type LineInput,
  candidates,
  oneLine,
  silenceFor,
} from "../src/lib/oneline";
import type { LifeContracts } from "../src/lib/lifeos";

const TODAY = "2026-08-26"; // past the 25th, so the month test is live
const shift = (iso: string, by: number) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

/** A life with everything intact and measurable — the silent case. */
const intact = (over: Partial<LifeContracts> = {}): LifeContracts => ({
  body: { trainingPerWeek: 4, readinessBand: "green", floorHeld: true },
  money: { accountsClosed: 1, debtFreeDate: null, arrearsTotal: 400, overdueCount: 0 },
  people: { overdueContacts: 0, nextOccasion: null, unset: 0 },
  rhythm: { season: "quiet", capacity: 3, monthsCounted: null, minimumMode: false },
  ...over,
});

const input = (over: Partial<LineInput> = {}): LineInput => ({
  contracts: intact(),
  worldAlerts: [],
  finishesThisMonth: 1,
  staleAges: [],
  lastSaid: {},
  todayIso: TODAY,
  ...over,
});

/* ================================================================== *
 * The ranking — it is about who is doing the punishing
 * ================================================================== */

describe("ranking", () => {
  it("puts the world above everything the system merely has an opinion about", () => {
    const l = oneLine(
      input({
        worldAlerts: [{ text: "Canter — MOT lapsed 3d ago", href: "/life/vehicles" }],
        contracts: intact({
          body: { trainingPerWeek: 1, readinessBand: null, floorHeld: false },
        }),
        finishesThisMonth: 0,
        staleAges: [{ what: "debt balances", days: 60 }],
      })
    );
    expect(l.kind).toBe("world");
    expect(l.line).toContain("MOT");
  });

  it("puts the floor above the month and staleness", () => {
    const l = oneLine(
      input({
        contracts: intact({
          body: { trainingPerWeek: 2, readinessBand: null, floorHeld: false },
        }),
        finishesThisMonth: 0,
        staleAges: [{ what: "debt balances", days: 60 }],
      })
    );
    expect(l.kind).toBe("floor");
    // Always with the evidence.
    expect(l.line).toContain("2×");
  });

  it("puts the month above staleness", () => {
    const l = oneLine(
      input({ finishesThisMonth: 0, staleAges: [{ what: "debt balances", days: 60 }] })
    );
    expect(l.kind).toBe("month");
  });

  it("falls to staleness when nothing louder is true", () => {
    const l = oneLine(input({ staleAges: [{ what: "debt balances", days: 60 }] }));
    expect(l.kind).toBe("stale");
    expect(l.line).toContain("weeks");
  });

  it("ends in silence, and silence is a sentence", () => {
    const l = oneLine(input());
    expect(l.kind).toBe("silence");
    expect(l).toEqual(SILENCE);
    expect(l.line).toBe("Floor intact. Nothing needs you.");
  });
});

/* ================================================================== *
 * The three rules
 * ================================================================== */

describe("never twice running on the same subject", () => {
  it("stays quiet on a subject said yesterday", () => {
    const breached = intact({
      body: { trainingPerWeek: 2, readinessBand: null, floorHeld: false },
    });
    const first = oneLine(input({ contracts: breached }));
    const again = oneLine(
      input({
        contracts: breached,
        lastSaid: { [first.subject]: shift(TODAY, -1) },
      })
    );
    expect(again.kind).not.toBe("floor");
  });

  it("says it again once the gap has passed", () => {
    const breached = intact({
      body: { trainingPerWeek: 2, readinessBand: null, floorHeld: false },
    });
    const first = oneLine(input({ contracts: breached }));
    const later = oneLine(
      input({
        contracts: breached,
        lastSaid: { [first.subject]: shift(TODAY, -REPEAT_GAP_DAYS) },
      })
    );
    expect(later.kind).toBe("floor");
  });

  it("gives the slot to the next thing rather than going silent", () => {
    // A persistent breach must not silence everything ranked behind it.
    const breached = intact({
      body: { trainingPerWeek: 2, readinessBand: null, floorHeld: false },
    });
    const first = oneLine(input({ contracts: breached }));
    const next = oneLine(
      input({
        contracts: breached,
        finishesThisMonth: 0,
        lastSaid: { [first.subject]: TODAY },
      })
    );
    expect(next.kind).toBe("month");
  });
});

describe("never accuses the system's own emptiness", () => {
  it("says nothing about a floor it cannot measure", () => {
    // Nothing logged: floorHeld is null, not false. An unmeasured leg is
    // the system's silence, and blaming Jay for it is the exact mistake
    // the habit board made.
    const l = oneLine(
      input({
        contracts: intact({
          body: { trainingPerWeek: null, readinessBand: null, floorHeld: null },
          people: { overdueContacts: 0, nextOccasion: null, unset: 3 },
        }),
      })
    );
    expect(l.kind).toBe("silence");
  });

  it("does not call a never-entered truth stale", () => {
    const l = oneLine(input({ staleAges: [{ what: "vehicle dates", days: null }] }));
    expect(l.kind).toBe("silence");
  });
});

describe("always carries its evidence", () => {
  it("never emits a line without a number or a name in it", () => {
    const all = candidates(
      input({
        worldAlerts: [{ text: "Canter — MOT lapsed 3d ago" }],
        contracts: intact({
          body: { trainingPerWeek: 2, readinessBand: null, floorHeld: false },
          money: { accountsClosed: 0, debtFreeDate: null, arrearsTotal: 100, overdueCount: 2 },
          people: { overdueContacts: 3, nextOccasion: null, unset: 0 },
        }),
        finishesThisMonth: 0,
        staleAges: [{ what: "area scores", days: 40 }],
      })
    );
    expect(all.length).toBeGreaterThan(3);
    for (const c of all) {
      expect(/\d/.test(c.line), `no evidence in: ${c.line}`).toBe(true);
    }
  });
});

/* ================================================================== *
 * Legible silence
 * ================================================================== */

describe("silenceFor", () => {
  it("claims the floor is intact only when it is measurably intact", () => {
    expect(silenceFor(intact())).toEqual(SILENCE);
  });

  it("refuses the claim when a leg cannot be measured, and says which", () => {
    // "Floor intact" is a claim. Being unable to check is not the same as
    // checking and finding nothing wrong.
    const s = silenceFor(
      intact({ body: { trainingPerWeek: null, readinessBand: null, floorHeld: null } })
    );
    expect(s.line).not.toBe(SILENCE.line);
    expect(s.line).toContain("training");
    expect(s.line).toContain("honestly");
  });
});
