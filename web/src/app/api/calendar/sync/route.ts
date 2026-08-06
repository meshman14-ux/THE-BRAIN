import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSync } from "@/lib/calendar-server";
import { summaryLine } from "@/lib/calendar";

export const dynamic = "force-dynamic";

/**
 * One two-way pass, on demand.
 *
 * POST rather than GET on purpose: this changes both his calendar and his
 * tasks, and a link that could be prefetched into doing that is a link that
 * eventually will be.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const { summary, errors } = await runSync();
    return NextResponse.json({
      summary,
      line: summaryLine(summary),
      // Partial failures are reported rather than swallowed: a sync that
      // moved four things and failed on a fifth should say both.
      errors,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Sync failed." },
      { status: 400 }
    );
  }
}
