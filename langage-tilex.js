// ti-lex v10 — Langage ti-lex (joual ↔ anglais) — vanilla JS
// Dictionnaire fonction → mot-clé. Toggle: anglais (off) / québécois (on).

// ============================================================
// 📖 LE DICTIONNAIRE — clé canonique : { en, qc, type, do? }
// ============================================================
export const LEXIQUE = {
  // ---- Contrôle (style Python) ----
  if:       { en: "if",       qc: "si",       type: "contrôle" },
  elif:     { en: "elif",     qc: "sinonsi",  type: "contrôle" },
  else:     { en: "else",     qc: "sinon",    type: "contrôle" },
  for:      { en: "for",      qc: "pour",     type: "contrôle" },
  while:    { en: "while",    qc: "tanque",   type: "contrôle" },
  def:      { en: "def",      qc: "recette",  type: "contrôle" },
  class:    { en: "class",    qc: "classe",   type: "contrôle" },
  return:   { en: "return",   qc: "renvoye",  type: "contrôle" },
  break:    { en: "break",    qc: "lâche",    type: "contrôle" },
  continue: { en: "continue", qc: "embraye",  type: "contrôle" },
  import:   { en: "import",   qc: "ramène",   type: "fonction" },
  print:    { en: "print",    qc: "montre",   type: "fonction" },

  // ---- Valeurs & logique ----
  true:  { en: "True",  qc: "vrai", type: "valeur" },
  false: { en: "False", qc: "faux", type: "valeur" },
  none:  { en: "None",  qc: "rien", type: "valeur" },
  and:   { en: "and",   qc: "pis",  type: "logique" },
  or:    { en: "or",    qc: "ou",   type: "logique" },
  not:   { en: "not",   qc: "pas",  type: "logique" },
  in:    { en: "in",    qc: "dans", type: "logique" },

  // ---- Actions ti-lex (do = action réelle déclenchée) ----
  connect:  { en: "connect",  qc: "branche",  type: "action", do: "auto_connect" },
  chat:     { en: "chat",     qc: "jase",     type: "action", do: "chat" },
  commit:   { en: "commit",   qc: "pousse",   type: "action", do: "commit" },
  scan:     { en: "scan",     qc: "fouille",  type: "action", do: "scan" },
  lock:     { en: "lock",     qc: "barre",    type: "action", do: "lock" },
  unlock:   { en: "unlock",   qc: "débarre",  type: "action", do: "unlock" },
  report:   { en: "report",   qc: "rapport",  type: "action", do: "report" },
  activate: { en: "activate", qc: "pèse",     type: "action", do: "activate" },
};

// ============================================================
// 🎛️ ÉTAT + TOGGLE — "annuler la fonction" = anglais / "activer" = joual
// ============================================================
export const LangageTilex = {
  mode: "en", // "en" par défaut (fonction annulée) · "qc" quand activée
  active(on) { this.mode = on ? "qc" : "en"; return this.mode; },
  estJoual() { return this.mode === "qc"; },
};

// ============================================================
// 🔁 TRADUCTEUR — convertit du code d'une langue à l'autre
// ============================================================
export function traduire(code, vers) {
  vers = vers || LangageTilex.mode;
  const de = vers === "qc" ? "en" : "qc";
  const map = {};
  for (const v of Object.values(LEXIQUE)) {
    if (v[de] && v[vers]) map[v[de].toLowerCase()] = v[vers];
  }
  return code.replace(/[A-Za-zÀ-ÿ_]+/g, (mot) => map[mot.toLowerCase()] || mot);
}

// ============================================================
// 🧠 RÉSOLVEUR — mot-clé (dans le mode courant) → clé canonique
// ============================================================
function motsDuMode(mode) {
  const m = {};
  for (const [canon, v] of Object.entries(LEXIQUE)) {
    const mot = (v[mode] || "").toLowerCase();
    if (mot) m[mot] = canon;
  }
  return m;
}

export function resoudre(motCle, mode) {
  mode = mode || LangageTilex.mode;
  return motsDuMode(mode)[String(motCle).toLowerCase()] || null;
}

// ============================================================
// ▶️ INTERPRÉTEUR — exécute une commande écrite dans le langage actif
//    handlers = { auto_connect: fn, chat: fn, commit: fn, ... }
// ============================================================
export async function roule(ligne, handlers = {}) {
  const tokens = String(ligne).trim().split(/\s+/);
  if (!tokens[0]) return "";
  const canon = resoudre(tokens[0]);
  if (!canon) return `❓ Mot-clé inconnu en mode ${LangageTilex.mode} : « ${tokens[0]} »`;
  const def = LEXIQUE[canon];
  if (def.type !== "action") return `ℹ️ « ${tokens[0]} » = ${canon} (${def.type})`;
  const fn = handlers[def.do];
  if (typeof fn !== "function") return `⚠️ Aucune action branchée pour « ${def.do} »`;
  return await fn(tokens.slice(1).join(" "));
}

// ============================================================
// 🗂️ AIDE — liste lisible du dictionnaire (pour afficher à l'écran)
// ============================================================
export function lexiqueLisible(mode) {
  mode = mode || LangageTilex.mode;
  const autre = mode === "qc" ? "en" : "qc";
  return Object.values(LEXIQUE).map(
    (v) => `${(v[mode] || "").padEnd(12)} = ${v[autre]}   (${v.type})`
  );
}
