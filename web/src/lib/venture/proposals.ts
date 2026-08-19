/**
 * Propose, never push.
 *
 * `venture_proposals` is the only route by which anything automated reaches
 * Jay. Nothing here writes: these functions decide what would be WORTH
 * offering, and a proposal becomes a real row only when he taps Accept.
 *
 * The house rule for a rationale, which no type can enforce and every one
 * of these follows — **descriptive and comparative, never directive**:
 *
 *   ✅ "3 of your 4 property ventures have an EICR date recorded.
 *       Kathleen St does not."
 *   ❌ "You should book an EICR for Kathleen St."
 *
 * The difference is not politeness. The first is evidence he can disagree
 * with; the second is an instruction from software that does not know what
 * his week looks like, and the way you learn to ignore those is by being
 * given one that was wrong.
 */

import { type Tier, type VentureModuleRow, groupOf, readTier } from "./types";
import { daysBetween } from "./scoring";

export type ProposalKind =
  | "peer_gap"
  | "dormancy"
  | "kpi_seed"
  | "tier_disagrees"
  | "checklist_stale";

export type ProposalDraft = {
  kind: ProposalKind;
  venture_id: string;
  label: string;
  rationale: string;
  payload: Record<string, unknown>;
};

/**
 * A venture compared against its OWN peer group, which beats comparing it
 * to an abstract standard: the peer group is evidence, the standard is an
 * opinion. Silent below three peers — two ventures agreeing on something is
 * a coincidence, the same floor `obstacleTally` holds at three reviews.
 */
export const PEER_FLOOR = 3;

export type PeerFact = {
  venture: VentureModuleRow;
  /** Whether this venture has the thing being compared. */
  has: boolean;
};

export function proposePeerGap(
  peers: PeerFact[],
  what: { key: string; noun: string }
): ProposalDraft[] {
  const byGroup = new Map<string, PeerFact[]>();
  for (const p of peers) {
    const g = groupOf(p.venture);
    byGroup.set(g, [...(byGroup.get(g) ?? []), p]);
  }
  const out: ProposalDraft[] = [];
  for (const [group, members] of byGroup) {
    if (members.length < PEER_FLOOR) continue;
    const withIt = members.filter((m) => m.has);
    const without = members.filter((m) => !m.has);
    // A gap is only interesting when it is a MINORITY. If none of them has
    // it, that is a decision about the whole group, not a gap in one.
    if (!withIt.length || withIt.length <= without.length) continue;
    for (const m of without) {
      out.push({
        kind: "peer_gap",
        venture_id: m.venture.id,
        label: `${m.venture.name} has no ${what.noun}`,
        rationale: `${withIt.length} of your ${members.length} ${group.toLowerCase()} ventures have ${
          what.noun
        } recorded. ${m.venture.name} does not.`,
        payload: { field: what.key, group },
      });
    }
  }
  return out.sort((a, b) => a.venture_id.localeCompare(b.venture_id));
}

/**
 * Dormancy is PROPOSED, never applied. Marking a venture dormant is a
 * decision about what Jay is doing with his life, and the system's evidence
 * for it is only that nothing has been typed — which is not the same thing
 * as nothing having happened.
 */
export const DORMANCY_SILENCE_DAYS = 120;

export function proposeDormancy(
  ventures: VentureModuleRow[],
  today: string
): ProposalDraft[] {
  return ventures
    .filter((v) => {
      const tier = readTier(v.tier);
      if (tier === "dormant") return false;
      const anchor = v.last_touched_at ?? v.created_at ?? null;
      if (!anchor) return false;
      return daysBetween(anchor, today) >= DORMANCY_SILENCE_DAYS;
    })
    .map((v) => {
      const anchor = (v.last_touched_at ?? v.created_at) as string;
      const days = daysBetween(anchor, today);
      return {
        kind: "dormancy" as const,
        venture_id: v.id,
        label: `${v.name} has been quiet for ${days} days`,
        rationale: `Nothing has been recorded against ${v.name} since ${anchor.slice(
          0,
          10
        )}. Ventures marked dormant keep their checklist and their paperwork; they stop being counted as work in progress.`,
        payload: { tier: "dormant" as Tier, days },
      };
    })
    .sort((a, b) => a.venture_id.localeCompare(b.venture_id));
}

/**
 * An active venture with no KPI is a venture nobody can tell the state of.
 * The proposal offers the five templates for its type; it does not create
 * them, because five measures nobody chose are five measures nobody logs.
 */
export function proposeKpiSeed(
  ventures: { venture: VentureModuleRow; kpiCount: number }[]
): ProposalDraft[] {
  return ventures
    .filter(({ venture, kpiCount }) => readTier(venture.tier) === "active" && kpiCount === 0)
    .map(({ venture }) => ({
      kind: "kpi_seed" as const,
      venture_id: venture.id,
      label: `${venture.name} is trading with nothing measured`,
      rationale: `${venture.name} is marked active and has no KPI. Its RAG is measured on the last reading, so it will read amber until one exists.`,
      payload: { type: venture.venture_type },
    }))
    .sort((a, b) => a.venture_id.localeCompare(b.venture_id));
}

/**
 * Stated and derived, kept separate and shown when they disagree — the
 * `/goals` discipline. This never changes a tier; it says the two claims
 * do not match and leaves the reconciling to the person who knows why.
 */
export function proposeTierDisagreement(
  ventures: VentureModuleRow[],
  derived: (v: VentureModuleRow) => Tier | null
): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  for (const v of ventures) {
    const stated = readTier(v.tier);
    const d = derived(v);
    if (!stated || !d || stated === d) continue;
    out.push({
      kind: "tier_disagrees",
      venture_id: v.id,
      label: `${v.name} is filed as ${stated} and reads as ${d}`,
      rationale: `${v.name} is marked ${stated}. Its evidence — IRL ${v.irl ?? "—"} — describes a ${d} venture.`,
      payload: { stated, derived: d },
    });
  }
  return out.sort((a, b) => a.venture_id.localeCompare(b.venture_id));
}

/**
 * Merging two ventures is deliberately NOT proposed and never automated:
 * it loses history, and history is the only thing a five-year-old record
 * has that a fresh one does not.
 */
export const MERGING_IS_NEVER_AUTOMATED = true;
