/* ============================================================================
   public/tilex-auth-ui.js
   Interface de connexion / inscription — ti-lex, Produit du Québec
   Auto-rendu dans #tilex-auth. Externalisé pour respecter la CSP (pas d'inline).
   ============================================================================ */
(function () {
  'use strict';

  function injecterStyles() {
    try {
      if (document.getElementById('tilex-auth-styles')) { return; }
      var s = document.createElement('style');
      s.id = 'tilex-auth-styles';
      s.textContent = [
        '.tx-auth{max-width:400px;margin:0 auto;background:#131a26;color:#e8edf5;',
        '  border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:26px;',
        '  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
        '.tx-onglets{display:flex;gap:8px;margin-bottom:18px;}',
        '.tx-onglet{flex:1;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);',
        '  background:transparent;color:#8a96a8;cursor:pointer;font-weight:700;}',
        '.tx-onglet.actif{background:#2563eb;color:#fff;border-color:#2563eb;}',
        '.tx-auth label{display:block;font-size:13px;color:#8a96a8;margin:12px 0 6px;}',
        '.tx-auth input{width:100%;box-sizing:border-box;padding:11px;border-radius:10px;',
        '  background:#0e1521;color:#e8edf5;border:1px solid rgba(255,255,255,.1);font-size:14px;}',
        '.tx-auth .tx-go{width:100%;margin-top:18px;padding:12px;border:none;border-radius:10px;',
        '  background:#10b981;color:#fff;font-weight:800;font-size:15px;cursor:pointer;}',
        '.tx-lien{display:block;text-align:center;margin-top:14px;color:#8a96a8;font-size:13px;',
        '  background:none;border:none;cursor:pointer;width:100%;}',
        '.tx-titre{font-size:20px;margin:0 0 4px;} .tx-sous{color:#8a96a8;font-size:13px;margin-bottom:16px;}'
      ].join('\n');
      document.head.appendChild(s);
    } catch (e) { /* ignore */ }
  }

  function rendre(idConteneur, urlRetour) {
    try {
      injecterStyles();
      var hote = document.getElementById(idConteneur);
      if (!hote) { return; }

      hote.innerHTML =
        '<div class="tx-auth">' +
        '  <h1 class="tx-titre">ti-lex</h1>' +
        '  <div class="tx-sous">Connexion à ton espace · Produit du Québec</div>' +
        '  <div class="tx-onglets">' +
        '    <button type="button" class="tx-onglet actif" data-mode="connexion">Connexion</button>' +
        '    <button type="button" class="tx-onglet" data-mode="inscription">Inscription</button>' +
        '  </div>' +
        '  <label for="tx-courriel">Courriel</label>' +
        '  <input id="tx-courriel" type="email" autocomplete="username" />' +
        '  <label for="tx-mdp">Mot de passe</label>' +
        '  <input id="tx-mdp" type="password" autocomplete="current-password" />' +
        '  <button type="button" class="tx-go" id="tx-go">Se connecter</button>' +
        '  <button type="button" class="tx-lien" id="tx-reset">Mot de passe oublié?</button>' +
        '</div>';

      var mode = 'connexion';
      var onglets = hote.querySelectorAll('.tx-onglet');
      var btnGo = document.getElementById('tx-go');

      function majMode(m) {
        mode = m;
        Array.prototype.forEach.call(onglets, function (o) {
          o.classList.toggle('actif', o.getAttribute('data-mode') === m);
        });
        btnGo.textContent = (m === 'connexion') ? 'Se connecter' : 'Créer mon compte';
        var champMdp = document.getElementById('tx-mdp');
        if (champMdp) { champMdp.setAttribute('autocomplete', m === 'connexion' ? 'current-password' : 'new-password'); }
      }

      Array.prototype.forEach.call(onglets, function (o) {
        o.addEventListener('click', function () { majMode(o.getAttribute('data-mode')); });
      });

      btnGo.addEventListener('click', function () {
        try {
          var courriel = (document.getElementById('tx-courriel') || {}).value || '';
          var mdp = (document.getElementById('tx-mdp') || {}).value || '';
          var action = (mode === 'connexion')
            ? window.TilexAuth.connecter(courriel, mdp)
            : window.TilexAuth.inscrire(courriel, mdp);
          action.then(function () {
            var dest = urlRetour || window.TilexAuth.config.URL_APP;
            setTimeout(function () { try { window.location.replace(dest); } catch (e) {} }, 700);
          }).catch(function () { /* toast déjà affiché */ });
        } catch (e) { window.showToast('Erreur : ' + e.message, 'error'); }
      });

      var btnReset = document.getElementById('tx-reset');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          var courriel = (document.getElementById('tx-courriel') || {}).value || '';
          window.TilexAuth.reinitialiser(courriel).catch(function () {});
        });
      }
    } catch (e) {
      if (window.showToast) { window.showToast('Erreur UI auth : ' + e.message, 'error'); }
    }
  }

  function auto() {
    try {
      var hote = document.getElementById('tilex-auth');
      if (!hote) { return; }
      var retour = hote.getAttribute('data-retour') || '';
      if (window.TilexAuth) { window.TilexAuth.init(); }
      rendre('tilex-auth', retour);
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', auto);
  } else { auto(); }

  window.TilexAuthUI = { rendre: rendre };
})();
