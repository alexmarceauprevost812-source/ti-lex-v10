const CACHE_VERSION = "tilex-v10-295";
const ASSETS = [
  "/",
  "/index.html",
  "/pro.html",
  "/choose.html",
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
  "/forfaits.html",
  "/cyber.html",
  "/centre-indar.html",
  "/forfaits-cyber.html",
  "/manifest.json",
  "/js/al-memory.js",
  "/js/memoire-ia.js",
  "/js/agent-marceau.js",
  "/css/fichiers.css",
  "/css/fichiers-selection.css",
  "/css/fichiers-preview.css",
  "/css/fichiers-partage.css",
  "/css/fichiers-historique.css",
  "/js/fichiers-templates.js",
  "/js/fichiers.js",
  "/js/fichiers-selection.js",
  "/js/fichiers-preview.js",
  "/js/fichiers-partage.js",
  "/js/fichiers-historique.js",
  "/js/fichiers-cli.js",
  "/tilex-zip-generator/index.html",
  "/tilex-zip-generator/css/tilex.css",
  "/tilex-zip-generator/js/tilex-templates.js",
  "/tilex-zip-generator/js/tilex-core.js",
  "/tilex-zip-generator/js/tilex-preview.js",
  "/tilex-zip-generator/js/tilex-zip.js",
  "/tilex-zip-generator/js/tilex-share.js",
  "/tilex-zip-generator/js/tilex-history.js",
  "/tilex-zip-generator/js/tilex-theme.js",
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
