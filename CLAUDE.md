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
- **No workarounds presented as answers.** When something is blocked (see `/DEPLOY-NOTES.md`
  for the Vercel permission case), name the root cause and fix that. Say plainly what is broken
  and what the real fix is. Don't dress a detour up as a destination.
- **Finish the thread.** If a change leaves a stale comment, an unused import, a doc that now
  lies, or a name that no longer matches the concept — fix it in the same pass.

## A1. Two separate projects. Do not mix them.

| | **THE BRAIN** (this repo) | **MAINFRAME** (do not touch) |
|---|---|---|
| What | Jay's personal operating system | Festival operations business system |
| Stack | Next.js 15 + Supabase + Vercel | Vite + React + Supabase + Vercel |
| Supabase ref | `qttroyuajpyelfrbxzzt` (eu-west-2) | `iuqmqpcasrqqmkkzqkfp` (eu-central-1) |
| Live | the-brain-os-meshman14-uxs-projects.vercel.app | mainfram-4.vercel.app |

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
- **`goals.progress` is `integer NOT NULL default 0`.** It can never mean "work it out
  for me", so the app keeps two separate signals: `statedProgress` (what you claim) and
  `derivedProgress` (the mean of the goal's projects). When they disagree by ≥15 points
  the goal says so — a goal at 80% whose projects sit at 20% is exactly what you need shown.
- **`goals.status` and `projects.status` have NO check constraint** — unlike `tasks.status`,
  they are free text defaulting to `'active'`. `ItemStatus` is a convention the app upholds,
  not something the database enforces. Treat values read back as possibly outside the union.
- **The cascade columns exist and are nullable**: `projects.goal_id`, `tasks.project_id`.
  Nullable is the point — decision 2 makes every level above a task optional.

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
`harden_seed_pillars_search_path`, `planner_kanban_and_richer_areas`.

**Auth:** magic link only, no passwords. Signups **disabled** — Jay's user already exists
(`meshman14@gmail.com`). Supabase Site URL and redirect allow-list must match the deployed URL.

## A5. Build state (v1.2, unpacked into `web/` 2026-07-30)

Verified in this repo: **57/57 tests pass** (`tests/logic.test.ts`, vitest) and
**`npm run build` produces exactly 12 routes**.

| Piece | State |
|---|---|
| Magic-link login, `/auth/confirm`, `/auth/signout`, middleware | ✅ |
| Dashboard (13 areas), Capture, Inbox/Triage, Planner (Kanban), This Week | ✅ in `src/app/(app)/` |
| Paper theme + dark toggle | ✅ |
| `src/lib/logic.ts` + `tests/` + vitest | ✅ |
| Goals + Projects UI (Phase 2) | ✅ `/goals` — the cascade, stated vs derived progress |

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
/(app)/dashboard       the 13 Life Areas, split LIFE_OS / EMPIRE_OS
/(app)/goals           goals → projects, with unattached projects listed separately
/(app)/planner         Kanban
/(app)/week            7-day scheduler
/(app)/capture         one-box capture (PWA start_url)
/(app)/inbox           triage
/(app)/pillar/[id]     area detail
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

## A8. Build order & open items

Phases: 0 auth/RLS/PWA/areas ✅ · 1 Inbox+Capture+Planner+Week ✅ · 2 Goals + Projects ✅
· **3 Notes + links + backlinks ← next** · 4 LIFE_OS (habits, journal, people, metrics) · 5 EMPIRE_OS
(ventures, assets, investments, opportunities) · 6 Review rituals · 7 AI layer.

Open items:

1. **Capture the live schema into the repo.** The live project's 20-table schema has never been
   committed; pull it into `supabase/` so it stops being tribal knowledge.
2. **Jay has never completed first sign-in.** Verify the magic-link round trip end to end, and
   that the 13 areas appear.
3. **Three missing area names.** Jay's Blueprint v2 defines **11** Life Areas ("7 from V1 · 4
   new"). Known: Businesses, Finances, Vehicles, Property, Learning & Growth, Second Brain,
   Life Admin & Documents, Reviews. The other three are in
   `MAINFRAME-Festival-OS/Jays Blueprint - Life OS.dc.html` (private repo, 587 lines) — look for
   `this.domains`. GitHub's web viewer times out on it; clone the repo instead. Once known,
   remap the 12 seeded areas to Jay's own 11 names, split across LIFE_OS/EMPIRE_OS.
4. Jay's blueprint also contains real data worth seeding: 8 ventures (incl. **A to Z Traderz**,
   a coffee shop), 7 debts/bills, 3 vehicles (tax/MOT), property at **Kathleen St**.
5. His blueprint has **5** review cadences (daily, weekly, monthly, quarterly, annual); we
   deliberately build **3**. Confirm with him before adding monthly/annual.
6. ~~Vehicles has no pillar.~~ **Resolved 2026-07-31** — added as the 13th area with Jay's
   sign-off (migration `add_vehicles_pillar_thirteen_areas`). Seed it with the three vehicles
   from the blueprint: Van `DK05 LVL`, Zafira `WK57 XWO`, BMW `ME54 JAY`, each with tax and
   MOT dates.
7. **No ESLint config.** v1.2 ships none, and `next lint` is deprecated and prompts
   interactively. `npx tsc --noEmit` is the current gate and is clean. Add a flat
   `eslint.config.mjs` when convenient.

## A9. Commands

Run from `web/`:

```bash
npm install
cp .env.production .env.local  # the two NEXT_PUBLIC_ values (both files gitignored)
npm run dev                    # http://localhost:3000
npm test                       # 29 tests — must be green before build
npm run build                  # 11 routes — green before you deploy
npx vercel --prod              # deploy with Jay's own CLI login, from his machine
```

Deploys happen **from Jay's machine** with his Vercel login — the MCP connector cannot see the
`the-brain-os` project (`/DEPLOY-NOTES.md`), and a connector deploy would mint a third project
and break the Supabase Site URL / redirect allow-list. After any URL change, update both in
Supabase → Authentication → URL Configuration.

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
