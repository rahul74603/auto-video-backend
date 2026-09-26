// StudyGyaan Service Worker v4
// Change: network-first for page navigations (deploy ke baad users ko turant
// naya version milta hai — purana cached app nahi dikhta). Baaki offline fallback.
// v4: SW ab sirf same-origin GET requests handle karta hai — cross-origin API
// calls (Cloud Functions) browser direct bhejta hai, SW beech me nahi aata.
const CACHE_NAME = 'studygyaan-v4';
const urlsToCache = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Cross-origin (Cloud Functions API, CDNs) aur non-GET requests: SW haath
  // nahi lagata — browser ka default network behaviour. API POST/preflight ko
  // intercept karne se sirf confusing "Failed to fetch (sw.js)" errors milti thi.
  const reqUrl = new URL(req.url);
  if (reqUrl.origin !== self.location.origin || req.method !== 'GET') {
    return;
  }

  // Page navigations: pehle network, fail hone par cache fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error()))
    );
    return;
  }

  // Baaki requests: cache ho to cache, warna network
  event.respondWith(
    caches.match(req).then((response) => response || fetch(req))
  );
});
