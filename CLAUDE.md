# CLAUDE.md — THE BRAIN

The one canonical context file for this repo.

**There is one application: THE BRAIN OS, in `web/` — Next.js + Supabase.** Its data layer is
Supabase Postgres with RLS on 20 tables (§A4). That is the only live data layer; nothing in this
repo stores user data in the browser.

Everything under the "Archived" heading at the end describes a **retired** static app that no
longer runs. It is kept because some of its logic is worth porting, not because it is current.
If you are looking for how the system works today, you want Part A and nothing else.

---

## 0. Working standard — BOIL THE OCEAN (always apply, whole repo)

> The marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it
> with tests. Do it with documentation. Do it so well that Jay is genuinely impressed — not
> politely satisfied, actually impressed. Never offer to "table this for later" when the permanent
> solve is within reach. Never leave a dangling thread when tying it off takes five more minutes.
> Never present a workaround when the real fix exists. The standard isn't "good enough" — it's
> "holy shit, that's done." Search before building. Test before shipping. Ship the complete thing.
> When Jay asks for something, the answer is the finished product, not a plan to build it. Time is
> not an excuse. Fatigue is not an excuse. Complexity is not an excuse. **Boil the ocean.**

---

# Part A — THE BRAIN OS (`web/`)

All paths in Part A are relative to `web/` unless prefixed with `/`.

**What the standard means concretely here:**

- **Search before building.** Read the existing components first. Jay has prior art — a
  `Jays Blueprint - Life OS.dc.html` and a whole prototype library. Find it and use his
  vocabulary and his design language rather than inventing your own.
- **Test before shipping.** Business rules belong in `src/lib/logic.ts` as pure functions with
  tests in `tests/`. A rule that only exists inside a component is a rule nobody can verify.
- **Ship the complete thing.** A feature isn't done at "renders". It's done when the empty state
  reads well, the error path is handled, it works one-handed on a phone, it works in both themes,
  it's covered by a test, and this file reflects it.
- **No workarounds presented as answers.** When something is blocked, name the root cause and
  fix that. Say plainly what is broken and what the real fix is. Don't dress a detour up as a
  destination.
- **Finish the thread.** If a change leaves a stale comment, an unused import, a doc that now
  lies, or a name that no longer matches the concept — fix it in the same pass.

## A1. Two separate projects. Do not mix them.

| | **THE BRAIN** (this repo) | **MAINFRAME** (do not touch) |
|---|---|---|
| What | Jay's personal operating system | Festival operations business system |
| Stack | Next.js 15 + Supabase + Vercel | Vite + React + Supabase + Vercel |
| Supabase ref | `qttroyuajpyelfrbxzzt` (eu-west-2) | `iuqmqpcasrqqmkkzqkfp` (eu-central-1) |
| Live | the-brain-meshman14-uxs-projects.vercel.app | mainfram-4.vercel.app |

**Hard rule:** THE BRAIN never reads, writes, or imports MAINFRAME data or logic.
EMPIRE_OS may hold **one summary row** describing MAINFRAME as a venture (`ventures.external_system
= 'MAINFRAME'`) — a pointer, never a copy.

**Warning about MAINFRAME:** its live Supabase schema and its live frontend are both *ahead* of
the `~/MAINFRAM4` local repo, which contains 14 fewer tables and a README wrongly claiming it was
never deployed. Do not deploy that local repo — it would downgrade a working production system.

## A2. What THE BRAIN OS is

A personal OS with a three-tier structure:

```
                 THE BRAIN  (command centre)
                 Inbox · Areas · Planner · Week · Review
                          ↓ reads ↓
        LIFE_OS                        EMPIRE_OS
     you as a person                you as an owner
```

**Governing principle: the command centre reads, the subsystems write.**
Every record has exactly one home. THE BRAIN owns only the `inbox` table; everything else it
composes views over. This is what stops the hub becoming a third place things get lost.

## A3. Locked design decisions

These were settled with Jay over ten questions. Don't quietly revisit them.

1. **All four PKM layers, in dependency order.** Capture + Cockpit *generate* data; Mirror
   (reviews) and Command Centre (dashboards) *consume* it. Build the generators first.
