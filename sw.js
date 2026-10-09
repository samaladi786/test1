// Rugama POS Service Worker
const CACHE_NAME = 'ALNASSR-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // ഓൺലൈൻ ഫെച്ച് സുഗമമായി നടക്കാൻ
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
