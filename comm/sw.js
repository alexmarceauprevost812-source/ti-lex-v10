/* ============================================================================
 * sw.js — Service Worker ti-lex v10
 * ----------------------------------------------------------------------------
 * - Rend ti-lex installable sur mobile (PWA)
 * - Met en cache la coquille de l'app pour le mode hors ligne
 * - Reçoit et affiche les notifications push (Web Push API)
 * 🍁 Produit du Québec
 * ============================================================================ */

const CACHE = 'ti-lex-v10-cache-v1';

// Coquille de l'app à mettre en cache dès l'installation
const COQUILLE = [
  './',
  './index.html',
  './config.js',
  './tilex-comm.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/* --- Installation : on pré-cache la coquille --- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(COQUILLE))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[ti-lex SW] pré-cache partiel', err))
  );
});

/* --- Activation : on nettoie les vieux caches --- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(
        cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

/* --- Fetch : stratégie "réseau d'abord, cache en secours" ---
   Pratique pour une app temps réel : on veut le plus frais possible,
   mais on reste fonctionnel hors ligne. On ne touche pas aux appels
   Supabase (Realtime/REST) — ils passent toujours direct au réseau. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Laisse passer Supabase et les WebSockets sans interférer
  if (url.hostname.endsWith('supabase.co') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((reponse) => {
        // On met à jour le cache au passage
        const copie = reponse.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copie));
        return reponse;
      })
      .catch(() => caches.match(event.request).then((c) => c || caches.match('./index.html')))
  );
});

/* --- Push : réception d'une notification --- */
self.addEventListener('push', (event) => {
  let donnees = { titre: 'ti-lex', corps: 'Nouveau message', url: './' };
  try {
    if (event.data) donnees = Object.assign(donnees, event.data.json());
  } catch (e) {
    if (event.data) donnees.corps = event.data.text();
  }

  const options = {
    body: donnees.corps,
    icon: './icons/icon-192.png',
    badge: './icons/badge-72.png',
    tag: donnees.tag || 'ti-lex-msg',
    data: { url: donnees.url || './' },
    vibrate: [80, 40, 80],
    // Couleur aurore boréale pour la notif (Android)
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(donnees.titre || 'ti-lex', options)
  );
});

/* --- Clic sur une notification : ouvre/focus l'app --- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cible = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Si une fenêtre ti-lex est déjà ouverte, on la met au premier plan
        for (const client of clients) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        // Sinon on ouvre une nouvelle fenêtre
        if (self.clients.openWindow) return self.clients.openWindow(cible);
      })
  );
});
