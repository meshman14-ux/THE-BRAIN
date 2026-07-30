# Start here — running THE BRAIN in Claude Code

## 0. The one thing that went wrong last time

Claude Code reported that `THE-BRAIN-OS-v1.2.zip` and `DEPLOY-NOTES.md` were "nowhere on disk".
They are. Verified directly on your machine:

```
C:\Users\Jay\Desktop\THE-BRAIN\
  CLAUDE.md                12,452 bytes
  DEPLOY-NOTES.md           2,274 bytes
  START-HERE.md             2,660 bytes
  THE-BRAIN-OS-v1.2.zip    72,883 bytes
  web\                     (the older 21-file scaffold)
  .git\
```

So it was either started in a different folder, or started before those files landed. Either way
the fix is the same: check the folder, then re-read. Step 1 does that.

---

## 1. Open a terminal in the right folder

```
cd "C:\Users\Jay\Desktop\THE-BRAIN"
dir
```

You should see `THE-BRAIN-OS-v1.2.zip` in that listing. If you don't, stop — nothing below will
work and I need to re-send the file.

## 2. Start Claude Code

```
claude
```

(If it isn't installed: `npm install -g @anthropic-ai/claude-code`)

## 3. Paste this as your first message

---

Run `pwd` and `ls -la` first and show me the output. You should be in
`C:\Users\Jay\Desktop\THE-BRAIN` and you should see `CLAUDE.md`, `DEPLOY-NOTES.md`,
`START-HERE.md`, `THE-BRAIN-OS-v1.2.zip` and a `web/` folder. If any of those are missing, say so
and stop — do not work around it.

Then read `CLAUDE.md` in this folder. It starts with `# CLAUDE.md — THE BRAIN` and has ten
numbered sections, section 0 being "Working standard — BOIL THE OCEAN". If the CLAUDE.md you are
reading talks about localStorage keys instead of a Supabase schema, you are reading a different
file — tell me its full path rather than following it. Read `DEPLOY-NOTES.md` too.

Then do these in order, checking with me between each:

1. **Make room without destroying anything.** `web/` currently holds an older 21-file scaffold.
   Rename it to `web-v1-scaffold/` — don't delete it — then unzip `THE-BRAIN-OS-v1.2.zip` into a
   fresh `web/`.

2. **Prove it builds.** `cd web && npm install`, then `npm test` (29 tests, all must pass), then
   `npm run build` (11 routes). Create `.env.local` from `.env.example` with the two
   `NEXT_PUBLIC_` values. Before any commit, confirm `.gitignore` covers `.env*.local` and tell me
   what you found rather than assuming. The Supabase **anon** key is safe in client code — RLS is
   what protects the data — but the **service-role key must never appear in this repo**.

3. **Deploy.** `npx vercel --prod` using my own Vercel login. If it says "No existing credentials
   found", run `npx vercel login` first and tell me — that's a login step I have to do, not
   something to work around. Give me the URL when it's live, and remind me to update the Supabase
   Site URL and redirect allow-list if the URL changed.

4. **Check I can actually sign in.** Magic link to meshman14@gmail.com, and confirm my 12 Life
   Areas appear on the dashboard.

5. **Find the three missing area names.** Clone the private repo and read
   `Jays Blueprint - Life OS.dc.html` — look for `this.domains`. GitHub's web viewer times out on
   it, a local clone won't.

Work to section 0 of CLAUDE.md — BOIL THE OCEAN. Complete features, tests for every rule, no
workarounds presented as answers. Then stop and tell me what you found. After that we start
Phase 2 (Goals + Projects).

---

## 4. What Claude Code can do that this session couldn't

- **Deploy properly.** It uses your own Vercel CLI login rather than the connector, which is
  what's been throwing 403s.
- **Clone the private repo** and read `Jays Blueprint - Life OS.dc.html` directly, instead of
  fighting GitHub's web viewer. That's where the 3 missing Life Area names live.
- **Run the app locally** at localhost:3000 so you can click through before anything ships.
- **Run git properly** — branches, commits, history.

## 5. Files in this folder

| File | What it is |
|---|---|
| `CLAUDE.md` | Full project context. Claude Code reads this automatically. |
| `DEPLOY-NOTES.md` | The Vercel permission problem, and MAINFRAME's real deployment. |
| `THE-BRAIN-OS-v1.2.zip` | The app source — paper theme, Planner, This Week, 29 tests. |
| `THE-BRAIN-OS-v1.1.zip` | Superseded. Ignore it. |
| `web/` | The older scaffold. Gets renamed to `web-v1-scaffold/` in step 1. |

## 6. One thing to be careful about

`CLAUDE.md` says it, but it bears repeating: **MAINFRAME is a separate system and its live
version is ahead of the code on your Desktop.** Don't let anything deploy `~/MAINFRAM4` over
mainfram-4.vercel.app — it has 14 fewer tables than the live database and would be a downgrade.
