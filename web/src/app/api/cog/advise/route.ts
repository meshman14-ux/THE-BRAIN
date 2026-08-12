import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { advise } from "@/lib/cog";
import { loadCogBundle } from "@/lib/cogserver";
import { toIso } from "@/lib/logic";

export const dynamic = "force-dynamic";

/**
 * GET /api/cog/advise — the day, advised.
 *
 * Orchestrator only. It authenticates, assembles the state, calls the pure
 * engine, persists what was said, and returns it. Every decision in the
 * response was made by `advise()`, which cannot reach a database or a clock
 * — that separation is the whole reason a past day can be replayed and
 * checked.
 *
 * `now` is stamped ONCE here and handed to the engine, rather than being
 * read repeatedly inside it. Two rules depend on the time of day (N3 fires
 * inside an open focus block), and a rule that reads its own clock cannot
 * be tested.
 */
export async function GET(request: NextRequest) {
  const started = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date") ?? toIso(new Date());
  const now = localNow();

  let bundle;
  try {
    bundle = await loadCogBundle(date, now);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read the day." },
      { status: 500 }
    );
  }

  const advice = advise(bundle.state, bundle.profile, bundle.config);

  /* -- persist ------------------------------------------------------- *
   *
   * The STATE is stored, not just the advice. Storing only the output
   * would make the determinism guarantee unfalsifiable — you could never
   * re-run a past day to check the engine still agrees with itself.
   *
   * A failed write must not cost Jay his advice, so persistence is
   * best-effort and the response goes out either way. Telemetry records
   * that it failed; nothing pretends it succeeded. */
  const persist = async () => {
    await supabase.from("cog_states").upsert(
      {
        user_id: user.id,
        date,
        season: advice.state.season,
        momentum: advice.report.momentumIndicator,
        missing_inputs: advice.state.missingInputs,
        state: advice.state,
      },
      { onConflict: "user_id,date" }
    );

    // One pulse row per (date, rule). Re-asking for advice at 11am must
    // not stack four identical "start your focus block" rows and inflate
    // the acceptance denominator the pilot is measured on.
    const { data: seen } = await supabase
      .from("cog_pulses")
      .select("id")
      .eq("date", date)
      .eq("correlation_id", advice.pulse.correlationId)
      .maybeSingle();
    if (!seen) {
      await supabase.from("cog_pulses").insert({
        user_id: user.id,
        date,
        kind: advice.pulse.kind,
        ref_id: advice.pulse.refId,
        message: advice.pulse.message,
        rationale: advice.pulse.rationale,
        rule_trace: advice.pulse.ruleTrace,
        correlation_id: advice.pulse.correlationId,
      });
    }

    await supabase.from("cog_telemetry").insert([
      { user_id: user.id, metric: "advise_latency_ms", value: Date.now() - started },
      {
        user_id: user.id,
        metric: "rule_fired",
        label: advice.pulse.ruleTrace[0]?.ruleId ?? "none",
        value: 1,
      },
      {
        user_id: user.id,
        metric: "state_degraded",
        label: advice.state.missingInputs.join(",") || "none",
        value: advice.report.degraded ? 1 : 0,
      },
    ]);
  };

  let persisted = true;
  try {
    await persist();
  } catch {
    persisted = false;
  }

  return NextResponse.json({ ...advice, persisted });
}

/**
 * Now, as a naive local datetime.
 *
 * Every time string the engine handles is offset-free local, and mixing a
 * UTC `now` into that comparison is how the focus-block rule ends up
 * firing an hour early in summer.
 */
function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
