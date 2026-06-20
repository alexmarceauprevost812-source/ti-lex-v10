/* ════════════════════════════════════════════
   TILEX-TEMPLATES.JS — ti-lex-AL v10
   Contenu pré-rempli intelligent + Templates projets
════════════════════════════════════════════ */
'use strict';

window.TILEX = window.TILEX || {};

const today = () => new Date().toISOString().slice(0, 10);

/* ════════════════════════════════════════════
   1. CONTENU PAR EXTENSION
════════════════════════════════════════════ */
TILEX.contentTemplates = {

  js: (nom) => `// ──────────────────────────────────────
// Module : ${nom}
// Créé   : ${today()}
// ──────────────────────────────────────
'use strict';

// ── Configuration ──
const CONFIG = {};

/**
 * Fonction principale.
 * @param {Object} options
 * @returns {*}
 */
function main(options = {}) {
  console.log('[${nom}] démarrage', options);
  // TODO : implémenter
  return null;
}

export { main, CONFIG };
`,

  ts: (nom) => `// ──────────────────────────────────────
// Module TypeScript : ${nom}
// Créé : ${today()}
// ──────────────────────────────────────

export interface Options {
  debug?: boolean;
  [key: string]: unknown;
}

export interface Resultat<T = unknown> {
  succes: boolean;
  donnees?: T;
  erreur?: string;
}

export function main<T>(options: Options = {}): Resultat<T> {
  try {
    if (options.debug) console.log('[${nom}]', options);
    return { succes: true };
  } catch (err) {
    return { succes: false, erreur: String(err) };
  }
}
`,

  jsx: (nom) => {
    const C = toPascal(nom);
    return `import { useState, useEffect } from 'react';

/**
 * Composant : ${C}
 */
export default function ${C}({ /* props */ }) {
  const [etat, setEtat] = useState(null);

  useEffect(() => {
    // TODO : charger les données
  }, []);

  return (
    <div className="${C.toLowerCase()}">
      <h2>${C}</h2>
    </div>
  );
}
`;
  },

  tsx: (nom) => {
    const C = toPascal(nom);
    return `import { useState, useEffect } from 'react';

interface Props {
  titre?: string;
  className?: string;
}

export default function ${C}({ titre = '${C}', className = '' }: Props) {
  const [etat, setEtat] = useState<string | null>(null);

  useEffect(() => {
    // TODO
  }, []);

  return (
    <div className={\`${C.toLowerCase()} \${className}\`}>
      <h2>{titre}</h2>
      {etat && <p>{etat}</p>}
    </div>
  );
}
`;
  },

  html: (nom) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${nom.replace(/\.html?$/, '')}</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <header>
    <h1>Titre</h1>
  </header>
  <main>
    <section>
      <h2>Section</h2>
      <p>Contenu</p>
    </section>
  </main>
  <footer>
    <p>&copy; ${new Date().getFullYear()}</p>
  </footer>
  <script src="js/app.js" type="module"></script>
</body>
</html>
`,

  css: (nom) => `/* ──────────────────────────────────────
   Styles : ${nom} · ${today()}
   ────────────────────────────────────── */

/* ── Variables ── */
:root {
  --accent:   #ff7f27;
  --bg:       #0a0a0a;
  --surface:  #111118;
  --text:     #e8e8f0;
  --muted:    #6b6b80;
  --font:     system-ui, sans-serif;
  --radius:   6px;
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Base ── */
body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.65;
}

h1, h2, h3 { line-height: 1.25; }
a { color: var(--accent); text-decoration: none; }

.conteneur { max-width: 1100px; margin: 0 auto; padding: 0 20px; }
`,

  scss: (nom) => `// ──────────────────────────────────────
// SCSS : ${nom} · ${today()}
// ──────────────────────────────────────

$accent:  #ff7f27;
$bg:      #0a0a0a;
$surface: #111118;
$text:    #e8e8f0;
$radius:  6px;

@mixin flex-centre {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin responsive($bp) {
  @if $bp == mobile { @media (max-width: 640px) { @content; } }
}

.conteneur {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 20px;

  @include responsive(mobile) { padding: 0 12px; }
}
`,

  json: (nom) => `{
  "nom": "${nom.replace('.json', '')}",
  "version": "1.0.0",
  "cree_le": "${today()}"
}
`,

  'package.json': () => `{
  "name": "mon-projet",
  "version": "1.0.0",
  "description": "",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev":   "node --watch index.js",
    "test":  "node --test"
  },
  "keywords": [],
  "author": "",
  "license": "MIT",
  "dependencies": {},
  "devDependencies": {}
}
`,

  'tsconfig.json': () => `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`,

  md: (nom) => {
    const titre = nom.replace('.md', '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `# ${titre}

> Description courte en une phrase.

## Installation

\`\`\`bash
npm install
\`\`\`

## Utilisation

\`\`\`bash
npm start
\`\`\`

## API

| Méthode | Description |
|---------|-------------|
| \`main()\` | Fonction principale |

## Licence

MIT · ${new Date().getFullYear()}
`;
  },

  py: (nom) => `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Module : ${nom} · ${today()}"""

import os
import sys
import logging
from typing import Optional, Dict, Any

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

CONFIG: Dict[str, Any] = {}


def traiter(donnees: Optional[Dict] = None) -> Dict[str, Any]:
    """Traiter les données."""
    if donnees is None:
        donnees = {}
    log.info("Traitement démarré")
    return {"succes": True, "donnees": donnees}


def main() -> None:
    log.info("Démarrage")
    resultat = traiter()
    log.info("Résultat : %s", resultat)


if __name__ == "__main__":
    main()
`,

  sql: (nom) => {
    const t = nom.replace('.sql', '').replace(/[-]/g, '_').toLowerCase();
    return `-- ──────────────────────────────────────
-- SQL : ${nom} · ${today()}
-- ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS ${t} (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT        NOT NULL,
  description TEXT,
  actif       BOOLEAN     NOT NULL DEFAULT true,
  metadonnees JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_${t}_created ON ${t} (created_at DESC);

-- RLS
ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "..." ON ${t} FOR SELECT USING (auth.uid() = user_id);
`;
  },

  sh: (nom) => `#!/usr/bin/env bash
# ──────────────────────────────────────
# Script : ${nom} · ${today()}
# Usage  : ./${nom} [--aide]
# ──────────────────────────────────────
set -euo pipefail

VERT='\\033[0;32m'; ROUGE='\\033[0;31m'; RESET='\\033[0m'
log()    { echo -e "\${VERT}[OK]\${RESET}  $*"; }
erreur() { echo -e "\${ROUGE}[ERR]\${RESET} $*" >&2; exit 1; }

main() {
  log "Démarrage ${nom}"
  # TODO
  log "Terminé ✓"
}

main "$@"
`,

  yml: (nom) => `# Config : ${nom} · ${today()}
version: '1.0'

application:
  nom: mon-projet
  version: 1.0.0
  env: developpement

base_de_donnees:
  hote: localhost
  port: 5432
  nom: ma_base
`,

  env: () => `# Variables d'environnement — NE PAS COMMITTER
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

DATABASE_URL=postgresql://user:password@localhost:5432/mabase

ANTHROPIC_API_KEY=
SUPABASE_URL=https://rnuripmfozlxenryxhdc.supabase.co
SUPABASE_ANON_KEY=
`,

  gitignore: () => `node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
.next/
.nuxt/
coverage/
`,

  'index.ts': (nom) => `// Edge Function Supabase : ${nom} · ${today()}
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json();
    return repondre({ recu: true, body });
  } catch (err) {
    return repondre({ erreur: String(err) }, 500);
  }
});

function repondre(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
`,
};

