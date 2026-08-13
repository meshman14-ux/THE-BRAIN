# THE BRAIN — house rules

Twelve rules. Each is enforced by at least one test. Break one only by arguing it out loud.

## On honesty

**1 · Absence is not zero.**
A missing value renders as a dash, never as 0. `formatGBP(null)` returns "—". Every convenient
default lies in the flattering direction: an unknown debt makes net worth look higher, an
unrecorded outgoing makes the buffer look longer.

**2 · Never impute a missing signal as average.**
A readiness score built from one input must not look like one built from six. Average over what
is PRESENT, and report confidence separately. Below a confidence floor, return null and say why.

**3 · A score never travels without its working.**
Not "Health: 3" but "Health: 3 — trained twice in the last fortnight against your own standard
of four." A number you cannot interrogate is a number you stop believing, and the moment you
stop believing it you stop opening the page.

**4 · Staleness is a first-class fact.**
A balance typed six weeks ago is not the same as a balance. Say so. Half-lives live in
`STALE_AFTER` (`web/src/lib/lifeos.ts`).

**5 · Never accuse the system's own emptiness.**
If nothing is logged, the finding is about the logging, not about the user. This was learned by
reading empty habit logs as a behaviour problem when the habit board had simply never been
usable. Any advisor line built from an empty table is a bug.

## On authority

**6 · Surface, never decide.**
Nothing returns `allowed: false`. Conflicts are shown, not auto-resolved. Readiness scales a
plan, it does not veto one. Overriding the system is a supported path, not cheating.

**7 · Reported, never enforced.**
The system's job is to say "you have four things warm in a season that supports one", not to
pick which three to drop.

**8 · The floor never flexes.**
Seasons change what is expected of everything else. Training and the daily close survive every
season. Deadlines and people are never suppressed by a season either — the world does not care
what season it is, and a busy month is exactly when contact stops happening.

## On structure

**9 · Derived, never stored.**
Dormancy, skill mastery, finishes and area scores are computed at read time. A flag written once
and never revisited is a claim that quietly stops being true.

**10 · Truth must be free.**
A measurement that costs a manual entry will be empty when a busy season arrives. Derive
everything you can; charge a typing cost only where nothing else can speak. Any new module must
state its typing cost (`cost: "none" | "one tap" | "weekly" | "monthly"`).

**11 · Every parent always reports.**
Even a healthy one. An area that goes silent when it is fine is indistinguishable from an area
that is broken. THE BRAIN reads a small fixed contract and never the tables underneath — that is
what stops the command centre becoming a second copy of everything below it.

**12 · Never delete a route. Redirect it.**
Old links, bookmarks and reference shelves must keep landing somewhere true. A nav that promises
and does not deliver teaches the user to distrust the nav.

> **Known breach, 12 Aug 2026.** LIFE_OS v2 step 1 DELETED four placeholder branches rather than
> forwarding them, so `/personal`, `/me`, `/daily-wall` and `/map` currently 404. The parent-area
> work forwards them instead (`personal`/`me` → `/life`, `daily-wall` → `/day`), which is what
> rule 12 requires. Until that lands, this rule is aspirational in four places.

---

## Architecture — CURRENT (13 Aug 2026)

Written to match the repo, not the plan. Where a thing is proposed rather than built, it says so.

    THE BRAIN            dashboard (4 tabs: Now · Attention · Systems · Trend)
                         Rhythm: season, capacity, finishes
                         tools: Planner, Day, Week, Calendar, Capture, Inbox,
                         Review, Advisor, Diagnose, Library, Setup
         ↑ contracts up, season context down
    LIFE_OS              [FLAT, 11 nav items] Areas · Money · Health · People ·
                         Vehicles · Habits · Food · Debts · Body(—) · Horizon(—)
    EMPIRE_OS            [FLAT] divisions, dormancy split at read time
    THE COG              daily momentum engine, behind NEXT_PUBLIC_COG
    HYBRID               training engine, wired to /life/health/train

**PROPOSED, not built:** the five-parent compression of each subsystem
(`parents.ts`, `reports.ts`, `ParentShell.tsx`). LIFE_OS → Standing · Body · Money · People ·
Horizon. EMPIRE_OS → Property · Trade · Product · Digital · Pipeline, grouped by HOW EACH
DIVISION EARNS rather than by category, so the system can answer "how much of this earns
without me".

**Parent page pattern, when it lands:** one scrolling page, a tab bar that FILTERS it, each tab
deep-linkable as `?tab=`. Tabs narrow what is already rendered — they do not fetch. The shared
tools band is a filtered window onto the planner, never a second task list.

## The summarisation layers, and the standing risk

Four things currently summarise. This is the live architectural question, not a settled one:

    standing.ts     eight life areas, seven of them computed from source rows
    lifeos.ts       four contracts (body · money · people · rhythm) + three tests
    oneline.ts      one ranked sentence a day, or legible silence
    cog/            momentum, three priorities, one focus block, one pulse

A fifth (`reports.ts`) is proposed. It must CALL the four above rather than re-derive them —
`bodyReport` and `bodyContract` measuring "four a week over a fortnight" twice is exactly the
second-copy failure rule 11 exists to prevent.

## Key files

    web/src/lib/logic.ts      the large shared library — 4,733 lines, the one file
                              that cannot be reasoned about in isolation
    web/src/lib/standing.ts   the eight area scores, mostly computed
    web/src/lib/lifeos.ts     the four contracts and the three tests
    web/src/lib/oneline.ts    the ranked single line, and legible silence
    web/src/lib/season.ts     seasons, dormancy, alert suppression, annotation
    web/src/lib/finishes.ts   the failable momentum test
    web/src/lib/hybrid/       the training engine (pure; boundary enforced by test)
    web/src/lib/cog/          the momentum engine (pure; boundary enforced by test)
    web/src/lib/setup.ts      every gap in the system, ranked by what it unlocks
    web/src/lib/nav.ts        the nav registry, tested for membership

## Verification, every time

    cd web
    npx tsc --noEmit
    npx vitest run          # 1232 tests as of 13 Aug 2026
    npm run build           # 48 routes (37 pages + 11 API)

All three must pass before a commit. No exceptions.

## Handoff hazard, learned repeatedly

Cloud sessions cannot see the live schema and have now shipped the same three faults in three
separate drops. Verify before applying any patch or plan:

    tasks.priority   is TEXT ("High" | "Med" | "Low"), not a number.
                     Dividing it by 3 yields NaN and every rule still fires.
    duration_min     is the estimate column. There is no estimate_min.
    tasks.status     has five values. `doing` is OPEN, not closed.

Also: `git am` fails on this repo ("sha1 information is lacking" — the patches lack blob
ancestry). Use `git apply --reject` and hand-merge.

## The two facts about the user that drive most design decisions

**Motivated by visible completion, in a life composed of things that never complete.** Design
consequence: manufacture finish lines. Anything that can never be finished will eventually be
abandoned, however well built.

**Pushes through under load and pays later — there is no recovery phase, only a deferred bill.**
Design consequence: the system must flag the deferred cost, not just the missed task, and must
support a declared minimum mode rather than assuming recovery happens.
