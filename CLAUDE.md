# CLAUDE.md — THE BRAIN

The one canonical context file for this repo.

**There is one application: THE BRAIN OS, in `web/` — Next.js + Supabase.** Its data layer is
Supabase Postgres with RLS on 44 tables (§A4), captured at `supabase/schema.sql`. That is the
only live data layer; nothing in this
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

   **Built 2026-08-06 (Stage 4 · Phase E)** at `/advisor`. How each clause is kept:

   - *Advisory, never autonomous.* `ADVISOR_NEVER_WRITES` in `advisor.ts` says it, and both
     routes hold it: `/api/advisor/ask` and `/api/advisor/review` only ever `select`. There
     is no path from a model's output to a row — no task creation, no edits, no auto-filed
     review. The draft is text he copies into `/reviews` himself.
   - *The morning brief is assembled, not generated.* Every line is arithmetic over data the
     database already holds, so it costs nothing, works with no API key, and cannot
     hallucinate. A model that narrated numbers it was handed would only add a way to be wrong.
   - *With citations.* Retrieval happens in **our** code, not the model's: it is shown at most
     six numbered passages and told to cite each claim. `checkAnswer` then finds citations
     that point at nothing and asserting sentences with no citation at all, and the page
     labels the answer **not fully grounded** rather than presenting it as fact.
   - *Push vs pull, and PRINCIPLES_NEVER_PUSH.* The brief arrives unasked, so `briefSources`
     strips every `kind = 'principle'` from it. The ask box is something he goes to, so a
     question may pull a principle freely. That is §A7's rule split correctly rather than
     applied bluntly, and both halves are tested.

   **Retrieval is word matching, not vectors, and that is deliberate.** `notes.embedding` is
   `vector(1536)` and pgvector is on, but the vault holds eleven notes — semantic search over
   eleven rows ranks worse than matching the words he used, and would need a second provider
   for embeddings. `RETRIEVAL_CEILING` in `advisor.ts` records the note count at which that
   stops being true.
7. **Rituals: daily 2 min, weekly 20 min, quarterly 1 hr.** Monthly deliberately omitted.
8. **Calendar: full two-way sync, blast radius contained** — THE BRAIN writes ONLY to its own
   dedicated Google calendar, never the main one. `calendar_sync` maps task ↔ event with etag.
   Deletes unschedule, never destroy. Conflicts logged and surfaced, never auto-resolved.

   **Built 2026-08-06 (Stage 4 · Phase D).** How each clause is kept:

   - *Only its own calendar.* `assertWritable` in `src/lib/calendar.ts` is the guard, and
     every write path calls it first. It refuses the `primary` alias in any casing, refuses
     the account's real primary id (usually the email address), and refuses an empty or
     missing id rather than defaulting to anything. It **throws** rather than returning
     false, so a caller that forgets to check cannot slip past. The calendar is *created* by
     the app, never chosen from a list — asking him to pick is asking him to pick his real
     diary by accident once, and there is no undo for that. The OAuth scope is
     `calendar.app.created`, so even a bug cannot reach a calendar THE BRAIN did not make.
   - *task ↔ event with etag.* `calendar_sync` carries the etag. "Did it change in Google?"
     is the etag; "did it change here?" is a fingerprint of the last-pushed event stored in
     `calendar_sync.meta.signature` — `tasks` has no `updated_at`, and this needs no
     migration to add one.
   - *Deletes unschedule, never destroy.* A cancelled event clears `tasks.do_date` and
     nothing else. There is no branch in `pullAction` that can return a delete-the-task
     outcome, and a test asserts that.
   - *Never auto-resolved.* When both sides moved, the link is flagged and **neither side is
     written**. `pushAction` returns `none` for a conflicted link, so the next sync cannot
     quietly resolve it either. `/calendar` shows both dates and two buttons; the resolve
     route is the only thing that settles one, and it cannot be called without a choice.

   **`do_date` only, never `due_date`.** Due is a fact about the world; do is a decision, and
   a calendar is a record of decisions. Syncing due dates would fill his week with days he
   never agreed to.

   Sync is **manual** — a "Sync now" button on `/calendar`. Not automatic: a background job
   needs to act as him without a session, which means a service-role key, and that is a much
   larger blast radius than this feature is worth. Revisit if he asks.
9. **Clean start.** No data migration.
10. **Theme: "paper" is default, "dark" is the toggle.** Paper is Jay's own design language from
    his Blueprint v2 — warm paper `#f4f2ee`, white cards, indigo, Source Serif headlines,
    Public Sans body, IBM Plex Mono numerals.