/* Alias */
TILEX.contentTemplates.mjs    = TILEX.contentTemplates.js;
TILEX.contentTemplates.cjs    = TILEX.contentTemplates.js;
TILEX.contentTemplates.htm    = TILEX.contentTemplates.html;
TILEX.contentTemplates.sass   = TILEX.contentTemplates.scss;
TILEX.contentTemplates.yaml   = TILEX.contentTemplates.yml;
TILEX.contentTemplates.bash   = TILEX.contentTemplates.sh;
TILEX.contentTemplates.mdx    = TILEX.contentTemplates.md;

/* Noms exacts prioritaires */
TILEX.exactTemplates = {
  'package.json':  TILEX.contentTemplates['package.json'],
  'tsconfig.json': TILEX.contentTemplates['tsconfig.json'],
  '.gitignore':    TILEX.contentTemplates['gitignore'],
  '.env':          TILEX.contentTemplates['env'],
  '.env.local':    TILEX.contentTemplates['env'],
  'index.ts':      TILEX.contentTemplates['index.ts'],
};

/* Obtenir le template pour un nom de fichier */
TILEX.getContentTemplate = function(nomFichier) {
  const nom = nomFichier.trim();
  if (!nom) return null;
  if (TILEX.exactTemplates[nom]) return TILEX.exactTemplates[nom](nom);
  const ext = nom.includes('.') ? nom.split('.').pop().toLowerCase() : null;
  if (ext && TILEX.contentTemplates[ext]) return TILEX.contentTemplates[ext](nom);
  return null;
};

