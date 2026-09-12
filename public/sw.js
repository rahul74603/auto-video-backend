// StudyGyaan Service Worker v3
// Change: network-first for page navigations (deploy ke baad users ko turant
// naya version milta hai — purana cached app nahi dikhta). Baaki offline fallback.
const CACHE_NAME = 'studygyaan-v3';
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
