// Squash Drills service worker — cache-first for shell, network-fallback
const VERSION = 'sq-v1.3.0';
const ASSETS = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'drills.js',
  'court.js',
  'court-geometry.js',
  'court-render-svg.js',
  'court-dsl.js',
  'court-player.js',
  'glossary.js',
  'term-link.js',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((cache) =>
      // Add what we can; ignore failures so the SW installs anyway.
      Promise.all(
        ASSETS.map((a) =>
          cache.add(a).catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Don't try to cache Google Fonts dynamically — let browser handle.
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // cache successful responses for next time
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('index.html'));
    })
  );
});
