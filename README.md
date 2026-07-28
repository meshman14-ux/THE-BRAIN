# THE BRAIN

My personal hub — a single static page served via GitHub Pages. Links,
projects, and a little bit of everything, in one hand-written HTML file.

**Live site:** https://meshman14-ux.github.io/THE-BRAIN/

## Features

- **Tabbed layout** — Links, Projects, and About, all on one page.
- **Live search** — filter links as you type.
- **Light / dark theme** — toggle in the top-right, remembers your choice,
  and defaults to your system preference.
- **Live clock & greeting** — a time-of-day greeting and a ticking clock.
- **Animated neural-network background** — an interactive canvas that reacts
  to your cursor (and respects `prefers-reduced-motion`).
- **Copy-to-clipboard** — one-click copy for the email address.
- **Easter egg** — poke the 🧠 avatar for a random brain fact.
- **Social share cards** — Open Graph / Twitter meta tags and an emoji favicon.

## Edit

Everything lives in [`index.html`](index.html). Content is driven by three
config arrays near the top of the `<script>` block — edit those, no markup
needed:

- `LINKS` — your links (set `copy:` on one to show a copy button).
- `PROJECTS` — project cards with a blurb, link, and tags.
- `ABOUT` — the intro text and the little stat tiles.

No build step — commit and push, and GitHub Pages redeploys automatically.

## Deploy

Pages is configured to deploy from the `main` branch (root). Pushing to `main`
publishes the change within a minute or so.
