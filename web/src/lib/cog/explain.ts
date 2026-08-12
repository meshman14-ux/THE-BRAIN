/**
 * THE COG — rationale templates.
 * Deterministic text: template(ruleId, vars). Every recommendation's `rationale`
 * comes from here, so tone lives in ONE file (microcopy spec: docs/04-ui-ux.md).
 */

type Vars = Record<string, string | number>;

const templates: Record<string, (v: Vars) => string> = {
  P1: () => "Minimum season: one thing only, and it holds the floor. Everything else can wait.",
  P2: () => "Training is the keystone and it isn't done — this protects it before the day interferes.",
  P3: (v) => `Highest combined score today (${v.score}) — urgency, fit and importance all point here.`,
  P4: () => "It's overdue and still open — clearing it removes tomorrow's drag.",
  P5: () => "Nothing was scheduled for today, so this is drawn from due-soon and stale work.",
  P7: () => "An opportunity's next step lands today — momentum on deals beats momentum on chores.",
  F2: (v) => `${v.start}–${v.end} is your biggest clear block in the deep window; "${v.task}" needs exactly that.`,
  F3: (v) => `No block ≥ ${v.min} min in your deep window today — a ${v.len}-minute focused burst still moves it.`,
  F4: () => "No calendar signal today, so this is your usual best window. Confirm or drag it.",
  N1: () => "Ten seconds: how's the tank? The day plans better when the engine knows.",
  N2: () => "Three passes in a row — noted. The report stays; the nudges stop for today.",
  N3: (v) => `Your focus block is open now — ${v.mins} clear minutes for the #1 priority.`,
  N4: (v) => `Energy's at ${v.band}/5 — pushing deep work now costs tomorrow. This 5-minute move keeps the day alive.`,
  N5: () => "The keystone is still open and the window is now. Everything else compounds after it.",
  N6: (v) => `${v.count} items in the inbox — five minutes of triage keeps the system honest.`,
  N7: (v) => `Top priority, right energy, right season: ${v.task}.`,
  N8: () => "Day's won. Bank it — anything more is a bonus, not a debt.",
  I2: (v) => `${v.done} of your last ${v.total} completions touched this pillar — your stated standard implies more.`,
  I3: () => "Training is the declared keystone, so its drift always leads this list.",
  M2: (v) => `Fits the ${v.mins}-minute gap and it's real work off the ${v.origin} pile — not busywork.`,
  M4: () => "Nothing real fits this gap. Resting IS the recommendation — fake productivity costs more.",
  REPORT_DEGRADED: (v) => `Running without: ${v.missing}. Advice adapts; nothing is guessed.`,
};

export function explain(ruleId: string, vars: Vars = {}): string {
  const t = templates[ruleId];
  return t ? t(vars) : `Rule ${ruleId} fired.`;
}
