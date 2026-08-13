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

> **Breach, opened 12 Aug and closed 13 Aug.** LIFE_OS v2 step 1 DELETED four placeholder
> branches rather than forwarding them, so `/personal`, `/me`, `/daily-wall` and `/map` returned
> 404 for a day. All eight ghosts with a real home now forward to it — `personal`/`me` → `/life`,
> `today`/`daily-wall` → `/day`, `diary` → `/week`, `feed` → `/life/body`, `motivation` →
> `/library/principles`, `documents` → `/inbox`. Only `search` and `map` stay deleted, because
> neither had anywhere true to land.

---

## Architecture — CURRENT (13 Aug 2026)

Written to match the repo, not the plan. Where a thing is proposed rather than built, it says so.

    THE BRAIN            dashboard (4 tabs: Now · Attention · Systems · Trend)
                         Rhythm: season, capacity, finishes
                         tools: Planner, Day, Week, Calendar, Capture, Inbox,
                         Review, Advisor, Diagnose, Library, Setup
         ↑ contracts up, season context down
    LIFE_OS              Standing · Body · Money · People · Horizon   [five parents]
    EMPIRE_OS            Property · Trade · Product · Digital · Pipeline  [five parents]
                         grouped by HOW EACH DIVISION EARNS, not by category
    THE COG              daily momentum engine, behind NEXT_PUBLIC_COG
    HYBRID               training engine, wired to /life/health/train

**The EMPIRE grouping is by maintenance load, not category**, because that is the only filing
that can answer the sentence the empire exists to satisfy: *how much of this earns without me,
and how much stops the day I stop?* Placements live on `ventures.meta.parent`, confirmed by Jay
13 Aug 2026 — so a division can be refiled without a deploy. Three facts the grouping alone
could not settle ride on the rows too: `meta.proving` (A to Z Traderz, the one being proved end
to end), `meta.operated` (MAINFRAME is a platform he also runs, so the passive count names the
caveat), and `meta.pipeline` (`queue` = will start, `menu` = might, and only the first is a
promise).

**Parent page pattern:** one scrolling page, a tab bar that FILTERS it, each tab
deep-linkable as `?tab=`. Tabs narrow what is already rendered — they do not fetch. The shared
tools band is a filtered window onto the planner, never a second task list.

## The summarisation layers, and the standing risk

Four things currently summarise. This is the live architectural question, not a settled one:

    standing.ts     eight life areas, seven of them computed from source rows
    lifeos.ts       four contracts (body · money · people · rhythm) + three tests
    oneline.ts      one ranked sentence a day, or legible silence
    cog/            momentum, three priorities, one focus block, one pulse

`reports.ts` turns those into parent reports and MEASURES NOTHING ITSELF — it takes contracts
as arguments, never rows. Three tests read its source to keep it that way, because
`bodyReport` and `bodyContract` both measuring "four a week over a fortnight" is exactly the
second-copy failure rule 11 exists to prevent, and a draft did precisely that.

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
    web/src/lib/parents.ts    the parent registry and the report contract
    web/src/lib/reports.ts    contracts in, reports out — measures nothing
    web/src/lib/empire.ts     the division filing, and the earns-without-me ratio
    web/src/lib/boardserver.ts one loader for /life, /empire and the dashboard
    web/src/lib/nav.ts        the nav registry, tested for membership

## Verification, every time

    cd web
    npx tsc --noEmit
    npx vitest run          # 1307 tests as of 13 Aug 2026
    npm run build           # 49 routes (38 pages + 11 API)

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
