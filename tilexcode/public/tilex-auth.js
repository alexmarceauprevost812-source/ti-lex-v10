/* ============================================================================
   public/tilex-auth.js
   Gestionnaire d'authentification Supabase — ti-lex, Produit du Québec
   window.TilexAuth : inscription, connexion, déconnexion, session, garde.
   Vanilla JS pur, aucun import/export, try/catch partout, commentaires FR.
   Dépend de supabase-js v2 chargé avant (window.supabase).
   ============================================================================ */
(function () {
  'use strict';

  // showToast gardé/partagé
  if (typeof window.showToast !== 'function') {
    window.showToast = function (m, t) { console.log('[' + (t || 'info') + '] ' + m); };
  }

  var CONFIG = {
    SUPABASE_URL: 'https://rnuripmfozlxenryxhdc.supabase.co',
    SUPABASE_KEY: 'REMPLACE_PAR_TA_CLE_PUBLIABLE',
    URL_AUTH: '/auth.html',     // page de connexion
    URL_APP: '/index.html'      // où aller une fois connecté
  };

  // --- Client Supabase (créé une seule fois) --------------------------------
  function client() {
    try {
      if (!window.supabaseClient) {
        if (window.supabase && window.supabase.createClient) {
          window.supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        } else {
          window.showToast('supabase-js non chargé.', 'error');
          return null;
        }
      }
      return window.supabaseClient;
    } catch (e) {
      window.showToast('Erreur client Supabase : ' + e.message, 'error');
      return null;
    }
  }

  // --- Inscription ----------------------------------------------------------
  function inscrire(courriel, mdp) {
    return new Promise(function (resolve, reject) {
      try {
        var c = client(); if (!c) { reject(new Error('client')); return; }
        if (!courriel || !mdp) {
          window.showToast('Courriel et mot de passe requis.', 'attention');
          reject(new Error('champs vides')); return;
        }
        if (mdp.length < 8) {
          window.showToast('Mot de passe : 8 caractères minimum.', 'attention');
          reject(new Error('mdp court')); return;
        }
        c.auth.signUp({ email: courriel, password: mdp }).then(function (res) {
          if (res.error) {
            window.showToast('Inscription refusée : ' + res.error.message, 'error');
            reject(res.error); return;
          }
          window.showToast('Compte créé ! Vérifie tes courriels si une confirmation est demandée.', 'success');
          resolve(res.data);
        }).catch(function (e) {
          window.showToast('Erreur inscription : ' + e.message, 'error'); reject(e);
        });
      } catch (e) { window.showToast('Erreur inscrire : ' + e.message, 'error'); reject(e); }
    });
  }

  // --- Connexion ------------------------------------------------------------
  function connecter(courriel, mdp) {
    return new Promise(function (resolve, reject) {
      try {
        var c = client(); if (!c) { reject(new Error('client')); return; }
        if (!courriel || !mdp) {
          window.showToast('Courriel et mot de passe requis.', 'attention');
          reject(new Error('champs vides')); return;
        }
        c.auth.signInWithPassword({ email: courriel, password: mdp }).then(function (res) {
          if (res.error) {
            window.showToast('Connexion refusée.', 'error');
            reject(res.error); return;
          }
          window.showToast('Connecté !', 'success');
          resolve(res.data);
        }).catch(function (e) {
          window.showToast('Erreur connexion : ' + e.message, 'error'); reject(e);
        });
      } catch (e) { window.showToast('Erreur connecter : ' + e.message, 'error'); reject(e); }
    });
  }

  // --- Déconnexion ----------------------------------------------------------
  function deconnecter() {
    return new Promise(function (resolve) {
      try {
        var c = client(); if (!c) { resolve(); return; }
        c.auth.signOut().finally(function () {
          window.showToast('Déconnecté.', 'info');
          resolve();
        });
      } catch (e) { window.showToast('Erreur déconnexion : ' + e.message, 'error'); resolve(); }
    });
  }

  // --- Réinitialisation du mot de passe -------------------------------------
  function reinitialiser(courriel) {
    return new Promise(function (resolve, reject) {
      try {
        var c = client(); if (!c) { reject(new Error('client')); return; }
        if (!courriel) {
          window.showToast('Entre ton courriel pour réinitialiser.', 'attention');
          reject(new Error('courriel vide')); return;
        }
        c.auth.resetPasswordForEmail(courriel).then(function (res) {
          if (res.error) { window.showToast('Échec : ' + res.error.message, 'error'); reject(res.error); return; }
          window.showToast('Courriel de réinitialisation envoyé.', 'success');
          resolve(res.data);
        }).catch(function (e) {
          window.showToast('Erreur réinitialisation : ' + e.message, 'error'); reject(e);
        });
      } catch (e) { window.showToast('Erreur reinitialiser : ' + e.message, 'error'); reject(e); }
    });
  }

  // --- Utilisateur / session courants ---------------------------------------
  function utilisateur() {
    return new Promise(function (resolve) {
      try {
        var c = client(); if (!c) { resolve(null); return; }
        c.auth.getUser().then(function (res) {
          resolve((res && res.data && res.data.user) || null);
        }).catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }

  function session() {
    return new Promise(function (resolve) {
      try {
        var c = client(); if (!c) { resolve(null); return; }
        c.auth.getSession().then(function (res) {
          resolve((res && res.data && res.data.session) || null);
        }).catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }

  function estConnecte() {
    return session().then(function (s) { return !!s; });
  }

  // --- Garde : à appeler en haut d'une page protégée ------------------------
  // Si pas connecté → redirige vers la page d'auth. Retourne une promesse bool.
  function exigerConnexion(urlAuth) {
    return new Promise(function (resolve) {
      try {
        estConnecte().then(function (ok) {
          if (!ok) {
            window.showToast('Connexion requise.', 'attention');
            setTimeout(function () {
              try { window.location.replace(urlAuth || CONFIG.URL_AUTH); } catch (e) {}
            }, 600);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } catch (e) { resolve(false); }
    });
  }

  // --- Écoute des changements d'état ----------------------------------------
  function surChangement(cb) {
    try {
      var c = client(); if (!c) { return; }
      c.auth.onAuthStateChange(function (evenement, sess) {
        try { if (typeof cb === 'function') { cb(evenement, sess); } } catch (e) {}
      });
    } catch (e) { /* ignore */ }
  }

  function init() {
    try { client(); } catch (e) {}
  }

  window.TilexAuth = {
    config: CONFIG,
    init: init,
    inscrire: inscrire,
    connecter: connecter,
    deconnecter: deconnecter,
    reinitialiser: reinitialiser,
    utilisateur: utilisateur,
    session: session,
    estConnecte: estConnecte,
    exigerConnexion: exigerConnexion,
    surChangement: surChangement
  };
})();
