const CACHE_VERSION = "tilex-v10-158";
const ASSETS = [
  "/",
  "/index.html",
  "/app.html",
  "/app.js",
  "/styles.css",
  "/logo.png",
  "/assets/tilex-logo.png",
  "/assets/avatar-ia.mp4",
  "/assets/mascot-open.jpg",
  "/assets/mascot-wink.jpg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/assets/forfaits-bg.mp4",
  "/assets/creer-agent-icon.mp4",
  "/manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "check-update") {
    self.registration.update();
  }
});
