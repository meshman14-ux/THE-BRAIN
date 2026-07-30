# CLAUDE.md — THE BRAIN OS (`web/`)

Context file for Claude Code, scoped to this directory. Read this before touching anything in
`web/`. The repo root has its own `CLAUDE.md` covering the shipped single-file app
(`brain.html` / `hub.html`) — that is a **different application**. Don't apply this file's
conventions to it, or its conventions here.

All paths in this file are relative to `web/`.

---

## ⚠️ Status: this is a skeleton, not the system described below

Sections 2–4 and 7–9 describe the **intended** design — settled with Jay, still the target, worth
following. But most of it is **not built in this directory yet**. Read this before trusting any
"already exists" phrasing:

**What is actually in `web/` today:**

```
src/app/page.tsx              redirect
src/app/layout.tsx
src/app/globals.css
src/app/login/page.tsx        magic link
src/app/auth/confirm/route.ts
src/app/auth/signout/route.ts
src/app/dashboard/page.tsx    placeholder tiles ("coming in Campaign 2/3/4")
src/lib/supabase/{client,server,middleware,env}.ts
src/middleware.ts
supabase/schema.sql           6 tables only
```

**What does NOT exist here, despite being described below:**

- `src/lib/logic.ts` — no such file
- `tests/` and the 29 unit tests — no test directory, and **no `test` script in `package.json`**
- Routes `/planner`, `/week`, `/capture`, `/inbox`, `/pillar/[id]`
- The 12-area dashboard — `dashboard/page.tsx` renders placeholder tiles, not pillars
- The paper theme + `ThemeScript`
- `seed_pillars()` — not in `schema.sql`

**`supabase/schema.sql` in this repo defines 6 tables**, not the 20 in section 4:
`links · projects · notes · tasks · habits · habit_completions`. The 20-table schema described
below was applied directly to the live Supabase project and has **never been captured in this
repo**. That drift is itself an open item — see §9.

Treat sections 5, 6 and 8 as the roadmap they are. Verify before you assume.

---

## 0. Working standard — BOIL THE OCEAN

> The marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it
> with tests. Do it with documentation. Do it so well that Jay is genuinely impressed — not
> politely satisfied, actually impressed. Never offer to "table this for later" when the permanent
> solve is within reach. Never leave a dangling thread when tying it off takes five more minutes.
> Never present a workaround when the real fix exists. The standard isn't "good enough" — it's
> "holy shit, that's done." Search before building. Test before shipping. Ship the complete thing.
> When Jay asks for something, the answer is the finished product, not a plan to build it. Time is
> not an excuse. Fatigue is not an excuse. Complexity is not an excuse. **Boil the ocean.**

**What that means concretely here:**

- **Search before building.** Read the existing components first. Jay has prior art — a
  `Jays Blueprint - Life OS.dc.html` and a whole prototype library. Find it and use his
  vocabulary and his design language rather than inventing your own.
- **Test before shipping.** Business rules belong in `src/lib/logic.ts` as pure functions with
  tests in `tests/`. Neither exists yet — **the first task that adds a business rule should
  create both, plus a `test` script in `package.json`.** A rule that only exists inside a
  component is a rule nobody can verify.
- **Ship the complete thing.** A feature isn't done at "renders". It's done when the empty state
  reads well, the error path is handled, it works one-handed on a phone, it works in both themes,
  it's covered by a test, and this file reflects it.
- **No workarounds presented as answers.** When something is blocked (see `../DEPLOY-NOTES.md`
  for the Vercel permission case), name the root cause and fix that. Say plainly what is broken
  and what the real fix is. Don't dress a detour up as a destination.
- **Finish the thread.** If a change leaves a stale comment, an unused import, a doc that now
  lies, or a name that no longer matches the concept — fix it in the same pass.

---

## 1. Two separate projects. Do not mix them.

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

---

## 2. What THE BRAIN OS is *(intended design)*

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

---

## 3. Locked design decisions

These were settled with Jay over ten questions. Don't quietly revisit them.

1. **All four PKM layers, in dependency order.** Capture + Cockpit *generate* data; Mirror
   (reviews) and Command Centre (dashboards) *consume* it. Build the generators first.
2. **Hierarchy: Vision → Pillars → Goals → Projects → Tasks.** Everything above Projects is
   **optional per item** — a task never requires a goal to exist. This is non-negotiable: it's
   what stops the system feeling bureaucratic.
3. **12 areas** (called "pillars" in the DB, "Life Areas" in the UI): 7 LIFE_OS, 5 EMPIRE_OS.
4. **Phone-first capture, desktop thinking.** Installable PWA, one box, zero required fields,
   offline queue in localStorage that flushes on reconnect.
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

---

## 4. Database *(live project — ahead of this repo)*

Supabase project **`qttroyuajpyelfrbxzzt`** · https://qttroyuajpyelfrbxzzt.supabase.co
Region eu-west-2 (London), free tier. **RLS owner-only on all 20 tables.** pgvector enabled.

```
command centre : vision · pillars · goals · projects · tasks · inbox · links · reviews
vault          : notes
LIFE_OS        : habits · habit_logs · journal · people · metrics · metric_readings
EMPIRE_OS      : ventures · assets · investments · opportunities
calendar       : calendar_sync
```

> **This is the live project's schema, not `supabase/schema.sql`.** That file still holds the
> earlier 6-table version. Don't apply it over the live project — it would drop 14 tables.
> Pull the live schema down before changing anything here (§9 item 1).

