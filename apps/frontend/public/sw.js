// Generated from sw.ts — edit sw.ts, then re-emit.
self.addEventListener("install", () => {
  void self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.registration.unregister()).then(() => self.clients.matchAll()).then((clients) => {
      for (const c of clients) {
        if ("navigate" in c && typeof c.navigate === "function") {
          void c.navigate(c.url);
        }
      }
    })
  );
});
