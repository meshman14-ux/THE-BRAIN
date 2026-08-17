"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { captureUrl, subscriptionRow, urlBase64ToUint8Array } from "@/lib/push";

/**
 * The desk-to-pocket relay, two rungs:
 *
 * QR — the desktop shows a code, the phone's camera scans it, the phone lands
 * on /capture with the photo door highlighted. No permissions, no keys, works
 * on any phone. The "notification" is your own screen.
 *
 * Push — a registered phone gets a real notification. Needs the two VAPID env
 * vars; on iPhone it needs THE BRAIN installed to the home screen (Apple's
 * rule, not ours). Enabling runs ON the phone; buzzing runs from anywhere.
 */
export default function PhoneRelay() {
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"enable" | "buzz" | null>(null);
  const [enabledHere, setEnabledHere] = useState(false);

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const supabase = createClient();

  // Is THIS device already registered? Checked against the browser, not the
  // table — the table can't say which of its rows is this phone.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabledHere(!!sub))
      .catch(() => {});
  }, []);

  async function toggleQr() {
    setErr("");
    setMsg("");
    if (showQr) {
      setShowQr(false);
      return;
    }
    if (!qr) {
      const url = captureUrl(window.location.origin, "photo");
      const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      setQr(dataUrl);
    }
    setShowQr(true);
  }

  async function enableHere() {
    setErr("");
    setMsg("");
    if (!vapidPublic) {
      setErr(
        "Push is not configured yet — the VAPID keys are missing from the environment. The QR code works regardless."
      );
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setErr(
        "This browser cannot receive push. On iPhone, add THE BRAIN to the home screen first (Share → Add to Home Screen) and open it from there."
      );
      return;
    }
    setBusy("enable");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setErr("Notifications were not allowed — nothing was registered.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublic),
        }));
      const row = subscriptionRow(sub.toJSON());
      if (!row) {
        setErr("The browser returned an unusable subscription — try again.");
        return;
      }
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert({ ...row, label: navigator.userAgent.slice(0, 120) }, { onConflict: "endpoint" });
      if (error) {
        setErr(`Registering failed (${error.message}).`);
        return;
      }
      setEnabledHere(true);
      setMsg("This device will now get the buzz.");
    } catch (e) {
      setErr(`Could not enable push (${e instanceof Error ? e.message : "unknown error"}).`);
    } finally {
      setBusy(null);
    }
  }

  async function buzz() {
    setErr("");
    setMsg("");
    setBusy("buzz");
    try {
      const res = await fetch("/api/push/send", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error || `The buzz failed (${res.status}).`);
        return;
      }
      setMsg(
        `Sent to ${body.sent} device${body.sent === 1 ? "" : "s"} — tap the notification, then the camera.`
      );
    } catch {
      setErr("The buzz failed — network error. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <p className="label mb-2.5">Phone relay</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          className="btn btn-ghost tap text-sm py-2.5"
          type="button"
          onClick={toggleQr}
        >
          {showQr ? "Hide the QR" : "🔳 QR to my phone"}
        </button>
        <button
          className="btn btn-ghost tap text-sm py-2.5"
          type="button"
          onClick={enableHere}
          disabled={busy !== null || enabledHere}
        >
          {enabledHere
            ? "✓ Push is on here"
            : busy === "enable"
              ? "Enabling…"
              : "🔔 Enable push on this device"}
        </button>
        <button
          className="btn btn-ghost tap text-sm py-2.5"
          type="button"
          onClick={buzz}
          disabled={busy !== null}
        >
          {busy === "buzz" ? "Buzzing…" : "📳 Buzz my phone"}
        </button>
      </div>

      {showQr && qr && (
        <div className="card p-4 mt-2 grid place-items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, not a remote asset */}
          <img src={qr} alt="QR code opening capture on a phone" className="rounded" />
          <p className="text-xs text-[var(--muted)] text-center leading-relaxed">
            Point the phone&apos;s camera at this. It opens capture with the
            photo button ready — the phone must be signed in.
          </p>
        </div>
      )}

      <p className="text-xs text-[var(--faint)] mt-2 leading-relaxed">
        Enable push ON the phone (on iPhone: from the home-screen app); buzz it
        from anywhere. The camera always needs one tap on the phone itself —
        that is the browser&apos;s privacy rule, not a missing feature.
      </p>

      {msg && <p className="text-sm text-[var(--good)] font-semibold mt-2">✓ {msg}</p>}
      {err && <p className="text-sm text-[var(--bad)] mt-2">⚠ {err}</p>}
    </section>
  );
}
