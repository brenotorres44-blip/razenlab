// Busca sempre a versão mais nova na internet; o cache só entra quando estiver offline.
// Assim você não precisa mexer neste arquivo quando atualizar o site.
const CACHE = "razenlab";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.status === 200) {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
