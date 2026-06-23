/* ============================================================================
   public/tableau-intrusions.js
   Tableau de bord des intrusions — ti-lex, Produit du Québec
   Connexion admin → lecture via la fonction tilex-admin → rendu.
   Vanilla JS pur, globals window, try/catch partout, commentaires FR.
   ============================================================================ */
(function () {
  'use strict';

  var CONFIG = {
    SUPABASE_URL: 'https://rnuripmfozlxenryxhdc.supabase.co',
    SUPABASE_KEY: 'REMPLACE_PAR_TA_CLE_PUBLIABLE',
    ADMIN_FN: 'tilex-admin',
    RAFRAICHIR_MS: 30000
  };

  // Couleur par type de raison (pour la pastille de sévérité)
  function couleurRaison(raison) {
    raison = (raison || '').toLowerCase();
    if (raison.indexOf('honeypot') !== -1) { return '#ef4444'; }   // piège touché : rouge
    if (raison.indexOf('domaine') !== -1 || raison.indexOf('score') !== -1) { return '#f59e0b'; }
    if (raison.indexOf('debit') !== -1 || raison.indexOf('anormal') !== -1) { return '#a855f7'; }
    if (raison.indexOf('non-authentifiee') !== -1) { return '#22d3ee'; }
    return '#8a96a8';
  }

  function el(id) { return document.getElementById(id); }

  // --- Init Supabase --------------------------------------------------------
  try {
    if (window.supabase && window.supabase.createClient) {
      window.supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
  } catch (e) { console.error('Init Supabase:', e); }

  // --- Connexion ------------------------------------------------------------
  function seConnecter() {
    try {
      var courriel = el('admin-courriel').value;
      var mdp = el('admin-mdp').value;
      if (!courriel || !mdp) {
        if (window.showToast) { window.showToast('Courriel et mot de passe requis.', 'attention'); }
        return;
      }
      if (!window.supabaseClient) {
        if (window.showToast) { window.showToast('Supabase non chargé.', 'error'); }
        return;
      }
      window.supabaseClient.auth.signInWithPassword({ email: courriel, password: mdp })
        .then(function (res) {
          if (res.error) {
            if (window.showToast) { window.showToast('Connexion refusée.', 'error'); }
            return;
          }
          basculerVersTableau();
          charger();
        })
        .catch(function () {
          if (window.showToast) { window.showToast('Erreur de connexion.', 'error'); }
        });
    } catch (e) { console.error('seConnecter:', e); }
  }

  function seDeconnecter() {
    try {
      if (window.supabaseClient) {
        window.supabaseClient.auth.signOut().finally(function () {
          if (el('vue-login')) { el('vue-login').style.display = 'block'; }
          if (el('vue-tableau')) { el('vue-tableau').style.display = 'none'; }
        });
      }
    } catch (e) { console.error('seDeconnecter:', e); }
  }

  function basculerVersTableau() {
    if (el('vue-login')) { el('vue-login').style.display = 'none'; }
    if (el('vue-tableau')) { el('vue-tableau').style.display = 'block'; }
  }

  // --- Chargement des intrusions -------------------------------------------
  function charger() {
    try {
      if (!window.supabaseClient) { return; }
      window.supabaseClient.auth.getSession().then(function (s) {
        var token = s && s.data && s.data.session && s.data.session.access_token;
        if (!token) { seDeconnecter(); return; }

        fetch(CONFIG.SUPABASE_URL + '/functions/v1/' + CONFIG.ADMIN_FN, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'apikey': CONFIG.SUPABASE_KEY
          },
          body: JSON.stringify({ limite: 500 })
        }).then(function (rep) {
          if (rep.status === 403) { throw new Error('Accès refusé (pas admin).'); }
          if (!rep.ok) { throw new Error('Erreur ' + rep.status); }
          return rep.json();
        }).then(function (data) {
          rendre(data.data || []);
        }).catch(function (err) {
          if (window.showToast) { window.showToast(err.message, 'error'); }
        });
      });
    } catch (e) { console.error('charger:', e); }
  }

  // --- Rendu ----------------------------------------------------------------
  function rendre(lignes) {
    try {
      // Stats
      var total = lignes.length;
      var dernieres24 = 0, parRaison = {};
      var limite24 = Date.now() - 86400000;
      for (var i = 0; i < lignes.length; i++) {
        var t = new Date(lignes[i].created_at).getTime();
        if (t >= limite24) { dernieres24++; }
        var r = lignes[i].raison || 'inconnue';
        parRaison[r] = (parRaison[r] || 0) + 1;
      }
      if (el('stat-total')) { el('stat-total').textContent = total; }
      if (el('stat-24')) { el('stat-24').textContent = dernieres24; }
      var topRaison = '—', topN = 0;
      for (var k in parRaison) {
        if (parRaison.hasOwnProperty(k) && parRaison[k] > topN) { topN = parRaison[k]; topRaison = k; }
      }
      if (el('stat-top')) { el('stat-top').textContent = topRaison; }

      // Tableau
      var corps = el('corps-table');
      if (!corps) { return; }
      if (total === 0) {
        corps.innerHTML = '<tr><td colspan="6" class="vide">Aucune intrusion détectée. ' +
          'C\'est une bonne nouvelle.</td></tr>';
        return;
      }
      var html = '';
      for (var j = 0; j < lignes.length; j++) {
        var L = lignes[j];
        var d = new Date(L.created_at);
        var quand = d.toLocaleString('fr-CA');
        var qui = L.user_id ? ' · connecté' : '';
        html +=
          '<tr>' +
          '<td><span class="dot" style="background:' + couleurRaison(L.raison) + '"></span>' +
          echapper(L.raison) + qui + '</td>' +
          '<td>' + echapper(L.lieu) + '</td>' +
          '<td class="ua" title="' + echapper(L.ua) + '">' + echapper(L.appareil) + '</td>' +
          '<td>' + echapper(L.ip) + '</td>' +
          '<td>' + echapper(L.hote) + '</td>' +
          '<td class="quand">' + echapper(quand) + '</td>' +
          '</tr>';
      }
      corps.innerHTML = html;
    } catch (e) { console.error('rendre:', e); }
  }

  // Échappement pour éviter toute injection dans le DOM
  function echapper(s) {
    s = String(s == null ? '' : s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // --- Câblage --------------------------------------------------------------
  function init() {
    try {
      if (el('btn-connexion')) { el('btn-connexion').addEventListener('click', seConnecter); }
      if (el('btn-deconnexion')) { el('btn-deconnexion').addEventListener('click', seDeconnecter); }
      if (el('btn-rafraichir')) { el('btn-rafraichir').addEventListener('click', charger); }

      // Si déjà connecté, on saute le login
      if (window.supabaseClient) {
        window.supabaseClient.auth.getSession().then(function (s) {
          if (s && s.data && s.data.session) { basculerVersTableau(); charger(); }
        });
      }
      // Rafraîchissement automatique
      setInterval(function () {
        if (el('vue-tableau') && el('vue-tableau').style.display !== 'none') { charger(); }
      }, CONFIG.RAFRAICHIR_MS);
    } catch (e) { console.error('init:', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  window.TilexTableau = { charger: charger, seConnecter: seConnecter, seDeconnecter: seDeconnecter };
})();
