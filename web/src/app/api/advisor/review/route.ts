import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { HabitLog, Task } from "@/lib/types";
import {
  buildReviewPrompt,
  enoughEvidence,
  evidenceLines,
  reviewEvidence,
  REVIEW_SYSTEM,
} from "@/lib/advisor";
import { ask, isConfigured, readableError } from "@/lib/claude";
import { logDaysFor, readHours, readObstacles, reviewPeriod, toIso, hourStats } from "@/lib/logic";

export const dynamic = "force-dynamic";

/**
 * The review assistant: a draft, from evidence.
 *
 * **Reads only, and saves nothing.** The draft comes back as text on the
 * screen for him to edit and then save himself through `/reviews` — the
 * existing weekly-review form, which was already the only thing that writes
 * a review. An assistant that filed its own draft would be deciding what his
 * week was, which is the opposite of what a review is for.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "The advisor is not configured yet." },
      { status: 400 }
    );
  }

  const today = toIso(new Date());
  const { start, end } = reviewPeriod(today);

  const [{ data: tasks }, { data: habits }, { data: logs }, { data: journal }, { data: reviews }] =
    await Promise.all([
      supabase.from("tasks").select("title, status, do_date, completed_at"),
      supabase.from("habits").select("id, name").eq("active", true),
      supabase.from("habit_logs").select("habit_id, done_on"),
      supabase.from("journal").select("entry_date, meta"),
      supabase.from("reviews").select("meta").eq("kind", "weekly"),
    ]);

  const allHabits = (habits ?? []) as { id: string; name: string }[];
  const allLogs = (logs ?? []) as HabitLog[];

  // How much of the week got a purpose, from journal.meta.hours.
  const days = ((journal ?? []) as { entry_date: string; meta: unknown }[])
    .filter((j) => j.entry_date >= start && j.entry_date <= end)
    .map((j) => readHours(j.meta));
  const assigned = days.reduce((sum, d) => sum + hourStats(d).assigned, 0);
  const of = days.reduce((sum, d) => sum + hourStats(d).total, 0);

  const evidence = reviewEvidence({
    weekStart: start,
    weekEnd: end,
    tasks: (tasks ?? []) as Pick<Task, "title" | "status" | "do_date">[],
    habits: allHabits.map((h) => ({ name: h.name, days: logDaysFor(allLogs, h.id) })),
    hoursAssigned: assigned,
    hoursOf: of,
    obstacles: [
      ...new Set(
        ((reviews ?? []) as { meta: unknown }[]).flatMap((r) => readObstacles(r.meta))
      ),
    ],
  });

  if (!enoughEvidence(evidence)) {
    // A draft from nothing is a story. The honest answer is that the week
    // is not recorded well enough to review from.
    return NextResponse.json({
      draft: null,
      evidence: evidenceLines(evidence),
      reason: "not-enough-evidence",
      period: { start, end },
    });
  }

  try {
    const completion = await ask(REVIEW_SYSTEM, buildReviewPrompt(evidence), {
      maxTokens: 1500,
    });
    return NextResponse.json({
      draft: completion.refused ? null : completion.text,
      refused: completion.refused,
      evidence: evidenceLines(evidence),
      period: { start, end },
      usage: completion.usage,
    });
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 502 });
  }
}
