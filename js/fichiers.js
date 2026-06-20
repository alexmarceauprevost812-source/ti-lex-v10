(function () {
  'use strict';

  var state = { fichiers: [] };

  var nomInput        = document.getElementById('fichier-nom-input');
  var contenuInput    = document.getElementById('fichier-contenu-input');
  var btnAjouter      = document.getElementById('btn-ajouter-fichier');
  var fichiersList    = document.getElementById('fichiers-liste');
  var fichiersActions = document.getElementById('fichiers-actions');
  var fichiersCompt   = document.getElementById('fichiers-compteur');
  var btnZip          = document.getElementById('btn-telecharger-zip');
  var btnEffacer      = document.getElementById('btn-tout-supprimer');

  if (!nomInput || !btnAjouter) return;

  function genId() {
    return '_' + Math.random().toString(36).slice(2, 9);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' o';
    return (bytes / 1024).toFixed(1) + ' Ko';
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
    clearTimeout(toast._tid);
    toast._tid = setTimeout(function () { toast.classList.remove('visible'); }, 2200);
  }

  function rendreListe() {
    fichiersList.innerHTML = '';

    if (state.fichiers.length === 0) {
      var vide = document.createElement('div');
      vide.className = 'fichiers-vide';
      vide.innerHTML = '<span>Aucun fichier pour l\'instant.</span>';
      fichiersList.appendChild(vide);
      fichiersActions.style.display = 'none';
    } else {
      fichiersActions.style.display = 'flex';
      state.fichiers.forEach(function (f) {
        fichiersList.appendChild(creerCarteHTML(f));
      });
    }

    fichiersCompt.textContent = state.fichiers.length + ' fichier(s)';
  }

  function creerCarteHTML(fichier) {
    var card = document.createElement('div');
    card.className = 'fichier-card';
    card.dataset.id = fichier.id;

    card.innerHTML =
      '<div class="fichier-card-info">' +
        '<span class="fichier-card-icon">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>' +
            '<polyline points="13 2 13 9 20 9"></polyline>' +
          '</svg>' +
        '</span>' +
        '<span class="fichier-card-nom" title="' + fichier.nom + '">' + fichier.nom + '</span>' +
        '<span class="fichier-card-taille">' + formatBytes(fichier.taille) + '</span>' +
      '</div>' +
      '<div class="fichier-card-actions">' +
        '<button class="fichier-btn-action voir" data-id="' + fichier.id + '">👁 Voir</button>' +
        '<button class="fichier-btn-action copier" data-id="' + fichier.id + '">Copier</button>' +
        '<button class="fichier-btn-action telecharger" data-id="' + fichier.id + '">&#11015;</button>' +
        '<button class="fichier-btn-action supprimer" data-id="' + fichier.id + '">&#10005;</button>' +
      '</div>';

    card.querySelector('.voir').addEventListener('click', function () {
      if (window.tilexPreview) window.tilexPreview.ouvrir(fichier);
    });
    card.querySelector('.copier').addEventListener('click', function (e) {
      copierContenu(fichier.id, e.currentTarget);
    });
    card.querySelector('.telecharger').addEventListener('click', function () {
      telechargerFichier(fichier);
    });
    card.querySelector('.supprimer').addEventListener('click', function () {
      supprimerFichier(fichier.id);
    });

    return card;
  }

  function ajouterFichier() {
    var nom = nomInput.value.trim();
    var contenu = contenuInput.value;

    if (!nom) {
      nomInput.focus();
      nomInput.style.borderColor = '#e05555';
      setTimeout(function () { nomInput.style.borderColor = ''; }, 1200);
      return;
    }

    if (state.fichiers.some(function (f) { return f.nom === nom; })) {
      afficherToast('⚠ "' + nom + '" existe déjà');
      return;
    }

    state.fichiers.push({
      id: genId(),
      nom: nom,
      contenu: contenu,
      taille: new Blob([contenu]).size
    });

    rendreListe();
    nomInput.value = '';
    contenuInput.value = '';
    nomInput.focus();
    afficherToast('✓ "' + nom + '" ajouté');
  }

  function supprimerFichier(id) {
    state.fichiers = state.fichiers.filter(function (f) { return f.id !== id; });
    rendreListe();
  }

  function copierContenu(id, btn) {
    var fichier = state.fichiers.find(function (f) { return f.id === id; });
    if (!fichier) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fichier.contenu).then(function () {
        btn.textContent = '✓ Copié!';
        btn.classList.add('copie-ok');
        setTimeout(function () { btn.textContent = 'Copier'; btn.classList.remove('copie-ok'); }, 1800);
      }).catch(function () { fallbackCopy(fichier.contenu); });
    } else {
      fallbackCopy(fichier.contenu);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    afficherToast('✓ Contenu copié');
  }

  function telechargerFichier(fichier) {
    var blob = new Blob([fichier.contenu], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fichier.nom;
    a.click();
    URL.revokeObjectURL(url);
    afficherToast('⬇ "' + fichier.nom + '" téléchargé');
  }

  function telechargerZip() {
    if (state.fichiers.length === 0) {
      afficherToast('Aucun fichier à zipper');
      return;
    }
    if (typeof JSZip === 'undefined') {
      afficherToast('⚠ JSZip non chargé');
      return;
    }

    btnZip.disabled = true;
    btnZip.textContent = '⏳ Création…';

    var zip = new JSZip();
    state.fichiers.forEach(function (f) { zip.file(f.nom, f.contenu); });

    zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (blob) {
      var ts = new Date().toISOString().slice(0, 10);
      var nomZip = 'ti-lex-fichiers-' + ts + '.zip';
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = nomZip;
      a.click();
      URL.revokeObjectURL(url);
      afficherToast('⬇ "' + nomZip + '" téléchargé (' + state.fichiers.length + ' fichier(s))');
    }).catch(function (err) {
      console.error('[ti-lex] Erreur ZIP :', err);
      afficherToast('❌ Erreur lors de la création du ZIP');
    }).finally(function () {
      btnZip.disabled = false;
      btnZip.textContent = '⬇ Télécharger .zip';
    });
  }

  function toutEffacer() {
    if (!confirm('Supprimer les ' + state.fichiers.length + ' fichier(s) ?')) return;
    state.fichiers = [];
    rendreListe();
    afficherToast('🗑 Tous les fichiers effacés');
  }

  btnAjouter.addEventListener('click', ajouterFichier);

  contenuInput.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      ajouterFichier();
    }
  });

  nomInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      contenuInput.focus();
    }
  });

  btnZip.addEventListener('click', telechargerZip);
  btnEffacer.addEventListener('click', toutEffacer);

  rendreListe();

  window.tilexFichiers = {
    ajouter: function (nom, contenu) {
      nomInput.value = nom;
      contenuInput.value = contenu;
      ajouterFichier();
    },
    getAll: function () { return state.fichiers.slice(); },
    zip: telechargerZip
  };
})();
