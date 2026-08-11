import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEASON,
  SEASON_KINDS,
  SEASON_LABEL,
  SEASON_MEANING,
  VENTURE_DORMANT_AFTER_DAYS,
  type Season,
  activeSetStatus,
  currentSeason,
  daysInSeason,
  expectationsFor,
  isVentureDormant,
  seasonKind,
  seasonLine,
  splitVentures,
} from "../src/lib/season";

const TODAY = "2026-08-11";

const season = (o: Partial<Season> & { kind: Season["kind"] }): Season => ({
  id: o.id ?? Math.random().toString(),
  kind: o.kind,
  started_on: o.started_on ?? TODAY,
  ended_on: o.ended_on ?? null,
  note: o.note ?? null,
});

const venture = (o: Record<string, unknown> = {}) => ({
  id: String(o.id ?? Math.random()),
  status: String(o.status ?? "active"),
  created_at: ("created_at" in o ? o.created_at : `${TODAY}T09:00:00Z`) as
    | string
    | null,
});

/* ------------------------------------------------------------------ *
 * Seasons
 * ------------------------------------------------------------------ */

describe("season kinds", () => {
  it("carries a label and a meaning for every kind", () => {
    for (const k of SEASON_KINDS) {
      expect(SEASON_LABEL[k], k).toBeTruthy();
      expect(SEASON_MEANING[k].length, k).toBeGreaterThan(30);
    }
  });

  it("defaults to quiet when nothing was ever declared", () => {
    expect(DEFAULT_SEASON).toBe("quiet");
    expect(seasonKind([])).toBe("quiet");
    expect(currentSeason([])).toBeNull();
  });
});

describe("currentSeason", () => {
  it("is the one still open", () => {
    const rows = [
      season({ kind: "quiet", started_on: "2026-01-01", ended_on: "2026-06-01" }),
      season({ kind: "busy", started_on: "2026-06-01" }),
    ];
    expect(currentSeason(rows)?.kind).toBe("busy");
    expect(seasonKind(rows)).toBe("busy");
  });

  it("takes the latest if the data ever holds two open rows", () => {
    const rows = [
      season({ kind: "quiet", started_on: "2026-01-01" }),
      season({ kind: "minimum", started_on: "2026-07-01" }),
    ];
    expect(currentSeason(rows)?.kind).toBe("minimum");
  });

  it("ignores closed seasons entirely", () => {
    const rows = [
      season({ kind: "busy", started_on: "2026-01-01", ended_on: "2026-02-01" }),
    ];
    expect(currentSeason(rows)).toBeNull();
    expect(seasonKind(rows)).toBe(DEFAULT_SEASON);
  });
});

describe("daysInSeason", () => {
  it("counts from the start date", () => {
    expect(daysInSeason([season({ kind: "busy", started_on: "2026-08-01" })], TODAY)).toBe(10);
  });

  it("is zero on the first day, never negative", () => {
    expect(daysInSeason([season({ kind: "busy", started_on: TODAY })], TODAY)).toBe(0);
    expect(
      daysInSeason([season({ kind: "busy", started_on: "2026-09-01" })], TODAY)
    ).toBe(0);
  });

  it("says nothing rather than guessing when nothing is declared", () => {
    expect(daysInSeason([], TODAY)).toBeNull();
    expect(seasonLine([], TODAY)).toContain("not yet declared");
  });

  it("renders a one-based day for humans", () => {
    const rows = [season({ kind: "busy", started_on: "2026-08-01" })];
    expect(seasonLine(rows, TODAY)).toBe("Busy season · day 11");
  });
});

/* ------------------------------------------------------------------ *
 * Expectations — the reason seasons exist
 * ------------------------------------------------------------------ */

