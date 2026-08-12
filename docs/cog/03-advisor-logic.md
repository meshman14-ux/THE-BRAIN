# THE COG — Advisor Logic
### Pipeline, scoring, rulebook · deterministic v1

## 1. Pipeline pseudocode

```
ADVISE(date):
  # 1 — NORMALIZE (input adapters; each returns {value | missing})
  state = MomentumState{
    season        = read season (always present — declared, not inferred)
    tasks         = open tasks, annotated: staleDays, supportsKeystone
    signals       = bands from checkin / health / decay  (FB-1, FB-2)
    calendar      = google busy-free | planner blocks | none  (FB-3)
    empire        = dormant ventures, opportunities due, finishes rate
    missingInputs = names of every absent source
  }

  # 2 — SCORE (pure arithmetic, weights from cog_config)
  state.momentumIndicator = MOMENTUM(state)              # 0..100
  for t in state.tasks: t.score = PRIORITY_SCORE(t, state)

  # 3 — RULES (ordered; each fires or not; every firing is recorded in ruleTrace)
  priorities = SELECT_PRIORITIES(state)                  # rules P1..P7
  focusSlot  = ALLOCATE_FOCUS(state, priorities)         # rules F1..F5
  pulse      = CHOOSE_PULSE(state, priorities, focusSlot)# rules N1..N8, first match wins
  alignment  = IDENTITY_CHECK(state, identityProfile)    # rules I1..I3
  microActs  = MICRO_ACTIONS(state)                      # rules M1..M4

  # 4 — OUTPUTS (attach rationale from template per fired rule; persist; emit events)
  return {report, priorities, focusSlot, pulse, alignment, microActs}
```

Determinism: no clock reads inside the engine (date passed in), no randomness, ties broken by
`(score desc, staleDays desc, task.id asc)`.

## 2. Momentum Indicator — scoring formula

```
MOMENTUM = 100 * Σ  w_i * x_i   over available components, weights renormalized
                                so Σ w_i(available) = 1   ← missing input ≠ zero score

component            x_i (0..1)                                    default w
──────────────────── ───────────────────────────────────────────── ─────────
completion           yesterdayCompletionRatio                          0.25
keystone             keystoneHitYesterday ? 1 : 0                      0.20
energy               (energyBand - 1) / 4                              0.15
sleep                (sleepBand  - 1) / 4                              0.10
streak               min(checkinStreakDays, 14) / 14                   0.10
finishes             finishesRate            (12-mo, current month     0.10
                                              shown never judged)
capacity             1 - clamp(0.6*calendarLoadRatio                   0.10
                               + 0.4*workloadPressure, 0, 1)
```

Example — Jay, quiet season, trained yesterday, 4/6 tasks done, energy 4, no sleep data,
7-day streak, finishes 0.58, calendar 30% loaded, workload 0.4:

```
available w = .25+.20+.15+.10+.10+.10 = .90 → renormalize (÷ .90)
MOMENTUM = 100 * ( .278*.667 + .222*1 + .167*.75 + .111*.5 + .111*.58 + .111*.66 )
         ≈ 100 * ( .185 + .222 + .125 + .056 + .064 + .073 ) ≈ 73
Band: 0-39 low · 40-69 steady · 70-100 rolling
```

## 3. Priority score (per task)

```
PRIORITY_SCORE = 100 * Σ w_j * c_j                                default w
  urgency        overdue→1 · due today→.9 · ≤3d→.7 · ≤7d→.4 · else .1   0.30
  importance     task.priority normalized 0..1, +0.2 if linked          0.25
                 to an active goal (capped 1)
  energyFit      match(task.energy, energyBand):                        0.20
                 deep×high→1 · low×low→1 · deep×low→0.1 · else .5
  seasonFit      quiet→1 · busy: admin/short→.8 deep→.5                 0.10
                 · minimum: keystone/floor→1, else .2
  staleness      min(staleDays,21)/21  (old open work surfaces)         0.10
  keystoneSupport supportsKeystone ? 1 : 0                              0.05
  (+ empireSignal bonus +5 flat if task unblocks an opportunity due today)
```

