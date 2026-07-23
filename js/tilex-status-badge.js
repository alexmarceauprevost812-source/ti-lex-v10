/* ============================================================
   js/tilex-status-badge.js — Badge de statut agent temps réel
   ti-lex-AL v10 — Alex Marceau-Prévost
   Montre EN TEMPS RÉEL, à côté de l'avatar de l'agent, sur quoi
   l'agent se connecte (outil/API) avant de répondre :
   🔍 Recherche web… → 📈 Consultation bourse… → disparaît.
   Logos OFFICIELS (SVG inline) pour GitHub, YouTube, Vercel.
   API :
     TilexStatusBadge.montrer(avatarEl, cle)  -> affiche/change le badge
     TilexStatusBadge.masquer()               -> retire le badge (fondu)
   Zéro dépendance. S'auto-charge le CSS si la feuille est absente.
   ============================================================ */

(function () {
  'use strict';

  /* ─── Logos officiels (SVG inline, monochromes = couleur du badge) ─── */
  var SVG_GITHUB = '<svg class="tsb-svg" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
  var SVG_YOUTUBE = '<svg class="tsb-svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></svg>';
  var SVG_VERCEL = '<svg class="tsb-svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 24 22H0L12 2z"/></svg>';
  var SVG_WEB = '<svg class="tsb-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

  /* ─── Chaque outil/API → logo (SVG officiel ou emoji) + texte ─── */
  var OUTILS = {
    web_search:                { logo: SVG_WEB,    txt: 'Recherche web' },
    web_search_start:          { logo: SVG_WEB,    txt: 'Recherche web' },
    web_search_done:           { logo: SVG_WEB,    txt: 'Résultats trouvés' },
    get_stock_quote:           { logo: '📈',       txt: 'Consultation bourse' },
    get_company_profile:       { logo: '📈',       txt: 'Profil d’entreprise' },
    recherche_media:           { logo: '🖼️',      txt: 'Recherche de photos/vidéos' },
    recherche_youtube:         { logo: SVG_YOUTUBE, txt: 'Recherche YouTube' },
    lancer_scan_securite:      { logo: '🛡️',      txt: 'Scan de sécurité SILEX' },
    lire_dernier_scan:         { logo: '🛡️',      txt: 'Lecture du dernier scan' },
    analyser_journal_securite: { logo: '📋',       txt: 'Analyse du journal sécurité' },
    pousser_code_github:       { logo: SVG_GITHUB, txt: 'Connexion GitHub' },
    diagnostic_deploiement:    { logo: SVG_VERCEL, txt: 'Vérification du déploiement' },
    memoire:                   { logo: '🧠',       txt: 'Lecture de la mémoire' },
    image:                     { logo: '🎨',       txt: 'Génération d’image' },
  };
  var DEFAUT = { logo: '🔧', txt: '' };

  var _badge = null;   // élément .tsb-badge actif (un seul à la fois)
  var _ancre = null;   // avatar auquel il est accroché
  var _hideTimer = null;

  /* Charge la feuille de style si elle est pas déjà dans la page. */
  function _assurerCSS() {
    if (document.querySelector('link[href*="tilex-status-badge.css"]')) return;
    if (document.getElementById('tsb-css-fallback')) return;
    var l = document.createElement('link');
    l.id = 'tsb-css-fallback';
    l.rel = 'stylesheet';
    l.href = '/css/tilex-status-badge.css';
    document.head.appendChild(l);
  }

  /* Affiche (ou met à jour) le badge à côté de l'avatar donné.
     avatarEl : l'élément avatar de l'agent (ex. .cmsg-ico de la bulle)
     cle      : nom de l'outil (tool_name du SSE) ou clé du map OUTILS */
  function montrer(avatarEl, cle) {
    if (!avatarEl || !avatarEl.appendChild) return;
    _assurerCSS();
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

    var info = OUTILS[String(cle || '')] || DEFAUT;
    var txt = info.txt || String(cle || 'Connexion');
    var logo = info.logo || DEFAUT.logo;
    var estSvg = logo.charAt(0) === '<';

    // Nouvel avatar (nouvelle bulle) → on déplace le badge.
    if (_badge && _ancre !== avatarEl) masquerImmediat();

    if (!_badge) {
      avatarEl.classList.add('tsb-anchor');
      _badge = document.createElement('div');
      _badge.className = 'tsb-badge';
      _badge.setAttribute('role', 'status');
      _badge.setAttribute('aria-live', 'polite');
      avatarEl.appendChild(_badge);
      _ancre = avatarEl;
    }
    _badge.classList.remove('tsb-out');
    _badge.innerHTML =
      '<span class="tsb-dot"></span>' +
      '<span class="tsb-ico">' + (estSvg ? logo : _esc(logo)) + '</span>' +
      '<span class="tsb-txt">' + _esc(txt) + '</span>';
  }

  /* Retire le badge en douceur (fondu de sortie). */
  function masquer() {
    if (!_badge) return;
    var b = _badge, a = _ancre;
    _badge = null; _ancre = null;
    b.classList.add('tsb-out');
    _hideTimer = setTimeout(function () {
      try { b.remove(); } catch (e) {}
      try { if (a && !a.querySelector('.tsb-badge')) a.classList.remove('tsb-anchor'); } catch (e) {}
      _hideTimer = null;
    }, 220);
  }

  /* Retrait immédiat (changement d'ancre). */
  function masquerImmediat() {
    if (!_badge) return;
    try { _badge.remove(); } catch (e) {}
    try { if (_ancre && !_ancre.querySelector('.tsb-badge')) _ancre.classList.remove('tsb-anchor'); } catch (e) {}
    _badge = null; _ancre = null;
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.TilexStatusBadge = { montrer: montrer, masquer: masquer, OUTILS: OUTILS };
})();
