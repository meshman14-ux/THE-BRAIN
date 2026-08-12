/* ------------------------------------------------------------------ *
 * Load, volume and fatigue
 *
 * Two different questions live here and they are deliberately kept apart:
 *
 *   · **Is the weekly dose right?** — answered per muscle group against
 *     Israetel's volume landmarks (MV / MEV / MAV / MRV). This is a
 *     question about STIMULUS.
 *   · **Is fatigue outrunning fitness?** — answered by the acute-to-chronic
 *     workload ratio over session load. This is a question about RISK.
 *
 * A programme can be right on one and wrong on the other, and collapsing
 * them into a single "load" number is how that gets missed.
 *
 * The landmarks ship as defaults and are overridable per athlete, because
 * they are individual and they move: MRV falls in a bad sleep week and
 * rises across a training age. A default presented as a fact is the system
 * asserting something about this body it cannot know.
 * ------------------------------------------------------------------ */

import {
  type Exercise,
  type MuscleGroup,
  type SessionLog,
  type SetLog,
  type VolumeLandmarks,
  type VolumeStatus,
  MUSCLE_GROUPS,
} from "./types";

/* ------------------------------------------------------------------ *
 * Volume landmarks
 * ------------------------------------------------------------------ */

/**
 * Defaults, in hard working sets per week.
 *
 * Roughly Israetel's published mid-range figures for an intermediate
 * trainee. Small muscles that get heavy indirect work (triceps, biceps,
 * forearms) sit lower because the compound work already pays much of
 * their bill — counting a chin-up's biceps stimulus at full value and then
 * prescribing full direct volume on top is the standard way to overshoot.
 */
export const DEFAULT_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  chest: { mv: 4, mev: 8, mav: 16, mrv: 22 },
  "front-delts": { mv: 0, mev: 6, mav: 12, mrv: 16 },
  "side-delts": { mv: 6, mev: 8, mav: 20, mrv: 26 },
  "rear-delts": { mv: 0, mev: 6, mav: 16, mrv: 24 },
  triceps: { mv: 4, mev: 6, mav: 14, mrv: 18 },
  biceps: { mv: 4, mev: 8, mav: 16, mrv: 20 },
  forearms: { mv: 2, mev: 4, mav: 10, mrv: 15 },
  lats: { mv: 6, mev: 10, mav: 18, mrv: 25 },
  "upper-back": { mv: 6, mev: 10, mav: 20, mrv: 26 },
  "lower-back": { mv: 2, mev: 4, mav: 10, mrv: 14 },
  quads: { mv: 6, mev: 8, mav: 16, mrv: 20 },
  hamstrings: { mv: 3, mev: 6, mav: 14, mrv: 20 },
  glutes: { mv: 0, mev: 4, mav: 12, mrv: 16 },
  calves: { mv: 6, mev: 8, mav: 16, mrv: 20 },
  abs: { mv: 0, mev: 6, mav: 16, mrv: 25 },
  obliques: { mv: 0, mev: 4, mav: 12, mrv: 20 },
  "hip-flexors": { mv: 0, mev: 4, mav: 10, mrv: 14 },
  // Calisthenics-specific, and absent from any barbell chart. Straight-arm
  // scapular work and wrist tolerance are the two things that actually cap
  // lever and hand-balancing progress, so they get landmarks of their own.
  "scapular-stabilisers": { mv: 3, mev: 6, mav: 14, mrv: 18 },
  wrists: { mv: 2, mev: 4, mav: 10, mrv: 14 },
};

export function landmarksFor(
  muscle: MuscleGroup,
  overrides?: Partial<Record<MuscleGroup, VolumeLandmarks>>
): VolumeLandmarks {
  return overrides?.[muscle] ?? DEFAULT_LANDMARKS[muscle];
}

/**
 * Where this week's volume sits.
 *
 * "at-ceiling" is separated from "over" on purpose: MAV to MRV is the
 * productive top end of a block, not a mistake, and a system that flags it
 * red teaches the athlete to ignore the flag. Only past MRV is a problem.
 */
