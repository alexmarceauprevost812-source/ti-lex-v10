/* ============================================================================
   public/tilex-leurre.js
   Couche LEURRE (honeypot / tarpit) pour ti-lex — Produit du Québec
   Protège contre la lecture non autorisée : front, données, code.

   PRINCIPE 100% DÉFENSIF ET LÉGAL :
     - On DÉTECTE la lecture automatisée / non autorisée
     - On SERT du faux contenu (leurre) au lieu du vrai
     - On REDIRIGE l'intrus sur un chemin-piège
     - On LOGGE l'intrusion pour traçage
   AUCUN code qui endommage, infecte ou prend le contrôle de la machine du
   lecteur. C'est un leurre, pas une arme.

   Conventions ti-lex : vanilla JS pur, globals sur window, try/catch partout,
   commentaires FR, showToast gardé.
   ============================================================================ */

(function () {
  'use strict';

  // Canary : identifiant unique de build. Si tu retrouves cette chaîne ailleurs,
  // c'est que ton code a été copié. Change-la à chaque déploiement important.
  var CANARY = 'tilex-canary-7Q4K-NORMANDIN-2026';

  var CONFIG = {
    SUPABASE_URL: 'https://rnuripmfozlxenryxhdc.supabase.co',
    SUPABASE_KEY: 'REMPLACE_PAR_TA_CLE_PUBLIABLE',
    GARDIEN_FN: 'tilex-gardien',
    // Domaines où le code a le DROIT de rouler (verrou de domaine).
    HOTES_AUTORISES: ['localhost', '127.0.0.1', 'ton-domaine.com', 'www.ton-domaine.com'],
    // Chemin-piège où on redirige les intrus.
    CHEMIN_PIEGE: '/zone-interdite.html',
    // Seuil de suspicion (score >=) pour déclencher le leurre.
    SEUIL: 3
  };

  /* --------------------------------------------------------------------------
     1. Calcul d'un score de suspicion (signaux réels, pas de fausse magie)
     -------------------------------------------------------------------------- */
  function scoreSuspicion() {
    var score = 0;
    try {
      var nav = window.navigator || {};
      var ua = (nav.userAgent || '').toLowerCase();

      // a) Automatisation déclarée
      if (nav.webdriver === true) { score += 3; }

      // b) Signatures de scrapers / headless connus
      var motsBots = ['headlesschrome', 'phantomjs', 'python-requests', 'scrapy',
        'curl/', 'wget', 'go-http-client', 'libwww', 'httpclient', 'bot', 'spider', 'crawler'];
      for (var i = 0; i < motsBots.length; i++) {
        if (ua.indexOf(motsBots[i]) !== -1) { score += 3; break; }
      }

      // c) Environnement headless typique
      if (!nav.languages || nav.languages.length === 0) { score += 1; }
      if (nav.plugins && nav.plugins.length === 0 && ua.indexOf('chrome') !== -1) { score += 1; }

      // d) Verrou de domaine : code exécuté sur un hôte non autorisé
      var hote = (window.location && window.location.hostname) || '';
      if (hote && CONFIG.HOTES_AUTORISES.indexOf(hote) === -1) { score += 5; }

      // e) Piège honeypot déjà déclenché (voir plus bas)
      if (window.__tilexHoneypotTouche === true) { score += 4; }
    } catch (e) {
      // En cas d'erreur d'analyse, on ne pénalise pas l'utilisateur normal.
    }
    return score;
  }

  /* --------------------------------------------------------------------------
     2. Pose des pièges honeypot (liens + champ invisibles que seuls les bots
        suivent ou remplissent). Un humain ne les voit jamais.
     -------------------------------------------------------------------------- */
  function poserHoneypots() {
    try {
      window.__tilexHoneypotTouche = false;

      // Lien-piège invisible
      var lien = document.createElement('a');
      lien.href = CONFIG.CHEMIN_PIEGE;
      lien.textContent = 'Index complet';
      lien.setAttribute('aria-hidden', 'true');
      lien.tabIndex = -1;
      lien.style.cssText =
        'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;';
      lien.addEventListener('click', function (ev) {
        window.__tilexHoneypotTouche = true;
        if (ev && ev.preventDefault) { ev.preventDefault(); }
        declencherLeurre('honeypot-lien');
      });

      // Champ-piège invisible (les bots remplissent tout)
      var champ = document.createElement('input');
      champ.type = 'text';
      champ.name = 'site_url_confirm';
      champ.autocomplete = 'off';
      champ.tabIndex = -1;
      champ.setAttribute('aria-hidden', 'true');
      champ.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:1px;';
      champ.addEventListener('input', function () {
        window.__tilexHoneypotTouche = true;
        declencherLeurre('honeypot-champ');
      });

      var cible = document.body || document.documentElement;
      if (cible) {
        cible.appendChild(lien);
        cible.appendChild(champ);
      }
    } catch (e) {
      // On ne casse jamais la page à cause des pièges.
    }
  }

  /* --------------------------------------------------------------------------
     3. Signalement de l'intrusion au gardien (pour traçage / log)
     -------------------------------------------------------------------------- */
  function signalerIntrusion(raison) {
    try {
      var url = CONFIG.SUPABASE_URL + '/functions/v1/' + CONFIG.GARDIEN_FN;
      var charge = {
        event: 'report',
        raison: raison || 'inconnue',
        hote: (window.location && window.location.hostname) || '',
        chemin: (window.location && window.location.pathname) || '',
        canary: CANARY,
        ua: (window.navigator && window.navigator.userAgent) || ''
      };
      // sendBeacon survit même si la page se ferme/redirige.
      if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify(charge)], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_KEY },
          body: JSON.stringify(charge),
          keepalive: true
        }).catch(function () { /* silencieux */ });
      }
    } catch (e) {
      // silencieux : un échec de log ne doit rien casser
    }
  }

  /* --------------------------------------------------------------------------
     4. Activation du leurre : on remplace le vrai contenu par du faux,
        on log, pis on redirige sur le chemin-piège.
     -------------------------------------------------------------------------- */
  function declencherLeurre(raison) {
    try {
      signalerIntrusion(raison);

      // a) On « mange » la vraie lecture : le DOM est remplacé par du leurre.
      try {
        if (document.body) {
          document.body.innerHTML =
            '<div style="font-family:system-ui;padding:40px;color:#888">' +
            '<h1>Chargement…</h1><p>Veuillez patienter.</p></div>';
        }
      } catch (e) { /* ignore */ }

      // b) On bloque l'app réelle si elle n'a pas encore démarré.
      window.__tilexBloque = true;

      // c) Redirection vers le chemin-piège (remplace l'historique).
      setTimeout(function () {
        try { window.location.replace(CONFIG.CHEMIN_PIEGE); } catch (e) { /* ignore */ }
      }, 400);
    } catch (e) {
      // dernier recours
    }
  }

  /* --------------------------------------------------------------------------
     5. Garde publique : à appeler AVANT d'initialiser l'app réelle.
        Retourne true si l'environnement est sûr, false si leurre déclenché.
     -------------------------------------------------------------------------- */
  function verifier() {
    try {
      poserHoneypots();
      var score = scoreSuspicion();
      if (score >= CONFIG.SEUIL) {
        declencherLeurre('score:' + score);
        return false;
      }
      return true;
    } catch (e) {
      // En cas de doute on laisse passer l'humain (on ne bloque pas par erreur).
      return true;
    }
  }

  /* --------------------------------------------------------------------------
     6. Exposition
     -------------------------------------------------------------------------- */
  window.TilexLeurre = {
    config: CONFIG,
    canary: CANARY,
    verifier: verifier,
    scoreSuspicion: scoreSuspicion,
    declencherLeurre: declencherLeurre,
    signalerIntrusion: signalerIntrusion,
    estBloque: function () { return window.__tilexBloque === true; }
  };

})();
