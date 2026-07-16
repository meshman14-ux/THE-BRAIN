// Shared config + the character's system prompt.
// The persona lives in persona/ledger.md — one source of truth for both the
// chatbot (server.js) and the social-content generator (social.js).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader — no dependency needed. Loads KEY=value lines from the
// project-root .env into process.env (without overwriting anything already set).
function loadEnv() {
  const envPath = path.join(here, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

export const MODEL = process.env.LEDGER_MODEL || "claude-opus-4-8";

// Read the character definition off disk so it can be edited without touching code.
export const SYSTEM_PROMPT = fs.readFileSync(
  path.join(here, "..", "persona", "ledger.md"),
  "utf8",
);

// The zero-arg client reads ANTHROPIC_API_KEY (or an `ant auth login` profile).
export const client = new Anthropic();
