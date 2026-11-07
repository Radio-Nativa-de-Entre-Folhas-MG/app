/* Nativa FM 1.7.1: cache apenas da interface; streaming e metadados nunca entram em cache. */
const CACHE = 'nativa-fm-v1.7.1';
const FILES = [
  './', './index.html', './styles.css', './gate.js', './landing.js', './app.js', './config.js', './manifest.webmanifest',
  './assets/nativa-fm-original.png', './assets/whatsapp.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-64.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  const isAppCode = request.mode === 'navigate' || /\.(?:css|js|webmanifest)$/.test(url.pathname);
  if (isAppCode) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, clone));
      }
      return response;
    }).catch(() => caches.match(request).then((stored) => stored || caches.match('./index.html'))));
  } else {
    event.respondWith(caches.match(request).then((stored) => stored || fetch(request)));
  }
});
