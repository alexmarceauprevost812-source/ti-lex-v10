// =============================================================
// tilex-zip.js — Gestion complète du ZIP
// ti-lex-AL v10 | Vanilla JS pur
// Dépendances : JSZip 3.10.1, FileSaver.js 2.0.5
// =============================================================

window.ZipManager = {

  // Tableau des fichiers dans le ZIP { name, content }
  files: [],

  // ----------------------------------------------------------
  // Ajoute un fichier au ZIP
  // ----------------------------------------------------------
  add: function (filename, content) {
    try {
      if (!filename || content === undefined) {
        ZipManager._toast('⚠️ Nom ou contenu manquant.', 'warning');
        return;
      }

      // Vérifie si le fichier existe déjà
      const existant = ZipManager.files.findIndex(f => f.name === filename);
      if (existant !== -1) {
        ZipManager.files[existant].content = content;
        ZipManager._toast(`🔄 ${filename} mis à jour dans le ZIP.`, 'info');
      } else {
        ZipManager.files.push({ name: filename, content: content });
        ZipManager._toast(`📦 ${filename} ajouté au ZIP !`, 'success');
      }

      ZipManager._renderList();

    } catch (err) {
      console.error('[ZipManager] add:', err);
      ZipManager._toast('❌ Erreur lors de l\'ajout.', 'error');
    }
  },

  // ----------------------------------------------------------
  // Retire un fichier du ZIP par son index
  // ----------------------------------------------------------
  remove: function (index) {
    try {
      if (index < 0 || index >= ZipManager.files.length) return;
      const nom = ZipManager.files[index].name;
      ZipManager.files.splice(index, 1);
      ZipManager._renderList();
      ZipManager._toast(`🗑️ ${nom} retiré du ZIP.`, 'info');
    } catch (err) {
      console.error('[ZipManager] remove:', err);
    }
  },

  // ----------------------------------------------------------
  // Génère et télécharge le ZIP complet
  // ----------------------------------------------------------
  download: async function () {
    try {
      if (ZipManager.files.length === 0) {
        ZipManager._toast('⚠️ Le ZIP est vide — ajoutez des fichiers d\'abord.', 'warning');
        return;
      }

      if (typeof JSZip === 'undefined') {
        ZipManager._toast('❌ JSZip non chargé.', 'error');
        return;
      }

      ZipManager._toast('⏳ Génération du ZIP…', 'info');

      const zip = new JSZip();

      // Ajoute chaque fichier au ZIP
      ZipManager.files.forEach(function (fichier) {
        zip.file(fichier.name, fichier.content);
      });

      // Génère le blob et déclenche le téléchargement
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const nomZip = `tilex-export-${Date.now()}.zip`;

      if (typeof saveAs === 'function') {
        saveAs(blob, nomZip);
      } else {
        // Fallback sans FileSaver
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href     = url;
        link.download = nomZip;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }

      ZipManager._toast(`✅ ZIP téléchargé : ${nomZip}`, 'success');

    } catch (err) {
      console.error('[ZipManager] download:', err);
      ZipManager._toast('❌ Erreur lors de la génération du ZIP.', 'error');
    }
  },

  // ----------------------------------------------------------
  // Ouvre le modal d'aperçu du ZIP (#zipPreviewModal)
  // ----------------------------------------------------------
  preview: function () {
    try {
      const modal = document.getElementById('zipPreviewModal');
      if (!modal) {
        ZipManager._toast('⚠️ Modal ZIP introuvable dans le DOM.', 'warning');
        return;
      }

      ZipManager._renderModalList();
      modal.style.display = 'flex';
      modal.classList.add('modal-open');

    } catch (err) {
      console.error('[ZipManager] preview:', err);
    }
  },

  // ----------------------------------------------------------
  // Ferme le modal d'aperçu
  // ----------------------------------------------------------
  closePreview: function () {
    try {
      const modal = document.getElementById('zipPreviewModal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('modal-open');
      }
    } catch (err) {
      console.error('[ZipManager] closePreview:', err);
    }
  },

  // ----------------------------------------------------------
  // Vide tous les fichiers du ZIP
  // ----------------------------------------------------------
  clear: function () {
    try {
      if (ZipManager.files.length === 0) {
        ZipManager._toast('ℹ️ Le ZIP est déjà vide.', 'info');
        return;
      }

      ZipManager.files = [];
      ZipManager._renderList();
      ZipManager._toast('🗑️ ZIP vidé — tous les fichiers ont été retirés.', 'success');

    } catch (err) {
      console.error('[ZipManager] clear:', err);
    }
  },

  // ----------------------------------------------------------
  // Mise à jour de la liste #zipFileList dans le DOM
  // ----------------------------------------------------------
  _renderList: function () {
    try {
      const liste = document.getElementById('zipFileList');
      if (!liste) return;

      // Compteur de fichiers
      const compteur = document.getElementById('zipCount');
      if (compteur) {
        compteur.textContent = `${ZipManager.files.length} fichier(s)`;
      }

      if (ZipManager.files.length === 0) {
        liste.innerHTML = '<li class="zip-empty">Aucun fichier dans le ZIP.</li>';
        return;
      }

      liste.innerHTML = ZipManager.files.map(function (fichier, index) {
        const ext   = fichier.name.split('.').pop().toUpperCase();
        const taille = new Blob([fichier.content]).size;
        const ko    = taille < 1024 ? `${taille} o` : `${(taille / 1024).toFixed(1)} Ko`;

        return `
          <li class="zip-file-item" data-index="${index}">
            <span class="zip-file-ext zip-ext-${ext.toLowerCase()}">${ext}</span>
            <span class="zip-file-name">${fichier.name}</span>
            <span class="zip-file-size">${ko}</span>
            <button class="zip-remove-btn" onclick="ZipManager.remove(${index})" title="Retirer du ZIP">🗑️</button>
          </li>`;
      }).join('');

    } catch (err) {
      console.error('[ZipManager] _renderList:', err);
    }
  },

  // ----------------------------------------------------------
  // Mise à jour de la liste dans le modal d'aperçu
  // ----------------------------------------------------------
  _renderModalList: function () {
    try {
      const liste = document.getElementById('zipModalFileList');
      if (!liste) return;

      if (ZipManager.files.length === 0) {
        liste.innerHTML = '<p class="zip-modal-empty">Aucun fichier dans le ZIP.</p>';
        return;
      }

      liste.innerHTML = `
        <p class="zip-modal-count">${ZipManager.files.length} fichier(s) dans le ZIP</p>
        <ul class="zip-modal-list">
          ${ZipManager.files.map(function (f, i) {
            const taille = new Blob([f.content]).size;
            const ko     = taille < 1024 ? `${taille} o` : `${(taille / 1024).toFixed(1)} Ko`;
            return `
              <li>
                <span class="zip-modal-name">📄 ${f.name}</span>
                <span class="zip-modal-size">${ko}</span>
                <button onclick="ZipManager.remove(${i}); ZipManager._renderModalList();">🗑️</button>
              </li>`;
          }).join('')}
        </ul>`;

    } catch (err) {
      console.error('[ZipManager] _renderModalList:', err);
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
