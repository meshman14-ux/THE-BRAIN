/**
 * Phone relay — the pure half of web push and the QR handoff.
 *
 * The one physical rule this feature lives under: no website may fire a
 * phone's camera without a tap on the phone. So the relay's whole job is to
 * get the phone OPEN on /capture with the photo door highlighted — the last
 * tap is always Jay's, and that is the browser's law, not a compromise.
 */

/** The door a relay link asks the capture page to highlight. */
export type CaptureDoor = "photo" | "document";

/** `?door=` is a URL param, so never trusted — anything unrecognised is no door. */
export function readDoor(value: unknown): CaptureDoor | null {
  return value === "photo" || value === "document" ? value : null;
}

/** The URL a QR code or a notification tap lands on. */
export function captureUrl(origin: string, door: CaptureDoor = "photo"): string {
  return `${origin.replace(/\/+$/, "")}/capture?door=${door}`;
}

/**
 * A VAPID public key arrives base64url-encoded; PushManager.subscribe wants
 * raw bytes. Standard conversion, kept here so it is testable.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Explicit ArrayBuffer, not the default allocator: PushManager.subscribe's
  // BufferSource type refuses a Uint8Array whose buffer COULD be shared.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type SubscriptionRow = { endpoint: string; p256dh: string; auth: string };

/**
 * Shapes a browser PushSubscription's JSON into the row we store. Returns
 * null for anything malformed rather than inserting a row that can never be
 * pushed to — a subscription without keys is not a subscription.
 */
export function subscriptionRow(json: unknown): SubscriptionRow | null {
  if (typeof json !== "object" || json === null) return null;
  const rec = json as Record<string, unknown>;
  const keys = rec.keys;
  if (typeof rec.endpoint !== "string" || rec.endpoint.trim() === "") return null;
  if (typeof keys !== "object" || keys === null) return null;
  const k = keys as Record<string, unknown>;
  if (typeof k.p256dh !== "string" || k.p256dh === "") return null;
  if (typeof k.auth !== "string" || k.auth === "") return null;
  return { endpoint: rec.endpoint, p256dh: k.p256dh, auth: k.auth };
}

/** What a "buzz my phone" push carries. Kept minimal — a nudge, not a message. */
export function capturePushPayload(origin: string): string {
  return JSON.stringify({
    title: "THE BRAIN — capture",
    body: "Tap to open the camera. One photo, straight to the inbox.",
    url: captureUrl(origin, "photo"),
  });
}

/**
 * Push subscription endpoints that answer 404 or 410 are gone — the device
 * revoked or expired them. Anything else (429, 5xx) is the push service
 * having a moment, and deleting the row for that would silently unsubscribe
 * a working phone.
 */
export function subscriptionIsGone(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}
