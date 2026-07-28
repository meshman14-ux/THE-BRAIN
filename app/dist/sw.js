/* THE BRAIN service worker — full offline. The app is local-first (all data
   in localStorage), so caching the shell + assets makes it work with no
   signal at all. Navigations are network-first so new versions land on the
   next open; hashed assets are cache-first (immutable by name). */
const CACHE = 'brain-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request);
        const c = await caches.open(CACHE);
        c.put(e.request, res.clone());
        return res;
      } catch {
        const hit = await caches.match(e.request);
        return hit || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) c.put(e.request, res.clone());
    return res;
  })());
});
