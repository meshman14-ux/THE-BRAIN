# THE COG — 3-month roadmap & pilot acceptance

## Roadmap (prioritized; each phase ships something usable, BRAIN build-order style)

**Month 1 — the loop exists (weeks 1–4)**
1. Migration `0001_cog_core.sql` + engine merge into `lib/cog/*` (tests green in the main suite).
2. Morning check-in (PWA, local-first bands) + `/cog/daily-state`.
3. `/cog/advise` wired to real adapters: tasks, season, finishes, habits — Momentum card on *Now* tab.
4. Pulse card + `/cog/feedback` with accept/modify/reject and task write-back.
   *Exit: Jay uses it every morning for a week without being asked to.*

**Month 2 — the engine gets eyes (weeks 5–8)**
5. Google Calendar free/busy adapter → real focus slots (planner-blocks fallback already in).
6. Identity profile UI (statements per pillar, seeded from `pillars.standard`) + alignment check in the weekly review.
7. Micro-actions + `/cog/micro-action` ("I have 10 minutes").
8. Telemetry + acceptance funnel view (pilot metrics start counting from here).
   *Exit: focus slot matches reality ≥ 4 days/5; acceptance metric live.*

**Month 3 — the pilot proper (weeks 9–12)**
9. Samsung Health sleep bands (device-side derivation) — or formally park it and rely on check-in (FB-1 already handles it).
10. Weight tuning pass from 4 weeks of feedback data (by hand, in `cog_config` — this is the deterministic dress rehearsal for ML).
11. Simulation harness in CI; quarterly-reset ritual hooks (`cog.state.built` feeds the review screen).
12. Pilot review against the checklist below → go/no-go for v2 (learned weights).

## Pilot acceptance checklist (agreed with Jay, 12 Aug 2026)

Measured over the final 4 consecutive weeks of month 3, from `cog_telemetry` + `cog_feedback`:

- [ ] **Usage streak** — momentum report opened AND ≥ 1 verdict given on ≥ 5 days/week, all 4 weeks.
- [ ] **Advice acceptance** — ≥ 60 % of pulses get accepted or modified (rejected + expired < 40 %). *Modified counts as success: the engine surfaced the decision.*
- [ ] **Top-3 completion** — ≥ 2 of Top 3 done on ≥ 70 % of active days.
- [ ] **Keystone + finishes lift** — Training hit-rate above the pre-pilot 4-week baseline, AND every pilot month records ≥ 1 finish (the existing failable momentum test stays green).

Guardrails (any one failing = investigate before v2, regardless of the four above):
- [ ] No recommendation ever shipped without rationale + ruleTrace (telemetry assert, must be 0).
- [ ] p95 `/cog/advise` latency < 800 ms.
- [ ] Zero raw sensitive values found server-side (spot audit of `cog_checkins`/logs).
- [ ] Pulse-fatigue days (N2 fired) < 15 % of active days — more means the advice is annoying.

## CI/CD checklist

- [ ] `vitest run` (engine + scoring + existing 828) on every PR; `tsc --noEmit`.
- [ ] `tsx sim/run-days.ts 90` in CI — invariant violations fail the build.
- [ ] Migration applied via the existing Supabase flow before deploy; `cog_prune()` scheduled nightly.
- [ ] Deploy = push to `main` (Vercel), per `claude/deploy-notes.md`; patches via `git am` while cloud push is 403.
- [ ] Rollback = revert commit; engine is stateless so no data migration on rollback (tables stay).

## Monitoring dashboard spec (a *Systems* tab card, not a new tool)

| Panel | Source | Alert |
|---|---|---|
| Advise latency p50/p95 | `cog_telemetry.advise_latency_ms` | p95 > 800 ms |
| Acceptance funnel (7d) | `cog_feedback` verdicts | acceptance < 50 % |
| Degraded days | `cog_states.missing_inputs` | > 50 % days missing calendar |
| Rule firing histogram | `cog_telemetry.rule_fired` | any rule 0 fires in 14 d (dead rule) |
| Pulse fatigue | N2 fires | ≥ 3 days in a week |
