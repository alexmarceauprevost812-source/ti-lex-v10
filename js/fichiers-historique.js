(function () {
  'use strict';

  function formatBytes(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(2) + ' Mo';
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('fr-CA', {
      day:    'numeric',
      month:  'short',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit'
    });
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

  function escapeHTML(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getSupabase() {
    return window._supabaseClient || window.supabase || null;
  }

  function sauvegarderZip(nomZip, fichiers, tailleBytes) {
    var sb = getSupabase();
    if (!sb) return;

    sb.auth.getSession().then(function (result) {
      var session = result.data ? result.data.session : null;
      if (!session) return;

      var inputNom  = document.getElementById('projet-nom-input');
      var nomProjet = inputNom ? inputNom.value.trim() : 'sans-titre';

      var structure = fichiers.map(function (f) { return { n: f.nom, c: f.contenu }; });

      sb.from('zip_historique').insert({
        user_id:      session.user.id,
        nom_projet:   nomProjet || 'sans-titre',
        nom_zip:      nomZip,
        nb_fichiers:  fichiers.length,
        taille_bytes: tailleBytes,
        structure:    structure
      }).then(function (res) {
        if (res.error) {
          console.error('[ti-lex] Erreur sauvegarde historique :', res.error);
        }
      });
    });
  }

  function chargerHistorique(limite) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve([]);

    return sb.from('zip_historique')
      .select('id, nom_projet, nom_zip, nb_fichiers, taille_bytes, created_at')
      .order('created_at', { ascending: false })
      .limit(limite || 20)
      .then(function (res) {
        if (res.error) {
          console.error('[ti-lex] Erreur chargement historique :', res.error);
          return [];
        }
        return res.data || [];
      });
  }

  function chargerStructure(id) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve(null);

    return sb.from('zip_historique')
      .select('structure, nom_projet, nom_zip')
      .eq('id', id)
      .single()
      .then(function (res) {
        if (res.error || !res.data) return null;
        return res.data;
      });
  }

  function supprimerEntree(id) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve();

    return sb.from('zip_historique')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) console.error('[ti-lex] Erreur suppression historique :', res.error);
      });
  }

  function reimporter(id) {
    chargerStructure(id).then(function (resultat) {
      if (!resultat) {
        afficherToast('⚠ Structure introuvable');
        return;
      }

      var structure  = resultat.structure;
      var nom_projet = resultat.nom_projet;
      var nom_zip    = resultat.nom_zip;

      if (!window.tilexFichiers) {
        afficherToast('⚠ Module fichiers non disponible');
        return;
      }

      var actuels = window.tilexFichiers.getAll();
      if (actuels.length > 0) {
        if (!confirm('Remplacer les ' + actuels.length + ' fichier(s) actuels par ceux de "' + nom_zip + '" ?')) {
          return;
        }
        actuels.slice().forEach(function (f) {
          if (window.tilexFichiers.supprimer) {
            window.tilexFichiers.supprimer(f.id);
          }
        });
      }

      structure.forEach(function (f) {
        if (f.n && typeof f.c === 'string') {
          window.tilexFichiers.ajouter(f.n, f.c);
        }
      });

      var inputNom = document.getElementById('projet-nom-input');
      if (inputNom && nom_projet) {
        inputNom.value = nom_projet;
        inputNom.dispatchEvent(new Event('input'));
      }

      fermerModalHistorique();
      afficherToast('📥 ' + structure.length + ' fichier(s) réimportés depuis "' + nom_zip + '"');
    });
  }

  function retelecharger(id) {
    if (typeof JSZip === 'undefined') {
      afficherToast('⚠ JSZip non chargé');
      return;
    }

    chargerStructure(id).then(function (resultat) {
      if (!resultat) { afficherToast('⚠ Structure introuvable'); return; }

      var structure = resultat.structure;
      var nom_zip   = resultat.nom_zip;

      var zip = new JSZip();
      structure.forEach(function (f) { zip.file(f.n, f.c); });

      zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a   = document.createElement('a');
        a.href     = url;
        a.download = nom_zip;
        a.click();
        URL.revokeObjectURL(url);
        afficherToast('⬇ "' + nom_zip + '" re-téléchargé');
      });
    });
  }

  function ouvrirModalHistorique() {
    var modal = document.getElementById('historique-modal-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id        = 'historique-modal-overlay';
      modal.className = 'historique-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML =
      '<div class="historique-modal">' +
        '<div class="historique-header">' +
          '<span class="historique-titre">🗄️ Historique des ZIPs</span>' +
          '<button class="historique-btn-fermer" id="historique-fermer">✕</button>' +
        '</div>' +
        '<div class="historique-body" id="historique-body">' +
          '<div class="historique-chargement">' +
            '<span class="historique-spinner">⏳</span> Chargement de l\'historique...' +
          '</div>' +
        '</div>' +
      '</div>';

    modal.style.display = 'flex';
    requestAnimationFrame(function () { modal.classList.add('ouvert'); });

    document.getElementById('historique-fermer')
      .addEventListener('click', fermerModalHistorique);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) fermerModalHistorique();
    });

    var escHandler = function (e) {
      if (e.key === 'Escape') {
        fermerModalHistorique();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    chargerHistorique().then(function (entrees) {
      rendreHistorique(entrees);
    });
  }

  function rendreHistorique(entrees) {
    var body = document.getElementById('historique-body');
    if (!body) return;

    if (entrees.length === 0) {
      body.innerHTML =
        '<div class="historique-vide">' +
          '<p>📭 Aucun ZIP dans l\'historique.</p>' +
          '<p>Télécharge un ZIP pour commencer à sauvegarder.</p>' +
        '</div>';
      return;
    }

    var html =
      '<p class="historique-sous-titre">' +
        entrees.length + ' entrée(s) · Les structures sont sauvegardées automatiquement.' +
      '</p>' +
      '<div class="historique-liste">';

    entrees.forEach(function (e) {
      html +=
        '<div class="historique-carte" data-id="' + e.id + '">' +
          '<div class="historique-carte-info">' +
            '<div class="historique-carte-nom">' + escapeHTML(e.nom_zip) + '</div>' +
            '<div class="historique-carte-meta">' +
              '<span>📁 ' + e.nb_fichiers + ' fichier(s)</span>' +
              '<span>⚖ ' + formatBytes(e.taille_bytes) + '</span>' +
              '<span>📅 ' + formatDate(e.created_at) + '</span>' +
              (e.nom_projet && e.nom_projet !== 'sans-titre'
                ? '<span class="historique-projet-badge">' + escapeHTML(e.nom_projet) + '</span>'
                : '') +
            '</div>' +
          '</div>' +
          '<div class="historique-carte-actions">' +
            '<button class="historique-btn reimporter" data-id="' + e.id + '" title="Réimporter ces fichiers">📥 Importer</button>' +
            '<button class="historique-btn retelecharger" data-id="' + e.id + '" title="Re-télécharger ce ZIP">⬇ ZIP</button>' +
            '<button class="historique-btn supprimer" data-id="' + e.id + '" title="Supprimer de l\'historique">✕</button>' +
          '</div>' +
        '</div>';
    });

    html += '</div>';
    body.innerHTML = html;

    body.querySelectorAll('.reimporter').forEach(function (btn) {
      btn.addEventListener('click', function () { reimporter(btn.dataset.id); });
    });

    body.querySelectorAll('.retelecharger').forEach(function (btn) {
      btn.addEventListener('click', function () { retelecharger(btn.dataset.id); });
    });

    body.querySelectorAll('.supprimer').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Supprimer cette entrée de l\'historique ?')) return;
        supprimerEntree(btn.dataset.id).then(function () {
          var carte = btn.closest('.historique-carte');
          if (carte) {
            carte.style.opacity = '0';
            setTimeout(function () { carte.remove(); }, 200);
          }
          afficherToast('🗑 Entrée supprimée');
        });
      });
    });
  }

  function fermerModalHistorique() {
    var modal = document.getElementById('historique-modal-overlay');
    if (!modal) return;
    modal.classList.remove('ouvert');
    setTimeout(function () { modal.style.display = 'none'; }, 180);
  }

  var btnHistorique = document.getElementById('btn-historique');
  if (btnHistorique) {
    btnHistorique.addEventListener('click', ouvrirModalHistorique);
  }

  window.tilexHistorique = {
    sauvegarder: sauvegarderZip,
    ouvrir:      ouvrirModalHistorique
  };
})();
