/**
 * THE COG — Advisor Engine entry point.
 * PURE: advise(state, profile, config) -> Advice. No I/O, no clock, no randomness.
 * The Workflow Orchestrator (app/api/cog/*) builds the MomentumState and persists results;
 * this module only thinks. That split is what makes the engine testable and deterministic.
 */
import type { CogConfig } from "./config";
import { explain } from "./explain";
import { momentumBand, momentumIndicator } from "./score";
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
    },
    priorities,
    focusSlot,
    pulse,
    identityAlignment,
    microActions: micro,
  };
}