11. **Palette B, "Two Machines" — chosen by Jay 2026-08-10 over three alternatives** (A "Ink
    & Bronze", C "Signal", D "Neon"). THEME and MODE are different axes and must stay that
    way. Theme is the light Jay chooses. **MODE replaces the ground:** LIFE keeps the
    theme's own surface, indigo, serif headlines and roomy chrome; EMPIRE flips to graphite
    with a cyan accent, mono headlines and tighter `--radius`/`--pad` — **in both themes**.
    Switching does not recolour a button; it changes the light in the room. If you are
    tempted to make EMPIRE a tinted version of LIFE, don't: the surface is the whole of the
    distinction.

    **Four colour channels, and nothing may borrow another's:**

    | channel | carries | encoded by |
    |---|---|---|
    | 0 · depth | **nothing** | gradient, glow, sheen, growth — decoration only |
    | 1 · system | which OS | hue + surface + typeface + density |
    | 2 · status | how it is going | green/amber/red, permanently reserved |
    | 3 · priority | how urgent | **shape and weight, never hue** |
    | 4 · module | what kind | glyph + micro-label, no colour |

    **Channel zero was added 2026-08-12 (the enrichment pass) and carries no meaning by
    definition.** `--lift`, `--lift-hover`, `--hero`, `--fill-*`, `--glow-*`, `--sheen`
    and `--shadow-lift` are tokens on every ground, so a gradient follows the theme AND
    the machine exactly as the accent does — paper lifts warm, dark lifts deep, EMPIRE
    lifts graphite-and-cyan. The test for whether something belongs in channel zero:
    **deleting the whole block would make the app plainer and no less truthful.** Three
    depths give the page hierarchy without spending colour — `.panel-hero` (one per
    screen, lit from the top-left, sheen line along its edge), `.panel-raised`, and
    `.panel-quiet` (recessed and dashed, for the deliberately silent halves: dormant
    work, standing bills, kept-not-counted habits). `.fill` puts light along a bar and
    grows it on load — the WIDTH is the fact, the gradient and the growth are not.
    `.celebrate` marks a finish landing, because completion is the reward loop the whole
    system runs on and it was the one moment the UI never marked. Five tests in
    `palette.test.ts` hold the bargain: every ground must define the depth tokens, no
    `--fill-high/med/low` or `--glow-high/med/low` may ever exist (priority is shape, and
    this is the file where that would be easiest to break by accident), no `--fill-bad`
    (the one colour that must never be decorative), `--lift`/`--hero` must stay gradients
    rather than becoming flat colours behind text, and the blanket
    `prefers-reduced-motion` rule must keep covering every animation.

    **Priority may not have a colour, and that is structural rather than fussy.** The two
    colours it would reach for are already spoken for: red means "something is wrong"
    (channel 2) and the accent means "the system you are wearing" (channel 1). So `.prio`
    thickens a left bar and `.prio-mark` fills a dot, both from `currentColor` — which is
    what lets a row carry an overdue status AND a High priority without either mark becoming
    ambiguous. `tests/palette.test.ts` asserts no `--prio-*` token exists at all; the
    absence is the design, because a token would immediately be reached for.

    **v1 shipped three collisions and every review missed them**, because two hex strings
    differing in every digit can still be the same colour: `--empire` was `#c07a1e`, the
    *exact value* of `--warn`; `--doing`, `--accent` and `--life` were all `#4b57c9`, so
    LIFE mode's "in progress" lane was invisible; `--p-learning` sat about one step from
    `--warn`, so a learning hour read as an alert. All three are fixed at the root rather
    than retuned — the accent left the warm band entirely, and the three task states became
    a **hue-free** neutral ramp (`--todo: var(--faint)`, `--doing: var(--text)`,
    `--done: var(--muted)`) because they are a sequence, not three categories, and a lane
    with its name written on it needs no colour.

12. **Zero-obligation floor, optional depth.** Derived from Jay's interview answers, which
    returned "all of these" three times and "no preference" once — read as a brief rather
    than as indecision: hold everything, don't make me pre-commit, show me what matters.

    Every module has a floor that costs nothing and a ceiling that is always present and
    never demanded. The check-in's floor is two taps; nutrition's is a weight and one tap;
    the roster's is a name. **A skipped question writes NULL, never a zero and never an
    empty string** — this generalises `formatGBP(null)` from one function's good manners
    into a system-wide law. The corollary is the one that keeps being load-bearing: every
    convenient default lies in the *flattering* direction, so net worth reads as a ceiling
    while a debt is unknown, cashflow returns a dash rather than a big negative when no
    income is recorded, and readiness shows no band rather than a green one on four days of
    data.

### Schema choices worth preserving
- **`tasks.do_date` is separate from `tasks.due_date`.** Due is a fact about the world; *do* is a
  decision. Today/Week views are built from `do_date`. This keeps the list honest.
- **`rankForToday` breaks its last tie on `created_at`, not on the title.** With three visible
  slots the final tie-break decides what Jay actually sees, so it has to mean something. The
  first seven real tasks tied on reason, priority AND due date, and the alphabet then pushed
  *"Ring Advantis and Marstons"* into the drawer because R sorts after C. Oldest-first is the
  only honest ordering left at that point: among items the system cannot otherwise separate,
  the one written down first has waited longest. **Any query feeding `/dashboard`, `/life` or
  `/empire` must select `created_at`** or the tie-break silently reverts to the title.
  Its documented limit: a bulk insert gives every row the same transaction timestamp, so the
  seven remain tied — **the way to break a tie the system cannot see is to give one a
  `do_date`**, which promotes it to `do-today` at the head of the ordering.
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
- **The onboarding columns are all nullable, and NULL means "not answered".**
  `ventures.budget`, `monthly_cost`, `funding_route` and `plan` (migration
  `venture_profiles_and_plans`) are what the division questionnaire fills in. None
  defaults to zero, because a skipped budget must never make a division look free —
  `toNumberOrNull` exists for exactly this and rejects `"  "` and `[]`, both of which
  `Number()` turns into 0. `ventures.profile` is jsonb holding *researched* material;
  `ventures.meta` holds *his answers* — `onboarded_at`, `stage_confirmed` and
  `compliance` — and the two are never mixed, so the UI can say which is which.
- **`ventures.stage` is NOT NULL default `'idea'`, so the database cannot tell a
  chosen stage from a defaulted one.** `meta.stage_confirmed` is that difference, and
  it is why the stage question counts as answered only once he has picked knowingly.
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
Region eu-west-2 (London), free tier. **RLS owner-only on all 44 tables.** pgvector enabled.

```
command centre : vision · pillars · goals · projects · tasks · inbox · links · reviews
                 seasons · finishes · diagnostic_runs
vault          : notes
LIFE_OS        : habits · habit_logs · journal · people · people_contacts
                 metrics · metric_readings · debts · debt_payments · vehicles
                 health_days · workouts · lifts · meals · meal_ingredients
                 training_sets · skill_attempts · athlete_profile
EMPIRE_OS      : ventures · assets · investments · opportunities
calendar       : calendar_sync · integrations
THE COG        : cog_checkins · cog_states · cog_pulses · cog_feedback
                 cog_config · cog_identity · cog_events · cog_telemetry
```

> The eight `cog_*` tables (2026-08-12, migration `cog_core`) are **already applied**
> and `cog_config` is seeded with one `default` row owned by Jay's user. That seed is
> deliberately NOT inline in the migration file: `default auth.uid()` evaluates to NULL
> under a migration connection, and an unowned config row is invisible to RLS forever
> after. The whole file is `if not exists`, so re-applying it is safe.

> The `seasons`, `finishes`, `diagnostic_runs` and `meals`/`meal_ingredients`
> migrations (2026-08-11, cloud sessions) are **already applied to the live project —
> do not re-apply any of them.** `seasons` carries a partial unique index enforcing
> exactly one open season; `meals` arrived seeded with the fifty (50 meals, 387
> ingredient rows — re-running its migration would duplicate them all).

> **The count has been wrong three times — 20, then 24, then 28 — and is now read from the
> catalogue rather than remembered: 44.** Three of those wrong numbers were live in this file
> simultaneously. That is the whole argument for the capture below: prose drifts, and by
> 2026-08-13 this section named columns that do not exist (`health_days.day`, `debts.balance`)
> and omitted ones that do, which broke three queries in one evening.

> **`supabase/schema.sql` is the schema, captured 2026-08-13 by reading `information_schema`
> and `pg_catalog`.** Every table, primary key, unique constraint, foreign key, check, index,
> policy and function. Read it, not this prose, when you need the truth about a column;
> refresh it by re-reading the catalogue rather than editing it by hand. **It is NOT a
> migration — never run it against the live project.** It also records the authoritative
> ordered list of all 22 applied migrations, of which only four have their SQL committed.

**What the 2026-08-13 capture verified, and what it found.**

Four things now checked against the catalogue rather than assumed:

- **RLS is on for all 44 tables, every table has at least one policy, and every policy is
  byte-identical** — `(auth.uid() = user_id)` for both `USING` and `WITH CHECK`. Verified by
  querying for any policy whose expression differed, which returned zero rows. The uniformity
  is the property worth defending: one shape, no exceptions, so there is no table where a
  subtly different predicate could leak.
- **There are no `SECURITY DEFINER` functions at all, and no triggers.** Only two project
  functions exist — `seed_pillars()` and `cog_prune()` — and both are `SECURITY INVOKER`, so
  RLS applies to them. Worth stating because the sibling COG repo has repeatedly been bitten
  by `SECURITY DEFINER` functions silently re-granting `EXECUTE` to `PUBLIC`; this schema has
  no such surface. The one asymmetry: **`cog_prune()` does not pin `search_path`** where
  `seed_pillars()` does. Being `INVOKER` that is a hardening note rather than a hole.
- **19 of the 44 tables have no `user_id → auth.users` foreign key** — every `cog_*` one, plus
  `debts`, `debt_payments`, `vehicles`, `meals`, `meal_ingredients`, `seasons`, `finishes`,
  `diagnostic_runs`, `skill_attempts`, `training_sets` and `athlete_profile`. RLS still scopes
  all of them to `auth.uid()`, so this is an **integrity** gap, not a security one: deleting
  the auth user would cascade-clean 25 tables and orphan 19. With one user it is theoretical.
  Recorded rather than fixed, because 19 FKs is a migration with real locking consequences and
  should be a decision.
- **`cog_*` is a name this account uses twice.** In this repo it is the engine layer above.
  The sibling repo `meshman14-ux/the-cog` is a festival-operations system that prefixes
  *every* object `cog_` as well — and **`cog_events` exists in both schemas meaning entirely
  different things**: an outbox event log here, an event booking there. These are not that
  system (no `cog_access`, `cog_units`, `cog_stock`, `cog_incidents` here). But a migration
  written for one project and run against the other would find names it recognises. **Check
  the project ref before running any `cog_*` migration anywhere.**

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
`life_os_area_scores_and_debt_metric`, `debts_and_vehicles` (the SQL for that one
is captured at `supabase/migrations/20260801_debts_and_vehicles.sql`), and
`venture_profiles_and_plans` — which added `ventures.plan`, `budget`, `monthly_cost`,
`funding_route` and `profile`, the columns the division questionnaire fills in — and
`calendar_integration`, which added the `integrations` table plus a unique index keeping
one event per task. The v2 pass added three more: `people_contacts_and_tiers`,
`debt_apr_and_savings_metric` and `health_hub_readiness_lifts_nutrition`.
**Do not re-apply any of them.**

**`debts.apr` is nullable and NULL is never 0%.** Avalanche ordering IS "highest interest
first", so without a rate the word means nothing. Treating a missing rate as zero would sort
an unrecorded credit card to the *bottom* of the queue and cost real money, so `canAvalanche()`
refuses the ordering entirely when no rate exists rather than quietly producing snowball under
the other name, and `payoffPlan()` reports interest as `null` rather than as a smaller number
whenever any rate is missing.

**`people_contacts` is unique on `(person_id, contacted_on)`.** That is what makes the one-tap
log idempotent: tapping twice on the same day records one conversation, not two, so a double
tap cannot inflate a frequency later.

**`health_days` has every measure nullable, deliberately.** A day with only a weight is a valid
day and must never read as a zero-step day. `lifts.movement` is constrained to the Big 4
because the tracker is a fixed four, not a free exercise log — a free log is a different
feature needing a different UI.

**`integrations` holds the Google connection, and its token columns are ciphertext.**
RLS makes the row readable by its owner, and "its owner" includes anything running in his
browser — so a refresh token in the clear there would be one XSS from being someone else's.
AES-256-GCM, keyed from `CALENDAR_TOKEN_SECRET`, which only ever exists as a server
environment variable. Rotating that secret makes every stored token unreadable, which reads
as a connection needing to be redone; that is the intended failure mode, not a bug.

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

## A5. Build state (as of 2026-08-11)

Verified in this repo: **1232/1232 tests pass** (`tests/logic.test.ts` + `stage3` + `stage4`
+ `divisions` + `calendar` + `advisor` + `palette` + `v2` + `diagnostics` + `planner`,
vitest) and **`npm run build` produces exactly 48 routes** (37 pages + 11 API routes).
`npx tsc --noEmit` is clean.

**THE COG harvest — 2026-08-12.** A second cloud drop arrived as a standalone Dockerised
service with its own Postgres. It was NOT merged as a service — two engines to keep in
sync, a second thing to host, and a **service-role key against Supabase**, which this repo
has deliberately never had (see the companion app, §A5). Its BRAIN adapter also repeated
all three schema bugs: `Math.max(1, ("High" ?? 0) + 1)` is `NaN`, `status=eq.open` misses
`doing`/`waiting`, and `meta.estimateMinutes` does not exist.

Three things were harvested into the module instead:

1. **Confidence** (`score.ts`) — every recommendation reports how much to trust it, from
   input completeness AND decision margin, clamped to [0.20, 0.95]. **Never 1.0:** the
   engine is deterministic, the person it models is not. This closes a real gap — the
   score renormalises over present inputs, so a 73 built on two signals looked exactly
   like a 73 built on seven. Each fallback rung costs confidence, so a block off the real
   calendar outranks one guessed from a default window.
2. **Google free/busy** (`google.ts` → `freeBusy`) — using the OAuth, encrypted tokens and
   refresh THE BRAIN already had, so nothing was ported from the service here. The
   `freeBusy` endpoint rather than an event list is the privacy line: **the response has
   no field that could carry a title, attendee or location.** Falls through to the
   planner's pinned hours when the calendar is absent or errors — "could not read it" and
   "nothing booked" must not look the same.
3. **The zone is named** (`cogstate.ts` → `TIMEZONE`, `toNaiveLocal`). Vercel runs in UTC;
   the engine speaks naive London. Left to the runtime this is the F3 bug again, so the
   conversion is explicit and tested across the DST boundary.

The A*/F5/I0 rulebook refinements were NOT taken: the service uses a different domain
model (`energy: 0–100`, `sleepScore`) and porting them would have meant rewriting the
seam that was just corrected against the real schema.

**`/setup` — the list that makes the rest of it work — landed 2026-08-12** at
`src/lib/setup.ts` (pure, 28 tests), `src/lib/setupserver.ts` (the queries, shared with
the dashboard) and `src/components/SetupList.tsx`.

Every module here reports "unmeasured" rather than inventing a zero, which is why the
numbers can be trusted — and also why a system with empty tables looks broken instead of
hungry. The admissions were scattered across eight screens. This is all of them in one
list, ranked, each either typed inline or one tap away.

The ordering rule: **the world outranks the system.** Exactly one step is
`worldPunishes` — the MOT/tax/insurance dates — because a lapsed MOT is a fine and every
other gap is this system being unable to score something. Everything else ranks by how
many modules stop saying "unmeasured" when it is filled. The service date was split into
its own non-legal step for the same reason: sixteen rows under one red heading would have
said a late service and a lapsed MOT were the same kind of thing, and that is how a
warning label stops working.

The dashboard carries **one line while anything is missing and nothing once it is
filled** (`setupLine`) — a prompt that congratulates you daily for being set up is a
prompt you train yourself to skip, and the one line above it needs that habit intact.
Finished steps stay on the page, greyed and folded, because a list that quietly shortens
gives no sense of having got anywhere.

It also closes a real gap: `unknowns()` on `/life` has only ever asked for three of the
four vehicle dates, so `next_service` was editable everywhere except the one place that
asks for it.

**THE COG — the daily momentum engine — landed 2026-08-12** at `src/lib/cog/` (pure
engine), `src/lib/cogstate.ts` (the mapping, tested) and `src/lib/cogserver.ts` (the
queries). Four routes under `/api/cog/`, eight `cog_*` tables, and a Momentum card on the
dashboard's Now tab **behind `NEXT_PUBLIC_COG`** — off unless explicitly set to `1`,
because this is the first module that writes to a BRAIN table on Jay's behalf rather than
surfacing and letting him decide.

Ported from a cloud-session blueprint whose engine was sound and whose **schema
assumptions were wrong in three places**, each corrected in `cogstate.ts` and pinned by a
test: `tasks.priority` is text (`High|Med|Low`, not a number — fed through raw it made
every score `NaN`), the estimate column is `duration_min` (not `estimate_min`), and
`tasks.status` has five values (`doing` is open). The blueprint also shipped one real bug:
rule F3 computed its slot end via `toISOString()`, mixing naive local time with UTC, so
during BST the pomodoro fallback produced a block that **ended before it started**
(13:00 → 12:25). Fixed with `addMinutes`, and `tests/cog/focus.test.ts` is the proof.

**One design departure, decided with Jay:** the blueprint centres a 10-second MORNING
check-in and rule N1 nags whenever it is absent — but the check-in here is NIGHTLY, so
that would have fired every morning forever. The morning bands are **derived** from last
night's `journal` mood/energy and `health_days` sleep, decayed by age, reported as
`decayed` so N1 stays quiet. A `cog_checkins` row still overrides when one exists.

Two contracts, both mechanically enforced: **nothing in `cog/` imports from outside
`cog/`, reads a clock, or calls `Math.random`** (`tests/cog/boundary.test.ts`), and COG
writes only `cog_*` plus `tasks.do_date/priority/meta.cog` on an *accepted* verdict,
behind an optimistic-concurrency guard — a human edit always wins and is recorded as
feedback. A 90-day seeded simulation (`tests/cog/sim.test.ts`) gates the aggregate
behaviour the unit tests cannot see.

**HYBRID — the Health OS engine — landed 2026-08-12** at `src/lib/hybrid/`, and it is
**foundation only: no UI, no tables, no adapter.** Nothing in the app looks different
because of it yet. The rule that makes it worth having: **nothing in `hybrid/` imports
from outside `hybrid/`** — no Supabase, no React, no BRAIN tables — which is why 77 tests
can cover it with zero database. The adapter mapping `health_days` rows onto `Reading[]`
belongs OUTSIDE that boundary and does not exist yet.

It inherits this system's three laws into a new domain. *Absence is not zero*: readiness
is a weighted mean over PRESENT signals only, never imputing a missing one as average,
and it reports **confidence** — the share of possible evidence that showed up — beside
the score, returning **no score at all below 35%**. *Surface, never decide*: nothing
returns `allowed: false`; a red day is a smaller session with a reason and the full
session one tap away, and readiness cuts **volume harder than intensity** because the
stimulus lives in the top-end effort while the fatigue lives in the volume. *Judge
against yourself*: every physiological signal scores against a rolling 60-day personal
baseline, today excluded from its own baseline, zero SD treated as a stuck sensor.

Also worth knowing: self-report is weighted as a **peer** of HRV, not a fallback (Saw,
Main & Gastin, BJSM 2016 — subjective measures tracked load with greater sensitivity
than objective ones). Skill trees are **DAGs, not ladders**, because real progressions
converge; every standard carries form criteria and must be proved across **separate
days**; mastery is DERIVED from the attempt log, never stored — the venture-dormancy
discipline. Volume uses Israetel landmarks with two no barbell chart carries
(**scapular stabilisers** and **wrists**, what actually cap lever and hand-balancing
progress), and `at-ceiling` is kept separate from `over` so the top of the productive
range is not flagged red. Acute:chronic workload is used as a conversation, never a
gate, because the evidence is genuinely contested.

**The adapter and the UI landed 2026-08-12**, so HYBRID is now wired end to end.
`src/lib/training.ts` is the adapter and sits OUTSIDE the engine boundary by design: if
the database changes shape, it changes and the 77 engine tests do not. It maps
`health_days` → `Reading[]` (rmssd→hrv, source `health_connect`→wearable,
`samsung`→import, `manual`→self, an unknown source to the MORE discounted tier), the
daily close's mood and energy → self-report readings (the only signals Jay reliably
supplies, and the literature puts them level with HRV), `workouts`+`training_sets` →
`SessionLog[]`, `skill_attempts` → `Attempt[]`, and `athlete_profile` → `AthleteProfile`
with a floor-not-a-wish default of floor/wall/bar. A null column produces NO reading —
this is where "absence is not zero" is actually enforced.

