// ALNASSR POS Service Worker - പൂർണ്ണ ഓഫ്‍ലൈൻ സപ്പോർട്ട്
const CACHE_NAME = 'alnassr-pos-v1';

// നെറ്റ് ഇല്ലാതെ ഫോണിൽ പ്രവർത്തിക്കാൻ ആദ്യമേ സേവ് ചെയ്യുന്ന ഫയലുകൾ
const ASSETS_TO_CACHE = [
  './',
  './mobile.html',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Supabase ഡാറ്റാബേസ് റിക്വസ്റ്റുകൾ സർവീസ് വർക്കർ കാഷെ ചെയ്യേണ്ടതില്ല
  if (url.hostname.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // ഇമേജുകളും പേജുകളും ലഭിക്കുമ്പോൾ പുതിയത് ഫോൺ മെമ്മറിയിൽ സേവ് ചെയ്യുന്നു (ഷോപ്പ് ലോഗോകൾ ഉൾപ്പെടെ)
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // നെറ്റ് ഇല്ലെങ്കിൽ ഫോണിൽ സൂക്ഷിച്ച കാഷെ ഫയലുകൾ നൽകുന്നു
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./mobile.html');
          }
        });
      })
  );
});
