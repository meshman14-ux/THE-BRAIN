# Deploy notes — THE BRAIN

## The blocker (why this moved to Claude Code)

The Vercel connector used in the Claude desktop session has **project-scoped access**. Observed:

1. It created project `the-brain-os` and deployed once — worked. Site is live.
2. Every deploy after that: `403 forbidden — "You don't have permission to create a Production
   Deployment for this project."`
3. `list_projects` doesn't even return `the-brain-os`, though its URL responds.
4. `get_deployment` on its own successful deployment → 404.

**Conclusion:** creating a project grants a one-time write; the new project never joins the
connector's allow-list, so later deploys are refused.

**Two fixes:**
- In Vercel → Settings → Integrations → the Claude integration, set project access to
  **All Projects**. Then the connector works again.
- Or just deploy from Claude Code with `npx vercel --prod`, which uses your own login and has no
  such restriction. **This is the recommended path.**

## Current deployments

| What | URL | State |
|---|---|---|
| THE BRAIN v1.0 | https://the-brain-os-meshman14-uxs-projects.vercel.app | live, dark theme |
| THE BRAIN v1.1 | — | built, not deployed |
| Old prototype | https://the-brain-pi.vercel.app | orphaned — its DB tables were dropped, safe to delete |
| **MAINFRAME** | https://mainfram-4.vercel.app | **live, do not touch** |

## After deploying v1.1

If the URL changes, update **both** in Supabase → Authentication → URL Configuration:
- **Site URL** → the new origin
- **Redirect URLs** → add `<new-origin>/**`

Otherwise magic links will bounce to the old address.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://qttroyuajpyelfrbxzzt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon key, in .env.production in the zip>
```

The anon key is safe in client code — RLS is what protects the data. The **service-role** key
must never appear in this repo or in any client bundle.

## Database migrations already applied

`the_brain_os_v1_full_schema` · `harden_seed_pillars_search_path` · `planner_kanban_and_richer_areas`

v1.0 still runs correctly against the migrated schema — it doesn't reference the changed columns —
so there's no rush, but v1.1 is what the schema is now shaped for.