Migration `training_sets_skill_attempts_athlete_profile` (applied 2026-08-12): per-set
logs with `rir` NULL-means-unlogged, `skill_attempts` **unique on (user, node, day)** so
the separate-days rule cannot be defeated by logging twice, and a one-row profile.
`lifts` is deliberately NOT reused as the set log — its `movement` is constrained to the
Big 4 and it stays that tracker.

**`/life/health/train`** — readiness with its drivers and confidence, today's session in
block order (skill work second, before anything heavy), a logger that writes each set on
tap and creates the workout row lazily on the FIRST set, and the advisor's four channels.
Session kind comes from the season's week shape and what has not been trained in three
days, never from a weekday. **`/life/health/skills`** — the four trees as DAGs with each
rung naming what it requires, mastery DERIVED on every load, form criteria shown on the
working edge, and the test-in flow so an owned skill positions from evidence rather than
being re-climbed.

**Still waiting on one thing only: the Health Connect companion running on the phone.**
`health_days` is EMPTY, so readiness honestly returns "nothing to go on yet" — and six
integration tests cover exactly that state, because it is Jay's real state today: no
score, a full session anyway (no data is not a reason to not train), no workload ratio
rather than a division by nothing, and silence on progression rather than an invented
failure. Nutrition and mental-health engines stay deferred until the training core is
proven.

