import type { Venture } from "./types";
import { daysUntil } from "./logic";

/* ------------------------------------------------------------------ *
 * Seasons — the annual shape the week never had
 *
 * Jay's work is seasonal: busy months and quiet months. Every system built
 * on "this week" is therefore correct for part of the year and wrong for
 * the rest, and a system that is wrong for half the year is one you stop
 * trusting in the half where it accuses you.
 *
 * The whole point is this: **in a busy season, an untouched venture is not
 * a failure — it is correctly parked.** Without a season the watchtower
 * cannot tell the difference between dropped and deliberately deferred, so
 * it cries wolf for months and is then ignored when it matters.
 *
 * Three kinds, one control:
 *
 *   quiet   — the building window. Peak hours are free; the full system
 *             runs and 3 ventures can be genuinely active.
 *   busy    — paid work owns the peak hours. One active venture, and no
 *             expectation of anything beyond the floor.
 *   minimum — the declared reset. Two obligations, everything else stops
 *             counting. Jay's answer to overload was "push through and pay
 *             later", which means there is no recovery phase — only a
 *             deferred bill. This makes the reset a state you can DECLARE
 *             rather than one you fall into, which is the difference
 *             between reducing deliberately and quietly dropping things.
 * ------------------------------------------------------------------ */

export const SEASON_KINDS = ["quiet", "busy", "minimum"] as const;
export type SeasonKind = (typeof SEASON_KINDS)[number];

export type Season = {
  id: string;
  kind: SeasonKind;
  started_on: string;
  ended_on: string | null;
  note?: string | null;
};

export const SEASON_LABEL: Record<SeasonKind, string> = {
  quiet: "Quiet season",
  busy: "Busy season",
  minimum: "Minimum mode",
};

export const SEASON_ICON: Record<SeasonKind, string> = {
  quiet: "◔",
  busy: "◕",
  minimum: "◌",
};

/** What each season is FOR, in Jay's own terms. Shown on the switch. */
export const SEASON_MEANING: Record<SeasonKind, string> = {
  quiet:
    "The building window. Peak hours are free, so venture work happens now — not squeezed into evenings later in the year.",
  busy:
    "Paid work owns the best hours. One venture stays warm, the rest are parked on purpose, and nothing here counts as slipping.",
  minimum:
    "Declared reset. Training and the daily close, nothing else. Not a collapse — a decision, and the system stops counting the rest.",
};

/** The neutral position when nothing has ever been declared. */
export const DEFAULT_SEASON: SeasonKind = "quiet";

/* ------------------------------------------------------------------ *
 * Expectations — what the system asks of you in each season
 * ------------------------------------------------------------------ */

export type Expectations = {
  /** How many ventures may be genuinely active. The empire's real cap. */
  activeVentureSlots: number;
  /** How many focus slots the week offers per system. */
  focusSlots: number;
  /** Whether unworked ventures should be flagged at all. */
  flagsUnworkedVentures: boolean;
  /** Whether area scoring is expected this season. */
  expectsAreaScores: boolean;
  /** Whether the weekly review is asked for. */
  expectsWeeklyReview: boolean;
  /** The obligations that survive, whatever else goes. */
  floor: string[];
};

/**
 * Deliberately austere as the seasons narrow. The floor never changes —
 * training and the daily close survive every season, because the keystone
 * habit is the first thing sacrificed under load and the last thing that
 * should be.
 */
export function expectationsFor(kind: SeasonKind): Expectations {
  switch (kind) {
    case "quiet":
      return {
        activeVentureSlots: 3,
        focusSlots: 5,
        flagsUnworkedVentures: true,
        expectsAreaScores: true,
        expectsWeeklyReview: true,
        floor: ["Training ×4", "Daily close"],
      };
    case "busy":
      return {
        activeVentureSlots: 1,
        focusSlots: 3,
        // The whole point of declaring a busy season.
        flagsUnworkedVentures: false,
        expectsAreaScores: false,
        expectsWeeklyReview: true,
        floor: ["Training ×4", "Daily close"],
      };
    case "minimum":
      return {
        activeVentureSlots: 0,
        focusSlots: 1,
        flagsUnworkedVentures: false,
        expectsAreaScores: false,
        expectsWeeklyReview: false,
        floor: ["Training ×4", "Daily close"],
      };
  }
}

