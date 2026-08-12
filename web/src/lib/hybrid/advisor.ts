/* ------------------------------------------------------------------ *
 * The advisor
 *
 * Four channels — readiness, progression, skill, recovery — kept separate
 * so none drowns out another. A single ranked list would fill with whatever
 * channel happens to be noisiest, and the quiet one is usually the one
 * worth reading.
 *
 * Three rules the whole layer obeys:
 *
 *   · **It suggests. It never performs.** Every piece of advice carries an
 *     optional `action` describing what the app should OFFER. Nothing here
 *     changes a plan, cancels a session, or writes a log.
 *   · **It says why.** Advice without its reason is an instruction, and
 *     instructions get followed twice and then ignored. Every line carries
 *     the evidence with it.
 *   · **It stays quiet.** The advisor returns nothing when there is nothing
 *     to say. Manufacturing a daily insight is the fastest way to teach
 *     someone to skip the daily insight.
 * ------------------------------------------------------------------ */

import {
  type Advice,
  type AthleteProfile,
  type Exercise,
  type ReadinessResult,
  type SessionLog,
  type SkillState,
  type SkillTree,
} from "./types";
import { BAND_LABEL, drivers } from "./readiness";
import {
  type WorkloadRatio,
  daysSince,
  volumeReport,
  workloadRatio,
} from "./load";
import { treeProgress, workingEdge } from "./skills";
import { pushPullBalance } from "./exercises";

/* ------------------------------------------------------------------ *
 * 1 · Readiness
 * ------------------------------------------------------------------ */

