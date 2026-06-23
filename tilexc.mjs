#!/usr/bin/env node
// tilexc — compilateur Langage ti-lex (joual) → JavaScript
// Usage: node tilexc.mjs <fichier.qc.js | dossier>
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// 📖 Dictionnaire joual → JS. MOTS-CLÉS SEULEMENT (jamais les méthodes).
const LEXIQUE_JS = {
  // contrôle
  si: "if", sinon: "else", sinonsi: "else if",
  pour: "for", tanque: "while",
  recette: "function", classe: "class",
  renvoye: "return", "lâche": "break", lache: "break", embraye: "continue",
  essaye: "try", attrape: "catch", finalement: "finally", lance: "throw",
  // déclarations
  soit: "let", fixe: "const", vieux: "var",
  // valeurs / logique
  vrai: "true", faux: "false", rien: "null",
  "indéfini": "undefined", indefini: "undefined",
  pis: "&&", ou: "||",
  // async
  asynchrone: "async", attends: "await",
  // modules
  "ramène": "import", ramene: "import", exporte: "export", depuis: "from",
  // built-in courant
  montre: "console.log",
  nouveau: "new", ceci: "this", supprime: "delete", typede: "typeof",
};

// Traduit en sautant chaînes et commentaires.
function transpile(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  const isIdStart = (c) => /[A-Za-zÀ-ÿ_$]/.test(c);
  const isIdPart  = (c) => /[A-Za-zÀ-ÿ0-9_$]/.test(c);
  while (i < n) {
    const c = src[i];
    // commentaire ligne //
    if (c === "/" && src[i + 1] === "/") {
      let j = i; while (j < n && src[j] !== "\n") j++;
      out += src.slice(i, j); i = j; continue;
    }
    // commentaire bloc /* */
    if (c === "/" && src[i + 1] === "*") {
      let j = i + 2; while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
      j = Math.min(n, j + 2); out += src.slice(i, j); i = j; continue;
    }
    // chaînes "..." '...' `...`
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let j = i + 1;
      while (j < n) { if (src[j] === "\\") { j += 2; continue; } if (src[j] === q) { j++; break; } j++; }
      out += src.slice(i, j); i = j; continue;
    }
    // identifiant (mot)
    if (isIdStart(c)) {
      let j = i + 1; while (j < n && isIdPart(src[j])) j++;
      const mot = src.slice(i, j);
      out += (Object.prototype.hasOwnProperty.call(LEXIQUE_JS, mot) ? LEXIQUE_JS[mot] : mot);
      i = j; continue;
    }
    out += c; i++;
  }
  return out;
}

function compileFile(path) {
  const src = readFileSync(path, "utf8");
  const js = transpile(src);
  const outPath = path.replace(/\.qc\.js$/, ".js");
  writeFileSync(outPath, `// ⚙️ Généré par tilexc depuis ${path} — ne pas éditer à la main\n${js}`);
  console.log(`✅ ${path} → ${outPath}`);
}

function walk(p) {
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p)) walk(join(p, f));
  } else if (p.endsWith(".qc.js")) {
    compileFile(p);
  }
}

const cible = process.argv[2];
if (!cible) { console.log("Usage: node tilexc.mjs <fichier.qc.js | dossier>"); process.exit(1); }
walk(cible);