**The Samsung Health ingest path landed 2026-08-11** — stage one of two, and the
staging is the design. Samsung Health has **no consumer cloud API**; what it has is its
own export (Settings → Download personal data → a folder of CSVs). `src/lib/samsung.ts`
parses them — metadata line first, headers second, prefixed column names, `time_offset`
applied before any date is taken, per-device duplicate days resolved by MAX (two devices
counting one walk is one walk), sleep summed onto its wake date, the last weight of the
day winning, meals summing. `ImportHealth.tsx` on `/life/health` shows the parsed plan
and **nothing writes until Jay confirms** — never auto-commit, the advisor's rule. The
upsert rows carry ONLY the fields the export held (`toUpsertRows`), which is the
no-clobber guarantee: a hand-typed weight survives an import that only brought steps.
`source = 'samsung'` at last has a writer. Deliberate refusals, tested: resting HR is
never derived from raw samples (a day's minimum is not a resting rate), and rMSSD is not
invented — Samsung's export does not contain it, so readiness stays honestly waiting.
**Stage two — zero taps — is BUILT at `companion/`** (2026-08-11, same evening): a
minimal Android app reading Health Connect (which Samsung Health syncs into on-device)
and upserting `health_days` twice a day through **Jay's own Supabase session — magic
link via `thebrain://auth` deep link, refresh token in EncryptedSharedPreferences, RLS
intact, no service key anywhere**. `source = 'health_connect'`, and it is the first
writer of `rmssd` — the field the readiness band has been waiting for. Aggregation
rules mirror `samsung.ts` and are JVM-unit-tested (11 tests); compile-verified on this
machine with the `android/` app's own toolchain (Gradle 8.9 · AGP 8.6.1 · Kotlin
2.0.20); **never yet run on a phone — that first run is the remaining verification**,
and `companion/README.md` carries the one-time setup, including the `thebrain://auth`
Supabase redirect-URL entry only Jay can add. The `android/` directory remains an
UNRELATED older standalone app (local Room DB, no Supabase) — do not mistake one for
the other.

**Division months + the exit-gate watchtower rule landed 2026-08-11.** Every division
dashboard carries a "This month" panel capturing the three numbers a division is judged
by — revenue, costs, hours (monthly, not per-week) — written on blur into
`ventures.meta.months["YYYY-MM"]`, the decision-5 pattern (`journal.meta.hours` for
ventures; no migration). `readVentureMonths` validates the jsonb; `profitPerHour` returns
null unless all three figures exist — a month with unknown costs shows £—/hr, never a
number built on a shrug. The watchtower rule (`lowProfitRun`, `LOW_PROFIT_FLOOR = 5`,
`LOW_PROFIT_RUN = 3`): three consecutive COMPLETE months under £5/hr on an active
division raises `lowprofit` — "the exit question is live" (the Division OS §8 exit gate,
stored in `ventures.plan` for A to Z Traderz). The current month is never judged (it is
part-way through), a missing month ends the run (recorded evidence only, the
`obstacleTally` discipline), and a shelved division is never asked — it already left.

**The maintenance-cost pass landed 2026-08-11** — five features from the improvement
research (`claude/` doc, evidence-led), all read-side or one-tap, no migration needed:

- **`actual_min` capture.** Marking a task done (Focus, Planner) asks "how long?" —
  chips bracket the estimate (half · as planned · 1.5× · 2×, `actualOptions()`), one tap
  writes, skip writes NULL. Reopening clears `actual_min` — a partial figure would poison
  the multiplier. This is the capture path `calibration()` was waiting for.
- **Dormancy** (`isDormant`/`splitDormant`, `DORMANT_AFTER_DAYS = 30`). Open work
  untouched 30 days leaves the counts, focus queue and default lanes — derived at read
  time, nothing written, nothing deleted. Four rules: only `open` sleeps (started work is
  touched by definition — `tasks` has no `updated_at`); **a task with a `due_date` never
  sleeps** (due is a fact about the world, which is also why the watchtower needs no
  check); a future/recent `do_date` keeps it awake; a row without `created_at` cannot be
  hidden (fails closed, §A7). Dashboard shows "N dormant" honestly; the Planner keeps
  them behind a `Dormant · N` chip. Waking is mechanical: Start it, schedule it, or give
  it a deadline.
- **Rollover in the daily close** (`leftovers()`, `Rollover.tsx` on `/checkin`). Open
  tasks with `do_date <= today` are each offered three one-tap exits — tomorrow, back to
  pool, dropped — oldest slip first. Rolling clears the time slot (the slot belonged to a
  day that is over). Nudge, never gate: unsettled tasks are simply offered again.
- **Energy** (`cycleEnergy`/`byEnergy`). The column the schema always carried is finally
  read and written: pool cards on `/day` tag in one tap (low → medium → deep → off), and
  filter chips match work to state. An untagged task passes every filter — tagging is a
  ceiling, never a gate — and the filter row only appears once tagging has started.
- **Seeding** (`seedSuggestions()` in `diagnostics.ts`, `SeededTasks.tsx` on `/planner`).
  The diagnostic finish screen's offer made standing: every completed run's text answers
  are offered as High tasks, one tap each, across all runs. Only the latest run per
  subject-and-kind speaks; a dismissal is durable in the run's `meta`
  (`dismissed_suggestions`); an exact-title task existing is the dedup — creating the
  task satisfies the suggestion, no bookkeeping table.

**The day planner landed 2026-08-11** — `/day`, the reworked `/week`, and `/week/print`.
`tasks.duration_min` and `tasks.actual_min` (both nullable, both refusing zero — the
migration was applied to the live project before the code landed; do not re-apply).
Dropping a task on a slot writes `meta.time`, the exact field the calendar sync already
reads, so a slot chosen here leaves as a timed event through the sync that exists — no
second source of truth. Tap-then-tap is primary (HTML5 drag does not fire on touch);
drag is the enhancement. Clashes draw side by side in lanes, outlined, never resolved.
The capacity meter stops at 65% of the visible day; once eight finished tasks carry both
duration numbers, `calibration()` shows the personal multiplier beside the estimate,
never substituted for it. `/week` shows five priorities per machine, LIFE and EMPIRE
side by side. `/week/print` is browser print-to-PDF over live data — hour rows as the
spine, unslotted work listed under its day rather than dropped, colour never
load-bearing.

