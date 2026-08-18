const CACHE_VERSION = "tilex-v10-675";

// Cache dédié aux tuiles de la carte (TILEXMAP). Séparé du cache applicatif :
// il survit aux déploiements, sinon chaque mise en ligne effacerait les cartes
// téléchargées pour le hors-ligne.
const TILE_CACHE = "tilex-tuiles-v1";
const TILE_CACHE_MAX = 4000;
const TILE_HOSTS = /(^|\.)(basemaps\.cartocdn\.com|server\.arcgisonline\.com|tile\.openstreetmap\.org)$/;

const ASSETS = [
  "/",
  "/index.html",
  "/pro.html",
  "/pro",
  "/choose.html",
  "/logo.png",
  "/assets/tilex-logo.png",
  "/assets/tilex-user-avatar.png",
  "/assets/tilex-al-avatar.mp4",
  "/assets/tilex-demon-bleu.png",
  "/assets/tilex-demon-feu.png",
  "/assets/tilex-mascot-open.png",
  "/assets/tilex-mascot-wink.png",
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
  "/codex",
  "/codex.html",
  "/carte.html",
  // Repertoire officiel FPQ (310 pourvoiries, coordonnees WGS 84) : precache
  // pour que la couche marche meme sans reseau, en foret.
  "/assets/pourvoiries-quebec.json",
  "/carte",
  "/tilexmap",
  "/tilexcode",
  "/truck.html",
  "/truck",
  "/truck-map.html",
  "/truck-map",
  "/suivi",
  "/maison.html",
  "/maison",
  "/rapport.html",
  "/rapport",
  "/systeme.html",
  "/systeme",
  "/agenda.html",
  "/agenda",
  "/comm",
  "/comm/index.html",
  "/communications",
  "/communications.html",
  "/projets",
  "/projets.html",
  "/schema",
  "/schema.html",
  "/comm/config.js",
  "/comm/tilex-comm.js",
  "/comm/manifest.json",
  "/js/tilex-prive.js",
  "/js/tilex-core.js",
  "/web.html",
  "/web",
  "/security.html",
  "/security",
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
  "/js/tilex-eyes.js",
  "/js/tilex-hands.js",
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
  "/js/tilex-connect.js",
  "/js/tilex-toast.js",
  "/js/tilex-guard.js",
  "/js/tilex-guardian.js",
  "/js/tilex-autofix.js",
  "/js/tilex-bureau.js",
  "/js/tilex-midas.js",
  "/js/tilex-meteo-panel.js",
  "/js/tilex-schema-panel.js",
  "/js/tilex-truck-panel.js",
  "/js/tilex-translate.js",
  "/js/tilex-translate-panel.js",
  "/js/tilex-engine.js",
  "/js/tilex-engine-ui.js",
  "/js/tilex-coword-anim.js",
  "/js/tilex-push-notif.js",
  "/js/tilex-coword-files.js",
  "/js/tilex-studio-code.js",
  "/js/tilex-scan.js",
  "/js/tilex-mandat.js",
  "/js/tilex-prevost.js",
  "/mandat.html",
  "/mandat",
  "/js/tilex-connexions.js",
  "/css/tilex-status-badge.css",
  "/js/tilex-status-badge.js",
  "/moteur.html",
  "/moteur",
  "/js/tilex-safe-fetch.js",
  "/js/tilex-copy.js",
  "/js/tilex-theme.js",
  "/js/tilex-memory.js",
  "/js/tilex-context.js",
  "/js/tilex-memory-compact.js",
  "/js/tilex-conv-panel.js",
  "/js/tilex-matrix-bg.js",
  "/js/tilex-platform-theme.js",
  "/js/tilex-zip.js",
  "/js/tilex-zip-history.js",
  "/js/tilex-paye.js",
  "/js/tilex-meteo.js",
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
  "/al-connexion-auto.js",
  "/langage-tilex.js",
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
  "/js/tilex-intro.js",
  "/js/tilex-youtube.js",
  "/css/tilex-youtube.css",
  "/schemas-animes/index.html",
  "/tilex-chat.html",
  "/chat",
  "/js/tilex-log-analyst.js",
  "/css/tilex-log-analyst.css",
  "/js/tilex-sentinelle.js",
  "/css/tilex-sentinelle.css",
  "/assets/marceau-logo.png",
  "/assets/coword-tilex.png",
  "/assets/intro/plate.jpg",
];