/** The open season, or null when none has ever been declared. */
export function currentSeason(rows: Season[]): Season | null {
  const open = rows.filter((s) => s.ended_on == null);
  if (open.length === 0) return null;
  // The unique index guarantees one, but reading defensively costs nothing.
  return [...open].sort((a, b) => b.started_on.localeCompare(a.started_on))[0];
}

/** The kind in force — never null, so callers never branch on absence. */
export function seasonKind(rows: Season[]): SeasonKind {
  return currentSeason(rows)?.kind ?? DEFAULT_SEASON;
}

/** How long the current season has run. Null when nothing is declared. */
export function daysInSeason(rows: Season[], todayIso: string): number | null {
  const s = currentSeason(rows);
  if (!s) return null;
  const d = daysUntil(s.started_on, todayIso);
  return d == null ? null : Math.max(0, -d);
}

/**
 * "Busy season · 23 days" — the dashboard's top line.
 * Never renders a duration it cannot evidence.
 */
export function seasonLine(rows: Season[], todayIso: string): string {
  const kind = seasonKind(rows);
  const days = daysInSeason(rows, todayIso);
  const label = SEASON_LABEL[kind];
  if (days == null) return `${label} · not yet declared`;
  return `${label} · day ${days + 1}`;
}

/* ------------------------------------------------------------------ *
 * Venture dormancy — the attention tax, removed
 *
 * Eighteen ventures is not scatter; it is the identity, and narrowing Jay
 * to three would be a cage he abandons. But an idle venture still charges
 * background attention every time it appears in a list, a count or an
 * alert. Dormancy removes the tax without removing the ambition.
 *
 * Same discipline as task dormancy: DERIVED at read time, nothing written,
 * nothing deleted. Waking a venture is doing something with it — running a
 * diagnostic, moving its stage — never un-setting a flag.
 * ------------------------------------------------------------------ */

export const VENTURE_DORMANT_AFTER_DAYS = 30;

/** What the system knows about when a venture was last genuinely touched. */
export type VentureTouch = {
  /** Most recent diagnostic run start, if any. */
  lastRunAt?: string | null;
};

type Dormable = Pick<Venture, "id" | "status"> & {
  created_at?: string | null;
};

/**
 * Three rules, and the first is the important one.
 *
 * - **A venture Jay has already parked is not dormant — it is parked.**
 *   `backlog`, `paused` and `exited` are deliberate declarations, and
 *   calling a deliberate choice "dormant" would be the system telling him
 *   off for a decision he made on purpose. Dormancy is only ever about
 *   drift: something *called* active that has gone quiet.
 * - **A touch is a diagnostic run.** It is the only per-venture action the
 *   schema timestamps, so it is the only honest evidence of attention.
 * - **No date, no dormancy.** A venture with nothing to date cannot be
 *   shown to have gone quiet, and hiding must fail closed — the same rule
 *   the nav uses for a missing attribute.
 */
export function isVentureDormant(
  v: Dormable,
  touch: VentureTouch,
  todayIso: string,
  afterDays: number = VENTURE_DORMANT_AFTER_DAYS
): boolean {
  if (v.status !== "active") return false;
  const stamps = [touch.lastRunAt, v.created_at].filter(
    (s): s is string => typeof s === "string" && s.length >= 10
  );
  if (stamps.length === 0) return false;
  const sinceEach = stamps.map((s) => {
    const d = daysUntil(s.slice(0, 10), todayIso);
    // A future stamp is negative-since, which keeps the venture awake.
    return d == null ? null : -d;
  });
  if (sinceEach.some((d) => d == null)) return false;
  // The most recent touch wins: the smallest "days since".
  return Math.min(...(sinceEach as number[])) > afterDays;
}

export type VentureSplit<T> = {
  /** Active and recently touched — what the empire is actually running. */
  live: T[];
  /** Active on paper, silent in practice. Out of the counts, not deleted. */
  dormant: T[];
  /** Deliberately shelved by Jay. Never confused with dormant. */
  parked: T[];
};

