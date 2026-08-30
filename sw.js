// Service worker — offline support, and "always fresh when online" so a deploy
// can never leave a client serving a half-old/half-new mix of files (the stale-
// cache banner we kept hitting).
//
// Strategy: NETWORK-FIRST for same-origin GETs, cache as the offline fallback.
//   - Online: you always get the current file, so a single page load is one
//     consistent version. A stalled network (gym wifi) falls back to cache
//     after a short timeout instead of hanging.
//   - Offline: you get the last copy fetched while online.
//   - Cross-origin (Supabase, the chat Worker) and every non-GET go straight to
//     the network, untouched — never cached.
//
// No precache manifest to keep in sync: the cache fills as the app is used, so
// after one online visit the whole app works offline. Only a tiny shell is
// pre-warmed so a cold offline start still paints.

const CACHE = 'aw-runtime-v1';
const SHELL = ['./', 'index.html', 'app.css', 'assets/vendor/supabase.js'];
const NET_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  self.skipWaiting();   // take over promptly; network-first makes this safe
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // POST/auth → network
  if (new URL(req.url).origin !== self.location.origin) return;  // 3rd-party → network
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT);
  try {
    const fresh = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());   // refresh the snapshot
    return fresh;
  } catch {
    clearTimeout(timer);
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = (await cache.match('index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    throw new Error('offline and not cached');   // let the browser show its own error
  }
}
