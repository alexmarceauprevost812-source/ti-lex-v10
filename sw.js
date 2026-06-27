const CACHE_VERSION = "tilex-v10-460";
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
  "/bourse.html",
  "/js/tilex-finance.js",
  "/abonnement.html",
  "/midas.html",
  "/midas-finance.html",
  "/cyber.html",
  "/centre-indar.html",
  "/forfaits-cyber.html",
  "/manifest.json",
  "/js/al-memory.js",
  "/js/memoire-ia.js",
  "/js/agent-marceau.js",
  "/js/centre-indar.js",
  "/js/scan-engine.js",
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
  "/js/tilex-config.js",
  "/js/theme-engine.js",
  "/js/security-guard.js",
  "/js/guide-protection.js",
  "/css/security.css",
  "/css/tilex-typewriter.css",
  "/css/tilex-studio.css",
  "/js/tilex-typewriter.js",
  "/js/tilex-studio.js",
  "/js/tilex-export.js",
  "/js/tilex-studio-auto.js",
  "/js/tilex-crypto-logos.js",
  "/js/tilex-crypto-connect.js",
  "/js/tilex-connections.js",
  "/js/tilex-toast.js",
  "/js/tilex-guard.js",
  "/js/tilex-guardian.js",
  "/js/tilex-safe-fetch.js",
  "/js/tilex-copy.js",
  "/js/tilex-theme.js",
  "/js/tilex-memory.js",
  "/js/tilex-vocal.js",
  "/js/tilex-push.js",
  "/tilex-zip-generator/index.html",
  "/tilex-zip-generator/css/tilex.css",
  "/tilex-zip-generator/js/tilex-templates.js",
  "/tilex-zip-generator/js/tilex-core.js",
  "/tilex-zip-generator/js/tilex-preview.js",
  "/tilex-zip-generator/js/tilex-zip.js",
  "/tilex-zip-generator/js/tilex-share.js",
  "/tilex-zip-generator/js/tilex-history.js",
  "/tilex-zip-generator/js/tilex-theme.js",
  "/tilexcode/index.html",
  "/tilexcode/public/tilexcode-agents.js",
  "/tilexcode/public/tilexcode-demo.js",
  "/tilexcode/public/tilex-leurre.js",
  "/tilexcode/public/tableau-intrusions.html",
  "/tilexcode/public/tableau-intrusions.js",
  "/al-connexion-auto.js",
  "/langage-tilex.js",
  "/tilexcode/public/auth.html",
  "/tilexcode/public/tilex-auth.js",
  "/tilexcode/public/tilex-auth-ui.js",
  "/conversation-manager.js",
  "/conversation-sidebar.js",
  "/demo-scan.html",
  "/demos/demo-scan-securise.html",
  "/demos/demo-scan-silex.html",
  "/css/tilex-vision.css",
  "/test-vision.html",
  "/js/tilex-ia.js",
  "/js/tilex-gardien.js",
  "/js/midas-cerveau.js",
  "/js/midas-crypto.js",
  "/js/midas-actions.js",
  "/js/midas-manager.js",
  "/js/midas-agent-definition.js",
  "/js/yilo-memory.js",
  "/js/tilex-image.js",
  "/js/tilex-schema.js",
  "/css/tilex-image.css",
  "/css/tilex-schema.css",
  "/js/tilex-offline.js",
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

  if (url.hostname.includes("supabase.co") || url.hostname.includes("anthropic.com")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          JSON.stringify({ erreur: "offline", message: "Ti-lex est en mode offline — pas de connexion API disponible." }),
          { headers: { "Content-Type": "application/json" }, status: 503 }
        )
      )
    );
    return;
  }

  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "check-update") {
    self.registration.update();
  }
  if (e.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (e.data === "GET_VERSION") {
    e.source.postMessage({ version: CACHE_VERSION });
  }
});
