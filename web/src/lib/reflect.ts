/**
 * Daily reflection — the pure half.
 *
 * The check-in is, by Jay's own diagnosis, the ritual he does not open. So the
 * design question is not "what should it ask" but "why would this one get
 * opened", and the answer chosen is that the Advisor answers back. Reflection
 * that talks back is a conversation; reflection that only files your words is
 * homework.
 *
 * The floor is two taps. Voice is the ceiling — Jay works with his hands, and
 * at 9pm typing competes with being tired and having dirty hands while talking
 * does not. Neither is required; a tap counts.
 */

export type ReflectionKind = "morning" | "evening";

/** Answered halves for a given date. */
export type ReflectionState = {
  morningDone: boolean;
  eveningDone: boolean;
  /** A previous day that never got its evening close. */
  unclosedDate: string | null;
};

/**
 * Which half the page opens on, by the clock. Before 11 the useful question is
 * what today is for; from 5pm it is what today was. In between it defaults to
 * the evening, because a mid-afternoon visit is nearly always a late morning
 * plan or an early close, and the close is the half that matters.
 */
export function halfForHour(hour: number): ReflectionKind {
  return hour < 11 ? "morning" : "evening";
}

export type Prompt = {
  key: "unclosed" | "morning" | "evening" | "quiet";
  label: string;
  tone: "warn" | "normal" | "quiet";
};

/**
 * What the button says, and whether it should be shouting.
 *
 * An unclosed yesterday outranks everything — it is the one nudge with a real
 * deadline, since a day you never closed cannot be closed tomorrow. Everything
 * else is quiet, because a prompt that shouts every day gets ignored every day.
 */
export function prompt(hour: number, state: ReflectionState): Prompt {
  if (state.unclosedDate) {
    return { key: "unclosed", label: "Close yesterday", tone: "warn" };
  }
  if (hour < 11 && !state.morningDone) {
    return { key: "morning", label: "Morning plan", tone: "normal" };
  }
  if (hour >= 20 && !state.eveningDone) {
    return { key: "evening", label: "Evening close", tone: "normal" };
  }
  return { key: "quiet", label: "Reflect", tone: "quiet" };
}

/** The two-tap floor: did the one thing happen, and how was the energy. */
export const ENERGY_WORDS: Record<number, string> = {
  1: "empty",
  2: "low",
  3: "steady",
  4: "good",
  5: "strong",
};

export function energyWord(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  return ENERGY_WORDS[n] ?? null;
}

/**
 * A reflection counts as recorded when ANY of its three signals is present.
 * A tap counts — that is the whole point of the floor. An empty transcript is
 * not a reflection, but a single energy tap is.
 */
export function isRecorded(r: {
  transcript?: string | null;
  one_thing?: string | null;
  it_happened?: boolean | null;
  energy?: number | null;
}): boolean {
  return (
    (typeof r.transcript === "string" && r.transcript.trim() !== "") ||
    (typeof r.one_thing === "string" && r.one_thing.trim() !== "") ||
    typeof r.it_happened === "boolean" ||
    typeof r.energy === "number"
  );
}

/**
 * The run — consecutive days with any reflection, counting back from today.
 * A missing today does NOT break it: the day is not over. That is the same
 * refusal `restart.ts` makes about returning after a gap — a streak that
 * punishes you at breakfast is one you stop looking at.
 */
export function runLength(dates: string[], todayIso: string): number {
  const have = new Set(dates);
  const day = (iso: string, back: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back);
    return d.toISOString().slice(0, 10);
  };
  let run = 0;
  // Start at yesterday when today is not yet recorded — today is still open.
  let i = have.has(todayIso) ? 0 : 1;
  while (have.has(day(todayIso, i))) {
    run++;
    i++;
  }
  return run;
}

/** The board's own vocabulary, kept out of the components. */
export const POSITION_WORD: Record<string, string> = {
  for: "for",
  against: "against",
  abstain: "abstained",
};

export type Opinion = { seat_key: string; position: string; argument: string };

/**
 * The vote, counted from the opinions rather than trusted from the model's own
 * summary line — a board that reports "3–1" while four seats agreed is the
 * failure this whole design is guarding against.
 */
export function countVote(opinions: Opinion[]): {
  for: number;
  against: number;
  abstain: number;
  line: string;
  unanimous: boolean;
} {
  const f = opinions.filter((o) => o.position === "for").length;
  const a = opinions.filter((o) => o.position === "against").length;
  const ab = opinions.filter((o) => o.position === "abstain").length;
  const decided = f + a;
  return {
    for: f,
    against: a,
    abstain: ab,
    line: decided === 0 ? "no vote" : `${f}–${a}${ab ? ` (${ab} abstained)` : ""}`,
    // Worth flagging: a unanimous board is one advisor with extra steps, and
    // the casting is explicitly told to seat conflict. If it comes back
    // unanimous, that is information about the question, not a success.
    unanimous: decided > 1 && (f === 0 || a === 0),
  };
}
