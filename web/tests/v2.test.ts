import { describe, it, expect } from "vitest";
import {
  focusList,
  pickThree,
  rankForToday,
  todayProgress,
  FOCUS_VISIBLE,
  FOCUS_ON_DECK,
  TODAY_LIMIT,
  normaliseTab,
  BRAIN_TABS,
  BRAIN_TAB_LABEL,
  BRAIN_TAB_QUESTION,
  areaToAsk,
  gratitudePrompt,
  GRATITUDE_PROMPTS,
  readCheckin,
  checkinProgress,
  isAnswered,
  isSettled,
  EMPTY_CHECKIN,
  CHECKIN_FLOOR,
  REFLECTION_TARGET,
  reflectionWeeks,
  moodTrend,
  addDays,
  type CheckinField,
  type PersonRow,
  TIERS,
  TIER_CADENCE,
  TIER_LABEL,
  TIER_HINT,
  tierForCadence,
  personStatus,
  cadenceWatchtower,
  CADENCE_SURFACED,
  occasions,
  rosterProgress,
  nextToSet,
  ROSTER_TARGET,
  type PayoffDebt,
  MONEY_TABS,
  MONEY_TAB_LABEL,
  MONEY_TAB_QUESTION,
  normaliseMoneyTab,
  normaliseStrategy,
  payoffOrder,
  canAvalanche,
  payoffPlan,
  strategyCost,
  monthlyPlan,
  thermometers,
  nextBalanceToConfirm,
  netWorth,
  cashflow,
  buffer,
  type HealthDay,
  readinessBand,
  loadState,
  sessionLoad,
  LOAD_SPIKE_RATIO,
  bigFourBests,
  BIG_FOUR,
  e1rm,
  E1RM_REP_CEILING,
  nutritionState,
} from "../src/lib/logic";
import {
  INLINE_FIELDS,
  parseInline,
  unknowns,
  type InlineKey,
} from "../src/lib/inline";
import { readFileSync } from "node:fs";

const TODAY = "2026-08-10";

type T = {
  id: string;
  title: string;
  status: "open" | "doing" | "done" | "dropped" | "waiting";
  priority: "High" | "Med" | "Low";
  do_date: string | null;
  due_date: string | null;
  /** Optional exactly as it is on `Task` — most tests have no use for it. */
  created_at?: string | null;
};