/** One pass, three buckets — so no screen can count a venture twice. */
export function splitVentures<T extends Dormable>(
  ventures: T[],
  touches: Map<string, VentureTouch>,
  todayIso: string
): VentureSplit<T> {
  const out: VentureSplit<T> = { live: [], dormant: [], parked: [] };
  for (const v of ventures) {
    if (v.status !== "active") {
      out.parked.push(v);
    } else if (isVentureDormant(v, touches.get(v.id) ?? {}, todayIso)) {
      out.dormant.push(v);
    } else {
      out.live.push(v);
    }
  }
  return out;
}

/**
 * Whether the active set is over the season's cap.
 *
 * Reported, never enforced — the system's job is to say "you have four
 * things warm in a season that supports one", not to pick which three to
 * drop. That decision belongs to Jay, the same rule the calendar holds for
 * conflicts.
 */
export function activeSetStatus(
  liveCount: number,
  kind: SeasonKind
): { slots: number; over: boolean; line: string } {
  const slots = expectationsFor(kind).activeVentureSlots;
  const over = liveCount > slots;
  if (slots === 0) {
    return {
      slots,
      over,
      line: over
        ? `${liveCount} venture${liveCount === 1 ? "" : "s"} still warm in minimum mode — the floor is training and the close, nothing else.`
        : "Minimum mode. Nothing is expected of the empire this month.",
    };
  }
  return {
    slots,
    over,
    line: over
      ? `${liveCount} active in a season that supports ${slots}. Not an error — but something here is being run on hours that do not exist.`
      : `${liveCount} of ${slots} active. Room for ${slots - liveCount} more.`,
  };
}

/* ------------------------------------------------------------------ *
 * The watchtower, told what season it is
 *
 * A watchtower that cries wolf for half the year is a watchtower nobody
 * reads for the other half. In a busy season an untouched division is
 * PARKED, not dropped — and the whole point of declaring the season is
 * that the system stops treating a deliberate choice as a failure.
 *
 * Two rules keep the suppression honest:
 *
 *   · **Deadlines are never suppressed.** Due and overdue are facts about
 *     the world, and the world does not care what season it is. Hiding a
 *     real deadline because the month is busy would be the system lying in
 *     the flattering direction — the same reason a task with a due_date
 *     never goes dormant.
 *   · **People are never suppressed.** "47 days since you spoke, you said
 *     14" is the one insight nothing else in the system can produce, and a
 *     busy month is exactly when it stops happening. The alert is already
 *     gentle and already capped; it does not need a season's permission.
 *
 * What IS suppressed is empire bookkeeping — progress drift and the
 * profit-floor gate — because those measure attention, and attention is
 * precisely what a busy season has already been declared not to have.
 * ------------------------------------------------------------------ */

/** Alert kinds that a narrowed season silences. Deliberately short. */
export const SEASON_SUPPRESSES: Record<SeasonKind, readonly string[]> = {
  quiet: [],
  busy: ["drift", "lowprofit", "unscored"],
  minimum: ["drift", "lowprofit", "unscored"],
};

/** Deadlines and people survive every season, whatever else is silenced. */
export const NEVER_SUPPRESSED = ["overdue", "due", "person", "birthday"] as const;

export function suppressesAlert(kind: string, season: SeasonKind): boolean {
  if ((NEVER_SUPPRESSED as readonly string[]).includes(kind)) return false;
  return SEASON_SUPPRESSES[season].includes(kind);
}

/**
 * The watchtower, filtered. Returns both halves so a screen can say "3
 * more, quiet this season" rather than silently dropping them — hidden is
 * not the same as gone, and the difference is what keeps it trustworthy.
 */
export function alertsForSeason<T extends { kind: string }>(
  alerts: T[],
  season: SeasonKind
): { shown: T[]; silenced: T[] } {
  const shown: T[] = [];
  const silenced: T[] = [];
  for (const a of alerts) (suppressesAlert(a.kind, season) ? silenced : shown).push(a);
  return { shown, silenced };
}

/* ------------------------------------------------------------------ *
 * LIFE_OS annotates EMPIRE_OS — it never caps it
 *
 * Jay chose annotation over capping, and it is the better answer.
 * Capping would quietly DELETE information: an expectation removed is an
 * expectation you cannot weigh. Annotating keeps the whole picture and
 * leaves the judgement where it belongs — the same spine as "surface,
 * never decide", and consistent with every other choice in this system.
 *
 * The risk, stated once and then designed against: if every empire alert
 * carries a life excuse, "busy season" becomes wallpaper and stops
 * meaning anything. So an annotation appears ONLY when it is genuinely
 * explanatory — the season is narrowed, or the floor is breached. In a
 * quiet season with the floor intact, an empire alert carries no
 * annotation at all, because there is nothing to explain.
 * ------------------------------------------------------------------ */

