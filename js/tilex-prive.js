// ============================================================
// js/tilex-prive.js — Garde « projet personnel »
// Ti-lex-AL v10 — Réserve les pages du système camion/forêt au
// SEUL propriétaire (Alex). Si le compte connecté n'est pas le
// propriétaire (ou personne), on bloque l'affichage par un voile.
//
// ⚠️ Ceci est une garde d'INTERFACE. La vraie sécurité des données
// reste la RLS Supabase (chaque user ne voit que ses propres lignes).
// ============================================================
(function () {
  "use strict";
  var OWNER = "d9a1985a-e106-4ea5-9ada-cac775c0b820";
  var KEY = "sb-rnuripmfozlxenryxhdc-auth-token";

  function uid() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      var tok = o.access_token || (o.currentSession && o.currentSession.access_token);
      if (!tok) return null;
      var seg = tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      var p = JSON.parse(decodeURIComponent(escape(atob(seg))));
      // exp en secondes — si expiré, on traite comme non connecté
      if (p.exp && (Date.now() / 1000) > p.exp) return null;
      return p.sub || null;
    } catch (e) { return null; }
  }

  function voile(titre, msg) {
    var d = document.createElement("div");
    d.id = "tlx-prive-voile";
    d.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0a0a0f;color:#e8e8e8;" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;" +
      "padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
    d.innerHTML =
      '<div style="font-size:3rem;margin-bottom:12px;">🔒</div>' +
      '<div style="font-size:1.2rem;font-weight:700;color:#ff3b3b;margin-bottom:8px;">' + titre + '</div>' +
      '<div style="color:#aaa;max-width:340px;line-height:1.5;">' + msg + '</div>' +
      '<a href="/pro" style="margin-top:18px;background:#ff7a00;color:#1a0d00;font-weight:700;' +
      'padding:12px 18px;border-radius:10px;text-decoration:none;">Se connecter</a>';
    (document.body || document.documentElement).appendChild(d);
  }

  function check() {
    var u = uid();
    if (u === OWNER) return;                 // c'est toi → accès permis
    if (!u) voile("Projet personnel", "Connecte-toi avec ton compte pour accéder à ton système.");
    else    voile("Projet personnel", "Cette section est réservée au propriétaire du système.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check);
  else check();

  window.TilexPrive = { uid: uid, OWNER: OWNER, estProprietaire: function () { return uid() === OWNER; } };
})();
