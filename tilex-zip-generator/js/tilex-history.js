// =============================================================
// tilex-history.js — Historique des fichiers créés (Supabase)
// ti-lex-AL v10 | Vanilla JS pur
// Table : zip_historique
// =============================================================

window.HistoryManager = {

  // Configuration Supabase ti-lex
  _supabaseUrl : 'https://rnuripmfozlxenryxhdc.supabase.co',
  _supabaseKey : 'VOTRE_SUPABASE_ANON_KEY', // Remplacer par votre clé anon
  _table       : 'zip_historique',

  // ----------------------------------------------------------
  // Ouvre le modal d'historique et charge les données
  // ----------------------------------------------------------
  open: async function () {
    try {
      const modal = document.getElementById('historyModal');
      if (!modal) {
        HistoryManager._toast('⚠️ Modal historique introuvable.', 'warning');
        return;
      }

      modal.style.display = 'flex';
      modal.classList.add('modal-open');

      // Charge l'historique depuis Supabase
      await HistoryManager.load();

    } catch (err) {
      console.error('[HistoryManager] open:', err);
    }
  },

  // ----------------------------------------------------------
  // Ferme le modal d'historique
  // ----------------------------------------------------------
  close: function () {
    try {
      const modal = document.getElementById('historyModal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('modal-open');
      }
    } catch (err) {
      console.error('[HistoryManager] close:', err);
    }
  },

  // ----------------------------------------------------------
  // Sauvegarde un fichier dans Supabase
  // ----------------------------------------------------------
  add: async function (nomFichier, typeFichier, contenu) {
    try {
      const reponse = await fetch(
        `${HistoryManager._supabaseUrl}/rest/v1/${HistoryManager._table}`,
        {
          method : 'POST',
          headers: {
            'Content-Type' : 'application/json',
            'apikey'       : HistoryManager._supabaseKey,
            'Authorization': `Bearer ${HistoryManager._supabaseKey}`,
            'Prefer'       : 'return=minimal'
          },
          body: JSON.stringify({
            nom_fichier  : nomFichier,
            type_fichier : typeFichier,
            contenu      : contenu,
            date_creation: new Date().toISOString()
            // user_id est géré par Supabase Auth (RLS)
          })
        }
      );

      if (!reponse.ok) {
        const erreur = await reponse.text();
        throw new Error(`Supabase : ${reponse.status} — ${erreur}`);
      }

      console.log(`[HistoryManager] Sauvegardé : ${nomFichier}`);

    } catch (err) {
      // Erreur non-bloquante — l'historique est secondaire
      console.warn('[HistoryManager] add (non-bloquant):', err.message);
    }
  },

  // ----------------------------------------------------------
  // Charge et affiche l'historique depuis Supabase
  // ----------------------------------------------------------
  load: async function () {
    try {
      const liste = document.getElementById('historyList');
      if (!liste) return;

      liste.innerHTML = '<li class="history-loading">⏳ Chargement…</li>';

      const reponse = await fetch(
        `${HistoryManager._supabaseUrl}/rest/v1/${HistoryManager._table}?select=*&order=date_creation.desc&limit=50`,
        {
          headers: {
            'apikey'       : HistoryManager._supabaseKey,
            'Authorization': `Bearer ${HistoryManager._supabaseKey}`
          }
        }
      );

      if (!reponse.ok) {
        throw new Error(`Supabase : ${reponse.status}`);
      }

      const donnees = await reponse.json();

      if (!donnees || donnees.length === 0) {
        liste.innerHTML = '<li class="history-empty">Aucun fichier dans l\'historique.</li>';
        return;
      }

      liste.innerHTML = donnees.map(function (item) {
        const date = new Date(item.date_creation).toLocaleString('fr-CA');
        const ext  = item.type_fichier?.toUpperCase() || '?';
        return `
          <li class="history-item">
            <span class="history-ext">${ext}</span>
            <span class="history-nom">${item.nom_fichier}</span>
            <span class="history-date">${date}</span>
            <button class="history-load-btn" onclick="HistoryManager._restorer('${item.nom_fichier}', '${item.type_fichier}', ${JSON.stringify(item.contenu || '').replace(/'/g, "\\'")})">
              📂 Charger
            </button>
          </li>`;
      }).join('');

    } catch (err) {
      console.error('[HistoryManager] load:', err);
      const liste = document.getElementById('historyList');
      if (liste) {
        liste.innerHTML = `<li class="history-error">❌ Erreur de chargement : ${err.message}</li>`;
      }
    }
  },

  // ----------------------------------------------------------
  // Efface tout l'historique (avec confirmation)
  // ----------------------------------------------------------
  clear: async function () {
    try {
      const confirmation = confirm('⚠️ Effacer tout l\'historique ? Cette action est irréversible.');
      if (!confirmation) return;

      const reponse = await fetch(
        `${HistoryManager._supabaseUrl}/rest/v1/${HistoryManager._table}?id=neq.00000000-0000-0000-0000-000000000000`,
        {
          method : 'DELETE',
          headers: {
            'apikey'       : HistoryManager._supabaseKey,
            'Authorization': `Bearer ${HistoryManager._supabaseKey}`
          }
        }
      );

      if (!reponse.ok) {
        throw new Error(`Supabase : ${reponse.status}`);
      }

      // Recharge la liste vide
      await HistoryManager.load();
      HistoryManager._toast('🗑️ Historique effacé.', 'success');

    } catch (err) {
      console.error('[HistoryManager] clear:', err);
      HistoryManager._toast('❌ Erreur lors de l\'effacement.', 'error');
    }
  },

  // ----------------------------------------------------------
  // Restore un fichier de l'historique dans le Preview
  // ----------------------------------------------------------
  _restorer: function (nom, type, contenu) {
    try {
      if (window.PreviewManager) {
        PreviewManager.show(nom, contenu);
      }

      // Pré-remplir les champs du formulaire
      const fieldName = document.getElementById('fileName');
      const fieldType = document.getElementById('fileType');
      if (fieldName) fieldName.value = nom;
      if (fieldType) fieldType.value = type;

      HistoryManager.close();
      HistoryManager._toast(`📂 ${nom} restauré.`, 'success');

    } catch (err) {
      console.error('[HistoryManager] _restorer:', err);
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