/* ════════════════════════════════════════════
   2. TEMPLATES DE PROJETS COMPLETS
════════════════════════════════════════════ */
TILEX.projectTemplates = {

  'tilex-al': {
    nom:  'ti-lex-AL',
    icone: '⚡',
    desc: 'Structure complète ti-lex-AL v10',
    fichiers: [
      { nom: 'index.html',              ext: 'html' },
      { nom: 'css/style.css',           ext: 'css'  },
      { nom: 'js/app.js',               ext: 'js'   },
      { nom: 'js/agents/marceau.js',    ext: 'js'   },
      { nom: 'js/agents/claude-al.js',  ext: 'js'   },
      { nom: 'js/utils/streaming.js',   ext: 'js'   },
      { nom: '.env.example',            ext: 'env'  },
      { nom: 'supabase/functions/marceau-reflection/index.ts', ext: 'index.ts' },
      { nom: 'README.md',               ext: 'md'   },
    ],
  },

  'api': {
    nom:  'API Pure',
    icone: '🔌',
    desc: 'API Node.js avec routes et auth',
    fichiers: [
      { nom: 'index.js',                 ext: 'js'           },
      { nom: 'routes/api.js',            ext: 'js'           },
      { nom: 'routes/auth.js',           ext: 'js'           },
      { nom: 'middleware/auth.js',       ext: 'js'           },
      { nom: 'middleware/logger.js',     ext: 'js'           },
      { nom: 'config/db.js',             ext: 'js'           },
      { nom: 'package.json',             ext: 'package.json' },
      { nom: '.env',                     ext: 'env'          },
      { nom: '.gitignore',               ext: 'gitignore'    },
      { nom: 'README.md',                ext: 'md'           },
    ],
  },

  'landing': {
    nom:  'Landing Page',
    icone: '🌐',
    desc: 'Page d\'atterrissage moderne',
    fichiers: [
      { nom: 'index.html',       ext: 'html' },
      { nom: 'css/landing.css',  ext: 'css'  },
      { nom: 'css/animations.css', ext: 'css' },
      { nom: 'js/main.js',       ext: 'js'   },
      { nom: 'js/animations.js', ext: 'js'   },
      { nom: 'README.md',        ext: 'md'   },
    ],
  },

  'supabase': {
    nom:  'Supabase Edge',
    icone: '🗄️',
    desc: 'Edge Functions + migrations SQL',
    fichiers: [
      { nom: 'supabase/functions/api/index.ts',   ext: 'index.ts' },
      { nom: 'supabase/functions/auth/index.ts',  ext: 'index.ts' },
      { nom: 'supabase/migrations/001_init.sql',  ext: 'sql'      },
      { nom: 'supabase/migrations/002_rls.sql',   ext: 'sql'      },
      { nom: '.env',                               ext: 'env'      },
      { nom: 'README.md',                          ext: 'md'       },
    ],
  },

  'vide': {
    nom:   'Vide',
    icone: '📄',
    desc:  'Partir de zéro',
    fichiers: [],
  },
};

