# THE COG — Architecture
### Component design · 12 August 2026

THE COG is **a module of THE BRAIN, not a second system**. It compiles into the existing Next.js
app (`lib/cog/*`), exposes four API routes, and owns five new Postgres tables. One deploy, one
database, one auth.

---

## 1. Component diagram (ASCII)

```
                    ┌─────────────────────────────────────────────────────┐
                    │                     UI LAYER                        │
                    │  Dashboard "Momentum" card · Advisor feed ·         │
                    │  Morning check-in (PWA, local-first) ·              │
                    │  Accept / Modify / Reject controls                  │
                    └────────────▲───────────────────────┬────────────────┘
                                 │ render                │ feedback
                                 │                       ▼
┌───────────────┐   ┌────────────┴───────────────────────────────────────┐
│  TELEMETRY    │◄──┤              WORKFLOW ORCHESTRATOR                 │
│ cog_telemetry │   │  /cog/daily-state · /cog/advise · /cog/feedback ·  │
│ counts,       │   │  /cog/micro-action  (Next.js route handlers)       │
│ latencies,    │   │  cron: 06:30 build state · nightly prune           │
│ rule hits —   │   └───────▲───────────────────────────────▲────────────┘
│ never content │           │ MomentumState                 │ writes
└───────────────┘   ┌───────┴────────────┐        ┌─────────┴────────────┐
                    │   ADVISOR ENGINE   │        │  INTEGRATION LAYER   │
                    │  (pure functions,  │        │  two-way BRAIN sync  │
                    │   lib/cog/*)       │        │  events, correlation │
                    │ normalize → score  │        │  ids, reconciliation │
                    │ → rules → outputs  │        │  (writes tasks.meta, │
                    │ every output has   │        │   do_date, priority) │
                    │ rationale+ruleTrace│        └─────────┬────────────┘
                    └───────▲────────────┘                  │
                            │ reads                         ▼
                    ┌───────┴────────────────────────────────────────────┐
                    │                  STATE STORE                       │
                    │  Supabase Postgres (RLS, single owner)             │
                    │  cog_checkins · cog_states · cog_pulses ·          │
                    │  cog_feedback · cog_config · cog_identity          │
                    │  + reads: tasks habits journal-bands season        │
                    │           pillars vision ventures reviews          │
                    └───────▲────────────────────────────────────────────┘
                            │ normalized bands & intervals only
                    ┌───────┴────────────────────────────────────────────┐
                    │                 INPUT ADAPTERS                     │
                    │  BrainAdapter (SQL views) · CalendarAdapter        │
                    │  (Google, busy/free only) · HealthAdapter          │
                    │  (Samsung → ON-DEVICE band derivation) ·           │
                    │  CheckinAdapter (10-second morning form)           │
                    │  — every adapter returns `{value?, missing?}` —    │
                    └────────────────────────────────────────────────────┘

  DEVICE BOUNDARY ═══ raw sleep/mood/energy never cross; bands (1–5) do. ═══
```

**To generate the SVG:** `npx tsx sim/render-diagram.ts > docs/diagrams/cog-architecture.svg`
(script included), or paste `docs/diagrams/cog-architecture.mmd` into mermaid.live and export.

## 2. Component responsibilities

| Component | Responsibility | Never does |
|---|---|---|
| Input Adapters | Fetch + normalize each source into typed signals with explicit `missing` markers | Guess a missing value |
| State Store | Persist COG's own tables; expose read views over BRAIN tables | Mutate BRAIN tables |
| Advisor Engine | Pure `MomentumState → Advice` function. Deterministic, config-weighted, rule-traced | I/O, side effects, randomness |
| Workflow Orchestrator | Route handlers + cron; assembles state, calls engine, persists pulses | Business logic |
| Integration Layer | Two-way sync on explicit acceptance; event emit/consume; reconciliation | Write without a feedback verdict |
| UI Layer | Dashboard card, feed, check-in; local raw storage + band derivation | Send raw sensitive values |
| Telemetry | Rule-hit counts, latency, acceptance funnel | Store content |

## 3. Design properties

- **Deterministic:** same `MomentumState` + same `cog_config` ⇒ byte-identical advice. This is a
  tested invariant (`tests/advisor.test.ts` runs the engine twice per case).
- **Explainable:** every `Priority`, `FocusSlot`, `AdvisorPulse` and `MicroAction` carries
  `rationale` (≤ 2 lines, human) and `ruleTrace` (rule ids + signal values, machine).
- **Config-driven:** weights, caps, windows in `cog_config` (seeded by migration, editable via
  admin UI later; env vars override for local dev).
- **Graceful:** engine accepts `Partial` inputs; the degradation ladder is in `01-discovery.md`.
- **ML-ready, not ML-dependent:** `cog_config.weights` is the future learning target;
  `cog_feedback` is the future training data. Nothing else changes when that day comes.
