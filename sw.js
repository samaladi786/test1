// Rugama POS Service Worker - പൂർണ്ണ ഓഫ്‍ലൈൻ കാഷെ സിസ്റ്റം
const CACHE_NAME = 'rugama-pos-v3';

// നെറ്റ് ഇല്ലാതെ ഫോണിൽ പ്രവർത്തിക്കാൻ ആവശ്യമായ പ്രധാന ഫയലുകൾ (സ്വന്തം ലോഗോ ഉൾപ്പെടെ)
const ASSETS_TO_CACHE = [
  './',
  './mobile.html',
  './config.js',
  './manifest.json',
  './logo.png', // നിങ്ങളുടെ ആപ്പ് ലോഗോ
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// 1. ഇൻസ്റ്റാൾ ചെയ്യുമ്പോൾ ഫയലുകൾ ഫോണിന്റെ മെമ്മറിയിലേക്ക് ഡൗൺലോഡ് ചെയ്യുന്നു
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. ആക്റ്റിവേറ്റ് ചെയ്യുമ്പോൾ പഴയ കാഷെ നീക്കം ചെയ്യുന്നു
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

// 3. ഫെച്ച് റിക്വസ്റ്റുകൾ കൈകാര്യം ചെയ്യുന്നു (ഓഫ്‍ലൈൻ സപ്പോർട്ട്)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Supabase ഡാറ്റാബേസ് കോളുകൾ സർവീസ് വർക്കർ കാഷെ ചെയ്യേണ്ടതില്ല (അത് mobile.html കൈകാര്യം ചെയ്യും)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // നെറ്റ് ഉണ്ടെങ്കിൽ പുതിയത് ലോഡ് ചെയ്യും, ഇല്ലെങ്കിൽ ഫോണിൽ സൂക്ഷിച്ച കാഷെ നൽകും
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // പേജ് കിട്ടിയില്ലെങ്കിൽ ഡിഫോൾട്ട് ആയി mobile.html ഓപ്പൺ ചെയ്യും
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./mobile.html');
          }
        });
      })
  );
});
