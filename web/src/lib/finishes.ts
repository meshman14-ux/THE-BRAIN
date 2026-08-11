/* ------------------------------------------------------------------ *
 * Finishes — the momentum test, made failable
 *
 * Jay's twelve-month test, in his own words, is "momentum — still going
 * and compounding." The honest problem with it is that it cannot be
 * failed: whatever happens, in twelve months he will still be going. A
 * test that cannot be failed cannot tell him anything.
 *
 * So it gets a proxy, built in the only currency his reward system
 * accepts — visible completion:
 *
 *     A MONTH COUNTS IF AT LEAST ONE THING VISIBLY FINISHED.
 *
 * And the twelve-month test becomes: how many of the twelve counted?
 *
 * Two rules keep it meaningful:
 *
 *   1. **It must be failable.** If any ticked task counted, a month of
 *      small admin would always pass and the measure would be worthless
 *      again. Only work that closes a loop counts — a High-priority task,
 *      a completed diagnostic, or a milestone he records himself.
 *   2. **It must fill itself.** A ledger that needs feeding ends up empty
 *      — this system has the empty tables to prove it. Tasks and
 *      diagnostics are DERIVED at read time and never written anywhere;
 *      the `finishes` table holds only what has no timestamp elsewhere.
 * ------------------------------------------------------------------ */

export const FINISH_KINDS = [
  "milestone",
  "debt",
  "property",
  "sop",
  "venture",
  "other",
] as const;
export type FinishKind = (typeof FINISH_KINDS)[number];

export const FINISH_KIND_LABEL: Record<FinishKind, string> = {
  milestone: "Milestone",
  debt: "Debt cleared",
  property: "Property",
  sop: "SOP written",
  venture: "Venture",
  other: "Other",
};

/** Where a finish came from. Derived sources are never written down. */
export type FinishSource = "task" | "diagnostic" | "recorded";

export type Finish = {
  id: string;
  title: string;
  /** ISO date. A finish belongs to a day, not a moment. */
  on: string;
  source: FinishSource;
  kind: FinishKind;
};

const isoDay = (stamp: string | null | undefined): string | null =>
  typeof stamp === "string" && stamp.length >= 10 ? stamp.slice(0, 10) : null;

/* ------------------------------------------------------------------ *
 * Collecting
 * ------------------------------------------------------------------ */

type DoneTask = {
  id: string;
  title: string;
  priority: string;
  status: string;
  completed_at?: string | null;
};

/**
 * Completed High-priority tasks only.
 *
 * This is where the teeth are. Counting every ticked task would make the
 * measure unfailable — twenty small admin jobs would pass a month that
 * moved nothing. High is Jay's own declaration that something mattered,
 * so it is the honest line, and it is a line he draws rather than one
 * imposed on him.
 */
export function finishesFromTasks(tasks: DoneTask[]): Finish[] {
  const out: Finish[] = [];
  for (const t of tasks) {
    if (t.status !== "done") continue;
    if (t.priority !== "High") continue;
    const on = isoDay(t.completed_at);
    if (!on) continue;
    out.push({ id: `task:${t.id}`, title: t.title, on, source: "task", kind: "milestone" });
  }
  return out;
}

type DoneRun = {
  id: string;
  kind: string;
  completed_at?: string | null;
  subject_name?: string | null;
};

/** A completed diagnostic is real work with a real end. Always counts. */
export function finishesFromRuns(runs: DoneRun[]): Finish[] {
  const out: Finish[] = [];
  for (const r of runs) {
    const on = isoDay(r.completed_at);
    if (!on) continue;
    const what = r.kind === "deep" ? "Deep dive" : "Triage";
    out.push({
      id: `run:${r.id}`,
      title: r.subject_name ? `${what} — ${r.subject_name}` : what,
      on,
      source: "diagnostic",
      kind: "venture",
    });
  }
  return out;
}

type RecordedFinish = {
  id: string;
  title: string;
  happened_on: string;
  kind: string;
};

export function finishesFromRecords(rows: RecordedFinish[]): Finish[] {
  return rows
    .filter((r) => isoDay(r.happened_on) != null)
    .map((r) => ({
      id: `fin:${r.id}`,
      title: r.title,
      on: r.happened_on.slice(0, 10),
      source: "recorded" as const,
      kind: (FINISH_KINDS as readonly string[]).includes(r.kind)
        ? (r.kind as FinishKind)
        : "other",
    }));
}

