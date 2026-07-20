/* ============================================================================
 * tilex-push-client.js — Abonnement aux notifications push ti-lex v10
 * ----------------------------------------------------------------------------
 * Demande la permission, s'abonne au push, et enregistre l'abonnement
 * dans la table tilex_push_subs (protégée par RLS).
 * 🍁 Produit du Québec
 * ============================================================================ */

(function (global) {
  'use strict';

  // Convertit la clé VAPID publique (base64url) en Uint8Array
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = global.atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  const TilexPush = {
    /**
     * Abonne l'appareil courant aux notifications push.
     * @param {object} opts
     * @param {object} opts.supabase       — client Supabase authentifié
     * @param {string} opts.vapidPublicKey — clé publique VAPID
     * @param {string} [opts.deviceKind]   — mobile / ordinateur
     * @returns {Promise<object|null>} l'abonnement, ou null si refusé/non supporté
     */
    async sabonner({ supabase, vapidPublicKey, deviceKind }) {
      if (!('serviceWorker' in navigator) || !('PushManager' in global)) {
        console.warn('[ti-lex push] Push non supporté sur cet appareil');
        return null;
      }

      // 1. Permission de l'usager
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.info('[ti-lex push] Permission refusée');
        return null;
      }

      // 2. Abonnement via le Service Worker
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      // 3. Extrait les clés et enregistre dans Supabase
      const json = sub.toJSON();
      const { error } = await supabase
        .from('tilex_push_subs')
        .upsert({
          endpoint: sub.endpoint,
          p256dh: json.keys.p256dh,
          auth_key: json.keys.auth,
          device_kind: deviceKind || 'inconnu',
        }, { onConflict: 'endpoint' });

      if (error) {
        console.error('[ti-lex push] Erreur enregistrement', error);
        return null;
      }

      console.log('[ti-lex push] Appareil abonné ✓');
      return sub;
    },

    /** Désabonne l'appareil courant */
    async sedesabonner({ supabase }) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await supabase.from('tilex_push_subs').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
      console.log('[ti-lex push] Désabonné');
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TilexPush;
  else global.TilexPush = TilexPush;

})(typeof window !== 'undefined' ? window : globalThis);
