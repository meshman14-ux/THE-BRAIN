import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  councilSystem,
  isCouncilMode,
  usedQuotes,
  windowTurns,
} from "@/lib/council";
import { converse, isConfigured, missingConfig, readableError } from "@/lib/claude";

export const dynamic = "force-dynamic";

/**
 * The table — the Peaky Blinders council.
 *
 * **This route reads nothing and writes nothing.** It checks the session,
 * sends the conversation with the council's standing instructions, and
 * returns what the two men said. The transcript lives with the caller; no
 * table holds it, no row records it. Locked decision 6 — advisory, never
 * autonomous — kept as a property of the code, and here trivially: there is
 * no query for a model's output to reach.
 *
 * The quote bank travels in the system prompt, assembled from the same
 * constants the tests hold in step with `claude/quote-bank.md` — so the
 * council can only ever open with a line the bank approves, and a line it
 * has already spent this conversation is named so it reaches for a fresh one.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    turns?: unknown;
    mode?: unknown;
  };

  const turns = windowTurns(body.turns);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Put something to the table first." },
      { status: 400 }
    );
  }

  const mode = isCouncilMode(body.mode) ? body.mode : "table";

  // Unlike the ask box there is no half of this that works without a model —
  // the council IS the model wearing the spec. Saying so plainly beats a
  // dead send button; the page says it too, before anything is typed.
  if (!isConfigured()) {
    return NextResponse.json({
      reply: null,
      reason: "unconfigured",
      missing: missingConfig(),
    });
  }

  try {
    const completion = await converse(
      councilSystem(mode, usedQuotes(turns)),
      turns.map((t) => ({ role: t.role, content: t.text }))
    );
    if (completion.refused) {
      return NextResponse.json({
        reply: null,
        reason: "refused",
        category: completion.refusalCategory,
      });
    }
    return NextResponse.json({
      reply: completion.text,
      truncated: completion.truncated,
      usage: completion.usage,
    });
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 502 });
  }
}