## 4. Rulebook (if/then; ordered; ids appear in every ruleTrace)

**Priority selection (P)**
- **P1** IF season = minimum THEN Top-N = 1 and it must be keystone-or-floor. *(The floor never flexes.)*
- **P2** IF keystone not yet done today AND energyBand ≥ 2 THEN a keystone-supporting item must occupy one Top-3 slot.
- **P3** Top 3 = highest PRIORITY_SCORE after P1/P2 constraints; max 2 from the same project (breadth guard).
- **P4** IF overdue tasks exist THEN at least one Top-3 slot is the highest-scored overdue item.
- **P5** IF no task has do_date ≤ today THEN advise from due-soon + stale pool and label it (FB-4).
- **P6** IF a task is user-steered (BRAIN override < cooldown_days) THEN never demote/reschedule it.
- **P7** IF opportunitiesDueToday > 0 THEN its next_step task gets the +5 empire bonus (already in score); rule logs it.

**Focus slot (F)**
- **F1** Candidate slots = free intervals ≥ 50 min inside deepWorkWindow (profile, default 08:30–12:30).
- **F2** Pick the longest; tie → earliest. Match to the highest-rank priority whose energy fits the band.
- **F3** IF no candidate THEN longest free interval ≥ 25 min anywhere → quality=fallback, offer pomodoro.
- **F4** IF calendar source = none THEN use planner blocks; ELSE config default window (FB-3), quality=fallback.
- **F5** IF energyBand ≤ 2 THEN focus slot still shown but pulse will not push deep work (see N4).

**Pulse — "do this next" (N; first match wins, one live pulse at a time)**
- **N1** IF no check-in today THEN pulse = checkin. *("Ten seconds: how's the tank?")*
- **N2** IF 3 consecutive pulses rejected/ignored today THEN pulse = none for the day (FB-5); report only.
- **N3** IF now inside focusSlot AND slot unstarted THEN pulse = start-focus (rank-1 priority).
- **N4** IF energyBand ≤ 2 THEN pulse = micro-action (M rules) or rest if none. *(Never deep work on empty.)*
- **N5** IF keystone undone AND within keystone window THEN pulse = keystone task.
- **N6** IF inbox count > config.triage_threshold (default 15) THEN pulse = triage (5 min).
- **N7** ELSE pulse = rank-1 priority as do-task.
- **N8** IF all Top-3 complete THEN pulse = identity-nudge or rest. *("Day's won. Bank it.")*

**Identity alignment (I)**
- **I1** For each identity statement: share of last-7-day completions in that pillar vs statement weight → aligned / drifting.
- **I2** Report at most the 2 largest drifts, as observations with evidence counts, never verdicts.
- **I3** IF Training (keystone pillar) drifts THEN it is always drift #1 — it is the declared keystone.

**Micro-actions (M)**
- **M1** Eligible when energyBand ≤ 2 OR free gap < 15 min OR explicit /cog/micro-action call.
- **M2** Sources in order: task fragments ≤ 5 min → keystone support (fill bottle, lay out kit) → inbox triage (3 items) → people-cadence ping (one overdue person) → admin.
- **M3** Never more than 3 offered; each carries origin + rationale.
- **M4** IF availableMin < smallest candidate THEN return 204: rest, with rationale.

## 5. Rationale templates (excerpt — full set in docs/04-ui-ux.md)

Every fired rule maps to a template; rationale = template(rule, signals), giving determinism *and*
humanity:

- P2 → "Training is the keystone and it isn't done — this protects it before the day interferes."
- F2 → "Your 09:00–10:40 is the biggest clear block in your deep window; {task} needs exactly that."
- N4 → "Energy's at {band}/5 — pushing deep work now costs tomorrow. This 5-minute move keeps the day alive."
- P4 → "It's overdue and still open — clearing it removes tomorrow's drag."
