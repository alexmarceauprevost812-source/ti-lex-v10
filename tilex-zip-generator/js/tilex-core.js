// =============================================================
// tilex-core.js — Génération du contenu de fichier
// ti-lex-AL v10 | Vanilla JS pur
// =============================================================

window.CoreManager = {

  // ----------------------------------------------------------
  // Génère le contenu du fichier selon le type sélectionné
  // ----------------------------------------------------------
  generateFile: async function () {
    try {
      const fileName    = document.getElementById('fileName')?.value?.trim();
      const fileType    = document.getElementById('fileType')?.value?.trim();
      const fileDesc    = document.getElementById('fileDescription')?.value?.trim();

      // Validation de base
      if (!fileName) {
        CoreManager._toast('⚠️ Entrez un nom de fichier.', 'warning');
        return;
      }
      if (!fileType) {
        CoreManager._toast('⚠️ Choisissez un type de fichier.', 'warning');
        return;
      }

      // Nom complet avec extension si absente
      const fullName = fileName.includes('.') ? fileName : `${fileName}.${fileType}`;

      CoreManager._toast('⏳ Génération en cours…', 'info');

      // Génération du contenu selon le type
      const content = CoreManager._buildContent(fullName, fileType, fileDesc || 'Fichier ti-lex-AL v10');

      // Affichage dans PreviewManager
      if (window.PreviewManager) {
        PreviewManager.show(fullName, content);
      }

      // Sauvegarde dans HistoryManager
      if (window.HistoryManager) {
        await HistoryManager.add(fullName, fileType, content);
      }

      CoreManager._toast(`✅ Fichier ${fullName} généré !`, 'success');

    } catch (err) {
      console.error('[CoreManager] generateFile:', err);
      CoreManager._toast('❌ Erreur lors de la génération.', 'error');
    }
  },

  // ----------------------------------------------------------
  // Ajoute le fichier actuellement prévisualisé au ZIP
  // ----------------------------------------------------------
  addToZip: function () {
    try {
      const fileName = document.getElementById('fileName')?.value?.trim();
      const fileType = document.getElementById('fileType')?.value?.trim();
      const fileDesc = document.getElementById('fileDescription')?.value?.trim();

      if (!fileName || !fileType) {
        CoreManager._toast('⚠️ Générez d\'abord un fichier.', 'warning');
        return;
      }

      const fullName = fileName.includes('.') ? fileName : `${fileName}.${fileType}`;
      const content  = CoreManager._buildContent(fullName, fileType, fileDesc || 'Fichier ti-lex-AL v10');

      if (window.ZipManager) {
        ZipManager.add(fullName, content);
        CoreManager._toast(`📦 ${fullName} ajouté au ZIP !`, 'success');
      } else {
        CoreManager._toast('❌ ZipManager introuvable.', 'error');
      }

    } catch (err) {
      console.error('[CoreManager] addToZip:', err);
      CoreManager._toast('❌ Erreur lors de l\'ajout au ZIP.', 'error');
    }
  },

  // ----------------------------------------------------------
  // Construction du contenu selon le type de fichier
  // ----------------------------------------------------------
  _buildContent: function (filename, type, description) {
    const date = new Date().toLocaleDateString('fr-CA');

    switch (type) {
      case 'html':
        return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${filename}</title>
  <!-- ${description} -->
  <!-- Créé par ti-lex-AL v10 — ${date} -->
  <style>
    body { font-family: sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 2rem; }
    h1   { color: #ff7f27; }
  </style>
</head>
<body>
  <h1>${filename}</h1>
  <p>${description}</p>
</body>
</html>`;

      case 'css':
        return `/* ==============================================
   ${filename}
   ${description}
   Créé par ti-lex-AL v10 — ${date}
   ============================================== */

:root {
  --color-bg      : #0a0a0a;
  --color-surface : #141414;
  --color-border  : #23232c;
  --color-orange  : #ff7f27;
  --color-gold    : #ffcf4a;
  --color-green   : #37e0a0;
  --color-text    : #ffffff;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: 'Segoe UI', sans-serif;
}`;

      case 'js':
        return `// ==============================================
// ${filename}
// ${description}
// Créé par ti-lex-AL v10 — ${date}
// ==============================================

'use strict';

(function () {

  // Initialisation au chargement du DOM
  document.addEventListener('DOMContentLoaded', function () {
    console.log('[${filename}] Chargé avec succès');
    init();
  });

  // Fonction principale
  function init() {
    // TODO: Ajouter votre logique ici
  }

})();`;

      case 'json':
        return JSON.stringify({
          nom: filename,
          description: description,
          version: '1.0.0',
          cree_par: 'ti-lex-AL v10',
          date: date,
          config: {}
        }, null, 2);

      case 'md':
        return `# ${filename.replace('.md', '')}

> ${description}

---

## Description

Ce fichier a été généré par **ti-lex-AL v10** le ${date}.

## Installation

\`\`\`bash
# Cloner le dépôt
git clone https://github.com/votre-repo
cd votre-repo
\`\`\`

## Utilisation

\`\`\`bash
# Démarrer le projet
npm install
npm start
\`\`\`

## Licence

Produit du Québec 🔶
`;

      case 'py':
        return `# ==============================================
# ${filename}
# ${description}
# Créé par ti-lex-AL v10 — ${date}
# ==============================================

import os
import json
from datetime import datetime


def main():
    """Point d'entrée principal."""
    print(f"[${filename}] Démarrage — {datetime.now()}")
    # TODO: Ajouter votre logique ici


if __name__ == "__main__":
    main()`;

      case 'sql':
        return `-- ==============================================
-- ${filename}
-- ${description}
-- Créé par ti-lex-AL v10 — ${date}
-- ==============================================

-- Exemple de table
CREATE TABLE IF NOT EXISTS exemple (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom          TEXT NOT NULL,
    description  TEXT,
    date_creation TIMESTAMPTZ DEFAULT NOW(),
    user_id      UUID REFERENCES auth.users(id)
);

-- Activer RLS
ALTER TABLE exemple ENABLE ROW LEVEL SECURITY;

-- Politique : lecture pour l'utilisateur connecté
CREATE POLICY "lecture_propre" ON exemple
    FOR SELECT USING (auth.uid() = user_id);

-- Politique : insertion pour l'utilisateur connecté
CREATE POLICY "insertion_propre" ON exemple
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index sur date_creation
CREATE INDEX idx_exemple_date ON exemple(date_creation DESC);`;

      default:
        return `// ${filename}
// ${description}
// Créé par ti-lex-AL v10 — ${date}
// Type : ${type}`;
    }
  },

  // ----------------------------------------------------------
  // Affichage d'un toast de notification
  // ----------------------------------------------------------
  _toast: function (message, type = 'info') {
    try {
      const toast = document.getElementById('toast');
      if (!toast) return;

      toast.textContent = message;
      toast.className   = `toast toast-${type} toast-visible`;

      // Cache le toast après 3 secondes
      clearTimeout(CoreManager._toastTimer);
      CoreManager._toastTimer = setTimeout(() => {
        toast.className = 'toast';
      }, 3000);

    } catch (err) {
      console.warn('[CoreManager] _toast:', err);
    }
  },

  _toastTimer: null
};
