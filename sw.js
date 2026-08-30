// Service worker — offline support, and "always fresh when online" so a deploy
// can never leave a client serving a half-old/half-new mix of files (the stale-
// cache banner we kept hitting).
//
// Strategy: NETWORK-FIRST for same-origin GETs, cache as the offline fallback.
//   - Online: you always get the current file, so a single page load is one
//     consistent version. A stalled network (gym wifi) falls back to cache
//     after a short timeout instead of hanging.
//   - Offline: you get the last cached copy.
//   - Cross-origin (Supabase, the chat Worker) and every non-GET go straight to
//     the network, untouched — never cached.
//
// We PRECACHE the whole boot graph at install (below), because a service worker
// only starts intercepting after it activates — after the first page load has
// already fetched its modules and data uncached. Without precaching, going
// offline after a single visit fails to load the data files. Runtime caching
// then keeps everything else (images, etc.) fresh on top of the precache.

const CACHE = 'aw-runtime-v2';
const NET_TIMEOUT = 4000;

// Everything boot() needs to render offline: shell, fonts, vendored lib, every
// ES module in the import graph, and the data files data.js fetches. Keep in
// sync when adding a module or data file — a missing entry just falls back to
// runtime caching (works on the 2nd online load), so it degrades, not breaks.
const PRECACHE = [
  './', 'index.html', 'app.css',
  'assets/vendor/supabase.js',
  'assets/fonts/anton-latin.woff2', 'assets/fonts/inter-latin.woff2',
  'src/main.js', 'src/data.js', 'src/ui.js', 'src/store.js', 'src/sync.js',
  'src/chat.js', 'src/supabase-config.js',
  'src/icons/body.js', 'src/icons/equipment.js',
  'src/views/plan.js', 'src/views/log.js', 'src/views/history.js',
  'src/views/library.js', 'src/views/picker.js', 'src/views/exercise-detail.js',
  'data/muscles.json', 'data/exercises.json', 'data/splits.json',
  'data/profiles.json', 'data/exercises-extended.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();   // take over promptly; network-first makes this safe
  // Per-entry adds (not addAll): one 404 shouldn't abort the whole precache.
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.allSettled(PRECACHE.map((u) => c.add(u)))
  ));
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
