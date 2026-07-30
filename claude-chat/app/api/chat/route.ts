import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

// Allow streaming responses up to 60 seconds (Vercel Hobby cap).
export const maxDuration = 60;

// Cheapest capable default. Override in the environment for a stronger model:
//   claude-sonnet-5  — better reasoning, ~3x the output cost
//   claude-opus-5    — most capable, ~5x
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';

const SYSTEM_PROMPT = [
  'You are a helpful, direct assistant.',
  'Answer plainly and completely. Use markdown for structure when it helps.',
  'Use GBP (£) for any money amounts unless the user specifies another currency.',
  'Never suggest beef in any recipe or food suggestion.',
].join(' ');

export async function POST(req: Request) {
  // The client keys off this exact string to show its setup panel instead of a
  // generic failure — keep the two in sync.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'NO_API_KEY' }, { status: 503 });
  }

  let messages: UIMessage[];
  try {
    ({ messages } = (await req.json()) as { messages: UIMessage[] });
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'No messages supplied.' }, { status: 400 });
  }

  const result = streamText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
}
