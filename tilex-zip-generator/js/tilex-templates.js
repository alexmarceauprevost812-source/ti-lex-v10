// =============================================================
// tilex-templates.js — Templates de projets prêts à l'emploi
// ti-lex-AL v10 | Vanilla JS pur
// =============================================================

window.TemplateManager = {

  // ----------------------------------------------------------
  // Charge et applique le template sélectionné dans #templateSelect
  // ----------------------------------------------------------
  load: function () {
    try {
      const select = document.getElementById('templateSelect');
      if (!select || !select.value) {
        TemplateManager._toast('⚠️ Sélectionnez un template.', 'warning');
        return;
      }

      const template = select.value;
      const fichiers = TemplateManager._getTemplate(template);

      if (!fichiers || fichiers.length === 0) {
        TemplateManager._toast('⚠️ Template introuvable.', 'warning');
        return;
      }

      // Ajoute chaque fichier dans ZipManager
      fichiers.forEach(function (fichier) {
        if (window.ZipManager) {
          ZipManager.add(fichier.name, fichier.content);
        }
      });

      TemplateManager._toast(
        `🚀 Template "${template}" chargé — ${fichiers.length} fichier(s) ajouté(s) au ZIP !`,
        'success'
      );

    } catch (err) {
      console.error('[TemplateManager] load:', err);
      TemplateManager._toast('❌ Erreur lors du chargement du template.', 'error');
    }
  },

  // ----------------------------------------------------------
  // Retourne les fichiers du template demandé
  // ----------------------------------------------------------
  _getTemplate: function (type) {
    const date = new Date().toLocaleDateString('fr-CA');

    switch (type) {

      // --- Template : Application Web ---
      case 'webapp':
        return [
          {
            name: 'index.html',
            content: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mon Application</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header>
    <h1>Mon Application</h1>
  </header>
  <main id="app">
    <p>Bienvenue dans votre application web.</p>
  </main>
  <script src="app.js"></script>
</body>
</html>`
          },
          {
            name: 'style.css',
            content: `/* style.css — Application Web
   Généré par ti-lex-AL v10 — ${date} */

:root {
  --bg      : #0a0a0a;
  --surface : #141414;
  --border  : #23232c;
  --accent  : #ff7f27;
  --text    : #ffffff;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background : var(--bg);
  color      : var(--text);
  font-family: 'Segoe UI', sans-serif;
  min-height : 100vh;
}

header {
  background   : var(--surface);
  border-bottom: 1px solid var(--border);
  padding      : 1rem 2rem;
}

header h1 { color: var(--accent); font-size: 1.5rem; }

main { padding: 2rem; }`
          },
          {
            name: 'app.js',
            content: `// app.js — Application Web
// Généré par ti-lex-AL v10 — ${date}

'use strict';

document.addEventListener('DOMContentLoaded', function () {
  console.log('[App] Démarrage');
  init();
});

function init() {
  // TODO: Initialiser votre application ici
}`
          }
        ];

      // --- Template : API Node.js ---
      case 'api':
        return [
          {
            name: 'server.js',
            content: `// server.js — Serveur API Node.js
// Généré par ti-lex-AL v10 — ${date}

const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'API ti-lex opérationnelle', version: '1.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Démarrage
app.listen(PORT, () => {
  console.log(\`[Server] Démarré sur le port \${PORT}\`);
});`
          },
          {
            name: 'package.json',
            content: JSON.stringify({
              name    : 'tilex-api',
              version : '1.0.0',
              description: `API générée par ti-lex-AL v10 — ${date}`,
              main    : 'server.js',
              scripts : { start: 'node server.js', dev: 'nodemon server.js' },
              dependencies: { express: '^4.18.2', cors: '^2.8.5', dotenv: '^16.0.0' },
              devDependencies: { nodemon: '^3.0.0' }
            }, null, 2)
          },
          {
            name: '.env.example',
            content: `# Variables d'environnement — Copier en .env
# Généré par ti-lex-AL v10 — ${date}

PORT=3000
NODE_ENV=development
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre_clé_anon
API_SECRET=votre_secret_api`
          }
        ];

      // --- Template : Supabase ---
      case 'supabase':
        return [
          {
            name: 'schema.sql',
            content: `-- schema.sql — Structure Supabase
-- Généré par ti-lex-AL v10 — ${date}

-- Table principale
CREATE TABLE IF NOT EXISTS projets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom          TEXT NOT NULL,
    description  TEXT,
    statut       TEXT DEFAULT 'actif',
    date_creation TIMESTAMPTZ DEFAULT NOW(),
    user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS activé
ALTER TABLE projets ENABLE ROW LEVEL SECURITY;

-- Politiques RLS
CREATE POLICY "Lecture : utilisateur propriétaire" ON projets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Insertion : utilisateur connecté" ON projets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Mise à jour : utilisateur propriétaire" ON projets
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Suppression : utilisateur propriétaire" ON projets
    FOR DELETE USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_projets_user    ON projets(user_id);
CREATE INDEX idx_projets_date    ON projets(date_creation DESC);
CREATE INDEX idx_projets_statut  ON projets(statut);`
          },
          {
            name: 'config.js',
            content: `// config.js — Configuration Supabase
// Généré par ti-lex-AL v10 — ${date}

const SUPABASE_URL     = 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_SUPABASE_ANON_KEY';

// Initialisation du client Supabase
// (requiert la librairie @supabase/supabase-js dans votre HTML)
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('[Supabase] Client initialisé');`
          },
          {
            name: 'README.md',
            content: `# Projet Supabase

> Généré par **ti-lex-AL v10** — ${date}

## Configuration

1. Copiez votre URL et votre clé anon Supabase dans \`config.js\`
2. Exécutez \`schema.sql\` dans l'éditeur SQL de Supabase
3. Activez l'authentification dans le dashboard Supabase

## Structure

- \`schema.sql\` — Tables et politiques RLS
- \`config.js\`  — Connexion au client Supabase
- \`README.md\`  — Ce fichier

---
Produit du Québec 🔶`
          }
        ];

      // --- Template : Python ---
      case 'python':
        return [
          {
            name: 'main.py',
            content: `#!/usr/bin/env python3
# main.py — Application Python
# Généré par ti-lex-AL v10 — ${date}

import os
import json
import logging
from datetime import datetime

# Configuration du logger
logging.basicConfig(
    level   = logging.INFO,
    format  = '[%(asctime)s] %(levelname)s — %(message)s',
    datefmt = '%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def main():
    """Point d'entrée principal de l'application."""
    logger.info("Démarrage de l'application ti-lex")
    
    # TODO: Ajouter votre logique ici
    data = {
        "nom"    : "ti-lex-AL v10",
        "statut" : "actif",
        "date"   : datetime.now().isoformat()
    }
    
    logger.info(f"Config : {json.dumps(data, ensure_ascii=False)}")
    return data


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, ensure_ascii=False, indent=2))`
          },
          {
            name: 'requirements.txt',
            content: `# requirements.txt — Dépendances Python
# Généré par ti-lex-AL v10 — ${date}

requests>=2.31.0
python-dotenv>=1.0.0
supabase>=1.0.0`
          },
          {
            name: 'README.md',
            content: `# Projet Python

> Généré par **ti-lex-AL v10** — ${date}

## Installation

\`\`\`bash
# Créer un environnement virtuel
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\\Scripts\\activate  # Windows

# Installer les dépendances
pip install -r requirements.txt
\`\`\`

## Utilisation

\`\`\`bash
python main.py
\`\`\`

---
Produit du Québec 🔶`
          }
        ];

      // --- Template : ti-lex complet ---
      case 'tilex':
        return [
          {
            name: 'app.html',
            content: `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ti-lex-AL v10</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="app-header">
    <div class="header-logo">
      <span class="logo-icon">🛡️</span>
      <span class="logo-text">ti<span class="logo-accent">-lex</span></span>
      <span class="logo-version">AL v10</span>
    </div>
    <nav class="header-nav">
      <button onclick="ThemeManager.toggle()">🎨 Thème</button>
      <button onclick="HistoryManager.open()">📋 Historique</button>
    </nav>
  </header>

  <main class="app-main">
    <!-- Formulaire de génération -->
    <section class="gen-section">
      <h2>Générer un fichier</h2>
      <input id="fileName"        type="text"   placeholder="Nom du fichier" />
      <select id="fileType">
        <option value="html">HTML</option>
        <option value="css">CSS</option>
        <option value="js">JavaScript</option>
        <option value="json">JSON</option>
        <option value="md">Markdown</option>
        <option value="py">Python</option>
        <option value="sql">SQL</option>
      </select>
      <textarea id="fileDescription" placeholder="Description du fichier…"></textarea>
      <button onclick="CoreManager.generateFile()">⚡ Générer</button>
      <button onclick="CoreManager.addToZip()">📦 Ajouter au ZIP</button>
    </section>

    <!-- Aperçu -->
    <section id="previewSection" style="display:none">
      <div id="previewTitle"></div>
      <pre id="previewContent"></pre>
      <button onclick="PreviewManager.copy()">📋 Copier</button>
      <button onclick="PreviewManager.download()">⬇️ Télécharger</button>
    </section>

    <!-- ZIP -->
    <section class="zip-section">
      <h3>Fichiers ZIP <span id="zipCount">0 fichier(s)</span></h3>
      <ul id="zipFileList"></ul>
      <button onclick="ZipManager.preview()">👁 Aperçu ZIP</button>
      <button onclick="ZipManager.download()">📥 Télécharger ZIP</button>
      <button onclick="ZipManager.clear()">🗑️ Vider</button>
    </section>
  </main>

  <!-- Toast -->
  <div id="toast" class="toast"></div>

  <!-- Scripts -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
  <script src="js/tilex-theme.js"></script>
  <script src="js/tilex-core.js"></script>
  <script src="js/tilex-preview.js"></script>
  <script src="js/tilex-zip.js"></script>
  <script src="js/tilex-templates.js"></script>
  <script src="js/tilex-history.js"></script>
  <script src="js/tilex-share.js"></script>
</body>
</html>`
          },
          {
            name: 'styles.css',
            content: `/* styles.css — ti-lex-AL v10
   Généré par ti-lex-AL v10 — ${date} */

:root {
  --bg      : #0a0a0a;
  --surface : #141414;
  --border  : #23232c;
  --orange  : #ff7f27;
  --gold    : #ffcf4a;
  --green   : #37e0a0;
  --text    : #ffffff;
}

body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; }
.app-header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
.logo-accent { color: var(--orange); }
.logo-version { font-size: 0.75rem; color: var(--gold); margin-left: 0.5rem; }`
          },
          {
            name: 'api/indar.js',
            content: `// api/indar.js — Vercel Edge Function — Centre INDAR
// Généré par ti-lex-AL v10 — ${date}

export const config = { runtime: 'edge' };

const AGENTS = {
  'NEXUS-AL'   : 'Tu es NEXUS-AL, analyste réseau cybersécurité expert.',
  'MARCEAU'    : 'Tu es MARCEAU, agent de renseignement stratégique.',
  'CIPHER'     : 'Tu es CIPHER, expert en cryptographie et chiffrement.',
  'SENTINEL'   : 'Tu es SENTINEL, gardien des politiques de sécurité.',
  'ORACLE'     : 'Tu es ORACLE, analyste prédictif des menaces.',
  'PHANTOM-RED': 'Tu es PHANTOM-RED, expert en tests d\'intrusion offensifs.'
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Méthode non autorisée', { status: 405 });
  }

  try {
    const { agent, prompt } = await req.json();
    const systemPrompt = AGENTS[agent] || AGENTS['NEXUS-AL'];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method  : 'POST',
      headers : {
        'Content-Type'      : 'application/json',
        'x-api-key'         : process.env.ANTHROPIC_API_KEY,
        'anthropic-version' : '2023-06-01'
      },
      body: JSON.stringify({
        model      : 'claude-sonnet-4-6',
        max_tokens : 1024,
        system     : systemPrompt,
        messages   : [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status  : 500,
      headers : { 'Content-Type': 'application/json' }
    });
  }
}`
          },
          {
            name: 'README.md',
            content: `# ti-lex-AL v10

> Plateforme québécoise de cybersécurité défensive alimentée par l'IA
> Généré le ${date}

## Stack technique
- Vanilla HTML/CSS/JS
- Supabase (base de données + Auth)
- Vercel (déploiement + Edge Functions)
- Claude API (via Centre INDAR)

## Structure
\`\`\`
├── app.html           → Interface principale
├── styles.css         → Thème dark ti-lex
├── js/                → Modules JavaScript
│   ├── tilex-core.js
│   ├── tilex-preview.js
│   ├── tilex-zip.js
│   ├── tilex-templates.js
│   ├── tilex-theme.js
│   ├── tilex-history.js
│   └── tilex-share.js
└── api/
    └── indar.js       → Edge Function Centre INDAR
\`\`\`

## Agents Centre INDAR
| Agent       | Rôle |
|-------------|------|
| NEXUS-AL    | Analyste réseau |
| MARCEAU     | Renseignement stratégique |
| CIPHER      | Cryptographie |
| SENTINEL    | Politiques sécurité |
| ORACLE      | Analyse prédictive |
| PHANTOM-RED | Tests d'intrusion |

---
**Produit du Québec** 🔶`
          }
        ];

      default:
        return [];
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