/* Charger un template de projet */
TILEX.chargerTemplate = function(templateKey) {
  const tpl = TILEX.projectTemplates[templateKey];
  if (!tpl) return [];

  return tpl.fichiers.map(f => {
    const contenu = TILEX.getContentTemplate(f.nom) ||
                    TILEX.getContentTemplate('fichier.' + f.ext) || '';
    return { nom: f.nom, contenu };
  });
};

/* ════════════════════════════════════════════
   3. INFOS LANG (pour preview + badges)
════════════════════════════════════════════ */
TILEX.langMap = {
  js:   { hljs: 'javascript', badge: 'JS',   cls: 'badge-js',   icone: '🟨' },
  mjs:  { hljs: 'javascript', badge: 'JS',   cls: 'badge-js',   icone: '🟨' },
  cjs:  { hljs: 'javascript', badge: 'JS',   cls: 'badge-js',   icone: '🟨' },
  jsx:  { hljs: 'javascript', badge: 'JSX',  cls: 'badge-js',   icone: '🟨' },
  ts:   { hljs: 'typescript', badge: 'TS',   cls: 'badge-ts',   icone: '🔷' },
  tsx:  { hljs: 'typescript', badge: 'TSX',  cls: 'badge-ts',   icone: '🔷' },
  html: { hljs: 'html',       badge: 'HTML', cls: 'badge-html', icone: '🌐' },
  htm:  { hljs: 'html',       badge: 'HTML', cls: 'badge-html', icone: '🌐' },
  css:  { hljs: 'css',        badge: 'CSS',  cls: 'badge-css',  icone: '🎨' },
  scss: { hljs: 'scss',       badge: 'SCSS', cls: 'badge-css',  icone: '🎨' },
  sass: { hljs: 'scss',       badge: 'SASS', cls: 'badge-css',  icone: '🎨' },
  json: { hljs: 'json',       badge: 'JSON', cls: 'badge-json', icone: '📋' },
  md:   { hljs: null,         badge: 'MD',   cls: 'badge-md',   icone: '📝' },
  mdx:  { hljs: null,         badge: 'MDX',  cls: 'badge-md',   icone: '📝' },
  py:   { hljs: 'python',     badge: 'PY',   cls: 'badge-py',   icone: '🐍' },
  sql:  { hljs: 'sql',        badge: 'SQL',  cls: 'badge-sql',  icone: '🗄️' },
  sh:   { hljs: 'bash',       badge: 'SH',   cls: 'badge-sh',   icone: '⚙️' },
  bash: { hljs: 'bash',       badge: 'SH',   cls: 'badge-sh',   icone: '⚙️' },
  yml:  { hljs: 'yaml',       badge: 'YAML', cls: 'badge-json', icone: '📋' },
  yaml: { hljs: 'yaml',       badge: 'YAML', cls: 'badge-json', icone: '📋' },
  env:  { hljs: 'bash',       badge: 'ENV',  cls: 'badge-sh',   icone: '🔑' },
  txt:  { hljs: null,         badge: 'TXT',  cls: 'badge-txt',  icone: '📄' },
  log:  { hljs: null,         badge: 'LOG',  cls: 'badge-txt',  icone: '📄' },
};

TILEX.getLangInfo = function(nomFichier) {
  const nom = nomFichier || '';
  const base = nom.split('/').pop();
  if (TILEX.exactTemplates[base]) {
    const ext = base.split('.').pop().toLowerCase();
    return TILEX.langMap[ext] || { hljs: 'json', badge: 'JSON', cls: 'badge-json', icone: '📋' };
  }
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : 'txt';
  return TILEX.langMap[ext] || { hljs: null, badge: ext.toUpperCase(), cls: 'badge-txt', icone: '📄' };
};

/* ── Helpers ── */
function toPascal(nom) {
  const base = nom.split('/').pop().replace(/\.[^.]+$/, '');
  return base.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
}

console.log('[ti-lex] Templates chargés ✓ (' +
  Object.keys(TILEX.contentTemplates).length + ' types, ' +
  Object.keys(TILEX.projectTemplates).length + ' projets)');
