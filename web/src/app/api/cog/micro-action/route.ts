import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { microActions } from "@/lib/cog";
import { loadCogBundle } from "@/lib/cogserver";
import { toIso } from "@/lib/logic";

export const dynamic = "force-dynamic";

/**
 * GET /api/cog/micro-action?minutes=5 — what actually fits this gap.
 *
 * Rule M4 is the honest one and it is enforced here rather than hidden:
 * when nothing real fits, the answer is an empty list and the word "rest",
 * not an invented five-minute job. Manufactured busywork is how a tool
 * teaches you to stop trusting it.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const raw = Number(request.nextUrl.searchParams.get("minutes") ?? 5);
  const minutes = Number.isFinite(raw) ? Math.max(1, Math.min(60, Math.round(raw))) : 5;
  const date = request.nextUrl.searchParams.get("date") ?? toIso(new Date());

  const { state, config } = await loadCogBundle(date);
  const actions = microActions(state, config, minutes);

  // Issued means offered, so each one is a row that can carry a verdict —
  // otherwise the acceptance metric would only ever measure pulses.
  if (actions.length > 0) {
    await supabase.from("cog_pulses").insert(
      actions.map((a) => ({
        user_id: user.id,
        date,
        kind: "micro-action",
        ref_id: a.id,
        message: a.label,
        rationale: a.rationale,
        rule_trace: a.ruleTrace,
        correlation_id: `cor-${date}-micro-${a.id}`,
      }))
    );
  }

  return NextResponse.json({
    minutes,
    actions,
    rest: actions.length === 0,
  });
}
