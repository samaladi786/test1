const CACHE_NAME = 'alnassr-pos-cache-v2.09';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './mobile.html',
  './master.html',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './shop1.png',
  './shop2.png',
  './shop3.png'
];

// ഫയലുകൾ കാഷെയിലേക്ക് സൂക്ഷിക്കുന്നു
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// പഴയ കാഷെ ക്ലിയർ ചെയ്യുന്നു
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// നെറ്റ് ഇല്ലെങ്കിലും കാഷെയിൽ നിന്ന് ഫയൽ തുറക്കുന്നു (Offline First)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        // ഇന്റർനെറ്റ് ഇല്ലാത്തപ്പോൾ പ്രധാന പേജ് നൽകുന്നു
        if (event.request.mode === 'navigate') {
          return caches.match('./mobile.html');
        }
      });
    })
  );
});
