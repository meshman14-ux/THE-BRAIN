import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyResolution } from "@/lib/calendar-server";
import type { Resolution } from "@/lib/calendar";

export const dynamic = "force-dynamic";

const CHOICES: Resolution[] = ["keep_mine", "keep_google"];

/**
 * Settle one conflict, the way he chose.
 *
 * This is the only route that resolves anything, and it cannot be called
 * without a choice in the body. That is deliberate: locked decision 8 says
 * conflicts are surfaced and never auto-resolved, and the way to keep a
 * rule like that true a year from now is to leave no code path that could
 * break it.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    linkId?: string;
    choice?: string;
  };
  const linkId = body.linkId?.trim();
  const choice = body.choice as Resolution | undefined;

  if (!linkId || !choice || !CHOICES.includes(choice)) {
    return NextResponse.json(
      { error: "Say which conflict, and which side to keep." },
      { status: 400 }
    );
  }

  try {
    await applyResolution(linkId, choice);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Could not settle that one." },
      { status: 400 }
    );
  }
}