2. **Hierarchy: Vision → Pillars → Goals → Projects → Tasks.** Everything above Projects is
   **optional per item** — a task never requires a goal to exist. This is non-negotiable: it's
   what stops the system feeling bureaucratic.

   **2a. The two systems use different time scales. Settled with Jay 2026-08-05; deliberate,
   not an inconsistency — do not "fix" it into one list.**

   | | scale | why |
   |---|---|---|
   | **LIFE_OS** | month · 6 month · annual · 5 year · 10 year | a life runs on personal rhythms, so the windows *roll from today* — "six months from now", not "the end of H2" |
   | **EMPIRE_OS** | quarter · year · 5 year · 20 year | a business runs on reporting periods, so quarters and years are *calendar* ones |

   The **20-year horizon is EMPIRE-only and load-bearing**: the £100M objective anchors the
   CEO dashboard and must survive any edit to `logic.ts`. There is a test asserting
   `EMPIRE_HORIZONS` is exactly `["quarter","year","five","twenty"]` for that reason.
   `goalHorizon(goal, todayIso, system)` takes the system; `horizonsFor(system)` returns the
   scale. Boundary discipline holds on both: every dated goal lands in exactly one bucket,
   an overdue goal reads as the *nearest* horizon rather than one that has passed, and an
   undated goal returns `null` rather than being given an invented deadline.

   **2b. The bucket list is not a table.** A bucket-list item is a goal with no date and no
   plan, carried as `goals.status = 'someday'`, and it is a horizon of its own in LIFE_OS.
   That is the whole design: **promoting one into a real goal is a single field change**, so
   the thing written down years ago becomes the thing being done without being retyped — same
   row, same id, same area, same anything already hung off it. A `someday` goal returns
   `someday` even if a date got attached, because the status is the promotion, not the date.
   EMPIRE has no such bucket, so a wish viewed there comes back in `excluded` rather than
   silently vanishing.
3. **13 areas** (called "pillars" in the DB, "Life Areas" in the UI): 8 LIFE_OS, 5 EMPIRE_OS.
   *Amended 2026-07-31 with Jay's sign-off — was 12/7/5. Vehicles was added because his
   blueprint tracks three vehicles whose tax and MOT dates are hard deadlines with no home
   in the original twelve, where they fell into Home & Admin and got lost.*
4. **Phone-first capture, desktop thinking.** Installable PWA, one box, zero required fields,
   offline queue in localStorage that flushes on reconnect. That queue is a transient outbox for
   unsent captures only — Supabase remains the system of record, never the browser.
5. **Data model: typed tables + universal `links` table + `meta` jsonb everywhere.**
   Rigidity where it protects, flexibility where it frees.
6. **AI = briefing + retrieval advisor.** Morning brief from own data; ask-anything over notes
   with citations; review assistant drafting from evidence. **Advisory, never autonomous.**
   pgvector is enabled and `notes.embedding` / `inbox.embedding` are `vector(1536)`.
7. **Rituals: daily 2 min, weekly 20 min, quarterly 1 hr.** Monthly deliberately omitted.
8. **Calendar: full two-way sync, blast radius contained** — THE BRAIN writes ONLY to its own
   dedicated Google calendar, never the main one. `calendar_sync` maps task ↔ event with etag.
   Deletes unschedule, never destroy. Conflicts logged and surfaced, never auto-resolved.
9. **Clean start.** No data migration.
10. **Theme: "paper" is default, "dark" is the toggle.** Paper is Jay's own design language from
    his Blueprint v2 — warm paper `#f4f2ee`, white cards, indigo `#4b57c9`, Source Serif
    headlines, Public Sans body, IBM Plex Mono numerals.

### Schema choices worth preserving
- **`tasks.do_date` is separate from `tasks.due_date`.** Due is a fact about the world; *do* is a
  decision. Today/Week views are built from `do_date`. This keeps the list honest.
