# Ledger ⚔️

**Agatha "Ledger" Vane** — an AI chatbot agent and social-media persona, powered
by Claude (`claude-opus-4-8`).

A shieldmaiden's calm over a strategist's mind — cold, composed, always three
moves ahead, keeping a ledger of every debt. This project is two things sharing
one character:

- **The chatbot** — a web app where people talk to Agatha and get her advice, in
  character, streamed live.
- **The influencer** — a generator that writes social posts (X, Instagram,
  LinkedIn) in her voice, ready to schedule.

The character is defined once, in [`persona/ledger.md`](persona/ledger.md), and
drives both.

```
ledger/
├── persona/ledger.md     # the character — one source of truth
├── src/
│   ├── persona.js        # loads the persona + shared config
│   ├── server.js         # the chatbot (Express, streams replies)
│   └── social.js         # the influencer (generates social posts)
├── public/               # chat web UI (vanilla HTML/CSS/JS)
└── docs/brand.md         # voice & brand guide for the social side
```

## Setup

Requires **Node 18+** and an Anthropic API key
([get one here](https://console.anthropic.com/)).

```bash
npm install
cp .env.example .env      # then paste your key into .env
```

## Run the chatbot

```bash
npm start
```

Open <http://localhost:3000> and start talking. Replies stream in live.

## Generate social posts

```bash
npm run social                    # a general drop
npm run social -- "loyalty"       # posts on a theme
npm run social -- "burnout" 5     # 5 posts on a theme
```

Output is tagged by platform and ready to copy into a scheduler.

## Make her yours

Everything about the character lives in [`persona/ledger.md`](persona/ledger.md).
Edit that file — story, code, voice, boundaries — and both the chatbot and the
generator change with it. No code edits needed.

## Notes

- The persona has boundaries baked in: tough love, never cruel. The ruthlessness
  stays in the fiction; the real advice points people toward their own strength.
- `.env` is git-ignored — your key never gets committed.
- Model is set with `LEDGER_MODEL` in `.env` (defaults to `claude-opus-4-8`).

---

## Publishing to a new GitHub repo

This project was built as a self-contained folder. To give it its own repo:

**1. Create an empty repo** on GitHub named `ledger` — don't add a README,
`.gitignore`, or license (this project already has them).

**2. From inside this `ledger/` folder, push it up:**

```bash
git init
git add .
git commit -m "Ledger: Claude-powered chatbot agent + social persona"
git branch -M main
git remote add origin https://github.com/<your-username>/ledger.git
git push -u origin main
```

That's it — Ledger lives in its own repo, separate from anything else.