describe("expectationsFor", () => {
  it("narrows as the season narrows", () => {
    const q = expectationsFor("quiet");
    const b = expectationsFor("busy");
    const m = expectationsFor("minimum");
    expect(q.activeVentureSlots).toBeGreaterThan(b.activeVentureSlots);
    expect(b.activeVentureSlots).toBeGreaterThan(m.activeVentureSlots);
    expect(q.focusSlots).toBeGreaterThan(b.focusSlots);
    expect(b.focusSlots).toBeGreaterThan(m.focusSlots);
  });

  it("stops flagging unworked ventures outside the building window", () => {
    // The whole point: in a busy season an untouched venture is parked,
    // not dropped, and the system must not accuse him of it.
    expect(expectationsFor("quiet").flagsUnworkedVentures).toBe(true);
    expect(expectationsFor("busy").flagsUnworkedVentures).toBe(false);
    expect(expectationsFor("minimum").flagsUnworkedVentures).toBe(false);
  });

  it("keeps the same floor in every season — the keystone never flexes", () => {
    const floors = SEASON_KINDS.map((k) => expectationsFor(k).floor.join("|"));
    expect(new Set(floors).size).toBe(1);
    expect(expectationsFor("minimum").floor).toContain("Training ×4");
  });

  it("asks for nothing but the floor in minimum mode", () => {
    const m = expectationsFor("minimum");
    expect(m.activeVentureSlots).toBe(0);
    expect(m.expectsAreaScores).toBe(false);
    expect(m.expectsWeeklyReview).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Venture dormancy
 * ------------------------------------------------------------------ */

describe("isVentureDormant", () => {
  it("sleeps an active venture nothing has touched in 30 days", () => {
    const v = venture({ created_at: "2026-05-01T00:00:00Z" });
    expect(isVentureDormant(v, {}, TODAY)).toBe(true);
    expect(VENTURE_DORMANT_AFTER_DAYS).toBe(30);
  });

  it("keeps a recently created venture awake", () => {
    expect(isVentureDormant(venture({ created_at: "2026-08-01T00:00:00Z" }), {}, TODAY)).toBe(
      false
    );
  });

  it("treats a diagnostic run as a touch, and the most recent one wins", () => {
    const old = venture({ created_at: "2026-01-01T00:00:00Z" });
    expect(isVentureDormant(old, { lastRunAt: "2026-08-10T14:00:00Z" }, TODAY)).toBe(false);
    expect(isVentureDormant(old, { lastRunAt: "2026-02-01T14:00:00Z" }, TODAY)).toBe(true);
  });

  it("never calls a deliberately parked venture dormant", () => {
    // Backlog, paused and exited are decisions Jay made. Calling a decision
    // "dormant" would be the system telling him off for choosing.
    for (const status of ["backlog", "paused", "exited", "idea"]) {
      const v = venture({ status, created_at: "2026-01-01T00:00:00Z" });
      expect(isVentureDormant(v, {}, TODAY), status).toBe(false);
    }
  });

  it("fails closed when there is no date to reason from", () => {
    expect(isVentureDormant(venture({ created_at: null }), {}, TODAY)).toBe(false);
    expect(isVentureDormant(venture({ created_at: "" }), {}, TODAY)).toBe(false);
  });

  it("is not fooled by a future timestamp", () => {
    const v = venture({ created_at: "2026-12-01T00:00:00Z" });
    expect(isVentureDormant(v, {}, TODAY)).toBe(false);
  });

  it("wakes exactly on the boundary rather than a day early", () => {
    const v = venture({ created_at: "2026-07-12T00:00:00Z" }); // 30 days
    expect(isVentureDormant(v, {}, TODAY)).toBe(false);
    const older = venture({ created_at: "2026-07-11T00:00:00Z" }); // 31 days
    expect(isVentureDormant(older, {}, TODAY)).toBe(true);
  });
});

describe("splitVentures", () => {
  it("puts every venture in exactly one bucket", () => {
    const rows = [
      venture({ id: "live", created_at: "2026-08-10T00:00:00Z" }),
      venture({ id: "sleepy", created_at: "2026-01-01T00:00:00Z" }),
      venture({ id: "parked", status: "backlog", created_at: "2026-01-01T00:00:00Z" }),
    ];
    const s = splitVentures(rows, new Map(), TODAY);
    expect(s.live.map((v) => v.id)).toEqual(["live"]);
    expect(s.dormant.map((v) => v.id)).toEqual(["sleepy"]);
    expect(s.parked.map((v) => v.id)).toEqual(["parked"]);
    expect(s.live.length + s.dormant.length + s.parked.length).toBe(rows.length);
  });

  it("distinguishes parked from dormant — the distinction is the point", () => {
    const rows = [
      venture({ id: "a", status: "backlog", created_at: "2026-01-01T00:00:00Z" }),
      venture({ id: "b", status: "active", created_at: "2026-01-01T00:00:00Z" }),
    ];
    const s = splitVentures(rows, new Map(), TODAY);
    expect(s.parked).toHaveLength(1);
    expect(s.dormant).toHaveLength(1);
  });

  it("wakes a venture from a touch map", () => {
    const rows = [venture({ id: "a", created_at: "2026-01-01T00:00:00Z" })];
    const touches = new Map([["a", { lastRunAt: "2026-08-09T00:00:00Z" }]]);
    expect(splitVentures(rows, touches, TODAY).live).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * The active set
 * ------------------------------------------------------------------ */

describe("activeSetStatus", () => {
  it("reports being over the cap without picking what to drop", () => {
    const s = activeSetStatus(4, "busy");
    expect(s.over).toBe(true);
    expect(s.slots).toBe(1);
    // Reported, never enforced — same rule the calendar holds for clashes.
    expect(s.line).toContain("Not an error");
  });

  it("counts the room left when inside the cap", () => {
    const s = activeSetStatus(1, "quiet");
    expect(s.over).toBe(false);
    expect(s.line).toContain("2 more");
  });

  it("expects nothing of the empire in minimum mode", () => {
    expect(activeSetStatus(0, "minimum").over).toBe(false);
    expect(activeSetStatus(0, "minimum").line).toContain("Nothing is expected");
    expect(activeSetStatus(2, "minimum").over).toBe(true);
  });
});