- **`tasks.energy`** (`low|medium|deep`) so work can be matched to state, not dumped in one list.
- **`tasks.priority`** is text `High|Med|Low` (Jay's vocabulary, from his blueprint).
- **`tasks.status`**: `open → doing → done` drives the Kanban lanes (plus `dropped`, `waiting`).
- **`people.cadence_days`** — lets the system say *"you haven't spoken to your brother in 47 days
  and you said 14."* Highest-value insight in the schema.
- **`pillars.standard`** — the standard the area holds. A pillar never gets ticked off.
- **`pillars.score` is `integer NULL` (0–10 check), not `NOT NULL default 0`.** Null means
  "not yet scored"; zero means "scored, and it is that bad". The dashboard average ignores the
  first and counts the second, and unscored areas rank *below* every scored one — an area you
  have never looked at is unknown, not failing. `pillars.status_line` is the one honest line
  beside the bar; `pillars.focus_week` holds the Monday of the week an area is the declared
  focus for, because the area you decided to work on is not always the one scoring worst.
- **`ventures.stage` implies a progress baseline** (idea 10 · research 30 · stabilise 50 ·
  launch 70 · revenue 100), and a shelved venture (status ≠ `active`) reads at half its
  baseline — that is where the backlog's 5% comes from. `ventures.progress` is `NOT NULL
  default 0`, so 0 means "untouched, use the baseline" and any positive value is a deliberate
  claim that overrides it. Stated and derived stay separate exactly as `/goals` keeps them,
  and `/empire` says so on screen when they disagree by ≥15 points.
- **Debt is a metric, not a table.** "Debt remaining" lives in `metrics`/`metric_readings`
  (unit £, direction down, unique on `(metric_id, taken_on)`), which gives a trend for free.
  The training streak is derived from `habits`/`habit_logs` at read time and never stored.
- **`goals.progress` is `integer NOT NULL default 0`.** It can never mean "work it out
  for me", so the app keeps two separate signals: `statedProgress` (what you claim) and
  `derivedProgress` (the mean of the goal's projects). When they disagree by ≥15 points
  the goal says so — a goal at 80% whose projects sit at 20% is exactly what you need shown.
- **`goals.status` and `projects.status` have NO check constraint** — unlike `tasks.status`,
  they are free text defaulting to `'active'`. `ItemStatus` is a convention the app upholds,
  not something the database enforces. Treat values read back as possibly outside the union.
- **The cascade columns exist and are nullable**: `projects.goal_id`, `tasks.project_id`.
  Nullable is the point — decision 2 makes every level above a task optional.
- **`notes.kind` carries two special values.** `principle` is a checklist Jay collected from
  a book; `creed` is the three lines he wrote himself. Both are free text in the column —
  the meaning is a convention the app upholds. A principle's `meta` holds `source`, `page`
  and, on five of them, `jay_marked` / `jay_circled` / `jay_handwritten` —
  **his marks, and the whole reason the library is worth having.** `meta` is jsonb, so
  `jayMarks()` validates every field rather than trusting it.
- **`journal.meta.hours` labels the day**, e.g. `{"hours":{"09":"work","10":"rest"}}`.
  Five labels only — work · rest · learning · cleaning · connecting, the exact five Jay
  circled — over the waking day 06:00–22:00 (16 hours). Per-day annotation on a row that
  already exists per day, which is what decision 5 keeps `meta` for. `readHours()` discards
  any hour outside the window and any label outside the five, so a malformed row degrades
  to an unlabelled day instead of a crash. An empty day is **0 of 16**, not a missing figure.
- **`reviews.meta.obstacles` is a list of keys**, e.g. `{"obstacles":["fatigue"]}`. The
  three defaults are Jay's circled `fatigue · distractions · unexpected-demands`; anything
  he types is slugged the same way and stored beside them, so the list grows without a
  migration. **`obstacleTally()` returns nothing at all below three reviews** — one bad
  week is not a pattern, and there is a test that proves it stays silent.

## A4. Database (live project)

Supabase project **`qttroyuajpyelfrbxzzt`** · https://qttroyuajpyelfrbxzzt.supabase.co
Region eu-west-2 (London), free tier. **RLS owner-only on all 20 tables.** pgvector enabled.

```
command centre : vision · pillars · goals · projects · tasks · inbox · links · reviews
vault          : notes
LIFE_OS        : habits · habit_logs · journal · people · metrics · metric_readings
EMPIRE_OS      : ventures · assets · investments · opportunities
calendar       : calendar_sync
```

> **The live project is ahead of `supabase/` in this repo** — the earlier 6-table `schema.sql`
> was v1-scaffold era. Never apply an old schema file over the live project. Pull the live schema
> down before changing anything (§A8 item 1).

Every table has `user_id uuid default auth.uid()` and:
```sql
create policy "own" on <t> for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**`seed_pillars()`** — `security invoker`, `search_path` pinned, idempotent. Plants the 13 areas
for the calling user. Called from `/auth/confirm` on sign-in and from the first-run screen.

Migrations applied to the live project: `the_brain_os_v1_full_schema`,
`harden_seed_pillars_search_path`, `planner_kanban_and_richer_areas`,
`add_vehicles_pillar_thirteen_areas`, `empire_os_venture_stages`,
`life_os_area_scores_and_debt_metric`, `debts_and_vehicles` (the SQL for the last
is captured at `supabase/migrations/20260801_debts_and_vehicles.sql`).
**Do not re-apply any of them.**

**Seeded data (verified live 2026-08-01):** the 13 pillars; **18 ventures** (A to Z Traderz
*launch*, Building + Maintenance *launch*, Amazon FBA *research*, Kathleen St / Bedlinog
House / Treharris House *stabilise*, AI Software *idea*, nine backlog divisions, and
MAINFRAME as a pointer row); **8 creditors** in `debts` (balances NULL until Jay supplies
them); **4 vehicles** in `vehicles` (dates NULL); **10 notes with `kind = 'principle'`**
(five `starred`, carrying his own marks in `meta`) and **1 with `kind = 'creed'`**;
**6 daily habits** — Training, Make the bed, Drink water, Read a page, Nightly reflection,
One hard thing on purpose — with no logs yet; a "Debt remaining" and a "Monthly income"
metric, **both with zero readings**; and the 20-year vision row. Tasks, goals, projects,
reviews and the inbox start empty — the first-run empty states are load-bearing.

> ⚠️ **`metric_readings` for debt is deliberately empty. Do not seed it.** An earlier
> session recorded £8,317 there and the dashboard presented it as a total; Jay confirmed
> on 2026-08-01 that it covers only *some* of his creditors. The reading was deleted and
> `metrics.meta` now carries a note saying why. The debt figure comes from summing
> `public.debts`, and it is incomplete while any active debt has a null balance. A screen
> with no debt figure renders `£—` via `formatGBP(null)` — never a zero.

**Auth:** magic link only, no passwords. Signups **disabled** — Jay's user already exists
(`meshman14@gmail.com`). Supabase Site URL and redirect allow-list point at the live Vercel
URL and a magic-link round trip has been completed against it.

## A5. Build state (as of 2026-08-05)

Verified in this repo: **287/287 tests pass** (`tests/logic.test.ts` + `stage3` + `stage4`,
vitest) and **`npm run build` produces exactly 20 routes**. `npx tsc --noEmit` is clean.

**`/dashboard` is built to Jay's own prototype** (`THE BRAIN.dc.html` in his claude.ai/design
project "THE BRAIN", implemented 2026-08-01): watchtower ("needs attention", assembled from
overdue tasks, people cadences/birthdays, venture drift and unscored areas — `watchtowerAlerts`),
greeting-by-hour hero with the Gita verse of the day (`src/lib/gita.ts`, deterministic by date,
§B4 ported), the two system panels (LIFE: three/steps/sleep/debt-cleared bar · EMPIRE: cash
this month from assets, stage board), the shared LIFE/EMPIRE task list, and the productivity
strip (14-day streak bars, life-vs-empire split, 7-day habit ring). Venture branch slugs are
**derived** from names via `ventureSlug()` — a rename moves the page with it (the hand-map
broke exactly this way when "A to Z Trailerz" became "A to Z Traderz"); retired slugs live in
`BRANCH_ALIASES` and redirect. Unknown branch slugs resolve against the ventures table before
404ing, so a venture added tomorrow is clickable today.

