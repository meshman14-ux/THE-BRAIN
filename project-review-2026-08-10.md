# Project pressure test — THE BRAIN OS — 2026-08-10

**The short version:** The system is built for a version of Jay who has already
entered his data, and that version does not exist yet. Every module shipped today
has a data prerequisite; not one of those prerequisites is met, so the app opened
right now is mostly a set of well-written messages explaining what it cannot tell
you yet. The constraint stopped being code some time ago and nobody has moved to
the constraint.

## Where things actually stand

Verified directly against the live Supabase project and git, not from the user's
account:

- **Zero rows in ten tables that matter:** tasks, goals, projects, reviews,
  habit_logs, metric_readings, health_days, workouts, lifts, people_contacts.
  Also **0 of 13** pillars scored, **0 of 8** debts with a balance, **0 of 4**
  vehicles with any date, **0 of 18** ventures onboarded.
- **The newest user-created row in the entire database is dated 5 August** — five
  days ago. It is an inbox capture.
- **8 inbox items, all still `status = 'open'`.** One is `ff` (a test). Seven are
  substantive: council tax exemptions, Rent Smart Wales registration, CIS
  registration, ringing Advantis and Marstons for balances. None triaged in five
  days.
- **Commits by day, `main`:** 3 (13 Jul) … 5 (5 Aug), 5 (6 Aug), **16 (10 Aug)**.
  Today alone added ~7,000 lines: four tables, five routes, 146 tests.
- **Sign-ins have been landing on a stale host.** The Supabase auth log shows
  **91 of 94** auth requests in the last 24h originating from
  `the-brain-os-…vercel.app`, a project whose builds fail and which therefore
  serves a months-old app. Authentication itself works (`/verify 303 login`).

## What's solid

Genuinely, and worth not re-examining:

- **The honesty discipline holds all the way down.** `formatGBP(null)` → `£—`,
  net worth as a *ceiling* while a balance is unknown, no debt-free date on
  incomplete inputs, no readiness band under 14 readings, `canAvalanche()`
  refusing to rank on rates it does not have. Every convenient default that would
  flatter has been refused. This is rare and it is the most valuable property the
  codebase has.
- **The engineering is not the problem.** 625 tests, `tsc` clean, 35 routes, RLS
  owner-only on 28 tables, a palette validated by computed ΔE and dichromat
  simulation rather than by eye. The v2 pass found and fixed a real layout defect
  and a real `-0` bug.
- **Capture works and is trusted.** It is the one surface with unprompted real
  use. That is a signal, and it is being under-read.

## Findings

### 1. Every module's floor is cheap except the ones he actually cares about

**What I'm seeing:** The zero-obligation floor is real in three modules — check-in
is two taps, nutrition is a weight and a tap, the roster is a name. But the
modules carrying the emotional weight have expensive floors that nothing in the
system reduces: Money needs eight phone calls to creditors; Health readiness needs
a wearable exporting rMSSD that is not connected and has no importer; Vehicles
needs four sets of documents; EMPIRE needs 18 × 7 questions. The debt total is the
number he is most likely to care about, and it cannot exist until eight
conversations have happened.

**Why it matters:** The floor was the design answer to "will he keep using it".
Where the floor is genuinely two taps, the answer might be yes. Where the floor is
eight phone calls, the module is decorative — and today three of the six modules
shipped are in that category. The system will look identical in a month unless
something makes the expensive floors cheaper.

**What would change my read:** One creditor balance entered. The money hub is
built to be useful at partial data ("known across 2 of 8"), so two numbers would
show whether partial actually feels useful or merely honest.

### 2. The one surface with real usage is a one-way valve, and it got nothing in v2

**What I'm seeing:** Eight captures, zero triaged, five days. The inbox is where
observed behaviour actually lives, and things go in and never come out. The v2
queue had nine items and not one of them touched triage.

**Why it matters:** Two consequences. Behavioural: the loop that is demonstrably
started is the loop left broken, so the one habit with evidence behind it dead-ends.
Financial: the untriaged items include *"Register Building + Maintenance for CIS as
a subcontractor before the next paid job — unregistered means 30% deduction"* and
*"Confirm Rent Smart Wales registration for every rented Welsh property"*. Those are
live liabilities, not notes.

**What would change my read:** Triaging the eight in one sitting. If it takes ten
minutes and feels good, triage is fine and the problem is a reminder. If it stalls,
the triage UI is the highest-leverage thing in the system and nobody has looked at
it since Phase 1.

### 3. Build velocity is decoupled from use, and today made the gap wider

**What I'm seeing:** 16 commits and ~7,000 lines today against a database that
gained zero rows. I built a health hub whose first screen says "needs 14 days of
readings", a load detector that says "needs four weeks", and a money hub that
cannot rank debts because every APR is null. All three are correct, well-tested,
and currently unable to say anything.

**Why it matters:** The build queue is self-refilling — there is always a next
module, and shipping one produces a visible artefact while entering data does not.
Nine more modules would leave the row counts exactly where they are. The honest
reading of today is that the work was good and aimed at the wrong constraint,
and I aimed it there without challenging the brief.

