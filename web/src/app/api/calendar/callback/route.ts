import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, ensureBrainCalendar, exchangeCode } from "@/lib/google";
import { PROVIDER } from "@/lib/calendar-server";
import { STATE_COOKIE } from "@/lib/calendar";

export const dynamic = "force-dynamic";

/**
 * Step two: Google sends him back with a code.
 *
 * Three things happen here and nothing else: the state is checked, the code
 * is traded for tokens, and THE BRAIN's own calendar is found or created.
 * The tokens are encrypted before they touch the database — see the comment
 * on the `integrations` migration for why that is not optional.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const back = (q: string) => NextResponse.redirect(`${origin}/calendar?${q}`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  // He can decline at the consent screen. That is an answer, not a failure.
  if (params.get("error")) return back(`error=declined`);

  const code = params.get("code");
  const state = params.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) {
    return back("error=state");
  }

  try {
    const tokens = await exchangeCode(code, origin);
    const calendar = await ensureBrainCalendar(tokens.accessToken);

    await supabase.from("integrations").upsert(
      {
        user_id: user.id,
        provider: PROVIDER,
        access_token: encryptToken(tokens.accessToken),
        // Google only returns a refresh token on the first consent, so a
        // reconnect that omits it must not blank the one already stored.
        ...(tokens.refreshToken
          ? { refresh_token: encryptToken(tokens.refreshToken) }
          : {}),
        expires_at: tokens.expiresAt,
        scope: tokens.scope,
        calendar_id: calendar.id,
        calendar_name: calendar.name,
        // Kept so every write can check it is not about to touch his real
        // diary, which is the whole of "blast radius contained".
        meta: { primary_calendar_id: calendar.primaryId },
        last_error: null,
        sync_token: null,
      },
      { onConflict: "user_id,provider" }
    );

    return back(calendar.created ? "connected=new" : "connected=existing");
  } catch (e) {
    const message = (e as Error).message ?? "unknown";
    return back(`error=${encodeURIComponent(message.slice(0, 180))}`);
  }
}
