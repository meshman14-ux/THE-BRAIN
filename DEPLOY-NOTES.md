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

## The old project

`the-brain-os` still exists in the account, is failing, and was scheduled for deletion —
**it never was.** Confirmed 2026-08-10 on PR #7: it is still subscribed to this repo's
pushes and posts a `Vercel – the-brain-os` **failure** status on every commit, on `main`
and on every branch. It fails with `Couldn't find any pages or app directory`, because it
has no Root Directory set and the app lives in `web/`. **No code change can fix that**, and
a permanently red check nobody trusts is worse than no check — delete the project, or
disconnect its Git integration (Vercel → the-brain-os → Settings → Git → Disconnect).

Read the two statuses separately when judging a PR: `Vercel – the-brain` is the real one.

**Never deploy to `the-brain-os` and never point anything at it.** Its URL
(`the-brain-os-meshman14-uxs-projects.vercel.app`) is not the app. The 2026-07-30
connector permission saga that created it is preserved in this file's git history if it
is ever needed again.

| What | URL | State |
|---|---|---|
| **THE BRAIN** | https://the-brain-meshman14-uxs-projects.vercel.app | **live — the real one** |
| the-brain-os | the-brain-os-…vercel.app | failing, delete it |
| Old prototype | https://the-brain-pi.vercel.app | domain now attached to `the-brain` |
| **MAINFRAME** | https://mainfram-4.vercel.app | **live, do not touch** |

## Auth and the URL

Supabase Site URL and the redirect allow-list point at the live URL above, and a
magic-link round trip has been completed against it. If the URL ever changes, update
**both** in Supabase → Authentication → URL Configuration:

- **Site URL** → the new origin
- **Redirect URLs** → add `<new-origin>/**`

Otherwise magic links bounce to the old address.

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