Every table has `user_id uuid default auth.uid()` and:
```sql
create policy "own" on <t> for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**`seed_pillars()`** — `security invoker`, `search_path` pinned, idempotent. Plants the 12 areas
for the calling user. Intended to be called from `/auth/confirm` on sign-in and from the first-run
screen. **`auth/confirm/route.ts` in this repo does not call it yet.**

Migrations applied to the live project: `the_brain_os_v1_full_schema`,
`harden_seed_pillars_search_path`, `planner_kanban_and_richer_areas`.

**Auth:** magic link only, no passwords. Signups **disabled** — Jay's user already exists
(`meshman14@gmail.com`). Supabase Site URL and redirect allow-list must match the deployed URL.

---

## 5. Build state

| Piece | In `web/`? | Notes |
|---|---|---|
| Magic-link login | ✅ | `login/page.tsx` |
| `/auth/confirm`, `/auth/signout` | ✅ | confirm does **not** call `seed_pillars()` |
| Session middleware | ✅ | `src/middleware.ts` |
| Dashboard | ⚠️ placeholder | tiles reading "coming in Campaign 2/3/4", not the 12 areas |
| Areas / Capture / Triage / Area detail | ❌ | |
| Planner (Kanban) | ❌ | |
| This Week (7-day scheduler) | ❌ | |
| Paper theme + dark toggle | ❌ | |
| `src/lib/logic.ts` + tests | ❌ | no test runner configured either |

A v1.0/v1.1 with the areas dashboard, capture, triage, planner and week views was built at some
point outside this directory and is referenced in `../DEPLOY-NOTES.md` and the v1.1/v1.2 zips at
the repo root. **None of that source is in `web/`.** If you're asked to "deploy v1.1", find that
source first — do not assume this directory is it.

> **Improvement over Jay's blueprint, deliberate:** his original This Week stored a day *index*
> (0–6), so scheduling meant nothing once the week rolled over. This should write a real
> `do_date`. Keep that when the view gets built.

---

## 6. Routes

Built:

```
/                      → redirect
/login                 magic link
/auth/confirm          verifies + redirects   (should also call seed_pillars())
/auth/signout          POST
/dashboard             placeholder tiles
```

Specified, not built:

```
/(app)/dashboard       the 12 Life Areas, split LIFE_OS / EMPIRE_OS
/(app)/planner         Kanban
/(app)/week            7-day scheduler
/(app)/capture         one-box capture (PWA start_url)
/(app)/inbox           triage
/(app)/pillar/[id]     area detail
```

`src/middleware.ts` refreshes the session and redirects unauthenticated users to `/login`.
Public paths: `/login`, `/auth`, `/manifest.webmanifest`, `/sw.js`.

---

## 7. Conventions

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

---

## 8. Build order — what's next

| Phase | Delivers | Status |
|---|---|---|
| 0 | Auth, RLS, PWA shell, 12 areas | ⚠️ auth + RLS done; PWA shell and 12 areas not in `web/` |
| 1 | Inbox + Capture + Triage + Planner + Week | ❌ not in `web/` (see §5) |
| 2 | Goals + Projects UI, the cascade | |
| 3 | Notes + `links` + backlinks + MOCs | |
| 4 | LIFE_OS: habits, journal, people, metrics | |
| 5 | EMPIRE_OS: ventures, assets, investments, opportunities | |
| 6 | Review rituals (daily / weekly / quarterly) reading real evidence | |
| 7 | AI layer (embeddings already in place) | |

---

## 9. Open items

1. **`supabase/schema.sql` is 14 tables behind the live project.** Pull the live schema into the
   repo so it stops being a trap. Never apply the current file over the live project.
2. **Locate the v1.1 source.** Referenced by `../DEPLOY-NOTES.md` and the root zips, absent from
   `web/`. Until it's found, "deploy v1.1" has no source to deploy.
3. **No test runner.** `package.json` has no `test` script. Add one (plus `src/lib/logic.ts` and
   `tests/`) with the first business rule, per §0.
4. **`/auth/confirm` doesn't call `seed_pillars()`.** A new sign-in gets no areas.
5. **Jay has never completed first sign-in.** Verify the magic-link round trip works end to end.
6. **Three missing area names.** Jay's Blueprint v2 defines **11** Life Areas ("7 from V1 · 4
   new"). Known: Businesses, Finances, Vehicles, Property, Learning & Growth, Second Brain,
   Life Admin & Documents, Reviews. The other three are in
   `MAINFRAME-Festival-OS/Jays Blueprint - Life OS.dc.html` (private repo, 587 lines, 52.6 KB) —
   look for `this.domains`. GitHub's web viewer times out on it; clone the repo instead.
   Once known, remap the 12 seeded areas to Jay's own 11 names, split across LIFE_OS/EMPIRE_OS.
7. Jay's blueprint also contains real data worth seeding: 8 ventures (incl. **A to Z Traderz**,
   a coffee shop), 7 debts/bills, 3 vehicles (tax/MOT), property at **Kathleen St**.
8. His blueprint has **5** review cadences (daily, weekly, monthly, quarterly, annual); we
   deliberately build **3**. Confirm with him before adding monthly/annual.

---

## 10. Commands

Run from `web/`:

```bash
npm install
cp .env.example .env.local     # fill in the two NEXT_PUBLIC_ values
npm run dev                    # http://localhost:3000
npm run lint
npm run build                  # green before you deploy
npx vercel --prod              # deploy with Jay's own CLI login
```

There is **no `npm test`** yet — see §9 item 3. Once a test script exists, it runs before
`npm run build`, and both before any deploy.

Never commit `.env.local`. The Supabase **anon** key is safe in client code — RLS is what
protects the data — but the service-role key must never appear anywhere in this repo.
