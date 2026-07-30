# THE BRAIN

Jay's second brain: capture anything in seconds, see what today needs, find
everything later. Personal life and business in one place, on your phone.

**Live site:** https://meshman14-ux.github.io/THE-BRAIN/
(install it: open in Chrome → ⋮ → *Add to Home screen*)

---

## What it is

A **local-first PWA**. All data lives on your device — no account, no
server, no setup, works fully offline, private by default. One-tap JSON
backup/restore is built in.

Three screens, bottom tab bar, thumb-first:

| Screen | Job |
|---|---|
| **Today** | Overdue ("Catch up"), due today, and important undated tasks. Done = gone from here. |
| **Capture** | One text box. Type normally; dates, tags, context and importance are parsed live. |
| **Everything** | Search + filters over the whole brain, done history, backup/restore. |

### The capture language (all optional, any order)

```
pay van insurance tomorrow @business !     → pinned business task, due tomorrow
note: gazebo pole is 2.4m #kit             → note tagged kit
call mum friday                            → personal task, due next Friday
MOT due 14/8                               → task due 14 Aug (UK dates; past dates roll to next year)
follow up in 3 days / next week            → relative dates
```

`@business`/`@b` files under business (default personal) · `#word` tags ·
`!` pins as important · `note:`/`idea:` makes a note · a dated "note"
becomes a task, because dates mean action.

## Architecture

```
app/
├── index.html, public/           PWA shell: manifest, icons, service worker
├── src/
│   ├── lib/parse.ts              capture language → structured item (pure, tested)
│   ├── lib/dates.ts              natural dates, UK format (pure, tested)
│   ├── lib/store.ts              Brain: local-first store, localStorage, pub/sub,
│   │                             Today query, search, snooze, export/import (tested)
│   ├── pages/                    Today / Capture / Everything
│   ├── components/ItemRow.tsx    one row everywhere an item appears
│   ├── App.tsx                   tabs, undo toast, store subscription
│   └── styles.css                mobile-first, light+dark, ≥44px targets
└── tests/                        32 Vitest tests: parser, dates, store journeys
```

**Choices and trade-offs:** React 18 + Vite + TS (proven stack, instant dev
loop). **No backend on purpose** — a second brain must work in a field with
no signal and cost nothing to run; localStorage + export beats a database
until multi-device sync is truly needed (that's the designed next step: a
small Supabase sync layer behind the same `Brain` interface — the store is
the seam). Deterministic parsing over AI — instant, offline, predictable.

## Run it locally

```bash
cd app
npm install
npm run dev       # http://localhost:5173
npm test          # 32 tests
npm run build     # production build in app/dist
```

## Deploy

Push to `main`. GitHub Actions (`.github/workflows/deploy.yml`) tests,
builds and publishes to GitHub Pages automatically — the app at the site
root, the older links hub and Ledger page preserved under `/legacy/`.
A red test suite blocks the deploy.

Pages must be set to **GitHub Actions** as its source (Settings → Pages).
With "Deploy from a branch" the workflow succeeds but the live site never
changes.

## Extend it

- **New capture token** → add a rule in `src/lib/parse.ts` + a test in
  `tests/parse.test.ts`.
- **New view** → new file in `src/pages/`, add a tab in `App.tsx`; read via
  `brain.find(...)` or add a query method on `Brain`.
- **Sync (future)** → implement the same mutations against a backend inside
  `store.ts`; the UI never touches storage directly.

---

## User guide (the phone bit)

**First open:** the Today screen with a sunny "Nothing needs you today" and
one button — *Add something*. No signup, no tour, no permissions.

**Capturing a thought:** tap the big **+ Capture** tab → type like you'd
text a friend → watch the preview line show how it'll be filed → **Save
it**. The box clears and stays focused so you can dump five thoughts in a
row. Enter also saves.

**Running your day:** live on the Today tab. Tick things off (they
disappear, the "done today" counter climbs). Not happening today? The **↷**
button pushes it back a day, guilt-free. Overdue items sit at the top under
**Catch up** in red — honest, not hidden.

**Finding things:** Everything tab → search matches titles and tags;
chips narrow to To-dos/Notes, Personal/Business; "Done too" shows history.

**Mistakes:** every delete shows an **Undo** toast for a few seconds.
Nothing else is destructive.

**Backups:** Everything tab → **Download backup** (a JSON file — email it
to yourself). **Restore from backup** merges it back; importing the same
file twice never duplicates.

**If something looks wrong:** the app never loses data silently — worst
case a corrupted browser storage starts you at an empty screen, and your
latest backup file restores everything.
