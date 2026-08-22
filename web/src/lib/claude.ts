import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The Claude client, and the only place THE BRAIN talks to a model.
 *
 * `server-only` for the same reason `google.ts` has it: this handles an API
 * key, and importing it from a Client Component would ship the key to the
 * browser. The import turns that into a build error rather than a discovery.
 *
 * Everything the model is *asked* — the system prompts, the retrieval, the
 * citation checking — lives in `advisor.ts`, which is pure and tested. This
 * file only carries the request.
 */

/** Opus 5. The advisor answers over his own notes; the reasoning matters. */
export const ADVISOR_MODEL = "claude-opus-5";

/**
 * Answers here are short — a few paragraphs over at most six passages — so
 * this is a deliberate ceiling rather than a default. Comfortably inside the
 * non-streaming timeout.
 */
export const MAX_TOKENS = 4000;

export function missingConfig(): string[] {
  return process.env.ANTHROPIC_API_KEY ? [] : ["ANTHROPIC_API_KEY"];
}

export function isConfigured(): boolean {
  return missingConfig().length === 0;
}

function client(): Anthropic {
  if (!isConfigured()) {
    throw new Error("The advisor is not configured. Missing: ANTHROPIC_API_KEY");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export type Completion = {
  text: string;
  /** Set when the model declined. The caller shows it; it never becomes an answer. */
  refused: boolean;
  refusalCategory: string | null;
  /** Whether the answer was cut off — a truncated answer must say so. */
  truncated: boolean;
  usage: { input: number; output: number };
};

/**
 * One turn. No tools, no conversation, no memory between questions.
 *
 * That is the shape decision 6 asks for: a retrieval advisor answers the
 * question in front of it from the sources in front of it. A tool-using agent
 * with its own state would be the autonomous thing the decision rules out.
 */
export async function ask(
  system: string,
  prompt: string,
  opts: { maxTokens?: number } = {}
): Promise<Completion> {
  const response = await client().messages.create({
    model: ADVISOR_MODEL,
    max_tokens: opts.maxTokens ?? MAX_TOKENS,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  // Check the stop reason before reading content: a refusal can arrive with
  // an empty content array, and indexing into it would throw on the one
  // response that most needs handling.
  const refused = response.stop_reason === "refusal";
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    text,
    refused,
    refusalCategory: refused ? (response.stop_details?.category ?? null) : null,
    truncated: response.stop_reason === "max_tokens",
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * A conversation. Still no tools, no memory of its own, no path to a row —
 * the transcript arrives from the caller and leaves with the caller.
 *
 * `ask` above is deliberately single-turn because a retrieval advisor
 * answers the question in front of it. The council at /advisor/table is a
 * different shape — a conversation is its whole point — and what decision 6
 * actually rules out is autonomy, not memory: a chat that can only ever
 * return text is as advisory on turn ten as on turn one.
 */
export async function converse(
  system: string,
  turns: ChatTurn[],
  opts: { maxTokens?: number } = {}
): Promise<Completion> {
  const response = await client().messages.create({
    model: ADVISOR_MODEL,
    max_tokens: opts.maxTokens ?? MAX_TOKENS,
    system,
    messages: turns,
  });

  // Same order as `ask`: stop reason first, content second — a refusal can
  // arrive with an empty content array.
  const refused = response.stop_reason === "refusal";
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    text,
    refused,
    refusalCategory: refused ? (response.stop_details?.category ?? null) : null,
    truncated: response.stop_reason === "max_tokens",
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

/** Turn an SDK error into one line he can act on. */
export function readableError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) {
    return "The API key was rejected. Check ANTHROPIC_API_KEY.";
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "Rate limited by the API. Try again in a moment.";
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return "Could not reach the API. Check the connection.";
  }
  if (e instanceof Anthropic.APIError) {
    return `The API returned ${e.status}: ${e.message}`;
  }
  return (e as Error)?.message ?? "Something went wrong.";
}