export function volumeStatus(
  sets: number,
  landmarks: VolumeLandmarks
): VolumeStatus {
  if (sets > landmarks.mrv) return "over";
  if (sets >= landmarks.mav) return "at-ceiling";
  if (sets >= landmarks.mev) return "productive";
  if (sets >= landmarks.mv) return "maintaining";
  return "under-maintenance";
}

export const VOLUME_STATUS_LINE: Record<VolumeStatus, string> = {
  "under-maintenance": "below what holds it — this is being lost, slowly",
  maintaining: "enough to keep, not enough to build",
  productive: "in the growing range",
  "at-ceiling": "at the top of the productive range — fine for a block, not forever",
  over: "past what can be recovered from — this is debt, not stimulus",
};

/* ------------------------------------------------------------------ *
 * Counting sets
 * ------------------------------------------------------------------ */

/**
 * A secondary muscle earns half a set.
 *
 * Counting a chin-up as a full set for biceps overstates direct volume;
 * counting it as nothing understates it, which is how people end up doing
 * twenty direct arm sets on top of a heavy pulling week and wondering why
 * their elbows hurt. Half is the convention Israetel uses and it is at
 * least explicit.
 */
export const SECONDARY_SET_VALUE = 0.5;

/**
 * A set only counts as a hard set if it was taken near failure.
 *
 * Helms and Nuckols both put the stimulus in the last few reps. Logging a
 * set of 12 at 6 RIR and counting it toward MEV is how a programme looks
 * adequate on paper and produces nothing. Unlogged RIR is counted — the
 * alternative is punishing incomplete logging, which just stops the logging.
 */
export const HARD_SET_MAX_RIR = 4;

export function isHardSet(set: SetLog): boolean {
  return set.rir == null || set.rir <= HARD_SET_MAX_RIR;
}

/** Weekly hard sets per muscle group across the given sessions. */
export function weeklySets(
  sessions: SessionLog[],
  library: Map<string, Exercise>
): Map<MuscleGroup, number> {
  const out = new Map<MuscleGroup, number>();
  const add = (m: MuscleGroup, v: number) =>
    out.set(m, (out.get(m) ?? 0) + v);

  for (const session of sessions) {
    for (const set of session.sets) {
      if (!isHardSet(set)) continue;
      const ex = library.get(set.exercise_id);
      if (!ex) continue;
      for (const m of ex.muscles.primary) add(m, 1);
      for (const m of ex.muscles.secondary) add(m, SECONDARY_SET_VALUE);
    }
  }
  return out;
}

export type VolumeReport = {
  muscle: MuscleGroup;
  sets: number;
  landmarks: VolumeLandmarks;
  status: VolumeStatus;
  line: string;
};

/**
 * The full weekly picture.
 *
 * Muscles with no volume at all are INCLUDED rather than omitted, because
 * the absence is the finding. A rear-delt row that never appears is the
 * thing a push-heavy hybrid programme will not notice on its own.
 */
export function volumeReport(
  sessions: SessionLog[],
  library: Map<string, Exercise>,
  overrides?: Partial<Record<MuscleGroup, VolumeLandmarks>>
): VolumeReport[] {
  const counts = weeklySets(sessions, library);
  return MUSCLE_GROUPS.map((muscle) => {
    const sets = counts.get(muscle) ?? 0;
    const landmarks = landmarksFor(muscle, overrides);
    const status = volumeStatus(sets, landmarks);
    return {
      muscle,
      sets: Math.round(sets * 2) / 2,
      landmarks,
      status,
      line: VOLUME_STATUS_LINE[status],
    };
  });
}

/* ------------------------------------------------------------------ *
 * Session load and the acute:chronic ratio
 * ------------------------------------------------------------------ */

/**
 * Foster's session-RPE method: load = RPE × minutes.
 *
 * Crude, decades old, and it survives because it works across modalities.
 * It is the only load measure that prices a heavy pull day and a long
 * conditioning session on the same scale, which a hybrid programme needs.
 * Sessions without an RPE contribute nothing rather than a guess.
 */
