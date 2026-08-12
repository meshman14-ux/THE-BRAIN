/**
 * Base fixture: a plausible Jay-day. Every sample case patches this.
 * date 2026-08-13, now 07:30 (before the 08:30 deep-work window so N3 doesn't mask other rules).
 */
import type { CogTask, IdentityProfile, MomentumState } from "../../src/lib/cog";

export const baseTasks: CogTask[] = [
  {
    id: "t1-train", title: "Train — gym session", status: "open",
    doDate: "2026-08-13", dueDate: null, priority: 2, energy: "medium",
    pillarId: "pillar-training", projectId: null, estimateMin: 60,
    staleDays: 0, supportsKeystone: true,
  },
  {
    id: "t2-invoice", title: "A to Z Traderz: chase supplier invoice", status: "open",
    doDate: "2026-08-13", dueDate: "2026-08-13", priority: 2, energy: "low",
    pillarId: "pillar-ventures", projectId: "proj-az", estimateMin: 5,
    staleDays: 2, supportsKeystone: false,
  },
  {
    id: "t3-spec", title: "Write BRAIN quarterly reset spec", status: "open",
    doDate: "2026-08-13", dueDate: null, priority: 3, energy: "deep",
    pillarId: "pillar-systems", projectId: "proj-brain", estimateMin: 90,
    staleDays: 5, supportsKeystone: false,
  },
  {
    id: "t4-mot", title: "Book MOT for the van", status: "open",
    doDate: null, dueDate: "2026-08-18", priority: 1, energy: "low",
    pillarId: "pillar-admin", projectId: null, estimateMin: 4,
    staleDays: 12, supportsKeystone: false,
  },
];

export function baseState(): MomentumState {
  return {
    date: "2026-08-13",
    now: "2026-08-13T07:30:00",
    season: "quiet",
    signals: {
      energyBand: 4, sleepBand: 4, energySource: "checkin", sleepSource: "checkin",
      yesterdayCompletionRatio: 0.667, keystoneHitYesterday: true, keystoneDoneToday: false,
      checkinStreakDays: 7, finishesRate: 0.58, calendarLoadRatio: 0.3, workloadPressure: 0.4,
      inboxCount: 4, pulsesRejectedToday: 0,
    },
    tasks: structuredClone(baseTasks),
    calendar: {
      source: "google",
      busy: [{ start: "2026-08-13T13:00:00", end: "2026-08-13T14:00:00" }],
    },
    empire: { dormantVentures: 3, opportunitiesDueToday: 0 },
    missingInputs: ["health"], // Samsung Health not flowing yet — the realistic default
  };
}

export function baseProfile(): IdentityProfile {
  return {
    id: "profile-jay",
    keystoneHabitId: "pillar-training",
    deepWorkWindow: { start: "08:30", end: "12:30" },
    statements: [
      { pillarId: "pillar-training", statement: "I am someone who trains before the day can interfere.", weight: 1 },
      { pillarId: "pillar-ventures", statement: "I finish what I price.", weight: 0.8 },
      { pillarId: "pillar-family", statement: "Present, not just providing.", weight: 0.8 },
    ],
    alignmentWindowDays: 7,
    recentCompletionsByPillar: { "pillar-ventures": 9, "pillar-admin": 4, "pillar-training": 1 },
  };
}

/** Tiny deep-merge for fixture patches (objects only; arrays replace). */
export function deepMerge<T>(target: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    out[k] =
      v !== null && typeof v === "object" && !Array.isArray(v) &&
      typeof out[k] === "object" && out[k] !== null && !Array.isArray(out[k])
        ? deepMerge(out[k], v as Record<string, unknown>)
        : v;
  }
  return out as T;
}
