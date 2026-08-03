/* ============================================================
   MIDAS — SCANNER CRYPTO
   ti-lex-AL v10 · Produit du Québec ⚜️
   ------------------------------------------------------------
   Scanne BTC + le top des cryptos (CoinGecko), calcule les
   indicateurs via window.MidasIndicateurs / MidasScoring,
   détecte les chutes rapides, et notifie l'utilisateur.

   Données : CoinGecko Demo (gratuit, ~30 appels/min, 10k/mois).
   - Sans clé : API publique keyless (limite plus basse).
   - Avec clé Demo : passe-la à MidasCrypto.init({ cleDemo: "..." }).
     ⚠️ La clé Demo CoinGecko est à débit limité et non sensible,
     mais pour la cacher complètement, route via l'Edge Function.

   Attribution requise par CoinGecko : « Données fournies par CoinGecko ».
   ============================================================ */

(function () {
  "use strict";

  const C = {};

  C.config = {
    base: "https://api.coingecko.com/api/v3",
    cleDemo: null,          // clé Demo optionnelle (x_cg_demo_api_key)
    devise: "cad",         // 🇨🇦 dollars canadiens (CoinGecko: vs_currency)
    nbCryptos: 10,          // top N par capitalisation
    intervalleScanMs: 60000, // re-scan chaque 60 s
    seuilChute1h: -5,       // % sur 1h qui déclenche une alerte
    seuilChute24h: -12,     // % sur 24h qui déclenche une alerte
    seuilZscore: -3,        // z-score des rendements qui déclenche une alerte
    supabase: null,         // client Supabase (optionnel, pour journaliser)
    surAlerte: null         // callback(alerte) optionnel (ex. brancher une exécution GÉRÉE)
  };

  C._timer = null;
  C._precedent = {};   // dernier snapshot par coin (pour deltas inter-scans)
  C._enCours = false;

  /* --- Initialisation --- */
  C.init = function (options) {
    try {
      options = options || {};
      Object.assign(C.config, options);
      // Demande la permission de notification du navigateur (non bloquant)
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(function () {});
      }
      console.log("[MIDAS] Scanner crypto initialisé.");
      return true;
    } catch (e) {
      console.error("[MIDAS] init crypto:", e);
      return false;
    }
  };

  /* --- Construit l'URL avec la clé Demo si fournie --- */
  C._url = function (chemin, params) {
    const u = new URL(C.config.base + chemin);
    if (params) {
      for (const k in params) u.searchParams.set(k, params[k]);
    }
    if (C.config.cleDemo) u.searchParams.set("x_cg_demo_api_key", C.config.cleDemo);
    return u.toString();
  };

  /* --- Récupère le marché : top N cryptos avec sparkline 7j + variations --- */
  C.chargerMarche = function () {
    return new Promise(function (resolve, reject) {
      try {
        const url = C._url("/coins/markets", {
          vs_currency: C.config.devise,
          order: "market_cap_desc",
          per_page: C.config.nbCryptos,
          page: 1,
          sparkline: "true",
          price_change_percentage: "1h,24h,7d"
        });
        fetch(url, { headers: { accept: "application/json" } })
          .then(function (r) {
            if (!r.ok) throw new Error("CoinGecko HTTP " + r.status);
            return r.json();
          })
          .then(function (data) {
            if (!Array.isArray(data)) throw new Error("Réponse CoinGecko inattendue");
            resolve(data);
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  };

  /* --- Récupère les chandelles OHLC d'un coin (analyse approfondie) --- */
  C.chargerOHLC = function (idCoin, jours) {
    return new Promise(function (resolve, reject) {
      try {
        const url = C._url("/coins/" + idCoin + "/ohlc", {
          vs_currency: C.config.devise,
          days: jours || 14
        });
        fetch(url, { headers: { accept: "application/json" } })
          .then(function (r) {
            if (!r.ok) throw new Error("CoinGecko OHLC HTTP " + r.status);
            return r.json();
          })
          .then(function (arr) {
            // arr = [[ts, o, h, l, c], ...]
            const bougies = (arr || []).map(function (x) {
              return { t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: 0 };
            });
            resolve(bougies);
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  };

  /* --- Indice Fear & Greed (sentiment contrarian, gratuit) --- */
  C.chargerFearGreed = function () {
    return new Promise(function (resolve) {
      try {
        fetch("https://api.alternative.me/fng/?limit=1")
          .then(function (r) { return r.json(); })
          .then(function (d) {
            const v = d && d.data && d.data[0];
            resolve(v ? { valeur: +v.value, classification: v.value_classification } : null);
          })
          .catch(function () { resolve(null); });
      } catch (e) {
        resolve(null);
      }
    });
  };

  /* --- Analyse un coin du marché (calcule indicateurs + verdict) --- */
  C.analyserCoin = function (coin) {
    try {
      const closes = coin.sparkline_in_7d && coin.sparkline_in_7d.price
        ? coin.sparkline_in_7d.price.slice()
        : [];
      const ind = window.MidasIndicateurs.analyserComplet(closes);
      const verdict = ind ? window.MidasScoring.evaluer(ind) : null;
      return {
        id: coin.id,
        symbole: (coin.symbol || "").toUpperCase(),
        nom: coin.name,
        prix: coin.current_price,
        capitalisation: coin.market_cap,
        rang: coin.market_cap_rank,
        var1h: coin.price_change_percentage_1h_in_currency,
        var24h: coin.price_change_percentage_24h_in_currency,
        var7j: coin.price_change_percentage_7d_in_currency,
        volume24h: coin.total_volume,
        image: coin.image,
        indicateurs: ind,
        verdict: verdict
      };
    } catch (e) {
      console.error("[MIDAS] analyserCoin:", e);
      return null;
    }
  };

  /* --- Détecte une chute rapide sur un coin analysé --- */
  C.detecterChute = function (a) {
    try {
      const alertes = [];
      // 1) Variation 1h sous le seuil
      if (a.var1h != null && a.var1h <= C.config.seuilChute1h) {
        alertes.push({ type: "chute_1h", gravite: "haute", valeur: a.var1h });
      }
      // 2) Variation 24h sous le seuil
      if (a.var24h != null && a.var24h <= C.config.seuilChute24h) {
        alertes.push({ type: "chute_24h", gravite: "moyenne", valeur: a.var24h });
      }
      // 3) Anomalie z-score (mouvement extrême vs récent)
      if (a.indicateurs && a.indicateurs.zscore && a.indicateurs.zscore.z <= C.config.seuilZscore) {
        alertes.push({ type: "anomalie_zscore", gravite: "haute", valeur: a.indicateurs.zscore.z });
      }
      // 4) Delta inter-scan (chute depuis le dernier scan)
      const prec = C._precedent[a.id];
      if (prec && prec.prix && a.prix) {
        const delta = ((a.prix - prec.prix) / prec.prix) * 100;
        if (delta <= C.config.seuilChute1h) {
          alertes.push({ type: "chute_inter_scan", gravite: "haute", valeur: delta });
        }
      }
      return alertes;
    } catch (e) {
      console.error("[MIDAS] detecterChute:", e);
      return [];
    }
  };

  /* --- Notifie l'utilisateur (navigateur + toast + journal Supabase) --- */
  C.notifier = function (coin, alerte) {
    try {
      const txt = "⚠️ " + coin.symbole + " : " + alerte.type.replace(/_/g, " ") +
        " (" + (alerte.valeur != null ? alerte.valeur.toFixed(2) : "?") +
        (alerte.type.indexOf("zscore") >= 0 ? "σ" : "%") + ")";

      // Notification navigateur
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("MIDAS — Alerte crypto", {
          body: coin.nom + " — " + txt + "\nVerdict : " +
            (coin.verdict ? coin.verdict.etiquette : "n/d"),
          icon: coin.image
        });
      }

      // Toast ti-lex (si dispo)
      if (typeof window.showToast === "function") {
        window.showToast(txt, "warning");
      } else {
        console.warn("[MIDAS]", txt);
      }

      // Journalisation Supabase (RLS protège par user_id)
      if (C.config.supabase) {
        C.config.supabase.auth.getUser().then(function (res) {
          const uid = res && res.data && res.data.user ? res.data.user.id : null;
          if (!uid) return;
          C.config.supabase.from("midas_alertes").insert({
            user_id: uid,
            type_actif: "crypto",
            symbole: coin.symbole,
            type_alerte: alerte.type,
            gravite: alerte.gravite,
            prix: coin.prix,
            variation_pct: alerte.valeur,
            message: txt
          }).then(function (r) {
            if (r.error) console.error("[MIDAS] insert alerte:", r.error.message);
          });
        });
      }

      // Callback optionnel (ex. préparer un ordre — JAMAIS exécuté sans confirmation)
      if (typeof C.config.surAlerte === "function") {
        try { C.config.surAlerte({ coin: coin, alerte: alerte }); } catch (e2) {}
      }
    } catch (e) {
      console.error("[MIDAS] notifier:", e);
    }
  };

  /* --- Un cycle de scan complet --- */
  C.scanner = function () {
    return new Promise(function (resolve) {
      if (C._enCours) { resolve([]); return; }
      C._enCours = true;
      C.chargerMarche()
        .then(function (marche) {
          const resultats = [];
          for (let i = 0; i < marche.length; i++) {
            const a = C.analyserCoin(marche[i]);
            if (!a) continue;
            const alertes = C.detecterChute(a);
            a.alertes = alertes;
            for (let j = 0; j < alertes.length; j++) C.notifier(a, alertes[j]);
            C._precedent[a.id] = { prix: a.prix, t: Date.now() };
            resultats.push(a);
          }
          C._enCours = false;
          resolve(resultats);
        })
        .catch(function (e) {
          C._enCours = false;
          console.error("[MIDAS] scanner:", e);
          if (typeof window.showToast === "function") {
            window.showToast("MIDAS : échec du scan crypto (" + e.message + ")", "error");
          }
          resolve([]);
        });
    });
  };

  /* --- Démarre le scan en continu (« scan fois multiplié ») --- */
  C.demarrer = function () {
    try {
      C.arreter();
      C.scanner(); // premier scan immédiat
      C._timer = setInterval(C.scanner, C.config.intervalleScanMs);
      console.log("[MIDAS] Scan crypto continu démarré (" +
        (C.config.intervalleScanMs / 1000) + "s).");
      return true;
    } catch (e) {
      console.error("[MIDAS] demarrer:", e);
      return false;
    }
  };

  /* --- Arrête le scan --- */
  C.arreter = function () {
    if (C._timer) { clearInterval(C._timer); C._timer = null; }
  };

  window.MidasCrypto = C;
  console.log("[MIDAS] Scanner crypto chargé.");
})();
