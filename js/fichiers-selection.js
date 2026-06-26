(function () {
  'use strict';

  var selection = {};

  function creerToolbar() {
    var module = document.getElementById('fichiers-module');
    if (!module) return;
    var liste = document.getElementById('fichiers-liste');
    if (!liste) return;

    var toolbar = document.createElement('div');
    toolbar.className = 'selection-toolbar';
    toolbar.id = 'selection-toolbar';
    toolbar.innerHTML =
      '<span class="selection-compteur" id="selection-compteur">0 <em>sélectionné(s)</em></span>' +
      '<div class="selection-sep"></div>' +
      '<div class="selection-quick">' +
        '<button class="selection-btn" id="btn-tout-selectionner">☑ Tout</button>' +
        '<button class="selection-btn" id="btn-tout-deselectionner">☐ Aucun</button>' +
      '</div>' +
      '<div class="selection-sep"></div>' +
      '<div class="selection-actions">' +
        '<button class="selection-btn-danger" id="btn-supprimer-selection">🗑 Supprimer</button>' +
        '<button class="selection-btn-zip" id="btn-zip-selection">⬇ ZIP sélection</button>' +
      '</div>';

    module.insertBefore(toolbar, liste);
    attacherEvenements();
  }

  function selectionCount() {
    var n = 0;
    for (var k in selection) { if (selection[k]) n++; }
    return n;
  }

  function selectionIds() {
    var ids = [];
    for (var k in selection) { if (selection[k]) ids.push(k); }
    return ids;
  }

  function mettreAJourToolbar() {
    var toolbar = document.getElementById('selection-toolbar');
    var compteur = document.getElementById('selection-compteur');
    var btnTout = document.getElementById('btn-tout-selectionner');
    var total = document.querySelectorAll('.fichier-checkbox').length;
    var count = selectionCount();

    if (!toolbar) return;

    if (count === 0) {
      toolbar.classList.remove('visible');
    } else {
      toolbar.classList.add('visible');
      if (compteur) {
        compteur.innerHTML = '<strong>' + count + '</strong> <em>/ ' + total + ' sélectionné(s)</em>';
      }
    }

    if (btnTout) {
      if (total > 0 && count === total) {
        btnTout.classList.add('actif');
      } else {
        btnTout.classList.remove('actif');
      }
    }
  }

  function toggle(id, estCoche, card) {
    if (estCoche) {
      selection[id] = true;
      card.classList.add('selectionnee');
    } else {
      delete selection[id];
      card.classList.remove('selectionnee');
    }
    mettreAJourToolbar();
  }

  function retirerDeLaSelection(id) {
    delete selection[id];
    mettreAJourToolbar();
  }

  function toutSelectionner() {
    var cbs = document.querySelectorAll('.fichier-checkbox');
    for (var i = 0; i < cbs.length; i++) {
      cbs[i].checked = true;
      selection[cbs[i].dataset.id] = true;
      var card = cbs[i].closest('.fichier-card');
      if (card) card.classList.add('selectionnee');
    }
    mettreAJourToolbar();
  }

  function toutDeselectionner() {
    var cbs = document.querySelectorAll('.fichier-checkbox');
    for (var i = 0; i < cbs.length; i++) {
      cbs[i].checked = false;
      var card = cbs[i].closest('.fichier-card');
      if (card) card.classList.remove('selectionnee');
    }
    selection = {};
    mettreAJourToolbar();
  }

  function reinitialiser() {
    selection = {};
    var toolbar = document.getElementById('selection-toolbar');
    if (toolbar) toolbar.classList.remove('visible');
  }

  function zipSelectionFn() {
    var count = selectionCount();
    if (count === 0) {
      afficherToast('⚠ Aucun fichier sélectionné');
      return;
    }
    if (typeof JSZip === 'undefined') {
      afficherToast('⚠ JSZip non chargé');
      return;
    }

    var tousFichiers = window.tilexFichiers ? window.tilexFichiers.getAll() : [];
    var ids = selectionIds();
    var selectionnes = tousFichiers.filter(function (f) {
      return ids.indexOf(f.id) !== -1;
    });

    if (selectionnes.length === 0) {
      afficherToast('⚠ Fichiers introuvables');
      return;
    }

    var btnZip = document.getElementById('btn-zip-selection');
    if (btnZip) {
      btnZip.disabled = true;
      btnZip.textContent = '⏳ Création…';
    }

    var zip = new JSZip();
    selectionnes.forEach(function (f) { zip.file(f.nom, f.contenu); });

    zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (blob) {
      var base = (window.tilexFichiers && window.tilexFichiers.getNomBase)
        ? window.tilexFichiers.getNomBase()
        : 'ti-lex-selection';
      var nomZip = base + '-selection.zip';
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = nomZip;
      a.click();
      URL.revokeObjectURL(url);
      afficherToast('⬇ "' + nomZip + '" · ' + selectionnes.length + ' fichier(s)');
    }).catch(function (err) {
      console.error('[ti-lex] Erreur ZIP sélection :', err);
      afficherToast('❌ Erreur lors de la création du ZIP');
    }).finally(function () {
      if (btnZip) {
        btnZip.disabled = false;
        btnZip.textContent = '⬇ ZIP sélection';
      }
    });
  }

  function supprimerSelection() {
    var count = selectionCount();
    if (count === 0) return;
    if (!confirm('Supprimer ' + count + ' fichier(s) sélectionné(s) ?')) return;

    var ids = selectionIds();
    ids.forEach(function (id) {
      var card = document.querySelector('.fichier-card[data-id="' + id + '"]');
      if (card) card.remove();
      if (window.tilexFichiers && window.tilexFichiers.supprimer) {
        window.tilexFichiers.supprimer(id);
      }
    });

    selection = {};
    mettreAJourToolbar();

    var liste = document.getElementById('fichiers-liste');
    if (liste && liste.querySelectorAll('.fichier-card').length === 0) {
      liste.innerHTML = '<div class="fichiers-vide"><span>Aucun fichier pour l\'instant.</span></div>';
      var actions = document.getElementById('fichiers-actions');
      if (actions) actions.style.display = 'none';
    }

    var compt = document.getElementById('fichiers-compteur');
    if (compt) {
      var restants = document.querySelectorAll('.fichier-card').length;
      compt.textContent = restants + ' fichier(s)';
    }

    afficherToast('🗑 ' + ids.length + ' fichier(s) supprimé(s)');
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
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.remove('visible'); }, 2400);
  }

  function attacherEvenements() {
    var btnTout = document.getElementById('btn-tout-selectionner');
    var btnAucun = document.getElementById('btn-tout-deselectionner');
    var btnSuppr = document.getElementById('btn-supprimer-selection');
    var btnZip = document.getElementById('btn-zip-selection');

    if (btnTout) btnTout.addEventListener('click', toutSelectionner);
    if (btnAucun) btnAucun.addEventListener('click', toutDeselectionner);
    if (btnSuppr) btnSuppr.addEventListener('click', supprimerSelection);
    if (btnZip) btnZip.addEventListener('click', zipSelectionFn);
  }

  document.addEventListener('keydown', function (e) {
    var tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      var liste = document.getElementById('fichiers-liste');
      if (liste && liste.querySelectorAll('.fichier-checkbox').length > 0) {
        e.preventDefault();
        toutSelectionner();
      }
    }

    if (e.key === 'Delete' && selectionCount() > 0) {
      supprimerSelection();
    }

    if (e.key === 'Escape' && selectionCount() > 0) {
      var previewOverlay = document.getElementById('tilex-preview-overlay');
      var previewOuvert = previewOverlay && previewOverlay.classList.contains('ouvert');
      if (!previewOuvert) {
        toutDeselectionner();
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', creerToolbar);
  } else {
    creerToolbar();
  }

  window.tilexSelection = {
    toggle: toggle,
    retirerDeLaSelection: retirerDeLaSelection,
    reinitialiser: reinitialiser,
    toutSelectionner: toutSelectionner,
    toutDeselectionner: toutDeselectionner,
    getSelection: function () { return selectionIds(); },
    count: selectionCount
  };
})();
