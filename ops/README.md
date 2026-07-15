# OPSDECK

A small event-operations demo app built around the ops utility module you
provided. It turns that single utils file into a running, type-checked
application by supplying the two dependencies it imports (`./types` and
`./store`) plus a UI that exercises the whole surface.

## What's here

| File | Purpose |
| --- | --- |
| `src/ops.ts` | The ops utilities (verbatim): area/skill inference, compliance, suitability scoring, readiness, default stock catalogue, ICS/CSV connectors. |
| `src/types.ts` | The domain types the utils operate on (`Area`, `Staff`, `Unit`, `EventRec`, `Suitability`, …). |
| `src/store.ts` | `OPSDATA` — an in-memory store with `localStorage` persistence, seeded on first run, plus the mutations the UI needs. |
| `src/seed.ts` | The seed dataset (clients, staff, events, units, assignments, certs, availability, pools, shortlists). |
| `src/main.ts` | The dashboard UI (vanilla TS + DOM). |
| `src/styles.css` | Theme-aware styling (light/dark). |

## What the app does

- **Events list** with a live **readiness score** per event (crew filled %,
  confirmed %, stock-vs-par), colour-coded via `eventColor`.
- **Per-unit suitability**: for each unit, staff are scored and ranked by
  `suitableForUnit` — skill match, availability, compliance (RTW + cert
  expiry), own-client preference and past reliability. Blocked candidates and
  their reasons are surfaced.
- **Actions**: assign / confirm / remove staff, toggle a unit **pool** or
  event **shortlist**, and adjust **stock** (rows below par are highlighted).
- **Widen** toggle to score staff across all clients, not just the unit's own.
- **Export** all events to `.ics`, or a readiness summary to `.csv`.

State persists to `localStorage`; **Reset data** restores the seed.

## Run

```bash
npm install
npm run dev        # start the dev server
npm run build      # type-check (tsc --noEmit) + production build to dist/
npm run typecheck  # type-check only
```

## Notes

- `store.ts` and `ops.ts` form an import cycle (the store reads through the
  utils' `defaultStockFor`). To stay safe at module-init time, stock is
  generated **lazily** on first access rather than in the store constructor —
  otherwise `ops.ts`'s `DEFAULT_STOCK` const would be touched while still in
  its temporal dead zone.
- This app lives in the `ops/` subdirectory and is independent of the
  repository-root `index.html` (the THE-BRAIN links page served by GitHub
  Pages).