**What would change my read:** Seven consecutive days with any row written. That
is the only evidence that would show the system has crossed from built to used.

**The unknown that could invert all three:** if the home-screen PWA was installed
from `the-brain-os`, then every attempt to use this has opened a months-old build
against a schema that has moved on — and the empty tables would be a symptom of a
broken URL rather than of a habit that never formed. That question was asked and
not answered, so this review cannot settle it. It is cheap to settle and it should
be settled first.

## The three moves

| # | Move | What it tells you | Rough cost |
|---|------|-------------------|------------|
| 1 | Open the app on the **correct** URL, delete and reinstall the PWA from there, and confirm `/dashboard` shows four tabs | Whether the system has been unused or merely unreachable. Inverts findings 1–3 if it was the URL | 5 min |
| 2 | Triage the 8 inbox items in one sitting — and act on the CIS one | Whether the core loop survives contact. Clears a real 30% deduction risk | 20 min |
| 3 | Ring two creditors, enter two balances | Whether the money hub is useful at partial data, which is the design bet the whole honesty discipline rests on | 15 min |

Nothing new gets built until at least one of these has happened. Not because the
backlog is wrong, but because every item on it has the same prerequisite and the
prerequisite is not code.

## Questions still open

**Blocking:** Was the PWA installed from the stale host? Were the seven inbox
items written by Jay or generated by a Claude session — because if generated, the
only genuinely user-typed row in the database is `ff`, and capture has no real
usage either.

**Can wait:** Whether Samsung Health import is worth porting (it unblocks the
health floor, but only if the health module is wanted at all). Whether 18
divisions is too many to onboard, ever. Whether the quarterly review should exist
before the weekly one has run once.

---
*Based on: live Supabase row counts and inbox contents, Supabase auth logs, git
log on `main`, the v2 source, CLAUDE.md and DEPLOY-NOTES.md. Not verified: how the
app is opened day to day, who authored the inbox items, and whether any use was
attempted against the stale host — all three were asked and not answered.*

---

## Addendum, same evening — two of the three moves moved

Recorded at commit time so this document does not read as still-open work that
has since happened.

**Move 2 is done, and it produced the database's first real task data.** The
eight inbox items were triaged into **seven flat tasks** (option A: no projects,
no goals — decision 2 says the hierarchy above a task is optional, and seven real
tasks are a better first test of the planner than a tidy tree). Inbox rows were
set `status = 'routed'` with `routed_type`/`routed_id` pointing at the new task
rather than being deleted, so each capture survives its own routing. The `ff` test
row was deleted. **tasks: 0 → 7. inbox open: 8 → 0.**

**That immediately exposed a real ordering defect.** `rankForToday` puts the CIS
task first — it is the only one with `do_date = today`. The next three tie on
reason, on priority *and* on due date, so they fall through to the **alphabetical**
tie-break. "Check the empty-homes…" and "Confirm Rent Smart Wales…" take the two
remaining visible slots and **"Ring Advantis and Marstons" is pushed into the
on-deck drawer** — decided by C and R. The ordering has no way to express "this one
matters more" among items already at maximum priority sharing a date. Recommended
fix: break ties on `created_at` (oldest first) rather than on title. It costs
nothing, needs no schema change, and encodes a real signal instead of an arbitrary
one. Not yet applied.

This is the finding the review said only real data could produce, and it arrived
within minutes of there being any.

**Move 1 is half done, and the blocking question is now answered — the other way.**
The Supabase auth log for the last hour shows all five requests originating from
`the-brain-meshman14-…`, so the correct host *is* being used, and a magic-link round
trip **completed successfully on it at 18:37:27Z** (`/otp` 200 → `/verify` 303 →
`login`). So sign-in works and the URL has been corrected.

Two things that follow, and they cut in opposite directions:

- **Finding 3's escape hatch is closed.** The stale host is not the explanation for
  the empty tables. Sign-in on the correct host works; the tables are empty because
  the system has not been used. Findings 1–3 stand as written.
- **The stale deployment is still live and still holding a session.** 90 of the
  last 100 auth requests are `/user` and `/token` from `the-brain-os-…`, the most
  recent at 18:37:30Z. That is an old PWA or tab refreshing in the background. It
  will keep answering the home-screen icon until it is deleted and reinstalled from
  the correct origin.

**A new, unrelated blocker surfaced: `over_email_send_rate_limit`.** Supabase's
built-in email sender is throttled to roughly one message an hour on this project
— the two successful sends were 65 minutes apart, and three requests in between
returned 429. The built-in sender is not intended for production use. **The real
fix is custom SMTP** (Auth → Settings → SMTP Settings; any provider's free tier is
orders of magnitude above what one person signing in can consume). Until that is
configured, every mistimed "send me a link" costs an hour.

**Move 3 — two creditor balances — has not happened.** Finding 1's test is still
untaken, and it is now the only one of the three still fully open.