self.addEventListener("install", (e) => {
  // Précache TOLÉRANT : on met en cache chaque ressource indépendamment.
  // Si une seule 404 (ex: une route pas encore déployée), on l'ignore au lieu
  // de faire planter toute l'installation du service worker (cache.addAll, lui,
  // rejette tout au moindre échec → le SW resterait bloqué sur l'ancienne version).
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(ASSETS.map((u) => cache.add(u).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== TILE_CACHE)
          .map((k) => caches.delete(k))
      )
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

  // Tuiles de carte : cache d'abord (elles sont immuables) → la carte reste
  // utilisable hors réseau sur les zones déjà parcourues ou téléchargées.
  if (TILE_HOSTS.test(url.hostname)) {
    e.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(e.request).then((hit) => {
          if (hit) return hit;
          return fetch(e.request)
            .then((res) => {
              if (res.ok || res.type === "opaque") cache.put(e.request, res.clone());
              return res;
            })
            .catch(() => new Response("", { status: 504, statusText: "tuile indisponible hors ligne" }));
        })
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

// Réception d'un push serveur (app en arrière-plan OU fermée) → notification.
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (err) { data = { body: e.data && e.data.text ? e.data.text() : "" }; }
  const title = data.title || "Coword";
  const opts = {
    body: data.body || "",
    icon: data.icon || "/assets/coword-tilex.png",
    badge: "/icon-192.png",
    tag: data.tag || "coword",
    data: { url: data.url || "/moteur" },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// Clic sur une notification Coword → ouvre/focus la page /moteur.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/moteur";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes("/moteur") && "focus" in c) return c.focus();
      }
      for (const c of list) {
        if ("focus" in c) { try { if (c.navigate) c.navigate(url); } catch (err) {} return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// ─── Téléchargement de tuiles demandé par la carte ──────────────────────────
// TILEXMAP envoie {type:"CACHE_TILES", urls:[…]} et attend des messages de
// progression {type:"TILE_PROGRESS", done, total} en retour.
async function mettreEnCacheTuiles(urls, source) {
  const cache = await caches.open(TILE_CACHE);
  const total = urls.length;
  let done = 0;
  const LOT = 6; // on ménage le fournisseur de tuiles

  for (let i = 0; i < urls.length; i += LOT) {
    await Promise.all(
      urls.slice(i, i + LOT).map(async (u) => {
        try {
          const dejaLa = await cache.match(u);
          if (!dejaLa) {
            const res = await fetch(u);
            if (res.ok || res.type === "opaque") await cache.put(u, res.clone());
          }
        } catch (err) {
          // Une tuile manquante ne doit pas interrompre le téléchargement.
        }
        done++;
      })
    );
    if (source) source.postMessage({ type: "TILE_PROGRESS", done, total });
  }

  await elaguerTuiles(cache);
  if (source) source.postMessage({ type: "TILE_PROGRESS", done: total, total });
}

// Plafonne le cache de tuiles : les plus anciennes entrées partent en premier.
async function elaguerTuiles(cache) {
  const keys = await cache.keys();
  if (keys.length <= TILE_CACHE_MAX) return;
  const aSupprimer = keys.slice(0, keys.length - TILE_CACHE_MAX);
  await Promise.all(aSupprimer.map((k) => cache.delete(k)));
}

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
  if (e.data && e.data.type === "CACHE_TILES" && Array.isArray(e.data.urls)) {
    e.waitUntil(mettreEnCacheTuiles(e.data.urls, e.source));
  }
  if (e.data && e.data.type === "CLEAR_TILES") {
    e.waitUntil(caches.delete(TILE_CACHE));
  }
});
