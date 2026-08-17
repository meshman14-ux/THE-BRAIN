import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { capturePushPayload, subscriptionIsGone } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * POST — buzz every device the signed-in user has registered.
 *
 * Runs as the signed-in user: RLS scopes the subscription rows, so this route
 * can only ever push to the caller's own devices. No service-role key, as
 * everywhere in this app.
 */
export async function POST(req: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json(
      {
        error:
          "Push is not configured — NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are missing from the environment.",
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!subs?.length) {
    return NextResponse.json(
      {
        error:
          "No device is registered yet. Open /capture on your phone and tap “Enable push on this device” first.",
      },
      { status: 404 }
    );
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:meshman14@gmail.com",
    publicKey,
    privateKey
  );

  const origin = new URL(req.url).origin;
  const payload = capturePushPayload(origin);

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode ?? 0;
        // 404/410 means the device revoked the subscription — clean the row.
        // Anything else is the push service having a moment; keep the row.
        if (subscriptionIsGone(code)) gone.push(s.endpoint);
      }
    })
  );

  if (gone.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", gone);
  }

  if (sent === 0) {
    return NextResponse.json(
      {
        error: gone.length
          ? "Every registered device has lapsed — re-enable push on your phone."
          : "The push service did not accept the message — try again in a minute.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ sent, cleaned: gone.length });
}
