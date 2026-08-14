# Project pressure test — THE BRAIN OS — 2026-08-14

**The short version:** The last review said the constraint had stopped being code. Four days
and ~48,000 lines later, the constraint is still not code — but it is no longer "he hasn't
started". The logs show he is opening the app and reading it. What he cannot reliably do is
**get in**: eighteen separate authentication failures today alone, spread across fourteen
hours. The empty tables are downstream of a broken front door, and I spent those four days
building rooms behind it.

## Where things actually stand

Verified against the live Supabase project, its auth and edge logs, the Vercel API and git —
not from anyone's account of it.

- **Build order is complete.** Phases 0–8 all shipped, `PLACEHOLDERS` is empty for the first
  time, 1510 tests, lint and `tsc` clean, 55 build entries. Since the 10 Aug review: **51
  commits, ~48,000 lines added** (10th: 16 commits, 11th: 14, 12th: 18, 13th: 7, 14th: 12).
- **The newest row in the entire database is dated 12 August.** The 13th and 14th produced 26
  commits and ~18,000 lines and **zero rows**. Those two days are Phase 3, ESLint, the SMTP
  runbook, Phase 4 metrics and Phase 5 holdings/opportunities.
- **Today's authentication log, 00:47 → 12:36:** nine `400: Invalid login credentials` on
  `/token`, nine `504: context deadline exceeded` on `/otp`, and one
  `403: Email link is invalid or has expired`. A password sign-in finally succeeded at
  **15:02:31**.
- **Two genuine browsing sessions today** — 11:31–11:47 and 15:02–15:14 — touching about
  thirty tables between them: dashboard, life, empire, divisions, diagnose, health, food, the
  vault, links, calendar, reviews, inbox. They produced **exactly one write**: a `PATCH` to
  `/rest/v1/tasks` at 15:04:17.
- **Real data did arrive between the 10th and the 12th**, and it is worth naming: 8 of 13
  areas scored (Training 2, Mind 3, Nutrition 3, Family 3 — a genuinely unflattering
  self-assessment), all four vehicles dated from gov.uk lookups, 3 journal entries, a habit
  log, a finish, a diagnostic run, and 7 more tasks. Then it stopped.
- **`debts` still has 0 of 8 balances** — the same as four days ago, and the same as at the
  first review.

### The last review's three moves, scored

| Move | Status |
|---|---|
| 1 · Correct URL, reinstall the PWA | **Half done.** `the-brain-pi.vercel.app` turns out to be a real domain of the live `the-brain` project, so browsing there is fine — that worry is closed. But the dead `the-brain-os-…` host was hit again **today at 12:36**, with an `/otp` whose `redirect_to` pointed at it. Something is still installed on it. |
| 2 · Triage the inbox | **Done**, same evening. 7 tasks created, inbox 0 open, CIS registration since marked done. |
| 3 · Ring two creditors, enter two balances | **Not done — second run.** And see finding 3. |

## What's solid

- **The honesty discipline has survived thirteen more features.** Every module built since
  the last review refuses the flattering default: metrics won't draw a trend through one
  point, holdings reports a total as a floor while any row is unvalued, the pipeline refuses
  the probability weighting every CRM applies, the win rate stays blank below five closed
  deals. Nothing has been quietly relaxed under delivery pressure. That is the property most
  likely to erode and it hasn't.
- **The engineering is genuinely not the problem, and hasn't been for two reviews.** 1510
  tests, RLS byte-identical across 44 tables, the schema and all 22 migrations now captured in
  the repo, ESLint finding a real remount bug `tsc` couldn't see.
- **The area scores are real evidence.** Eight areas scored honestly low is someone engaging
  with the thing rather than performing for it. It is the strongest usage signal in the
  database.

## Findings

### 1. The front door has been broken all day, and nobody was watching the door

**What I'm seeing:** Eighteen authentication failures today between 00:47 and 12:36 — nine
`Invalid login credentials`, nine `504 context deadline exceeded` on the magic-link endpoint,
one expired link. That is someone trying repeatedly, over fourteen hours, at 1am and again at
2am and again at 11:46 and again at 12:36.