export type LifeContext = {
  season: SeasonKind;
  /** Ventures the season supports. Only meaningful when narrowed. */
  capacity: number;
  /** Sessions per week, or null when unmeasured. */
  trainingPerWeek: number | null;
  /** False only when a leg is measurably breached; null when unmeasured. */
  floorHeld: boolean | null;
};

/**
 * The clause that explains an empire alert, or null when nothing does.
 *
 * Null is the common case by design. An annotation is a claim that the
 * life is why the empire is drifting, and that claim is only true when
 * the life has actually narrowed.
 */
export function annotationFor(ctx: LifeContext): string | null {
  const parts: string[] = [];

  // A narrowed season is the whole point of declaring one.
  if (ctx.season !== "quiet") {
    parts.push(
      `${SEASON_LABEL[ctx.season].toLowerCase()} season, ${ctx.capacity} venture slot${
        ctx.capacity === 1 ? "" : "s"
      }`
    );
  }

  // A breached floor explains drift anywhere. An UNMEASURED floor does
  // not: "we do not know how much he trained" explains nothing, and
  // printing it would be exactly the wallpaper this guards against.
  if (ctx.floorHeld === false && ctx.trainingPerWeek != null) {
    parts.push(`training down to ${ctx.trainingPerWeek}/week`);
  }

  return parts.length === 0 ? null : parts.join(", ");
}

/**
 * Alert kinds a life can actually explain.
 *
 * The same three the season silences, and for the same reason: they are
 * JUDGEMENTS about attention, and a narrowed life is a real account of
 * where the attention went. A lapsed MOT is not one of them — the world
 * does not care how his week went, and "busy season" beside a legal
 * deadline would be the system helping him excuse a fine.
 */
export const EXPLAINABLE_KINDS = ["drift", "lowprofit", "unscored"] as const;

/** An alert with its explanation attached, when there genuinely is one. */
export function annotate<T extends { kind: string }>(
  alerts: T[],
  ctx: LifeContext
): (T & { annotation: string | null })[] {
  const annotation = annotationFor(ctx);
  return alerts.map((a) => ({
    ...a,
    annotation:
      annotation != null &&
      (EXPLAINABLE_KINDS as readonly string[]).includes(a.kind)
        ? annotation
        : null,
  }));
}

/* ------------------------------------------------------------------ *
 * Debts that close, and bills that recur
 * ------------------------------------------------------------------ */

type Debtish = { current_balance?: number | null; recurring?: boolean | null };

/**
 * Split the arrears from the standing bills.
 *
 * A recurring bill never reaches zero, so it can never leave a
 * thermometer and can never be a finish. Gal & McShane (JMR 2012, ~6,000
 * debtors) found that the number of accounts CLOSED — independent of the
 * amounts — predicted eliminating all debt. Mixing a thing that closes
 * with a thing that cannot means "clear the debt" can never become true,
 * and the one measure that actually predicts payoff is diluted by rows
 * that will still be there in twenty years.
 */
export function splitDebts<T extends Debtish>(
  debts: T[]
): { closing: T[]; recurring: T[] } {
  const closing: T[] = [];
  const recurring: T[] = [];
  for (const d of debts) (d.recurring ? recurring : closing).push(d);
  return { closing, recurring };
}

/**
 * The debt-free total: only what can actually reach zero.
 *
 * Returns null rather than 0 when nothing is confirmed, because a total of
 * zero and a total nobody has entered are different facts — the same rule
 * `formatGBP(null)` has always held.
 */
