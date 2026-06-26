(function () {
  'use strict';

  var LS_KEY_PROJET = 'tilex_projet_nom';
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

  function slugifier(valeur) {
    return valeur.trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9.\-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getNomZip() {
    var input = document.getElementById('projet-nom-input');
    var slug = input ? slugifier(input.value) : '';
    if (slug) return slug.endsWith('.zip') ? slug : slug + '.zip';
    var ts = new Date().toISOString().slice(0, 10);
    return 'ti-lex-fichiers-' + ts + '.zip';
  }

  function getNomBase() {
    var input = document.getElementById('projet-nom-input');
    var slug = input ? slugifier(input.value) : '';
    if (slug) return slug.endsWith('.zip') ? slug.slice(0, -4) : slug;
    return 'ti-lex-' + new Date().toISOString().slice(0, 10);
  }

  function initNomProjet() {
    var input = document.getElementById('projet-nom-input');
    var apercu = document.getElementById('apercu-valeur');
    var bloc = document.getElementById('projet-nom-bloc');
    if (!input || !apercu || !bloc) return;

    var nomSauve = localStorage.getItem(LS_KEY_PROJET) || '';
    input.value = nomSauve;
    apercu.textContent = getNomZip();

    input.addEventListener('input', function () {
      apercu.textContent = getNomZip();
      clearTimeout(input._saveTimer);
      input._saveTimer = setTimeout(function () {
        localStorage.setItem(LS_KEY_PROJET, input.value.trim());
      }, 600);
    });

    input.addEventListener('blur', function () {
      var slug = slugifier(input.value);
      input.value = slug;
      apercu.textContent = getNomZip();
      if (slug) localStorage.setItem(LS_KEY_PROJET, slug);
    });
  }

  function rendreListe() {
    if (window.tilexSelection) window.tilexSelection.reinitialiser();
    fichiersList.innerHTML = '';

    if (state.fichiers.length === 0) {
      var vide = document.createElement('div');
      vide.className = 'fichiers-vide';
      vide.innerHTML = '<span>Aucun fichier pour l\'instant.</span>';
      fichiersList.appendChild(vide);
      fichiersActions.style.display = 'none';
      var bloc = document.getElementById('projet-nom-bloc');
      if (bloc) bloc.style.display = 'none';
    } else {
      fichiersActions.style.display = 'flex';
      var bloc = document.getElementById('projet-nom-bloc');
      if (bloc) bloc.style.display = 'block';
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
      '<label class="fichier-checkbox-wrap" title="Sélectionner ce fichier">' +
        '<input type="checkbox" class="fichier-checkbox" data-id="' + fichier.id + '" autocomplete="off"/>' +
        '<span class="fichier-checkbox-custom"></span>' +
      '</label>' +
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

    var checkbox = card.querySelector('.fichier-checkbox');
    checkbox.addEventListener('change', function () {
      if (window.tilexSelection) {
        window.tilexSelection.toggle(fichier.id, checkbox.checked, card);
      }
    });
    card.addEventListener('click', function (e) {
      var isAction = e.target.closest('.fichier-card-actions');
      var isLabel = e.target.closest('.fichier-checkbox-wrap');
      if (!isAction && !isLabel) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
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
    if (window.tilexSelection) window.tilexSelection.retirerDeLaSelection(id);
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
      var nomZip = getNomZip();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = nomZip;
      a.click();
      URL.revokeObjectURL(url);

      if (window.tilexHistorique) {
        window.tilexHistorique.sauvegarder(nomZip, state.fichiers, blob.size);
      }

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

  function initContenuPrerempli() {
    if (!nomInput || !contenuInput) return;

    var dernierModele = null;

    var badge = creerBadgeModele(contenuInput);

    nomInput.addEventListener('input', function () {
      clearTimeout(nomInput._templateTimer);
      nomInput._templateTimer = setTimeout(function () {
        appliquerTemplate(nomInput.value);
      }, 350);
    });

    function appliquerTemplate(nomFichier) {
      if (!window.tilexTemplates) return;

      var modele = window.tilexTemplates.obtenir(nomFichier);
      if (!modele) return;

      var contenuActuel = contenuInput.value;
      var estVide       = contenuActuel.trim() === '';
      var estModele     = contenuActuel === dernierModele;

      if (estVide || estModele) {
        contenuInput.value = modele;
        dernierModele      = modele;
        badge.afficher(nomFichier, function () {
          contenuInput.value = modele;
          dernierModele      = modele;
        });
      }
    }

    contenuInput.addEventListener('input', function () {
      if (contenuInput.value !== dernierModele) {
        badge.marquerModifie();
      }
    });
  }

  function creerBadgeModele(textarea) {
    var badge = document.createElement('div');
    badge.className = 'template-badge';
    badge.id        = 'template-badge';
    badge.style.display = 'none';
    badge.innerHTML =
      '<span class="template-badge-icone">✨</span>' +
      '<span class="template-badge-texte">Modèle auto · <em id="template-badge-ext"></em></span>' +
      '<button class="template-badge-reset" id="template-badge-reset" type="button">Réinitialiser</button>';

    textarea.parentNode.insertBefore(badge, textarea.nextSibling);

    return {
      afficher: function (nomFichier, onReset) {
        var ext = document.getElementById('template-badge-ext');
        var btn = document.getElementById('template-badge-reset');
        if (ext) ext.textContent = nomFichier;
        badge.style.display = 'flex';
        badge.classList.remove('modifie');
        if (btn) {
          btn.onclick = onReset;
          btn.style.display = 'inline-block';
        }
      },
      marquerModifie: function () {
        badge.classList.add('modifie');
        var btn = document.getElementById('template-badge-reset');
        if (btn) btn.style.display = 'inline-block';
      },
      cacher: function () {
        badge.style.display = 'none';
      }
    };
  }

  rendreListe();
  initNomProjet();
  initContenuPrerempli();

  window.tilexFichiers = {
    ajouter: function (nom, contenu) {
      nomInput.value = nom;
      contenuInput.value = contenu;
      ajouterFichier();
    },
    getAll: function () { return state.fichiers.slice(); },
    zip: telechargerZip,
    supprimer: function (id) {
      state.fichiers = state.fichiers.filter(function (f) { return f.id !== id; });
    },
    getNomBase: getNomBase
  };
})();
