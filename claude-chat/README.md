# Claude Chat

A Claude chat app that runs on desktop and mobile. Next.js App Router + TypeScript
+ Tailwind, streaming through the Vercel AI SDK, deployed on Vercel.

Your Anthropic API key lives **server-side** in a Vercel environment variable —
it is never shipped to the browser.

---

## Run it locally

From the root of THE-BRAIN:

```bash
cd claude-chat
npm install
cp .env.example .env.local     # then paste your real key into .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` for that middle step.

Open http://localhost:3000.

`.env.local` is gitignored. Never commit a real key.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) → **Import** this repository.
3. Under **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your key from [console.anthropic.com](https://console.anthropic.com/settings/keys) |

   Tick **Production**, **Preview** and **Development**.
4. **Deploy.**

Every later `git push` redeploys automatically.

> If you add or change the key after the first deploy, hit **Redeploy** — env vars
> are read at build time.

---

## Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Server-side only. |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-5` | Set to `claude-opus-5` for the most capable model. |

---

## How it works

```
app/
├─ api/chat/route.ts     POST endpoint — streams from Claude
├─ components/Chat.tsx   client chat UI
├─ page.tsx              renders <Chat />
└─ layout.tsx            fonts, metadata, mobile viewport
```

**`app/api/chat/route.ts`** takes the UI message history, converts it to model
messages, and streams the reply back as a UI message stream:

```ts
const result = streamText({
  model: anthropic(MODEL),
  system: SYSTEM_PROMPT,
  messages: await convertToModelMessages(messages),
});
return result.toUIMessageStreamResponse();
```

**`app/components/Chat.tsx`** uses `useChat()` from `@ai-sdk/react`, which POSTs
to `/api/chat` and re-renders as tokens arrive.

### A note on API versions

This is built against **AI SDK v7**. Many tutorials still show v4 shapes, which
no longer exist:

| Old (v4) | Current (v7) |
|---|---|
| `import { useChat } from 'ai/react'` | `import { useChat } from '@ai-sdk/react'` |
| `result.toDataStreamResponse()` | `result.toUIMessageStreamResponse()` |
| `useChat()` returns `input`, `handleSubmit` | you own the input state; call `sendMessage({ text })` |
| `convertToModelMessages(...)` returns an array | returns a Promise — `await` it |
| `message.content` (string) | `message.parts` (array of typed parts) |

---

## What's in the UI

- Streaming replies, token by token
- Stop button mid-stream
- Enter to send, Shift+Enter for a newline
- Auto-growing input, capped at ~6 rows
- Error banner with retry when the API call fails
- Light and dark, following the system theme
- Safe-area padding so the input clears the phone's home bar

---

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build + typecheck
npm start       # serve the production build
npx eslint .    # lint
```
