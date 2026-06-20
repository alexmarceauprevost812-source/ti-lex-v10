(function () {
  'use strict';

  var today = function() { return new Date().toISOString().slice(0, 10); };

  var TEMPLATES = {
    js: function(nom) { return '// Module : ' + nom + '\n// Créé le : ' + today() + '\n\'use strict\';\n\nconst CONFIG = {};\n\nfunction main(options) {\n  console.log(\'[' + nom + '] démarrage\', options || {});\n  return null;\n}\n\nexport { main, CONFIG };\n'; },

    ts: function(nom) { return '// Module TypeScript : ' + nom + '\n// Créé le : ' + today() + '\n\nexport interface Options {\n  debug?: boolean;\n}\n\nexport interface Resultat<T = unknown> {\n  succes: boolean;\n  donnees?: T;\n  erreur?: string;\n}\n\nexport function main<T>(options: Options = {}): Resultat<T> {\n  try {\n    if (options.debug) console.log(\'[' + nom + '] options :\', options);\n    return { succes: true };\n  } catch (err) {\n    return { succes: false, erreur: String(err) };\n  }\n}\n'; },

    jsx: function(nom) {
      var Composant = nom.replace(/\.[^.]+$/, '').replace(/(^|[-_])(\w)/g, function(_, __, c) { return c.toUpperCase(); });
      return 'import { useState, useEffect } from \'react\';\n\nexport default function ' + Composant + '() {\n  const [etat, setEtat] = useState(null);\n\n  useEffect(function() {\n    // TODO\n  }, []);\n\n  return (\n    <div className="' + Composant.toLowerCase() + '">\n      <h2>' + Composant + '</h2>\n    </div>\n  );\n}\n';
    },

    tsx: function(nom) {
      var Composant = nom.replace(/\.[^.]+$/, '').replace(/(^|[-_])(\w)/g, function(_, __, c) { return c.toUpperCase(); });
      return 'import { useState, useEffect } from \'react\';\n\ninterface Props {\n  titre?: string;\n  className?: string;\n}\n\nexport default function ' + Composant + '({ titre = \'' + Composant + '\', className = \'\' }: Props) {\n  const [etat, setEtat] = useState<string | null>(null);\n\n  useEffect(function() {\n    // TODO\n  }, []);\n\n  return (\n    <div className={`' + Composant.toLowerCase() + ' ${className}`}>\n      <h2>{titre}</h2>\n      {etat && <p>{etat}</p>}\n    </div>\n  );\n}\n';
    },

    html: function(nom) { return '<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>' + nom.replace('.html', '') + '</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n\n  <header>\n    <h1>Titre principal</h1>\n    <nav><a href="#">Accueil</a></nav>\n  </header>\n\n  <main>\n    <section>\n      <h2>Section</h2>\n      <p>Contenu de la page.</p>\n    </section>\n  </main>\n\n  <footer>\n    <p>&copy; ' + new Date().getFullYear() + ' · ti-lex v10</p>\n  </footer>\n\n  <script src="script.js" type="module"><\/script>\n</body>\n</html>\n'; },

    css: function(nom) { return '/* Styles : ' + nom + ' · ' + today() + ' */\n\n:root {\n  --couleur-accent:  #ff7f27;\n  --couleur-fond:    #0a0a0a;\n  --couleur-surface: #111118;\n  --couleur-texte:   #e8e8f0;\n  --police: system-ui, sans-serif;\n  --rayon: 6px;\n}\n\n*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n\nbody {\n  font-family: var(--police);\n  background: var(--couleur-fond);\n  color: var(--couleur-texte);\n  line-height: 1.65;\n  min-height: 100vh;\n}\n\nh1, h2, h3 { line-height: 1.25; font-weight: 700; }\na { color: var(--couleur-accent); text-decoration: none; }\na:hover { text-decoration: underline; }\n'; },

    scss: function(nom) { return '// Styles SCSS : ' + nom + ' · ' + today() + '\n\n$accent:  #ff7f27;\n$fond:    #0a0a0a;\n$surface: #111118;\n$texte:   #e8e8f0;\n$rayon:   6px;\n\n@mixin flex-centre {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n@mixin responsive($bp) {\n  @if $bp == mobile  { @media (max-width: 640px)  { @content; } }\n  @if $bp == tablette { @media (max-width: 1024px) { @content; } }\n}\n\n.conteneur {\n  max-width: 1100px;\n  margin: 0 auto;\n  padding: 0 20px;\n  @include responsive(mobile) { padding: 0 12px; }\n}\n\n.btn {\n  @include flex-centre;\n  background: $accent;\n  color: #0a0a0a;\n  border: none;\n  border-radius: $rayon;\n  padding: 10px 20px;\n  font-weight: 700;\n  cursor: pointer;\n  &:hover { opacity: 0.85; }\n  &:disabled { opacity: 0.4; cursor: not-allowed; }\n}\n'; },

    json: function(nom) { return '{\n  "nom": "' + nom.replace('.json', '') + '",\n  "version": "1.0.0",\n  "description": "",\n  "cree_le": "' + today() + '",\n  "donnees": []\n}\n'; },

    md: function(nom) {
      var titre = nom.replace('.md', '').replace(/[-_]/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      return '# ' + titre + '\n\n> Description courte du projet.\n\n## Installation\n\n```bash\ngit clone https://github.com/utilisateur/' + nom.replace('.md', '') + '\nnpm install\n```\n\n## Utilisation\n\n```bash\nnpm start\n```\n\n## API\n\n| Méthode | Description | Paramètres |\n|---------|-------------|------------|\n| `main()` | Fonction principale | `options: object` |\n\n## Licence\n\n[MIT](LICENSE) · ' + new Date().getFullYear() + '\n';
    },

    py: function(nom) { return '#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\n"""Module : ' + nom + ' · ' + today() + '"""\n\nimport os\nimport sys\nimport logging\nfrom typing import Optional, Dict, Any\n\nlogging.basicConfig(level=logging.INFO, format=\'%(levelname)s: %(message)s\')\nlog = logging.getLogger(__name__)\n\nCONFIG: Dict[str, Any] = {"debug": False}\n\n\ndef traiter(donnees: Optional[Dict] = None) -> Dict[str, Any]:\n    if donnees is None:\n        donnees = {}\n    log.info("Traitement démarré")\n    return {"succes": True, "donnees": donnees}\n\n\ndef main() -> None:\n    log.info("Démarrage de ' + nom + '")\n    resultat = traiter()\n    log.info("Résultat : %s", resultat)\n\n\nif __name__ == "__main__":\n    main()\n'; },

    sql: function(nom) {
      var table = nom.replace('.sql', '').replace(/[-]/g, '_').toLowerCase();
      return '-- Fichier SQL : ' + nom + ' · ' + today() + '\n\nCREATE TABLE IF NOT EXISTS ' + table + ' (\n  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),\n  nom         TEXT        NOT NULL,\n  description TEXT,\n  actif       BOOLEAN     NOT NULL DEFAULT true,\n  metadonnees JSONB       DEFAULT \'{}\',\n  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),\n  updated_at  TIMESTAMPTZ\n);\n\nCREATE INDEX IF NOT EXISTS idx_' + table + '_nom ON ' + table + ' (nom);\nCREATE INDEX IF NOT EXISTS idx_' + table + '_created_at ON ' + table + ' (created_at DESC);\n';
    },

    sh: function(nom) { return '#!/usr/bin/env bash\n# Script : ' + nom + ' · ' + today() + '\nset -euo pipefail\nIFS=$\'\\n\\t\'\n\nreadonly VERSION="1.0.0"\n\nROUGE=\'\\033[0;31m\'\nVERT=\'\\033[0;32m\'\nJAUNE=\'\\033[1;33m\'\nRESET=\'\\033[0m\'\n\nlog()    { echo -e "${VERT}[INFO]${RESET}  $*"; }\nwarn()   { echo -e "${JAUNE}[WARN]${RESET}  $*"; }\nerreur() { echo -e "${ROUGE}[ERR]${RESET}   $*" >&2; exit 1; }\n\nmain() {\n  log "Démarrage ' + nom + ' v$VERSION"\n  # TODO\n  log "Terminé"\n}\n\nmain "$@"\n'; },

    yml: function(nom) { return '# Configuration : ' + nom + ' · ' + today() + '\n\nversion: \'1.0\'\n\napplication:\n  nom: mon-projet\n  version: 1.0.0\n  environnement: developpement\n  debug: true\n  port: 3000\n\nbase_de_donnees:\n  hote: localhost\n  port: 5432\n  nom: ma_base\n\nlogs:\n  niveau: info\n  format: json\n'; },

    env: function() { return '# Variables d\'environnement\n# NE PAS COMMITTER CE FICHIER\n\nNODE_ENV=development\nPORT=3000\nAPP_URL=http://localhost:3000\nAPP_SECRET=changer_en_production\n\nDATABASE_URL=postgresql://user:password@localhost:5432/ma_base\n\nANTHROPIC_API_KEY=\nSUPABASE_URL=\nSUPABASE_ANON_KEY=\n'; },

    gitignore: function() { return 'node_modules/\ndist/\nbuild/\n.next/\n.env\n.env.local\n.env.*.local\n*.pem\n.vscode/settings.json\n.idea/\n*.swp\n.DS_Store\nThumbs.db\nlogs/\n*.log\ncoverage/\ntmp/\n*.tmp\n'; }
  };

  TEMPLATES.mjs = TEMPLATES.js;
  TEMPLATES.cjs = TEMPLATES.js;
  TEMPLATES.sass = TEMPLATES.scss;
  TEMPLATES.yaml = TEMPLATES.yml;
  TEMPLATES.bash = TEMPLATES.sh;
  TEMPLATES.htm = TEMPLATES.html;
  TEMPLATES.mdx = TEMPLATES.md;

  var NOMS_EXACTS = {
    'package.json': function() { return '{\n  "name": "mon-projet",\n  "version": "1.0.0",\n  "description": "",\n  "type": "module",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js",\n    "dev": "node --watch index.js",\n    "test": "node --test"\n  },\n  "keywords": [],\n  "license": "MIT",\n  "dependencies": {},\n  "devDependencies": {}\n}\n'; },
    'tsconfig.json': function() { return '{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "ESNext",\n    "moduleResolution": "bundler",\n    "lib": ["ES2022", "DOM"],\n    "strict": true,\n    "outDir": "./dist",\n    "rootDir": "./src",\n    "declaration": true,\n    "sourceMap": true,\n    "esModuleInterop": true,\n    "skipLibCheck": true\n  },\n  "include": ["src/**/*"],\n  "exclude": ["node_modules", "dist"]\n}\n'; },
    '.gitignore': TEMPLATES.gitignore,
    '.env': TEMPLATES.env,
    '.env.local': TEMPLATES.env
  };

  window.tilexTemplates = {
    obtenir: function(nomFichier) {
      var nom = (nomFichier || '').trim();
      if (!nom) return null;
      if (NOMS_EXACTS[nom]) return NOMS_EXACTS[nom](nom);
      var ext = nom.indexOf('.') !== -1 ? nom.split('.').pop().toLowerCase() : null;
      if (ext && TEMPLATES[ext]) return TEMPLATES[ext](nom);
      return null;
    },
    supportes: function() {
      return Object.keys(TEMPLATES).concat(Object.keys(NOMS_EXACTS));
    }
  };
})();