function task(id: string, over: Partial<T> = {}): T {
  return {
    id,
    title: id,
    status: "open",
    priority: "Med",
    do_date: null,
    due_date: null,
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * Focus — three visible, two on deck
 * ------------------------------------------------------------------ */

describe("focusList", () => {
  it("shows three and never more, whatever the drawer holds", () => {
    // The cap is the whole reason the dashboard exists. If the drawer can
    // push a fourth item into `visible`, pickThree has been undone by the
    // back door and nobody would notice until the page is a list again.
    const many = Array.from({ length: 20 }, (_, i) => task(`t${i}`));
    const f = focusList(many, TODAY);
    expect(f.visible).toHaveLength(FOCUS_VISIBLE);
    expect(f.visible).toHaveLength(TODAY_LIMIT);
    expect(f.onDeck).toHaveLength(FOCUS_ON_DECK);
  });

  it("takes the on-deck two from the same queue, in the same order", () => {
    // Not a second opinion about what matters — literally the next two.
    const many = Array.from({ length: 10 }, (_, i) => task(`t${i}`));
    const ranked = rankForToday(many, TODAY);
    const f = focusList(many, TODAY);
    expect(f.visible.map((t) => t.id)).toEqual(ranked.slice(0, 3).map((t) => t.id));
    expect(f.onDeck.map((t) => t.id)).toEqual(ranked.slice(3, 5).map((t) => t.id));
  });

  it("agrees with pickThree exactly, so the two cannot drift", () => {
    const many = [
      task("a", { priority: "Low" }),
      task("b", { do_date: TODAY }),
      task("c", { due_date: "2026-08-12" }),
      task("d", { priority: "High" }),
      task("e", { status: "doing", priority: "High" }),
    ];
    expect(focusList(many, TODAY).visible).toEqual(pickThree(many, TODAY));
  });

  it("counts every open item as the total, including the five it showed", () => {
    const many = Array.from({ length: 9 }, (_, i) => task(`t${i}`));
    const f = focusList(many, TODAY);
    expect(f.openTotal).toBe(9);
    expect(f.beyond).toBe(9 - FOCUS_VISIBLE - FOCUS_ON_DECK);
  });

  it("never reports work hiding beyond the drawer when there is none", () => {
    // "4 more not shown" when nothing is hidden would be a small lie, and
    // the copy is built from this number.
    const f = focusList([task("a"), task("b")], TODAY);
    expect(f.beyond).toBe(0);
    expect(f.onDeck).toHaveLength(0);
  });

  it("ignores done, dropped and waiting work in every slot", () => {
    const f = focusList(
      [
        task("done", { status: "done" }),
        task("dropped", { status: "dropped" }),
        task("waiting", { status: "waiting" }),
        task("live"),
      ],
      TODAY
    );
    expect(f.visible.map((t) => t.id)).toEqual(["live"]);
    expect(f.openTotal).toBe(1);
  });

  it("puts today's work first, then deadlines, then high priority", () => {
    const f = focusList(
      [
        task("next"),
        task("high", { priority: "High" }),
        task("deadline", { due_date: "2026-08-12" }),
        task("today", { do_date: TODAY }),
      ],
      TODAY
    );
    expect(f.visible.map((t) => t.id)).toEqual(["today", "deadline", "high"]);
    expect(f.onDeck.map((t) => t.id)).toEqual(["next"]);
  });

  it("leaves the TODAY counter alone — the drawer is not more today", () => {
    // The two on deck are planning space. If opening the drawer moved the
    // n/3 counter, the counter would be measuring the drawer rather than
    // the day, and the number Jay checks in the morning would move for a
    // reason he did not cause.
    const tasks = [
      task("a", { do_date: TODAY }),
      task("b", { do_date: TODAY, status: "done" }),
      ...Array.from({ length: 6 }, (_, i) => task(`later${i}`)),
    ];
    const before = todayProgress(tasks, TODAY);
    const f = focusList(tasks, TODAY);
    expect(f.onDeck.length).toBeGreaterThan(0);
    expect(todayProgress(tasks, TODAY)).toEqual(before);
    expect(before.done).toBe(1);
    expect(before.of).toBe(3);
  });

  it("handles an empty list without inventing a drawer", () => {
    expect(focusList([], TODAY)).toEqual({
      visible: [],
      onDeck: [],
      openTotal: 0,
      beyond: 0,
    });
  });
});

/* ------------------------------------------------------------------ *
 * The four tabs
 * ------------------------------------------------------------------ */

describe("the command centre's four tabs", () => {
  it("is exactly Now · Attention · Systems · Trend", () => {
    expect(BRAIN_TABS).toEqual(["now", "attention", "systems", "trend"]);
  });

  it("gives every tab a label and a distinct question", () => {
    // The rule is that a tab exists only if it answers a question the
    // others cannot, so two tabs sharing a question means one of them
    // should not be there.
    const questions = BRAIN_TABS.map((t) => BRAIN_TAB_QUESTION[t]);
    expect(new Set(questions).size).toBe(BRAIN_TABS.length);
    for (const t of BRAIN_TABS) {
      expect(BRAIN_TAB_LABEL[t]).toBeTruthy();
      expect(BRAIN_TAB_QUESTION[t]).toMatch(/\?$/);
    }
  });

  it("falls back to Now for anything it does not recognise", () => {
    // A mistyped tab should show him his day, not an empty page.
    for (const bad of ["", "  ", "Now", "trends", "attention ", null, undefined]) {
      expect(normaliseTab(bad as string | null | undefined)).toBe("now");
    }
  });

  it("accepts each real tab, and the first value of a repeated parameter", () => {
    for (const t of BRAIN_TABS) expect(normaliseTab(t)).toBe(t);
    expect(normaliseTab(["trend", "systems"])).toBe("trend");
    expect(normaliseTab([])).toBe("now");
  });
});

/* ------------------------------------------------------------------ *
 * The daily close
 * ------------------------------------------------------------------ */

describe("areaToAsk", () => {
  const area = (id: string, score: number | null, sort: number) => ({
    id,
    name: id,
    score,
    sort_order: sort,
  });

  it("asks about an unscored area before any scored one", () => {
    // Deliberately the OPPOSITE of rankAreasByNeed, which ranks unscored
    // last because an area you have never looked at is unknown rather than
    // failing. Here the job is to close the gap, so unknown is exactly what
    // is worth asking about.
    const picked = areaToAsk(
      [area("terrible", 1, 1), area("never-looked", null, 2), area("fine", 9, 3)],
      "2026-08-10"
    );
    expect(picked?.id).toBe("never-looked");
  });

  it("asks about the worst score once every area has one", () => {
    expect(
      areaToAsk([area("good", 8, 1), area("bad", 2, 2), area("ok", 5, 3)], "2026-08-10")?.id
    ).toBe("bad");
  });

  it("treats a zero as a real score, not as unscored", () => {
    // Null means "not yet scored"; zero means "scored, and it is that bad".
    const picked = areaToAsk([area("zero", 0, 1), area("five", 5, 2)], "2026-08-10");
    expect(picked?.id).toBe("zero");
  });

  it("rotates between tied areas so a fresh account is not asked the same one for a fortnight", () => {
    const fresh = Array.from({ length: 13 }, (_, i) => area(`a${i}`, null, i));
    const asked = new Set(
      Array.from({ length: 13 }, (_, d) => areaToAsk(fresh, addDays("2026-08-10", d))?.id)
    );
    expect(asked.size).toBe(13);
  });

  it("is stable within a day", () => {
    const fresh = Array.from({ length: 5 }, (_, i) => area(`a${i}`, null, i));
    expect(areaToAsk(fresh, "2026-08-10")?.id).toBe(areaToAsk(fresh, "2026-08-10")?.id);
  });

  it("returns null rather than inventing an area when there are none", () => {
    expect(areaToAsk([], "2026-08-10")).toBeNull();
  });
});

describe("gratitudePrompt", () => {
  it("holds for a week and moves on the Monday", () => {
    // Emmons: weekly beats daily, because answering the same question every
    // night is how you end up writing the same three words by Thursday.
    const mon = "2026-08-10";
    for (let d = 0; d < 7; d++) {
      expect(gratitudePrompt(addDays(mon, d)), `day ${d}`).toBe(gratitudePrompt(mon));
    }
    expect(gratitudePrompt(addDays(mon, 7))).not.toBe(gratitudePrompt(mon));
  });

  it("only ever returns a prompt from the list", () => {
    for (let d = 0; d < 400; d += 7) {
      expect(GRATITUDE_PROMPTS).toContain(gratitudePrompt(addDays("2026-01-05", d)));
    }
  });
});

describe("readCheckin", () => {
  it("returns an empty check-in for a night with no row", () => {
    expect(readCheckin(null)).toEqual(EMPTY_CHECKIN);
    expect(readCheckin(undefined)).toEqual(EMPTY_CHECKIN);
  });

  it("discards anything meta holds that it does not recognise", () => {
    // meta is jsonb and therefore untrusted (§A7). A page he opened to read
    // must not throw because a row holds a number where a string was
    // expected.
    const c = readCheckin({
      mood: 4,
      energy: "loads",
      gratitude: 12,
      meta: { wins: ["a", "b"], friction: "traffic", tomorrow: "  ", skipped: "gratitude" },
    });
    expect(c.mood).toBe(4);
    expect(c.energy).toBeNull();
    expect(c.gratitude).toBeNull();
    expect(c.wins).toBeNull();
    expect(c.friction).toBe("traffic");
    expect(c.tomorrow).toBeNull();
    expect(c.skipped).toEqual([]);
  });

  it("survives meta being an array, a string or missing entirely", () => {
    for (const meta of [[], "nope", null, undefined, 7]) {
      expect(() => readCheckin({ mood: 3, meta })).not.toThrow();
      expect(readCheckin({ mood: 3, meta }).wins).toBeNull();
    }
  });

  it("rejects a mood outside 1–5 rather than clamping it", () => {
    // Clamping would turn a bad write into a plausible reading, and the
    // average would then be built on a number nobody entered.
    for (const bad of [0, 6, 2.5, -1, NaN]) {
      expect(readCheckin({ mood: bad }).mood).toBeNull();
    }
    for (const good of [1, 2, 3, 4, 5]) {
      expect(readCheckin({ mood: good }).mood).toBe(good);
    }
  });

  it("keeps only real field names in the skip list", () => {
    expect(
      readCheckin({ meta: { skipped: ["wins", "nonsense", 4, "tomorrow"] } }).skipped
    ).toEqual(["wins", "tomorrow"]);
  });

  it("accepts an area score of zero", () => {
    expect(readCheckin({ meta: { area_id: "x", area_score: 0 } }).areaScore).toBe(0);
    expect(readCheckin({ meta: { area_id: "x", area_score: 11 } }).areaScore).toBeNull();
  });
});

describe("checkinProgress", () => {
  const base = { ...EMPTY_CHECKIN };

  it("counts the day as logged on the floor alone", () => {
    // Two taps is the whole obligation. If the floor needed more than mood
    // and energy, the streak would be unreachable on a bad evening, which
    // is exactly the evening it exists for.
    expect(checkinProgress({ ...base, mood: 3, energy: 2 }).logged).toBe(true);
    expect(checkinProgress({ ...base, mood: 3 }).logged).toBe(false);
    expect(CHECKIN_FLOOR).toEqual(["mood", "energy"]);
  });

  it("never counts a skip as an answer", () => {
    const c = { ...base, skipped: ["wins", "gratitude"] as CheckinField[] };
    expect(checkinProgress(c).answered).toBe(0);
    expect(checkinProgress(c).skipped).toBe(2);
  });

  it("resumes at the first field that is neither answered nor skipped", () => {
    expect(checkinProgress({ ...base, mood: 3 }).next).toBe("energy");
    expect(
      checkinProgress({ ...base, mood: 3, energy: 3, skipped: ["wins"] as CheckinField[] })
        .next
    ).toBe("friction");
  });

  it("is done when every field is settled one way or the other", () => {
    const c = {
      ...base,
      mood: 3,
      energy: 3,
      skipped: ["wins", "friction", "gratitude", "tomorrow", "area"] as CheckinField[],
    };
    expect(checkinProgress(c).done).toBe(true);
    expect(checkinProgress(c).answered).toBe(2);
  });

  it("treats an answered field as settled even if it is also in the skip list", () => {
    // He skipped it, then came back and answered it. The answer wins.
    const c = { ...base, wins: "shipped it", skipped: ["wins"] as CheckinField[] };
    expect(isAnswered(c, "wins")).toBe(true);
    expect(isSettled(c, "wins")).toBe(true);
    expect(checkinProgress(c).skipped).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * The reflection streak — weeks, not days
 * ------------------------------------------------------------------ */

describe("reflectionWeeks", () => {
  const MONDAY = "2026-08-10"; // a Monday
  const days = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) => addDays(from, i));

  it("counts a week as good at four entries, not seven", () => {
    // A daily streak resets on one missed evening, and the reset is what
    // ends the habit rather than the missed day.
    const { weeks } = reflectionWeeks(days(MONDAY, 4), addDays(MONDAY, 6), 2);
    expect(weeks[1].entries).toBe(4);
    expect(weeks[1].met).toBe(true);
    expect(REFLECTION_TARGET).toBe(4);
  });

  it("does not fail the current week for being incomplete", () => {
    // It is Tuesday. Two entries is not a failure yet, and calling it one
    // would be calling it early.
    const prior = days(addDays(MONDAY, -7), 5);
    const { streak } = reflectionWeeks([...prior, MONDAY], addDays(MONDAY, 1), 3);
    expect(streak).toBe(1);
  });

  it("counts the current week once it has genuinely met the target", () => {
    const prior = days(addDays(MONDAY, -7), 5);
    const { streak } = reflectionWeeks([...prior, ...days(MONDAY, 4)], addDays(MONDAY, 4), 3);
    expect(streak).toBe(2);
  });

  it("breaks the run on a completed week that missed, not on a gap day", () => {
    const twoBack = days(addDays(MONDAY, -14), 5);
    const oneBack = days(addDays(MONDAY, -7), 2); // a bad week
    const { streak } = reflectionWeeks(
      [...twoBack, ...oneBack, ...days(MONDAY, 5)],
      addDays(MONDAY, 6),
      4
    );
    expect(streak).toBe(1);
  });

  it("reports every requested week, oldest first, with no entries at all", () => {
    const { weeks, streak } = reflectionWeeks([], MONDAY, 6);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.entries === 0 && !w.met)).toBe(true);
    expect(weeks[0].monday < weeks[5].monday).toBe(true);
    expect(streak).toBe(0);
  });
});

describe("moodTrend", () => {
  it("averages only what was actually answered", () => {
    // A skipped question contributes no reading, so an evening he passed on
    // must not be averaged as a bad one.
    const t = moodTrend(
      [
        { entry_date: "2026-08-10", mood: 4, energy: null },
        { entry_date: "2026-08-09", mood: 2, energy: 3 },
        { entry_date: "2026-08-08", mood: null, energy: null },
      ],
      "2026-08-10"
    );
    expect(t.mood).toBe(3);
    expect(t.energy).toBe(3);
    expect(t.of).toBe(3);
  });

  it("returns null rather than zero when nothing has been logged", () => {
    // £0 and £— are different facts, and so are 0.0 and "not yet".
    expect(moodTrend([], "2026-08-10")).toEqual({ mood: null, energy: null, of: 0 });
  });

  it("ignores anything outside the window", () => {
    const t = moodTrend(
      [
        { entry_date: "2026-08-10", mood: 5 },
        { entry_date: "2026-07-01", mood: 1 },
      ],
      "2026-08-10",
      14
    );
    expect(t.mood).toBe(5);
    expect(t.of).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * The dash is the input
 * ------------------------------------------------------------------ */

describe("parseInline", () => {
  it("treats an empty box as a return to unknown, not as an error", () => {
    // Clearing a figure has to be as easy as entering one, or a mistyped
    // balance is stuck there forever and the total quietly lies.
    for (const key of Object.keys(INLINE_FIELDS) as InlineKey[]) {
      expect(parseInline(key, "   ")).toEqual({ ok: true, value: null });
    }
  });

  it("refuses a negative balance rather than storing it", () => {
    expect(parseInline("debts.current_balance", "-5").ok).toBe(false);
    expect(parseInline("debts.current_balance", "0")).toEqual({ ok: true, value: 0 });
    expect(parseInline("debts.current_balance", "1234.56")).toEqual({
      ok: true,
      value: 1234.56,
    });
  });

  it("refuses a date that does not exist", () => {
    // type=date will not produce one, but a paste or an autofill can.
    expect(parseInline("vehicles.mot_due", "2026-02-31").ok).toBe(false);
    expect(parseInline("vehicles.mot_due", "31/03/2026").ok).toBe(false);
    expect(parseInline("vehicles.mot_due", "2026-03-31")).toEqual({
      ok: true,
      value: "2026-03-31",
    });
  });

  it("holds a cadence to whole days inside a sane range", () => {
    expect(parseInline("people.cadence_days", "14")).toEqual({ ok: true, value: 14 });
    expect(parseInline("people.cadence_days", "7.5").ok).toBe(false);
    expect(parseInline("people.cadence_days", "0").ok).toBe(false);
    expect(parseInline("people.cadence_days", "99999").ok).toBe(false);
  });

  it("rejects text where a number belongs", () => {
    expect(parseInline("debts.plan_amount", "about fifty").ok).toBe(false);
    expect(parseInline("debts.plan_amount", "Infinity").ok).toBe(false);
  });

  it("keeps text fields as typed, trimmed", () => {
    expect(parseInline("pillars.status_line", "  debt-heavy, plan in motion  ")).toEqual({
      ok: true,
      value: "debt-heavy, plan in motion",
    });
  });
});

describe("the inline allowlist", () => {
  it("gives every field a real prompt rather than N/A", () => {
    // A missing value renders as its own prompt. "N/A" tells him nothing
    // about what would fill it, which is the one thing the row is for.
    for (const [key, f] of Object.entries(INLINE_FIELDS)) {
      expect(f.placeholder, key).toBeTruthy();
      expect(f.placeholder.toLowerCase(), key).not.toContain("n/a");
      expect(f.label, key).toBeTruthy();
      expect(key).toBe(`${f.table}.${f.column}`);
    }
  });
});

describe("unknowns", () => {
  const debt = (id: string, balance: number | null, status = "active") => ({
    id,
    creditor: id,
    status,
    current_balance: balance,
  });
  const vehicle = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    name: id,
    registration: null,
    status: "active",
    tax_due: null,
    mot_due: null,
    insurance_due: null,
    ...over,
  }) as Parameters<typeof unknowns>[0]["vehicles"][number];

  it("lists every missing balance and every missing vehicle date", () => {
    const out = unknowns({
      debts: [debt("a", null), debt("b", 200)],
      vehicles: [vehicle("v", { tax_due: "2026-09-01" })],
    });
    expect(out.map((u) => `${u.key}:${u.id}`)).toEqual([
      "debts.current_balance:a",
      "vehicles.mot_due:v",
      "vehicles.insurance_due:v",
    ]);
  });

  it("counts a zero balance as known", () => {
    // Zero and "not yet" are different facts, and a settled debt is not a gap.
    expect(unknowns({ debts: [debt("paid", 0)], vehicles: [] })).toEqual([]);
  });

  it("ignores settled debts and retired vehicles", () => {
    const out = unknowns({
      debts: [debt("cleared", null, "cleared")],
      vehicles: [vehicle("sold", { status: "sold" })],
    });
    expect(out).toEqual([]);
  });

  it("says nothing at all when nothing is missing", () => {
    // A list that congratulates you every day is a list you scroll past.
    expect(
      unknowns({
        debts: [debt("a", 100)],
        vehicles: [
          vehicle("v", {
            tax_due: "2026-09-01",
            mot_due: "2026-09-02",
            insurance_due: "2026-09-03",
          }),
        ],
      })
    ).toEqual([]);
  });

  it("names the vehicle by its registration when it has one", () => {
    const [first] = unknowns({
      debts: [],
      vehicles: [vehicle("BMW", { registration: "ME54 JAY" })],
    });
    expect(first.subject).toBe("BMW · ME54 JAY");
  });

  it("only ever produces keys the allowlist knows", () => {
    const out = unknowns({
      debts: [debt("a", null)],
      vehicles: [vehicle("v")],
    });
    for (const u of out) expect(Object.keys(INLINE_FIELDS)).toContain(u.key);
  });
});

/* ------------------------------------------------------------------ *
 * People — cadence, occasions, the roster
 * ------------------------------------------------------------------ */

const person = (over: Partial<PersonRow> = {}): PersonRow => ({
  id: over.name ?? "p",
  name: "Somebody",
  relationship: null,
  last_contact: null,
  cadence_days: null,
  birthday: null,
  ...over,
});

describe("Dunbar tiers", () => {
  it("uses the layers as the cadence, because that is what defines them", () => {
    expect(TIER_CADENCE).toEqual({ inner: 7, close: 30, band: 90, wider: 365 });
    expect(TIERS).toEqual(["inner", "close", "band", "wider"]);
  });

  it("names the tier a stored cadence is closest to, for showing it back", () => {
    expect(tierForCadence(7)).toBe("inner");
    expect(tierForCadence(28)).toBe("close");
    expect(tierForCadence(100)).toBe("band");
    expect(tierForCadence(400)).toBe("wider");
  });

  it("returns null for no cadence rather than guessing one", () => {
    expect(tierForCadence(null)).toBeNull();
    expect(tierForCadence(undefined)).toBeNull();
  });

  it("gives every tier a label and a hint in plain English", () => {
    for (const t of TIERS) {
      expect(TIER_LABEL[t]).toBeTruthy();
      expect(TIER_HINT[t]).toBeTruthy();
    }
  });
});

describe("personStatus", () => {
  it("never calls somebody overdue when no cadence has been set", () => {
    // Nobody said how often. That is a gap to fill, not a failure to report
    // — exactly like an unrecorded MOT date.
    const s = personStatus(person({ last_contact: "2020-01-01" }), TODAY);
    expect(s.state).toBe("no_cadence");
    expect(s.over).toBeNull();
  });

  it("never calls somebody overdue when there is no clock to be past", () => {
    const s = personStatus(person({ cadence_days: 7 }), TODAY);
    expect(s.state).toBe("never");
    expect(s.since).toBeNull();
  });

  it("reports overdue with how far past the cadence it is", () => {
    const s = personStatus(
      person({ cadence_days: 14, last_contact: addDays(TODAY, -47) }),
      TODAY
    );
    expect(s.state).toBe("overdue");
    expect(s.since).toBe(47);
    expect(s.over).toBe(33);
  });

  it("nudges at four fifths of the cadence, so the window scales", () => {
    // A fixed seven-day window would make a yearly contact useless and a
    // weekly one constant.
    expect(personStatus(person({ cadence_days: 7, last_contact: addDays(TODAY, -6) }), TODAY).state).toBe("due");
    expect(personStatus(person({ cadence_days: 7, last_contact: addDays(TODAY, -3) }), TODAY).state).toBe("ok");
    expect(personStatus(person({ cadence_days: 365, last_contact: addDays(TODAY, -300) }), TODAY).state).toBe("due");
    expect(personStatus(person({ cadence_days: 365, last_contact: addDays(TODAY, -200) }), TODAY).state).toBe("ok");
  });

  it("treats contact today as in touch", () => {
    const s = personStatus(person({ cadence_days: 7, last_contact: TODAY }), TODAY);
    expect(s.state).toBe("ok");
    expect(s.since).toBe(0);
  });
});

describe("cadenceWatchtower", () => {
  it("surfaces at most three, however many are overdue", () => {
    // A list of eleven people you have let down is a page you close.
    const many = Array.from({ length: 11 }, (_, i) =>
      person({ id: `p${i}`, name: `P${i}`, cadence_days: 7, last_contact: addDays(TODAY, -60) })
    );
    const w = cadenceWatchtower(many, TODAY);
    expect(w.surfaced).toHaveLength(CADENCE_SURFACED);
    expect(w.alsoOverdue).toBe(8);
  });

  it("ranks by how far past the cadence proportionally, not in raw days", () => {
    // Two weeks past a weekly friend is much louder than two weeks past a
    // yearly one; sorting on raw days would bury the first forever.
    const w = cadenceWatchtower(
      [
        person({ id: "yearly", name: "yearly", cadence_days: 365, last_contact: addDays(TODAY, -400) }),
        person({ id: "weekly", name: "weekly", cadence_days: 7, last_contact: addDays(TODAY, -21) }),
      ],
      TODAY
    );
    expect(w.surfaced[0].person.id).toBe("weekly");
  });

  it("counts the unmeasured separately rather than calling them overdue", () => {
    const w = cadenceWatchtower(
      [person({ id: "a" }), person({ id: "b", cadence_days: 30 })],
      TODAY
    );
    expect(w.surfaced).toHaveLength(0);
    expect(w.unset).toBe(2);
  });

  it("says nothing when nobody has drifted", () => {
    const w = cadenceWatchtower(
      [person({ cadence_days: 30, last_contact: TODAY })],
      TODAY
    );
    expect(w).toEqual({ surfaced: [], alsoOverdue: 0, unset: 0 });
  });
});

describe("occasions", () => {
  it("looks 60 days ahead and flags what is inside the lead time", () => {
    // A birthday you learn about on the day is a text; one you learn about
    // a fortnight out is a present.
    const list = occasions(
      [
        person({ id: "soon", name: "Soon", birthday: shiftYear(addDays(TODAY, 10)) }),
        person({ id: "later", name: "Later", birthday: shiftYear(addDays(TODAY, 40)) }),
        person({ id: "far", name: "Far", birthday: shiftYear(addDays(TODAY, 90)) }),
      ],
      TODAY
    );
    expect(list.map((o) => o.personId)).toEqual(["soon", "later"]);
    expect(list[0].soon).toBe(true);
    expect(list[1].soon).toBe(false);
  });

  it("orders by how close it is, soonest first", () => {
    const list = occasions(
      [
        person({ id: "b", name: "B", birthday: shiftYear(addDays(TODAY, 30)) }),
        person({ id: "a", name: "A", birthday: shiftYear(addDays(TODAY, 5)) }),
      ],
      TODAY
    );
    expect(list.map((o) => o.personId)).toEqual(["a", "b"]);
  });

  it("ignores anybody with no birthday recorded", () => {
    expect(occasions([person({ id: "x" })], TODAY)).toEqual([]);
  });

  it("gives the date it falls on this time round, not the birth year", () => {
    const [o] = occasions(
      [person({ id: "x", name: "X", birthday: shiftYear(addDays(TODAY, 3)) })],
      TODAY
    );
    expect(o.on).toBe(addDays(TODAY, 3));
    expect(o.on.slice(0, 4)).toBe(TODAY.slice(0, 4));
  });
});

describe("the roster", () => {
  it("measures usefulness by cadences set, not by names entered", () => {
    // Five people with cadences beats fifteen names with none, because the
    // cadence is the thing that makes the feature work at all.
    const named = Array.from({ length: 15 }, (_, i) => person({ id: `p${i}`, name: `P${i}` }));
    expect(rosterProgress(named).useful).toBe(false);
    const five = named.map((p, i) => (i < 5 ? { ...p, cadence_days: 30 } : p));
    expect(rosterProgress(five).useful).toBe(true);
    expect(rosterProgress(five).withCadence).toBe(5);
  });

  it("asks next about somebody with a name and no cadence", () => {
    // The cheapest possible win: one tap turns a dead row into a live one.
    const next = nextToSet([
      person({ id: "set", name: "Set", cadence_days: 30 }),
      person({ id: "unset", name: "Unset" }),
    ]);
    expect(next?.id).toBe("unset");
  });

  it("has nothing to ask once everybody is measured", () => {
    expect(nextToSet([person({ id: "a", cadence_days: 7 })])).toBeNull();
    expect(nextToSet([])).toBeNull();
  });

  it("aims at fifteen — a practice, not a database", () => {
    expect(ROSTER_TARGET).toBe(15);
  });
});

/** Push a date back a plausible number of years, keeping month and day. */
function shiftYear(iso: string): string {
  return `${Number(iso.slice(0, 4)) - 30}${iso.slice(4)}`;
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

const debt = (over: Partial<PayoffDebt> = {}): PayoffDebt => ({
  id: over.creditor ?? "d",
  creditor: "Creditor",
  status: "active",
  current_balance: null,
  original_amount: null,
  plan_amount: null,
  plan_frequency: null,
  apr: null,
  ...over,
});

const planned = (over: Partial<PayoffDebt> = {}): PayoffDebt =>
  debt({ current_balance: 1000, plan_amount: 100, plan_frequency: "monthly", ...over });

describe("money tabs", () => {
  it("carries the six sub-modules of the MONEY parent area", () => {
    // Accounts and Vehicles joined on 13 Aug: both were sibling ROUTES to
    // Money when they are plainly parts of it. A vehicle is a recurring
    // cost and a set of legal deadlines, and filing it as neither is why
    // four MOT dates went unrecorded and the Zafira's lapsed unnoticed.
    expect(MONEY_TABS).toEqual([
      "debt",
      "accounts",
      "vehicles",
      "worth",
      "cashflow",
      "buffer",
    ]);
    for (const t of MONEY_TABS) {
      expect(MONEY_TAB_LABEL[t]).toBeTruthy();
      expect(MONEY_TAB_QUESTION[t]).toMatch(/\?$/);
    }
  });

  it("falls back to the debt view for anything unrecognised", () => {
    expect(normaliseMoneyTab("nonsense")).toBe("debt");
    expect(normaliseMoneyTab(null)).toBe("debt");
    expect(normaliseMoneyTab("buffer")).toBe("buffer");
  });

  it("defaults to avalanche, the one that costs less", () => {
    expect(normaliseStrategy(null)).toBe("avalanche");
    expect(normaliseStrategy("snowball")).toBe("snowball");
    expect(normaliseStrategy("Snowball")).toBe("avalanche");
  });
});

describe("payoffOrder", () => {
  it("puts the highest interest first on avalanche", () => {
    const order = payoffOrder(
      [
        planned({ creditor: "low", current_balance: 100, apr: 5 }),
        planned({ creditor: "high", current_balance: 5000, apr: 29 }),
      ],
      "avalanche"
    );
    expect(order.map((d) => d.creditor)).toEqual(["high", "low"]);
  });

  it("puts the smallest balance first on snowball", () => {
    const order = payoffOrder(
      [
        planned({ creditor: "big", current_balance: 5000, apr: 29 }),
        planned({ creditor: "small", current_balance: 100, apr: 5 }),
      ],
      "snowball"
    );
    expect(order.map((d) => d.creditor)).toEqual(["small", "big"]);
  });

  it("never treats an unrecorded rate as zero percent", () => {
    // Zero would sort an unrecorded credit card to the BOTTOM of the
    // avalanche and cost him real money. It falls behind every KNOWN rate
    // instead, which is the honest place for "I cannot rank this".
    const order = payoffOrder(
      [
        planned({ creditor: "unknown", current_balance: 100, apr: null }),
        planned({ creditor: "known-low", current_balance: 5000, apr: 2 }),
      ],
      "avalanche"
    );
    expect(order.map((d) => d.creditor)).toEqual(["known-low", "unknown"]);
  });

  it("sinks debts with no balance to the bottom of either ordering", () => {
    for (const s of ["avalanche", "snowball"] as const) {
      const order = payoffOrder(
        [debt({ creditor: "unmeasured" }), planned({ creditor: "measured" })],
        s
      );
      expect(order[0].creditor, s).toBe("measured");
    }
  });

  it("leaves settled debts out entirely", () => {
    expect(
      payoffOrder([planned({ creditor: "gone", status: "cleared" })], "snowball")
    ).toEqual([]);
  });
});

describe("canAvalanche", () => {
  it("refuses the ordering when no rate is recorded anywhere", () => {
    expect(canAvalanche([planned(), planned()])).toBe(false);
    expect(canAvalanche([planned(), planned({ apr: 19 })])).toBe(true);
  });

  it("ignores rates on settled debts", () => {
    expect(canAvalanche([planned({ status: "cleared", apr: 19 })])).toBe(false);
  });
});

describe("payoffPlan", () => {
  it("rolls a cleared debt's payment into the next one", () => {
    // Without the roll-over both strategies are just "pay everything at
    // once" and the ordering would not matter at all.
    const plan = payoffPlan(
      [
        planned({ creditor: "a", current_balance: 100, plan_amount: 100 }),
        planned({ creditor: "b", current_balance: 300, plan_amount: 100 }),
      ],
      "snowball"
    );
    // £200/month against £400 total = 2 months, not 3.
    expect(plan.months).toBe(2);
    expect(plan.complete).toBe(true);
  });

  it("refuses a debt-free date when a balance is unconfirmed", () => {
    // A projected date is exactly what he might plan around, so a guess
    // here is the most damaging thing this function could return.
    const plan = payoffPlan([planned(), debt({ creditor: "unknown" })], "snowball");
    expect(plan.months).toBeNull();
    expect(plan.complete).toBe(false);
  });

  it("refuses a date when a debt has a balance but no plan", () => {
    const plan = payoffPlan(
      [planned(), debt({ creditor: "no-plan", current_balance: 500 })],
      "snowball"
    );
    expect(plan.months).toBeNull();
    expect(plan.unplanned).toBe(1);
  });

  it("reports interest as unknown rather than as a smaller number", () => {
    // With one rate missing the total would understate the truth, which is
    // the flattering direction.
    const some = payoffPlan(
      [planned({ creditor: "a", apr: 20 }), planned({ creditor: "b", apr: null })],
      "avalanche"
    );
    expect(some.interest).toBeNull();
    const all = payoffPlan(
      [planned({ creditor: "a", apr: 20 }), planned({ creditor: "b", apr: 10 })],
      "avalanche"
    );
    expect(all.interest).toBeGreaterThan(0);
  });

  it("charges no interest when every rate is genuinely zero", () => {
    const plan = payoffPlan([planned({ apr: 0 })], "avalanche");
    expect(plan.interest).toBe(0);
    expect(plan.months).toBe(10);
  });

  it("converts a weekly plan to its monthly equivalent", () => {
    expect(
      Math.round(monthlyPlan({ plan_amount: 100, plan_frequency: "weekly" }))
    ).toBe(433);
    expect(monthlyPlan({ plan_amount: 100, plan_frequency: null })).toBe(0);
    expect(monthlyPlan({ plan_amount: 0, plan_frequency: "monthly" })).toBe(0);
  });
});

describe("strategyCost", () => {
  it("prices snowball in months and pounds rather than arguing about it", () => {
    const debts = [
      planned({ creditor: "small-cheap", current_balance: 500, apr: 3, plan_amount: 50 }),
      planned({ creditor: "big-dear", current_balance: 4000, apr: 30, plan_amount: 150 }),
    ];
    const cost = strategyCost(debts);
    expect(cost.extraInterest).not.toBeNull();
    // Snowball pays the cheap one first, so it can never cost LESS interest.
    expect(cost.extraInterest!).toBeGreaterThanOrEqual(0);
  });

  it("prices nothing when either plan cannot be computed", () => {
    expect(strategyCost([debt()])).toEqual({ extraMonths: null, extraInterest: null });
  });
});

describe("thermometers", () => {
  it("gives each debt its own bar rather than one total bar", () => {
    // Gal & McShane: accounts CLOSED predicts getting out, independent of
    // amount. One total bar hides the only progress that predicts finishing.
    const bars = thermometers(
      [planned({ creditor: "a" }), planned({ creditor: "b" })],
      "snowball"
    );
    expect(bars).toHaveLength(2);
  });

  it("marks a cleared debt so it visibly goes away", () => {
    const [bar] = thermometers([planned({ current_balance: 0 })], "snowball");
    expect(bar.cleared).toBe(true);
  });

  it("marks exactly one as nearest, and never a cleared one", () => {
    const bars = thermometers(
      [
        planned({ creditor: "done", current_balance: 0, original_amount: 100 }),
        planned({ creditor: "close", current_balance: 10, original_amount: 100 }),
        planned({ creditor: "far", current_balance: 90, original_amount: 100 }),
      ],
      "snowball"
    );
    expect(bars.filter((b) => b.nearest)).toHaveLength(1);
    expect(bars.find((b) => b.nearest)?.creditor).toBe("close");
  });

  it("refuses a percentage with no original amount to measure against", () => {
    const [bar] = thermometers([planned({ original_amount: null })], "snowball");
    expect(bar.percent).toBeNull();
  });

  it("computes the percentage paid off, not the percentage remaining", () => {
    const [bar] = thermometers(
      [planned({ current_balance: 250, original_amount: 1000 })],
      "snowball"
    );
    expect(bar.percent).toBe(75);
  });

  it("marks nothing when every debt is cleared", () => {
    const bars = thermometers([planned({ current_balance: 0 })], "snowball");
    expect(bars.some((b) => b.nearest)).toBe(false);
  });
});

describe("nextBalanceToConfirm", () => {
  const withDate = (d: PayoffDebt, on: string | null) => ({ ...d, confirmedOn: on });

  it("asks about a missing balance before a stale one", () => {
    // A missing balance breaks the total outright; a month-old one only
    // blurs it.
    const next = nextBalanceToConfirm(
      [
        withDate(planned({ creditor: "stale" }), addDays(TODAY, -90)),
        withDate(debt({ creditor: "missing" }), TODAY),
      ],
      TODAY
    );
    expect(next?.creditor).toBe("missing");
  });

  it("asks about the oldest confirmation once nothing is missing", () => {
    const next = nextBalanceToConfirm(
      [
        withDate(planned({ creditor: "older" }), addDays(TODAY, -120)),
        withDate(planned({ creditor: "newer" }), addDays(TODAY, -40)),
      ],
      TODAY
    );
    expect(next?.creditor).toBe("older");
  });

  it("stays quiet when everything was confirmed recently", () => {
    expect(
      nextBalanceToConfirm([withDate(planned(), addDays(TODAY, -3))], TODAY)
    ).toBeNull();
  });

  it("ignores settled debts", () => {
    expect(
      nextBalanceToConfirm([withDate(debt({ status: "cleared" }), null)], TODAY)
    ).toBeNull();
  });
});

describe("netWorth", () => {
  it("calls the figure incomplete when any debt balance is unknown", () => {
    // An unknown debt understates the debt side, which OVERSTATES net worth
    // — the flattering direction, and the one worth refusing to imply.
    const w = netWorth({
      assets: [{ value: 10000, status: "held" }],
      investments: [],
      debts: [debt({ current_balance: null })],
    });
    expect(w.complete).toBe(false);
    expect(w.net).toBe(10000);
  });

  it("is complete when every input is confirmed", () => {
    const w = netWorth({
      assets: [{ value: 10000, status: "held" }],
      investments: [{ current_value: 2000 }],
      debts: [debt({ current_balance: 3000 })],
    });
    expect(w.complete).toBe(true);
    expect(w.net).toBe(9000);
  });

  it("returns nulls rather than zero when nothing has been recorded", () => {
    // £0 net worth and "not yet told" are different facts.
    expect(netWorth({ assets: [], investments: [], debts: [] })).toEqual({
      assets: null,
      investments: null,
      debts: null,
      net: null,
      complete: false,
    });
  });

  it("leaves sold assets out", () => {
    const w = netWorth({
      assets: [
        { value: 100, status: "held" },
        { value: 900, status: "sold" },
      ],
      investments: [],
      debts: [],
    });
    expect(w.assets).toBe(100);
  });
});

describe("cashflow", () => {
  it("returns null for what is left when no income has been recorded", () => {
    // "Not told what comes in" is not "nothing comes in", and showing the
    // second as a big negative would be alarming and wrong.
    const f = cashflow({
      incomeMonthly: null,
      assets: [{ income_monthly: null, cost_monthly: 400, status: "held" }],
      debts: [planned()],
    });
    expect(f.measurable).toBe(false);
    expect(f.net).toBeNull();
    expect(f.income).toBeNull();
  });

  it("adds asset income to the recorded income and subtracts both costs", () => {
    const f = cashflow({
      incomeMonthly: 2000,
      assets: [{ income_monthly: 500, cost_monthly: 300, status: "held" }],
      debts: [planned({ plan_amount: 200, plan_frequency: "monthly" })],
    });
    expect(f.income).toBe(2500);
    expect(f.debtPayments).toBe(200);
    expect(f.net).toBe(2000);
  });
});

describe("buffer", () => {
  it("refuses to compute months from a guessed outgoing", () => {
    // A buffer built on an invented denominator is a number he might trust
    // with a decision.
    expect(buffer(6000, null).months).toBeNull();
    expect(buffer(null, 2000).months).toBeNull();
    expect(buffer(6000, 0).months).toBeNull();
  });

  it("flags under three months as thin, and says so rather than colouring it", () => {
    expect(buffer(4000, 2000).months).toBe(2);
    expect(buffer(4000, 2000).thin).toBe(true);
    expect(buffer(8000, 2000).thin).toBe(false);
  });

  it("never calls a missing buffer thin", () => {
    expect(buffer(null, null).thin).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

const day = (on_date: string, over: Partial<HealthDay> = {}): HealthDay => ({
  on_date,
  steps: null,
  active_minutes: null,
  rmssd: null,
  resting_hr: null,
  sleep_hours: null,
  weight_kg: null,
  ate_well: null,
  protein_g: null,
  calories: null,
  source: "manual",
  ...over,
});

/** `n` days of baseline ending the day before TODAY, all at `value`. */
function baseline(n: number, value: (i: number) => number): HealthDay[] {
  return Array.from({ length: n }, (_, i) =>
    day(addDays(TODAY, -(i + 1)), { rmssd: value(i) })
  );
}

describe("readinessBand", () => {
  it("says nothing at all until there is enough history", () => {
    // A green light computed from four days is worse than no light: it
    // looks like an answer and is not one.
    const r = readinessBand([...baseline(5, () => 50), day(TODAY, { rmssd: 50 })], TODAY);
    expect(r.band).toBeNull();
    expect(r.reason).toContain("normal looks like");
    expect(r.readings).toBe(5);
  });

  it("bands against his own baseline, never an absolute scale", () => {
    // The same rMSSD is green for one person and red for another, which is
    // exactly why a 0-100 score across people is meaningless.
    const low = readinessBand(
      [...baseline(30, (i) => 20 + (i % 3)), day(TODAY, { rmssd: 21 })],
      TODAY
    );
    const high = readinessBand(
      [...baseline(30, (i) => 90 + (i % 3)), day(TODAY, { rmssd: 91 })],
      TODAY
    );
    expect(low.band).toBe("green");
    expect(high.band).toBe("green");
    // And 21 against the HIGH baseline is a different story entirely.
    const crossed = readinessBand(
      [...baseline(30, (i) => 90 + (i % 3)), day(TODAY, { rmssd: 21 })],
      TODAY
    );
    expect(crossed.band).toBe("red");
  });

  it("puts one standard deviation below into amber and two into red", () => {
    // A spread of about 5 around 50.
    const days = Array.from({ length: 30 }, (_, i) =>
      day(addDays(TODAY, -(i + 1)), { rmssd: i % 2 === 0 ? 45 : 55 })
    );
    expect(readinessBand([...days, day(TODAY, { rmssd: 50 })], TODAY).band).toBe("green");
    expect(readinessBand([...days, day(TODAY, { rmssd: 43 })], TODAY).band).toBe("amber");
    expect(readinessBand([...days, day(TODAY, { rmssd: 30 })], TODAY).band).toBe("red");
  });

  it("excludes today from its own baseline", () => {
    // Comparing a value against a window containing it drags the baseline
    // toward it and flattens the signal. A very low today must not pull
    // the baseline down and talk itself back into green.
    const days = Array.from({ length: 30 }, (_, i) =>
      day(addDays(TODAY, -(i + 1)), { rmssd: i % 2 === 0 ? 48 : 52 })
    );
    const r = readinessBand([...days, day(TODAY, { rmssd: 10 })], TODAY);
    expect(r.baseline).toBe(50);
    expect(r.band).toBe("red");
  });

  it("has no band on a day with no reading, and says why", () => {
    const r = readinessBand(baseline(30, () => 50), TODAY);
    expect(r.band).toBeNull();
    expect(r.today).toBeNull();
    expect(r.reason).toContain("No reading today");
  });

  it("calls an identical-reading baseline a sensor problem, not perfection", () => {
    // Zero spread would otherwise put every subsequent day into red.
    const r = readinessBand(
      [...baseline(30, () => 50), day(TODAY, { rmssd: 49 })],
      TODAY
    );
    expect(r.band).toBeNull();
    expect(r.spread).toBe(0);
    expect(r.reason).toContain("sensor");
  });

  it("shows how many readings the baseline rests on rather than hiding it", () => {
    const r = readinessBand(
      [...baseline(20, (i) => 40 + (i % 5)), day(TODAY, { rmssd: 42 })],
      TODAY
    );
    expect(r.readings).toBe(20);
    expect(r.baseline).not.toBeNull();
  });
});

describe("loadState", () => {
  const monday = "2026-08-10"; // TODAY is a Monday
  const w = (on_date: string, minutes: number, rpe: number) => ({
    on_date,
    kind: "session",
    minutes,
    rpe,
  });

  it("says nothing until there are four weeks to compare against", () => {
    // Otherwise week one is a spike against an average of nothing.
    const l = loadState([w(monday, 60, 7)], monday);
    expect(l.ratio).toBeNull();
    expect(l.spike).toBe(false);
    expect(l.reason).toContain("four weeks");
  });

  it("computes session load as minutes times RPE", () => {
    expect(sessionLoad(w("x", 60, 7))).toBe(420);
    expect(sessionLoad({ on_date: "x", kind: "s", minutes: null, rpe: 7 })).toBeNull();
    expect(sessionLoad({ on_date: "x", kind: "s", minutes: 60, rpe: null })).toBeNull();
  });

  it("flags this week only when it exceeds the average by the named ratio", () => {
    const prior = [1, 2, 3, 4].flatMap((i) => [w(addDays(monday, -7 * i), 60, 5)]);
    // 300 a week for four weeks. 360 is 1.2x — not a spike.
    expect(loadState([...prior, w(monday, 60, 6)], monday).spike).toBe(false);
    // 500 is 1.67x — a spike.
    const spiked = loadState([...prior, w(monday, 100, 5)], monday);
    expect(spiked.spike).toBe(true);
    expect(spiked.ratio).toBeGreaterThan(LOAD_SPIKE_RATIO);
  });

  it("never spikes against four empty weeks", () => {
    // Zero history and a big week is a first week, not a warning.
    const l = loadState([w(monday, 120, 9)], monday);
    expect(l.spike).toBe(false);
  });
});

describe("bigFourBests", () => {
  const lift = (movement: string, weight_kg: number, reps: number, on_date = TODAY) => ({
    on_date,
    movement,
    weight_kg,
    reps,
  });

  it("returns all four whether or not they have been logged", () => {
    const bests = bigFourBests([lift("squat", 100, 5)], TODAY);
    expect(bests.map((b) => b.movement)).toEqual(BIG_FOUR);
    expect(bests.find((b) => b.movement === "bench")?.e1rm).toBeNull();
  });

  it("uses one formula consistently so different rep counts compare", () => {
    // Epley: w x (1 + reps/30). The point is not which formula — it is that
    // a set of five and a set of three can be ranked against each other.
    expect(e1rm(100, 5)).toBe(116.7);
    expect(e1rm(110, 1)).toBe(113.7);
    const best = bigFourBests(
      [lift("squat", 100, 5), lift("squat", 110, 1)],
      TODAY
    ).find((b) => b.movement === "squat");
    expect(best?.e1rm).toBe(116.7);
  });

  it("refuses an estimate from a set long enough to be conditioning", () => {
    expect(e1rm(60, 20)).toBeNull();
    expect(e1rm(60, E1RM_REP_CEILING)).not.toBeNull();
    expect(e1rm(60, 0)).toBeNull();
  });

  it("reports change against a best from outside the window, or null", () => {
    const bests = bigFourBests(
      [lift("deadlift", 140, 3), lift("deadlift", 120, 3, addDays(TODAY, -200))],
      TODAY
    );
    const dl = bests.find((b) => b.movement === "deadlift");
    // Epley puts 140x3 at 154.0 and 120x3 at 132.0.
    expect(dl?.change).toBe(22);
    // With no older history there is no change to report — not a zero.
    const fresh = bigFourBests([lift("bench", 80, 5)], TODAY).find(
      (b) => b.movement === "bench"
    );
    expect(fresh?.change).toBeNull();
  });
});

describe("nutritionState", () => {
  it("reads the rung off what he logs rather than off a setting", () => {
    // A setting is one more thing to maintain, and the data already says.
    expect(nutritionState([day(TODAY, { weight_kg: 82 })], TODAY).rung).toBe("floor");
    expect(nutritionState([day(TODAY, { protein_g: 150 })], TODAY).rung).toBe("protein");
    expect(
      nutritionState(
        [day(TODAY, { protein_g: 150, calories: 2400, source: "samsung" })],
        TODAY
      ).rung
    ).toBe("macros");
  });

  it("does not call typed protein and calories a macro sync", () => {
    // Macros are synced, never typed — typing them is data entry, and data
    // entry is what kills the habit that was meant to produce the data.
    expect(
      nutritionState(
        [day(TODAY, { protein_g: 150, calories: 2400, source: "manual" })],
        TODAY
      ).rung
    ).toBe("protein");
  });

  it("counts a weight-only day as a logged day", () => {
    // The floor has to be reachable, or a day with one number becomes a day
    // with none.
    const n = nutritionState([day(TODAY, { weight_kg: 82 })], TODAY);
    expect(n.logged).toBe(1);
  });

  it("refuses a weight change from a single weigh-in", () => {
    expect(nutritionState([day(TODAY, { weight_kg: 82 })], TODAY).weightChange).toBeNull();
    const two = nutritionState(
      [day(addDays(TODAY, -7), { weight_kg: 84 }), day(TODAY, { weight_kg: 82 })],
      TODAY
    );
    expect(two.weightChange).toBe(-2);
  });

  it("returns null protein rather than zero when none was logged", () => {
    expect(nutritionState([day(TODAY, { weight_kg: 82 })], TODAY).protein).toBeNull();
  });

  it("ignores days outside the window", () => {
    const n = nutritionState(
      [day(addDays(TODAY, -60), { weight_kg: 90 }), day(TODAY, { weight_kg: 82 })],
      TODAY,
      14
    );
    expect(n.logged).toBe(1);
    expect(n.weightChange).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * rankForToday — the last tie-break
 *
 * These exist because the first seven real tasks ever written to this
 * database tied on reason, priority AND due date, so the final tie-break
 * decided what Jay actually saw. It was the title, which is not a claim
 * about importance and must not behave like one.
 * ------------------------------------------------------------------ */

describe("rankForToday tie-breaks", () => {
  /** The real case: three High tasks, same due date, nothing else to go on. */
  const trio = (created: (string | null)[]) => [
    task("check", {
      title: "Check the empty-homes council tax premium",
      priority: "High" as const,
      due_date: "2026-08-14",
      created_at: created[0],
    }),
    task("confirm", {
      title: "Confirm Rent Smart Wales registration",
      priority: "High" as const,
      due_date: "2026-08-14",
      created_at: created[1],
    }),
    task("ring", {
      title: "Ring Advantis and Marstons for exact balances",
      priority: "High" as const,
      due_date: "2026-08-14",
      created_at: created[2],
    }),
  ];

  it("orders a genuine tie oldest-first, not alphabetically", () => {
    // "Ring" was written down first, so it goes first — even though R
    // sorts last of the three.
    const ranked = rankForToday(
      trio(["2026-08-05T09:00:00Z", "2026-08-06T09:00:00Z", "2026-08-01T09:00:00Z"]),
      TODAY
    );
    expect(ranked.map((t) => t.id)).toEqual(["ring", "check", "confirm"]);
  });

  it("puts the oldest of a tie in the visible three rather than the drawer", () => {
    const f = focusList(
      [
        ...trio(["2026-08-05T09:00:00Z", "2026-08-06T09:00:00Z", "2026-08-01T09:00:00Z"]),
        task("d", { priority: "High", due_date: "2026-08-14", created_at: "2026-08-07T09:00:00Z" }),
      ],
      TODAY
    );
    expect(f.visible.map((t) => t.id)).toContain("ring");
    expect(f.onDeck.map((t) => t.id)).not.toContain("ring");
  });

  it("a missing timestamp sorts last — an unknown wait is not a long one", () => {
    const ranked = rankForToday(
      trio(["2026-08-05T09:00:00Z", null, "2026-08-01T09:00:00Z"]),
      TODAY
    );
    expect(ranked.map((t) => t.id)).toEqual(["ring", "check", "confirm"]);
  });

  it("falls back to the title only when the timestamps are identical too", () => {
    // A bulk insert gives every row the same transaction time, which is
    // exactly what happened to the seven. The sort must still be stable
    // and total rather than arbitrary run-to-run.
    const same = "2026-08-10T18:12:43Z";
    const ranked = rankForToday(trio([same, same, same]), TODAY);
    expect(ranked.map((t) => t.id)).toEqual(["check", "confirm", "ring"]);
  });

  it("still ranks when no caller selected created_at at all", () => {
    const ranked = rankForToday(
      [
        task("b", { priority: "High", due_date: "2026-08-14" }),
        task("a", { priority: "High", due_date: "2026-08-14" }),
      ],
      TODAY
    );
    expect(ranked.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("created_at never outranks a do_date — that is how you promote one", () => {
    // The escape hatch for a tie the system cannot break: give one a
    // do_date and it goes to the top regardless of when it was written.
    const ranked = rankForToday(
      [
        task("old", {
          priority: "High",
          due_date: "2026-08-14",
          created_at: "2026-01-01T09:00:00Z",
        }),
        task("promoted", {
          priority: "High",
          do_date: TODAY,
          created_at: "2026-08-09T09:00:00Z",
        }),
      ],
      TODAY
    );
    expect(ranked[0].id).toBe("promoted");
  });
});

/* ------------------------------------------------------------------ *
 * The app shell's breakpoints
 *
 * The nav obeys a stylesheet and a set of Tailwind prefixes, so no test
 * of `navForMode` can see this — exactly the lesson `stage4.test.ts`
 * records about the mode selectors. What a test CAN do is hold the five
 * breakpoints in step, which is the property that actually matters.
 * ------------------------------------------------------------------ */

describe("app shell breakpoints", () => {
  const shell = readFileSync(
    new URL("../src/app/(app)/layout.tsx", import.meta.url),
    "utf8"
  );

  /**
   * The desktop nav appears at `xl`, not `lg`, and the number is measured:
   * twelve nav items in `brain` mode plus the brand, mode switch, theme
   * toggle and sign-out need 1221px of header, inside a `max-w-[1200px]`
   * box. At `lg` that overflowed the page by 197px.
   */
  it("shows the top nav at xl, never at lg", () => {
    expect(shell).toContain("hidden xl:flex");
    expect(shell).not.toContain("hidden lg:flex");
  });

  it("hides the phone bar at the same breakpoint the top nav appears", () => {
    // If these drift apart there is a width with NO navigation at all, or
    // one where both render at once.
    expect(shell).toContain("xl:hidden fixed bottom-0");
    expect(shell).not.toMatch(/lg:hidden fixed bottom-0/);
  });

  it("keeps main's bottom padding until the bar is gone", () => {
    // `pb-24` is the room the fixed bar occupies. Dropping it before the
    // bar disappears puts the bar over the last row of the page.
    expect(shell).toContain("pb-24 xl:pb-8");
  });

  it("holds every shell breakpoint at the same prefix", () => {
    const prefixes = [...shell.matchAll(/\b(sm|md|lg|xl|2xl):(hidden|flex|block|pb-8|ml-1\.5)/g)]
      .map((m) => m[1]);
    expect(prefixes.length).toBeGreaterThan(0);
    expect([...new Set(prefixes)]).toEqual(["xl"]);
  });

  it("does not let the sign-out button shrink", () => {
    // It was the only header child without `shrink-0`, so it absorbed the
    // whole squeeze: 74px wide and 67px tall inside a 56px header.
    expect(shell).toMatch(/xl:block shrink-0/);
    expect(shell).toMatch(/btn btn-ghost[^"]*whitespace-nowrap/);
  });

  /* -- the sidebar, 2026-08-17 ------------------------------------- */

  it("navigates from a COLUMN, not a row", () => {
    // The horizontal bar was permanently one item from overflowing: thirteen
    // needed 1173px inside a 1200px box, remeasured twice. A column has no
    // such budget, and this assertion is what stops it quietly becoming a
    // row again.
    expect(shell).toMatch(/hidden xl:flex flex-col/);
    expect(shell).not.toMatch(/ml-auto hidden xl:flex items-center/);
  });

  it("keeps the sidebar's labels shrinkable", () => {
    // Same trap as the phone bar and the occasions row: a flex child defaults
    // to min-width:auto, so a long label pushes the column wider instead of
    // truncating inside it. The `min-w-0` belongs on the shrinking child.
    expect(shell).toMatch(/min-w-0 flex-1 truncate/);
  });

  it("gives main a min-w-0 beside the fixed-width sidebar", () => {
    // Without it, one wide child of a page (a table, a month grid) can widen
    // `main` past its share of the row and push the sidebar off-screen.
    expect(shell).toMatch(/flex-1 min-w-0/);
  });
});

describe("the front door", () => {
  const root = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

  it("opens on the day, not the dashboard", () => {
    // "What am I doing next?" is the question a morning starts with. The
    // dashboard answers "how are things?", which is a question you ask
    // sometimes — it stays one tap away rather than being the toll gate.
    expect(root).toMatch(/redirect\("\/day"\)/);
    expect(root).not.toMatch(/redirect\("\/dashboard"\)/);
  });
});

/* ------------------------------------------------------------------ *
 * Tap targets
 *
 * A unit test cannot measure a rendered box, so these hold the NUMBERS
 * the 2026-08-13 measurement settled on. If someone changes 40 to 32 the
 * test fails and points at the arithmetic; only a browser can prove the
 * result, and `.tap`'s own comment says so.
 * ------------------------------------------------------------------ */

describe("tap targets", () => {
  const css = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8"
  );

  it("expands the hit area by exactly 3px, which is half the tightest gap", () => {
    // 4px was tried first and measured 41-42, not 44: two chips 6px apart
    // each claiming 4px overlap by 2px and the later one wins the tap. At
    // 3px they tile at the midpoint and nothing is stolen.
    expect(css).toMatch(/\.tap::after\s*\{[^}]*inset:\s*-3px/);
    expect(css).toMatch(/\.chip::after\s*\{[^}]*inset:\s*-3px/);
  });

  it("floors the chip at 40px in both directions, so 40 + 3 + 3 clears 44", () => {
    // `drawn + gap` is the hard ceiling for a tiled row, so 38 would land
    // at 44 only by winning the boundary pixel outright. 40 does not have
    // to win anything.
    const chip = css.slice(css.indexOf(".chip {"));
    expect(chip).toMatch(/min-height:\s*40px/);
    expect(chip).toMatch(/min-width:\s*40px/);
  });

  it("keeps `.tap` a hit area and not a drawn box", () => {
    // The whole point is that the chip still LOOKS like a chip. If .tap
    // ever grows a background, border or padding it has become a button
    // and the visual hierarchy the dashboard depends on is gone.
    const tap = css.slice(css.indexOf(".tap {"), css.indexOf(".chip {"));
    expect(tap).toMatch(/position:\s*relative/);
    expect(tap).toMatch(/touch-action:\s*manipulation/);
    expect(tap).not.toMatch(/background|border|padding|font-size/);
  });

  it("relaxes the width floor exactly where the pointer nav takes over", () => {
    // 44px is a TOUCH minimum. The wider mode switch pushed the desktop
    // header 23px over its own box, and `xl` is where the phone bar hides
    // and the top nav appears — so the two requirements never collide.
    const shell = readFileSync(
      new URL("../src/components/ModeSwitch.tsx", import.meta.url),
      "utf8"
    );
    expect(shell).toContain("px-4 xl:px-2.5");
    expect(shell).toContain("min-h-[38px]");
  });
});
