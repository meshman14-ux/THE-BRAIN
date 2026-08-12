# THE COG — as merged

The design docs in this folder came from the cloud session that produced the blueprint
(12 Aug 2026). **They describe the design, not the code that shipped.** Where the two
disagree, the code is right and this file says why.

## What is live

| Piece | Where |
|---|---|
| Pure engine | `web/src/lib/cog/` — types, config, score, rules, explain, advisor |
| The mapping | `web/src/lib/cogstate.ts` — BRAIN rows → engine vocabulary, fully tested |
| The queries | `web/src/lib/cogserver.ts` — the only file in COG that touches Supabase |
| Routes | `web/src/app/api/cog/{advise,daily-state,feedback,micro-action}` |
| UI | `web/src/components/Momentum.tsx`, mounted on the dashboard's Now tab |
| Tables | eight `cog_*`, migration `20260812_cog_core.sql`, already applied |
| Tests | `web/tests/cog/` — 101 of them, inside the normal `npx vitest run` gate |
| Flag | `NEXT_PUBLIC_COG` — off unless set to `1` |

## Where the blueprint was wrong

Three schema assumptions, each of which would have failed silently rather than loudly.
All three are corrected in `cogstate.ts` and pinned by `tests/cog/adapter.test.ts`.

1. **`tasks.priority` is text**, `High | Med | Low`. The engine's `priorityScore` divides
   it by 3. Fed through raw, every score is `NaN`, every ranking is arbitrary, and every
   rule still fires — so no rule test would have caught it. Mapped `High→3, Med→2, Low→1`,
   with an ungraded task landing in the middle rather than at zero.
2. **There is no `tasks.estimate_min`.** The column is `duration_min`, and its null means
   "not estimated", never zero — otherwise a 90-minute spec is eligible as a five-minute
   micro-action.
3. **`tasks.status` has five values**, not two. `doing` is an open task that has been
   started; hiding it is the worst thing an advisor can do.

And one real bug. Rule **F3** computed its slot end with
`new Date(Date.parse(start) + n*60000).toISOString()`. Every other time string in the
engine is naive and local, so this converted to UTC — and in British Summer Time the
pomodoro fallback produced a block that **ended before it started** (13:00 → 12:25),
reported as 25 minutes long. Fixed by `addMinutes` in `rules.ts`, which does the
arithmetic in minutes-since-midnight and never leaves the local frame.
`tests/cog/focus.test.ts` is the proof.

## The one design departure

The blueprint centres a **10-second morning check-in**, and rule N1 fires
"no check-in yet — ask" whenever it is missing. Jay's check-in is **nightly**
(LIFE_OS v2). Wired as designed, N1 would have fired every morning forever: THE COG would
have nagged daily and never once advised.

So the morning bands are **derived** from what last night already recorded — `journal`
mood/energy, `health_days` sleep — decayed by age and reported with source `decayed`, which
is what keeps N1 quiet. A `cog_checkins` row still wins when one exists, so the sharper
read stays available without being required. `POST /api/cog/daily-state` writes it.

This is the blueprint's own law applied to the blueprint: *a measurement that costs a
manual entry will not survive a busy season.*

The privacy design changed for the same kind of reason. The blueprint keeps raw
sleep/mood/energy on-device in IndexedDB and syncs only 1–5 bands. But `journal.mood`,
`journal.energy` and `health_days.sleep_hours` are **already raw integers in Postgres**,
written by the check-in and the Health Connect companion. Adding IndexedDB now would buy
no privacy and would make COG disagree with the two modules either side of it. Bands are
derived server-side from rows that already exist.

## Two contracts, mechanically enforced

1. **Purity.** Nothing in `cog/` imports from outside `cog/`, reads a clock, or calls
   `Math.random` — checked by `tests/cog/boundary.test.ts`, which reads the source. `now`
   is injected by the route. This is what makes a stored `cog_states` row replayable.
2. **Write ownership.** COG writes only `cog_*` tables, plus `tasks.do_date`,
   `tasks.priority` and `tasks.meta.cog` on an **accepted** verdict, behind an
   optimistic-concurrency guard, and priority only ever moves upward. If Jay edited the
   task in the meantime the write is skipped: he wins, and the verdict is already recorded
   as feedback. That is the reconciliation rule — a human edit is signal, not a conflict.

## Not built (blueprint scope beyond M1)

- **Google free/busy.** The calendar falls back to the day-planner's pinned
  `journal.meta.hours` (rule FB-3), and slots say `from what you pinned` so the weaker
  source is visible rather than implied.
- **HMAC webhook fan-out.** `cog_events` is written; nothing drains it yet.
- **The 06:30 cron and nightly `cog_prune()`.** The function exists; no schedule calls it.
- **An identity-profile UI.** `cog_identity` is read and defaults sensibly when empty, so
  rule I2/I3 stay silent rather than wrong until statements exist.

## Known state of the inputs (12 Aug 2026)

Worth knowing before reading the first day's advice:

- **No task sits under the keystone pillar**, so P2/N5 are inert. Not a fault — there is
  genuinely no keystone-supporting task to surface.
- **No `journal` row has ever recorded mood or energy** (all three existing rows were
  created by the planner writing `meta.hours`). So the derivation has nothing to work
  with and N1 correctly asks for a check-in. `/checkin` already writes both columns; one
  nightly close closes the loop.
- **`health_days` is empty**, so sleep is unmeasured until the companion app syncs.

The Momentum card names all of this on screen rather than quietly scoring around it.
