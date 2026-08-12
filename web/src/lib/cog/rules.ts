/**
 * THE COG — the rulebook, executable.
 * Rule ids (P/F/N/I/M) match docs/03-advisor-logic.md §4 one-to-one; every decision
 * records a RuleTraceEntry so the API can show its working.
 */
import type { CogConfig } from "./config";
import { explain } from "./explain";
import { confidenceOf, decisionMargin, inputCompleteness, priorityScore, tiebreak } from "./score";
import type {
  AdvisorPulse, CogTask, FocusSlot, IdentityAlignment, IdentityProfile,
  Interval, MicroAction, MomentumState, Priority, PulseKind, RuleTraceEntry,
} from "./types";

/* ------------------------------------------------------------------ */
/* P — priority selection                                              */
/* ------------------------------------------------------------------ */

export function selectPriorities(state: MomentumState, cfg: CogConfig): Priority[] {
  const open = state.tasks.filter((t) => t.status === "open");
  const scored = open.map((task) => ({ task, ...priorityScore(task, state, cfg) }));
  scored.sort(tiebreak);

  // Confidence inputs, computed once for the whole selection. The MARGIN
  // is the interesting half: two tasks a point apart is a coin toss, and
  // announcing a coin toss in the same tone as a clear winner is exactly
  // what this number exists to stop.
  const completeness = inputCompleteness(state, cfg);
  const energyMissing = state.signals.energyBand === null;
  const margin = decisionMargin(scored[0]?.score, scored[1]?.score);
  const conf = (fallbacks = 0) =>
    confidenceOf(
      { inputCompleteness: completeness, decisionMargin: margin, fallbacksApplied: fallbacks, energyMissing },
      cfg
    );

  const trace = (task: CogTask, base: RuleTraceEntry[]): RuleTraceEntry[] => [
    ...base,
    { ruleId: "P6", fired: !!task.userSteered, detail: task.userSteered ? "user-steered: never demoted" : undefined },
    { ruleId: "P7", fired: !!task.empireSignal },
  ];

  // P1 — minimum season: exactly one, keystone-or-floor
  if (state.season === "minimum") {
    const pick = scored.find((s) => s.task.supportsKeystone) ?? scored[0];
    if (!pick) return [];
    return [{
      taskId: pick.task.id, title: pick.task.title, rank: 1,
      score: pick.score, components: pick.components,
      confidence: conf(),
      rationale: explain("P1"),
      ruleTrace: trace(pick.task, [{ ruleId: "P1", fired: true, detail: "minimum season cap = 1" }]),
    }];
  }

  const picks: typeof scored = [];
  const projectCount = new Map<string, number>();
  const canTake = (s: (typeof scored)[number]) => {
    if (picks.some((p) => p.task.id === s.task.id)) return false;
    const proj = s.task.projectId;
    return !proj || (projectCount.get(proj) ?? 0) < 2; // P3 breadth guard
  };
  const take = (s: (typeof scored)[number]) => {
    picks.push(s);
    if (s.task.projectId) projectCount.set(s.task.projectId, (projectCount.get(s.task.projectId) ?? 0) + 1);
  };

  // P2 — keystone slot when keystone undone and energy permits
  const keystoneNeeded =
    !state.signals.keystoneDoneToday && (state.signals.energyBand === null || state.signals.energyBand >= 2);
  if (keystoneNeeded) {
    const k = scored.find((s) => s.task.supportsKeystone && canTake(s));
    if (k) take(k);
  }
  // P4 — one slot for the top overdue item
  const overdue = scored.find((s) => s.task.dueDate !== null && s.task.dueDate < state.date && canTake(s));
  if (overdue) take(overdue);
  // P3 — fill by score
  for (const s of scored) {
    if (picks.length >= 3) break;
    if (canTake(s)) take(s);
  }

  // P5 fires when nothing was scheduled for today
  const nothingScheduled = !open.some((t) => t.doDate !== null && t.doDate <= state.date);

  picks.sort(tiebreak); // rank by score even if constraint order differed
  return picks.slice(0, 3).map((s, i) => {
    const isKeystonePick = keystoneNeeded && s.task.supportsKeystone;
    const isOverduePick = s.task.dueDate !== null && s.task.dueDate < state.date;
    const leadRule = isKeystonePick ? "P2" : isOverduePick ? "P4" : nothingScheduled ? "P5" : "P3";
    return {
      taskId: s.task.id, title: s.task.title, rank: (i + 1) as 1 | 2 | 3,
      score: s.score, components: s.components,
      // P5 means nothing was scheduled, so the engine is picking FOR him
      // rather than confirming a choice he already made. That is a
      // fallback, and it costs confidence.
      confidence: conf(nothingScheduled ? 1 : 0),
      rationale: explain(leadRule, { score: s.score }),
      ruleTrace: trace(s.task, [
        { ruleId: "P2", fired: isKeystonePick },
        { ruleId: "P3", fired: leadRule === "P3" },
        { ruleId: "P4", fired: isOverduePick },
        { ruleId: "P5", fired: nothingScheduled },
      ]),
    };
  });
}

