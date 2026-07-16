// Ledger the chatbot — an Express server that streams Claude's replies,
// in character, to the browser chat UI in /public.

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { client, MODEL, SYSTEM_PROMPT } from "./persona.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "\n  ⚠  No ANTHROPIC_API_KEY found. Copy .env.example to .env and add your key,\n" +
      "     or run `ant auth login`. The chat won't respond until a credential is set.\n",
  );
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(here, "..", "public")));

// POST /api/chat  { messages: [{ role: "user"|"assistant", content: string }, ...] }
// Streams the reply back as Server-Sent Events (one `data:` line per token chunk).
app.post("/api/chat", async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (messages.length === 0) {
    res.status(400).json({ error: "Send a non-empty `messages` array." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024, // Ledger talks short and weighted — he doesn't need more.
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
    });

    for await (const text of stream.textStream) {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write("event: done\ndata: {}\n\n");
  } catch (err) {
    console.error("chat error:", err?.message || err);
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Line went cold. Try again, love." })}\n\n`);
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n  Ledger is holding the room at  http://localhost:${PORT}\n  Model: ${MODEL}\n`);
});
