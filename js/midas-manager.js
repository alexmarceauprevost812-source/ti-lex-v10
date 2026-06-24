/* ============================================================
   MIDAS — CHEF D'ORCHESTRE (window.MidasManager)
   ti-lex-AL v10 · Produit du Québec ⚜️
   ------------------------------------------------------------
   Point d'entrée unique de l'agent finance MIDAS :
   - recherche()      : recherche web finance (Canada/USA) via Edge Function
   - analyserActif()  : analyse approfondie crypto/action (Claude + données)
   - rendreVerdict()  : affiche un verdict de scoring (HTML)
   - disclaimer()     : bandeau légal, attaché PARTOUT (protège la plateforme)

   Tout passe par l'Edge Function `midas-agent` (clés API serveur).
   ============================================================ */

(function () {
  "use strict";

  const M = {};

  M.config = {
    endpoint: "https://rnuripmfozlxenryxhdc.supabase.co/functions/v1/midas-agent",
    supabase: null
  };

  M.DISCLAIMER =
    "⚠️ Information éducative — PAS un conseil financier personnalisé. " +
    "Les signaux MIDAS ne garantissent aucun rendement. Faites vos propres " +
    "recherches et consultez un conseiller inscrit à l'AMF avant d'investir. " +
    "La gestion du risque (taille de position, stop-loss) reste votre responsabilité.";

  M.init = function (options) {
    try {
      options = options || {};
      Object.assign(M.config, options);
      console.log("[MIDAS] Manager initialisé.");
      return true;
    } catch (e) {
      console.error("[MIDAS] init manager:", e);
      return false;
    }
  };

  /* --- Jeton de session --- */
  M._jeton = function () {
    return new Promise(function (resolve) {
      try {
        if (!M.config.supabase) { resolve(null); return; }
        M.config.supabase.auth.getSession().then(function (res) {
          resolve(res && res.data && res.data.session ? res.data.session.access_token : null);
        }).catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  };

  /* --- Appel générique à l'Edge Function MIDAS --- */
  M.appeler = function (corps) {
    return new Promise(function (resolve, reject) {
      M._jeton().then(function (jeton) {
        if (!jeton) { reject(new Error("Connecte-toi pour utiliser MIDAS.")); return; }
        fetch(M.config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + jeton
          },
          body: JSON.stringify(corps)
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (res) {
            if (!res.ok || res.d.error) throw new Error(res.d.error || "Erreur MIDAS");
            resolve(res.d);
          })
          .catch(reject);
      });
    });
  };

  /* --- Recherche web finance approfondie (Canada/USA) ---
         marche : "CA" | "US" | "both" */
  M.recherche = function (sujet, marche) {
    if (!sujet || !sujet.trim()) {
      return Promise.reject(new Error("Donne un sujet de recherche."));
    }
    return M.appeler({ action: "recherche", sujet: sujet.trim(), marche: marche || "both" })
      .then(function (d) { return d.analyse; });
  };

  /* --- Analyse approfondie d'un actif (crypto ou action) ---
         On envoie les indicateurs déjà calculés côté client pour que
         Claude INTERPRÈTE (jamais inventer un prix). */
  M.analyserActif = function (type, symbole, indicateurs, verdict) {
    return M.appeler({
      action: "analyse_actif",
      type_actif: type,            // "crypto" | "action"
      symbole: symbole,
      indicateurs: indicateurs,
      verdict: verdict
    }).then(function (d) { return d.analyse; });
  };

  /* --- Bandeau disclaimer (HTML) — à insérer partout --- */
  M.disclaimer = function () {
    return '<div class="midas-disclaimer" style="font-size:.72rem;line-height:1.4;color:#b8b8c0;' +
      'border:1px solid #ffcf4a33;background:#ffcf4a0d;border-radius:10px;padding:8px 12px;' +
      'margin-top:10px;font-family:var(--font-tilex, monospace)">' +
      M.DISCLAIMER + '</div>';
  };

  /* --- Rend un verdict de scoring en HTML (carte) --- */
  M.rendreVerdict = function (actif) {
    try {
      const v = actif.verdict;
      if (!v) return '<div class="midas-carte">Données insuffisantes pour ' +
        (actif.symbole || actif.nom || "?") + '.</div>';

      const couleur = v.couleur || "#ffcf4a";
      const fmt = function (x, suf) {
        return x == null ? "n/d" : (typeof x === "number" ? x.toFixed(2) : x) + (suf || "");
      };
      const ind = actif.indicateurs || {};

      let raisonsHtml = "";
      (v.raisons || []).slice(0, 5).forEach(function (r) {
        raisonsHtml += '<li style="margin:2px 0">• ' + r + '</li>';
      });

      return '' +
        '<div class="midas-carte" style="border:1px solid #2a2a33;border-left:4px solid ' + couleur +
          ';background:#0c0c11;border-radius:12px;padding:14px 16px;margin:10px 0;' +
          'font-family:var(--font-tilex, monospace);color:#e6e6ea">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
            '<strong style="font-size:1rem">' + (actif.symbole || "") + ' · ' + (actif.nom || "") + '</strong>' +
            '<span style="font-size:.78rem;color:#888">' + fmt(actif.prix) + ' ' +
              (actif.var24h != null ? '(' + (actif.var24h >= 0 ? '+' : '') + actif.var24h.toFixed(2) + '% 24h)' : '') +
            '</span>' +
          '</div>' +
          '<div style="margin-top:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
            '<span style="color:' + couleur + ';font-weight:700;font-size:.95rem">' + v.etiquette + '</span>' +
            '<span style="font-size:.75rem;color:#aaa">Score ' + v.score + '/100</span>' +
            '<span style="font-size:.75rem;color:#aaa">Confluence ' + v.confluence + '%</span>' +
            '<span style="font-size:.75rem;color:#aaa">' + v.nbIndicateurs + ' indicateurs</span>' +
          '</div>' +
          '<div style="margin-top:8px;font-size:.74rem;color:#9a9aa2;display:flex;gap:14px;flex-wrap:wrap">' +
            '<span>RSI ' + fmt(ind.rsi) + '</span>' +
            '<span>MACD ' + (ind.macd ? fmt(ind.macd.histogramme) : 'n/d') + '</span>' +
            '<span>%B ' + (ind.bollinger ? fmt(ind.bollinger.pctB) : 'n/d') + '</span>' +
            '<span>Stoch ' + (ind.stochastique ? fmt(ind.stochastique.k) : 'n/d') + '</span>' +
          '</div>' +
          (raisonsHtml ? '<ul style="margin:8px 0 0;padding:0;list-style:none;font-size:.76rem;color:#c8c8d0">' + raisonsHtml + '</ul>' : '') +
          (v.stopLossSuggere != null
            ? '<div style="margin-top:8px;font-size:.75rem;color:#ff9e7d">Stop-loss suggéré (2× ATR) : ' + v.stopLossSuggere + '</div>'
            : '') +
          M.disclaimer() +
        '</div>';
    } catch (e) {
      console.error("[MIDAS] rendreVerdict:", e);
      return '<div class="midas-carte">Erreur d\'affichage.</div>';
    }
  };

  /* --- Analyse locale rapide d'une série de prix (sans appel réseau) ---
         Pratique pour une analyse instantanée côté client. */
  M.analyserPrixLocal = function (closes) {
    try {
      const ind = window.MidasIndicateurs.analyserComplet(closes);
      const verdict = ind ? window.MidasScoring.evaluer(ind) : null;
      return { indicateurs: ind, verdict: verdict };
    } catch (e) {
      console.error("[MIDAS] analyserPrixLocal:", e);
      return null;
    }
  };

  window.MidasManager = M;
  console.log("[MIDAS] Manager chargé.");
})();
