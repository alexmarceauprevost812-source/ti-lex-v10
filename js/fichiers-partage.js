(function () {
  'use strict';

  var PARAM_URL    = 'structure';
  var PARAM_NOM    = 'projet';
  var MAX_URL_SAFE = 8000;

  function encoder(fichiers, nomProjet) {
    var payload = {
      v:       1,
      nom:     nomProjet || 'ti-lex-structure',
      date:    new Date().toISOString().slice(0, 10),
      total:   fichiers.length,
      fichiers: fichiers.map(function (f) { return { n: f.nom, c: f.contenu }; })
    };

    var json    = JSON.stringify(payload);
    var encoded = btoa(unescape(encodeURIComponent(json)));
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function decoder(encoded) {
    try {
      var b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';

      var json    = decodeURIComponent(escape(atob(b64)));
      var payload = JSON.parse(json);

      if (!payload.fichiers || !Array.isArray(payload.fichiers)) {
        throw new Error('Format invalide');
      }

      return payload;
    } catch (err) {
      console.error('[ti-lex] Erreur décodage structure :', err);
      return null;
    }
  }

  function genererLien() {
    if (!window.tilexFichiers) return null;

    var fichiers = window.tilexFichiers.getAll();
    if (fichiers.length === 0) return null;

    var inputNom  = document.getElementById('projet-nom-input');
    var nomProjet = inputNom ? inputNom.value.trim() : '';

    var encoded   = encoder(fichiers, nomProjet);
    var url       = new URL(window.location.href);
    url.searchParams.set(PARAM_URL, encoded);
    if (nomProjet) url.searchParams.set(PARAM_NOM, nomProjet);

    return url.toString();
  }

  function importerDepuisURL() {
    var params  = new URLSearchParams(window.location.search);
    var encoded = params.get(PARAM_URL);

    if (!encoded) return false;

    var payload = decoder(encoded);
    if (!payload) {
      afficherToast('⚠ Lien invalide ou corrompu');
      return false;
    }

    var importer = function () {
      if (!window.tilexFichiers) {
        setTimeout(importer, 200);
        return;
      }

      var fichiers = payload.fichiers;
      var nom      = payload.nom;
      var date     = payload.date;

      var importes = 0;
      fichiers.forEach(function (f) {
        if (f.n && typeof f.c === 'string') {
          window.tilexFichiers.ajouter(f.n, f.c);
          importes++;
        }
      });

      var inputNom = document.getElementById('projet-nom-input');
      var nomParam = params.get(PARAM_NOM);
      if (inputNom && (nomParam || nom)) {
        inputNom.value = nomParam || nom;
        inputNom.dispatchEvent(new Event('input'));
      }

      var urlPropre = new URL(window.location.href);
      urlPropre.searchParams.delete(PARAM_URL);
      urlPropre.searchParams.delete(PARAM_NOM);
      window.history.replaceState({}, '', urlPropre.toString());

      afficherBanniereImport(importes, nom, date);
    };

    importer();
    return true;
  }

  function ouvrirModalPartage() {
    var lien = genererLien();

    if (!lien) {
      afficherToast('⚠ Aucun fichier à partager');
      return;
    }

    var estLong = lien.length > MAX_URL_SAFE;

    var modal = document.getElementById('partage-modal-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id        = 'partage-modal-overlay';
      modal.className = 'partage-overlay';
      document.body.appendChild(modal);
    }

    var nbFichiers = window.tilexFichiers.getAll().length;

    modal.innerHTML =
      '<div class="partage-modal">' +
        '<div class="partage-header">' +
          '<span class="partage-titre">🔗 Partager la structure</span>' +
          '<button class="partage-btn-fermer" id="partage-fermer">✕</button>' +
        '</div>' +
        '<div class="partage-body">' +
          '<p class="partage-description">' +
            'Ce lien encode <strong>' + nbFichiers + ' fichier(s)</strong> ' +
            'directement dans l\'URL. La personne qui l\'ouvre verra les fichiers ' +
            'importés automatiquement dans son ti-lex.' +
          '</p>' +
          (estLong ?
            '<div class="partage-alerte">' +
              '⚠ Le lien est long (' + lien.length + ' caractères). Il peut ne pas ' +
              'fonctionner dans certains navigateurs ou services de messagerie.' +
            '</div>' : '') +
          '<div class="partage-lien-zone">' +
            '<div class="partage-lien-label">Lien partageable</div>' +
            '<div class="partage-lien-input-wrap">' +
              '<input type="text" id="partage-lien-input" class="partage-lien-input" ' +
                'value="' + escapeHTML(lien) + '" readonly />' +
              '<button class="partage-btn-copier" id="partage-copier">Copier</button>' +
            '</div>' +
          '</div>' +
          '<div class="partage-stats">' +
            '<span>📁 ' + nbFichiers + ' fichier(s)</span>' +
            '<span>⚖ ' + formatChars(lien.length) + ' (URL)</span>' +
            '<span>📅 ' + new Date().toLocaleDateString('fr-CA') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="partage-footer">' +
          '<button class="btn-ghost" id="partage-ouvrir-onglet">↗ Ouvrir dans un onglet</button>' +
          '<button class="btn-orange" id="partage-copier-principal" style="width:auto;padding:8px 16px;">🔗 Copier le lien</button>' +
        '</div>' +
      '</div>';

    modal.style.display = 'flex';
    requestAnimationFrame(function () { modal.classList.add('ouvert'); });

    setTimeout(function () {
      var input = document.getElementById('partage-lien-input');
      if (input) input.select();
    }, 100);

    document.getElementById('partage-fermer')
      .addEventListener('click', fermerModalPartage);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) fermerModalPartage();
    });

    var copierFn = function () { copierLien(lien); };
    document.getElementById('partage-copier').addEventListener('click', copierFn);
    document.getElementById('partage-copier-principal').addEventListener('click', copierFn);

    document.getElementById('partage-ouvrir-onglet').addEventListener('click', function () {
      window.open(lien, '_blank', 'noopener');
    });

    var escHandler = function (e) {
      if (e.key === 'Escape') {
        fermerModalPartage();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  function fermerModalPartage() {
    var modal = document.getElementById('partage-modal-overlay');
    if (!modal) return;
    modal.classList.remove('ouvert');
    setTimeout(function () { modal.style.display = 'none'; }, 180);
  }

  function afficherBanniereImport(nb, nomProjet, date) {
    var banniere = document.createElement('div');
    banniere.className = 'partage-banniere-import';
    banniere.innerHTML =
      '<span class="banniere-icone">📥</span>' +
      '<div class="banniere-texte">' +
        '<strong>' + nb + ' fichier(s) importé(s)</strong> depuis un lien partagé' +
        (nomProjet ? ' · <em>' + escapeHTML(nomProjet) + '</em>' : '') +
        (date ? ' · <span class="banniere-date">' + escapeHTML(date) + '</span>' : '') +
      '</div>' +
      '<button class="banniere-fermer" id="banniere-fermer">✕</button>';

    var moduleEl = document.getElementById('fichiers-module');
    if (moduleEl) {
      moduleEl.insertBefore(banniere, moduleEl.firstChild);
    } else {
      document.body.insertBefore(banniere, document.body.firstChild);
    }

    document.getElementById('banniere-fermer').addEventListener('click', function () {
      banniere.remove();
    });

    setTimeout(function () {
      if (banniere.parentNode) {
        banniere.style.opacity = '0';
        setTimeout(function () { banniere.remove(); }, 300);
      }
    }, 8000);
  }

  function copierLien(lien) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lien).then(function () {
        afficherToast('🔗 Lien copié dans le presse-papier !');
        var btn  = document.getElementById('partage-copier');
        var btn2 = document.getElementById('partage-copier-principal');
        if (btn)  btn.textContent  = '✓ Copié!';
        if (btn2) btn2.textContent = '✓ Copié!';
        setTimeout(function () {
          if (btn)  btn.textContent  = 'Copier';
          if (btn2) btn2.textContent = '🔗 Copier le lien';
        }, 2000);
      });
    }
  }

  function formatChars(chars) {
    if (chars < 1000) return chars + ' c';
    return (chars / 1000).toFixed(1) + ' Kc';
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function afficherToast(msg) {
    var toast = document.getElementById('tilex-toast-global');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tilex-toast-global';
      toast.className = 'tilex-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('visible'); }, 2500);
  }

  var btnPartager = document.getElementById('btn-partager-structure');
  if (btnPartager) {
    btnPartager.addEventListener('click', ouvrirModalPartage);
  }

  importerDepuisURL();

  window.tilexPartage = {
    genererLien: genererLien,
    ouvrirModal: ouvrirModalPartage,
    importer:    importerDepuisURL
  };
})();
