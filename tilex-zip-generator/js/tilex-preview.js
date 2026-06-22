// =============================================================
// tilex-preview.js — Aperçu du fichier généré
// ti-lex-AL v10 | Vanilla JS pur
// =============================================================

window.PreviewManager = {

  // Fichier actuellement prévisualisé
  _currentFilename : null,
  _currentContent  : null,

  // ----------------------------------------------------------
  // Affiche le contenu dans la section #previewSection
  // ----------------------------------------------------------
  show: function (filename, content) {
    try {
      const section       = document.getElementById('previewSection');
      const previewContent = document.getElementById('previewContent');
      const previewTitle  = document.getElementById('previewTitle');

      if (!section || !previewContent) {
        console.warn('[PreviewManager] Éléments DOM introuvables.');
        return;
      }

      // Sauvegarde en mémoire
      PreviewManager._currentFilename = filename;
      PreviewManager._currentContent  = content;

      // Titre de l'aperçu
      if (previewTitle) {
        previewTitle.textContent = `📄 ${filename}`;
      }

      // Coloration syntaxique basique selon l'extension
      const ext = filename.split('.').pop().toLowerCase();
      previewContent.className = `language-${ext}`;

      // Échappe le HTML pour affichage sécuritaire
      previewContent.textContent = content;

      // Affiche la section
      section.style.display = 'block';
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error('[PreviewManager] show:', err);
    }
  },

  // ----------------------------------------------------------
  // Copie le contenu dans le presse-papier
  // ----------------------------------------------------------
  copy: async function () {
    try {
      if (!PreviewManager._currentContent) {
        PreviewManager._toast('⚠️ Aucun contenu à copier.', 'warning');
        return;
      }

      await navigator.clipboard.writeText(PreviewManager._currentContent);
      PreviewManager._toast('📋 Contenu copié dans le presse-papier !', 'success');

    } catch (err) {
      // Fallback pour les navigateurs sans Clipboard API
      try {
        const textarea = document.createElement('textarea');
        textarea.value = PreviewManager._currentContent;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        PreviewManager._toast('📋 Contenu copié !', 'success');
      } catch (fallbackErr) {
        console.error('[PreviewManager] copy fallback:', fallbackErr);
        PreviewManager._toast('❌ Impossible de copier.', 'error');
      }
    }
  },

  // ----------------------------------------------------------
  // Télécharge le fichier seul (sans ZIP)
  // ----------------------------------------------------------
  download: function () {
    try {
      if (!PreviewManager._currentContent || !PreviewManager._currentFilename) {
        PreviewManager._toast('⚠️ Aucun fichier à télécharger.', 'warning');
        return;
      }

      const blob = new Blob([PreviewManager._currentContent], { type: 'text/plain;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href     = url;
      link.download = PreviewManager._currentFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Libère la mémoire
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      PreviewManager._toast(`⬇️ ${PreviewManager._currentFilename} téléchargé !`, 'success');

    } catch (err) {
      console.error('[PreviewManager] download:', err);
      PreviewManager._toast('❌ Erreur lors du téléchargement.', 'error');
    }
  },

  // ----------------------------------------------------------
  // Cache la section d'aperçu
  // ----------------------------------------------------------
  hide: function () {
    try {
      const section = document.getElementById('previewSection');
      if (section) section.style.display = 'none';
      PreviewManager._currentFilename = null;
      PreviewManager._currentContent  = null;
    } catch (err) {
      console.error('[PreviewManager] hide:', err);
    }
  },

  // ----------------------------------------------------------
  // Toast de notification (délégué à CoreManager si disponible)
  // ----------------------------------------------------------
  _toast: function (message, type = 'info') {
    if (window.CoreManager && CoreManager._toast) {
      CoreManager._toast(message, type);
      return;
    }
    // Fallback autonome
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className   = `toast toast-${type} toast-visible`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }
};
