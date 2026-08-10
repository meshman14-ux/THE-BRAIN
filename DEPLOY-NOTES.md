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

## The old project — deleted 2026-08-10

`the-brain-os` is **gone.** It was created by the 2026-07-30 connector permission saga,
never worked, and was described here as "scheduled for deletion" for ten days while
quietly failing on every single push.

It is worth keeping why, because the failure mode is easy to recreate. It had **no Root
Directory set**, so it built at the repo root, found no `app/` — the app lives in `web/` —
and failed with `Couldn't find any pages or app directory`. That put a red
`Vercel – the-brain-os` status on every commit on every branch, on a repo whose actual
deploys were green the whole time. **No code change could ever have fixed it**, and a
permanently red check nobody trusts is worse than no check: it trains you to ignore the
one signal that might one day be real.

Two things learned getting rid of it, both worth knowing before you trust any similar fix:

- **Disconnecting the Git integration in the Vercel UI did not take.** The very next
  commit still triggered a fresh build (deployment `295FRqcEzCq5mYA3bWWS3fh6mDux`), and so
  did the two after it. A settings page that looks saved is not evidence.
- **The only evidence is a new commit carrying one Vercel status instead of two.** A fresh
  *deployment id* against a new SHA means the link is live whatever the dashboard says. And
  because GitHub commit statuses are immutable, every commit up to and including
  `1863357` keeps its red `the-brain-os` mark forever — that is frozen history, not a live
  failure. Judge the newest commit only.

If a second Vercel status ever appears again on a new commit, something has been
reconnected; deleting the project is what finally settled it, rather than disconnecting.

| What | URL | State |
|---|---|---|
| **THE BRAIN** | https://the-brain-meshman14-uxs-projects.vercel.app | **live — the real one** |
| ~~the-brain-os~~ | — | **deleted 2026-08-10** |
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
