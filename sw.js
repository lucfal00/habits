// Offline: answer from cache, refresh the cache in the background (next launch gets updates).
const CACHE = 'habits-v2';
const FILES = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/logic.js', './js/charts.js', './js/ui.js', './js/crypto.js', './js/sync.js',
  './js/views/today.js', './js/views/habits.js', './js/views/stats.js', './js/views/settings.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request)
      .then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
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