/** Everything, newest first. Ids are prefixed so sources cannot collide. */
export function collectFinishes(
  tasks: DoneTask[],
  runs: DoneRun[],
  records: RecordedFinish[]
): Finish[] {
  return [
    ...finishesFromTasks(tasks),
    ...finishesFromRuns(runs),
    ...finishesFromRecords(records),
  ].sort((a, b) => b.on.localeCompare(a.on) || a.title.localeCompare(b.title));
}

/* ------------------------------------------------------------------ *
 * Months
 * ------------------------------------------------------------------ */

/** "2026-08-11" → "2026-08". String maths, so no timezone can shift it. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * The last `n` month keys ending with the month `todayIso` falls in,
 * oldest first. Pure string arithmetic — `new Date` on an ISO date is
 * parsed as UTC and would slide the month for anyone west of Greenwich.
 */
export function lastMonths(todayIso: string, n: number = 12): string[] {
  let year = Number(todayIso.slice(0, 4));
  let month = Number(todayIso.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out.reverse();
}

export type MonthTally = {
  month: string;
  count: number;
  /** A month counts if anything at all finished in it. */
  counted: boolean;
  /** True for the month still being lived — provisional, not a verdict. */
  current: boolean;
};

export function monthsCounted(
  finishes: Finish[],
  todayIso: string,
  n: number = 12
): MonthTally[] {
  const counts = new Map<string, number>();
  for (const f of finishes) {
    const k = monthKey(f.on);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const thisMonth = monthKey(todayIso);
  return lastMonths(todayIso, n).map((month) => {
    const count = counts.get(month) ?? 0;
    return { month, count, counted: count > 0, current: month === thisMonth };
  });
}

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */

/** Nine of twelve is compounding. Under six is drift wearing its clothes. */
export const MOMENTUM_STRONG = 9;
export const MOMENTUM_WEAK = 6;

export type Momentum = {
  counted: number;
  of: number;
  state: "compounding" | "steady" | "drift" | "unknown";
  line: string;
};

/**
 * The twelve-month verdict.
 *
 * The month still being lived is excluded from the judgement — it has not
 * finished, so counting it as a miss would penalise him for the calendar.
 * It is shown, but as provisional rather than as evidence. This is the
 * same discipline the reflection streak already uses for the current week.
 *
 * With fewer than three completed months there is nothing to judge, and
 * saying so is better than a confident number built on two data points.
 */
export function momentum(tallies: MonthTally[]): Momentum {
  const settled = tallies.filter((t) => !t.current);
  const counted = settled.filter((t) => t.counted).length;
  const of = settled.length;

  if (of < 3) {
    return {
      counted,
      of,
      state: "unknown",
      line: `${counted} of ${of} month${of === 1 ? "" : "s"} so far — too early to call it anything.`,
    };
  }

  // Judged as a rate, so the verdict is honest before twelve months exist.
  const rate = counted / of;
  const strongRate = MOMENTUM_STRONG / 12;
  const weakRate = MOMENTUM_WEAK / 12;

  if (rate >= strongRate) {
    return {
      counted,
      of,
      state: "compounding",
      line: `${counted} of ${of} months counted. That is compounding — something finishes most months.`,
    };
  }
  if (rate >= weakRate) {
    return {
      counted,
      of,
      state: "steady",
      line: `${counted} of ${of} months counted. Steady, not yet compounding — the gap is the months where nothing closed.`,
    };
  }
  return {
    counted,
    of,
    state: "drift",
    line: `${counted} of ${of} months counted. That is drift wearing momentum's clothes — plenty happening, little finishing.`,
  };
}

/**
 * The nudge for the month in progress.
 *
 * Deliberately a question rather than a scolding, and it stays silent
 * until the month is old enough for silence to mean something — before
 * the 20th, a month with nothing finished is just a month that is young.
 */
export function currentMonthNudge(
  tallies: MonthTally[],
  todayIso: string
): string | null {
  const current = tallies.find((t) => t.current);
  if (!current || current.counted) return null;
  const dayOfMonth = Number(todayIso.slice(8, 10));
  if (dayOfMonth < 20) return null;
  return "Nothing has finished this month yet — what could still close before it ends?";
}
