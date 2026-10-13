// Offline cache for the game shell. Bump VERSION when files change.
const VERSION = 'blockcraft-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './vendor/three.min.js', './js/textures.js', './js/blocks.js', './js/world.js',
  './js/icons.js', './js/audio.js', './js/game.js', './js/ui.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // cache fonts and other same-origin/CDN responses for offline play
      if (res.ok && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('fonts.g'))) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
