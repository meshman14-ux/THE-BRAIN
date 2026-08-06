import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { authUrl, isConfigured } from "@/lib/google";
import { STATE_COOKIE } from "@/lib/calendar";

export const dynamic = "force-dynamic";

/**
 * Step one of connecting: send him to Google's consent screen.
 *
 * The consent screen is the only place a password is ever typed, and it is
 * Google's, not ours. THE BRAIN never sees a credential — it receives a
 * code afterwards and trades it for a token.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  if (!isConfigured()) {
    return NextResponse.redirect(`${origin}/calendar?error=unconfigured`);
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