export function readinessAdvice(readiness: ReadinessResult): Advice[] {
  const out: Advice[] = [];

  // No score is itself worth a line — but a quiet, fixable one, because the
  // fix is three taps rather than a wearable purchase.
  if (readiness.score == null) {
    out.push({
      channel: "readiness",
      severity: "info",
      line: readiness.reason ?? "No readiness score today.",
      action: { label: "Answer the three questions", href: "/checkin" },
    });
    return out;
  }

  const { down, up } = drivers(readiness);
  const because =
    down.length > 0
      ? ` — ${down.map((d) => d.line).join(", and ")}`
      : up.length > 0
        ? ` — ${up.map((d) => d.line).join(", and ")}`
        : "";

  out.push({
    channel: "readiness",
    severity: readiness.band === "red" ? "warn" : readiness.band === "amber" ? "note" : "info",
    line: `${BAND_LABEL[readiness.band!]} · ${readiness.score}${because}.`,
  });

  // Confidence is stated whenever it is thin, so a number built on two
  // signals never passes for one built on six.
  if (readiness.confidence < 0.6) {
    out.push({
      channel: "readiness",
      severity: "info",
      line: `That score rests on about ${Math.round(readiness.confidence * 100)}% of the usual evidence. Treat it as a hint rather than a verdict.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2 · Progression
 * ------------------------------------------------------------------ */

export function progressionAdvice(
  sessions: SessionLog[],
  library: Map<string, Exercise>,
  profile: AthleteProfile,
  todayIso: string
): Advice[] {
  const out: Advice[] = [];
  const lastWeek = sessions.filter((s) => {
    const d = daysSince([s], s.kind, todayIso);
    return d != null && d <= 7;
  });

  // With nothing logged there is nothing to advise on. Reporting thirteen
  // undertrained muscle groups to someone who has not logged a session yet
  // is the system inventing a failure out of its own empty table — the
  // exact mistake that empty habit logs already taught this codebase once.
  if (lastWeek.length === 0) return out;

  // Volume: only the ends of the scale are worth a line. "Productive" is
  // the expected state and saying so every day is noise.
  const report = volumeReport(lastWeek, library, profile.landmarks);
  const over = report.filter((r) => r.status === "over");
  const under = report.filter(
    (r) => r.status === "under-maintenance" && r.landmarks.mv > 0
  );

  for (const r of over.slice(0, 2)) {
    out.push({
      channel: "progression",
      severity: "warn",
      line: `${r.sets} sets for ${r.muscle.replace("-", " ")} this week, past the ${r.landmarks.mrv} you can recover from. ${r.line}`,
    });
  }
  if (under.length >= 3) {
    out.push({
      channel: "progression",
      severity: "note",
      line: `${under.length} muscle groups had no meaningful work this week — ${under
        .slice(0, 3)
        .map((r) => r.muscle.replace("-", " "))
        .join(", ")}${under.length > 3 ? ", and others" : ""}. Not a crisis in one week; a real hole in six.`,
    });
  }

  // Structural balance — the fault that costs shoulders over a year.
  const balance = pushPullBalance(
    lastWeek.flatMap((s) => s.sets.map((set) => set.exercise_id))
  );
  if (balance.ratio != null && balance.ratio < 0.8) {
    out.push({ channel: "progression", severity: "note", line: balance.line });
  }

  // Frequency — the lever the split actually turns.
  for (const kind of ["push", "pull", "legs"] as const) {
    const since = daysSince(sessions, kind, todayIso);
    if (since != null && since >= 10) {
      out.push({
        channel: "progression",
        severity: "note",
        line: `${since} days since a ${kind} session. Twice a week beats once at the same total volume — this is the cheapest thing to fix.`,
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * 3 · Skill
 * ------------------------------------------------------------------ */

export function skillAdvice(
  trees: SkillTree[],
  state: SkillState,
  profile: AthleteProfile
): Advice[] {
  const out: Advice[] = [];
  const focus = trees.filter((t) => profile.focus_skills.includes(t.id));

  if (focus.length === 0) {
    out.push({
      channel: "skill",
      severity: "info",
      line: "No skill is being actively worked. Skills are the part of this that compounds — one at a time is the point, but one is worth having.",
      action: { label: "Pick a skill", href: "/health/skills" },
    });
    return out;
  }

  // More than two at once is the classic way to make no progress on any.
  if (focus.length > 2) {
    out.push({
      channel: "skill",
      severity: "note",
      line: `${focus.length} skills in focus at once. Two is about the ceiling — beyond that each gets too little practice to move, and none of them finishes.`,
    });
  }

  for (const tree of focus) {
    const edge = workingEdge(tree, state);
    const progress = treeProgress(tree, state);
    if (edge.length === 0) {
      out.push({
        channel: "skill",
        severity: "info",
        line: `${tree.name} is fully owned — ${progress.owned} of ${progress.of} rungs. Time to pick the next one.`,
      });
      continue;
    }
    const next = edge[0];
    out.push({
      channel: "skill",
      severity: "info",
      line: `${tree.name}: ${progress.owned} of ${progress.of} rungs owned. Working on ${next.name} — ${
        next.standard.hold_s != null
          ? `${next.standard.hold_s}s`
          : `${next.standard.reps} strict reps`
      }, across ${next.standard.sessions ?? 2} separate sessions.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 4 · Recovery
 * ------------------------------------------------------------------ */

export function recoveryAdvice(
  sessions: SessionLog[],
  readiness: ReadinessResult,
  todayIso: string
): Advice[] {
  const out: Advice[] = [];
  const ratio: WorkloadRatio = workloadRatio(sessions, todayIso);

  if (ratio.zone === "spiking") {
    out.push({
      channel: "recovery",
      severity: "warn",
      line: `${ratio.line} The evidence behind this ratio is genuinely contested, so treat it as a conversation rather than a rule — but it is the shape most injuries have in hindsight.`,
    });
  }
  if (ratio.zone === "detraining") {
    out.push({ channel: "recovery", severity: "note", line: ratio.line });
  }

  // Consecutive hard days. Not forbidden — flagged, with the number, so the
  // athlete can decide whether it was deliberate.
  const recent = [...sessions]
    .filter((s) => s.on <= todayIso && s.kind !== "rest" && s.kind !== "recovery")
    .sort((a, b) => b.on.localeCompare(a.on));
  let streak = 0;
  for (let i = 0; i < recent.length; i++) {
    const gap = daysSince([recent[i]], recent[i].kind, todayIso);
    if (gap != null && gap === i) streak++;
    else break;
  }
  if (streak >= 5) {
    out.push({
      channel: "recovery",
      severity: "note",
      line: `${streak} training days in a row without a rest or recovery day. Adaptation happens on the days off, so this is borrowing rather than earning.`,
    });
  }

  // A low score with sleep among the drivers gets the one intervention with
  // the best evidence behind it, and no others — a list of six recovery
  // tactics is a list nobody does.
  if (readiness.score != null && readiness.band !== "green") {
    const { down } = drivers(readiness);
    const sleepDown = down.find(
      (d) => d.key === "sleep_hours" || d.key === "sleep_quality"
    );
    if (sleepDown) {
      out.push({
        channel: "recovery",
        severity: "note",
        line: "Sleep is what pulled today down, and it is the only recovery lever with an effect size worth the trouble. Everything else is rounding error beside it.",
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * All four, together
 * ------------------------------------------------------------------ */

export type AdvisorInput = {
  todayIso: string;
  readiness: ReadinessResult;
  sessions: SessionLog[];
  library: Map<string, Exercise>;
  trees: SkillTree[];
  skillState: SkillState;
  profile: AthleteProfile;
};

/**
 * Everything the advisor has to say, grouped by channel.
 *
 * Grouped rather than ranked: a single ordered list would let the loudest
 * channel crowd out the others, and the quiet channel — usually skill — is
 * the one carrying the long-term work.
 */
export function advise(input: AdvisorInput): Record<string, Advice[]> {
  return {
    readiness: readinessAdvice(input.readiness),
    progression: progressionAdvice(
      input.sessions,
      input.library,
      input.profile,
      input.todayIso
    ),
    skill: skillAdvice(input.trees, input.skillState, input.profile),
    recovery: recoveryAdvice(input.sessions, input.readiness, input.todayIso),
  };
}

/** Flattened, worst-first, for a single surface that has room for three lines. */
export function topAdvice(input: AdvisorInput, limit: number = 3): Advice[] {
  const order = { warn: 0, note: 1, info: 2 };
  return Object.values(advise(input))
    .flat()
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, limit);
}
