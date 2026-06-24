/* ============================================================
   MIDAS — SCANNER ACTIONS (Bourse US + Canada/TSX)
   ti-lex-AL v10 · Produit du Québec ⚜️
   ------------------------------------------------------------
   Les données boursières exigent une clé API (Finnhub pour US,
   FMP/Questrade pour le TSX). On NE met JAMAIS ces clés dans le
   navigateur : tout passe par l'Edge Function `midas-agent`
   (action "scan_actions"), qui les garde dans les secrets Supabase.

   Format des symboles :
   - US (NYSE/NASDAQ) : "AAPL", "TSLA", "NVDA"
   - TSX (Canada)     : "SHOP.TO", "RY.TO", "TD.TO"  (suffixe .TO)
   ============================================================ */

(function () {
  "use strict";

  const A = {};

  A.config = {
    endpoint: "https://rnuripmfozlxenryxhdc.supabase.co/functions/v1/midas-agent",
    supabase: null,          // client Supabase (obligatoire pour l'auth)
    intervalleScanMs: 120000, // 2 min (rate limit Finnhub plus serré)
    seuilChuteJour: -4,      // % sur la journée qui déclenche une alerte
    seuilChuteInterScan: -3, // % depuis le dernier scan
    surAlerte: null
  };

  A._timer = null;
  A._precedent = {};
  A._watchlist = [];
  A._enCours = false;

  A.init = function (options) {
    try {
      options = options || {};
      Object.assign(A.config, options);
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(function () {});
      }
      console.log("[MIDAS] Scanner actions initialisé.");
      return true;
    } catch (e) {
      console.error("[MIDAS] init actions:", e);
      return false;
    }
  };

  /* --- Définit la liste de symboles à surveiller --- */
  A.definirWatchlist = function (symboles) {
    A._watchlist = Array.isArray(symboles) ? symboles.slice() : [];
  };

  /* --- Jeton d'accès de la session courante --- */
  A._jeton = function () {
    return new Promise(function (resolve) {
      try {
        if (!A.config.supabase) { resolve(null); return; }
        A.config.supabase.auth.getSession().then(function (res) {
          resolve(res && res.data && res.data.session ? res.data.session.access_token : null);
        }).catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  };

  /* --- Appel générique à l'Edge Function MIDAS --- */
  A._appeler = function (corps) {
    return new Promise(function (resolve, reject) {
      A._jeton().then(function (jeton) {
        if (!jeton) { reject(new Error("Non connecté — connecte-toi pour scanner.")); return; }
        fetch(A.config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + jeton
          },
          body: JSON.stringify(corps)
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (res) {
            if (!res.ok || res.d.error) {
              throw new Error(res.d.error || "Erreur Edge Function");
            }
            resolve(res.d);
          })
          .catch(reject);
      });
    });
  };

  /* --- Récupère les cotations des symboles surveillés --- */
  A.chargerCotations = function (symboles) {
    const liste = symboles || A._watchlist;
    return A._appeler({ action: "scan_actions", symboles: liste })
      .then(function (d) { return d.resultats || []; });
  };

  /* --- Détecte une chute rapide sur une cotation --- */
  A.detecterChute = function (cot) {
    try {
      const alertes = [];
      if (cot.variationPct != null && cot.variationPct <= A.config.seuilChuteJour) {
        alertes.push({ type: "chute_jour", gravite: "moyenne", valeur: cot.variationPct });
      }
      const prec = A._precedent[cot.symbole];
      if (prec && prec.prix && cot.prix) {
        const delta = ((cot.prix - prec.prix) / prec.prix) * 100;
        if (delta <= A.config.seuilChuteInterScan) {
          alertes.push({ type: "chute_inter_scan", gravite: "haute", valeur: delta });
        }
      }
      return alertes;
    } catch (e) {
      console.error("[MIDAS] detecterChute actions:", e);
      return [];
    }
  };

  /* --- Notifie l'utilisateur --- */
  A.notifier = function (cot, alerte) {
    try {
      const txt = "⚠️ " + cot.symbole + " : " + alerte.type.replace(/_/g, " ") +
        " (" + (alerte.valeur != null ? alerte.valeur.toFixed(2) : "?") + "%)";

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("MIDAS — Alerte action", {
          body: cot.symbole + " — " + txt + " · Prix : " + cot.prix
        });
      }
      if (typeof window.showToast === "function") window.showToast(txt, "warning");
      else console.warn("[MIDAS]", txt);

      if (A.config.supabase) {
        A.config.supabase.auth.getUser().then(function (res) {
          const uid = res && res.data && res.data.user ? res.data.user.id : null;
          if (!uid) return;
          A.config.supabase.from("midas_alertes").insert({
            user_id: uid,
            type_actif: "action",
            symbole: cot.symbole,
            type_alerte: alerte.type,
            gravite: alerte.gravite,
            prix: cot.prix,
            variation_pct: alerte.valeur,
            message: txt
          }).then(function (r) {
            if (r.error) console.error("[MIDAS] insert alerte action:", r.error.message);
          });
        });
      }

      if (typeof A.config.surAlerte === "function") {
        try { A.config.surAlerte({ cotation: cot, alerte: alerte }); } catch (e2) {}
      }
    } catch (e) {
      console.error("[MIDAS] notifier action:", e);
    }
  };

  /* --- Un cycle de scan --- */
  A.scanner = function () {
    return new Promise(function (resolve) {
      if (A._enCours || A._watchlist.length === 0) { resolve([]); return; }
      A._enCours = true;
      A.chargerCotations()
        .then(function (cotations) {
          for (let i = 0; i < cotations.length; i++) {
            const c = cotations[i];
            const alertes = A.detecterChute(c);
            c.alertes = alertes;
            for (let j = 0; j < alertes.length; j++) A.notifier(c, alertes[j]);
            A._precedent[c.symbole] = { prix: c.prix, t: Date.now() };
          }
          A._enCours = false;
          resolve(cotations);
        })
        .catch(function (e) {
          A._enCours = false;
          console.error("[MIDAS] scanner actions:", e);
          if (typeof window.showToast === "function") {
            window.showToast("MIDAS : échec du scan actions (" + e.message + ")", "error");
          }
          resolve([]);
        });
    });
  };

  A.demarrer = function () {
    try {
      A.arreter();
      A.scanner();
      A._timer = setInterval(A.scanner, A.config.intervalleScanMs);
      console.log("[MIDAS] Scan actions continu démarré.");
      return true;
    } catch (e) {
      console.error("[MIDAS] demarrer actions:", e);
      return false;
    }
  };

  A.arreter = function () {
    if (A._timer) { clearInterval(A._timer); A._timer = null; }
  };

  window.MidasActions = A;
  console.log("[MIDAS] Scanner actions chargé.");
})();