The 504 matters specifically: `DEPLOY-NOTES.md` documents this failure as a **429 rate limit**
and says a bad key gives a **500**. `504: context deadline exceeded` is neither — it is the
built-in email sender not responding at all. So the runbook I wrote two days ago describes a
failure mode that has already been superseded, and its advice ("check the `/otp` rows for a
200") would not have diagnosed today.

**Why it matters:** Every finding in both previous reviews assumed the door worked and the
question was motivation. It didn't. This reframes four days of "he isn't entering data" into
"he could not get in to enter it", and it means the single highest-value fix available is not
a feature — it is fifteen minutes of configuration that has been sitting written-down and
unprioritised since the 13th. I wrote the runbook, filed it as "yours to do", and then shipped
two more phases on top of a system nobody could open.

**What would change my read:** Seven consecutive days with no `400` or `504` on `/auth/v1/*`.
If the failures continue after SMTP is configured, the problem is the credential rather than
the sender, and that is a different fix.

### 2. I am generating the traffic I would otherwise read as engagement

**What I'm seeing:** Today's 15:02–15:14 session is a twelve-minute tour of nearly every
route in the app, in the order they were built, ending in one write. That is the shape of
someone **inspecting a new build**, not using a system. And it follows a session on the 13th
and two days in which I shipped five features and announced each one to him.

The last review said this in the abstract — "build velocity is decoupled from use". It is now
worse and more specific: the build has started **manufacturing its own usage signal**. Thirty
table reads and one PATCH looks like activity on any dashboard you'd draw, and it is
inspection.

**Why it matters:** The 10 Aug review closed with *"Nothing new gets built until at least one
of these has happened."* Two of three happened, and then 51 commits happened anyway — and I
proposed each of them, in this session, without once putting that sentence back on the table.
The build queue self-refills and shipping produces a visible artefact within the hour;
entering a creditor balance produces nothing you can look at. That asymmetry has now beaten
the explicit instruction in a document I wrote, twice.

**What would change my read:** A week in which nothing is built and rows appear on five of the
seven days. That is the only observation that separates "the design works and the door was
shut" from "the design asks for more than anyone will give it".

### 3. Work is happening outside the system and the system never learns — with a live cost

**What I'm seeing:** Two things that only make sense together.

*"Ring Advantis and Marstons for exact balances"* is marked **`done`**. `debts` has **zero of
eight** balances recorded. Either the calls happened and the numbers never landed anywhere, or
the task was ticked to clear it. Either way the system watched its own highest-value data
point walk past it.

And the alarm that is armed and correct is going unheard. **Zafira `WF57 XWD`, status
`active`, MOT expired 2026-07-08 — thirty-seven days ago.** The TT `FN03 DFP` has been
untaxed since 2025-11-01 and MOT-expired since 2025-12-05. `/setup` ranks vehicle dates as the
only `worldPunishes` step in the system, precisely because a lapsed MOT is a fine, an invalid
policy and a car you are not allowed to drive. The data is in. The warning renders correctly.
Nobody has seen it, because seeing it requires getting in.

**Why it matters:** This is what the first two findings cost, made concrete. The system's one
genuine real-world job is running, right, and mute. Meanwhile the loop that would prove the
honesty discipline is worth its complexity — "known across 2 of 8 creditors" being *useful*
rather than merely truthful — has now gone untested across three reviews.

**What would change my read:** Two creditor balances entered, and the Zafira either dated or
SORNed. Both are small; both have been available for four days.

## The three moves

| # | Move | What it tells you | Rough cost |
|---|------|-------------------|------------|
| 1 | **Fix the door.** Configure custom SMTP (`DEPLOY-NOTES.md` has the steps), reset the password so it's known, and delete the PWA still installed on `the-brain-os-…` and reinstall from `the-brain-pi.vercel.app` | Whether four days of empty tables were a motivation problem or an access problem. Nothing else can be interpreted until this is clean | 15 min |
| 2 | **Deal with the Zafira** — book the MOT or declare it SORN | Whether the system's only world-facing alarm is worth having. It is 37 days late and costs real money today | 10 min |
| 3 | **Freeze the build for seven days.** No new features from me — only fixes to what breaks in use | Whether the design survives contact when it isn't being refreshed with new things to look at. This is the one the last review asked for and didn't get | 0, and the hardest |

Move 1 before anything else, including move 2 — the Zafira warning is already in the app and
you cannot act on what you cannot open.

## Questions still open

**Blocking:** Was the password ever knowingly set, or has the magic link been the only real
route in? (`auth.users.updated_at` moved at 16:00:51 today, after the successful 15:02
sign-in, which looks like a reset — but I can't tell a reset from a token refresh from
outside.) And which host is the home-screen icon actually on?

**Can wait:** Whether the four-day gap in writes is the door or the design — move 3 is what
answers it. Whether 18 divisions was ever an onboardable number (0 of 17 after eight days).
Whether the `metrics`-by-name lookup (open item 21) is worth a migration before anything reads
a metric in anger.

---
*Based on: live Supabase row counts and timestamps, `auth_logs` and `edge_logs` for
2026-08-14, `auth.users`, the Vercel project's domain list and latest deployment, `git log` on
`main`, `project-review-2026-08-10.md` and its addendum, `CLAUDE.md` and `DEPLOY-NOTES.md`.
Not verified: which device or host the app is opened from day to day, whether the Advantis and
Marstons calls actually happened, and whether the 12-minute session on the 14th was Jay
looking at the new build or working — the shape suggests the former but the logs cannot
distinguish them. No page in this app has ever been rendered and seen by me; egress from this
sandbox blocks both the Supabase host and `*.vercel.app`.*
