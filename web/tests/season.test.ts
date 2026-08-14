import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEASON,
  type LifeContext,
  SEASON_KINDS,
  annotate,
  annotationFor,
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

/* ------------------------------------------------------------------ *
 * The watchtower, told what season it is
 * ------------------------------------------------------------------ */

import {
  NEVER_SUPPRESSED,
  alertsForSeason,
  closingTotal,
  KEYSTONE_WINDOW_DAYS,
  keystoneHabit,
  keystoneNote,
  keystoneStanding,
  splitDebts,
  suppressesAlert,
  trackedHabits,
  untrackedHabits,
} from "../src/lib/season";

const alert = (kind: string) => ({ kind });

describe("season suppression", () => {
  it("silences empire bookkeeping in a busy season", () => {
    // An untouched division in a busy month is parked, not dropped.
    expect(suppressesAlert("drift", "busy")).toBe(true);
    expect(suppressesAlert("lowprofit", "busy")).toBe(true);
    expect(suppressesAlert("unscored", "minimum")).toBe(true);
  });

  it("silences nothing at all in the building window", () => {
    for (const k of ["drift", "lowprofit", "unscored", "overdue", "person"]) {
      expect(suppressesAlert(k, "quiet"), k).toBe(false);
    }
  });

  it("never suppresses a deadline, in any season", () => {
    // Due and overdue are facts about the world, and the world does not
    // care what season it is. Hiding one would be the system lying in the
    // flattering direction.
    for (const season of SEASON_KINDS) {
      for (const k of ["overdue", "due"]) {
        expect(suppressesAlert(k, season), `${k}/${season}`).toBe(false);
      }
    }
  });

  it("never suppresses a person, in any season", () => {
    // A busy month is exactly when staying in touch stops happening.
    for (const season of SEASON_KINDS) {
      expect(suppressesAlert("person", season), season).toBe(false);
      expect(suppressesAlert("birthday", season), season).toBe(false);
    }
    expect(NEVER_SUPPRESSED).toContain("person");
  });

  it("returns both halves so nothing is silently dropped", () => {
    const { shown, silenced } = alertsForSeason(
      [alert("overdue"), alert("drift"), alert("person"), alert("lowprofit")],
      "busy"
    );
    expect(shown.map((a) => a.kind)).toEqual(["overdue", "person"]);
    expect(silenced.map((a) => a.kind)).toEqual(["drift", "lowprofit"]);
    expect(shown.length + silenced.length).toBe(4);
  });

  it("shows everything in a quiet season", () => {
    const all = [alert("overdue"), alert("drift"), alert("lowprofit")];
    expect(alertsForSeason(all, "quiet").silenced).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Debts that close vs bills that recur
 * ------------------------------------------------------------------ */

describe("splitDebts", () => {
  const d = (o: Record<string, unknown> = {}) => ({
    current_balance: (o.current_balance ?? null) as number | null,
    recurring: (o.recurring ?? false) as boolean,
  });

  it("keeps arrears and standing bills apart", () => {
    const s = splitDebts([d({ recurring: false }), d({ recurring: true })]);
    expect(s.closing).toHaveLength(1);
    expect(s.recurring).toHaveLength(1);
  });

  it("treats an unflagged debt as one that closes — nothing is reclassified", () => {
    // The flag defaults false on purpose: council tax ARREARS do close, and
    // only Jay knows which of his are which.
    expect(splitDebts([{ current_balance: 100 }]).closing).toHaveLength(1);
  });

  it("excludes recurring bills from the debt-free total", () => {
    const total = closingTotal([
      d({ current_balance: 500 }),
      d({ current_balance: 200 }),
      d({ current_balance: 9999, recurring: true }),
    ]);
    expect(total).toBe(700);
  });

  it("returns null rather than zero when nothing is confirmed", () => {
    // A total of zero and a total nobody has entered are different facts.
    expect(closingTotal([d(), d()])).toBeNull();
    expect(closingTotal([])).toBeNull();
  });

  it("ignores unconfirmed balances rather than counting them as zero", () => {
    expect(closingTotal([d({ current_balance: 300 }), d()])).toBe(300);
  });
});

/* ------------------------------------------------------------------ *
 * One habit that counts
 * ------------------------------------------------------------------ */

describe("habits", () => {
  const h = (o: Record<string, unknown> = {}) => ({
    name: String(o.name ?? "h"),
    active: (o.active ?? true) as boolean,
    tracked: (o.tracked ?? true) as boolean,
    keystone: (o.keystone ?? false) as boolean,
  });

  it("finds the one the system leads with", () => {
    const rows = [h({ name: "Water" }), h({ name: "Training", keystone: true })];
    expect(keystoneHabit(rows)?.name).toBe("Training");
  });

  it("has no keystone until one is named", () => {
    expect(keystoneHabit([h(), h()])).toBeNull();
  });

  it("never leads with an inactive habit", () => {
    expect(keystoneHabit([h({ keystone: true, active: false })])).toBeNull();
  });

  it("counts only what is tracked", () => {
    const rows = [
      h({ name: "Training", keystone: true }),
      h({ name: "Water", tracked: false }),
      h({ name: "Bed", tracked: false }),
    ];
    expect(trackedHabits(rows).map((x) => x.name)).toEqual(["Training"]);
    expect(untrackedHabits(rows).map((x) => x.name)).toEqual(["Water", "Bed"]);
  });

  it("treats untracked as still doing it, not as deleted", () => {
    // Keep doing them; stop counting them. Nothing here removes a habit.
    const rows = [h({ name: "Water", tracked: false })];
    expect(untrackedHabits(rows)).toHaveLength(1);
    expect(rows[0].active).toBe(true);
  });

  it("defaults an untagged habit to tracked, so nothing vanishes on migration", () => {
    expect(trackedHabits([{ active: true }])).toHaveLength(1);
  });
});

/* ================================================================== *
 * LIFE_OS annotates EMPIRE_OS
 *
 * The design risk, stated in the spec and tested here: if every empire
 * alert carries a life excuse, "busy season" becomes wallpaper. So the
 * tests that matter most are the ones asserting SILENCE.
 * ================================================================== */

describe("annotationFor", () => {
  const quiet: LifeContext = {
    season: "quiet",
    capacity: 3,
    trainingPerWeek: 4,
    floorHeld: true,
  };

  it("says nothing when the life explains nothing", () => {
    // Quiet season, floor intact. There is no excuse to offer, so the
    // system offers none — this is the case that keeps the annotation
    // meaningful in every other case.
    expect(annotationFor(quiet)).toBeNull();
  });

  it("explains with the narrowed season, and carries the slot count", () => {
    const a = annotationFor({ ...quiet, season: "busy", capacity: 1 });
    expect(a).toContain("busy");
    expect(a).toContain("1 venture slot");
  });

  it("explains with a breached floor, and carries the number", () => {
    const a = annotationFor({ ...quiet, floorHeld: false, trainingPerWeek: 2 });
    expect(a).toContain("2/week");
  });

  it("gives both when both are true", () => {
    const a = annotationFor({
      season: "minimum",
      capacity: 1,
      trainingPerWeek: 1,
      floorHeld: false,
    });
    expect(a).toContain("minimum");
    expect(a).toContain("1/week");
  });

  it("does not offer an UNMEASURED floor as an explanation", () => {
    // "We do not know how much he trained" explains nothing at all, and
    // printing it would be exactly the wallpaper this guards against.
    expect(
      annotationFor({ ...quiet, floorHeld: null, trainingPerWeek: null })
    ).toBeNull();
  });
});

describe("annotate", () => {
  const busy: LifeContext = {
    season: "busy",
    capacity: 1,
    trainingPerWeek: 4,
    floorHeld: true,
  };

  it("annotates a judgement about attention", () => {
    const [a] = annotate([{ kind: "drift", text: "A to Z drifting" }], busy);
    expect(a.annotation).toContain("busy");
    // And never at the cost of the alert itself.
    expect(a.text).toBe("A to Z drifting");
  });

  it("never annotates what the world punishes", () => {
    // A lapsed MOT is a fine. The season is not a defence, and putting
    // one beside it would be the system helping him excuse it.
    const [a] = annotate([{ kind: "legal", text: "MOT lapsed 3d ago" }], busy);
    expect(a.annotation).toBeNull();
  });

  it("never annotates a person going quiet", () => {
    const [a] = annotate([{ kind: "person", text: "Mum — 40d" }], busy);
    expect(a.annotation).toBeNull();
  });

  it("annotates nothing at all in a quiet season with the floor held", () => {
    const out = annotate(
      [
        { kind: "drift", text: "A to Z drifting" },
        { kind: "lowprofit", text: "margin under floor" },
      ],
      { season: "quiet", capacity: 3, trainingPerWeek: 5, floorHeld: true }
    );
    expect(out.every((a) => a.annotation === null)).toBe(true);
  });

  it("never suppresses — every alert survives annotation", () => {
    const alerts = [
      { kind: "drift", text: "a" },
      { kind: "legal", text: "b" },
      { kind: "person", text: "c" },
    ];
    expect(annotate(alerts, busy)).toHaveLength(alerts.length);
  });
});

/* ================================================================== *
 * The keystone: what you named, against what is happening
 * ================================================================== */

describe("keystoneStanding — a claim is not a fact", () => {
  const K = { id: "h1" };
  const TODAY_K = "2026-08-14";
  const log = (id: string, on: string) => ({ habit_id: id, done_on: on });

  it("says nothing at all when no keystone is named", () => {
    const s = keystoneStanding(null, [], TODAY_K);
    expect(s.state).toBe("none");
    expect(s.hits).toBe(0);
    expect(s.daysSince).toBeNull();
  });

  // Jay's real state on 2026-08-14: Training is the keystone, one log ever.
  it("calls a named keystone with nothing recent a CLAIM, not a failure", () => {
    const s = keystoneStanding(K, [log("h1", "2026-07-01")], TODAY_K);
    expect(s.state).toBe("claimed");
    expect(s.hits).toBe(0);
    expect(s.daysSince).toBe(44);
  });

  it("earns it on a single log inside the window", () => {
    const s = keystoneStanding(K, [log("h1", "2026-08-10")], TODAY_K);
    expect(s.state).toBe("earned");
    expect(s.hits).toBe(1);
  });

  it("counts only this habit's logs", () => {
    const s = keystoneStanding(K, [log("h2", "2026-08-13")], TODAY_K);
    expect(s.state).toBe("claimed");
    expect(s.hits).toBe(0);
  });

  // A fortnight, so one quiet weekend cannot flip a standing decision.
  it("uses a fortnight, matching the other two windows in the system", () => {
    expect(KEYSTONE_WINDOW_DAYS).toBe(14);
    expect(keystoneStanding(K, [log("h1", "2026-08-01")], TODAY_K).state).toBe("earned");
    expect(keystoneStanding(K, [log("h1", "2026-07-31")], TODAY_K).state).toBe("claimed");
  });

  it("handles a keystone that has never been logged", () => {
    const s = keystoneStanding(K, [], TODAY_K);
    expect(s.state).toBe("claimed");
    expect(s.daysSince).toBeNull();
  });

  it("ignores a log dated in the future rather than counting it", () => {
    const s = keystoneStanding(K, [log("h1", "2026-12-01")], TODAY_K);
    expect(s.state).toBe("claimed");
    expect(s.daysSince).toBeNull();
  });
});

describe("keystoneNote", () => {
  const K = { id: "h1" };
  const TODAY_K = "2026-08-14";

  it("stays silent when the claim and the data agree", () => {
    const s = keystoneStanding(K, [{ habit_id: "h1", done_on: "2026-08-12" }], TODAY_K);
    expect(keystoneNote(s, "Training")).toBeNull();
  });

  it("stays silent when there is no keystone to disagree with", () => {
    expect(keystoneNote(keystoneStanding(null, [], TODAY_K), "Training")).toBeNull();
  });

  it("names the gap without picking a side", () => {
    const s = keystoneStanding(K, [{ habit_id: "h1", done_on: "2026-07-01" }], TODAY_K);
    const note = keystoneNote(s, "Training")!;
    expect(note).toContain("Training");
    expect(note).toContain("44 days ago");
    expect(note).toContain("One of the two is out of date");
  });

  it("has a separate line for never logged", () => {
    const note = keystoneNote(keystoneStanding(K, [], TODAY_K), "Training")!;
    expect(note).toContain("never been logged");
  });

  // It must not imply failure. The habit board exists because six open
  // checkboxes was six ways to fail before breakfast.
  it("never scolds, at any stage", () => {
    const cases = [
      keystoneStanding(K, [], TODAY_K),
      keystoneStanding(K, [{ habit_id: "h1", done_on: "2026-01-01" }], TODAY_K),
    ];
    for (const s of cases) {
      const note = (keystoneNote(s, "Training") ?? "").toLowerCase();
      for (const word of ["missed", "behind", "failed", "should", "broken", "only"]) {
        expect(note, `"${word}" in: ${note}`).not.toContain(word);
      }
    }
  });
});