**The diagnostic module landed 2026-08-11** at `/diagnose` — the cloud session's third patch,
ported onto `1eec0a5` (PR #7 rebuilt patches 1–2 from the spec; this one arrived as `git am`).
One picker over the 17 eligible ventures and the 8 life areas (MAINFRAME excluded — a pointer,
never a subject), worst-first once scored, the two worst carrying a deep-dive nudge. Triage is
ten questions with pure-CSS hover hints; the run row is created on the first answer, every
answer writes on tap into `diagnostic_runs.answers` jsonb, skip writes nothing, reopening
resumes. The health score is arithmetic — five equal signals, skipped signals excluded, basis
always shown ("62 · 4 of 5 signals"); hours are deliberately unscored so hard work can never
mask a sick venture. Venture triages fold onto `ventures.health`. The finish screen offers
text answers back as High tasks — one tap each, never automatic. The `diagnostic_runs`
migration (RLS owner-only) is applied to the live project; **do not re-apply it**. Nav carries
Diagnose in brain + empire, desk job, no phone slot.

**Partly checked in a browser, 2026-08-10 — and the boundary matters.**

A 390×844 Chromium sweep did run over the v2 components, rendered with realistic
fixture data through a temporary harness route, across **six grounds** (paper and
dark × brain, life and empire). What it established:

- **No horizontal page overflow in any of the six.** `scrollWidth − clientWidth` is
  0 everywhere.
- **Exactly five phone-bar items in every mode**, the grid rule holding.
- **The two machines are real at runtime, not just in the stylesheet:** brain and
  life render `--radius 13px · --pad 18px · Source Serif`, EMPIRE renders
  `5px · 13px · IBM Plex Mono` with the cyan accent and the graphite ground — in
  BOTH themes, which is the whole of decision 11.
- **Priority is shape:** the three `.prio` bars measure 4px / 2px / 1px live.
- Every element was checked against its OWN box, per §A7 rule 2, not just the page.

**Re-swept 2026-08-11 over the v2 components**, same rig, same six grounds, driven through
`puppeteer-core` against the pre-installed Chromium with a throwaway `(app)/sweep` harness so
the components wore the **real** layout rather than a copy of it. All six grounds now report
`scrollWidth − clientWidth` of **0**, exactly five phone-bar items, and the two machines live:
brain/life at `13px · 18px · Source Serif` on the theme's own ground, EMPIRE at
`5px · 13px · IBM Plex Mono` with `#3ac9e0` on graphite — **in the paper theme as well as
dark**, which is the whole of decision 11. With the on-deck drawer open the three `.prio` bars
measure **4px / 2px / 1px**, and their colour comes from `currentColor` — the same 4px bar
renders indigo on a LIFE row and cyan on an EMPIRE one, so width carries priority and hue
carries system, with neither borrowing the other's channel.

That sweep found one real defect, now fixed. **The occasions row overflowed the page by 15px,
and `min-w-0` on the truncating name did not prevent it.** `truncate` sets
`white-space: nowrap`, and a nowrap child still contributes its whole unbroken string to its
row's *min-content* — so the row's min-content was the full name plus the date and the
`w-[4.5rem]` day count, about 347px. That row is a grid item of its `ul`, and a grid item
defaults to `min-width: auto`, so the track could not shrink below it and the panel pushed the
page sideways. The fix is `min-w-0` on the **row**, not the text: capping the name's used size
does nothing about the row's contribution to the track. **The tell is the arithmetic** — page
overflow was 15px in paper and 5px in EMPIRE, a difference of exactly 10px, which is
`2 × (18 − 13)`, the two themes' `--pad`. A defect that scales with a token is a container
problem, not a content one.

**A second pass over Week, Planner and Calendar found two more, and the second one was
never a phone bug at all.** Those three are client components taking props, so they could be
swept for real rather than reasoned about.

- **Calendar's links panel overflowed by 232px at 390.** Identical cause to the occasions
  row, and instructive because `min-w-0` was *already* on the panel above it and on the task
  title below it. Neither helps. The row between them is the grid item, so the row is where
  it belongs.
- **The desktop nav never fitted its own container, at any width.** In `brain` mode the bar
  carries twelve items; with the brand, mode switch, theme toggle and sign-out that is
  **1221px of header inside a box capped at `max-w-[1200px]`**. It was revealed at `lg`
  (1024px), where it pushed the page **197px** sideways — and 121px at 1100, and 21px even
  at 1200. Above ~1240 the page stopped overflowing only because the spill landed in the
  outer margin, which is why it had never been noticed. `empire` mode fitted (five items);
  `life` sat exactly on the 1200 line. So the comment in the layout claiming "the full nav
  needs 1024px" had never been measured, and was wrong by about 200px.

  Fixed by moving the whole shell to **`xl` (1280px)** and taking each nav item from
  `px-2.5` to `px-2`, which brought the then-twelve items to 1173 inside the 1200 box.
  **Remeasured at the merge (2026-08-11 evening): Diagnose had joined the bar as a
  thirteenth item (74px), putting the header back over by ~25px — canvas-measured against
  the real Public Sans. `px-1.5` brings thirteen to ~1173 with ~27px of room.** A
  fourteenth item means measuring again, and at that point the honest fix is a shorter
  label or fewer brain items, not another padding shave. **The `xl` trade-off is
  deliberate and worth knowing: between 1024 and 1279 — iPad landscape, a 1100px laptop
  window — navigation is the five-column bottom bar rather than the top nav.** A working
  bottom bar beats a top nav that pushes the page sideways, and the alternative (dropping
  items from `brain` mode) is a decision about which views matter, not a layout fix.

  It also exposed a third thing: **sign-out was the only header child without `shrink-0`**,
  so it absorbed the entire squeeze — 74px wide and **67px tall inside a 56px header**,
  wrapping to three lines. Now `shrink-0` + `whitespace-nowrap`.

`tests/v2.test.ts` reads `layout.tsx` and holds all five `xl:` breakpoints in step, because
if the phone bar hides before the top nav appears there is a width with **no navigation at
all**, and if `main` drops `pb-24` early the fixed bar covers the last row. No test of
`navForMode` can see any of that — the same lesson `stage4.test.ts` records about the mode
selectors.

Method note worth keeping: the page-level number named the symptom and nothing else — 73
elements reported "past the edge" and all but one were simply inheriting a container that was
already too wide. What located the cause was cloning each panel into a fixed-width box and
squeezing it to 250px until only one panel still overflowed, then reading `grid-template-columns`
on it: `346.641px` inside a 250px box is a track that has refused to shrink, and that is the
whole diagnosis. Measure intrinsic sizing, don't reason about it.

The earlier 2026-08-10 sweep found one real defect, also fixed: **the phone-bar label
overflowed its column.**
`Opportunities` rendered 2px wider than its fifth of the bar with `overflow: visible`,
so it leaned on its neighbours in EMPIRE mode. Cause is the same one §A7 rule 1 is
about — a grid child defaults to `min-width: auto`, so it refuses to shrink. Fixed
with `min-w-0` + `truncate`; the re-run shows no unclipped overflow anywhere.

**What this sweep did NOT do, and cannot from a sandboxed session:** it never
rendered a signed-in page against real data. This environment's egress policy
blocks both `qttroyuajpyelfrbxzzt.supabase.co` and `*.vercel.app` — the local
server logged `Host not in allowlist: qttroyuajpyelfrbxzzt.supabase.co` — so no
session can be established and no page can load a row. Composition, empty states,
and anything depending on real row counts are still unverified. To finish the job,
allow those two hosts in the environment's network egress settings, or run the
sweep from a machine that can reach them.

**Phone is checked at a real 390×844, not by eye.** The claude-in-chrome tab renders at a
fixed ~1526px viewport that `resize_window` cannot change, so phone work has to be driven
through headless Edge with `puppeteer-core` — install it *outside* the repo. A device sweep
on 2026-08-06 put all sixteen signed-in routes through it: no horizontal overflow anywhere,
the phone bar exactly five items on every page (the five-column grid rule, §A5), the top nav
correctly absent below 1024px. It found two things, both since fixed and described under
"Two rules the layout has to keep" below.

**The core loop was walked end to end on 2026-08-06**, against the live database, as one
continuous journey rather than page by page: capture a thought → it appears in the inbox and
moves the badge → triage it into a task with an area → the Kanban moves it `open → doing` →
`/week` gives it a `do_date` → `/calendar` shows it on that day with the not-yet-in-Google
dot → `/dashboard` lists it under Today's three → the advisor's brief opens with it. Marking
it done struck it through on the calendar without giving up its slot, which is the behaviour
the legend promises. Two things worth recording because they are the discipline holding:
scheduling a day never wrote a `due_date`, and triage marked the inbox row `routed` rather
than deleting it, so the capture survives its own routing. Every test row was removed
afterwards; the database is back to 0 tasks, 0 habit logs and 8 open inbox items.

That pass found two real bugs, both now fixed:

- **`/dashboard` still advertised the advisor as "Phase 7 · not wired yet"** a day after it
  shipped. Harmless-looking, and exactly the kind of lie §0's last bullet is about.
- **The nav could render every item from every mode at once.** `data-mode` went missing from
  `<html>` after a client navigation, and both halves of the mechanism failed open: the CSS
  keyed only on `:root[data-mode=…]`, so no rule matched, and `ModeSwitch` only *read* the
  attribute on mount instead of re-applying it the way `ThemeToggle` always has for the
  palette. Seventeen items in a bar built for eight pushed the page sideways. Both halves
  fixed — the stylesheet now treats a missing attribute as `brain` (§A7) and the switch
  re-stamps it. **`tests/stage4.test.ts` now reads `globals.css` and asserts the fail-closed
  selectors are present**, because every existing test passed while the bar was visibly
  broken: the nav obeys a stylesheet, so a test of `navForMode` alone can never see this.

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
| **THE BRAIN** — the command centre at `/dashboard` | ✅ sidebar (Systems / Workspace / Arms / Plan / Pinned), hero, cross-system KPI strip, LIFE_OS + EMPIRE_OS summary panels, pick-three Today, and the advisor panel linking to `/advisor` |
| **LIFE_OS** — the personal dashboard at `/life` | ✅ the 8 life areas worst-first with the score/status/focus editor, area status, life-scoped KPIs, training streak, **the six daily habits with one-tap ticks** |
| **EMPIRE_OS** — the CEO dashboard at `/empire` | ✅ KPIs, divisions, week priorities, four-horizon goals, build progress, the 5 empire areas with the same editor, vision footer |
| Capture, Inbox/Triage, Planner (Kanban), This Week | ✅ in `src/app/(app)/` |
| Goals + Projects UI (Phase 2) | ✅ `/goals` — the cascade, stated vs derived progress |
| Branch pages for unbuilt views | ✅ `(app)/[slug]` + `src/lib/placeholders.ts` — each says what it will be, links to where it already lives in the system, and carries its reference shelf. Delete a row when its view gets built. **The 17 divisions left the registry on 2026-08-06** when their cockpits shipped; they live in `DIVISION_BRANCHES`/`BUILT_BRANCHES` now and `[slug]` forwards the old address |
| **The reference library** at `/library` | ✅ `src/lib/references.ts` — curated UK-focused shelves per pillar and per branch (researched 2026-08-01), surfaced on pillar pages, branch pages and `/library`. Integrity-tested: every seeded pillar has a shelf, every venture maps to a branch, https-only, no orphan keys |
| Debts + payment plans | ✅ `/life/debts` — creditors, plans, honest partial total |
| Vehicles | ✅ `/life/vehicles` — tax/MOT/insurance/service, worst-first |
| **The principle library** at `/library/principles` | ✅ the 10 collected checklists grouped by area, searchable by tag and full text. His own marks — `jay_marked` / `jay_circled` / `jay_handwritten` — render as a block above the book's text, the points he flagged are flagged in the list, and the words he circled are drawn circled where they appear. **Never surfaced unasked** |
| **The creed** | ✅ `src/lib/creed.ts` — his three lines, one per day, deterministic by date exactly as `gita.ts` is, shown beside the verse on `/dashboard` and in full at the head of `/library/principles`. Supabase is the source; the constant is the fallback |
| **Hour purpose** | ✅ on `/week` — the five labels he circled over 06:00–22:00, stored in `journal.meta.hours`. States assigned vs unassigned and splits the week by label. Does not nag |
| **Weekly review + obstacles** | ✅ `/reviews` — four questions, the fourth being what got in the way (his three circled defaults + free text) in `reviews.meta.obstacles`. The recurring-obstacle tally **stays silent below three reviews** |
| Daily habits | ✅ `Habits.tsx` on `/life` — one tap, idempotent, untickable, 7-day dots and streak on the row |
| **The mode switch** | ✅ `ModeScript` + `ModeSwitch` + `src/lib/nav.ts` — two buttons in the top bar, `brain` neutral, accent + nav + dashboard all follow. Flash-free; nav filtered in CSS |
| **Division onboarding** | ✅ `/empire/[id]/onboard` — seven questions per division, resumable and partial, every answer saved as it is given. Nothing is required and skipping writes NULL. `Onboard.tsx` + `ventureOnboarding` in `logic.ts` |
| **The division dashboards** | ✅ `/empire/[id]` — one page per division: stage on the path to revenue, budget against spend, task completion, its projects, tasks and goals, the plan, and the researched profile marked as researched. Resolves a uuid **or** a name-derived slug |
| **The calendar** | ✅ `/calendar` — two-way Google sync (§A3 decision 8). Month grid from 640px, **an agenda below it** (`monthAgenda` — the same days as a list, because seven readable columns need ~560px and a month that hides Saturday is not a month), conflicts panel, connect/disconnect, manual "Sync now". **Needs three environment variables before it can connect** — the page says which, and says so honestly rather than looking broken |
| **The advisor** | ✅ `/advisor` — the assembled morning brief (no model, no key), ask-your-notes with numbered sources and a grounding check, and a review drafted from the week's evidence. **Search works without an API key; the written answer needs one** |
| **Two horizon scales** | ✅ LIFE month/6mo/annual/5yr/10yr on `/life`, EMPIRE quarter/year/5yr/20yr unchanged on `/empire` (§A3 2a) |
| **The bucket list** | ✅ `BucketList.tsx` on `/life` — `goals.status = 'someday'`, add in one box, promote in one field (§A3 2b) |
| Paper theme + dark toggle | ✅ both dashboards checked in both, and at 390px |
| **Palette B · two machines** | ✅ `globals.css` — EMPIRE replaces the ground in both themes; four colour channels; priority as shape. `tests/palette.test.ts` measures ΔE and dichromat separation across all four grounds rather than trusting the values |
| **Four dashboard tabs** | ✅ `/dashboard?tab=` — Now · Attention · Systems · Trend, one question each |
| **Focus · 3 + 2** | ✅ `Focus.tsx` — three visible, two on deck behind a closed drawer. Same ordering as `pickThree` (both call `rankForToday`), and `todayProgress` deliberately ignores the drawer |
| **The daily close** | ✅ `/checkin` — floor of two taps, ceiling of five prompts, weekly-rotating gratitude, week-counting reflection streak |
| **Dash-is-the-input** | ✅ `InlineValue.tsx` + `src/lib/inline.ts` allowlist + the "Not yet known" panel on `/life` gathering every missing figure into one tappable list |
| **People** | ✅ `/life/people` — Dunbar-tier cadences, watchtower capped at three, occasions at 60 days, one-tap idempotent contact log |
| **Money** | ✅ `/life/money` — four tabs, avalanche/snowball priced, per-debt thermometers, monthly one-question balance update |
| **Health** | ✅ `/life/health` — readiness band on his own baseline, load spike detector, Big 4, nutrition ladder |
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
/(app)/dashboard       THE BRAIN — the command centre, in FOUR TABS off `?tab=`:
                       now (what am I doing next) · attention (what is going
                       wrong) · systems (how are LIFE and EMPIRE) · trend (am I
                       getting better). A tab may only exist if it answers a
                       question the other three cannot. The tab is a URL
                       parameter, not state, so the page stays a Server
                       Component and every tab is an address. Anything
                       unrecognised falls back to `now`
/(app)/checkin         the daily close — mood and energy as the floor, then
                       wins · friction · gratitude · tomorrow · one area. Writes
                       on tap; a skip records the skip and leaves the answer
                       NULL. The reflection streak counts WEEKS, not days
/(app)/life/money      Money & Security in four tabs off `?tab=`: debt · worth ·
                       cashflow · buffer, with `?strategy=snowball` pricing the
                       alternative ordering in pounds and months
/(app)/life/health/train
                       today's session, assembled by HYBRID: readiness with
                       drivers and confidence, the plan in block order,
                       a set-by-set logger (writes on tap; the workout row
                       is created by the FIRST set, so opening and walking
                       away leaves nothing), and the advisor's four channels
/(app)/life/health/skills
                       the four trees as DAGs — each rung names what it
                       requires. Mastery derived from skill_attempts on
                       every load, form criteria shown on the working edge,
                       and a test-in flow so an owned skill positions from
                       evidence instead of being re-climbed
/(app)/life/health     readiness band · load spike detector · the Big 4 ·
                       the nutrition ladder
/(app)/life/food       the meal library: fifty meals, protein first, no beef
                       in any recipe. Filters compose (category · under 25
                       min · batchable · 40g+ · search down to ingredient
                       level); the star outranks the sort; "Cooked it" is
                       one tap, once per day, and builds times_cooked —
                       the honest answer to "what do we actually eat?"
                       THE WEEK PLAN (hybrid, Jay's spec 2026-08-12): "+
                       This week" pools a meal in one tap; pinning it to a
                       day and slot (Mon–Sun × breakfast/lunch/dinner) is
                       optional, always — an unpinned pick is a decision to
                       stay flexible, not an unfinished plan. Lives in
                       meals.meta.plan keyed by the Monday (decision-5
                       pattern, no migration); readPlan validates the
                       jsonb, half a pin is no pin, last week's plan simply
                       stops counting. THE SHOPPING LIST is derived from
                       the pool, never typed: same item + same unit merge
                       (700g+600g lamb mince = 1.3kg), different units
                       never merge (no conversion by guesswork), a meal
                       planned twice wants its ingredients twice, grouped
                       by shop section (sectionOf keyword rules, Cupboard
                       the honest default), tick-off lives in localStorage
                       per week (trolley state, not records), and Copy
                       emits the grouped plain-text list.
/(app)/life/people     cadence watchtower (at most three) · occasions strip ·
                       the roster with one-tap tiers and contact logging
/(app)/life            LIFE_OS — the 8 personal areas, scores, habits (#habits),
                       the life horizon scale, and the bucket list
/(app)/empire          EMPIRE_OS — the CEO dashboard, the 5 business areas, and
                       the honest "N of 17 divisions onboarded" count
/(app)/empire/[id]     one division's own dashboard. `[id]` is a uuid OR the
                       name-derived slug, so /empire/kathleen-st and the uuid
                       both answer and a rename moves the page with it.
                       MAINFRAME never resolves — it is a pointer row (§A1).
                       A division with nothing but a name and a line shows the
                       questionnaire invitation, not an empty dashboard
/(app)/empire/[id]/onboard
                       the seven-question division questionnaire, plus the
                       researched compliance questions for the four divisions
                       carrying a `profile`. A "no" or "not sure" there creates
                       an INBOX item, never a task
/(app)/goals           goals → projects, with unattached projects listed separately
/(app)/planner         Kanban
/(app)/day             the day planner: tasks with durations dropped on hour
                       slots (writes meta.time — the field the calendar sync
                       reads), clash lanes, the 65% capacity meter, and the
                       calibration multiplier once 8 finished tasks carry
                       both duration_min and actual_min
/(app)/week            7-day scheduler + hour purpose (journal.meta.hours);
                       five priorities per machine, LIFE and EMPIRE side by side
/(app)/week/print      the printable week — browser print-to-PDF over live
                       data, hour rows as the spine, unslotted work listed
                       under its day rather than dropped
/(app)/calendar        two-way Google Calendar sync: the month, the connection,
                       and any conflict waiting on a decision. Writes only ever
                       to THE BRAIN's own calendar (§A3 decision 8). The month
                       is a grid from 640px and an agenda below it — same days,
                       same tasks, both built from the same anchor
/api/calendar/connect      → Google's consent screen (sets the state cookie)
/api/calendar/callback     ← Google; trades the code, finds/creates the calendar
/api/calendar/sync         POST, one two-way pass
/api/calendar/resolve      POST, settles ONE conflict the way he chose
/api/calendar/disconnect   POST, revokes and forgets. Touches nothing in Google
/(app)/diagnose        the diagnostic module: one picker over the 17 eligible
                       ventures and the 8 life areas, worst-first once scored.
                       MAINFRAME never appears (§A1 — a pointer, never a subject)
/(app)/diagnose/[type]/[id]
                       one triage or deep dive. `[type]` is venture|area; the run
                       writes on tap into diagnostic_runs.answers and resumes at
                       the first unanswered question
/(app)/advisor         the advisor (§A3 decision 6): the morning brief assembled
                       from his own data, ask-anything over the vault with
                       citations, and a weekly-review draft. Reads only
/api/advisor/ask           POST, retrieve → answer → grounding check
/api/advisor/review        POST, evidence → draft. Saves nothing
/(app)/reviews         the weekly review + "what got in the way" + the obstacle tally
/(app)/reviews/quarterly
                       the quarterly reset (decision 7's hour): the quarter's
                       evidence assembled first — never generated — then
                       wins · friction · a 13-area rescore · one focus per
                       system. Resumable; closing it is explicit and records
                       itself as a finish
/(app)/capture         one-box capture (PWA start_url)
/(app)/inbox           triage
/(app)/life/debts      the creditor detail — rates, references, payment days.
                       Reached from the Money page's Debt tab
/(app)/life/vehicles   tax · MOT · insurance · service, worst-first
/(app)/pillar/[id]     area detail + its reference shelf, back-links to its system
/(app)/library         the reference library — every curated shelf in one place
/(app)/library/principles
                       the principle library + the creed. A destination, never a
                       notification — nothing here appears on the dashboard
/(app)/[slug]          branch pages for views not built yet: what the view will
                       be, its strings into the system, and its reference shelf
                       (src/lib/placeholders.ts + src/lib/references.ts).
                       Resolution order: retired-slug alias → a branch whose
                       view is built (redirect to it, which is how every
                       /a-to-z-traderz style link reaches /empire/<slug>) →
                       registry row → the ventures table → 404.
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
- **Two rules the layout has to keep, both learned the hard way on 2026-08-06:**

  1. **`flex-1` is not "wrap when there is no room" — it is the opposite.** A flex child
     with `flex-1 min-w-0` beside a `shrink-0` sibling never wraps; it surrenders width and
     keeps going. The dashboard hero did exactly that, leaving its text about 165px at
     390px, so the eyebrow ran to five lines and the greeting to three. When a block should
     get its own row on a phone, say so — `basis-full sm:basis-0 sm:flex-1` — rather than
     hoping `flex-wrap` on the parent will do it.
  2. **A page that does not scroll sideways is not the same as a page that fits.**
     `overflow-x-auto` contains overflow rather than removing it, so a page-level check
     reports clean while content sits off-screen inside a box. The month grid was doing
     this: `min-w-[560px]` in a 316px container showed Monday to Thursday and put the
     weekend behind a swipe. When wide content cannot fit, decide what the small screen
     gets instead — the calendar now has `monthAgenda` — and only fall back to a scroll
     container when the wide thing genuinely is the only honest view. Checking overflow
     means checking the container, not just `document.documentElement`.
  3. **`truncate` does not make a row shrinkable — it makes the row rigid.** Learned
     2026-08-11. `truncate` is `white-space: nowrap`, and a nowrap child contributes its
     entire unbroken string to its parent's **min-content**. Put that row in a grid or flex
     parent, where items default to `min-width: auto`, and the track cannot shrink below the
     full string however narrow the screen gets. `min-w-0` on the text itself does not help:
     it caps that element's *used* size, not the row's contribution to the track. **The
     `min-w-0` belongs on the row**, beside the `truncate`, every time. Both existing uses of
     this pattern in the layout and in `People.tsx` needed it.

- **CSS that hides things must fail closed.** The nav is filtered by hiding what does *not*
  belong to the current mode, so anything the selectors fail to match stays visible. A rule
  keyed only on `:root[data-mode="…"]` therefore breaks *open* the moment the attribute is
  missing — which is how seventeen nav items once rendered at once in production. Every such
  rule carries a `:root:not([data-mode])` partner treating absence as `brain`, the neutral
  position, and `tests/stage4.test.ts` reads `globals.css` to keep them there. The same
  reasoning applies to any future attribute-driven hiding: decide what a missing attribute
  means and write that case down, rather than letting "no match" mean "show everything".
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
- **A branch that gets built leaves `PLACEHOLDERS` in the same commit.** It moves to
  `BUILT_BRANCHES`, which keeps its name and its reference shelf and records where its view
  actually lives — `/reviews` for reviews, `/empire/<slug>` for every division.
  `BRANCH_ALIASES` is the other job: it retires a *slug* so an old link still lands, as
  `vehicles` and `a-to-z-trailerz` do. Both are integrity-tested, so a slug can never be
  "built" and "not built yet" at once.
- **Anything holding a secret imports `server-only`.** `src/lib/google.ts` and
  `calendar-server.ts` both do. It turns "this accidentally got imported by a Client
  Component" from a shipped client secret into a build error. The corollary is that such a
  module cannot be unit-tested, so the parts worth testing are extracted out of it:
  `token-crypto.ts` (the encryption round trip) and `google-oauth.ts` (the consent URL) are
  plain modules with tests, and `google.ts` just calls them.
- **One slug rule, in one place.** `slugifyName` in `logic.ts` is the implementation;
  `ventureSlug` and `divisionHref` in `references.ts` are the names the empire calls it by,
  and `DIVISION_NAMES` derives every division's slug and href from its name. Nothing is
  hand-mapped, because the hand-map broke once already when "A to Z Trailerz" was renamed.

## A8. Build order & open items

Phases: 0 auth/RLS/PWA/areas ✅ · 1 Inbox+Capture+Planner+Week ✅ · 2 Goals + Projects ✅
· 2.5 the two dashboards (JAY_OS `/dashboard` + EMPIRE_OS `/empire`) ✅
· **3 Notes + links + backlinks ← next** (the read side landed early with the principle
library; what remains is writing notes, the `links` table and backlinks)
· 4 LIFE_OS — habits ✅, **journal ✅** (the daily close writes it), **people ✅**
(`/life/people`), **money ✅** (`/life/money`), **health ✅** (`/life/health`); metrics
still to build · 5 EMPIRE_OS — **division onboarding + the division dashboards ✅**
(Stage 4 · Phase C, 2026-08-06); assets, investments and opportunities still to build
· 6 Review rituals — the weekly one ✅ at `/reviews`, **the daily two-minute one ✅ at
`/checkin`**, **the quarterly reset ✅ at `/reviews/quarterly` (2026-08-12)** — all three rituals built
· **7 AI layer ✅ built 2026-08-06** at `/advisor` (§A3 decision 6).
· **Calendar (decision 8) ✅ built 2026-08-06** at `/calendar`, waiting only on credentials.

Open items:

1. ~~Capture the live schema into the repo.~~ **Done, 2026-08-13.** `supabase/schema.sql`
   holds the end state (44 tables, every constraint, index, policy and function) and
   `supabase/migrations/` holds all **22** applied migrations, one file each, named to match
   `schema_migrations` exactly. 21 are byte-exact captures of the stored SQL — comments and
   all, which is most of their value — verified by character count against the source. The
   project can now be rebuilt from this repo from nothing. **What it does NOT buy is a
   rollback:** the `rollback` column is empty for all 22, so reversing anything means writing
   the reverse by hand. See `supabase/README.md`.
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
   one is built at `/reviews`, the daily 2-minute one at `/checkin` (2026-08-10), and the
   quarterly hour at `/reviews/quarterly` (2026-08-12): the quarter's evidence assembled
   first (finishes, weekly-review rate, obstacle tally, seasons spanned, score deltas
   against the LAST quarterly snapshot, closeable debt, keystone days), then three prose
   questions + a 13-area rescore (dual-writing `pillars.score` and the review's
   `pillar_scores` snapshot, the daily close's pattern), every answer writing on tap,
   resumable across evenings. Closing the quarter is an explicit act that stamps
   `completed_at` and records itself as a finish — a closed quarter IS something that
   visibly finished. All three rituals now exist; monthly/annual stay deliberately absent.
6. **No ESLint config.** v1.2 ships none, and `next lint` is deprecated and prompts
   interactively. `npx tsc --noEmit` is the current gate and is clean. Add a flat
   `eslint.config.mjs` when convenient.
7. **`/dashboard` sidebar views are placeholders.** Every route in `src/lib/placeholders.ts`
   renders an honest "not built yet" page. When one gets built, delete its registry row in the
   same commit — `reviews` left the registry this way on 2026-08-05, and all 17 divisions
   left it on 2026-08-06 when `/empire/[id]` shipped.

   **A placeholder can also leave by being deleted, and four did on 2026-08-12** (LIFE_OS v2,
   step 1): Personal, Daily Wall, Mind Map and Me. They were honest — each said what it would
   be — and they were removed anyway, because a sidebar entry that never delivers is a promise
   broken on every page load and the cost is paid by the entries that DO work: they get read
   with the same doubt. This reverses the founding note at the top of `placeholders.ts` for
   these four only; the registry keeps its job for views genuinely on the build order.
   `tests/stage3.test.ts` holds them deleted, so one can only return as a real page.
8. **The obstacle tally has no data yet.** `reviews` is empty, so `/reviews` shows its
   "stays quiet until three" state. It starts saying something after Jay's third weekly
   review — worth checking then that the sentence reads the way he wanted.
9. **Nine of the ten principles are filed under Mind & Growth**, so the library groups
   nearly all of them under one heading (Home & Admin and Money & Security have one each).
   That is honest to how they were filed rather than a bug, but refiling some of them
   would make the grouping earn its place.
10. **Nothing is onboarded yet — 0 of 17.** Every division has a name and a one-liner from
   seeding and nothing else, so every one of them currently shows the questionnaire
   invitation rather than a dashboard. That is the intended first-run state: the counter on
   `/empire` starts moving the first time Jay answers anything. Four divisions already carry
   budgets from his costing sheet, so those arrive with their figures pre-filled.
11. **The calendar needs three environment variables before it can connect, and only Jay
   can create two of them.** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` come from an
   OAuth client he makes in Google Cloud Console (enable the Calendar API, type *Web
   application*, redirect URI `<site>/api/calendar/callback` for both the live URL and
   `http://localhost:3000`). `CALENDAR_TOKEN_SECRET` is any long random string and encrypts
   the stored tokens. `/calendar` lists exactly which are missing. **Everything either side
   of the network is built and tested; the HTTP calls to Google are the one part of this
   repo that has never been executed against the real thing**, and the first connection is
   where that gets proven.
12. **Sync is manual.** A background job would have to act as him with no session, which
   means a service-role key in the deployment — a much larger blast radius than this feature
   justifies. If he wants it automatic, that trade is the conversation to have first.
13. **The advisor's answering half needs `ANTHROPIC_API_KEY`; its search half does not.**
   Without the key `/advisor` still assembles the brief and still returns ranked passages
   from the vault — only the written, cited answer and the review draft are off, and the
   page says so. Add the key from console.anthropic.com to Vercel and `.env.local`.
   **The model call has never been executed against the real API** — retrieval, citation
   checking, the brief and the evidence assembly are all tested and were exercised end to
   end against his real eleven notes, but the request to Claude itself has not run.
14. ~~Nothing from the v2 pass has been opened in a browser.~~ **Swept 2026-08-11** at
   390×844 across all six grounds — see §A5. The v2 *components* are now verified
   (composition, overflow, the two machines, priority-as-shape, the five-item bar) and one
   real defect was found and fixed. What is still unverified is anything that needs a
   signed-in page against real rows: the four dashboard tabs' own composition, the empty
   states, and every row count. Egress still blocks `*.vercel.app` and the Supabase host,
   so that half cannot be done from a sandboxed session.
15. **The health tables are empty and nothing writes `source = 'samsung'` yet.** The
   readiness band therefore says "needs 14 days of readings" and the load panel says "needs
   four weeks", which is the intended first-run state rather than a fault. Porting the
   `_parseSHealth` OCR parser from the archived prototype (§B2) is what fills them; the
   columns are already shaped for it.
16. **`debts.apr` is null on all eight creditors**, so `/life/money` shows avalanche as
   unavailable and offers snowball only. That is deliberate (§A4) — one rate on any debt
   turns the option on.
17. **`people` holds three rows.** The roster's seeding banner shows until five have
   cadences, which is the floor `rosterProgress()` measures rather than the fifteen the
   target names.
18. **Spend is read from `assets.value` and `assets` is empty**, so every division's
   "spent so far" is `£—`. That is honest rather than missing: budget-versus-spend is
   `unbudgeted`/`unspent`/`unknown` until Phase 5 builds the assets view, and a null budget
   with real spend is deliberately **not** an overspend (there is a test).
19. **Auth email runs on Supabase's built-in sender, which is throttled to roughly one
   message an hour.** It is not intended for production and it locked sign-in out on
   2026-08-10 (`over_email_send_rate_limit`). **The fix is custom SMTP** — Authentication →
   Settings → SMTP Settings, any transactional provider. DEPLOY-NOTES has the full trap,
   including how to tell a genuine failure from a link you had already used successfully.
20. **First real user data arrived 2026-08-10/11.** `tasks` went 0 → 8: seven from triaging
   the inbox (`inbox` is now 0 open, every row `routed` rather than deleted) and **one Jay
   wrote himself** on 11 Aug — the first row he has created since 5 August. Ten tables are
   still empty: `habit_logs`, `people_contacts`, `health_days`, `workouts`, `lifts`,
   `reviews`, `goals`, `projects`, `metric_readings`, and `pillars.score` on all 13. The
   empty states on those are still the only thing anybody has seen, so they remain
   load-bearing.

## A9. Commands

Run from `web/`:

```bash
npm install
# .env.local needs the two NEXT_PUBLIC_ values (gitignored; they also live in Vercel)
npm run dev                    # http://localhost:3000
npm test                       # 1232 tests — must be green before build
npm run build                  # 39 routes — green before you push
```

**Deploys are automatic: push to GitHub `main` and Vercel builds the `the-brain` project from
`web/`.** See `/DEPLOY-NOTES.md`. Push only after tests, `npx tsc --noEmit` and the build are
green, then confirm the deployment went READY and the pages render. If the URL ever changes,
update Site URL and the redirect allow-list in Supabase → Authentication → URL Configuration.

`.env.local` needs the two `NEXT_PUBLIC_` Supabase values. The calendar additionally wants
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `CALENDAR_TOKEN_SECRET`; the advisor wants
`ANTHROPIC_API_KEY`. Without any of them the pages that use them say so plainly and the rest
of the app is unaffected. Note that `.gitignore`
matches `.env*.local` — a file like `.env.local.bak` is **not** ignored, so keep backups
outside the repo.

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