export function closingTotal<T extends Debtish>(debts: T[]): number | null {
  const known = splitDebts(debts).closing
    .map((d) => d.current_balance)
    .filter((b): b is number => typeof b === "number");
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/* ------------------------------------------------------------------ *
 * Habits: one that counts
 * ------------------------------------------------------------------ */

type Habitish = { active: boolean; tracked?: boolean | null; keystone?: boolean | null };

/** The habit the system leads with, if one has been named. */
export function keystoneHabit<T extends Habitish>(habits: T[]): T | null {
  return habits.find((h) => h.active && h.keystone) ?? null;
}

/* ------------------------------------------------------------------ *
 * The keystone: what you named, against what is happening
 * ------------------------------------------------------------------ */

/**
 * A fortnight, matching `TRAINING_WINDOW_DAYS` and `restart()`, so the
 * three places that ask "is this happening" cannot disagree.
 *
 * Seven days was the obvious alternative and is wrong here: the habit
 * board already shows seven dots, and a CLAIM judged over one week flips
 * on a single quiet weekend. A keystone is a standing decision, so the
 * window that tests it has to be longer than the thing it is testing.
 */
export const KEYSTONE_WINDOW_DAYS = 14;

export type KeystoneState =
  /** Named, and logged inside the window. The claim and the data agree. */
  | "earned"
  /** Named, and nothing logged inside the window. A claim, not a fact. */
  | "claimed"
  /** No keystone named at all. */
  | "none";

export type Keystone = {
  state: KeystoneState;
  /** Times logged inside the window. */
  hits: number;
  /** Days since it was last done. Null when it never has been. */
  daysSince: number | null;
  windowDays: number;
};

/**
 * Whether the keystone is a fact or an intention.
 *
 * `habits.keystone` marks the ONE habit the dashboard leads with and
 * that THE COG protects with two of its rules. Nothing has ever checked
 * whether it is true. On 2026-08-14 Jay said plainly that Training —
 * the keystone since the habit board was rebuilt — is a priority he
 * WANTS rather than one he has, and the data agrees: one log, ever.
 *
 * THIS DOES NOT PICK A SIDE, and that is the whole design. It does not
 * demote the habit, reassign the keystone, or hide the badge. `/goals`
 * and `/empire` already solved this exact problem — a STATED claim and a
 * DERIVED reality, kept separate, with the page saying so when they
 * disagree by enough to matter. A keystone is the same shape of claim,
 * so it gets the same treatment rather than a new one.
 *
 * Reassigning it automatically was considered and rejected: every other
 * habit on this board has ZERO logs, so moving the badge would move the
 * same claim onto a different name and call it a fix.
 */
export function keystoneStanding(
  keystone: { id: string } | null,
  logs: { habit_id: string; done_on: string }[],
  todayIso: string,
  windowDays: number = KEYSTONE_WINDOW_DAYS
): Keystone {
  if (keystone == null) {
    return { state: "none", hits: 0, daysSince: null, windowDays };
  }

  const days = logs
    .filter((l) => l.habit_id === keystone.id)
    .map((l) => {
      const n = daysUntil(l.done_on, todayIso);
      return n == null ? null : -n;
    })
    .filter((n): n is number => n != null && n >= 0)
    .sort((a, b) => a - b);

  const hits = days.filter((d) => d < windowDays).length;
  return {
    state: hits > 0 ? "earned" : "claimed",
    hits,
    daysSince: days.length === 0 ? null : days[0],
    windowDays,
  };
}

/**
 * The sentence shown when the claim and the data disagree, or null when
 * they do not.
 *
 * Modelled on `DriftNote`'s wording — "one of the two is out of date" —
 * because that is the honest framing. Either the habit stops being the
 * keystone, or it starts happening; the system does not get to decide
 * which, and it must not imply failure. Nothing here says missed,
 * behind or should.
 */
export function keystoneNote(k: Keystone, name: string): string | null {
  if (k.state !== "claimed") return null;
  if (k.daysSince == null) {
    return `${name} is set as the one to lead with, and has never been logged. One of the two is out of date.`;
  }
  return `${name} is set as the one to lead with; the last was ${k.daysSince} days ago. One of the two is out of date.`;
}

/**
 * Habits that count. Untracked ones are still active and still worth
 * doing — they simply stop being scored, because the board was never the
 * point and six open checkboxes is what stopped it being used.
 */
export function trackedHabits<T extends Habitish>(habits: T[]): T[] {
  return habits.filter((h) => h.active && h.tracked !== false);
}

/** Still doing them, no longer counting them. Shown quietly, never scored. */
export function untrackedHabits<T extends Habitish>(habits: T[]): T[] {
  return habits.filter((h) => h.active && h.tracked === false);
}
