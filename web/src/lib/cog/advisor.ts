/**
 * THE COG — Advisor Engine entry point.
 * PURE: advise(state, profile, config) -> Advice. No I/O, no clock, no randomness.
 * The Workflow Orchestrator (app/api/cog/*) builds the MomentumState and persists results;
 * this module only thinks. That split is what makes the engine testable and deterministic.
 */
import type { CogConfig } from "./config";
import { explain } from "./explain";
import { confidenceOf, inputCompleteness, momentumBand, momentumIndicator } from "./score";
import { allocateFocus, choosePulse, identityCheck, microActions, selectPriorities } from "./rules";
import type { Advice, IdentityProfile, MomentumState } from "./types";

export function advise(state: MomentumState, profile: IdentityProfile, cfg: CogConfig): Advice {
  // 2 — SCORE
  const { score } = momentumIndicator(state, cfg);
  const stateScored: MomentumState = { ...state, momentumIndicator: score };
  const band = momentumBand(score);

  // 3 — RULES
  const priorities = selectPriorities(stateScored, cfg);
  const focusSlot = allocateFocus(stateScored, priorities, profile, cfg);
  const lowEnergy = stateScored.signals.energyBand !== null && stateScored.signals.energyBand <= 2;
  const micro = lowEnergy ? microActions(stateScored, cfg) : []; // M1 gate
  const pulse = choosePulse(stateScored, priorities, focusSlot, micro, cfg);
  const identityAlignment = identityCheck(profile);

  // 4 — OUTPUTS
  const degraded = stateScored.missingInputs.length > 0;

  /* Confidence in the momentum figure itself.
   *
   * The score already renormalises over present inputs, so a missing
   * sensor does not crater it — but that leaves a real problem the score
   * alone cannot express: a 73 built on two signals looks exactly like a
   * 73 built on seven. This is the number that tells them apart, and it
   * is capped below 1 because the engine is deterministic and the person
   * it models is not. */
  const completeness = inputCompleteness(stateScored, cfg);
  const reportConfidence = confidenceOf(
    {
      inputCompleteness: completeness,
      fallbacksApplied: stateScored.missingInputs.length > 2 ? 1 : 0,
      energyMissing: stateScored.signals.energyBand === null,
    },
    cfg
  );
  const headline =
    band === "rolling" ? `Momentum ${score} — rolling. Protect it.`
    : band === "steady" ? `Momentum ${score} — steady. One good block tips it.`
    : `Momentum ${score} — low day. Shrink the target, keep the streak.`;

  const narrativeParts = [
    headline,
    priorities.length > 0
      ? `Top of the list: ${priorities.map((p) => p.title).join(" · ")}.`
      : "Nothing scheduled — triage or rest are both legitimate.",
    focusSlot
      ? `Main block ${focusSlot.start.slice(11, 16)}–${focusSlot.end.slice(11, 16)} (${focusSlot.quality}).`
      : "No usable focus block today; work in the gaps.",
  ];
  if (degraded)
    narrativeParts.push(explain("REPORT_DEGRADED", { missing: stateScored.missingInputs.join(", ") }));

  return {
    state: stateScored,
    report: {
      headline,
      momentumIndicator: score,
      band,
      degraded,
      missingInputs: stateScored.missingInputs,
      narrative: narrativeParts.join(" "),
      confidence: reportConfidence,
      inputCompleteness: Math.round(completeness * 100) / 100,
    },
    priorities,
    focusSlot,
    pulse,
    identityAlignment,
    microActions: micro,
  };
}
