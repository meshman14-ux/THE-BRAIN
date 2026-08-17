/* THE BRAIN — minimal service worker.
   Goal: the app opens instantly and the shell survives no signal.
   Strategy: network-first for pages (always fresh data), cache fallback offline. */

const CACHE = "brain-v1";
const SHELL = ["/", "/capture", "/dashboard", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* Phone relay — a push is a nudge to open capture, nothing more. The camera
   can only ever fire from a tap on this device; the notification's job is to
   put the capture page one tap away. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* a malformed payload is still a nudge */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "THE BRAIN", {
      body: data.body || "Tap to open capture.",
      icon: "/icons/icon.png",
      badge: "/icons/icon.png",
      data: { url: data.url || "/capture?door=photo" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/capture";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const c of list) {
          if (c.url.includes("/capture") && "focus" in c) return c.focus();
        }
        return clients.openWindow(url);
      })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never cache Supabase traffic — auth and data must be live.
  if (url.hostname.endsWith("supabase.co")) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || caches.match("/capture"))
      )
  );
});
