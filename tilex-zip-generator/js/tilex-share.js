// =============================================================
// tilex-share.js — Partage et export du projet
// ti-lex-AL v10 | Vanilla JS pur
// =============================================================

window.ShareManager = {

  // ----------------------------------------------------------
  // Ouvre le modal de partage (#shareModal)
  // ----------------------------------------------------------
  open: function () {
    try {
      const modal = document.getElementById('shareModal');
      if (!modal) {
        ShareManager._toast('⚠️ Modal de partage introuvable.', 'warning');
        return;
      }

      // Génère le lien de partage (URL actuelle)
      const shareLink = document.getElementById('shareLink');
      if (shareLink) {
        shareLink.value = window.location.href;
      }

      modal.style.display = 'flex';
      modal.classList.add('modal-open');

    } catch (err) {
      console.error('[ShareManager] open:', err);
    }
  },

  // ----------------------------------------------------------
  // Ferme le modal de partage
  // ----------------------------------------------------------
  close: function () {
    try {
      const modal = document.getElementById('shareModal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('modal-open');
      }
    } catch (err) {
      console.error('[ShareManager] close:', err);
    }
  },

  // ----------------------------------------------------------
  // Copie le lien de partage dans le presse-papier
  // ----------------------------------------------------------
  copy: async function () {
    try {
      const shareLink = document.getElementById('shareLink');
      const lien = shareLink ? shareLink.value : window.location.href;

      await navigator.clipboard.writeText(lien);
      ShareManager._toast('🔗 Lien copié dans le presse-papier !', 'success');

    } catch (err) {
      // Fallback pour les navigateurs sans Clipboard API
      try {
        const shareLink = document.getElementById('shareLink');
        if (shareLink) {
          shareLink.select();
          document.execCommand('copy');
          ShareManager._toast('🔗 Lien copié !', 'success');
        }
      } catch (fallbackErr) {
        console.error('[ShareManager] copy fallback:', fallbackErr);
        ShareManager._toast('❌ Impossible de copier le lien.', 'error');
      }
    }
  },

  // ----------------------------------------------------------
  // Exporte tous les fichiers ZIP en JSON téléchargeable
  // ----------------------------------------------------------
  exportJSON: function () {
    try {
      if (!window.ZipManager || ZipManager.files.length === 0) {
        ShareManager._toast('⚠️ Aucun fichier à exporter.', 'warning');
        return;
      }

      const exportData = {
        version   : 'tilex-AL-v10',
        date      : new Date().toISOString(),
        source    : 'Produit du Québec',
        fichiers  : ZipManager.files.map(function (f) {
          return {
            name   : f.name,
            content: f.content,
            size   : new Blob([f.content]).size
          };
        })
      };

      const json    = JSON.stringify(exportData, null, 2);
      const blob    = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url     = URL.createObjectURL(blob);
      const nomFich = `tilex-export-${Date.now()}.json`;

      const link    = document.createElement('a');
      link.href     = url;
      link.download = nomFich;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(url), 1500);

      ShareManager._toast(`✅ Export JSON téléchargé : ${nomFich}`, 'success');

    } catch (err) {
      console.error('[ShareManager] exportJSON:', err);
      ShareManager._toast('❌ Erreur lors de l\'export JSON.', 'error');
    }
  },

  // ----------------------------------------------------------
  // Importe un JSON et recharge les fichiers dans ZipManager
  // ----------------------------------------------------------
  importJSON: function () {
    try {
      // Crée un input file invisible
      const input   = document.createElement('input');
      input.type    = 'file';
      input.accept  = '.json';

      input.addEventListener('change', function (evt) {
        const fichier = evt.target.files[0];
        if (!fichier) return;

        const reader = new FileReader();

        reader.onload = function (e) {
          try {
            const donnees = JSON.parse(e.target.result);

            // Validation de la structure
            if (!donnees.fichiers || !Array.isArray(donnees.fichiers)) {
              ShareManager._toast('❌ Format JSON invalide — structure "fichiers" manquante.', 'error');
              return;
            }

            // Vider le ZIP actuel si demandé
            const vider = confirm(
              `📦 Importer ${donnees.fichiers.length} fichier(s) ?\n\n` +
              `Cliquez OK pour remplacer le ZIP actuel, Annuler pour ajouter aux fichiers existants.`
            );

            if (vider && window.ZipManager) {
              ZipManager.files = [];
            }

            // Ajouter chaque fichier importé
            let compteur = 0;
            donnees.fichiers.forEach(function (f) {
              if (f.name && f.content !== undefined) {
                if (window.ZipManager) {
                  ZipManager.add(f.name, f.content);
                  compteur++;
                }
              }
            });

            ShareManager._toast(
              `✅ ${compteur} fichier(s) importé(s) depuis le JSON.`,
              'success'
            );

            // Ferme le modal de partage
            ShareManager.close();

          } catch (parseErr) {
            console.error('[ShareManager] importJSON parse:', parseErr);
            ShareManager._toast('❌ Fichier JSON invalide ou corrompu.', 'error');
          }
        };

        reader.onerror = function () {
          ShareManager._toast('❌ Impossible de lire le fichier.', 'error');
        };

        reader.readAsText(fichier, 'utf-8');
      });

      // Déclenche l'ouverture du sélecteur de fichier
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);

    } catch (err) {
      console.error('[ShareManager] importJSON:', err);
      ShareManager._toast('❌ Erreur lors de l\'import JSON.', 'error');
    }
  },

  // ----------------------------------------------------------
  // Toast de notification
  // ----------------------------------------------------------
  _toast: function (message, type = 'info') {
    if (window.CoreManager && CoreManager._toast) {
      CoreManager._toast(message, type);
      return;
    }
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className   = `toast toast-${type} toast-visible`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }
};
