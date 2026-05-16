const CACHE_NAME = 'cc-static-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'cc-drive-files-v1').map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only cache same-origin static assets
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;
  
  // Cache JS, CSS, fonts, images (not API calls or HTML)
  const isStatic = /\.(js|css|woff2?|ttf|png|svg|ico)$/.test(url.pathname) || 
                   url.pathname.startsWith('/assets/');
  
  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
