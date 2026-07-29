# THE BRAIN v2 — Web App

Next.js 15 + Supabase + Vercel. This folder (`web/`) is the new app;
the old static site (`../index.html`, `../ledger.html`) remains at the
repo root until cutover.

## One-time setup

1. **Supabase** — create a free project at supabase.com, then run
   [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor.
2. **Vercel** — import the `THE-BRAIN` GitHub repo, set
   **Root Directory = `web`**, and add the env vars from
   [`.env.example`](.env.example).
3. Sign in once with your email (magic link), then disable new signups
   in Supabase → Authentication.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev                  # http://localhost:3000
```

## Structure

```
src/
├── middleware.ts             session refresh + /dashboard guard
├── app/
│   ├── page.tsx              landing
│   ├── login/                magic-link sign-in
│   ├── auth/confirm/         email-link handler
│   ├── auth/signout/         sign-out route
│   └── dashboard/            private area (modules land here)
└── lib/supabase/             browser/server/middleware clients
supabase/schema.sql           database schema + RLS + realtime
```

## Roadmap

- Campaign 2: Links & Projects CRUD with realtime, public hub view
- Campaign 3: Notes, Tasks, Habits
- Campaign 4: Ledger AI (server-side API key)
- Campaign 5: cutover from GitHub Pages to Vercel