export function sessionLoad(session: SessionLog): number | null {
  if (session.session_rpe == null || session.duration_min == null) return null;
  return session.session_rpe * session.duration_min;
}

const shiftDays = (iso: string, by: number): string => {
  const d = new Date(
    Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
  );
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

/** Total load in the `days` ending today, as a daily average. */
export function averageLoad(
  sessions: SessionLog[],
  todayIso: string,
  days: number
): number | null {
  const from = shiftDays(todayIso, -(days - 1));
  const loads = sessions
    .filter((s) => s.on >= from && s.on <= todayIso)
    .map(sessionLoad)
    .filter((l): l is number => l != null);
  if (loads.length === 0) return null;
  return loads.reduce((a, b) => a + b, 0) / days;
}

export type WorkloadRatio = {
  acute: number | null;
  chronic: number | null;
  /** Acute ÷ chronic. Null when there is not enough history to divide by. */
  ratio: number | null;
  zone: "detraining" | "steady" | "building" | "spiking" | "unknown";
  line: string;
};

/** Below this the athlete is losing more than they are keeping. */
export const ACWR_LOW = 0.8;
/** Above this, injury risk rises sharply in the team-sport literature. */
export const ACWR_HIGH = 1.5;

/**
 * Acute (7-day) against chronic (28-day) workload.
 *
 * The evidence base is contested — the original Gabbett work has taken
 * real methodological criticism — so this is used as a CONVERSATION rather
 * than a rule. It never gates a session. What it is genuinely good at is
 * catching the pattern that ends hybrid training: two quiet weeks, then a
 * motivated Monday at triple the usual dose.
 *
 * Fewer than three chronic weeks means no ratio, because dividing by a
 * fortnight of enthusiasm produces a frightening number that means nothing.
 */
export function workloadRatio(
  sessions: SessionLog[],
  todayIso: string
): WorkloadRatio {
  const acute = averageLoad(sessions, todayIso, 7);
  const chronic = averageLoad(sessions, todayIso, 28);
  const chronicSessions = sessions.filter(
    (s) => s.on >= shiftDays(todayIso, -27) && s.on <= todayIso
  ).length;

  if (acute == null || chronic == null || chronic === 0 || chronicSessions < 6) {
    return {
      acute,
      chronic,
      ratio: null,
      zone: "unknown",
      line: "Not enough logged sessions yet to compare this week against your normal.",
    };
  }

  const ratio = acute / chronic;
  if (ratio < ACWR_LOW) {
    return {
      acute,
      chronic,
      ratio,
      zone: "detraining",
      line: "This week is lighter than your last month. Fine if it is deliberate; worth noticing if it is not.",
    };
  }
  if (ratio > ACWR_HIGH) {
    return {
      acute,
      chronic,
      ratio,
      zone: "spiking",
      line: "This week is well above what your last month prepared you for. Not a rule, but this is the shape most injuries have in hindsight.",
    };
  }
  if (ratio > 1.15) {
    return { acute, chronic, ratio, zone: "building", line: "Building on your recent normal — this is what progress looks like." };
  }
  return { acute, chronic, ratio, zone: "steady", line: "Holding steady against your last month." };
}

/**
 * Days since the last session of a given kind.
 *
 * Frequency is the lever the split actually turns: Nippard's and Helms'
 * reading of the frequency literature is that 2× per week per muscle beats
 * 1× at matched volume. This is what lets the plan generator notice that
 * legs have not been touched in nine days.
 */
export function daysSince(
  sessions: SessionLog[],
  kind: SessionLog["kind"],
  todayIso: string
): number | null {
  const last = sessions
    .filter((s) => s.kind === kind && s.on <= todayIso)
    .sort((a, b) => b.on.localeCompare(a.on))[0];
  if (!last) return null;
  return Math.round(
    (Date.UTC(
      +todayIso.slice(0, 4),
      +todayIso.slice(5, 7) - 1,
      +todayIso.slice(8, 10)
    ) -
      Date.UTC(
        +last.on.slice(0, 4),
        +last.on.slice(5, 7) - 1,
        +last.on.slice(8, 10)
      )) /
      86_400_000
  );
}