**The three-tier split is live in the UI** (Jay asked for it explicitly, 2026-08-01): THE BRAIN
at `/dashboard` is the main dashboard and reads over both systems; LIFE_OS at `/life` is
personal; EMPIRE_OS at `/empire` is business. Each system owns its own areas and their editor;
the command centre summarises and links, exactly as §A2 always described. Don't merge them back.

**The mode switch makes that split something you wear** (Jay's sheet, built 2026-08-05):
*"add 2 buttons to switch between LIFE_OS and EMPIRE_OS. Each has its own operating system."*
Three modes — `brain · life · empire` — with **brain as the neutral position** showing both.

- It is a **mode, not a filter**. The accent colour, the nav contents and which dashboard you
  are on all follow it. `Mode` in `types.ts` is a superset of `SystemKey`: every system is a
  mode, but the command centre is a mode that is no system.
- Persisted at `brain-mode` in localStorage and applied by `ModeScript` as a blocking inline
  script in `<head>`, **exactly as `ThemeScript` does** — `data-mode` is on `<html>` before
  first paint, so nothing flashes or rearranges on hydration.
- **The nav is filtered in CSS, not in JavaScript.** Every item for every mode is rendered
  once carrying `data-nav-modes`; `globals.css` hides the rest off `:root[data-mode]`. That
  is why the top bar is correct on the first frame with no JS at all. `src/lib/nav.ts` is the
  registry; `navForMode` / `phoneNavForMode` in `logic.ts` decide membership and are tested.
- Selecting a system **navigates to its dashboard** (`MODE_HOME`). A Server Component cannot
  read localStorage, so that is how "dashboard scope follows the mode" is honoured honestly
  rather than by guessing on the server.
- **Capture and Inbox appear in every mode**, and there is a test that holds them there.
  Hiding the entry points behind a mode would break phone-first capture (locked decision 4) —
  a thought had in the wrong mode would be a thought lost.
- The phone bar is a five-column grid, so **every mode must yield exactly five phone items**.
  A test asserts that; a sixth would silently wrap onto a second row.

| Piece | State |
|---|---|
| Magic-link login, `/auth/confirm`, `/auth/signout`, middleware | ✅ |
| **THE BRAIN** — the command centre at `/dashboard` | ✅ sidebar (Systems / Workspace / Arms / Plan / Pinned), hero, cross-system KPI strip, LIFE_OS + EMPIRE_OS summary panels, pick-three Today, AI-digest placeholder |
| **LIFE_OS** — the personal dashboard at `/life` | ✅ the 8 life areas worst-first with the score/status/focus editor, area status, life-scoped KPIs, training streak, **the six daily habits with one-tap ticks** |
| **EMPIRE_OS** — the CEO dashboard at `/empire` | ✅ KPIs, divisions, week priorities, four-horizon goals, build progress, the 5 empire areas with the same editor, vision footer |
| Capture, Inbox/Triage, Planner (Kanban), This Week | ✅ in `src/app/(app)/` |
| Goals + Projects UI (Phase 2) | ✅ `/goals` — the cascade, stated vs derived progress |
| Branch pages for unbuilt views + all divisions | ✅ `(app)/[slug]` + `src/lib/placeholders.ts` — each says what it will be, links to where it already lives in the system, and carries its reference shelf. Delete a row when its view gets built |
| **The reference library** at `/library` | ✅ `src/lib/references.ts` — curated UK-focused shelves per pillar and per branch (researched 2026-08-01), surfaced on pillar pages, branch pages and `/library`. Integrity-tested: every seeded pillar has a shelf, every venture maps to a branch, https-only, no orphan keys |
| Debts + payment plans | ✅ `/life/debts` — creditors, plans, honest partial total |
| Vehicles | ✅ `/life/vehicles` — tax/MOT/insurance/service, worst-first |
| **The principle library** at `/library/principles` | ✅ the 10 collected checklists grouped by area, searchable by tag and full text. His own marks — `jay_marked` / `jay_circled` / `jay_handwritten` — render as a block above the book's text, the points he flagged are flagged in the list, and the words he circled are drawn circled where they appear. **Never surfaced unasked** |
| **The creed** | ✅ `src/lib/creed.ts` — his three lines, one per day, deterministic by date exactly as `gita.ts` is, shown beside the verse on `/dashboard` and in full at the head of `/library/principles`. Supabase is the source; the constant is the fallback |
| **Hour purpose** | ✅ on `/week` — the five labels he circled over 06:00–22:00, stored in `journal.meta.hours`. States assigned vs unassigned and splits the week by label. Does not nag |
| **Weekly review + obstacles** | ✅ `/reviews` — four questions, the fourth being what got in the way (his three circled defaults + free text) in `reviews.meta.obstacles`. The recurring-obstacle tally **stays silent below three reviews** |
| Daily habits | ✅ `Habits.tsx` on `/life` — one tap, idempotent, untickable, 7-day dots and streak on the row |
| **The mode switch** | ✅ `ModeScript` + `ModeSwitch` + `src/lib/nav.ts` — two buttons in the top bar, `brain` neutral, accent + nav + dashboard all follow. Flash-free; nav filtered in CSS |
| **Two horizon scales** | ✅ LIFE month/6mo/annual/5yr/10yr on `/life`, EMPIRE quarter/year/5yr/20yr unchanged on `/empire` (§A3 2a) |
| **The bucket list** | ✅ `BucketList.tsx` on `/life` — `goals.status = 'someday'`, add in one box, promote in one field (§A3 2b) |
| Paper theme + dark toggle | ✅ both dashboards checked in both, and at 390px |
| `src/lib/logic.ts` + `tests/` + vitest | ✅ `tests/logic.test.ts` + `tests/stage3.test.ts` |

The dashboard's governing idea, which must survive edits: **it sorts worst-first and surfaces
only three things** (`pickThree`, `TODAY_LIMIT`). It exists to stop Jay doom-scrolling his own
life — never turn it into a list of everything. Money that has not arrived renders `£—` via
`formatGBP(null)`, never `£0`; zero and "not yet" are different facts.

The pre-v1.2 scaffold is parked at `/_archive/old-apps/web-v1-scaffold/`; don't build on it.

> **Improvement over Jay's blueprint, deliberate:** his original This Week stored a day *index*
> (0–6), so scheduling meant nothing once the week rolled over. This writes a real `do_date`.
> Keep that.

## A6. Routes

```
/                      → redirect
/login                 magic link
/auth/confirm          verifies + redirects, calls seed_pillars()
/auth/signout          POST
/(app)/dashboard       THE BRAIN — the command centre (sidebar, cross-system KPIs, today's three)
/(app)/life            LIFE_OS — the 8 personal areas, scores, habits (#habits),
                       the life horizon scale, and the bucket list
/(app)/empire          EMPIRE_OS — the CEO dashboard + the 5 business areas
/(app)/goals           goals → projects, with unattached projects listed separately
/(app)/planner         Kanban
/(app)/week            7-day scheduler + hour purpose (journal.meta.hours)
/(app)/reviews         the weekly review + "what got in the way" + the obstacle tally
/(app)/capture         one-box capture (PWA start_url)
/(app)/inbox           triage
/(app)/life/debts      creditors, balances, payment plans, payoff projection
/(app)/life/vehicles   tax · MOT · insurance · service, worst-first
/(app)/pillar/[id]     area detail + its reference shelf, back-links to its system
/(app)/library         the reference library — every curated shelf in one place
/(app)/library/principles
                       the principle library + the creed. A destination, never a
                       notification — nothing here appears on the dashboard
/(app)/[slug]          branch pages: what the view will be, its strings into the
                       system, and its reference shelf (src/lib/placeholders.ts +
                       src/lib/references.ts; unknown slugs 404). Every venture on
                       /empire links to its branch page except MAINFRAME.
```

`src/middleware.ts` refreshes the session and redirects unauthenticated users to `/login`.
Public paths: `/login`, `/auth`, `/manifest.webmanifest`, `/sw.js`.

## A7. Conventions

- **Server Components fetch; Client Components mutate.** Pages are `force-dynamic` server
  components that query Supabase, then hand plain data to a client component for interaction.
  After a write, call `router.refresh()`.
- **Styling is CSS variables + Tailwind utilities.** Never hardcode a colour — use
  `var(--accent)`, `var(--muted)`, `var(--sys)` etc. so both themes work automatically.
  `.card`, `.btn`, `.chip`, `.input`, `.label`, `.mono`, `.serif` belong in `globals.css`.
- **`.sys-life` / `.sys-empire`** set `--sys`, so a subtree colours itself by subsystem.
- Headlines are serif (`h1` is serif by default); numbers use `.mono` for tabular alignment.
- **Pure logic belongs in `src/lib/logic.ts`, never inline in a component.** Lane transitions,
  priority ordering, week maths, area roll-ups and capture routing all go there. If you write a
  rule, put it there and write a test for it in the same commit.
- Copy tone: plain, direct, a little dry. No exclamation marks. Empty states say something
  useful rather than "Nothing here!".
- **`meta` is jsonb, so never trust what comes out of it.** `readHours`, `readObstacles` and
  `jayMarks` each validate every field and discard what they do not recognise. A page Jay
  opened to read must not throw because a row holds a string where an array was expected.
- **Reference material is pulled, never pushed.** The principle library is somewhere he
  goes; nothing with `kind = 'principle'` may be read by the dashboard, enter the watchtower,
  or arrive uninvited anywhere. `PRINCIPLES_NEVER_PUSH` in `types.ts` is where that rule is
  written down. The creed is the one exception, and only because he wrote it himself.
- **A branch that gets built leaves `PLACEHOLDERS` in the same commit.** If its view lives
  at the same address it moves to `BUILT_BRANCHES` (which keeps its name and its reference
  shelf); if it lives elsewhere it gets a `BRANCH_ALIASES` redirect, as `vehicles` did. Both
  are integrity-tested, so a slug can never be "built" and "not built yet" at once.

## A8. Build order & open items

Phases: 0 auth/RLS/PWA/areas ✅ · 1 Inbox+Capture+Planner+Week ✅ · 2 Goals + Projects ✅
· 2.5 the two dashboards (JAY_OS `/dashboard` + EMPIRE_OS `/empire`) ✅
· **3 Notes + links + backlinks ← next** (the read side landed early with the principle
library; what remains is writing notes, the `links` table and backlinks)
· 4 LIFE_OS — habits ✅, journal partly (hour purpose writes `journal.meta`), people and
metrics still to build · 5 EMPIRE_OS (assets, investments, opportunities)
· 6 Review rituals — the weekly one ✅ at `/reviews`; daily and quarterly still to build
· 7 AI layer.

Open items:

1. **Capture the live schema into the repo.** The live project's 20-table schema has never been
   committed; pull it into `supabase/` so it stops being tribal knowledge.
2. ~~Jay has never completed first sign-in.~~ **Resolved 2026-07-31** — magic-link round trip
   completed against the live URL; the 13 areas render.
3. ~~Three missing area names.~~ **Superseded 2026-07-31** — the 13 areas were settled and
   seeded with Jay's sign-off; no remap is pending.
4. ~~Blueprint data still worth seeding.~~ **Done 2026-08-01.** 18 ventures live (the mind
   maps added Building + Maintenance, Bedlinog House, Treharris House, Storage Solutions,
   Photo Booth, Stencil Art, Stump Pump, Find My Stash). The venture is **A to Z Traderz**,
   not "Trailerz" — the design PDF was wrong. Debts have their own tables with 8 named
   creditors seeded, all balances NULL. **Jay confirmed the £8,317 headline is PARTIAL, not
   a total** — the metric reading has since been deleted and must not be re-seeded (§A4).
   `debtTotal()` derives `complete` from whether every active debt has a balance, and the
   UI says "known across 5 of 8 creditors" rather than showing a figure that flatters him.
   Vehicles: **FOUR, not three** — BMW `ME54 JAY`, Zafira `WF57 XWD`
   (the earlier `WK57 XWO` in this file was wrong), Canter `DK05 LVL`, TT `FN03 DFP`. All
   four rows exist with every date NULL — he has not supplied them. A null date renders as
   "not recorded", never as overdue and never as fine; there is a test that proves it.
5. His blueprint has **5** review cadences (daily, weekly, monthly, quarterly, annual); we
   deliberately build **3**. Confirm with him before adding monthly/annual. The **weekly**
   one is built at `/reviews`; the daily 2-minute and quarterly hour are still to come, and
   `/reviews` says so on screen rather than pretending they exist.
6. **No ESLint config.** v1.2 ships none, and `next lint` is deprecated and prompts
   interactively. `npx tsc --noEmit` is the current gate and is clean. Add a flat
   `eslint.config.mjs` when convenient.
7. **`/dashboard` sidebar views are placeholders.** Every route in `src/lib/placeholders.ts`
   renders an honest "not built yet" page. When one gets built, delete its registry row in the
   same commit — `reviews` left the registry this way on 2026-08-05.
8. **The obstacle tally has no data yet.** `reviews` is empty, so `/reviews` shows its
   "stays quiet until three" state. It starts saying something after Jay's third weekly
   review — worth checking then that the sentence reads the way he wanted.
9. **Nine of the ten principles are filed under Mind & Growth**, so the library groups
   nearly all of them under one heading (Home & Admin and Money & Security have one each).
   That is honest to how they were filed rather than a bug, but refiling some of them
   would make the grouping earn its place.

## A9. Commands

Run from `web/`:

```bash
npm install
# .env.local needs the two NEXT_PUBLIC_ values (gitignored; they also live in Vercel)
npm run dev                    # http://localhost:3000
npm test                       # 287 tests — must be green before build
npm run build                  # 20 routes — green before you push
```

**Deploys are automatic: push to GitHub `main` and Vercel builds the `the-brain` project from
`web/`.** See `/DEPLOY-NOTES.md`. Push only after tests, `npx tsc --noEmit` and the build are
green, then confirm the deployment went READY and the pages render. If the URL ever changes,
update Site URL and the redirect allow-list in Supabase → Authentication → URL Configuration.

Never commit `.env.local` or `.env.production`. The Supabase **anon** key is safe in client
code — RLS is what protects the data — but the service-role key must never appear in this repo.

---

# Archived: the pre-Supabase static app

> ⚠️ **Historical record. None of this is live.** Retired 2026-07-30 and moved to
> `_archive/prototypes/`. It stored everything in browser `localStorage`; **that is not, and never
> again will be, THE BRAIN's data layer** — Supabase with RLS is (§A4). The root `index.html` is
> now only a redirect stub pointing at the deployed app.
>
> This section survives for one reason: the OCR parsers, the debt payoff engine and the Gita
> layer are worth porting into Part A. Read it as source material, never as current behaviour,
> and never apply its conventions to `web/`.

It was one app with two modes: light theme = LIFE, dark = EMPIRE, toggled from the top bar.
Section names below are prefixed `B` for historical continuity.

## B1. Views (state.view)

`brain` (Command Centre) · `report` (Daily Sheet, ☀) · `weekly` (Weekly Report, ▦) · `reminders` ·
`review` (Weekly Review) · `diag` (My Profile) · `docs` · `command` (Life/Empire Command, per
mode) · `board` · `cash` · `inbox` (Paper Inbox) · `tasks` · `property` · phone-fast view.

## B2. Data — localStorage (retired; superseded by Supabase, §A4)

- `lifeos-tasks-v1` — tasks `{id,title,tag,when('today'|'week'),priority,due,done,doneAt,reason}`
- `brain-reminders-v1` — reminders `{id,text,kind,date,time,recurDays,taskId,billId,done}`
- `brain-inbox-v1` — bills `{id,payee,amount,due,paid}`
- `brain-settings-v1` — real numbers `{debtStart,debtBalance,debtPayment,rentBed,rentTre,constraint}`
- `brain-checkin-v1` (per date: steps/sleep/weight/trained/dev, plus Samsung-imported
  activeMin/actCal/totalCal/distKm), `brain-habits-v1`, `brain-moods-v1`, `brain-water-v1`
  (per date: glasses, goal 8), `brain-mindful-v1` (per date: focus minutes, +25 per completed
  session), `brain-shealth-v1` (imported Samsung Health screenshots: {date, steps, activeMin,
  actCal, totalCal, distKm, thumb}), `brain-ritual-v1` (streak/energy/three), `brain-dayplan-v1`,
  `brain-diary-v1` (per date, per hour), `brain-profile-v1`, `brain-docs-v1`, `brain-coach-v1`,
  `brain-reviews-v1`, `brain-cash-v1`, `brain-prodlog-v1`.
- Backup/restore (`exportBackup`/`importBackup`, sidebar footer) exports/imports **every** store
  above as one JSON — keep the `keys` array in `exportBackup` in sync when adding a store.
- **OCR** (`_ocrReady`/`_ocrFile`): Tesseract.js is fetched from CDN **on first use**, not at
  boot — a 2MB engine shouldn't cost anything on the mornings you don't import. `_ocrReady()`
  rejects with `"offline"` when the CDN can't be reached; both callers catch that and tell you to
  type it in instead. `_thumb(file,px)` makes a downscaled JPEG so a year of screenshots still
  fits in localStorage.
- **Samsung Health import** (`importSamsung`): the "⤓ Import Samsung Health" button on the Life
  health board accepts screenshot images (multi-select) OR csv/json. Images are OCR'd, parsed by
  `_parseSHealth` (date + steps/active-min/activity-cal/total-cal/distance), filed to the
  screenshot's own date via `setCheckinFor`, and thumbnailed into the `brain-shealth-v1` gallery
  (deduped by date, capped at 60). Undated screenshots file under today. csv/json goes through
  `_parseSHealthData` and works offline. Each file is handled independently — one unreadable
  image never sinks the batch.
- **Bill camera** (`biPick` on Paper Inbox): photograph a bill, `_parseBill` reads
  payee/amount/due into the File-a-bill boxes. It **prefills only — never files on its own**,
  because a misread due date would create a reminder on the wrong day. Labelled totals ("amount
  due") beat stray £ figures; a date on a line mentioning due/payable beats one anywhere else,
  else the latest not-yet-past date, else nothing.
- Both parsers are pure and date-injectable (`todayIso` arg) so they can be unit-tested outside
  the browser — see the extraction suite pattern in the commit for 2026-07-30.

## B3. Cross-system links (keep bidirectional)

- Reminder ↔ Task (`taskId`): ticking either completes the other; task rows show 🔔, reminder
  rows show a task chip.
- Reminder ↔ Bill (`billId`): ticking a bill's reminder marks it paid; marking a bill paid closes
  its reminders.
- Bills auto-create a FIN task when filed.

## B4. Bhagavad Gita layer

Single source: `GITA` array + `_verse(offset)` = deterministic verse-of-the-day (rotates daily).
Surfaced (offset-varied so they differ) on: Command Centre, Life & Empire command hero lines +
the inspiration widget (`↻ NEXT` cycles via `state.qIx`), phone NOW tab, and both printable
reports' footers. To add verses, extend `GITA` only.

## B5. Reports (print to A4, black-on-white)

- **Daily Sheet** (`_reportVals`): daily-only — clear-this-first (binding constraint), coach
  line, Today's Three + overload warning, due-today reminders/bills, full 06:00–22:00
  hour-by-hour diary (priorities auto-placed, open slots writable & persisted to
  `brain-diary-v1`), verse footer.
- **Weekly Report** (`_weeklyReportVals`): completed-this-week (by `doneAt` within Mon–Sun),
  upcoming, goals & progress bars, habits 7-day, health week averages, verse footer.

Print CSS lives in the helmet `@media print` block; `.print-report` is the printable sheet,
`.noprint` hides screen chrome.

## B6. Conventions

- Inline styles only; theme via CSS vars (`--bg/--card/--line/--tx1..4/--tint*`). Mono labels use
  `.bMono`.
- Tag→system/colour maps: `TAGSYS`, `TAGCOL`. Priority map: `PRI`.
- Respect Jay's rules: no beef in any recipe/food suggestion; GBP £ everywhere; faith/Gita
  content is welcome.
