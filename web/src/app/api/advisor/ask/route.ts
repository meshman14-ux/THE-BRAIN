import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Note } from "@/lib/types";
import {
  ADVISOR_SYSTEM,
  buildPrompt,
  checkAnswer,
  retrieve,
  worthAsking,
} from "@/lib/advisor";
import { ask, isConfigured, readableError } from "@/lib/claude";

export const dynamic = "force-dynamic";

/**
 * Ask anything, over his own notes, with citations.
 *
 * **This route reads and never writes.** It selects notes, sends them with
 * the question, and returns the answer plus the sources it was built from.
 * Nothing here inserts, updates or deletes a row — that is locked decision
 * 6's "advisory, never autonomous", kept as a property of the code rather
 * than as an intention.
 *
 * The retrieval happens *here*, not in the model: the model only ever sees
 * the handful of passages that matched, so it cannot cite a note it was
 * never shown, and the answer can be checked against the sources afterwards.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { question?: string };
  const question = body.question?.trim() ?? "";
  if (question.length < 3) {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }

  // Read-only. The advisor never sees a table it could write to.
  const { data: notes } = await supabase
    .from("notes")
    .select("id, title, body, kind, tags");

  const sources = retrieve((notes ?? []) as Note[], question);

  if (!worthAsking(question, sources)) {
    // Nothing matched. Saying so costs nothing; asking the model to answer
    // from no sources would produce exactly the ungrounded paragraph this
    // whole design exists to avoid.
    return NextResponse.json({
      answer: null,
      sources: [],
      reason: "nothing-matched",
    });
  }

  // Retrieval is the half that needs no model. With no API key the passages
  // still come back — searching his own vault is useful on its own, and the
  // model's job is only to write the answer over them. A feature that went
  // entirely dark for want of a key would be hiding work that already works.
  if (!isConfigured()) {
    return NextResponse.json({ answer: null, sources, reason: "unconfigured" });
  }

  try {
    const completion = await ask(ADVISOR_SYSTEM, buildPrompt(question, sources));
    if (completion.refused) {
      return NextResponse.json({
        answer: null,
        sources,
        reason: "refused",
        category: completion.refusalCategory,
      });
    }
    return NextResponse.json({
      answer: completion.text,
      sources,
      check: checkAnswer(completion.text, sources),
      truncated: completion.truncated,
      usage: completion.usage,
    });
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 502 });
  }
}