/* ------------------------------------------------------------------ */
/* F — focus slot allocation                                           */
/* ------------------------------------------------------------------ */

const MS_MIN = 60_000;
const hm = (dateIso: string, hhmm: string) => `${dateIso}T${hhmm}:00`;

/**
 * Add minutes to a naive local datetime and return a naive local datetime.
 *
 * Every time string in this engine is LOCAL and offset-free — `hm()` builds
 * them and Google's free/busy is normalised to them at the adapter. Going out
 * through `Date.toISOString()` to do the arithmetic would convert to UTC and
 * hand back a string an hour off during British Summer Time, which in the F3
 * fallback produced a slot that ENDED BEFORE IT STARTED. Doing the maths in
 * minutes-since-midnight keeps the whole file in one time system.
 */
export function addMinutes(naive: string, mins: number): string {
  const [date, clock] = naive.split("T");
  const [h, m, s = "00"] = clock.split(":");
  const total = Number(h) * 60 + Number(m) + mins;
  // A slot that runs past midnight is clamped to the day rather than rolling
  // the date: no focus block in this system legitimately crosses a day.
  const capped = Math.max(0, Math.min(total, 24 * 60 - 1));
  const hh = String(Math.floor(capped / 60)).padStart(2, "0");
  const mm = String(capped % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:${s}`;
}

/** Free intervals within [dayStart, dayEnd] given busy blocks. Pure interval arithmetic. */
export function freeIntervals(busy: Interval[], dayStart: string, dayEnd: string): Interval[] {
  const sorted = [...busy]
    .filter((b) => b.end > dayStart && b.start < dayEnd)
    .sort((a, b) => a.start.localeCompare(b.start));
  const free: Interval[] = [];
  let cursor = dayStart;
  for (const b of sorted) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
  return free;
}

export function allocateFocus(
  state: MomentumState,
  priorities: Priority[],
  profile: IdentityProfile,
  cfg: CogConfig
): FocusSlot | null {
  const trace: RuleTraceEntry[] = [];
  const windowStart = hm(state.date, profile.deepWorkWindow.start);
  const windowEnd = hm(state.date, profile.deepWorkWindow.end);

  // Each rung down the fallback chain costs confidence, because each one
  // is the engine knowing less about the day than it wanted to. A block
  // read off his real calendar and a block guessed from a default window
  // are not the same claim and must not sound like it.
  const completeness = inputCompleteness(state, cfg);
  const energyMissing = state.signals.energyBand === null;
  const slotConf = (fallbacks: number) =>
    confidenceOf({ inputCompleteness: completeness, fallbacksApplied: fallbacks, energyMissing }, cfg);

  // F4 — source fallback chain
  let source: FocusSlot["source"] = "google";
  const busy = state.calendar.busy;
  if (state.calendar.source === "none") {
    source = "config-default";
    trace.push({ ruleId: "F4", fired: true, detail: "no calendar signal; config window" });
    const start = hm(state.date, cfg.fallbackFocusWindow.start);
    const end = hm(state.date, cfg.fallbackFocusWindow.end);
    return {
      id: `slot-${state.date}-fallback`, start, end,
      durationMin: Math.round((Date.parse(end) - Date.parse(start)) / MS_MIN),
      quality: "fallback", matchedPriorityRank: priorities[0]?.rank ?? null, source,
      confidence: slotConf(2), // no calendar at all: the weakest claim here
      rationale: explain("F4"), ruleTrace: trace,
    };
  }
  if (state.calendar.source === "planner") source = "planner";

  // F1 — candidates >= prime length inside the deep-work window
  const inWindow = freeIntervals(busy, windowStart, windowEnd);
  const minutes = (i: Interval) => Math.round((Date.parse(i.end) - Date.parse(i.start)) / MS_MIN);
  const prime = inWindow.filter((i) => minutes(i) >= cfg.focusMinPrimeMin);
  trace.push({ ruleId: "F1", fired: true, detail: `${prime.length} prime candidate(s)` });

  if (prime.length > 0) {
    // F2 — longest, tie -> earliest; match to best energy-fitting priority
    const pick = prime.sort((a, b) => minutes(b) - minutes(a) || a.start.localeCompare(b.start))[0];
    trace.push({ ruleId: "F2", fired: true });
    const matched = priorities[0] ?? null;
    return {
      id: `slot-${state.date}-prime`, start: pick.start, end: pick.end, durationMin: minutes(pick),
      quality: "prime", matchedPriorityRank: matched?.rank ?? null, source,
      // A prime block off a real calendar is the strongest thing this
      // engine says all day. Off planner pins it is an intention, so the
      // source itself is the fallback.
      confidence: slotConf(source === "planner" ? 1 : 0),
      rationale: explain("F2", {
        start: pick.start.slice(11, 16), end: pick.end.slice(11, 16),
        task: matched?.title ?? "your top priority",
      }),
      ruleTrace: trace,
    };
  }

  // F3 — pomodoro fallback anywhere in the waking day
  const anywhere = freeIntervals(busy, hm(state.date, "07:00"), hm(state.date, "21:00"))
    .filter((i) => minutes(i) >= cfg.focusFallbackMin)
    .sort((a, b) => minutes(b) - minutes(a) || a.start.localeCompare(b.start));
  if (anywhere.length > 0) {
    const pick = anywhere[0];
    trace.push({ ruleId: "F3", fired: true });
    return {
      id: `slot-${state.date}-pomodoro`, start: pick.start,
      end: addMinutes(pick.start, cfg.focusFallbackMin),
      durationMin: cfg.focusFallbackMin, quality: "fallback",
      matchedPriorityRank: priorities[0]?.rank ?? null, source,
      confidence: slotConf(source === "planner" ? 2 : 1),
      rationale: explain("F3", { min: cfg.focusMinPrimeMin, len: cfg.focusFallbackMin }),
      ruleTrace: trace,
    };
  }
  return null; // truly no room — the report says so
}

/* ------------------------------------------------------------------ */
/* N — the pulse (first match wins)                                    */
/* ------------------------------------------------------------------ */

export function choosePulse(
  state: MomentumState,
  priorities: Priority[],
  focusSlot: FocusSlot | null,
  microActions: MicroAction[],
  cfg: CogConfig
): AdvisorPulse {
  // The pulse inherits the confidence of what it is pointing AT. A "do
  // this next" is only as trustworthy as the priority underneath it, and
  // saying so is cheaper than pretending the sentence is more certain
  // than the ranking that produced it.
  const completeness = inputCompleteness(state, cfg);
  const energyMissing = state.signals.energyBand === null;
  const mk = (
    kind: PulseKind,
    ruleId: string,
    message: string,
    refId: string | null,
    vars = {},
    confidence?: number
  ): AdvisorPulse => ({
    id: `pulse-${state.date}-${ruleId}`, kind, refId,
    message, rationale: explain(ruleId, vars),
    ruleTrace: [{ ruleId, fired: true }],
    issuedAt: state.now, correlationId: `cor-${state.date}-${ruleId}`,
    confidence:
      confidence ??
      confidenceOf({ inputCompleteness: completeness, energyMissing }, cfg),
  });

  // N1 — no check-in yet
  if (state.signals.energySource === "none" || state.missingInputs.includes("checkin"))
    return mk("checkin", "N1", "Ten-second check-in: energy and sleep.", null);
  // N2 — pulse fatigue
  if (state.signals.pulsesRejectedToday >= cfg.pulseFatigueLimit)
    return mk("none", "N2", "Going quiet for today — the report is below when you want it.", null);
  // N3 — inside an unstarted focus slot
  if (focusSlot && state.now >= focusSlot.start && state.now < focusSlot.end)
    return mk("start-focus", "N3", `Start the focus block: ${priorities[0]?.title ?? "top priority"}.`,
      focusSlot.id, { mins: focusSlot.durationMin }, focusSlot.confidence);
  // N4 — low energy: micro-action or rest
  if (state.signals.energyBand !== null && state.signals.energyBand <= 2) {
    const m = microActions[0];
    return m
      ? mk("micro-action", "N4", `Low-energy move: ${m.label}`, m.id, { band: state.signals.energyBand })
      : mk("rest", "N4", "Recover. That's the productive move right now.", null, { band: state.signals.energyBand });
  }
  // N5 — keystone undone
  if (!state.signals.keystoneDoneToday) {
    const k = priorities.find((p) => p.ruleTrace.some((r) => r.ruleId === "P2" && r.fired));
    if (k) return mk("do-task", "N5", `Keystone first: ${k.title}`, k.taskId, {}, k.confidence);
  }
  // N6 — inbox pressure
  if (state.signals.inboxCount > cfg.triageThreshold)
    return mk("triage", "N6", "Five minutes of inbox triage.", null, { count: state.signals.inboxCount });
  // N8 — everything done
  if (priorities.length === 0)
    return mk("rest", "N8", "Nothing left that beats resting. Day's banked.", null);
  // N7 — default: top priority
  return mk(
    "do-task", "N7", `Next: ${priorities[0].title}`, priorities[0].taskId,
    { task: priorities[0].title }, priorities[0].confidence
  );
}

/* ------------------------------------------------------------------ */
/* I — identity alignment                                              */
/* ------------------------------------------------------------------ */

export function identityCheck(profile: IdentityProfile): IdentityAlignment {
  const total = Object.values(profile.recentCompletionsByPillar).reduce((a, b) => a + b, 0);
  if (total === 0 || profile.statements.length === 0) return { aligned: [], drifts: [] };

  const weightSum = profile.statements.reduce((a, s) => a + s.weight, 0);
  const results = profile.statements.map((s) => {
    const done = profile.recentCompletionsByPillar[s.pillarId] ?? 0;
    const actual = done / total;
    const expected = s.weight / weightSum;
    return { s, done, gap: expected - actual };
  });

  const aligned = results.filter((r) => r.gap <= 0.05).map((r) => r.s.pillarId);
  // I3 — keystone pillar drift always leads
  const drifting = results
    .filter((r) => r.gap > 0.05)
    .sort((a, b) => {
      const aKey = a.s.pillarId === profile.keystoneHabitId ? 1 : 0;
      const bKey = b.s.pillarId === profile.keystoneHabitId ? 1 : 0;
      return bKey - aKey || b.gap - a.gap;
    })
    .slice(0, 2) // I2 — at most 2, observations not verdicts
    .map((r) => ({ pillarId: r.s.pillarId, observation: explain("I2", { done: r.done, total }) }));

  return { aligned, drifts: drifting };
}

/* ------------------------------------------------------------------ */
/* M — micro-actions                                                   */
/* ------------------------------------------------------------------ */

export function microActions(state: MomentumState, cfg: CogConfig, availableMin = 5): MicroAction[] {
  const microConf = confidenceOf(
    {
      inputCompleteness: inputCompleteness(state, cfg),
      energyMissing: state.signals.energyBand === null,
    },
    cfg
  );
  // M1 gate is applied by the caller (advisor / endpoint); this builds candidates in M2 order.
  const out: MicroAction[] = [];
  const mk = (label: string, origin: MicroAction["origin"], est: number, refTaskId: string | null): MicroAction => ({
    id: `micro-${state.date}-${out.length + 1}`, label, estimateMin: est, origin, refTaskId,
    confidence: microConf,
    rationale: explain("M2", { mins: availableMin, origin }),
    ruleTrace: [{ ruleId: "M2", fired: true, detail: origin }],
  });

  for (const t of state.tasks) {
    if (t.status === "open" && t.estimateMin !== null && t.estimateMin <= Math.min(availableMin, cfg.microActionMaxMin))
      out.push(mk(t.title, "task-fragment", t.estimateMin, t.id));
    if (out.length >= 3) return out; // M3
  }
  if (!state.signals.keystoneDoneToday && out.length < 3)
    out.push(mk("Lay out training kit for the session", "keystone-support", 3, null));
  if (state.signals.inboxCount > 0 && out.length < 3)
    out.push(mk(`Triage 3 inbox items (${state.signals.inboxCount} waiting)`, "inbox-triage", 5, null));
  return out.slice(0, 3);
}
