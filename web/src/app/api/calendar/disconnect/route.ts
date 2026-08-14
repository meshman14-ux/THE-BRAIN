import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadIntegration } from "@/lib/calendar-server";
import { decryptToken, revoke } from "@/lib/google";

export const dynamic = "force-dynamic";

/**
 * Disconnect.
 *
 * The access is revoked and the stored tokens are deleted, but **nothing in
 * Google is touched**. The events stay in his calendar and the tasks stay
 * here; disconnecting is withdrawing permission, not undoing the work.
 * The `calendar_sync` links go, because a mapping to a calendar we can no
 * longer read is a mapping that would produce duplicates on reconnect.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const integration = await loadIntegration(supabase);
  if (integration) {
    const refresh = decryptToken(integration.refresh_token);
    if (refresh) await revoke(refresh);
    await supabase.from("integrations").delete().eq("id", integration.id);
  }
  await supabase.from("calendar_sync").delete().eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
