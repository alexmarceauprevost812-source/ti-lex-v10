/* ============================================================
   js/tilex-push-notif.js — Web Push (notifs app fermée)
   ti-lex-AL v10 — Alex Marceau-Prévost
   Abonne l'appareil aux notifications push pis sauvegarde
   l'abonnement sur Supabase (privé par utilisateur, RLS).
   Le serveur (edge function tilex-coword) envoie la notif quand
   Coword a fini — même si l'app est complètement fermée.
   ============================================================ */

const TilexPushNotif = (() => {

  // Clé publique VAPID (publique — pas un secret). La privée reste au serveur.
  const VAPID_PUBLIC = 'BKsw_yAuizum3GF8yujNYlbpA8LhCn5iIxbfIlUn1ezBzLsDl_93YwBidwibvvNWpY_GASuC60VSZaRzqesAIfk';

  function _sb() {
    if (window.__engineSb) return window.__engineSb;
    if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
    return null;
  }

  function _b64ToU8(base64) {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const b = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  async function _sauver(sub) {
    const sb = _sb(); if (!sb) return false;
    try {
      const j = sub.toJSON(); const keys = j.keys || {};
      if (!j.endpoint || !keys.p256dh || !keys.auth) return false;
      const { error } = await sb.from('push_subscriptions')
        .upsert({ endpoint: j.endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'user_id,endpoint' });
      return !error;
    } catch (e) { return false; }
  }

  // Active le push : permission + abonnement + sauvegarde. À appeler sur un geste.
  async function activer(silencieux) {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return { ok: false, raison: 'Push non supporté sur cet appareil' };
      }
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm !== 'granted') return { ok: false, raison: 'Permission refusée' };

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _b64ToU8(VAPID_PUBLIC) });
      }
      const ok = await _sauver(sub);
      if (ok && !silencieux && window.showToastMsg) window.showToastMsg('🔔 Notifications activées — même app fermée');
      return { ok };
    } catch (e) {
      return { ok: false, raison: String(e && e.message || e) };
    }
  }

  // Réabonne discrètement si déjà autorisé (à appeler au chargement).
  async function synchroniser() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _b64ToU8(VAPID_PUBLIC) });
      }
      await _sauver(sub);
    } catch (e) {}
  }

  return { activer, synchroniser, VAPID_PUBLIC };

})();

window.TilexPushNotif = TilexPushNotif;
