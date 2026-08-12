import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadCogBundle } from "@/lib/cogserver";
import { toIso } from "@/lib/logic";

export const dynamic = "force-dynamic";

/**
 * GET /api/cog/daily-state — the state, without the advice.
 *
 * What the engine can see today, and what it cannot. Useful on its own:
 * "the advice is thin because there is no sleep figure and no calendar" is
 * a more actionable sentence than any recommendation built on top of it.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const date = request.nextUrl.searchParams.get("date") ?? toIso(new Date());
  const { state } = await loadCogBundle(date);
  return NextResponse.json(state);
}

/**
 * POST /api/cog/daily-state — the optional sharper read.
 *
 * Jay's check-in is nightly, and the morning bands are normally DERIVED
 * from it. This exists for the morning he wants to overrule that with a
 * live answer — two taps, energy and sleep — and it is deliberately not
 * required by anything. Nothing nags for it; the derivation covers the
 * other 364 days.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { date?: string; energyBand?: number; sleepBand?: number | null; intent?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body." }, { status: 400 });
  }

  const band = (n: unknown): number | null =>
    typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;

  const energy = band(body.energyBand);
  if (energy === null) {
    return NextResponse.json({ error: "energyBand must be 1–5." }, { status: 400 });
  }

  const date = body.date ?? toIso(new Date());
  const { error } = await supabase.from("cog_checkins").upsert(
    {
      user_id: user.id,
      date,
      energy_band: energy,
      sleep_band: band(body.sleepBand),
      intent: typeof body.intent === "string" ? body.intent.slice(0, 140) : null,
    },
    { onConflict: "user_id,date" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Today's cached state was built from the derivation and is now wrong.
  // Deleting it is honest; rebuilding it here would double the work of a
  // request whose whole point is to be fast.
  await supabase.from("cog_states").delete().eq("date", date);

  return NextResponse.json({ saved: true, date });
}
