# Deploy notes — THE BRAIN

*Rewritten 2026-08-01 against the live Vercel account. The earlier version of this file
described a connector permission blocker and a `the-brain-os` project as live; both are
history, kept only in git.*

## How deploys work now

**Push to GitHub `main` and Vercel deploys automatically.** That is the whole process.

| | |
|---|---|
| Vercel project | **`the-brain`** (`prj_A6nCLIAMGIa3yfeXXACdQf4TVUgD`) |
| Root Directory | `web` · framework Next.js |
| Live URL | https://the-brain-meshman14-uxs-projects.vercel.app |
| Deploys from | GitHub `main`, every push |
| Deployment protection | off |
| Env vars | both `NEXT_PUBLIC_SUPABASE_*` set in the project |

After pushing, confirm the deployment went **READY** and the pages actually render —
a green build is not a rendered page.

## The old project — UNRESOLVED, and stranger than it looks

`the-brain-os` is the project the 2026-07-30 connector saga created. It has **no Root
Directory set**, so it builds at the repo root, finds no `app/` — the app is in `web/` —
and fails with `Couldn't find any pages or app directory`. It posts a red
`Vercel – the-brain-os` status on every commit on every branch. **No code change can fix
it**, and a permanently red check nobody trusts is worse than no check: it trains you to
ignore the one signal that might one day be real.

**As of 2026-08-10 it is still connected, after both a disconnect and a deletion were
attempted.** Five consecutive commits on PR #7 each triggered a fresh build with a new
deployment id — `295FRqcE…`, `48fcQ9Le…`, `58uP3QPm…` among them — spanning both attempts.
Do not record this as fixed again without the test below passing.

**The test, and the only one that counts:** a NEW commit carrying ONE Vercel status
instead of two. A settings page that looks saved is not evidence, and neither is a
deletion dialog that closed. Because GitHub commit statuses are immutable, every commit up
to and including `61e71e7` keeps its red mark forever — frozen history, not a live
failure. Judge the newest commit only.

**The likeliest reason both attempts missed: the project may not be in the
`meshman14-uxs-projects` team at all.** A Vercel API token scoped to that team returns
**404** for it by slug and by id, and `list_projects` for the team has never included it —
only `mainfram-4` and `the-brain`. Vercel deployment URLs carry the owner slug from when
the link was created, so the `meshman14-uxs-projects/the-brain-os` path in the status link
is not proof of where it lives now. Check the personal scope in the account switcher.

**To reach the right project reliably, do not navigate from the dashboard.** Click
**Details** on the red status in any PR: that opens the failing deployment itself, and its
project breadcrumb is by definition the project that is actually building.

| What | URL | State |
|---|---|---|
| **THE BRAIN** | https://the-brain-meshman14-uxs-projects.vercel.app | **live — the real one** |
| the-brain-os | the-brain-os-…vercel.app | **still building this repo** — see above. Not the app; never point anything at it |
| Old prototype | https://the-brain-pi.vercel.app | domain now attached to `the-brain` |
| **MAINFRAME** | https://mainfram-4.vercel.app | **live, do not touch** |

## Auth and the URL

Supabase Site URL and the redirect allow-list point at the live URL above, and a
magic-link round trip has been completed against it. If the URL ever changes, update
**both** in Supabase → Authentication → URL Configuration:

- **Site URL** → the new origin
- **Redirect URLs** → add `<new-origin>/**`

Otherwise magic links bounce to the old address.

### "I can't log in" — check which URL you are on FIRST

**This cost an afternoon on 2026-08-10 and looked exactly like broken auth.** The magic
link arrived, the link was clicked, and the app would not sign in. Nothing was wrong with
authentication at all: Supabase logged `/verify 303 login` — the link worked perfectly.

The sign-in was happening on **`the-brain-os-…vercel.app`**, the dead project's URL. Its
builds fail, so that hostname still serves whatever it last deployed successfully, months
stale, against a database that has moved on. You sign in fine and then get an old app.

Ninety-one of the ninety-four auth requests in that day's log came from that host, and
only three from the real one. So this is not a slip you make once — something was pointing
at it persistently.

**How to tell in ten seconds.** Open Supabase → Logs → Auth and read the `referer` on the
recent `/otp` and `/verify` rows. It names the host the browser was actually on. If it is
not `the-brain-meshman14-uxs-projects.vercel.app` (or `the-brain-pi.vercel.app`), the URL
is the bug and the code is fine.

**The part that makes it persistent: the PWA.** An installed progressive web app bakes its
`start_url` in at install time. Install from the wrong host once and the icon on the home
screen keeps opening the wrong app forever, no matter what you type into a browser
afterwards. Fixing the bookmark is not enough — **delete and reinstall the PWA from the
correct URL.** The session cookie is per-origin too, so expect to sign in again after
moving.

**A green deploy on `the-brain` tells you nothing about which app you are looking at.**
The way to check the live site is genuinely running the newest code is the compiled
stylesheet hash in the page source: `/_next/static/css/<hash>.css` changes whenever the CSS
changes. It went `e1488b38f14a2e40` → `ce6d45e0f2c8dad1` when v2 shipped. Same hash as
before a deploy that should have changed styling means you are on a cached or stale host.

### "Email rate limit exceeded" — the built-in sender, and the real fix

**Hit on 2026-08-10.** Requesting a magic link returns `over_email_send_rate_limit` (HTTP 429)
and no email arrives.

Supabase ships a built-in email sender so a new project works before anything is configured.
It is **explicitly not for production** and is throttled hard — on this project the two
successful sends that day were **65 minutes apart**, with three 429s in between. It is not a
60-second cooldown you can wait out, and pressing the button again while limited only confirms
the limit.

**Check before you assume you are locked out.** Supabase → Logs → Auth, and read the `/otp`
rows. A `200` means an email went out; a `429` after it means you asked again too soon. On
2026-08-10 a full round trip had already **succeeded** at 18:37:27Z — the session existed and
the 429s that followed were requests for a link that was no longer needed. Look for the most
recent `login` event before deciding the sign-in failed.

**The real fix is custom SMTP.** Supabase → Authentication → Settings → SMTP Settings, pointed
at any transactional provider (Resend's free tier is 3,000/month, which one person signing in
will never approach). The limit then becomes the provider's, and this failure mode stops
existing. Until that is configured, one mistimed request costs an hour.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://qttroyuajpyelfrbxzzt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon key — set in Vercel; for local dev put both in web/.env.local>
```

The anon key is safe in client code — RLS is what protects the data. The **service-role**
key must never appear in this repo or in any client bundle.

## Database migrations applied to the live project

`the_brain_os_v1_full_schema` · `harden_seed_pillars_search_path` ·
`planner_kanban_and_richer_areas` · `add_vehicles_pillar_thirteen_areas` ·
`empire_os_venture_stages` · `life_os_area_scores_and_debt_metric`

Never re-apply one, and never apply an old schema file over the live project.
