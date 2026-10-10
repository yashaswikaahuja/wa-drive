/// <reference lib="webworker" />
// Self-destructing service worker — clears all caches and unregisters itself
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => {
        for (const c of clients) {
          if ('navigate' in c && typeof (c as WindowClient).navigate === 'function') {
            void (c as WindowClient).navigate(c.url);
          }
        }
      }),
  );
});

// cache-bust file-manager-provenance 2026-09-20
