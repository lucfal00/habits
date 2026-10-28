// Offline support. Pages: network first (a new version shows on the next launch), cache when offline.
// Other files: answer from cache, refresh the cache in the background.
const CACHE = 'habits-v11';
const FILES = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/logic.js', './js/charts.js', './js/ui.js', './js/crypto.js', './js/sync.js', './js/mood.js',
  './js/sleep.js', './js/anim.js',
  './js/views/today.js', './js/views/habits.js', './js/views/stats.js', './js/views/settings.js', './js/views/mood.js', './js/views/sleep.js',
  './icons/habits-v3.svg', './icons/habits-v3-192.png', './icons/habits-v3-512.png',
  './icons/habits-v3-maskable-512.png', './icons/habits-v3-apple-180.png',
];
const PAGE_TIMEOUT_MS = 3000;

self.addEventListener('install', (e) => {
  // 'reload' bypasses the HTTP cache (GitHub Pages sends max-age=600) so a new version precaches fresh files.
  const requests = FILES.map((f) => new Request(f, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function page(req) {
  const cache = await caches.open(CACHE);
  try {
    const timeout = new Promise((_, reject) => { setTimeout(reject, PAGE_TIMEOUT_MS); });
    // By URL: a navigate-mode Request cannot be re-issued with options.
    const res = await Promise.race([fetch(req.url, { cache: 'no-cache' }), timeout]);
    if (res.ok) await cache.put('./', res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./')) || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  if (req.mode === 'navigate') {
    e.respondWith(page(req));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req)
      .then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => hit);
    if (hit) {
      e.waitUntil(net);
      return hit;
    }
    return net;
  }));
});
