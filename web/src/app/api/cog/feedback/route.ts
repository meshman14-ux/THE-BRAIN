import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toIso } from "@/lib/logic";
import { readCogMeta } from "@/lib/cogstate";

export const dynamic = "force-dynamic";

/**
 * POST /api/cog/feedback — accept, modify, or reject.
 *
 * THE ONLY PATH through which THE COG writes to a BRAIN table, and it
 * writes exactly three fields on exactly one table: `tasks.do_date`,
 * `tasks.priority`, `tasks.meta.cog`. Everything else it touches is a
 * `cog_*` table it owns outright. That narrowness is the write-ownership
 * contract, and keeping it in one visible file is how it stays true.
 *
 * The three verdicts do genuinely different things:
 *
 *   ACCEPTED — the task is pulled onto today and lifted to at least Med.
 *              Never demoted: accepting a suggestion is Jay agreeing the
 *              work matters, and that can only raise a priority he set.
 *   MODIFIED — recorded, nothing written. This is the most valuable row
 *              in the table: it says what he chose INSTEAD, which is the
 *              only signal that could ever tune the weights.
 *   REJECTED — recorded, nothing written, and the count feeds rule N2 —
 *              three refusals and the pulses stop for the day. A system
 *              that keeps asking after three noes is one you learn to
 *              ignore permanently rather than for an afternoon.
 */

type Body = {
  targetKind: "pulse" | "priority" | "focus-slot" | "micro-action";
  targetId: string;
  verdict: "accepted" | "modified" | "rejected";
  modification?: { newTaskId?: string | null; newStart?: string | null; note?: string };
  correlationId?: string;
};

const KINDS = ["pulse", "priority", "focus-slot", "micro-action"];
const VERDICTS = ["accepted", "modified", "rejected"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Malformed body." }, { status: 400 });
  }

  if (!KINDS.includes(body?.targetKind) || !VERDICTS.includes(body?.verdict) || !body?.targetId) {
    return NextResponse.json(
      { error: "targetKind, targetId and verdict are all required." },
      { status: 400 }
    );
  }

  const { error: feedbackError } = await supabase.from("cog_feedback").insert({
    user_id: user.id,
    target_kind: body.targetKind,
    target_id: body.targetId,
    verdict: body.verdict,
    modification: body.modification ?? null,
    correlation_id: body.correlationId ?? null,
  });
  if (feedbackError) {
    return NextResponse.json({ error: feedbackError.message }, { status: 500 });
  }

  // The pulse row carries the verdict too, so "what did it say and what
  // happened" is one query rather than a join nobody writes.
  if (body.correlationId) {
    await supabase
      .from("cog_pulses")
      .update({ verdict: body.verdict })
      .eq("correlation_id", body.correlationId);
  }

  /* -- the write-back ------------------------------------------------ */

  let writeBack: { taskId: string; do_date: string; priority: string } | null = null;

  if (
    body.verdict === "accepted" &&
    (body.targetKind === "priority" || body.targetKind === "pulse") &&
    isUuid(body.targetId)
  ) {
    const today = toIso(new Date());
    const { data: task } = await supabase
      .from("tasks")
      .select("id, do_date, priority, status, meta")
      .eq("id", body.targetId)
      .maybeSingle();

    if (task) {
      const row = task as {
        id: string;
        do_date: string | null;
        priority: string | null;
        status: string;
        meta: unknown;
      };

      // A finished task is not brought back to life by a stale tap on a
      // card that was rendered before it was ticked.
      if (row.status === "done" || row.status === "dropped") {
        return NextResponse.json({ recorded: true, writeBack: null, note: "Task already closed." });
      }

      // Optimistic concurrency, expressed as a guard rather than a lock:
      // the update only lands if the row still looks the way it did when
      // it was read. If Jay moved it in the meantime, HE WINS — the
      // verdict is already recorded above as feedback, which is the
      // reconciliation rule, not a conflict to resolve.
      const meta = (typeof row.meta === "object" && row.meta != null ? row.meta : {}) as Record<
        string,
        unknown
      >;
      const cog = { ...readCogMeta(row.meta), lastWriteAt: new Date().toISOString() };

      const next = {
        do_date: today,
        // Only ever upward. Accepting a suggestion cannot demote a task
        // Jay himself marked High.
        priority: row.priority === "High" ? "High" : "Med",
        meta: { ...meta, cog },
      };

      // `.is()` only accepts null/true/false, so the guard has to branch on
      // whether the task had a date at all — a detail worth the two lines,
      // because getting it wrong turns the concurrency check into a no-op
      // that silently overwrites whatever Jay just did.
      const guard = supabase
        .from("tasks")
        .update(next)
        .eq("id", row.id)
        .eq("status", row.status);
      const { data: updated } = await (row.do_date === null
        ? guard.is("do_date", null)
        : guard.eq("do_date", row.do_date)
      )
        .select("id")
        .maybeSingle();

      if (updated) {
        writeBack = { taskId: row.id, do_date: next.do_date, priority: next.priority };
        await supabase.from("cog_events").insert({
          id: `evt_${eventId()}`,
          user_id: user.id,
          type: "cog.task.writeback",
          correlation_id: body.correlationId ?? null,
          payload: {
            taskId: row.id,
            before: { do_date: row.do_date, priority: row.priority },
            after: { do_date: next.do_date, priority: next.priority },
          },
        });
      }
    }
  }

  return NextResponse.json({ recorded: true, writeBack });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Time-ordered enough to sort an outbox by, without pulling in a ULID dep. */
function eventId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
