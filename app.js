/* ============================================================
   ti-lex-AL v10 — app.js
   ============================================================ */

const MODEL_DEFAULT = "claude-opus-4-8";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

var PAYMENT_LINKS = {
  flux:  "https://buy.stripe.com/bJe14ndfUgi5g1scYS53O0d",
  surge: "https://buy.stripe.com/00wcN5cbQ0j7aH80c653O0e",
  apex:  "https://buy.stripe.com/7sY28r5Ns2rfbLc4sm53O0g",
  cyber_shield: "https://buy.stripe.com/dRm28ra3I4zn8z0gb453O0i",
};

var STRIPE_PRICE_IDS = {
  flux:  "price_1TiA8fFu0d9mAEdCaIBd9Z5v",
  surge: "price_1TiBFrFu0d9mAEdCRUY13Wvm",
  apex:  "price_1TiBbSFu0d9mAEdCAlDYgtlv",
};

const state = {
  reflexion: true,
  theme: "dark",
  model: MODEL_DEFAULT,
  lang: "fr",
  apiKey: "",
  history: [],
  connected: { anthropic: true, github: false, supabase: false, vercel: false, gmail: false },
  github: { token: "", repo: "", branch: "" },
  supabase: { url: "", key: "" },
  webSearch: false,
  projectFiles: [],
};

/* ---- Edge Function (remplace les appels directs à api.anthropic.com) ---- */
const AI_PROXY = "https://rnuripmfozlxenryxhdc.supabase.co/functions/v1/ai-proxy";

/* ---- Agents ---- */
const AGENTS = {
  tilex: {
    name: "ti-lex-AL", emoji: "🔥", img: "assets/tilex-logo.png",
    desc: "L'agent signature : intense, sans filtre, droit au but.",
    model: "claude-opus-4-8", max_tokens: 8192,
    prompt: "Tu es ti-lex-AL, l'agent signature de la plateforme québécoise ti-lex-AL v10. Ton style est intense, direct et confiant, sans bla-bla ni détours. Tu donnes des réponses tranchées, complètes et actionnables, en français québécois. Tu restes rigoureux et factuel : ton attitude est affirmée, mais jamais au détriment de l'exactitude.",
  },
  general: {
    name: "AL", emoji: "🤖", desc: "Généraliste, répond à tout avec rigueur.",
    model: "claude-sonnet-4-6", max_tokens: 4096,
    prompt: "Tu es Agent AL, un assistant IA expert, rigoureux et très intelligent de la plateforme québécoise ti-lex-AL v10. Tu raisonnes en profondeur. Tes réponses sont complètes, précises et actionnables. Tu réponds en français québécois, sans bla-bla.",
  },
  dev: {
    name: "AL Dev", emoji: "💻", desc: "Spécialiste code, architecture, debug.",
    model: "claude-opus-4-8", max_tokens: 8192,
    prompt: "Tu es AL Dev, un ingénieur logiciel senior de ti-lex-AL. Tu écris du code production-ready, tu repères les bugs, tu expliques l'architecture. Tu utilises des blocs ``` pour le code et cites les chemins de fichiers exacts. Français québécois, technique et direct.",
  },
  secu: {
    name: "AL Sécurité", emoji: "🛡️", desc: "Cybersécurité défensive, audit, conformité Loi 25.",
    model: "claude-opus-4-8", max_tokens: 8192,
    prompt: `Tu es AL Sécurité, l'agent cybersécurité DÉFENSIVE de la plateforme québécoise ti-lex-AL.

PÉRIMÈTRE — Tu aides exclusivement sur la défense :
- Audit de sécurité, durcissement (hardening), revue de configuration
- Détection d'intrusion, journalisation, réponse à incident, forensique post-incident
- Gestion des vulnérabilités, correctifs, gestion des accès et des secrets
- Conformité : Loi 25 (Québec), RGPD, normes ISO 27001 / NIST / CIS
- Rédaction de SOW, politiques, plans de remédiation, sensibilisation

LIMITES STRICTES — Tu refuses tout ce qui relève d'activités offensives non autorisées :
attaques contre des systèmes que l'utilisateur ne possède pas, exploits prêts à l'emploi,
contournement de protections, malware. Réf. art. 342.1 C.cr. (utilisation non autorisée d'ordinateur).
En cas de demande limite, tu proposes l'alternative défensive équivalente.

STYLE — Français québécois, technique, direct, sans bla-bla. Tu cites les normes pertinentes,
tu donnes des étapes actionnables et tu signales les risques juridiques quand c'est utile.`,
  },
  creatif: {
    name: "AL Créatif", emoji: "🎨", desc: "Rédaction, idées, contenu, branding.",
    model: "claude-sonnet-4-6", max_tokens: 4096,
    prompt: "Tu es AL Créatif, un partenaire de création de ti-lex-AL. Tu génères des idées, du contenu, du texte marketing, des concepts. Ton ton est vivant et inspirant. Français québécois.",
  },
  cerveau: {
    name: "AL Cerveau", emoji: "🧠", desc: "Deuxième Cerveau, notes et mémoire IA.",
    model: "claude-sonnet-4-6", max_tokens: 4096,
    prompt: "Tu es AL Cerveau, l'assistant du Deuxième Cerveau de ti-lex-AL. Tu aides l'utilisateur à organiser ses notes, ses idées, ses projets. Tu peux résumer, relier des concepts, suggérer des tags, trouver des patterns dans les notes. Tu es méthodique, structuré et bienveillant. Français québécois.",
  },
};
state.agent = "general";
state.imageMode = false;
state.model = "claude-sonnet-4-6";

/* pièces jointes en attente d'envoi */
let attachments = [];

/* ---- Persistance locale (modèle + connexions) ---- */
const LS_MODEL = "tilex-al-model";
const LS_GH = "tilex-al-github";
const LS_SB = "tilex-al-supabase";
const LS_MEMORY = "tilex-al-memory";
const LS_LANG = "tilex-al-lang";
const LS_API = "tilex-al-apikey";
function loadSettings() {
  try {
    const m = localStorage.getItem(LS_MODEL);
    const lang = localStorage.getItem(LS_LANG);
    const ak = localStorage.getItem(LS_API);
    if (m) state.model = m;
    if (lang && (lang === "fr" || lang === "en")) state.lang = lang;
    if (ak) state.apiKey = ak;
    const gh = JSON.parse(localStorage.getItem(LS_GH) || "null");
    if (gh && gh.token) { state.github = gh; state.connected.github = true; }
    const sb = JSON.parse(localStorage.getItem(LS_SB) || "null");
    if (sb && sb.url) { state.supabase = sb; state.connected.supabase = true; }
  } catch (e) { /* localStorage indisponible */ }
  const plan = (localStorage.getItem("tilex-plan") || "").toLowerCase();
  if (plan !== "apex") {
    if (state.model.includes("opus")) state.model = "claude-sonnet-4-6";
    if (state.agent === "tilex" || state.agent === "dev" || state.agent === "secu") {
      state.agent = "general";
    }
  }
}

/* ---- Helpers dates ---- */
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "maintenant";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}j`;
  return new Date(ts).toLocaleDateString(state.lang === "en" ? "en-CA" : "fr-CA");
}

/* ---- Mémoire persistante (faits que l'IA retient entre sessions) ---- */
let memory = [];
function loadMemory() {
  try { memory = JSON.parse(localStorage.getItem(LS_MEMORY) || "[]"); } catch (_) { memory = []; }
}
function saveMemory() {
  try { localStorage.setItem(LS_MEMORY, JSON.stringify(memory)); } catch (_) {}
  renderMemory();
}
function addMemory(fact) {
  if (!fact || memory.some(m => m.text === fact)) return;
  memory.push({ text: fact, ts: Date.now() });
  if (memory.length > 50) memory.shift();
  saveMemory();
}
function removeMemory(idx) {
  memory.splice(idx, 1);
  saveMemory();
}
function memoryContext() {
  if (!memory.length) return "";
  return "\n\nMémoire de l'utilisateur (faits retenus des conversations précédentes) :\n" +
    memory.map(m => `- ${m.text}`).join("\n") +
    "\nUtilise ces informations pour personnaliser tes réponses. Si l'utilisateur te dit de retenir quelque chose (\"retiens que…\", \"souviens-toi…\", \"n'oublie pas…\"), réponds OK et je le sauvegarderai.";
}

function recentConversationsContext() {
  const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - FOURTEEN_DAYS;
  const summaries = [];

  // Chat conversations
  const chatList = JSON.parse(localStorage.getItem("tilex-chat-convs") || "[]");
  chatList.forEach(c => {
    if (!c.ts || c.ts < cutoff) return;
    const date = new Date(c.ts).toLocaleDateString(state.lang === "en" ? "en-CA" : "fr-CA");
    const userMsgs = (c.messages || []).filter(m => m.role === "user").map(m => contentText(m.content).slice(0, 80));
    const aiMsgs = (c.messages || []).filter(m => m.role === "assistant").map(m => contentText(m.content).slice(0, 80));
    if (userMsgs.length) {
      summaries.push(`[Chat ${date}] Q: ${userMsgs[0]}${aiMsgs[0] ? " → R: " + aiMsgs[0] : ""}`);
    }
  });

  // Codex conversations
  const codexList = JSON.parse(localStorage.getItem("tilex-codex-history") || "[]");
  codexList.forEach(c => {
    if (!c.ts || c.ts < cutoff) return;
    const date = new Date(c.ts).toLocaleDateString(state.lang === "en" ? "en-CA" : "fr-CA");
    const prompt = (c.prompt || c.full || "").slice(0, 80);
    if (prompt) summaries.push(`[Codex ${date}] ${prompt}`);
  });

  if (!summaries.length) return "";
  const ctx = summaries.slice(0, 30).join("\n");
  return `\n\nRésumé des conversations des 14 derniers jours :\n${ctx}\nTu peux faire référence à ces sujets si l'utilisateur en parle.`;
}
function extractMemoryFromResponse(text) {
  const lower = text.toLowerCase();
  if (lower.includes("[mémoire:") || lower.includes("[memoire:")) {
    const matches = text.match(/\[m[ée]moire:\s*([^\]]+)\]/gi);
    if (matches) matches.forEach(m => {
      const fact = m.replace(/\[m[ée]moire:\s*/i, "").replace(/\]$/, "").trim();
      if (fact) addMemory(fact);
    });
  }
}
function renderMemory() {
  const el = $("#memoryList");
  if (!el) return;
  if (!memory.length) {
    el.innerHTML = `<p class="muted" style="font-size:.78rem;padding:6px 0">${t("noMemory")}</p>`;
    return;
  }
  el.innerHTML = memory.map((m, i) => {
    const date = m.ts ? new Date(m.ts).toLocaleDateString(state.lang === "en" ? "en-CA" : "fr-CA") : "";
    return `<div class="memory-item"><span class="memory-text">${escapeHtml(m.text)}${date ? `<span class="memory-date">${date}</span>` : ""}</span><button class="memory-del" data-idx="${i}" title="${t("delete_")}">×</button></div>`;
  }).join("");
  $$(".memory-del", el).forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); removeMemory(+btn.dataset.idx); };
  });
}

function proxyToken() {
  return state.supabase.key || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA";
}
var _chatAbort = null;
function chatFetch(bodyObj) {
  if (_chatAbort) _chatAbort.abort();
  _chatAbort = new AbortController();
  var timeoutId = setTimeout(function() { _chatAbort.abort(); }, 30000);
  const h = { "Content-Type": "application/json" };
  const tk = proxyToken();
  if (tk) h["Authorization"] = `Bearer ${tk}`;
  if (state.apiKey) h["x-anthropic-key"] = state.apiKey;
  return fetch(AI_PROXY, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ kind: "chat", ...bodyObj }),
    signal: _chatAbort.signal,
  }).then(function(res) { clearTimeout(timeoutId); return res; }, function(err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("Délai dépassé (30s) — réessaie.");
    throw err;
  });
}

/* ---- Logos SVG officiels des services (inline, monochromes adaptés) ---- */
const SERVICE = {
  anthropic: { name: "Anthropic", svg: `<svg viewBox="0 0 24 24"><path fill="#ff6600" d="M14.6 3h-3.1L17 21h3.3L14.6 3zm-5.2 0L3.7 21H7l1.1-3.2h5.4L9.4 3zm-.3 11.3l1.8-5.4 1.8 5.4H9.1z"/></svg>` },
  github:    { name: "GitHub", svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>` },
  supabase:  { name: "Supabase", svg: `<svg viewBox="0 0 24 24"><path fill="#3ecf8e" d="M13.4 22.3c-.6.76-1.83.34-1.84-.63L11.4 8h9.4c1.7 0 2.65 1.96 1.6 3.29L13.4 22.3z"/><path fill="#3ecf8e" opacity=".6" d="M10.6 1.7c.6-.76 1.83-.34 1.84.63l.13 13.67H3.2c-1.7 0-2.65-1.96-1.6-3.29L10.6 1.7z"/></svg>` },
  vercel:    { name: "Vercel", svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L22 20H2L12 2z"/></svg>` },
  gmail:     { name: "Gmail", svg: `<svg viewBox="0 0 24 24"><path fill="#ea4335" d="M12 12.7L2 6.2V18a1 1 0 0 0 1 1h3V9.9l6 4.4 6-4.4V19h3a1 1 0 0 0 1-1V6.2L12 12.7z"/><path fill="#fbbc04" d="M2 6.2v.1L12 12.7 22 6.3v-.1a2 2 0 0 0-3.1-1.7L12 9.2 5.1 4.5A2 2 0 0 0 2 6.2z"/></svg>` },
  google:    { name: "Google", svg: `<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.5 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M47 24.6c0-1.6-.2-3.1-.4-4.6H24v9h12.9c-.6 3-2.3 5.5-4.8 7.2l7.7 6C44.4 38 47 31.9 47 24.6z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-8-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z"/></svg>` },
};

/* mots-clés -> service détecté pour afficher le logo dans le chat */
const TRIGGERS = {
  supabase: ["supabase", "edge function", "rls", "postgres", "migration"],
  github:   ["github", "git ", "repo", "commit", "pull request", "pr "],
  vercel:   ["vercel", "déploi", "deploy", "build", "production"],
  gmail:    ["gmail", "email", "courriel", "mail"],
  anthropic:["claude", "anthropic", "opus", "sonnet", "haiku"],
};

/* ================= NAVIGATION / MENU ================= */
function toggleMenu() {
  if (window.innerWidth <= 860) {
    document.body.classList.toggle("menu-open");
    $("#overlay").classList.toggle("show", document.body.classList.contains("menu-open"));
  } else {
    document.body.classList.toggle("menu-closed");
  }
}
$("#menuToggle").onclick = toggleMenu;
$("#menuToggleMobile").onclick = toggleMenu;
$("#overlay").onclick = () => { document.body.classList.remove("menu-open"); $("#overlay").classList.remove("show"); };

const I18N = {
  fr: {
    titles: { chat: "Agent AL", codex: "Codex", security: "Mode Sécurité", forfaits: "Forfaits", cerveau: "Deuxième Cerveau", finance: "Agent Finance", animations: "Animations", settings: "Paramètres", conversations: "Conversations", convos: "Conversations", projects: "Projets", account: "Mon compte" },
    acctSub: "Abonnement", acctActive: "Actif", acctExpired: "Expiré", acctNoPlan: "Aucun forfait",
    acctDaysLeft: "Jours restants", acctMsgToday: "Messages aujourd'hui", acctMsgLimit: "Limite / jour",
    acctManage: "Gérer mon abonnement", acctPref: "Préférences", acctLang: "Langue", acctTheme: "Thème",
    acctModel: "Modèle", acctUsage: "Utilisation", acctMsgUsed: "Messages utilisés",
    acctImgUsed: "Images générées",
    acctStorage: "Stockage local", acctConns: "Connexions", acctNotConn: "Non connecté",
    acctConn: "Connecté", acctLogout: "Se déconnecter", acctUser: "Utilisateur",
    acctMsgMonth: "Messages / mois", acctAgents: "Agents", acctModels: "Modèles",
    acctCodex: "Codex / jour", acctThinking: "Réflexion",
    acctInfinite: "∞", acctNav: "Compte",
    acctEditProfile: "Modifier le profil", acctNameLabel: "Nom", acctEmailLabel: "Courriel",
    acctSave: "Enregistrer", acctCancel: "Annuler",
    projTitle: "Projets", projSearch: "Rechercher des projets",
    projNew: "Nouveau projet", projNewConv: "Nouvelle conversation",
    projMemo: "Mémoire", projMemoPh: "Décris le contexte du projet...",
    projFiles: "Connaissances du projet", projAddFile: "+ Ajouter un fichier",
    projInstr: "Instructions personnalisées", projInstrPh: "Ajouter des instructions...",
    projRecent: "Conversations récentes", projPrivate: "Privé",
    nav: { chat: "Chat", codex: "Codex", security: "Sécurité", forfaits: "Forfaits", cerveau: "Cerveau", finance: "Finance", settings: "Paramètres", account: "Compte" },
    cervSearch: "Rechercher des notes…", cervNewNote: "Nouvelle note", cervNoNotes: "Aucune note",
    cervNoNotesSub: "Crée ta première note pour commencer.", cervSave: "Enregistrer",
    cervTagsPh: "Ajouter un tag…", cervTitlePh: "Titre de la note…", cervContentPh: "Écris ta note ici…",
    cervAiTags: "Tags IA", cervAiSum: "Résumer", cervSummaryLabel: "Résumé IA",
    cervChatPh: "Pose une question sur tes notes…", cervAllTags: "Tous",
    cervDelConfirm: "Supprimer cette note ?",
    fpLimited: "Pour une durée limitée",
    conversations: "Conversations", projet: "Projet", nouvelle: "+ Nouvelle",
    convAll: "Toutes", convFav: "Favoris", convProj: "Projet",
    convEmpty: "Aucune conversation", convEmptySub: "Commence une nouvelle conversation pour la voir ici.",
    convNewChat: "Nouvelle conversation",
    convFavAdd: "Ajouter aux favoris", convFavRemove: "Retirer des favoris",
    convToProject: "Déplacer dans Projet", convFromProject: "Retirer de Projet",
    convRename: "Renommer", convDelete: "Supprimer",
    convRenamePrompt: "Nouveau nom de la conversation :",
    placeholder: "Écris ton message…", send: "Envoyer",
    noProject: "Aucun projet connecté",
    connectGh: "Connecte GitHub dans le Codex pour voir tes conversations de projet.",
    installer: "Installer l'app",
    online: "En ligne · ti-lex-AL v10",
    reflexion: "Réflexion",
    chooseAgent: "Choisir un agent",
    welcomeTitle: "Bienvenue sur",
    welcomeSub: "L'agent IA québécois. Pose ta question, code avec le Codex, ou connecte tes services.",
    chip1: "Explique-moi le mode réflexion",
    chip2: "Connecte-toi à Supabase",
    chip3: "Génère une fonction Edge",
    addBtn: "Ajouter",
    image: "Image", file: "Fichier", zip: "Fichier ZIP", genImg: "Générer une image", micro: "Micro (dicter)", webSearch: "Chercher sur le web",
    modeReflexOn: 'Mode réflexion <span class="orange">activé</span>',
    modeReflexOff: 'Mode réflexion <span class="muted">désactivé</span>',
    codexTitle: "Codex",
    codexNewConv: "Nouvelle conversation",
    codexProject: "Projet",
    codexGitHub: "GitHub",
    codexTokenPh: "Token GitHub (ghp_…)",
    codexConnect: "Connecter",
    codexRepoDefault: "— Dépôt —",
    codexBranchDefault: "— Branche —",
    codexScanProject: "Scanner le projet complet",
    codexConvs: "Conversations",
    codexNoConv: "Aucune conversation",
    codexBack: "Retour à l'accueil",
    codexOpenMenu: "Ouvrir le menu",
    codexHeading: 'Codex <span class="orange">ti-lex-AL</span>',
    codexSub: "Décris ce que tu veux coder. Le code apparaîtra dans le chat.",
    codexChip1: "Génère une API REST Express avec TypeScript",
    codexChip2: "Crée un composant React avec hooks",
    codexChip3: "Écris une migration SQL Supabase avec RLS",
    codexPh: "Décris ce que tu veux coder…",
    codexGenerate: "Générer",
    codexHint: 'Codex ti-lex-AL · <span class="orange">Génère</span> du code',
    secTitle: 'Mode Sécurité <span class="orange">AL 7.8</span>',
    secSub: "Agent ti-lex-AL · scan & conformité. Une autorisation signée (SOW) est requise avant tout scan.",
    secAuth: "Autorisations", secSowActive: "SOW actifs",
    secScans: "Scans", secPending: "en attente d'autorisation",
    secFindings: "Findings", secNone: "aucun",
    secRbac: "RBAC",
    secNewSow: "+ Nouveau SOW", secRefresh: "Rafraîchir",
    secCreateSow: "Créer une autorisation (SOW)",
    secMandatTitle: "Titre du mandat *", secMandatTitlePh: "Ex: Audit sécurité MonSite.ca",
    secClientName: "Nom du client *", secClientNamePh: "Ex: Entreprise XYZ Inc.",
    secContactName: "Contact (nom)", secContactNamePh: "Jean Tremblay",
    secContactEmail: "Contact (courriel)", secContactEmailPh: "jean@entreprise.ca",
    secTargetsIn: "Cibles autorisées (scope-in) *", secTargetsInPh: "exemple.ca, 192.168.1.0/24 (séparées par virgule)",
    secTargetsOut: "Cibles exclues (scope-out)", secTargetsOutPh: "prod.exemple.ca (séparées par virgule)",
    secDateStart: "Date de début *", secDateEnd: "Date d'expiration *",
    secScanTypes: "Types de scan autorisés *",
    secReconPassive: "Recon passive", secVulnScan: "Scan vulnérabilités", secWebScan: "Scan web",
    secConfigAudit: "Audit config", secDarkWeb: "Dark web monitor", secFullAudit: "Audit complet",
    secNotes: "Notes", secNotesPh: "Instructions spéciales, restrictions, etc.",
    secCreateBtn: "Créer le SOW", secCancel: "Annuler",
    secLegal: 'Rappel légal : au Canada, tout scan doit reposer sur un mandat autorisé, un programme de <code>bug_bounty</code>, ou de la divulgation responsable. Le mode Sécurité bloque les scans hors-scope grâce à des garde-fous cryptographiques.',
    studioTitle: "Studio", studioRefresh: "Rafraîchir",
    studioNoSource: "Aucune source",
    studioHelp: "Connecte GitHub ou uploade un ZIP pour voir les fichiers.",
    studioNoFile: "Aucun fichier sélectionné",
    studioPush: "Push", studioPushPh: "Sélectionne un fichier à gauche…",
    fpTitle: "Forfaits", fpKicker: "ti-lex-AL v10",
    fpChoose: 'Choisis ton <span class="fp-title-orange">forfait</span>',
    fpSub: "Chaque forfait te donne accès à l'agent AL, au Codex et au mode Sécurité. La seule différence, c'est jusqu'où tu veux aller.",
    fpMonthly: "Mensuel", fpAnnual: "Annuel", fpSave: "-20%",
    fpFlux: "FLUX", fpFluxPeriod: "/ mois",
    fpFluxPitch: "Pour débuter avec l'IA. Idéal si tu travailles solo.",
    fpFluxCta: "Commencer avec FLUX →", fpFluxBilled: "Facturé 180$/an",
    fpFluxF1: "40 messages / fenêtre 12h", fpFluxF2: "Reset minuit + midi",
    fpFluxF3: "5 agents IA · Sonnet 4.6", fpFluxF4: "2 projets Codex · GitHub",
    fpFluxF5: "10 sessions Codex", fpFluxF6: "1 GB stockage",
    fpFluxF7: "Marketplace agents",
    fpFluxOff1: "Opus", fpFluxOff2: "Publier ses agents",
    fpSurgeBadge: "Le plus populaire",
    fpSurge: "SURGE", fpSurgePeriod: "/ mois",
    fpSurgePitch: "Pour les créateurs sérieux. Freelancers, équipes, agences.",
    fpSurgeCta: "Commencer avec SURGE →", fpSurgeBilled: "Facturé 372$/an",
    fpSurgeF1: "100 messages / fenêtre 12h", fpSurgeF2: "Reset minuit + midi",
    fpSurgeF3: "15 agents IA · Sonnet 4.6", fpSurgeF4: "5 projets Codex · Vercel",
    fpSurgeF5: "50 sessions Codex", fpSurgeF6: "5 GB stockage",
    fpSurgeF7: "Publier ses agents",
    fpSurgeOff1: "Opus", fpSurgeOff2: "Support prioritaire",
    fpApexBadge: "Sur mesure",
    fpApex: "APEX", fpApexPeriod: "/ mois",
    fpApexPitch: "Puissance totale. Agents illimités + Opus 4.8.",
    fpApexCta: "Commencer avec APEX →", fpApexBilled: "Facturé 756$/an",
    fpApexF1: "250 messages / fenêtre 12h", fpApexF2: "Reset minuit + midi",
    fpApexF3: "Agents IA illimités", fpApexF4: "100 messages Opus 4.8",
    fpApexF5: "20 projets Codex illimités", fpApexF6: "10 GB stockage",
    fpApexF7: "Support prioritaire",
    fpBadge1: "Paiement sécurisé Stripe", fpBadge2: "Annule quand tu veux", fpBadge3: "Support humain 7j/7", fpBadge4: "Prix en CAD",
    fpFaq: "Questions fréquentes",
    fpQ1: "Est-ce que je peux changer de forfait en cours de route?",
    fpA1: "Oui! Tu peux upgrader ou downgrader à tout moment. Le prorata est automatiquement calculé par Stripe.",
    fpQ2: "Qu'est-ce qui arrive si j'annule?",
    fpA2: "Tu gardes l'accès jusqu'à la fin de ta période payée. Aucune pénalité, aucun frais caché.",
    fpQ3: "C'est quoi la différence entre SURGE et APEX?",
    fpA3: "Le forfait APEX offre des agents illimités, une API dédiée avec rate limit x10, SSO, audit trail 5 ans et un SLA 99.9% avec support dédié.",
    fpQ4: "Les prix sont en dollars canadiens?",
    fpA4: "Oui, tous les prix sont en CAD. Les taxes applicables sont ajoutées au moment du paiement.",
    fpFooter: "Taxes en sus. Annule quand tu veux, sans frais cachés.",
    fpManage: "Gérer mon abonnement",
    setApiKey: "Clé API Anthropic", setApiKeySub: "Entre ta propre clé pour appeler Claude directement sans passer par le proxy ti-lex.",
    setApiKeyPh: "sk-ant-api03-…", setApiKeySave: "Enregistrer", setApiKeyClear: "Effacer",
    setApiKeyOptional: "— optionnel", setApiKeyActive: "✓ active",
    finNoReply: "Je n'ai pas reçu de réponse. Peux-tu reformuler ta question ?",
    finConnError: "Oups — la connexion a échoué. Réessaie dans un moment.",
    finTitle: "Agent Finance",
    finStatus: "Finances personnelles & crypto",
    finOrigin: "Produit du Québec",
    finBadge: "propulsé par Claude",
    finWelcomeTitle: "Voir clair dans<br>tes finances.",
    finWelcomeSub: "Budget, épargne, dettes, CELI, REER — et crypto. Pose une question ou choisis un point de départ : je t'aide à y réfléchir, étape par étape.",
    finChip1: "Bâtir un budget 50/30/20", finChip2: "CELI ou REER : par où commencer ?",
    finChip3: "Comprendre Bitcoin et Ethereum", finChip4: "Sécuriser mon portefeuille crypto",
    finChip5: "Impôt sur mes gains crypto au Québec", finChip6: "Quelle place donner à la crypto ?",
    finPh: "Pose ta question sur tes finances…",
    finDisclaimer: "Information éducative générale — ne remplace pas un conseil financier personnalisé.",
    setTitle: "Paramètres",
    setModel: "Modèle Claude", setModelSub: "Modèle utilisé par Agent AL.",
    setOpus: "Opus 4.8 — puissant", setSonnet: "Sonnet 4.6 — équilibré", setHaiku: "Haiku 4.5 — rapide",
    setReflex: "Mode réflexion", setReflexSub: "Affiche le raisonnement de l'agent en gris avant la réponse.",
    setEnabled: "Activé", setDisabled: "Désactivé",
    setTheme: "Mode jour", setThemeSub: "Bascule clair / sombre, comme la plateforme officielle.",
    setLight: "Clair", setDark: "Sombre",
    setLang: "Langue / Language", setLangSub: "Choisis la langue de l'interface et des réponses de l'agent.",
    setMemory: "Mémoire", setMemorySub: "Agent AL retient des faits importants entre les sessions. Dis-lui « retiens que… » pour sauvegarder.",
    setMemoryPh: "Ajouter un souvenir manuellement…", setMemoryAdd: "Ajouter",
    setMemoryClear: "Effacer toute la mémoire",
    setGitHub: "GitHub", setGitHubNotConn: "— non connecté",
    setGitHubSub: "Connecte ton compte pour accéder à tous tes dépôts et choisir la bonne branche.",
    setGitHubTokenPh: "Personal Access Token (ghp_...)",
    setGitHubConnect: "Connecter", setGitHubCreateToken: "Créer un token →",
    setRepo: "Dépôt", setRepoDefault: "— Choisir un dépôt —",
    setBranch: "Branche", setBranchDefault: "— Choisir une branche —",
    setSupabase: "Supabase", setSupabaseNotConn: "— non connecté",
    setSupabaseSub: "Branche ton projet Supabase (URL + clé publishable).",
    setSupabaseUrlPh: "https://xxxx.supabase.co",
    setSupabaseKeyPh: "sb_publishable_... ou anon key",
    setSupabaseConnect: "Connecter",
    setData: "Mes données", setDataSub: "Conformément à la Loi 25 du Québec, vous pouvez consulter, exporter et supprimer vos renseignements personnels.",
    setExport: "Exporter mes données", setDelete: "Supprimer toutes mes données", setWithdraw: "Retirer mon consentement",
    setDataHost: "Données hébergées à Beauharnois, Québec (ca-central-1).",
    setPrivacy: "Politique de confidentialité", setTerms: "Conditions d'utilisation",
    setOther: "Autres connexions",
    consentTitle: "Protection de vos renseignements personnels",
    consentText: "ti-lex-AL utilise le stockage local de votre navigateur pour sauvegarder vos préférences et conversations. Conformément à la Loi 25 du Québec sur la protection des renseignements personnels, nous vous informons que :",
    consentAccept: "J'accepte", consentRefuse: "Je refuse", consentMore: "En savoir plus",
    updateBanner: "Mise à jour disponible",
    updateRefresh: "Rafraîchir",
    alertVoice: "La dictée vocale n'est pas supportée par ce navigateur.",
    alertGhFirst: "Connecte ton compte GitHub dans Paramètres d'abord.",
    alertGhFilename: "Nom du fichier à créer/mettre à jour sur GitHub :",
    alertPushed: "Pushé sur",
    alertPushErr: "Erreur push GitHub :",
    alertCommitMsg: "Message de commit :",
    alertCommitDefault: "Mise à jour de",
    alertFillFields: "Remplis tous les champs obligatoires (*).",
    alertSelectScan: "Sélectionne au moins un type de scan.",
    alertLoginFirst: "Connecte-toi d'abord.",
    alertActivateSow: "Activer ce SOW ? Les scans deviendront possibles pour les cibles listées.",
    alertRevokeSow: "Révoquer/supprimer ce SOW ? Les scans associés seront bloqués.",
    alertDeleteAll: "Supprimer TOUTES vos données locales ?\n\nConversations, mémoire, préférences, connexions — tout sera effacé.\n\nCette action est irréversible.",
    alertDeleteConfirm: "Dernière confirmation : voulez-vous vraiment tout supprimer ?",
    alertDeleted: "Toutes vos données locales ont été supprimées.",
    alertWithdraw: "Retirer votre consentement ?\n\nVos données locales seront supprimées et vous serez redirigé vers la page d'accueil.",
    alertSubscribe: "Connecte-toi d'abord pour t'abonner.",
    alertManage: "Connecte-toi d'abord pour gérer ton abonnement.",
    alertClearMemory: "Effacer toute la mémoire d'Agent AL ?",
    noMemory: "Aucun souvenir enregistré.",
    connected: "connecté", notConnected: "—",
    loading: "chargement…", error: "erreur", none: "aucune",
    pushGitHub: "Push sur GitHub", pushDeploy: "Push + Deploy Vercel",
    pushing: "Push en cours…", pushed: "Pushé !", retry: "Réessayer",
    deploying: "Deploy Vercel…", deployed: "Déployé !",
    listen: "Écouter", listenTitle: "Écouter la réponse", pause: "Pause", copy: "Copier", copied: "Copié !", copyTitle: "Copier le texte", delete_: "Supprimer", untitled: "Sans titre",
    secActivate: "Activer", secRevoke: "Révoquer", secNotDefined: "non défini",
    files: "fichiers", andMore: "et %n autres",
    agentTilex: "L'agent signature : intense, sans filtre, droit au but.",
    agentGeneral: "Généraliste, répond à tout avec rigueur.",
    agentDev: "Spécialiste code, architecture, debug.",
    agentSecu: "Cybersécurité défensive, audit, conformité Loi 25.",
    agentCreatif: "Rédaction, idées, contenu, branding.",
    agentForfait: "Abonnements, plans, facturation Stripe.",
    agentFinance: "Finances personnelles, crypto, budget québécois.",
    agentCerveau: "Deuxième Cerveau, notes et mémoire IA.",
    diagram: "Diagramme",
    imageMode: "Mode image",
    imgPromptEnhance: "Amélioration du prompt par Claude…",
    imgGenerating: "Génération de l'image en cours…",
    imgError: "Erreur image :",
    apiError: "Erreur :",
    proxyNotConfigured: "Le proxy AI n'est pas configuré.",
    codexError: "Erreur Codex :",
    codexConnectFirst: "Connecte d'abord un dépôt GitHub (Paramètres) ou uploade un ZIP pour scanner un projet.",
    codexReading: "Lecture des fichiers du projet…",
    scanError: "Erreur scan :",
    filesDetected: "fichier(s) détecté(s)",
    openStudio: "Ouvrir dans le Studio",
    defaultBranch: "(défaut)",
    connectedMark: "✓ connecté",
    chooseRepo: "— Choisir un dépôt",
    filesOn: "fichier(s) sur",
    noFile: "aucun fichier",
    noSow: 'Aucun SOW. Clique "+ Nouveau SOW" pour créer ta première autorisation.',
    ready: "prêt",
    total: "total",
    ghEnterToken: "— entre un token",
    ghConnecting: "connexion…",
    ghTokenInvalid: "token invalide ?",
    ghChooseRepo: "— Choisir un dépôt",
    ghLoadingBranches: "chargement…",
    ghFilesLoading: "chargement des fichiers…",
    ghNoFiles: "aucun fichier",
    ghFilesCount: "fichier(s) sur",
    ghFilesError: "erreur fichiers:",
    ghErrorRetry: "Erreur — réessayer",
    sbRequired: "— URL + clé requises",
    sbConnecting: "connexion…",
    writeTo: "Écris à",
    imgDescPh: "Décris l'image à générer…",
    imgPromptLabel: "Prompt amélioré :",
    download: "Télécharger",
    imgGenFail: "Échec de génération",
    streamError: "Erreur de diffusion",
    chatNone: "Aucune",
    noConvCodex: "Aucune conversation. Utilise le Codex pour commencer!",
    pushFilesGh: "fichiers sur GitHub",
    commitMsgDefault: "Ajout de",
    commitMsgVia: "fichiers via Codex ti-lex-AL",
    commitMsgDeploy: "fichiers via ti-lex-AL",
    commitMsgStudio: "Mise à jour de",
    commitMsgStudioVia: "via ti-lex Studio",
    pushGhProgress: "Push GitHub…",
    serviceConnected: "● connecté",
    previewStudio: "Prévisualiser",
    previewCode: "Voir le code",
    previewDownload: "Télécharger",
    studioZipLabel: "Fichiers ZIP uploadés",
    studioRoot: "racine",
    studioBinaryFile: "(fichier binaire — contenu non lisible)",
    studioPushed: "Pushé :",
    studioPushErr: "Erreur push :",
    manageLoading: "Chargement…",
    managePortalErr: "Erreur lors de l'ouverture du portail.",
    manageNetworkErr: "Erreur réseau. Réessaie plus tard.",
    installSafari: "Pour installer ti-lex-AL :\n\n1. Appuie sur le bouton Partager (en bas)\n2. Choisis « Sur l'écran d'accueil »\n3. Confirme avec « Ajouter »",
    installSamsung: "Pour installer ti-lex-AL sur Samsung :\n\n1. Appuie sur le menu ☰ (en bas à droite)\n2. Choisis « Ajouter la page à »\n3. Sélectionne « Écran d'accueil »\n4. Confirme avec « Ajouter »",
    installOther: "Pour installer ti-lex-AL :\n\n1. Ouvre le menu ⋮ de ton navigateur\n2. Choisis « Installer l'application »\n3. Confirme",
  },
  en: {
    titles: { chat: "Agent AL", codex: "Codex", security: "Security Mode", forfaits: "Plans", cerveau: "Second Brain", finance: "Agent Finance", animations: "Animations", settings: "Settings", conversations: "Conversations", convos: "Conversations", projects: "Projects", account: "My Account" },
    acctSub: "Subscription", acctActive: "Active", acctExpired: "Expired", acctNoPlan: "No plan",
    acctDaysLeft: "Days remaining", acctMsgToday: "Messages today", acctMsgLimit: "Limit / day",
    acctManage: "Manage subscription", acctPref: "Preferences", acctLang: "Language", acctTheme: "Theme",
    acctModel: "Model", acctUsage: "Usage", acctMsgUsed: "Messages used",
    acctImgUsed: "Images generated",
    acctStorage: "Local storage", acctConns: "Connections", acctNotConn: "Not connected",
    acctMsgMonth: "Messages / month", acctAgents: "Agents", acctModels: "Models",
    acctCodex: "Codex / day", acctThinking: "Thinking",
    acctConn: "Connected", acctLogout: "Sign out", acctUser: "User",
    acctInfinite: "∞", acctNav: "Account",
    acctEditProfile: "Edit profile", acctNameLabel: "Name", acctEmailLabel: "Email",
    acctSave: "Save", acctCancel: "Cancel",
    projTitle: "Projects", projSearch: "Search projects",
    projNew: "New project", projNewConv: "New conversation",
    projMemo: "Memory", projMemoPh: "Describe the project context...",
    projFiles: "Project knowledge", projAddFile: "+ Add a file",
    projInstr: "Custom instructions", projInstrPh: "Add instructions...",
    projRecent: "Recent conversations", projPrivate: "Private",
    nav: { chat: "Chat", codex: "Codex", security: "Security", forfaits: "Plans", cerveau: "Brain", finance: "Finance", settings: "Settings", account: "Account" },
    cervSearch: "Search notes…", cervNewNote: "New note", cervNoNotes: "No notes",
    cervNoNotesSub: "Create your first note to get started.", cervSave: "Save",
    cervTagsPh: "Add a tag…", cervTitlePh: "Note title…", cervContentPh: "Write your note here…",
    cervAiTags: "AI Tags", cervAiSum: "Summarize", cervSummaryLabel: "AI Summary",
    cervChatPh: "Ask a question about your notes…", cervAllTags: "All",
    cervDelConfirm: "Delete this note?",
    fpLimited: "For a limited time",
    conversations: "Conversations", projet: "Project", nouvelle: "+ New",
    convAll: "All", convFav: "Favorites", convProj: "Project",
    convEmpty: "No conversations", convEmptySub: "Start a new conversation to see it here.",
    convNewChat: "New conversation",
    convFavAdd: "Add to favorites", convFavRemove: "Remove from favorites",
    convToProject: "Move to Project", convFromProject: "Remove from Project",
    convRename: "Rename", convDelete: "Delete",
    convRenamePrompt: "New conversation name:",
    placeholder: "Type your message…", send: "Send",
    noProject: "No project connected",
    connectGh: "Connect GitHub in the Codex to see your project conversations.",
    installer: "Install app",
    online: "Online · ti-lex-AL v10",
    reflexion: "Reflexion",
    chooseAgent: "Choose an agent",
    welcomeTitle: "Welcome to",
    welcomeSub: "The Quebec AI agent. Ask a question, code with the Codex, or connect your services.",
    chip1: "Explain reflexion mode", chip2: "Connect to Supabase", chip3: "Generate an Edge Function",
    addBtn: "Add",
    image: "Image", file: "File", zip: "ZIP File", genImg: "Generate an image", micro: "Microphone (dictate)", webSearch: "Search the web",
    modeReflexOn: 'Reflexion mode <span class="orange">enabled</span>',
    modeReflexOff: 'Reflexion mode <span class="muted">disabled</span>',
    codexTitle: "Codex",
    codexNewConv: "New conversation",
    codexProject: "Project",
    codexGitHub: "GitHub",
    codexTokenPh: "GitHub Token (ghp_…)",
    codexConnect: "Connect",
    codexRepoDefault: "— Repository —",
    codexBranchDefault: "— Branch —",
    codexScanProject: "Scan the full project",
    codexConvs: "Conversations",
    codexNoConv: "No conversations",
    codexBack: "Back to home",
    codexOpenMenu: "Open menu",
    codexHeading: 'Codex <span class="orange">ti-lex-AL</span>',
    codexSub: "Describe what you want to code. The code will appear in the chat.",
    codexChip1: "Generate a REST API with Express + TypeScript",
    codexChip2: "Create a React component with hooks",
    codexChip3: "Write a Supabase SQL migration with RLS",
    codexPh: "Describe what you want to code…",
    codexGenerate: "Generate",
    codexHint: 'Codex ti-lex-AL · <span class="orange">Generates</span> code',
    secTitle: 'Security Mode <span class="orange">AL 7.8</span>',
    secSub: "ti-lex-AL agent · scan & compliance. A signed authorization (SOW) is required before any scan.",
    secAuth: "Authorizations", secSowActive: "Active SOWs",
    secScans: "Scans", secPending: "pending authorization",
    secFindings: "Findings", secNone: "none",
    secRbac: "RBAC",
    secNewSow: "+ New SOW", secRefresh: "Refresh",
    secCreateSow: "Create an authorization (SOW)",
    secMandatTitle: "Mandate title *", secMandatTitlePh: "Ex: Security Audit MySite.ca",
    secClientName: "Client name *", secClientNamePh: "Ex: Company XYZ Inc.",
    secContactName: "Contact (name)", secContactNamePh: "John Smith",
    secContactEmail: "Contact (email)", secContactEmailPh: "john@company.ca",
    secTargetsIn: "Authorized targets (scope-in) *", secTargetsInPh: "example.ca, 192.168.1.0/24 (comma separated)",
    secTargetsOut: "Excluded targets (scope-out)", secTargetsOutPh: "prod.example.ca (comma separated)",
    secDateStart: "Start date *", secDateEnd: "Expiration date *",
    secScanTypes: "Authorized scan types *",
    secReconPassive: "Passive recon", secVulnScan: "Vulnerability scan", secWebScan: "Web scan",
    secConfigAudit: "Config audit", secDarkWeb: "Dark web monitor", secFullAudit: "Full audit",
    secNotes: "Notes", secNotesPh: "Special instructions, restrictions, etc.",
    secCreateBtn: "Create SOW", secCancel: "Cancel",
    secLegal: 'Legal notice: in Canada, every scan must rely on a signed mandate, a <code>bug_bounty</code> program, or responsible disclosure. Security Mode blocks out-of-scope scans with cryptographic guardrails.',
    studioTitle: "Studio", studioRefresh: "Refresh",
    studioNoSource: "No source",
    studioHelp: "Connect GitHub or upload a ZIP to view files.",
    studioNoFile: "No file selected",
    studioPush: "Push", studioPushPh: "Select a file on the left…",
    fpTitle: "Plans", fpKicker: "ti-lex-AL v10",
    fpChoose: 'Choose your <span class="fp-title-orange">plan</span>',
    fpSub: "Every plan gives you access to Agent AL, the Codex and Security Mode. The only difference is how far you want to go.",
    fpMonthly: "Monthly", fpAnnual: "Annual", fpSave: "-20%",
    fpFlux: "FLUX", fpFluxPeriod: "/ mo",
    fpFluxPitch: "Get started with AI. Ideal for solo work.",
    fpFluxCta: "Start with FLUX →", fpFluxBilled: "Billed $180/yr",
    fpFluxF1: "40 messages / 12h window", fpFluxF2: "Reset midnight + noon",
    fpFluxF3: "5 AI agents · Sonnet 4.6", fpFluxF4: "2 Codex projects · GitHub",
    fpFluxF5: "10 Codex sessions", fpFluxF6: "1 GB storage",
    fpFluxF7: "Agent marketplace",
    fpFluxOff1: "Opus", fpFluxOff2: "Publish agents",
    fpSurgeBadge: "Most popular",
    fpSurge: "SURGE", fpSurgePeriod: "/ mo",
    fpSurgePitch: "For serious creators. Freelancers, teams, agencies.",
    fpSurgeCta: "Start with SURGE →", fpSurgeBilled: "Billed $372/yr",
    fpSurgeF1: "100 messages / 12h window", fpSurgeF2: "Reset midnight + noon",
    fpSurgeF3: "15 AI agents · Sonnet 4.6", fpSurgeF4: "5 Codex projects · Vercel",
    fpSurgeF5: "50 Codex sessions", fpSurgeF6: "5 GB storage",
    fpSurgeF7: "Publish your agents",
    fpSurgeOff1: "Opus", fpSurgeOff2: "Priority support",
    fpApexBadge: "Custom",
    fpApex: "APEX", fpApexPeriod: "/ mo",
    fpApexPitch: "Total power. Unlimited agents + Opus 4.8.",
    fpApexCta: "Start with APEX →", fpApexBilled: "Billed $756/yr",
    fpApexF1: "250 messages / 12h window", fpApexF2: "Reset midnight + noon",
    fpApexF3: "Unlimited AI agents", fpApexF4: "100 Opus 4.8 messages",
    fpApexF5: "20 unlimited Codex projects", fpApexF6: "10 GB storage",
    fpApexF7: "Priority support",
    fpBadge1: "Secure Stripe payment", fpBadge2: "Cancel anytime", fpBadge3: "Human support 7/7", fpBadge4: "Prices in CAD",
    fpFaq: "Frequently asked questions",
    fpQ1: "Can I change my plan anytime?",
    fpA1: "Yes! You can upgrade or downgrade at any time. Proration is automatically calculated by Stripe.",
    fpQ2: "What happens if I cancel?",
    fpA2: "You keep access until the end of your paid period. No penalty, no hidden fees.",
    fpQ3: "What's the difference between SURGE and APEX?",
    fpA3: "The APEX plan offers unlimited agents, a dedicated API with 10x rate limit, SSO, 5-year audit trail and a 99.9% SLA with dedicated support.",
    fpQ4: "Are prices in Canadian dollars?",
    fpA4: "Yes, all prices are in CAD. Applicable taxes are added at checkout.",
    fpFooter: "Taxes extra. Cancel anytime, no hidden fees.",
    fpManage: "Manage my subscription",
    setApiKey: "Anthropic API Key", setApiKeySub: "Enter your own key to call Claude directly without the ti-lex proxy.",
    setApiKeyPh: "sk-ant-api03-…", setApiKeySave: "Save", setApiKeyClear: "Clear",
    setApiKeyOptional: "— optional", setApiKeyActive: "✓ active",
    finNoReply: "I didn't receive a response. Can you rephrase your question?",
    finConnError: "Oops — connection failed. Try again in a moment.",
    finTitle: "Agent Finance",
    finStatus: "Personal finance & crypto",
    finOrigin: "Made in Quebec",
    finBadge: "powered by Claude",
    finWelcomeTitle: "See clearly<br>in your finances.",
    finWelcomeSub: "Budget, savings, debts, TFSA, RRSP — and crypto. Ask a question or pick a starting point: I'll help you think it through, step by step.",
    finChip1: "Build a 50/30/20 budget", finChip2: "TFSA or RRSP: where to start?",
    finChip3: "Understand Bitcoin and Ethereum", finChip4: "Secure my crypto wallet",
    finChip5: "Tax on my crypto gains in Quebec", finChip6: "How much crypto in my portfolio?",
    finPh: "Ask your finance question…",
    finDisclaimer: "General educational information — does not replace personalized financial advice.",
    setTitle: "Settings",
    setModel: "Claude Model", setModelSub: "Model used by Agent AL.",
    setOpus: "Opus 4.8 — powerful", setSonnet: "Sonnet 4.6 — balanced", setHaiku: "Haiku 4.5 — fast",
    setReflex: "Reflexion mode", setReflexSub: "Shows the agent's reasoning in gray before the answer.",
    setEnabled: "Enabled", setDisabled: "Disabled",
    setTheme: "Day mode", setThemeSub: "Toggle light / dark, like the official platform.",
    setLight: "Light", setDark: "Dark",
    setLang: "Language / Langue", setLangSub: "Choose the language for the interface and agent responses.",
    setMemory: "Memory", setMemorySub: "Agent AL remembers important facts between sessions. Tell it 'remember that…' to save.",
    setMemoryPh: "Add a memory manually…", setMemoryAdd: "Add",
    setMemoryClear: "Clear all memory",
    setGitHub: "GitHub", setGitHubNotConn: "— not connected",
    setGitHubSub: "Connect your account to access all your repos and choose the right branch.",
    setGitHubTokenPh: "Personal Access Token (ghp_...)",
    setGitHubConnect: "Connect", setGitHubCreateToken: "Create a token →",
    setRepo: "Repository", setRepoDefault: "— Choose a repository —",
    setBranch: "Branch", setBranchDefault: "— Choose a branch —",
    setSupabase: "Supabase", setSupabaseNotConn: "— not connected",
    setSupabaseSub: "Connect your Supabase project (URL + publishable key).",
    setSupabaseUrlPh: "https://xxxx.supabase.co",
    setSupabaseKeyPh: "sb_publishable_... or anon key",
    setSupabaseConnect: "Connect",
    setData: "My data", setDataSub: "In accordance with Quebec's Law 25, you can view, export and delete your personal information.",
    setExport: "Export my data", setDelete: "Delete all my data", setWithdraw: "Withdraw my consent",
    setDataHost: "Data hosted in Beauharnois, Quebec (ca-central-1).",
    setPrivacy: "Privacy policy", setTerms: "Terms of use",
    setOther: "Other connections",
    consentTitle: "Protection of your personal information",
    consentText: "ti-lex-AL uses your browser's local storage to save your preferences and conversations. In accordance with Quebec's Law 25 on the protection of personal information, we inform you that:",
    consentAccept: "I accept", consentRefuse: "I refuse", consentMore: "Learn more",
    updateBanner: "Update available",
    updateRefresh: "Refresh",
    alertVoice: "Voice dictation is not supported by this browser.",
    alertGhFirst: "Connect your GitHub account in Settings first.",
    alertGhFilename: "File name to create/update on GitHub:",
    alertPushed: "Pushed to",
    alertPushErr: "GitHub push error:",
    alertCommitMsg: "Commit message:",
    alertCommitDefault: "Update of",
    alertFillFields: "Fill all required fields (*).",
    alertSelectScan: "Select at least one scan type.",
    alertLoginFirst: "Log in first.",
    alertActivateSow: "Activate this SOW? Scans will become possible for the listed targets.",
    alertRevokeSow: "Revoke/delete this SOW? Associated scans will be blocked.",
    alertDeleteAll: "Delete ALL your local data?\n\nConversations, memory, preferences, connections — everything will be erased.\n\nThis action is irreversible.",
    alertDeleteConfirm: "Final confirmation: do you really want to delete everything?",
    alertDeleted: "All your local data has been deleted.",
    alertWithdraw: "Withdraw your consent?\n\nYour local data will be deleted and you will be redirected to the home page.",
    alertSubscribe: "Log in first to subscribe.",
    alertManage: "Log in first to manage your subscription.",
    alertClearMemory: "Clear all of Agent AL's memory?",
    noMemory: "No memories saved.",
    connected: "connected", notConnected: "—",
    loading: "loading…", error: "error", none: "none",
    pushGitHub: "Push to GitHub", pushDeploy: "Push + Deploy Vercel",
    pushing: "Pushing…", pushed: "Pushed!", retry: "Retry",
    deploying: "Deploy Vercel…", deployed: "Deployed!",
    listen: "Listen", listenTitle: "Listen to response", pause: "Pause", copy: "Copy", copied: "Copied!", copyTitle: "Copy text", delete_: "Delete", untitled: "Untitled",
    secActivate: "Activate", secRevoke: "Revoke", secNotDefined: "not defined",
    files: "files", andMore: "and %n more",
    agentTilex: "The signature agent: intense, unfiltered, straight to the point.",
    agentGeneral: "Generalist, answers everything with rigor.",
    agentDev: "Code specialist, architecture, debug.",
    agentSecu: "Defensive cybersecurity, audit, Law 25 compliance.",
    agentCreatif: "Writing, ideas, content, branding.",
    agentForfait: "Subscriptions, plans, Stripe billing.",
    agentFinance: "Personal finance, crypto, Quebec budgeting.",
    agentCerveau: "Second Brain, notes and AI memory.",
    diagram: "Diagram",
    imageMode: "Image mode",
    imgPromptEnhance: "Enhancing prompt with Claude…",
    imgGenerating: "Generating image…",
    imgError: "Image error:",
    apiError: "Error:",
    proxyNotConfigured: "The AI proxy is not configured.",
    codexError: "Codex error:",
    codexConnectFirst: "Connect a GitHub repo (Settings) or upload a ZIP to scan a project first.",
    codexReading: "Reading project files…",
    scanError: "Scan error:",
    filesDetected: "file(s) detected",
    openStudio: "Open in Studio",
    defaultBranch: "(default)",
    connectedMark: "✓ connected",
    chooseRepo: "— Choose a repository",
    filesOn: "file(s) on",
    noFile: "no files",
    noSow: 'No SOW. Click "+ New SOW" to create your first authorization.',
    ready: "ready",
    total: "total",
    ghEnterToken: "— enter a token",
    ghConnecting: "connecting…",
    ghTokenInvalid: "invalid token?",
    ghChooseRepo: "— Choose a repository",
    ghLoadingBranches: "loading…",
    ghFilesLoading: "loading files…",
    ghNoFiles: "no files",
    ghFilesCount: "file(s) on",
    ghFilesError: "file error:",
    ghErrorRetry: "Error — retry",
    sbRequired: "— URL + key required",
    sbConnecting: "connecting…",
    writeTo: "Write to",
    imgDescPh: "Describe the image to generate…",
    imgPromptLabel: "Enhanced prompt:",
    download: "Download",
    imgGenFail: "Generation failed",
    streamError: "Streaming error",
    chatNone: "None",
    noConvCodex: "No conversations. Use the Codex to get started!",
    pushFilesGh: "files to GitHub",
    commitMsgDefault: "Adding",
    commitMsgVia: "files via Codex ti-lex-AL",
    commitMsgDeploy: "files via ti-lex-AL",
    commitMsgStudio: "Update of",
    commitMsgStudioVia: "via ti-lex Studio",
    pushGhProgress: "Push GitHub…",
    serviceConnected: "● connected",
    previewStudio: "Preview",
    previewCode: "View code",
    previewDownload: "Download",
    studioZipLabel: "Uploaded ZIP files",
    studioRoot: "root",
    studioBinaryFile: "(binary file — content not readable)",
    studioPushed: "Pushed:",
    studioPushErr: "Push error:",
    manageLoading: "Loading…",
    managePortalErr: "Error opening the portal.",
    manageNetworkErr: "Network error. Try again later.",
    installSafari: "To install ti-lex-AL:\n\n1. Tap the Share button (at the bottom)\n2. Choose 'Add to Home Screen'\n3. Confirm with 'Add'",
    installSamsung: "To install ti-lex-AL on Samsung:\n\n1. Tap the ☰ menu (bottom right)\n2. Choose 'Add page to'\n3. Select 'Home screen'\n4. Confirm with 'Add'",
    installOther: "To install ti-lex-AL:\n\n1. Open your browser's ⋮ menu\n2. Choose 'Install application'\n3. Confirm",
  }
};

function t(key) { return I18N[state.lang]?.[key] ?? I18N.fr[key] ?? key; }

function applyLang() {
  const s = I18N[state.lang] || I18N.fr;
  document.documentElement.lang = state.lang;

  // === NAV ===
  $$(".nav-item[data-view]").forEach(b => {
    const v = b.dataset.view;
    if (v === "forfaits") {
      const lbl = $(".lbl", b);
      if (lbl) {
        const word = state.lang === "en" ? "plan" : "forfait";
        const splitAt = state.lang === "en" ? 2 : 4;
        lbl.innerHTML = `<span class="forf-white">${word.slice(0, splitAt)}</span><span class="forf-badge">${word.slice(splitAt)}</span><span class="forf-sep">-</span><span class="nav-dollar">$</span>`;
      }
      const ltd = $(".forf-limited", b);
      if (ltd) ltd.innerHTML = `&#x1F525; ${s.fpLimited || "Pour une durée limitée"}`;
    } else if (v === "finance") {
      const lbl = $(".lbl", b);
      if (lbl && s.nav[v]) {
        const word = s.nav[v];
        lbl.innerHTML = word.split("").map((ch, i) =>
          `<span class="fin-letter" style="--i:${i}">${ch}</span>`
        ).join("");
        lbl.classList.add("fin-glow");
      }
    } else if (v === "codex") {
      const lbl = $(".lbl", b);
      if (lbl && s.nav[v]) {
        const word = s.nav[v];
        lbl.innerHTML = word.split("").map((ch, i) =>
          `<span class="cdx-letter cdx-idle" data-idx="${i}">${ch}</span>`
        ).join("");
        lbl.classList.add("codex-matrix-lbl");
      }
    } else {
      const lbl = $(".lbl", b);
      if (lbl && s.nav[v]) lbl.textContent = s.nav[v];
    }
  });
  { const e = $("#settingsBtn .lbl"); if (e) e.textContent = s.nav.settings; }
  { const e = $("#accountBtn .lbl"); if (e) e.textContent = s.acctNav || "Compte"; }

  // === SIDEBAR ===
  { const e = $(".connectors > .conn-title"); if (e) e.textContent = s.conversations; }
  { const e = $(".proj-section-header .conn-title"); if (e) e.textContent = s.projet; }
  { const e = $("#newChatConv"); if (e) e.textContent = s.nouvelle; }
  { const e = $("#projConvLabel"); if (e && /Aucun|No /.test(e.textContent)) e.textContent = s.noProject; }
  { const e = $("#installBtn span"); if (e) e.textContent = s.installer; }

  // === SUB-NAV ===
  const subLabels = { convos: s.conversations, favs: s.convFav, projs: s.convProj || s.projet };
  $$(".chat-sub-item").forEach(btn => {
    const sub = btn.dataset.sub;
    const lbl = $(".sub-lbl", btn);
    if (lbl && subLabels[sub]) {
      lbl.dataset.word = subLabels[sub];
      lbl.innerHTML = subLabels[sub].split("").map((ch, i) =>
        `<span class="sub-letter" style="--si:${i}">${ch}</span>`
      ).join("");
    }
  });

  // === TOPBAR ===
  { const e = $(".topbar .status"); if (e) e.innerHTML = '<span class="status-dot"></span>' + s.online; }
  { const e = $("#reflexionToggle .pill-txt"); if (e) e.textContent = s.reflexion; }

  // === CHAT VIEW ===
  const cw = $("#view-chat .welcome");
  if (cw) {
    const h = cw.querySelector("h2"); if (h) h.innerHTML = s.welcomeTitle + ' <span class="orange">ti-lex-AL v10</span>';
    const p = cw.querySelector("p"); if (p) p.textContent = s.welcomeSub;
    const sg = cw.querySelectorAll(".sug");
    if (sg[0]) sg[0].textContent = s.chip1;
    if (sg[1]) sg[1].textContent = s.chip2;
    if (sg[2]) sg[2].textContent = s.chip3;
  }
  { const e = $("#input"); if (e && !state.imageMode) e.placeholder = s.placeholder; }
  { const e = $("#plusBtn"); if (e) { e.setAttribute("aria-label", s.addBtn); e.title = s.addBtn; } }
  const pm = $$("#plusMenu .plus-item");
  const pmk = ["image", "file", "zip", "genImg", "micro", "webSearch"];
  pm.forEach((el, i) => { const ico = el.querySelector(".pico"); if (ico && pmk[i]) el.innerHTML = ico.outerHTML + s[pmk[i]]; });
  syncReflexion();
  { const e = $(".agents-panel-head h3"); if (e) e.textContent = s.chooseAgent; }

  // === CODEX VIEW ===
  { const e = $(".codex-sb-title"); if (e) e.textContent = s.codexTitle; }
  { const e = $("#codexNewConv"); if (e) e.title = s.codexNewConv; }
  const cxLabels = $$(".codex-sb-label");
  if (cxLabels[0]) cxLabels[0].textContent = s.codexProject;
  if (cxLabels[1]) cxLabels[1].textContent = s.codexConvs;
  { const e = $(".codex-sb-back span"); if (e) e.textContent = s.codexBack; }
  { const e = $("#codexSbOpenBtn"); if (e) e.title = s.codexOpenMenu; }
  { const e = $("#codexGhToken"); if (e) e.placeholder = s.codexTokenPh; }
  { const e = $("#codexScanBtn"); if (e && !e.disabled) { const svg = e.querySelector("svg"); e.innerHTML = (svg ? svg.outerHTML + " " : "") + s.codexScanProject; } }
  const cwx = $(".codex-welcome");
  if (cwx) {
    const h = cwx.querySelector("h2"); if (h) h.innerHTML = s.codexHeading;
    const p = cwx.querySelector("p"); if (p) p.textContent = s.codexSub;
  }
  { const e = $("#codeInput"); if (e) e.placeholder = s.codexPh; }
  { const e = $(".codex-composer .composer-hint"); if (e) e.innerHTML = s.codexHint; }
  const cpm = $$("#codexPlusMenu .plus-item");
  const cpmk = ["image", "file", "zip"];
  cpm.forEach((el, i) => { const ico = el.querySelector(".pico"); if (ico && cpmk[i]) el.innerHTML = ico.outerHTML + s[cpmk[i]]; });

  // === SECURITY VIEW ===
  { const e = $(".sec-head h2"); if (e) e.innerHTML = s.secTitle; }
  { const e = $(".sec-head .muted"); if (e) e.textContent = s.secSub; }
  const sc = $$(".sec-card");
  if (sc[0]) { const h = sc[0].querySelector("h3"); if (h) h.textContent = s.secAuth; const sp = sc[0].querySelector(".muted"); if (sp) sp.textContent = s.secSowActive; }
  if (sc[1]) { const h = sc[1].querySelector("h3"); if (h) h.textContent = s.secScans; }
  if (sc[2]) { const h = sc[2].querySelector("h3"); if (h) h.textContent = s.secFindings; }
  if (sc[3]) { const h = sc[3].querySelector("h3"); if (h) h.textContent = s.secRbac; }
  { const e = $("#btnNewSow"); if (e) e.textContent = s.secNewSow; }
  { const e = $("#btnRefreshSow"); if (e) e.textContent = s.secRefresh; }
  { const e = $("#sowForm > h3"); if (e) e.textContent = s.secCreateSow; }
  [["sowTitle","secMandatTitle","secMandatTitlePh"],["sowClient","secClientName","secClientNamePh"],
   ["sowContactName","secContactName","secContactNamePh"],["sowContactEmail","secContactEmail","secContactEmailPh"],
   ["sowScopeIn","secTargetsIn","secTargetsInPh"],["sowScopeOut","secTargetsOut","secTargetsOutPh"],
   ["sowNotes","secNotes","secNotesPh"]].forEach(([id,lk,pk]) => {
    const el = document.getElementById(id);
    if (el) { const lbl = el.closest(".form-group")?.querySelector("label"); if (lbl) lbl.textContent = s[lk]; if (pk) el.placeholder = s[pk]; }
  });
  [["sowStartDate","secDateStart"],["sowEndDate","secDateEnd"]].forEach(([id,lk]) => {
    const el = document.getElementById(id);
    if (el) { const lbl = el.closest(".form-group")?.querySelector("label"); if (lbl) lbl.textContent = s[lk]; }
  });
  { const e = $(".sow-scan-types")?.closest(".form-group")?.querySelector("label"); if (e) e.textContent = s.secScanTypes; }
  const stc = $$(".sow-check");
  const stk = ["secReconPassive","secVulnScan","secWebScan","secConfigAudit","secDarkWeb","secFullAudit"];
  stc.forEach((c, i) => { if (stk[i]) { const nodes = [...c.childNodes]; const last = nodes.filter(n => n.nodeType === 3).pop(); if (last) last.textContent = " " + s[stk[i]]; } });
  { const e = $("#btnSubmitSow"); if (e) e.textContent = s.secCreateBtn; }
  { const e = $("#btnCancelSow"); if (e) e.textContent = s.secCancel; }

  // === STUDIO VIEW ===
  { const e = $(".studio-sb-head h3"); if (e) e.textContent = s.studioTitle; }
  { const e = $("#studioRefresh"); if (e) e.title = s.studioRefresh; }
  { const e = $("#studioCode"); if (e && /Sélectionne|Select/.test(e.placeholder)) e.placeholder = s.studioPushPh; }

  // === FORFAITS VIEW ===
  { const e = $(".fp-page-title"); if (e) { const ds = e.querySelector(".fp-dollar-sign"); e.innerHTML = s.fpTitle + " " + (ds ? ds.outerHTML : '<span class="fp-dollar-sign">$$$</span>'); } }
  { const e = $(".fp-kicker"); if (e) e.textContent = s.fpKicker; }
  { const e = $(".fp-title"); if (e) e.innerHTML = s.fpChoose; }
  { const e = $(".fp-sub"); if (e) e.textContent = s.fpSub; }
  const fpBtns = $$("#fpToggle .fp-toggle-btn");
  if (fpBtns[0]) fpBtns[0].textContent = s.fpMonthly;
  if (fpBtns[1]) fpBtns[1].textContent = s.fpAnnual;
  { const e = $(".fp-save"); if (e) e.textContent = s.fpSave; }
  const fpCards = $$(".fp-card");
  const fpT = [
    { n:"fpFlux", p:"fpFluxPitch", c:"fpFluxCta", b:"fpFluxBilled", per:"fpFluxPeriod",
      f:["fpFluxF1","fpFluxF2","fpFluxF3","fpFluxF4","fpFluxF5","fpFluxF6","fpFluxF7"],
      o:["fpFluxOff1","fpFluxOff2"] },
    { n:"fpSurge", p:"fpSurgePitch", c:"fpSurgeCta", b:"fpSurgeBilled", per:"fpSurgePeriod", badge:"fpSurgeBadge",
      f:["fpSurgeF1","fpSurgeF2","fpSurgeF3","fpSurgeF4","fpSurgeF5","fpSurgeF6","fpSurgeF7"],
      o:["fpSurgeOff1","fpSurgeOff2"] },
    { n:"fpApex", p:"fpApexPitch", c:"fpApexCta", b:"fpApexBilled", per:"fpApexPeriod", badge:"fpApexBadge",
      f:["fpApexF1","fpApexF2","fpApexF3","fpApexF4","fpApexF5","fpApexF6","fpApexF7"],
      o:[] },
  ];
  fpCards.forEach((card, i) => {
    const t = fpT[i]; if (!t) return;
    const tier = card.querySelector(".fp-tier"); if (tier) { const ico = tier.querySelector(".fp-ico"); tier.innerHTML = (ico ? ico.outerHTML + " " : "") + s[t.n]; }
    if (t.badge) { const b = card.querySelector(".fp-badge"); if (b) b.textContent = s[t.badge]; }
    const pitch = card.querySelector(".fp-pitch"); if (pitch) pitch.textContent = s[t.p];
    const per = card.querySelector(".fp-per"); if (per) per.textContent = s[t.per];
    const billed = card.querySelector(".fp-billed"); if (billed && t.b) billed.dataset.annual = s[t.b];
    const cta = card.querySelector(".fp-cta"); if (cta) cta.textContent = s[t.c];
    const feats = card.querySelectorAll(".fp-feats li:not(.fp-off)");
    t.f.forEach((fk, fi) => { if (feats[fi]) { const ck = feats[fi].querySelector(".fp-ck"); feats[fi].innerHTML = (ck ? ck.outerHTML + " " : "") + s[fk]; } });
    const offs = card.querySelectorAll(".fp-feats li.fp-off");
    (t.o || []).forEach((ok, oi) => { if (offs[oi]) { const ck = offs[oi].querySelector(".fp-ck"); offs[oi].innerHTML = (ck ? ck.outerHTML + " " : "") + s[ok]; } });
  });
  { const e = $(".fp-faq-title"); if (e) e.textContent = s.fpFaq; }
  const fpQs = $$(".fp-q");
  [["fpQ1","fpA1"],["fpQ2","fpA2"],["fpQ3","fpA3"],["fpQ4","fpA4"]].forEach(([qk,ak], i) => {
    if (!fpQs[i]) return;
    const btn = fpQs[i].querySelector("button span:first-child"); if (btn) btn.textContent = s[qk];
    const ans = fpQs[i].querySelector(".fp-ans"); if (ans) ans.textContent = s[ak];
  });
  const fpTrust = $$(".fp-trust > span");
  ["fpBadge1","fpBadge2","fpBadge3","fpBadge4"].forEach((k, i) => {
    if (fpTrust[i]) { const ico = fpTrust[i].querySelector(".fp-td"); fpTrust[i].innerHTML = (ico ? ico.outerHTML + " " : "") + s[k]; }
  });
  { const e = $(".fp-footer p"); if (e) e.textContent = s.fpFooter; }
  { const e = $("#manageSubscriptionBtn"); if (e && !e.disabled) e.textContent = s.fpManage; }
  fpSetPeriod($(".fp-toggle-btn.on")?.dataset?.period || "monthly");

  // === FINANCE VIEW ===
  { const e = $(".fin-title"); if (e) e.textContent = s.finTitle; }
  { const e = $(".fin-subtitle"); if (e) e.innerHTML = '<span class="fin-status-dot"></span>' + s.finStatus + '<span class="fin-sep">·</span><span>' + s.finOrigin + '</span>'; }
  { const e = $(".fin-badge"); if (e) e.textContent = s.finBadge; }
  if (!window._finTyping) {
    { const e = $(".fin-welcome-title"); if (e) e.innerHTML = s.finWelcomeTitle; }
    { const e = $(".fin-welcome-sub"); if (e) e.textContent = s.finWelcomeSub; }
  }
  const fc = $$(".fin-chip");
  const fck = ["finChip1","finChip2","finChip3","finChip4","finChip5","finChip6"];
  fc.forEach((c, i) => { if (fck[i]) { c.textContent = s[fck[i]]; c.dataset.q = s[fck[i]]; } });
  { const e = $("#finInput"); if (e) e.placeholder = s.finPh; }
  { const e = $(".fin-disclaimer"); if (e) e.textContent = s.finDisclaimer; }

  // === SETTINGS VIEW ===
  { const e = $(".settings-wrap > h2"); if (e) e.textContent = s.setTitle; }
  const sb = $$(".set-block");
  // API Key (index 0)
  if (sb[0]) {
    const h = sb[0].querySelector("h3"); const st = sb[0].querySelector(".conn-state");
    if (h && st) h.innerHTML = s.setApiKey + " " + st.outerHTML;
    const p = sb[0].querySelector(".muted"); if (p) p.textContent = s.setApiKeySub;
    const inp = sb[0].querySelector("input"); if (inp) inp.placeholder = s.setApiKeyPh;
  }
  // Model (index 1)
  if (sb[1]) { const h = sb[1].querySelector("h3"); if (h) h.textContent = s.setModel; const p = sb[1].querySelector(".muted"); if (p) p.textContent = s.setModelSub; }
  const mo = $$("#modelSelect option");
  if (mo[0]) mo[0].textContent = s.setOpus;
  if (mo[1]) mo[1].textContent = s.setSonnet;
  if (mo[2]) mo[2].textContent = s.setHaiku;
  // Reflexion (index 2)
  if (sb[2]) { const h = sb[2].querySelector("h3"); if (h) h.textContent = s.setReflex; const p = sb[2].querySelector(".muted"); if (p) p.textContent = s.setReflexSub; }
  // Theme (index 3)
  if (sb[3]) { const h = sb[3].querySelector("h3"); if (h) h.textContent = s.setTheme; const p = sb[3].querySelector(".muted"); if (p) p.textContent = s.setThemeSub; }
  { const e = $("#themeToggle"); if (e) { const txt = $(".pill-txt", e); if (txt) txt.textContent = state.theme === "light" ? s.setLight : s.setDark; } }
  // Language (index 4)
  if (sb[4]) { const h = sb[4].querySelector("h3"); if (h) h.textContent = s.setLang; const p = sb[4].querySelector(".muted"); if (p) p.textContent = s.setLangSub; }
  // Memory (index 5)
  if (sb[5]) { const h = sb[5].querySelector("h3"); if (h) h.textContent = s.setMemory; const p = sb[5].querySelector(".muted"); if (p) p.textContent = s.setMemorySub; }
  { const e = $("#memoryInput"); if (e) e.placeholder = s.setMemoryPh; }
  { const e = $("#memoryClearBtn"); if (e) e.textContent = s.setMemoryClear; }
  // GitHub (index 6)
  if (sb[6]) {
    const h = sb[6].querySelector("h3"); const ghSt = sb[6].querySelector(".conn-state");
    if (h && ghSt) h.innerHTML = s.setGitHub + " " + ghSt.outerHTML;
    const p = sb[6].querySelector(".muted"); if (p) p.textContent = s.setGitHubSub;
  }
  { const e = $("#ghToken"); if (e) e.placeholder = s.setGitHubTokenPh; }
  { const e = $(".set-link[href*='github.com']"); if (e) e.textContent = s.setGitHubCreateToken; }
  // Supabase (index 7)
  if (sb[7]) {
    const h = sb[7].querySelector("h3"); const sbSt = sb[7].querySelector(".conn-state");
    if (h && sbSt) h.innerHTML = s.setSupabase + " " + sbSt.outerHTML;
    const p = sb[7].querySelector(".muted"); if (p) p.textContent = s.setSupabaseSub;
  }
  { const e = $("#sbUrl"); if (e) e.placeholder = s.setSupabaseUrlPh; }
  { const e = $("#sbKey"); if (e) e.placeholder = s.setSupabaseKeyPh; }
  // Data (index 8)
  if (sb[8]) {
    const h = sb[8].querySelector("h3"); if (h) { const badge = h.querySelector(".badge-loi25"); h.innerHTML = s.setData + " " + (badge ? badge.outerHTML : '<span class="badge-loi25">Loi 25</span>'); }
    const p = sb[8].querySelector(".muted:first-of-type"); if (p) p.textContent = s.setDataSub;
  }
  // Other (index 9)
  if (sb[9]) { const h = sb[9].querySelector("h3"); if (h) h.textContent = s.setOther; }

  // === CONSENT BANNER ===
  const cb = $("#consentBanner");
  if (cb) {
    const strong = cb.querySelector("strong"); if (strong) strong.textContent = s.consentTitle;
    const accept = cb.querySelector(".consent-accept"); if (accept) accept.textContent = s.consentAccept;
    const decline = cb.querySelector(".consent-decline"); if (decline) decline.textContent = s.consentRefuse;
    const more = cb.querySelector(".consent-link"); if (more) more.textContent = s.consentMore;
  }
}

const TITLES = I18N.fr.titles;
function switchView(v) {
  $$(".view").forEach(el => el.classList.remove("active"));
  $(`#view-${v}`).classList.add("active");
  $$(".nav-item").forEach(b => {
    const bv = b.dataset.view;
    b.classList.toggle("active", bv === v || (bv === "chat" && (v === "projects" || v === "convos" || v === "cerveau")));
  });
  const titles = I18N[state.lang]?.titles || TITLES;
  $("#viewTitle").textContent = titles[v] || "Agent AL";
  if (window.innerWidth <= 860) { document.body.classList.remove("menu-open"); $("#overlay").classList.remove("show"); }
  if (v === "security" && typeof loadSecurityDashboard === "function") loadSecurityDashboard();
  if (v === "account" && typeof refreshAccountPage === "function") refreshAccountPage();
  if (v === "finance") { const w = $("#finWelcome"); if (w && w.style.display !== "none") finTypewriter(); }
  if (v !== "chat") closeStudioPreview();
  const subNav = $("#chatSubNav");
  if (subNav) subNav.classList.toggle("open", v === "chat" || v === "projects" || v === "convos" || v === "cerveau");
}
$$(".nav-item").forEach(b => b.dataset.view && (b.onclick = () => switchView(b.dataset.view)));
if (location.hash) { const hv = location.hash.slice(1); if ($(`#view-${hv}`)) switchView(hv); }

/* ================= SÉLECTEUR D'AGENTS ================= */
const AGENT_DESC_KEYS = { tilex: "agentTilex", general: "agentGeneral", dev: "agentDev", secu: "agentSecu", creatif: "agentCreatif", cerveau: "agentCerveau" };
function agentDesc(key) { return AGENT_DESC_KEYS[key] ? t(AGENT_DESC_KEYS[key]) : AGENTS[key]?.desc || ""; }
function isAgentLocked() {
  return false;
}
function renderAgents() {
  const list = $("#agentsList");
  if (!list) return;
  list.innerHTML = Object.entries(AGENTS).map(([key, a]) => {
    const locked = isAgentLocked(key);
    const isCustom = !!a.custom;
    return `<button class="agent-card${key === state.agent ? ' active' : ''}${locked ? ' agent-locked' : ''}" data-agent="${key}"${locked ? ' title="Disponible avec le forfait APEX"' : ''}>
      <div class="agent-card-top">
        <span class="agent-emoji">${a.photo ? `<img src="${a.photo}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover">` : (a.img ? `<img src="${a.img}" alt="">` : a.emoji)}</span>
        <span class="agent-name">${a.name}</span>
        ${locked ? '<span class="agent-lock-badge">🔒 APEX</span>' : ''}
        ${isCustom ? `<span class="agent-custom-actions">
          <span class="agent-custom-edit" data-edit="${key}" title="Modifier">✏️</span>
          <span class="agent-custom-del" data-del="${a.customId}" title="Supprimer">🗑️</span>
        </span>` : ''}
      </div>
      <span class="agent-desc">${agentDesc(key)}</span>
    </button>`;
  }).join("");
  $$(".agent-card").forEach(c => {
    if (isAgentLocked(c.dataset.agent)) {
      c.onclick = () => switchView("forfaits");
      return;
    }
    c.onclick = () => { selectAgent(c.dataset.agent); closeAgents(); };
  });
  $$(".agent-custom-edit").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); showAgentForm(btn.dataset.edit); };
  });
  $$(".agent-custom-del").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); deleteCustomAgent(btn.dataset.del); };
  });
}

function selectAgent(key) {
  if (isAgentLocked(key)) return;
  state.agent = key;
  const a = AGENTS[key];
  if (a.model) {
    let model = a.model;
    if (model.includes("opus") && !isOpusAllowed()) model = "claude-sonnet-4-6";
    state.model = model;
    const ms = $("#modelSelect");
    if (ms) ms.value = model;
  }
  $("#agentsToggleName").textContent = a.name.replace("AL ", "") || a.name;
  const inp = $("#input");
  if (inp && !state.imageMode) inp.placeholder = `${t("writeTo")} ${a.name}…`;
  renderAgents();
  renderAgentPicker();
}

function openAgents(){ $("#agentsPanel").classList.add("open"); $("#agentsOverlay").classList.add("show"); }
function closeAgents(){ $("#agentsPanel").classList.remove("open"); $("#agentsOverlay").classList.remove("show"); }
if ($("#agentsToggle")) $("#agentsToggle").onclick = openAgents;
if ($("#agentsClose")) $("#agentsClose").onclick = closeAgents;
if ($("#agentsOverlay")) $("#agentsOverlay").onclick = closeAgents;

/* ================= AGENTS PERSONNALISÉS ================= */
let customAgents = [];
const CUSTOM_AGENTS_LS = "tilex-custom-agents";
const AGENT_EMOJIS = ["🤖","🦫","🦊","🐺","🦉","⚡","🔥","🌲","🛡️","🎩","👾","🧙"];
const AGENT_CAPS = [
  { id: "ia", label: "✨ IA Claude", desc: "Répond avec l'intelligence de Claude" },
  { id: "web", label: "🌐 Recherche web", desc: "Cherche des infos à jour sur le web" },
  { id: "memoire", label: "🧠 Mémoire", desc: "Se souvient de la conversation" },
  { id: "supabase", label: "🗄️ Supabase", desc: "Accède à la base de données ti-lex" },
];
let agentFormState = { id: null, name: "", emoji: "🤖", photo: null, description: "", system_prompt: "", capabilities: ["ia", "memoire"] };

function customAgentsLocalLoad() {
  try { customAgents = JSON.parse(localStorage.getItem(CUSTOM_AGENTS_LS) || "[]"); } catch { customAgents = []; }
}
function customAgentsLocalSave() {
  try { localStorage.setItem(CUSTOM_AGENTS_LS, JSON.stringify(customAgents)); } catch (_) {}
}

async function customAgentsFetch() {
  const session = getSupabaseSession();
  if (!session?.user?.id) return;
  try {
    const tk = proxyToken();
    const res = await fetch(
      `${SUPABASE_REST}/agents?select=*&order=created_at.asc`,
      { headers: { apikey: tk, Authorization: `Bearer ${session.access_token}` } }
    );
    if (!res.ok) return;
    const rows = await res.json();
    customAgents = rows;
    customAgentsLocalSave();
    registerCustomAgents();
    renderAgents();
  } catch (_) {}
}

async function customAgentSave(agent) {
  const session = getSupabaseSession();
  if (!session?.user?.id) return;
  try {
    const tk = proxyToken();
    await fetch(`${SUPABASE_REST}/agents`, {
      method: "POST",
      headers: {
        apikey: tk, Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(agent),
    });
  } catch (_) {}
}

async function customAgentDelete(id) {
  const session = getSupabaseSession();
  if (!session?.user?.id) return;
  try {
    const tk = proxyToken();
    await fetch(`${SUPABASE_REST}/agents?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: tk, Authorization: `Bearer ${session.access_token}` },
    });
  } catch (_) {}
}

function registerCustomAgents() {
  customAgents.forEach(a => {
    const key = "custom_" + a.id;
    AGENTS[key] = {
      name: a.name,
      emoji: a.emoji || "🤖",
      photo: a.photo || null,
      desc: a.description || "Agent personnalisé",
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      prompt: a.system_prompt || `Tu es ${a.name}, un agent IA de ti-lex-AL. Réponds en français québécois.`,
      custom: true,
      customId: a.id,
      capabilities: a.capabilities || [],
    };
  });
}

function showAgentForm(editKey) {
  const form = $("#agentsForm");
  const list = $("#agentsList");
  if (!form || !list) return;
  list.classList.add("hidden");
  form.classList.remove("hidden");
  if (editKey) {
    const a = AGENTS[editKey];
    const ca = customAgents.find(c => "custom_" + c.id === editKey);
    agentFormState = {
      id: ca?.id || null,
      name: a?.name || "",
      emoji: a?.emoji || "🤖",
      photo: a?.photo || ca?.photo || null,
      description: a?.desc || "",
      system_prompt: a?.prompt || "",
      capabilities: a?.capabilities || ca?.capabilities || ["ia", "memoire"],
    };
    $("#agentsFormTitle").textContent = "Modifier l'agent";
    $("#agentsFormSave").textContent = "Enregistrer";
  } else {
    agentFormState = { id: null, name: "", emoji: "🤖", photo: null, description: "", system_prompt: "", capabilities: ["ia", "memoire"] };
    $("#agentsFormTitle").textContent = "Créer un agent";
    $("#agentsFormSave").textContent = "Créer l'agent";
  }
  $("#agentsFormName").value = agentFormState.name;
  $("#agentsFormDesc").value = agentFormState.description;
  $("#agentsFormPrompt").value = agentFormState.system_prompt;
  renderAgentFormPhoto();
  renderAgentFormEmojis();
  renderAgentFormCaps();
}

function hideAgentForm() {
  const form = $("#agentsForm");
  const list = $("#agentsList");
  if (form) form.classList.add("hidden");
  if (list) list.classList.remove("hidden");
}

function renderAgentFormPhoto() {
  const el = $("#agentsFormPhoto");
  if (!el) return;
  if (agentFormState.photo) {
    el.innerHTML = `<img src="${agentFormState.photo}" alt="">`;
    el.classList.add("has-photo");
  } else {
    el.textContent = agentFormState.emoji;
    el.classList.remove("has-photo");
  }
}

function renderAgentFormEmojis() {
  const el = $("#agentsFormEmojis");
  if (!el) return;
  if (agentFormState.photo) { el.innerHTML = ""; return; }
  el.innerHTML = AGENT_EMOJIS.map(e =>
    `<button class="agents-form-emoji${agentFormState.emoji === e ? ' active' : ''}" data-emoji="${e}">${e}</button>`
  ).join("");
  $$(".agents-form-emoji", el).forEach(btn => {
    btn.onclick = () => {
      agentFormState.emoji = btn.dataset.emoji;
      renderAgentFormEmojis();
      renderAgentFormPhoto();
    };
  });
}

function renderAgentFormCaps() {
  const el = $("#agentsFormCaps");
  if (!el) return;
  el.innerHTML = AGENT_CAPS.map(c => {
    const on = agentFormState.capabilities.includes(c.id);
    return `<div class="agents-form-cap${on ? ' active' : ''}" data-cap="${c.id}">
      <div><div class="agents-form-cap-label">${c.label}</div><div class="agents-form-cap-desc">${c.desc}</div></div>
    </div>`;
  }).join("");
  $$(".agents-form-cap", el).forEach(btn => {
    btn.onclick = () => {
      const cap = btn.dataset.cap;
      if (agentFormState.capabilities.includes(cap)) {
        agentFormState.capabilities = agentFormState.capabilities.filter(c => c !== cap);
      } else {
        agentFormState.capabilities.push(cap);
      }
      renderAgentFormCaps();
    };
  });
}

function handleAgentPhoto(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext("2d");
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, 256, 256);
      agentFormState.photo = canvas.toDataURL("image/jpeg", 0.8);
      renderAgentFormPhoto();
      renderAgentFormEmojis();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

async function saveCustomAgent() {
  const name = ($("#agentsFormName")?.value || "").trim();
  if (!name) return;
  const desc = ($("#agentsFormDesc")?.value || "").trim();
  const prompt = ($("#agentsFormPrompt")?.value || "").trim();
  const now = new Date().toISOString();
  const agent = {
    id: agentFormState.id || "ag_" + Date.now(),
    name,
    emoji: agentFormState.emoji,
    photo: agentFormState.photo,
    description: desc,
    system_prompt: prompt,
    capabilities: agentFormState.capabilities,
    updated_at: now,
  };
  if (!agentFormState.id) agent.created_at = now;
  const idx = customAgents.findIndex(a => a.id === agent.id);
  if (idx >= 0) {
    customAgents[idx] = { ...customAgents[idx], ...agent };
  } else {
    customAgents.push(agent);
  }
  customAgentsLocalSave();
  registerCustomAgents();
  hideAgentForm();
  renderAgents();
  renderAgentPicker();
  customAgentSave(agent);
}

function deleteCustomAgent(customId) {
  if (!confirm("Supprimer cet agent ?")) return;
  const key = "custom_" + customId;
  if (state.agent === key) { selectAgent("general"); }
  delete AGENTS[key];
  customAgents = customAgents.filter(a => a.id !== customId);
  customAgentsLocalSave();
  renderAgents();
  renderAgentPicker();
  customAgentDelete(customId);
}

(function initCustomAgents() {
  customAgentsLocalLoad();
  registerCustomAgents();

  if ($("#agentsCreateBtn")) $("#agentsCreateBtn").onclick = () => showAgentForm(null);
  if ($("#agentsFormCancel")) $("#agentsFormCancel").onclick = () => hideAgentForm();
  if ($("#agentsFormSave")) $("#agentsFormSave").onclick = () => saveCustomAgent();
  if ($("#agentsFormPhotoBtn")) $("#agentsFormPhotoBtn").onclick = () => $("#agentsFormFileInput")?.click();
  if ($("#agentsFormFileInput")) $("#agentsFormFileInput").onchange = handleAgentPhoto;
  if ($("#navCreerAgent")) $("#navCreerAgent").onclick = () => { openAgents(); showAgentForm(null); };

  customAgentsFetch();
})();

renderAgents();

/* ================= ANIMATIONS VIEW — Particules dorées ================= */
(function initAnimationsView() {
  let animRaf = null;

  function startParticles() {
    const canvas = $("#animParticles");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const container = canvas.parentElement;
    const isMobile = window.innerWidth <= 600;
    const count = isMobile ? 25 : 50;
    const mouse = { x: -999, y: -999 };

    function resize() {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const pts = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 2.2 + 1,
    }));

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    canvas.ontouchmove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.touches[0].clientX - rect.left;
      mouse.y = e.touches[0].clientY - rect.top;
    };
    canvas.onmouseleave = () => { mouse.x = -999; mouse.y = -999; };

    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 140 && d > 0.1) {
          p.x += (dx / d) * 0.8;
          p.y += (dy / d) * 0.8;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "#d4af37";
        ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.hypot(dx, dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = "#8b7355";
            ctx.globalAlpha = (1 - d / 110) * 0.35;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      animRaf = requestAnimationFrame(frame);
    }
    frame();
  }

  function renderLogoLetters() {
    const el = $("#animLogoLetters");
    if (!el) return;
    const letters = "ti-lex".split("");
    el.innerHTML = letters.map((ch, i) =>
      `<span class="tlx-letter" style="animation-delay:${i * 0.12}s">${ch}</span>`
    ).join("");
  }

  function startTypewriter() {
    const el = $("#animTypewriter");
    if (!el) return;
    const text = "Agent AL réfléchit...";
    let i = 0;
    el.textContent = "";
    function tick() {
      if (i < text.length) {
        el.textContent += text[i++];
        setTimeout(tick, 80);
      } else {
        setTimeout(() => { el.textContent = ""; i = 0; tick(); }, 2000);
      }
    }
    tick();
  }

  function initView() {
    renderLogoLetters();
    startParticles();
    startTypewriter();
  }

  const replayBtn = $("#animReplayLogo");
  if (replayBtn) replayBtn.onclick = renderLogoLetters;

  const observer = new MutationObserver(() => {
    const view = $("#view-animations");
    if (view && view.classList.contains("active")) {
      if (!animRaf) initView();
    } else {
      if (animRaf) { cancelAnimationFrame(animRaf); animRaf = null; }
    }
  });
  const viewEl = $("#view-animations");
  if (viewEl) observer.observe(viewEl, { attributes: true, attributeFilter: ["class"] });
})();

/* ---- Agent picker (dans le composer) ---- */
function renderAgentPicker() {
  const btn = $("#agentPickerBtn");
  const menu = $("#agentPickerMenu");
  const img = $("#agentPickerImg");
  const nameEl = $("#agentPickerName");
  if (!btn || !menu) return;
  const cur = AGENTS[state.agent];
  nameEl.textContent = cur.name;
  if (cur.img) {
    img.src = cur.img;
    img.style.display = "";
    img.nextElementSibling && img.nextElementSibling.classList.contains("agent-picker-emoji") && img.nextElementSibling.remove();
  } else {
    img.style.display = "none";
    if (!btn.querySelector(".agent-picker-emoji")) {
      const em = document.createElement("span");
      em.className = "agent-picker-emoji";
      em.textContent = cur.emoji;
      btn.insertBefore(em, nameEl);
    } else {
      btn.querySelector(".agent-picker-emoji").textContent = cur.emoji;
    }
  }
  menu.innerHTML = Object.entries(AGENTS).map(([key, a]) => {
    const locked = isAgentLocked(key);
    return `<button class="agent-pick${key === state.agent ? ' active' : ''}${locked ? ' agent-locked' : ''}" data-agent="${key}">
      <span class="agent-pick-icon">${a.img ? `<img src="${a.img}" alt="">` : a.emoji}</span>
      <span class="agent-pick-info">
        <span class="agent-pick-name">${a.name}${locked ? ' 🔒' : ''}</span>
        <span class="agent-pick-desc">${locked ? 'Forfait APEX requis' : agentDesc(key)}</span>
      </span>
    </button>`;
  }).join("");
  $$(".agent-pick", menu).forEach(p => {
    if (isAgentLocked(p.dataset.agent)) {
      p.onclick = () => { toggleAgentPicker(false); switchView("forfaits"); };
      return;
    }
    p.onclick = () => { selectAgent(p.dataset.agent); toggleAgentPicker(false); };
  });
}

function toggleAgentPicker(forceState) {
  const btn = $("#agentPickerBtn");
  const menu = $("#agentPickerMenu");
  if (!btn || !menu) return;
  const show = forceState !== undefined ? forceState : menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !show);
  btn.classList.toggle("open", show);
}

if ($("#agentPickerBtn")) {
  $("#agentPickerBtn").onclick = (e) => { e.stopPropagation(); toggleAgentPicker(); };
}
document.addEventListener("click", (e) => {
  const menu = $("#agentPickerMenu");
  if (menu && !menu.classList.contains("hidden") && !e.target.closest(".agent-picker-wrap")) {
    toggleAgentPicker(false);
  }
});
renderAgentPicker();

/* ================= GÉNÉRATION D'IMAGE ================= */
function toggleImageMode(on) {
  state.imageMode = on ?? !state.imageMode;
  $(".composer").classList.toggle("image-mode", state.imageMode);
  $("#input").placeholder = state.imageMode ? t("imgDescPh") : `${t("writeTo")} ${AGENTS[state.agent].name}…`;
  let banner = $(".image-mode-banner");
  if (state.imageMode && !banner) {
    banner = document.createElement("div");
    banner.className = "image-mode-banner";
    banner.innerHTML = `🎨 ${t("imageMode")} <button id="exitImageMode">×</button>`;
    $(".composer").insertBefore(banner, $(".composer-inner"));
    $("#exitImageMode").onclick = () => toggleImageMode(false);
  } else if (!state.imageMode && banner) { banner.remove(); }
}
async function generateImage(prompt) {
  $(".welcome")?.remove();
  addUserMsg("🎨 " + prompt, []);
  const body = buildAssistantMsg();
  try {
    const ih = { "Content-Type": "application/json" };
    const itk = proxyToken();
    if (itk) ih["Authorization"] = `Bearer ${itk}`;

    body.innerHTML = `<div class="typing"><span></span><span></span><span></span></div><p class="muted" style="margin-top:8px;font-size:.82rem">🎨 ${t("imgPromptEnhance")}</p>`;

    const enhanceRes = await fetch(AI_PROXY, {
      method: "POST", headers: ih,
      body: JSON.stringify({
        kind: "chat",
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        stream: false,
        messages: [{ role: "user", content: `Tu es un expert en génération d'images IA. Améliore ce prompt pour générer une image ultra réaliste et détaillée. Réponds UNIQUEMENT avec le prompt amélioré, rien d'autre.\n\nPrompt: ${prompt}` }],
      }),
    });

    let enhancedPrompt = prompt;
    if (enhanceRes.ok) {
      const enhData = await enhanceRes.json();
      if (enhData.content?.[0]?.text) {
        enhancedPrompt = enhData.content[0].text;
      } else if (typeof enhData === "string") {
        enhancedPrompt = enhData;
      }
    }

    body.innerHTML = `<div class="typing"><span></span><span></span><span></span></div><p class="muted" style="margin-top:8px;font-size:.82rem">🖼️ ${t("imgGenerating")}</p>`;

    const res = await fetch(AI_PROXY, {
      method: "POST", headers: ih,
      body: JSON.stringify({ kind: "image", prompt: enhancedPrompt, size: "1024x1024" }),
    });
    const data = await res.json();
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    if (!res.ok || !data.b64) throw new Error(data.error || t("imgGenFail"));
    const src = `data:image/png;base64,${data.b64}`;
    body.innerHTML = `<div class="gen-image-wrap">
      <img src="${src}" alt="${escapeHtml(prompt)}" class="gen-image">
      <div class="gen-image-info">
        <p class="gen-image-prompt-label">${t("imgPromptLabel")}</p>
        <p class="gen-image-prompt">${escapeHtml(enhancedPrompt)}</p>
      </div>
      <div class="gen-image-actions">
        <a href="${src}" download="tilex-image.png" class="gen-dl-btn">⬇ ${t("download")}</a>
      </div>
    </div>`;
  } catch (err) {
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    body.innerHTML = `<p class="muted">${t("imgError")} ${escapeHtml(err.message)}</p>`;
  }
  messages.scrollTop = messages.scrollHeight;
}

/* ================= TOGGLES ================= */
function bindReflexion(btn) {
  btn.onclick = () => {
    state.reflexion = !state.reflexion;
    syncReflexion();
  };
}
function syncReflexion() {
  $$("#reflexionToggle, #reflexionToggle2").forEach(b => {
    b.setAttribute("aria-pressed", state.reflexion);
    const txt = $(".pill-txt", b);
    if (b.id === "reflexionToggle2") txt.textContent = state.reflexion ? t("setEnabled") : t("setDisabled");
  });
  $("#modeHint").innerHTML = state.reflexion ? t("modeReflexOn") : t("modeReflexOff");
}
bindReflexion($("#reflexionToggle"));
bindReflexion($("#reflexionToggle2"));

$("#themeToggle").onclick = function () {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.body.dataset.theme = state.theme;
  this.setAttribute("aria-pressed", state.theme === "light");
  $(".pill-txt", this).textContent = state.theme === "light" ? t("setLight") : t("setDark");
};

function isOpusAllowed() {
  const plan = (localStorage.getItem("tilex-plan") || "").toLowerCase();
  return plan === "apex";
}

function enforceModelRestrictions() {
  const sel = $("#modelSelect");
  if (!sel) return;
  const opusOpt = sel.querySelector('option[value="claude-opus-4-8"]');
  if (!opusOpt) return;
  if (!isOpusAllowed()) {
    opusOpt.disabled = true;
    opusOpt.textContent = "Opus 4.8 — APEX requis 🔒";
    if (state.model.includes("opus")) {
      state.model = "claude-sonnet-4-6";
      sel.value = state.model;
      try { localStorage.setItem(LS_MODEL, state.model); } catch (_) {}
    }
  } else {
    opusOpt.disabled = false;
    opusOpt.textContent = t("setOpus") || "Opus 4.8 — puissant";
  }
}

$("#modelSelect").onchange = e => {
  if (e.target.value.includes("opus") && !isOpusAllowed()) {
    e.target.value = state.model;
    return;
  }
  state.model = e.target.value;
  try { localStorage.setItem(LS_MODEL, state.model); } catch (e) {}
};

/* ================= CONNECTEURS (Settings only) ================= */
$$(".conn-btn[data-service]").forEach(btn => {
  btn.onclick = () => {
    const s = btn.dataset.service;
    state.connected[s] = !state.connected[s];
    $$(`.conn-btn[data-service="${s}"]`).forEach(b => b.classList.toggle("connected", state.connected[s]));
    syncCodexProjects();
  };
  if (state.connected[btn.dataset.service]) btn.classList.add("connected");
});

/* ================= CONNEXION GITHUB ================= */
const GH_API = "https://api.github.com";
function ghHeaders() {
  return { Authorization: `Bearer ${state.github.token}`, Accept: "application/vnd.github+json" };
}
function setGhState(txt, ok) {
  const el = $("#ghState");
  if (el) { el.textContent = txt; el.classList.toggle("ok", !!ok); }
}

async function ghConnect() {
  const token = $("#ghToken").value.trim();
  if (!token) { setGhState(t("ghEnterToken"), false); return; }
  state.github.token = token;
  setGhState(t("ghConnecting"), false);
  const btn = $("#ghConnect"); btn.disabled = true;
  try {
    const res = await fetch(`${GH_API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const repos = await res.json();
    const sel = $("#ghRepo");
    sel.innerHTML = `<option value="">${t("ghChooseRepo")} (${repos.length}) —</option>` +
      repos.map(r => `<option value="${r.full_name}">${escapeHtml(r.full_name)}${r.private ? " 🔒" : ""}</option>`).join("");
    $("#ghRepoZone").classList.add("show");
    state.connected.github = true;
    const me = repos[0]?.owner?.login || "";
    setGhState(`${t("connectedMark")}${me ? " · " + me : ""}`, true);
    persistGithub();
    $$(`.conn-btn[data-service="github"]`).forEach(b => b.classList.add("connected"));
    syncCodexProjects();
    // restaure le dépôt précédent
    if (state.github.repo) { sel.value = state.github.repo; await ghLoadBranches(state.github.repo); }
  } catch (err) {
    setGhState(`✗ ${err.message} (${t("ghTokenInvalid")})`, false);
    state.connected.github = false;
  } finally { btn.disabled = false; }
}

async function ghLoadBranches(repo) {
  if (!repo) return;
  state.github.repo = repo;
  state.projectFiles = [];
  const bsel = $("#ghBranch");
  bsel.innerHTML = `<option value="">${t("ghLoadingBranches")}</option>`;
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/branches?per_page=100`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const branches = await res.json();
    const repoRes = await fetch(`${GH_API}/repos/${repo}`, { headers: ghHeaders() });
    const def = repoRes.ok ? (await repoRes.json()).default_branch : "main";
    bsel.innerHTML = branches.map(b =>
      `<option value="${b.name}"${b.name === def ? " selected" : ""}>${escapeHtml(b.name)}${b.name === def ? ` ${t("defaultBranch")}` : ""}</option>`
    ).join("");
    state.github.branch = bsel.value || def;
    persistGithub();
    await ghLoadFiles(repo, state.github.branch);
  } catch (err) {
    bsel.innerHTML = `<option value="">${t("error")}: ${err.message}</option>`;
  }
}

async function ghLoadFiles(repo, branch) {
  const box = $("#ghFiles");
  box.innerHTML = `<p class="muted" style="font-size:.78rem">${t("ghFilesLoading")}</p>`;
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tree = await res.json();
    const files = (tree.tree || []).filter(t => t.type === "blob");
    if (!files.length) { box.innerHTML = `<p class="muted" style="font-size:.78rem">${t("ghNoFiles")}</p>`; return; }
    box.innerHTML = `<p class="muted" style="font-size:.74rem;padding:2px 6px 6px">${files.length} ${t("ghFilesCount")} <b>${escapeHtml(branch)}</b></p>` +
      files.slice(0, 300).map(f =>
        `<div class="set-file-item"><span class="f-ico">${fileIcon(f.path)}</span>${escapeHtml(f.path)}</div>`
      ).join("");
  } catch (err) {
    box.innerHTML = `<p class="muted" style="font-size:.78rem">${t("ghFilesError")} ${err.message}</p>`;
  }
}

function fileIcon(path) {
  const ext = path.split(".").pop().toLowerCase();
  const map = { ts:"🟦", tsx:"🟦", js:"🟨", jsx:"🟨", css:"🌸", html:"🟧", py:"🐍", sql:"🟩", rs:"🦀", json:"📦", md:"📄", png:"🖼️", jpg:"🖼️", svg:"🖼️", yml:"⚙️", yaml:"⚙️" };
  return map[ext] || "📄";
}

function persistGithub() {
  try { localStorage.setItem(LS_GH, JSON.stringify(state.github)); } catch (_) {}
}

if ($("#ghConnect")) {
  $("#ghConnect").onclick = ghConnect;
  $("#ghRepo").onchange = e => ghLoadBranches(e.target.value);
  $("#ghBranch").onchange = e => { state.github.branch = e.target.value; persistGithub(); state.projectFiles = []; ghLoadFiles(state.github.repo, e.target.value); };
}

/* ================= SCAN / CONTEXTE PROJET ================= */
const PROJECT_KEY_FILES = ["readme.md","package.json","index.html","app.js","app.html","styles.css","tsconfig.json","next.config.js","vercel.json","main.ts","index.ts","route.ts","page.tsx","layout.tsx","requirements.txt","cargo.toml","go.mod"];

function keyRank(path) {
  const base = path.toLowerCase().split("/").pop();
  const i = PROJECT_KEY_FILES.indexOf(base);
  if (i >= 0) return i;                       // fichiers clés en premier
  const ext = base.split(".").pop();
  if (TEXT_EXT.includes(ext)) return 50 + path.split("/").length; // texte, peu profond d'abord
  return 999;                                 // binaire en dernier
}

function projectSourceLabel() {
  const parts = [];
  if (state.connected.github && state.github.repo) parts.push(`GitHub ${state.github.repo}@${state.github.branch}`);
  if (studioZipFiles.length) parts.push(`ZIP (${studioZipFiles.length} fichiers)`);
  return parts.join(" + ") || "aucune";
}

/* Récupère le contenu des fichiers du projet (GitHub + ZIP), avec cache. */
async function loadProjectFiles({ maxFiles = 70, maxBytes = 180000, perFile = 24000, force = false } = {}) {
  if (!force && state.projectFiles && state.projectFiles.length) return state.projectFiles;
  const files = [];
  let total = 0;

  // 1) Fichiers ZIP déjà en mémoire
  for (const z of studioZipFiles) {
    if (z.content != null) {
      const slice = z.content.slice(0, perFile);
      files.push({ path: z.path, content: slice, source: "zip" });
      total += slice.length;
    } else {
      files.push({ path: z.path, content: null, source: "zip" });
    }
  }

  // 2) Fichiers GitHub (via l'arbre + blobs)
  if (state.connected.github && state.github.repo && state.github.token) {
    try {
      const res = await fetch(`${GH_API}/repos/${state.github.repo}/git/trees/${encodeURIComponent(state.github.branch)}?recursive=1`, { headers: ghHeaders() });
      if (res.ok) {
        const data = await res.json();
        const blobs = (data.tree || []).filter(t => t.type === "blob").sort((a, b) => keyRank(a.path) - keyRank(b.path));
        let count = 0;
        for (const blob of blobs) {
          const ext = blob.path.split(".").pop().toLowerCase();
          const isText = TEXT_EXT.includes(ext) || PROJECT_KEY_FILES.includes(blob.path.toLowerCase().split("/").pop());
          if (!isText || count >= maxFiles || total >= maxBytes) {
            files.push({ path: blob.path, content: null, source: "github", sha: blob.sha });
            continue;
          }
          try {
            const br = await fetch(`${GH_API}/repos/${state.github.repo}/git/blobs/${blob.sha}`, { headers: ghHeaders() });
            if (br.ok) {
              const bd = await br.json();
              let txt = "";
              try { txt = decodeURIComponent(escape(atob((bd.content || "").replace(/\n/g, "")))); } catch (_) { txt = ""; }
              const slice = txt.slice(0, perFile);
              files.push({ path: blob.path, content: slice, source: "github", sha: blob.sha });
              total += slice.length; count++;
            } else {
              files.push({ path: blob.path, content: null, source: "github", sha: blob.sha });
            }
          } catch (_) {
            files.push({ path: blob.path, content: null, source: "github", sha: blob.sha });
          }
        }
      }
    } catch (_) {}
  }

  state.projectFiles = files;
  return files;
}

/* Construit le bloc de contexte texte injecté dans les prompts. */
function projectContextString({ maxBytes = 70000, withContent = true } = {}) {
  const files = state.projectFiles || [];
  if (!files.length) return "";
  const tree = files.map(f => f.path).sort().join("\n");
  let s = `\n\n=== CONTEXTE DU PROJET CONNECTÉ ===\nSource : ${projectSourceLabel()}\nArborescence (${files.length} fichiers) :\n${tree}\n`;
  if (withContent) {
    let total = 0;
    s += `\nContenu des fichiers (tronqué au besoin) :\n`;
    for (const f of files) {
      if (f.content == null || total >= maxBytes) continue;
      const slice = f.content.slice(0, Math.max(0, maxBytes - total));
      s += `\n----- ${f.path} -----\n${slice}\n`;
      total += slice.length;
    }
  }
  s += `\n=== FIN CONTEXTE PROJET ===\n`;
  return s;
}

/* ================= CONNEXION SUPABASE ================= */
function setSbState(txt, ok) {
  const el = $("#sbState");
  if (el) { el.textContent = txt; el.classList.toggle("ok", !!ok); }
}
async function sbConnect() {
  const url = $("#sbUrl").value.trim().replace(/\/$/, "");
  const key = $("#sbKey").value.trim();
  if (!url || !key) { setSbState(t("sbRequired"), false); return; }
  setSbState(t("sbConnecting"), false);
  const btn = $("#sbConnect"); btn.disabled = true;
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    state.supabase = { url, key };
    state.connected.supabase = true;
    setSbState(t("connectedMark"), true);
    try { localStorage.setItem(LS_SB, JSON.stringify(state.supabase)); } catch (_) {}
    $$(`.conn-btn[data-service="supabase"]`).forEach(b => b.classList.add("connected"));
    syncCodexProjects();
  } catch (err) {
    setSbState(`✗ ${err.message}`, false);
    state.connected.supabase = false;
  } finally { btn.disabled = false; }
}
if ($("#sbConnect")) $("#sbConnect").onclick = sbConnect;

/* ================= BOUTON + (pièces jointes / micro / web) ================= */
const plusBtn = $("#plusBtn"), plusMenu = $("#plusMenu");
plusBtn.onclick = e => { e.stopPropagation(); plusMenu.classList.toggle("hidden"); plusBtn.classList.toggle("active", !plusMenu.classList.contains("hidden")); };
document.addEventListener("click", e => {
  if (!plusMenu.contains(e.target) && e.target !== plusBtn && !plusBtn.contains(e.target)) {
    plusMenu.classList.add("hidden"); plusBtn.classList.remove("active");
  }
});
function closePlus() { plusMenu.classList.add("hidden"); plusBtn.classList.remove("active"); }

$$(".plus-item").forEach(item => {
  item.onclick = () => {
    const act = item.dataset.act;
    if (act === "image") $("#fileImage").click();
    else if (act === "file") $("#fileAny").click();
    else if (act === "zip") $("#fileZip").click();
    else if (act === "image-gen") { toggleImageMode(true); closePlus(); return; }
    else if (act === "mic") startMic();
    else if (act === "web") toggleWebSearch(item);
    if (act !== "web") closePlus();
  };
});

function toggleWebSearch(item) {
  state.webSearch = !state.webSearch;
  item.classList.toggle("on", state.webSearch);
  renderAttachStrip();
  closePlus();
}

/* ---- Lecture des fichiers ---- */
function bytesLabel(n) {
  if (n < 1024) return n + " o";
  if (n < 1048576) return (n / 1024).toFixed(0) + " Ko";
  return (n / 1048576).toFixed(1) + " Mo";
}
const TEXT_EXT = ["txt","md","js","ts","tsx","jsx","py","sql","json","html","css","yml","yaml","csv","xml","sh","rs","go","java","c","cpp","env"];

async function compresserImage(file, maxDim = 1568, qualite = 0.85) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error("Lecture du fichier échouée"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Fichier image invalide"));
    i.src = dataUrl;
  });
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const jpegDataUrl = canvas.toDataURL("image/jpeg", qualite);
  return { base64: jpegDataUrl.split(",")[1], mediaType: "image/jpeg", dataUrl: jpegDataUrl };
}

function handleImageFiles(files) {
  [...files].forEach(f => {
    (async () => {
      try {
        let result = await compresserImage(f);
        if (result.base64.length > 4 * 1024 * 1024) {
          result = await compresserImage(f, 1024, 0.7);
        }
        attachments.push({ kind: "image", name: f.name, mediaType: result.mediaType, base64: result.base64, dataUrl: result.dataUrl, size: result.base64.length });
        renderAttachStrip();
      } catch (_) {}
    })();
  });
}
function handleAnyFiles(files) {
  [...files].forEach(f => {
    const ext = f.name.split(".").pop().toLowerCase();
    if (f.type.startsWith("image/")) { handleImageFiles([f]); return; }
    if (TEXT_EXT.includes(ext) && f.size < 200000) {
      const reader = new FileReader();
      reader.onload = () => {
        attachments.push({ kind: "text", name: f.name, text: reader.result, size: f.size });
        renderAttachStrip();
      };
      reader.readAsText(f);
    } else {
      attachments.push({ kind: "binary", name: f.name, size: f.size });
      renderAttachStrip();
    }
  });
}
async function handleZipFile(files) {
  for (const f of files) {
    try {
      const zip = await JSZip.loadAsync(f);
      const entries = [];
      let textContent = "";
      const paths = Object.keys(zip.files).filter(p => !zip.files[p].dir).sort();
      for (const path of paths) {
        const ext = path.split(".").pop().toLowerCase();
        const entry = { path, size: 0 };
        entries.push(entry);
        if (TEXT_EXT.includes(ext)) {
          try {
            const txt = await zip.files[path].async("string");
            entry.size = txt.length;
            if (textContent.length < 150000) {
              textContent += `\n--- ${path} ---\n${txt}\n`;
            }
          } catch (_) {}
        }
      }
      attachments.push({
        kind: "zip", name: f.name, size: f.size, entries, textContent,
        fileCount: paths.length
      });
      // aussi injecter dans le studioZipFiles pour le Studio
      studioZipFiles = entries.map(e => ({ path: e.path, content: null }));
      for (const path of paths) {
        const ext = path.split(".").pop().toLowerCase();
        if (TEXT_EXT.includes(ext)) {
          try {
            const txt = await zip.files[path].async("string");
            const item = studioZipFiles.find(z => z.path === path);
            if (item) item.content = txt;
          } catch (_) {}
        }
      }
      state.projectFiles = [];
      renderAttachStrip();
      refreshStudio();
    } catch (err) {
      attachments.push({ kind: "zip", name: f.name, size: f.size, entries: [], textContent: "" });
      renderAttachStrip();
    }
  }
}
$("#fileImage").onchange = e => { handleImageFiles(e.target.files); e.target.value = ""; };
$("#fileAny").onchange = e => { handleAnyFiles(e.target.files); e.target.value = ""; };
$("#fileZip").onchange = e => { handleZipFile(e.target.files); e.target.value = ""; };

function renderAttachStrip() {
  const strip = $("#attachStrip");
  if (!strip) return;
  let html = attachments.map((a, i) => {
    if (a.kind === "image") {
      return `<div class="attach-chip"><img src="${a.dataUrl}" alt=""><span class="a-name">${escapeHtml(a.name)}</span><button class="a-x" data-i="${i}">×</button></div>`;
    }
    const ico = a.kind === "zip" ? "🗜️" : a.kind === "text" ? "📄" : "📎";
    return `<div class="attach-chip"><span class="a-ico">${ico}</span><span class="a-name">${escapeHtml(a.name)} · ${bytesLabel(a.size || 0)}</span><button class="a-x" data-i="${i}">×</button></div>`;
  }).join("");
  if (state.webSearch) {
    html += `<span class="web-pill">🛠️ Recherche web <button class="a-x" data-web="1">×</button></span>`;
  }
  strip.innerHTML = html;
  $$(".attach-chip .a-x", strip).forEach(x => x.onclick = () => { attachments.splice(+x.dataset.i, 1); renderAttachStrip(); });
  const wx = strip.querySelector('.web-pill .a-x');
  if (wx) wx.onclick = () => { state.webSearch = false; $$(".plus-item[data-act=web]").forEach(b => b.classList.remove("on")); renderAttachStrip(); };
}

/* ---- Micro : dictée via Web Speech API ---- */
let recognition = null, listening = false;
function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert(t("alertVoice")); return; }
  if (listening) { recognition && recognition.stop(); return; }
  recognition = new SR();
  recognition.lang = state.lang === "en" ? "en-CA" : "fr-CA";
  recognition.interimResults = true;
  recognition.continuous = false;
  const base = input.value;
  recognition.onstart = () => { listening = true; plusBtn.classList.add("listening"); };
  recognition.onend = () => { listening = false; plusBtn.classList.remove("listening"); };
  recognition.onerror = () => { listening = false; plusBtn.classList.remove("listening"); };
  recognition.onresult = e => {
    let txt = "";
    for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
    input.value = (base ? base + " " : "") + txt;
    input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px";
  };
  recognition.start();
}

/* ================= CHAT CONVERSATIONS ================= */
let chatConvs = JSON.parse(localStorage.getItem("tilex-chat-convs") || "[]");
let activeChatConv = -1;

function saveChatConv() {
  if (!state.history.length) return;
  const title = contentText(state.history[0]?.content).slice(0, 50) || t("untitled");
  if (activeChatConv >= 0) {
    chatConvs[activeChatConv] = { title, messages: [...state.history], ts: Date.now() };
  } else {
    chatConvs.unshift({ title, messages: [...state.history], ts: Date.now() });
    activeChatConv = 0;
  }
  if (chatConvs.length > 50) chatConvs.length = 50;
  try { localStorage.setItem("tilex-chat-convs", JSON.stringify(chatConvs)); } catch (_) {}
  renderChatConvs();
}

function renderChatConvs() {
  if (typeof renderChatConvsFiltered === "function") { renderChatConvsFiltered(); return; }
  const el = $("#chatConvos");
  if (!el) return;
  if (!chatConvs.length) { el.innerHTML = `<p class="muted" style="font-size:.75rem;padding:4px 0">${t("chatNone")}</p>`; return; }
  el.innerHTML = chatConvs.map((c, i) => {
    const age = c.ts ? timeAgo(c.ts) : "";
    return `<div class="chat-conv-item${i === activeChatConv ? ' active' : ''}" data-idx="${i}"><span class="conv-title">${escapeHtml(c.title)}</span>${age ? `<span class="conv-date">${age}</span>` : ""}<button class="conv-del" data-idx="${i}" title="${t("delete_")}">×</button></div>`;
  }).join("");
}

function resetChatWelcome() {
  const msgs = $("#messages");
  msgs.innerHTML = `<div class="welcome">
    <div class="welcome-video-wrap">
      <video class="welcome-video" autoplay muted playsinline loop>
        <source src="assets/intro.mp4" type="video/mp4">
      </video>
    </div>
    <h2>${t("welcomeTitle")} <span class="orange">ti-lex-AL v10</span></h2>
    <p>${t("welcomeSub")}</p>
  </div>`;
}

function rebuildChatFromHistory() {
  const msgs = $("#messages");
  msgs.innerHTML = "";
  state.history.forEach(m => {
    if (m.role === "user") {
      const imgs = Array.isArray(m.content)
        ? m.content.filter(b => b.type === "image").map(b => ({ kind: "image", name: "image", dataUrl: `data:${b.source.media_type};base64,${b.source.data}` }))
        : [];
      addUserMsg(contentText(m.content), imgs);
    } else {
      const body = buildAssistantMsg();
      if (body._msgWrap) body._msgWrap.classList.remove("responding");
      renderAssistant(body, m.content);
    }
  });
}

if ($("#newChatConv")) {
  $("#newChatConv").onclick = () => {
    activeChatConv = -1;
    state.history = [];
    resetChatWelcome();
    renderChatConvs();
  };
}

/* ================= CHAT SUB-NAV + CONVERSATION FLAGS ================= */
let chatSubFilter = "convos";

function getConvFlags(idx) {
  let flags = {};
  try { flags = JSON.parse(localStorage.getItem("tilex-conv-flags") || "{}"); } catch (_) {}
  return flags[idx] || {};
}
function setConvFlag(idx, key, val) {
  let flags = {};
  try { flags = JSON.parse(localStorage.getItem("tilex-conv-flags") || "{}"); } catch (_) {}
  if (!flags[idx]) flags[idx] = {};
  flags[idx][key] = val;
  try { localStorage.setItem("tilex-conv-flags", JSON.stringify(flags)); } catch (_) {}
}
function deleteConvFlags(idx) {
  let flags = {};
  try { flags = JSON.parse(localStorage.getItem("tilex-conv-flags") || "{}"); } catch (_) {}
  const newFlags = {};
  Object.keys(flags).forEach(k => {
    const ki = +k;
    if (ki === idx) return;
    newFlags[ki > idx ? ki - 1 : ki] = flags[k];
  });
  try { localStorage.setItem("tilex-conv-flags", JSON.stringify(newFlags)); } catch (_) {}
}

// Sub-nav spotlight animation
function initSubSpotlight() {
  $$(".sub-spotlight").forEach(el => {
    const word = el.dataset.word || el.textContent;
    el.innerHTML = word.split("").map((ch, i) =>
      `<span class="sub-letter" style="--si:${i}">${ch}</span>`
    ).join("");
  });

  function runSpotlight() {
    $$(".sub-spotlight").forEach(el => {
      const letters = $$(".sub-letter", el);
      letters.forEach((l, i) => {
        setTimeout(() => {
          l.classList.add("sub-lit");
          setTimeout(() => l.classList.remove("sub-lit"), 500);
        }, i * 180);
      });
    });
  }
  runSpotlight();
  setInterval(runSpotlight, 8000);
}

// Filter sidebar convos based on sub-nav
function renderChatConvsFiltered() {
  const el = $("#chatConvos");
  if (!el) return;
  if (!chatConvs.length) {
    el.innerHTML = `<p class="muted" style="font-size:.75rem;padding:4px 0">${t("chatNone")}</p>`;
    return;
  }

  const items = chatConvs.map((c, i) => ({ ...c, _idx: i, _flags: getConvFlags(i) }));
  let filtered = items;
  if (chatSubFilter === "favs") filtered = items.filter(c => c._flags.fav);
  else if (chatSubFilter === "projs") filtered = items.filter(c => c._flags.proj);

  if (!filtered.length) {
    const emptyMsg = chatSubFilter === "favs" ? t("convEmpty") + " ★" : chatSubFilter === "projs" ? t("convEmpty") + " 📁" : t("chatNone");
    el.innerHTML = `<p class="muted" style="font-size:.75rem;padding:4px 0">${emptyMsg}</p>`;
    return;
  }

  el.innerHTML = filtered.map(c => {
    const age = c.ts ? timeAgo(c.ts) : "";
    const f = c._flags;
    const cls = `chat-conv-item${c._idx === activeChatConv ? ' active' : ''}${f.fav ? ' conv-fav' : ''}${f.proj ? ' conv-proj' : ''}${f.pinned ? ' conv-pinned' : ''}`;
    const badges = (f.fav ? '<span class="conv-badge">★</span>' : '') + (f.proj ? '<span class="conv-badge">📁</span>' : '');
    return `<div class="${cls}" data-idx="${c._idx}"><span class="conv-title">${escapeHtml(c.title)}</span>${badges}${age ? `<span class="conv-date">${age}</span>` : ""}<button class="conv-del" data-idx="${c._idx}" title="${t("delete_")}">×</button></div>`;
  }).join("");

  $$(".chat-conv-item", el).forEach(item => {
    item.onclick = (e) => {
      if (e.target.classList.contains("conv-del")) return;
      const idx = +item.dataset.idx;
      activeChatConv = idx;
      state.history = [...chatConvs[idx].messages];
      rebuildChatFromHistory();
      renderChatConvsFiltered();
      updateConvDotsState();
    };
  });
  $$(".conv-del", el).forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.idx;
      chatConvs.splice(idx, 1);
      deleteConvFlags(idx);
      if (activeChatConv === idx) { activeChatConv = -1; state.history = []; resetChatWelcome(); }
      else if (activeChatConv > idx) activeChatConv--;
      try { localStorage.setItem("tilex-chat-convs", JSON.stringify(chatConvs)); } catch (_) {}
      renderChatConvsFiltered();
    };
  });
}

/* ---- Conversations center page ---- */
function renderConvosCenter(filter) {
  const list = $("#convosListCenter");
  if (!list) return;
  const search = ($("#convosSearch")?.value || "").toLowerCase();

  const activeFilter = filter || "all";
  $$(".convos-tab").forEach(t => t.classList.toggle("active", t.dataset.filter === activeFilter));

  let items = chatConvs.map((c, i) => ({ ...c, _idx: i, _flags: getConvFlags(i) }));
  if (activeFilter === "favs") items = items.filter(c => c._flags.fav);
  else if (activeFilter === "projs") items = items.filter(c => c._flags.proj);
  if (search) items = items.filter(c => c.title.toLowerCase().includes(search));

  if (!items.length) {
    list.innerHTML = '<p class="convos-empty">Aucune conversation trouvée.</p>';
    return;
  }

  list.innerHTML = items.map(c => {
    const age = c.ts ? timeAgo(c.ts) : "";
    const f = c._flags;
    const msgCount = c.msgs ? c.msgs.length : 0;
    const badges = (f.fav ? '<span class="convos-card-badge fav">★ Favori</span>' : '') +
                   (f.proj ? '<span class="convos-card-badge proj">📁 Projet</span>' : '');
    return `<div class="convos-card${c._idx === activeChatConv ? ' active' : ''}" data-idx="${c._idx}">
      <div class="convos-card-ico">💬</div>
      <div class="convos-card-info">
        <div class="convos-card-title">${escapeHtml(c.title)}</div>
        <div class="convos-card-meta"><span>${age}</span><span>${msgCount} msg</span></div>
      </div>
      <div class="convos-card-badges">${badges}</div>
      <button class="convos-card-del" data-idx="${c._idx}" title="Supprimer">🗑️</button>
    </div>`;
  }).join("");

  $$(".convos-card", list).forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest(".convos-card-del")) return;
      const idx = +card.dataset.idx;
      activeChatConv = idx;
      state.history = [...chatConvs[idx].messages];
      rebuildChatFromHistory();
      renderChatConvsFiltered();
      updateConvDotsState();
      switchView("chat");
      chatSubFilter = "convos";
      $$(".chat-sub-item").forEach(b => b.classList.toggle("active", b.dataset.sub === "convos"));
    };
  });
  $$(".convos-card-del", list).forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.idx;
      chatConvs.splice(idx, 1);
      deleteConvFlags(idx);
      if (activeChatConv === idx) { activeChatConv = -1; state.history = []; resetChatWelcome(); }
      else if (activeChatConv > idx) activeChatConv--;
      try { localStorage.setItem("tilex-chat-convs", JSON.stringify(chatConvs)); } catch (_) {}
      renderChatConvsFiltered();
      renderConvosCenter(document.querySelector(".convos-tab.active")?.dataset.filter);
    };
  });
}

if ($("#convosSearch")) {
  $("#convosSearch").oninput = () => {
    const activeTab = document.querySelector(".convos-tab.active");
    renderConvosCenter(activeTab?.dataset.filter);
  };
}
$$(".convos-tab").forEach(tab => {
  tab.onclick = () => renderConvosCenter(tab.dataset.filter);
});
function convosMascotWink() {
  const m = $("#convosMascot");
  if (!m) return;
  m.classList.add("winking");
  setTimeout(() => m.classList.remove("winking"), 600);
  setTimeout(() => {
    m.classList.add("winking");
    setTimeout(() => m.classList.remove("winking"), 400);
  }, 900);
}

// Auto-blink every 3-5 seconds
(function convosMascotAutoBlink() {
  function blink() {
    const m = $("#convosMascot");
    if (m && !m.classList.contains("winking")) {
      m.classList.add("winking");
      setTimeout(() => m.classList.remove("winking"), 180);
    }
    setTimeout(blink, Math.random() * 3000 + 3000);
  }
  setTimeout(blink, 2000);
})();

if ($("#convosMascot")) {
  $("#convosMascot").onclick = () => convosMascotWink();
}

if ($("#convosNewBtn")) {
  $("#convosNewBtn").onclick = () => {
    convosMascotWink();
    setTimeout(() => {
      activeChatConv = -1;
      state.history = [];
      resetChatWelcome();
      renderChatConvs();
      switchView("chat");
    }, 500);
  };
}

// Sub-nav tab clicks
$$(".chat-sub-item").forEach(btn => {
  btn.onclick = () => {
    chatSubFilter = btn.dataset.sub;
    $$(".chat-sub-item").forEach(b => b.classList.toggle("active", b.dataset.sub === chatSubFilter));
    if (chatSubFilter === "projs") {
      switchView("projects");
      renderProjectsList();
    } else if (chatSubFilter === "convos") {
      switchView("convos");
      renderConvosCenter();
    } else if (chatSubFilter === "favs") {
      switchView("convos");
      renderConvosCenter("favs");
    } else if (chatSubFilter === "cerveau") {
      switchView("cerveau");
    } else {
      switchView("chat");
      renderChatConvsFiltered();
    }
  };
});

// Open sub-nav on load if chat is active
setTimeout(() => {
  const subNav = $("#chatSubNav");
  if (subNav) subNav.classList.add("open");
  initSubSpotlight();
}, 300);

// 3-dot topbar menu
function updateConvDotsState() {
  if (activeChatConv < 0) return;
  const f = getConvFlags(activeChatConv);
  const dd = $("#convDotsDropdown");
  if (!dd) return;
  $$(".conv-dd-item", dd).forEach(item => {
    const act = item.dataset.act;
    const ico = item.querySelector(".conv-dd-ico");
    const txt = item.querySelector(".conv-dd-txt");
    if (act === "fav") {
      item.classList.toggle("conv-dd-active", !!f.fav);
      if (ico) ico.textContent = f.fav ? "★" : "☆";
      if (txt) txt.textContent = f.fav ? t("convFavRemove") : t("convFavAdd");
    } else if (act === "proj") {
      item.classList.toggle("conv-dd-proj-active", !!f.proj);
      if (txt) txt.textContent = f.proj ? t("convFromProject") : t("convToProject");
    } else if (act === "pin") {
      if (txt) txt.textContent = f.pinned ? t("convFavRemove").replace(/favori/i, "épingle") : "Épingler";
    } else if (act === "rename") {
      if (txt) txt.textContent = t("convRename");
    } else if (act === "save") {
      if (txt) txt.textContent = "Sauvegarder";
    } else if (act === "delete") {
      if (txt) txt.textContent = t("convDelete");
    }
  });
}

if ($("#convDotsBtn")) {
  $("#convDotsBtn").onclick = (e) => {
    e.stopPropagation();
    const dd = $("#convDotsDropdown");
    dd.classList.toggle("hidden");
    if (!dd.classList.contains("hidden")) updateConvDotsState();
  };
}

$$(".conv-dd-item").forEach(item => {
  item.onclick = (e) => {
    e.stopPropagation();
    const act = item.dataset.act;
    const dd = $("#convDotsDropdown");
    dd.classList.add("hidden");

    if (activeChatConv < 0 && act !== "delete") return;

    if (act === "fav") {
      const f = getConvFlags(activeChatConv);
      setConvFlag(activeChatConv, "fav", !f.fav);
      renderChatConvsFiltered();
    } else if (act === "proj") {
      const f = getConvFlags(activeChatConv);
      setConvFlag(activeChatConv, "proj", !f.proj);
      renderChatConvsFiltered();
    } else if (act === "pin") {
      const f = getConvFlags(activeChatConv);
      setConvFlag(activeChatConv, "pinned", !f.pinned);
      renderChatConvsFiltered();
    } else if (act === "rename") {
      const cur = chatConvs[activeChatConv]?.title || "";
      const newName = prompt(t("convRenamePrompt"), cur);
      if (newName && newName.trim()) {
        chatConvs[activeChatConv].title = newName.trim();
        try { localStorage.setItem("tilex-chat-convs", JSON.stringify(chatConvs)); } catch (_) {}
        renderChatConvsFiltered();
      }
    } else if (act === "save") {
      if (activeChatConv >= 0) {
        const conv = chatConvs[activeChatConv];
        const blob = new Blob([JSON.stringify(conv, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (conv.title || "conversation").replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } else if (act === "delete") {
      if (activeChatConv < 0) return;
      const idx = activeChatConv;
      chatConvs.splice(idx, 1);
      deleteConvFlags(idx);
      activeChatConv = -1;
      state.history = [];
      resetChatWelcome();
      try { localStorage.setItem("tilex-chat-convs", JSON.stringify(chatConvs)); } catch (_) {}
      renderChatConvsFiltered();
    }
  };
});

document.addEventListener("click", () => {
  const dd = $("#convDotsDropdown");
  if (dd && !dd.classList.contains("hidden")) dd.classList.add("hidden");
});

/* ================= PROJETS ================= */
const PROJ_LS_KEY = "tilex-projects";
let projects = [];
let activeProjectId = null;

function loadProjects() {
  try { projects = JSON.parse(localStorage.getItem(PROJ_LS_KEY) || "[]"); } catch (_) { projects = []; }
}
function saveProjects() {
  try { localStorage.setItem(PROJ_LS_KEY, JSON.stringify(projects)); } catch (_) {}
}
loadProjects();

function createProject(name) {
  const proj = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name || t("convNewChat"),
    memo: "",
    instructions: "",
    files: [],
    conversations: [],
    fav: false,
    ts: Date.now()
  };
  projects.unshift(proj);
  saveProjects();
  return proj;
}

function renderProjectsList(query) {
  const container = $("#projItems");
  if (!container) return;
  const q = (query || "").toLowerCase();
  const filtered = q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects;

  if (!filtered.length) {
    container.innerHTML = `<p class="muted" style="font-size:.82rem;padding:16px 0;text-align:center;color:#555">${q ? t("convEmpty") : t("convEmptySub")}</p>`;
    return;
  }

  container.innerHTML = filtered.map(p => {
    const age = p.ts ? timeAgo(p.ts) : "";
    return `<div class="proj-card" data-id="${p.id}">
      <div>
        <div class="proj-card-name">${escapeHtml(p.name)}${p.fav ? ' <span class="proj-star">★</span>' : ''}</div>
        <div class="proj-card-date">${t("convProj")} · ${age ? age : ""}</div>
      </div>
    </div>`;
  }).join("");

  $$(".proj-card", container).forEach(card => {
    card.onclick = () => openProjectDetail(card.dataset.id);
  });
}

function openProjectDetail(id) {
  const proj = projects.find(p => p.id === id);
  if (!proj) return;
  activeProjectId = id;

  $("#projListPage").classList.add("hidden");
  $("#projDetailPage").classList.remove("hidden");
  $("#projDetailName").textContent = proj.name;
  $("#projMemoInput").value = proj.memo || "";
  $("#projInstructions").value = proj.instructions || "";

  renderProjectFiles(proj);
  renderProjectConvs(proj);
}

function closeProjectDetail() {
  saveCurrentProject();
  activeProjectId = null;
  $("#projDetailPage").classList.add("hidden");
  $("#projListPage").classList.remove("hidden");
  renderProjectsList();
}

function saveCurrentProject() {
  if (!activeProjectId) return;
  const proj = projects.find(p => p.id === activeProjectId);
  if (!proj) return;
  const memoEl = $("#projMemoInput");
  const instrEl = $("#projInstructions");
  if (memoEl) proj.memo = memoEl.value;
  if (instrEl) proj.instructions = instrEl.value;
  proj.ts = Date.now();
  saveProjects();
}

function renderProjectFiles(proj) {
  const list = $("#projFilesList");
  if (!list) return;
  if (!proj.files.length) {
    list.innerHTML = `<p class="muted" style="font-size:.72rem;color:#555">0 fichier</p>`;
    return;
  }
  list.innerHTML = proj.files.map((f, i) => `
    <div class="proj-file-item">
      <span class="proj-file-name">📄 ${escapeHtml(f.name)}</span>
      <span style="color:#555;font-size:.65rem">${(f.size / 1024).toFixed(1)} KB</span>
      <button class="proj-file-del" data-idx="${i}" title="${t("convDelete")}">×</button>
    </div>
  `).join("");
  list.innerHTML = `<p style="font-size:.72rem;color:#666;margin:0">${proj.files.length} fichier${proj.files.length > 1 ? 's' : ''}</p>` + list.innerHTML;

  $$(".proj-file-del", list).forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      proj.files.splice(+btn.dataset.idx, 1);
      saveProjects();
      renderProjectFiles(proj);
    };
  });
}

function renderProjectConvs(proj) {
  const list = $("#projConvsList");
  if (!list) return;

  const projConvIdxs = [];
  chatConvs.forEach((c, i) => {
    const f = getConvFlags(i);
    if (f.projectId === proj.id) projConvIdxs.push(i);
  });

  if (!projConvIdxs.length) {
    list.innerHTML = `<p class="muted" style="font-size:.78rem;color:#555;padding:8px 0">${t("convEmpty")}</p>`;
    return;
  }

  list.innerHTML = projConvIdxs.map(i => {
    const c = chatConvs[i];
    const age = c.ts ? timeAgo(c.ts) : "";
    const f = getConvFlags(i);
    return `<div class="proj-conv-card" data-idx="${i}">
      <div class="proj-conv-card-title">${escapeHtml(c.title)}${f.fav ? '<span class="proj-star">★</span>' : ''}</div>
      <div class="proj-conv-card-date">${age}</div>
    </div>`;
  }).join("");

  $$(".proj-conv-card", list).forEach(card => {
    card.onclick = () => {
      const idx = +card.dataset.idx;
      activeChatConv = idx;
      state.history = [...chatConvs[idx].messages];
      rebuildChatFromHistory();
      renderChatConvs();
      switchView("chat");
    };
  });
}

// Event handlers
if ($("#projBackBtn")) $("#projBackBtn").onclick = closeProjectDetail;

function projWink(sel) {
  const mascot = $(sel || "#projFabMascot");
  if (!mascot) return;
  mascot.classList.add("winking");
  setTimeout(() => mascot.classList.remove("winking"), 600);
  setTimeout(() => {
    mascot.classList.add("winking");
    setTimeout(() => mascot.classList.remove("winking"), 400);
  }, 900);
}

if ($("#projNewBtn")) {
  $("#projNewBtn").onclick = () => {
    projWink();
    setTimeout(() => {
      const name = prompt(t("convRenamePrompt").replace("conversation", "projet"), "");
      if (name && name.trim()) {
        createProject(name.trim());
        renderProjectsList();
      }
    }, 500);
  };
}

if ($("#projFabMascot")) {
  $("#projFabMascot").onclick = () => projWink();
}

if ($("#projSearch")) {
  $("#projSearch").oninput = () => renderProjectsList($("#projSearch").value);
}

if ($("#projDetailDots")) {
  $("#projDetailDots").onclick = (e) => {
    e.stopPropagation();
    const menu = $("#projDetailMenu");
    menu.classList.toggle("hidden");
  };
}

$$(".proj-dm-item").forEach(item => {
  item.onclick = (e) => {
    e.stopPropagation();
    $("#projDetailMenu").classList.add("hidden");
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;
    const act = item.dataset.act;
    if (act === "rename") {
      const newName = prompt(t("convRenamePrompt"), proj.name);
      if (newName && newName.trim()) {
        proj.name = newName.trim();
        saveProjects();
        $("#projDetailName").textContent = proj.name;
      }
    } else if (act === "fav") {
      proj.fav = !proj.fav;
      saveProjects();
    } else if (act === "delete") {
      projects = projects.filter(p => p.id !== activeProjectId);
      saveProjects();
      closeProjectDetail();
    }
  };
});

if ($("#projUploadBtn")) {
  $("#projUploadBtn").onclick = () => $("#projFileInput").click();
}
if ($("#projFileInput")) {
  $("#projFileInput").onchange = (e) => {
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;
    Array.from(e.target.files).forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        proj.files.push({ name: f.name, size: f.size, data: reader.result, ts: Date.now() });
        saveProjects();
        renderProjectFiles(proj);
      };
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  };
}

if ($("#projConvMascot")) {
  $("#projConvMascot").onclick = () => projWink("#projConvMascot");
}

if ($("#projNewConvBtn")) {
  $("#projNewConvBtn").onclick = () => {
    projWink("#projConvMascot");
    setTimeout(() => {
      activeChatConv = -1;
      state.history = [];
      resetChatWelcome();
      if (activeProjectId) {
        chatConvs.unshift({ title: t("convNewChat"), messages: [], ts: Date.now() });
        activeChatConv = 0;
        try { localStorage.setItem("tilex-chat-convs", JSON.stringify(chatConvs)); } catch (_) {}
        setConvFlag(0, "proj", true);
        setConvFlag(0, "projectId", activeProjectId);
      }
      renderChatConvs();
      switchView("chat");
    }, 500);
  };
}

// Auto-save memo/instructions on blur
if ($("#projMemoInput")) $("#projMemoInput").onblur = saveCurrentProject;
if ($("#projInstructions")) $("#projInstructions").onblur = saveCurrentProject;

document.addEventListener("click", () => {
  const m = $("#projDetailMenu");
  if (m && !m.classList.contains("hidden")) m.classList.add("hidden");
});

/* ================= CHAT ================= */
const input = $("#input");
const messages = $("#messages");

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
});
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
$("#send").onclick = sendMessage;
var _cancelBtn = $("#chatCancelBtn");
if (_cancelBtn) _cancelBtn.onclick = function() {
  if (_chatAbort) _chatAbort.abort();
};
$$(".sug").forEach(s => s.onclick = () => { input.value = s.textContent; sendMessage(); });

var _saveConvoBtn = $("#saveConvoBtn");
if (_saveConvoBtn) _saveConvoBtn.onclick = function() {
  if (!state.history || state.history.length < 2) return;
  var session = null;
  try {
    var raw = localStorage.getItem("sb-rnuripmfozlxenryxhdc-auth-token");
    if (raw) session = JSON.parse(raw);
  } catch(e) {}
  if (!session || !session.user) { alert("Connecte-toi pour sauvegarder."); return; }
  var content = state.history.map(function(m) {
    var txt = typeof m.content === "string" ? m.content : (m.content[0]?.text || "");
    return m.role === "user" ? "**Moi :** " + txt : "**Agent AL :** " + txt;
  }).join("\n\n---\n\n");
  var firstUser = state.history.find(function(m) { return m.role === "user"; });
  var firstTxt = typeof firstUser?.content === "string" ? firstUser.content : (firstUser?.content?.[0]?.text || "Conversation");
  var title = "💬 " + firstTxt.slice(0, 45) + (firstTxt.length > 45 ? "..." : "");
  _saveConvoBtn.disabled = true;
  _saveConvoBtn.textContent = "⏳";
  fetch("https://rnuripmfozlxenryxhdc.supabase.co/rest/v1/cerveau_notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": proxyToken(),
      "Authorization": "Bearer " + session.access_token,
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      user_id: session.user.id,
      title: title,
      content: content,
      tags: ["agent-al", "conversation-complète"]
    })
  }).then(function(res) {
    if (res.ok) {
      _saveConvoBtn.textContent = "✓";
      _saveConvoBtn.classList.add("saved");
      setTimeout(function() { _saveConvoBtn.textContent = "🧠"; _saveConvoBtn.classList.remove("saved"); _saveConvoBtn.disabled = false; }, 3000);
    } else {
      _saveConvoBtn.textContent = "🧠";
      _saveConvoBtn.disabled = false;
      alert("Erreur sauvegarde: " + res.status);
    }
  }).catch(function() { _saveConvoBtn.textContent = "🧠"; _saveConvoBtn.disabled = false; });
};

function avatarUser() {
  const av = createAvatarIA(42);
  av.classList.add("avatar-ia--user");
  av.dataset.state = "idle";
  return av;
}
const CLAUDE_LOGO = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Claude_AI_logo.svg/40px-Claude_AI_logo.svg.png";

/* ---- ti-lex Avatar (personnage principal) ---- */
function createTiLexAvatar(size = 80) {
  const scale = size / 80;
  const wrap = document.createElement("div");
  wrap.className = "ti-lex-avatar";
  wrap.dataset.state = "idle";
  wrap.style.width = size + "px";
  wrap.style.height = size + "px";
  if (scale !== 1) { wrap.style.transform = `scale(${scale})`; wrap.style.transformOrigin = "center center"; }
  wrap.innerHTML = `
    <div class="ti-lex-body">
      <div class="ti-lex-eyes">
        <div class="ti-lex-eye"></div>
        <div class="ti-lex-eye"></div>
      </div>
    </div>
    <div class="ti-lex-dots">
      <div class="ti-lex-dot"></div>
      <div class="ti-lex-dot"></div>
      <div class="ti-lex-dot"></div>
    </div>`;

  wrap._setState = (s) => {
    wrap.dataset.state = s;
    const body = wrap.querySelector(".ti-lex-body");
    if (body) body.classList.toggle("glow", s === "responding" || s === "waiting");
  };
  wrap._setThinking = (on) => wrap._setState(on ? "waiting" : "idle");
  wrap._setSpeaking = (on) => wrap._setState(on ? "responding" : "idle");
  wrap._destroy = () => {};

  return wrap;
}

function createAvatarIA(size) {
  const av = document.createElement("div");
  av.className = "avatar-ia";
  av.dataset.state = "idle";
  if (size) { av.style.width = size + "px"; av.style.height = size + "px"; }
  av.innerHTML = `
    <div class="avatar-ia__ring"></div>
    <div class="avatar-ia__circle"></div>
    <div class="avatar-ia__eyes">
      <div class="avatar-ia__eye"><div class="avatar-ia__pupil"></div></div>
      <div class="avatar-ia__eye"><div class="avatar-ia__pupil"></div></div>
    </div>
    <div class="avatar-ia__dots">
      <div class="avatar-ia__dot"></div>
      <div class="avatar-ia__dot"></div>
      <div class="avatar-ia__dot"></div>
    </div>`;

  let blinkTimer;
  function autoBlink() {
    blinkTimer = setTimeout(() => {
      av.querySelectorAll(".avatar-ia__eye").forEach(e => {
        e.classList.add("av-blink");
        setTimeout(() => e.classList.remove("av-blink"), 180);
      });
      autoBlink();
    }, Math.random() * 3000 + 3000);
  }
  autoBlink();

  let partTimer = setInterval(() => {
    const p = document.createElement("div");
    p.className = "avatar-ia__particle";
    p.style.left = (Math.random() * 70 + 15) + "%";
    p.style.bottom = "30%";
    av.appendChild(p);
    setTimeout(() => p.remove(), 3000);
  }, 2500);

  av._setState = (s) => { av.dataset.state = s; };
  av._setThinking = (on) => av._setState(on ? "thinking" : "idle");
  av._setSpeaking = (on) => av._setState(on ? "responding" : "idle");
  av._destroy = () => { clearTimeout(blinkTimer); clearInterval(partTimer); };
  return av;
}

function avatarAL() {
  const wrap = document.createElement("div");
  wrap.className = "msg-avatar-wrap";
  const vid = document.createElement("video");
  vid.className = "msg-avatar-vid";
  vid.src = "assets/avatar-ia.mp4";
  vid.autoplay = true;
  vid.loop = true;
  vid.muted = true;
  vid.playsInline = true;
  vid.setAttribute("playsinline", "");
  wrap.appendChild(vid);
  const claude = document.createElement("img");
  claude.className = "claude-badge"; claude.src = CLAUDE_LOGO; claude.alt = "Claude";
  wrap.appendChild(claude);
  const lbl = document.createElement("div");
  lbl.className = "claude-label";
  lbl.innerHTML = `<img src="${CLAUDE_LOGO}" alt="">Claude`;
  wrap.appendChild(lbl);
  return wrap;
}

function addUserMsg(text, atts) {
  $(".welcome")?.remove();
  const m = document.createElement("div");
  m.className = "msg user";
  m.appendChild(avatarUser());
  const b = document.createElement("div");
  b.className = "msg-body";
  let html = "";
  if (atts && atts.length) {
    html += '<div class="attach-strip" style="margin:0 0 8px">' + atts.map(a => {
      if (a.kind === "image") return `<div class="attach-chip"><img src="${a.dataUrl}" alt=""><span class="a-name">${escapeHtml(a.name)}</span></div>`;
      if (a.kind === "zip" && a.entries && a.entries.length) {
        return `<div class="attach-chip" style="max-width:100%;flex-direction:column;align-items:flex-start">
          <div style="display:flex;align-items:center;gap:6px"><span class="a-ico">🗜️</span><span class="a-name">${escapeHtml(a.name)} · ${a.entries.length} ${t("files")}</span></div>
          <div class="zip-tree">${a.entries.slice(0, 50).map(e => `<div class="zip-tree-item"><span class="f-ico">${fileIcon(e.path)}</span>${escapeHtml(e.path)}</div>`).join("")}${a.entries.length > 50 ? `<div class="zip-tree-item muted">…${t("andMore").replace("%n", a.entries.length - 50)}</div>` : ""}</div>
        </div>`;
      }
      const ico = a.kind === "zip" ? "🗜️" : a.kind === "text" ? "📄" : "📎";
      return `<div class="attach-chip"><span class="a-ico">${ico}</span><span class="a-name">${escapeHtml(a.name)}</span></div>`;
    }).join("") + "</div>";
  }
  html += `<span>${escapeHtml(text).replace(/\n/g, "<br>")}</span>`;
  b.innerHTML = html;
  m.appendChild(b);
  messages.appendChild(m);
  messages.scrollTop = messages.scrollHeight;
}

/* extrait le texte affichable d'un contenu (string ou tableau de blocs) */
function contentText(c) {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter(b => b.type === "text").map(b => b.text).join(" ");
  return "";
}

/* strip images from older history entries to prevent payload bloat */
function stripOldImagesFromHistory() {
  for (let i = 0; i < state.history.length - 2; i++) {
    const m = state.history[i];
    if (Array.isArray(m.content)) {
      const hasImage = m.content.some(b => b.type === "image");
      if (hasImage) {
        const texts = m.content.filter(b => b.type === "text").map(b => b.text).join(" ");
        const imgCount = m.content.filter(b => b.type === "image").length;
        m.content = [{ type: "text", text: (texts + ` [${imgCount} image(s) précédemment]`).trim() }];
      }
    }
  }
}

/* construit le contenu API : texte + images (vision) + fichiers texte inline */
function buildUserContent(text, atts) {
  if (!atts || !atts.length) return text;
  const blocks = [];
  let extra = "";
  atts.forEach(a => {
    if (a.kind === "image") {
      blocks.push({ type: "image", source: { type: "base64", media_type: a.mediaType, data: a.base64 } });
    } else if (a.kind === "text") {
      extra += `\n\n--- Fichier joint : ${a.name} ---\n${a.text}\n--- fin ${a.name} ---`;
    } else if (a.kind === "zip" && a.textContent) {
      extra += `\n\n--- ZIP : ${a.name} (${a.fileCount || 0} fichiers) ---`;
      extra += `\nFichiers: ${(a.entries || []).map(e => e.path).join(", ")}`;
      extra += a.textContent;
      extra += `\n--- fin ZIP ${a.name} ---`;
    } else {
      extra += `\n\n[Fichier joint : ${a.name} (${a.kind}, ${bytesLabel(a.size || 0)}) — contenu binaire non lu]`;
    }
  });
  blocks.unshift({ type: "text", text: (text || "Analyse les pièces jointes.") + extra });
  return blocks;
}

/* détecte les services mentionnés et renvoie les tags HTML logos */
function serviceTags(text) {
  const low = text.toLowerCase();
  const hits = [];
  for (const [svc, kws] of Object.entries(TRIGGERS)) {
    if (svc === "anthropic") continue; // l'agent EST anthropic, pas besoin de tag
    if (kws.some(k => low.includes(k))) hits.push(svc);
  }
  if (!hits.length) return "";
  return hits.map(s => `<span class="service-tag">${SERVICE[s].svg}${SERVICE[s].name}<span class="ok">${t("serviceConnected")}</span></span>`).join("");
}

/* ---- Mode Réflexion (animation pensée) ---- */
const REFLEXION_ETAPES = [
  { service: "supabase", texte: "Connexion à Supabase — lecture de tes notes", duree: 1800 },
  { service: "google", texte: "Recherche Google en cours", duree: 1600, needs: /\b(cherche|recherche|google|web|internet|actualit|news|récent|dernier|2026|trouve)\b/i },
  { service: "github", texte: "Analyse du dépôt GitHub", duree: 1400, needs: /\b(github|dépôt|repo|commit|pull request|code source|git)\b/i },
  { service: "anthropic", texte: "Agent AL réfléchit", duree: 2200 },
  { service: "anthropic", texte: "Rédaction de la réponse", duree: Infinity },
];

function buildReflexionHTML(etape, faites, steps) {
  steps = steps || REFLEXION_ETAPES;
  const svc = SERVICE[steps[etape].service] || SERVICE.anthropic;
  const color = ({ anthropic: "#ff6600", supabase: "#3ecf8e", github: "#e5e7eb", google: "#4285f4" })[steps[etape].service] || "#ff6600";
  let badgesHtml = "";
  if (faites.length) {
    badgesHtml = '<div class="reflexion-done">' + faites.map(f => {
      const s = SERVICE[f.service] || SERVICE.anthropic;
      return `<span class="reflexion-badge">${s.svg}${f.texte}<span class="rfx-ok">✓</span></span>`;
    }).join("") + "</div>";
  }
  return `<div class="reflexion-wrap">${badgesHtml}<div class="reflexion-active"><div class="reflexion-logo-wrap" style="--rfx-color:${color}">${svc.svg}<span class="reflexion-ring" style="--rfx-color:${color}"></span></div><span class="reflexion-text">${steps[etape].texte}<span class="reflexion-dots" style="--rfx-color:${color}"><span></span><span></span><span></span></span></span></div></div>`;
}

function startReflexion(body, question) {
  var steps = REFLEXION_ETAPES.filter(function(s) { return !s.needs || (question && s.needs.test(question)); });
  let etape = 0;
  const faites = [];
  body._rfxSteps = steps;
  body.innerHTML = buildReflexionHTML(etape, faites, steps);
  const timers = [];
  function next() {
    if (etape >= steps.length - 1) return;
    const dur = steps[etape].duree;
    if (dur === Infinity) return;
    timers.push(setTimeout(() => {
      faites.push(steps[etape]);
      etape++;
      body.innerHTML = buildReflexionHTML(etape, faites, steps);
      next();
    }, dur));
  }
  next();
  body._stopReflexion = () => timers.forEach(clearTimeout);
}

function buildAssistantMsg(question) {
  const m = document.createElement("div");
  m.className = "msg assistant responding";
  const avatarWrap = avatarAL();
  m.appendChild(avatarWrap);
  const av = avatarWrap._avatarIA || avatarWrap.querySelector(".ti-lex-avatar") || avatarWrap.querySelector(".al-avatar");
  if (av && av._setThinking) av._setThinking(true);
  const b = document.createElement("div");
  b.className = "msg-body";
  m.appendChild(b);
  messages.appendChild(m);
  messages.scrollTop = messages.scrollHeight;
  b._msgWrap = m;
  b._avatar = av;
  startReflexion(b, question);
  return b;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text && !attachments.length) return;

  if (state.imageMode && text) {
    input.value = ""; input.style.height = "auto";
    toggleImageMode(false);
    generateImage(text);
    return;
  }

  // snapshot des pièces jointes + recherche web, puis on vide le composer
  const atts = attachments.slice();
  lastAttachedImages = atts.filter(a => a.kind === "image");
  const useWeb = state.webSearch;
  addUserMsg(text, atts);
  input.value = ""; input.style.height = "auto";
  attachments = []; renderAttachStrip();

  const body = buildAssistantMsg(text);

  if (!AI_PROXY) {
    if (body._stopReflexion) body._stopReflexion();
    renderAssistant(body, `⚙ ${t("proxyNotConfigured")}`);
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  // construit le contenu (texte + images + fichiers texte)
  const apiContent = buildUserContent(text, atts);
  state.history.push({ role: "user", content: apiContent });
  $("#send").disabled = true;
  var cancelBtn = $("#chatCancelBtn");
  if (cancelBtn) cancelBtn.classList.remove("hidden");

  try {
    const DIAGRAM_HINT = " Quand c'est pertinent pour mieux expliquer (architecture, flux, relations, processus, comparaisons), utilise des diagrammes Mermaid dans des blocs ```mermaid. Types utiles : flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap, timeline.";
    const MEMORY_HINT = " Si l'utilisateur te demande de retenir quelque chose, inclus la balise [mémoire: fait à retenir] dans ta réponse pour que je le sauvegarde.";
    const STUDIO_HINT = lastAttachedImages.length
      ? ` L'utilisateur a joint ${lastAttachedImages.length} image(s). Quand tu génères du HTML avec ces images, utilise {{IMAGE}} pour la première image (ou {{IMAGE_0}}, {{IMAGE_1}}… pour plusieurs). Le Studio remplacera automatiquement ces placeholders par les images réelles en base64. Génère un fichier HTML complet (<!DOCTYPE html>…) dans un bloc \`\`\`html pour qu'il soit prévisualisable dans le Studio.`
      : "";
    const BASE_BRAIN = AGENTS[state.agent].prompt + DIAGRAM_HINT + MEMORY_HINT + STUDIO_HINT + memoryContext() + recentConversationsContext();
    let sys = state.reflexion
      ? BASE_BRAIN + " Avant ta réponse finale, fournis un raisonnement structuré entre les balises <reflexion></reflexion>, puis la réponse complète après."
      : BASE_BRAIN;
    if (state.connected.supabase && state.supabase.url)
      sys += `\n\nSupabase connecté : projet ${state.supabase.url}.`;

    // Injecte le contexte du projet connecté (le rend "intelligent" sur le vrai code)
    if ((state.connected.github && state.github.repo) || studioZipFiles.length) {
      try { await loadProjectFiles(); } catch (_) {}
      sys += projectContextString({ maxBytes: 60000 });
    }

    const agentCfg = AGENTS[state.agent] || {};
    const reqBody = {
      model: state.model,
      max_tokens: agentCfg.max_tokens || 4096,
      system: sys,
      stream: true,
      messages: state.history,
    };
    if (useWeb) reqBody.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];

    const res = await chatFetch(reqBody);
    if (!res.ok) throw new Error(await apiError(res));
    if (body._stopReflexion) body._stopReflexion();
    if (body._avatar) { body._avatar._setThinking(false); body._avatar._setSpeaking(true); }
    body.classList.add("streaming");
    const typer = makeTyper(partial => {
      renderAssistant(body, partial, true);
      messages.scrollTop = messages.scrollHeight;
    });
    const full = await streamText(res, chunk => typer.push(chunk));
    await new Promise(resolve => typer.finish(resolve));
    body.classList.remove("streaming");
    if (body._avatar) body._avatar._setSpeaking(false);
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    renderAssistant(body, full);
    state.history.push({ role: "assistant", content: full });
    stripOldImagesFromHistory();
    extractMemoryFromResponse(full);
    saveChatConv();
    if (_saveConvoBtn && state.history.length >= 2) _saveConvoBtn.classList.remove("hidden");
  } catch (err) {
    state.history.pop();
    if (body._stopReflexion) body._stopReflexion();
    if (body._avatar) { body._avatar._setThinking(false); body._avatar._setSpeaking(false); }
    body.innerHTML = `<p class="muted">${t("apiError")} ${escapeHtml(err.message || "API")}.</p>`;
  } finally {
    $("#send").disabled = false;
    if (cancelBtn) cancelBtn.classList.add("hidden");
    _chatAbort = null;
    messages.scrollTop = messages.scrollHeight;
  }
}

/* ---- Mermaid init ---- */
if (typeof mermaid !== "undefined") {
  mermaid.initialize({ startOnLoad: false, theme: "dark", themeVariables: {
    primaryColor: "#ff6600", primaryTextColor: "#f5f5f5", primaryBorderColor: "#ff6600",
    lineColor: "#a3a3a3", secondaryColor: "#171717", tertiaryColor: "#262626",
    fontFamily: "'Sora',system-ui,sans-serif", fontSize: "13px",
    noteBkgColor: "#1a1a1a", noteTextColor: "#f5f5f5", noteBorderColor: "#ff6600",
  }});
}
let mermaidCounter = 0;

function renderMermaidBlocks(container) {
  const placeholders = container.querySelectorAll(".mermaid-pending");
  if (!placeholders.length || typeof mermaid === "undefined") return;
  placeholders.forEach(async (el) => {
    const code = el.getAttribute("data-mermaid");
    if (!code) return;
    const id = "mmd-" + (++mermaidCounter);
    try {
      const { svg } = await mermaid.render(id, code);
      el.innerHTML = `<div class="mermaid-label"><svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/><path d="M3 9h18M9 3v18"/></svg>${t("diagram")}</div>${svg}`;
      el.classList.remove("mermaid-pending");
    } catch (_) {
      el.innerHTML = `<pre style="color:var(--txt-dim);font-size:.8rem">${escapeHtml(code)}</pre>`;
      el.classList.remove("mermaid-pending");
    }
  });
}

function renderAssistant(body, full, streaming) {
  if (streaming) full = full.replace(/<[^>]*$/, "");
  let reflex = "", answer = full;
  const closed = full.match(/<reflexion>([\s\S]*?)<\/reflexion>/i);
  if (closed) {
    reflex = closed[1].trim();
    answer = full.replace(closed[0], "").trim();
  } else {
    const open = full.match(/<reflexion>([\s\S]*)$/i);
    if (open) { reflex = open[1].trim(); answer = ""; }
  }

  let html = "";
  if (state.reflexion && reflex) {
    html += `<div class="reflex-block"><div class="reflex-tag">
      <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2">
      <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zM9 21h6"/></svg>
      Réflexion</div>${escapeHtml(reflex).replace(/\n/g, "<br>")}</div>`;
  }

  let ans = escapeHtml(answer);
  // Detect ```mermaid blocks and turn them into renderable placeholders
  ans = ans.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    const decoded = code.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
    return `<div class="mermaid-wrap mermaid-pending" data-mermaid="${escapeHtml(decoded)}"><div class="typing"><span></span><span></span><span></span></div></div>`;
  });
  // Other code blocks — with filename detection & macOS dots
  ans = ans.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    var filename = "";
    var displayCode = code;
    var firstLine = code.split("\n")[0];
    var fnMatch = firstLine.match(/^(?:\/\/|#|--)\s*([^\s].*\.(jsx?|tsx?|css|scss|sql|py|sh|json|md|ya?ml|toml|env|html))$/i);
    if (fnMatch) {
      filename = fnMatch[1];
      displayCode = code.slice(firstLine.length).replace(/^\n/, "");
    } else if (lang) {
      var defaultNames = {jsx:"Component.jsx",tsx:"Component.tsx",js:"script.js",ts:"index.ts",css:"styles.css",scss:"styles.scss",html:"index.html",sql:"migration.sql",py:"script.py",python:"script.py",bash:"terminal.sh",sh:"script.sh",json:"config.json",yaml:"config.yaml",yml:"config.yml"};
      filename = defaultNames[lang.toLowerCase()] || "";
    }
    var langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    var fnLabel = filename ? `<span class="code-filename">${filename}</span>` : '';
    var dots = '<span class="code-dots"><span style="background:#ef4444"></span><span style="background:#f59e0b"></span><span style="background:#22d3ee"></span></span>';
    return `<div class="chat-code-wrap"><div class="chat-code-head">${dots}${fnLabel}${langLabel}<button class="code-copy-btn" onclick="copyCodeBlock(this)" title="${t("copyTitle")}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> ${t("copy")}</button></div><pre class="chat-code-block">${highlightSyntax(displayCode)}</pre></div>`;
  });
  ans = ans.replace(/\n/g, "<br>").replace(/`([^`]+)`/g, (_, c) => `<code>${highlightSyntax(c)}</code>`);

  const caret = streaming ? '<span class="caret"></span>' : '';
  html += `<div>${ans}${caret}</div>`;
  if (!streaming) html += serviceTags(answer);
  body.innerHTML = html;
  if (!streaming) {
    if (answer) addCodeActions(body, full);
    if (answer) cdxTryReflection(body, full);
    addPreviewButton(body, full);
    renderMermaidBlocks(body);
    addTTSButton(body, answer);
    addSaveToCerveauBtn(body, answer);
  }
}

/* ---- Copy code block ---- */
function copyCodeBlock(btn) {
  const wrap = btn.closest(".chat-code-wrap");
  const pre = wrap?.querySelector("pre");
  if (!pre) return;
  const text = pre.textContent;
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
  });
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> ${t("copied")}`;
  btn.classList.add("code-copied");
  setTimeout(() => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> ${t("copy")}`;
    btn.classList.remove("code-copied");
  }, 2000);
}

/* ---- Text-to-Speech ---- */
function getTTSVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find(v => v.lang === "fr-CA") ||
    voices.find(v => v.lang.startsWith("fr") && v.name.toLowerCase().includes("google")) ||
    voices.find(v => v.lang.startsWith("fr")) ||
    voices.find(v => v.lang.startsWith("en") && v.name.toLowerCase().includes("google")) ||
    voices[0];
}

function cleanTextForTTS(text) {
  return text
    .replace(/<reflexion>[\s\S]*?<\/reflexion>/gi, "")
    .replace(/```[\s\S]*?```/g, " bloc de code ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[mémoire:[^\]]*\]/g, "")
    .replace(/[#*_~>|]/g, "")
    .replace(/https?:\/\/\S+/g, " lien ")
    .replace(/\s+/g, " ")
    .trim();
}

function addTTSButton(body, text) {
  if (!text || text.length < 2) return;
  const clean = cleanTextForTTS(text);
  const showTTS = clean && clean.length >= 5;

  const bar = document.createElement("div");
  bar.className = "tts-bar";
  bar.innerHTML = `
    <button class="tts-btn${showTTS ? "" : " hidden"}" title="${t("listenTitle")}">
      <svg class="tts-ico-play" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
      <svg class="tts-ico-stop hidden" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
      </svg>
      <span class="tts-label">${t("listen")}</span>
    </button>
    <button class="copy-btn" title="${t("copyTitle")}">
      <svg class="copy-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      <svg class="copy-ico-ok hidden" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span class="copy-label">${t("copy")}</span>
    </button>`;

  const btn = bar.querySelector(".tts-btn");
  const playIco = bar.querySelector(".tts-ico-play");
  const stopIco = bar.querySelector(".tts-ico-stop");
  const label = bar.querySelector(".tts-label");
  let utterance = null;

  btn.onclick = () => {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      playIco.classList.remove("hidden");
      stopIco.classList.add("hidden");
      label.textContent = t("listen");
      btn.classList.remove("tts-active");
      return;
    }

    utterance = new SpeechSynthesisUtterance(clean);
    utterance.voice = getTTSVoice();
    utterance.lang = "fr-CA";
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    playIco.classList.add("hidden");
    stopIco.classList.remove("hidden");
    label.textContent = t("pause");
    btn.classList.add("tts-active");

    utterance.onend = () => {
      playIco.classList.remove("hidden");
      stopIco.classList.add("hidden");
      label.textContent = t("listen");
      btn.classList.remove("tts-active");
    };
    utterance.onerror = utterance.onend;

    speechSynthesis.speak(utterance);
  };

  const copyBtn = bar.querySelector(".copy-btn");
  const copyIco = bar.querySelector(".copy-ico");
  const copyOk = bar.querySelector(".copy-ico-ok");
  const copyLabel = bar.querySelector(".copy-label");
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      copyIco.classList.add("hidden");
      copyOk.classList.remove("hidden");
      copyLabel.textContent = t("copied");
      copyBtn.classList.add("copy-ok");
      setTimeout(() => {
        copyIco.classList.remove("hidden");
        copyOk.classList.add("hidden");
        copyLabel.textContent = t("copy");
        copyBtn.classList.remove("copy-ok");
      }, 2000);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      copyIco.classList.add("hidden");
      copyOk.classList.remove("hidden");
      copyLabel.textContent = t("copied");
      copyBtn.classList.add("copy-ok");
      setTimeout(() => {
        copyIco.classList.remove("hidden");
        copyOk.classList.add("hidden");
        copyLabel.textContent = t("copy");
        copyBtn.classList.remove("copy-ok");
      }, 2000);
    }
  };

  body.appendChild(bar);
}

function addSaveToCerveauBtn(body, answer) {
  if (!answer || answer.length < 10) return;
  var bar = body.querySelector(".tts-bar");
  if (!bar) return;
  var btn = document.createElement("button");
  btn.className = "cerv-save-btn-chat";
  btn.title = "Sauvegarder dans mon Deuxième Cerveau";
  btn.innerHTML = "🧠 Garder";
  btn.onclick = function() {
    if (btn.disabled) return;
    var userMsg = "";
    var msgWrap = body.closest(".msg.assistant");
    if (msgWrap) {
      var prev = msgWrap.previousElementSibling;
      if (prev && prev.classList.contains("user")) {
        var userBody = prev.querySelector(".msg-body");
        userMsg = userBody ? userBody.textContent.trim() : "";
      }
    }
    var title = "🤖 " + answer.replace(/\n/g, " ").slice(0, 50) + (answer.length > 50 ? "..." : "");
    var content = userMsg
      ? "**Question :** " + userMsg + "\n\n**Agent AL :** " + answer
      : "**Agent AL :** " + answer;
    var session = null;
    try {
      var raw = localStorage.getItem("sb-rnuripmfozlxenryxhdc-auth-token");
      if (raw) session = JSON.parse(raw);
    } catch(e) {}
    if (!session || !session.user) { alert("Connecte-toi pour sauvegarder."); return; }
    btn.disabled = true;
    btn.innerHTML = "⏳";
    fetch("https://rnuripmfozlxenryxhdc.supabase.co/rest/v1/cerveau_notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": proxyToken(),
        "Authorization": "Bearer " + session.access_token,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        user_id: session.user.id,
        title: title,
        content: content,
        tags: ["agent-al", "conversation", "sauvegardé"]
      })
    }).then(function(res) {
      if (res.ok) {
        btn.innerHTML = "🧠 Sauvegardé ✓";
        btn.classList.add("cerv-saved");
      } else {
        btn.disabled = false;
        btn.innerHTML = "🧠 Garder";
        alert("Erreur sauvegarde: " + res.status);
      }
    }).catch(function() {
      btn.disabled = false;
      btn.innerHTML = "🧠 Garder";
    });
  };
  bar.appendChild(btn);
}

if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = () => {};
}
async function pushToGithub(content, suggestedName) {
  if (!state.connected.github || !state.github.token || !state.github.repo) {
    alert(t("alertGhFirst"));
    return;
  }
  const filename = prompt(t("alertGhFilename"), suggestedName || "main.ts");
  if (!filename) return;
  const commitMsg = prompt(t("alertCommitMsg"), `${t("alertCommitDefault")} ${filename} via ti-lex-AL`);
  if (!commitMsg) return;

  const branch = state.github.branch || "main";
  const repo = state.github.repo;

  try {
    // vérifier si le fichier existe déjà (pour obtenir son sha)
    let sha = null;
    try {
      const existing = await fetch(`${GH_API}/repos/${repo}/contents/${encodeURIComponent(filename)}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
      if (existing.ok) { sha = (await existing.json()).sha; }
    } catch (_) {}

    const body = {
      message: commitMsg,
      content: btoa(unescape(encodeURIComponent(content))),
      branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(`${GH_API}/repos/${repo}/contents/${encodeURIComponent(filename)}`, {
      method: "PUT", headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.json()).message || ""}`);
    alert(`${t("alertPushed")} ${repo}/${branch}/${filename}`);
  } catch (err) {
    alert(`${t("alertPushErr")} ${err.message}`);
  }
}

function extractCodeBlocks(text) {
  const blocks = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = regex.exec(text)) !== null) blocks.push({ lang: m[1], code: m[2].trim() });
  return blocks.length ? blocks : [{ lang: "", code: text }];
}

const LANG_EXT = { javascript: "js", typescript: "ts", python: "py", html: "html", css: "css", sql: "sql", rust: "rs", go: "go", java: "java", json: "json", bash: "sh", sh: "sh", yaml: "yml", xml: "xml", jsx: "jsx", tsx: "tsx" };

function extractCodeFiles(text) {
  const files = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const lang = m[1];
    const code = m[2].trim();
    if (!code) continue;
    let filePath = null;
    const lines = code.split("\n");
    const firstLine = lines[0].trim();
    const fileMarker = firstLine.match(/^(?:\/\/|#|--|\/\*)\s*FILE:\s*(.+?)(?:\s*\*\/)?$/i);
    if (fileMarker) {
      filePath = fileMarker[1].trim();
      lines.shift();
    }
    if (!filePath) {
      const beforeBlock = text.substring(0, m.index);
      const headerMatch = beforeBlock.match(/(?:📄|fichier|file)\s*[:`]?\s*([^\s`*\n]+\.\w{1,6})\s*$/i);
      if (headerMatch) filePath = headerMatch[1];
    }
    if (!filePath) {
      const ext = LANG_EXT[lang.toLowerCase()] || "txt";
      filePath = `snippet-${files.length + 1}.${ext}`;
    }
    files.push({ path: filePath, lang, code: lines.join("\n").trim() || code, detected: !!fileMarker });
  }
  return files;
}

async function pushMultipleToGithub(files, commitMsg) {
  if (!state.connected.github || !state.github.token || !state.github.repo) {
    alert(t("alertGhFirst"));
    return false;
  }
  const repo = state.github.repo;
  const branch = state.github.branch || "main";

  try {
    const refRes = await fetch(`${GH_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: ghHeaders() });
    if (!refRes.ok) throw new Error("Branche introuvable");
    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    const blobs = [];
    for (const f of files) {
      const blobRes = await fetch(`${GH_API}/repos/${repo}/git/blobs`, {
        method: "POST", headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content: f.code, encoding: "utf-8" }),
      });
      if (!blobRes.ok) throw new Error(`Erreur blob: ${f.path}`);
      const blobData = await blobRes.json();
      blobs.push({ path: f.path, mode: "100644", type: "blob", sha: blobData.sha });
    }

    const treeRes = await fetch(`${GH_API}/repos/${repo}/git/trees`, {
      method: "POST", headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseSha, tree: blobs }),
    });
    if (!treeRes.ok) throw new Error("Erreur création tree");
    const treeData = await treeRes.json();

    const commitRes = await fetch(`${GH_API}/repos/${repo}/git/commits`, {
      method: "POST", headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ message: commitMsg, tree: treeData.sha, parents: [baseSha] }),
    });
    if (!commitRes.ok) throw new Error("Erreur commit");
    const commitData = await commitRes.json();

    const updateRes = await fetch(`${GH_API}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH", headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commitData.sha }),
    });
    if (!updateRes.ok) throw new Error("Erreur mise à jour branche");

    return true;
  } catch (err) {
    alert(`${t("alertPushErr")} ${err.message}`);
    return false;
  }
}

async function pushToGithubSilent(content, filename) {
  if (!state.connected.github || !state.github.token || !state.github.repo) return false;
  const repo = state.github.repo;
  const branch = state.github.branch || "main";
  try {
    let sha = null;
    try {
      const existing = await fetch(`${GH_API}/repos/${repo}/contents/${encodeURIComponent(filename)}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
      if (existing.ok) sha = (await existing.json()).sha;
    } catch (_) {}
    const body = {
      message: `Deploy ${filename} via ti-lex-AL`,
      content: btoa(unescape(encodeURIComponent(content))),
      branch,
    };
    if (sha) body.sha = sha;
    const res = await fetch(`${GH_API}/repos/${repo}/contents/${encodeURIComponent(filename)}`, {
      method: "PUT", headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (_) { return false; }
}

function addCodeActions(container, fullText) {
  const codeFiles = extractCodeFiles(fullText);
  if (!codeFiles.length) return;

  const wrap = document.createElement("div");
  wrap.className = "code-actions-wrap";

  if (codeFiles.length > 0 && codeFiles.some(f => f.detected)) {
    const fileList = document.createElement("div");
    fileList.className = "code-files-list";
    const header = document.createElement("div");
    header.className = "code-files-header";
    header.innerHTML = `<svg viewBox="0 0 24 24" class="cfl-icon"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> <span>${codeFiles.length} ${t("filesDetected")}</span>`;
    fileList.appendChild(header);

    codeFiles.forEach((f, i) => {
      const row = document.createElement("div");
      row.className = "code-file-row";
      const badge = document.createElement("span");
      badge.className = "code-file-badge";
      badge.textContent = f.lang || "txt";
      const pathEl = document.createElement("span");
      pathEl.className = "code-file-path";
      pathEl.textContent = f.path;
      row.appendChild(badge);
      row.appendChild(pathEl);

      const acts = document.createElement("span");
      acts.className = "code-file-acts";
      const stBtn = document.createElement("button");
      stBtn.className = "cfact-btn";
      stBtn.title = t("openStudio");
      stBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
      stBtn.onclick = () => openInStudio(f.code, f.path);
      acts.appendChild(stBtn);

      if (state.connected.github) {
        const ghBtn = document.createElement("button");
        ghBtn.className = "cfact-btn";
        ghBtn.title = `Push ${f.path}`;
        ghBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
        ghBtn.onclick = () => pushToGithub(f.code, f.path);
        acts.appendChild(ghBtn);
      }
      row.appendChild(acts);
      fileList.appendChild(row);
    });
    wrap.appendChild(fileList);
  }

  const btns = document.createElement("div");
  btns.className = "code-actions";

  if (codeFiles.length === 1) {
    const ext = LANG_EXT[codeFiles[0].lang.toLowerCase()] || "txt";
    const name = codeFiles[0].path || `snippet.${ext}`;
    const studioBtn = document.createElement("button");
    studioBtn.className = "push-gh-btn";
    studioBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> ${t("openStudio")}`;
    studioBtn.onclick = () => openInStudio(codeFiles[0].code, name);
    btns.appendChild(studioBtn);
  }

  if (state.connected.github) {
    if (codeFiles.length > 1 && codeFiles.some(f => f.detected)) {
      const pushAllBtn = document.createElement("button");
      pushAllBtn.className = "push-gh-btn push-all-btn";
      pushAllBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg> Push ${codeFiles.length} ${t("pushFilesGh")}`;
      pushAllBtn.onclick = async () => {
        const commitMsg = prompt(`${t("alertCommitMsg")}`, `${t("commitMsgDefault")} ${codeFiles.length} ${t("commitMsgVia")}`);
        if (!commitMsg) return;
        pushAllBtn.disabled = true;
        pushAllBtn.innerHTML = `<span class="cfact-spin"></span> ${t("pushing")}`;
        const ok = await pushMultipleToGithub(codeFiles, commitMsg);
        if (ok) {
          pushAllBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> ${t("pushed")}`;
          pushAllBtn.classList.add("push-ok");
        } else {
          pushAllBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg> ${t("retry")}`;
          pushAllBtn.disabled = false;
        }
      };
      btns.appendChild(pushAllBtn);

      const deployBtn = document.createElement("button");
      deployBtn.className = "push-gh-btn deploy-vercel-btn";
      deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="12 2 22 20 2 20"/></svg> ${t("pushDeploy")}`;
      deployBtn.onclick = async () => {
        const commitMsg = prompt(`${t("alertCommitMsg")}`, `Deploy ${codeFiles.length} ${t("commitMsgDeploy")}`);
        if (!commitMsg) return;
        deployBtn.disabled = true;
        deployBtn.innerHTML = `<span class="cfact-spin"></span> ${t("pushGhProgress")}`;
        const ok = await pushMultipleToGithub(codeFiles, commitMsg);
        if (!ok) {
          deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="12 2 22 20 2 20"/></svg> ${t("retry")}`;
          deployBtn.disabled = false;
          return;
        }
        deployBtn.innerHTML = `<span class="cfact-spin"></span> ${t("deploying")}`;
        deployBtn.classList.add("deploying");
        setTimeout(() => {
          deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> ${t("deployed")}`;
          deployBtn.classList.remove("deploying");
          deployBtn.classList.add("push-ok");
        }, 4000);
      };
      btns.appendChild(deployBtn);

    } else if (codeFiles.length === 1) {
      const ghBtn = document.createElement("button");
      ghBtn.className = "push-gh-btn";
      ghBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg> ${t("pushGitHub")}`;
      ghBtn.onclick = () => pushToGithub(codeFiles[0].code, codeFiles[0].path);
      btns.appendChild(ghBtn);

      const deployBtn = document.createElement("button");
      deployBtn.className = "push-gh-btn deploy-vercel-btn";
      deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="12 2 22 20 2 20"/></svg> ${t("pushDeploy")}`;
      deployBtn.onclick = async () => {
        deployBtn.disabled = true;
        deployBtn.innerHTML = `<span class="cfact-spin"></span> ${t("pushGhProgress")}`;
        const ok = await pushToGithubSilent(codeFiles[0].code, codeFiles[0].path);
        if (!ok) {
          deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="12 2 22 20 2 20"/></svg> ${t("retry")}`;
          deployBtn.disabled = false;
          return;
        }
        deployBtn.innerHTML = `<span class="cfact-spin"></span> ${t("deploying")}`;
        deployBtn.classList.add("deploying");
        setTimeout(() => {
          deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> ${t("deployed")}`;
          deployBtn.classList.remove("deploying");
          deployBtn.classList.add("push-ok");
        }, 4000);
      };
      btns.appendChild(deployBtn);
    }
  }

  if (btns.children.length) wrap.appendChild(btns);
  container.appendChild(wrap);
}

/* ---- Code Reflection ---- */
function cdxTryReflection(body, fullText) {
  const jsonMatch = fullText.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) return;
  let data;
  try { data = JSON.parse(jsonMatch[1]); } catch { return; }
  if (!data.code) return;
  if (!data.reflectionSteps && !data.filePath) return;

  const validation = data.filePath ? cdxValidateFilePath(data.filePath, data.type || "") : null;
  const validIcon = validation ? (validation.valid ? "✅" : "❌") : "";
  const pathLabel = data.filePath ? ` · <span style="color:${validation && validation.valid ? '#3ddc84' : '#ff4444'};font-size:11px">${validIcon} ${escapeHtml(data.filePath)}</span>` : "";

  const preview = document.createElement("div");
  preview.className = "cdx-reflect-preview";
  preview.innerHTML =
    `<div class="cdx-reflect-preview-head">` +
      `<span class="cdx-reflect-preview-title">💡 ${escapeHtml(data.title || "Code Reflection")}${pathLabel}</span>` +
      `<div class="cdx-reflect-preview-actions">` +
        `<button class="cdx-reflect-act" data-act="copy" title="Copier">⎘</button>` +
        `<button class="cdx-reflect-act" data-act="expand" title="Voir la réflexion">↗</button>` +
      `</div>` +
    `</div>` +
    `<pre class="cdx-reflect-preview-code"><code>${escapeHtml(data.code)}</code></pre>` +
    `<div class="cdx-reflect-preview-hint">Cliquer pour voir la réflexion complète</div>`;

  preview.querySelector('[data-act="copy"]').onclick = function(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(data.code);
    this.textContent = "✓";
    setTimeout(() => { this.textContent = "⎘"; }, 2000);
  };
  const openReflect = () => cdxOpenReflection(data);
  preview.querySelector('[data-act="expand"]').onclick = function(e) { e.stopPropagation(); openReflect(); };
  preview.onclick = openReflect;

  body.appendChild(preview);
}

let _tilexConfig = null;
function cdxGetConfig() {
  if (_tilexConfig) return _tilexConfig;
  try { _tilexConfig = JSON.parse(localStorage.getItem("tilex-config-cache") || "null"); } catch {}
  if (!_tilexConfig) {
    fetch("/ti-lex-config.json").then(r => r.json()).then(cfg => {
      _tilexConfig = cfg;
      try { localStorage.setItem("tilex-config-cache", JSON.stringify(cfg)); } catch {}
    }).catch(() => {});
  }
  return _tilexConfig;
}
cdxGetConfig();

function cdxValidateFilePath(filePath, fileType) {
  const cfg = cdxGetConfig();
  const errors = [];
  if (!cfg || !cfg.fileStructure) return { valid: true, errors: [], warnings: [] };
  const typeConfig = cfg.fileStructure[fileType];
  if (!typeConfig) return { valid: true, errors: [], warnings: ["Type inconnu: " + fileType] };
  if (!filePath.startsWith(typeConfig.path)) errors.push("Devrait être dans " + typeConfig.path + "/");
  if (!filePath.endsWith(typeConfig.extension)) errors.push("Extension attendue: " + typeConfig.extension);
  const namePattern = cfg.validationPatterns?.filePaths?.[fileType];
  if (namePattern && !new RegExp(namePattern).test(filePath)) errors.push("Convention de nommage: " + typeConfig.pattern);
  return { valid: errors.length === 0, errors: errors, warnings: [] };
}

function cdxOpenReflection(data) {
  const overlay = $("#cdxReflectOverlay");
  const body = $("#cdxReflectBody");
  let html = "";

  if (data.filePath) {
    const v = cdxValidateFilePath(data.filePath, data.type || "");
    const icon = v.valid ? "✅" : "❌";
    const color = v.valid ? "#3ddc84" : "#ff4444";
    html +=
      '<div class="cdx-reflect-section" style="background:rgba(255,107,53,.06);border:1px solid rgba(255,107,53,.15);border-radius:8px;padding:14px;margin-bottom:20px">' +
        '<h3 class="cdx-reflect-section-title">📁 Fichier</h3>' +
        '<p style="font-size:13px;color:#ddd;margin:0 0 6px"><strong style="color:' + color + '">' + icon + ' ' + escapeHtml(data.filePath) + '</strong></p>' +
        (data.type ? '<p style="font-size:11px;color:#888;margin:0">Type: <strong>' + escapeHtml(data.type) + '</strong></p>' : '') +
        (v.errors.length ? '<p style="font-size:11px;color:#ff4444;margin:6px 0 0">' + v.errors.map(function(e) { return '• ' + escapeHtml(e); }).join('<br>') + '</p>' : '') +
        (data.deploymentInstructions ? '<p style="font-size:11px;color:#888;margin:6px 0 0">📋 ' + escapeHtml(data.deploymentInstructions) + '</p>' : '') +
      '</div>';
  }

  if (data.reflectionSteps && data.reflectionSteps.length) {
    html += '<div class="cdx-reflect-section">';
    data.reflectionSteps.forEach(function(step) {
      html +=
        '<div class="cdx-reflect-step">' +
          '<h3 class="cdx-reflect-step-title">Étape ' + step.stepNumber + ' : ' + escapeHtml(step.title) + '</h3>' +
          '<pre class="cdx-reflect-step-code"><code>' + escapeHtml(step.code) + '</code></pre>' +
          '<p class="cdx-reflect-step-desc">' + escapeHtml(step.description) + '</p>' +
        '</div>';
    });
    html += '</div>';
  }

  if (data.whatItDoes) {
    html +=
      '<div class="cdx-reflect-section">' +
        '<h3 class="cdx-reflect-section-title">🔍 Ce que fait ce code</h3>' +
        '<p class="cdx-reflect-section-text">' + escapeHtml(data.whatItDoes) + '</p>' +
      '</div>';
  }

  if (data.useCases && data.useCases.length) {
    html +=
      '<div class="cdx-reflect-section">' +
        '<h3 class="cdx-reflect-section-title">🎯 Cas d\'utilisation</h3>' +
        '<ul class="cdx-reflect-list">' +
        data.useCases.map(function(u) { return '<li>' + escapeHtml(u) + '</li>'; }).join('') +
        '</ul>' +
      '</div>';
  }

  if (data.warnings && data.warnings.length) {
    html +=
      '<div class="cdx-reflect-section cdx-reflect-warnings">' +
        '<h3 class="cdx-reflect-section-title">⚠ Notes importantes</h3>' +
        '<ul class="cdx-reflect-list">' +
        data.warnings.map(function(w) { return '<li>' + escapeHtml(w) + '</li>'; }).join('') +
        '</ul>' +
      '</div>';
  }

  if (data.nextSteps && data.nextSteps.length) {
    html +=
      '<div class="cdx-reflect-section">' +
        '<h3 class="cdx-reflect-section-title">→ Prochaines étapes</h3>' +
        '<ul class="cdx-reflect-list arrows">' +
        data.nextSteps.map(function(s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') +
        '</ul>' +
      '</div>';
  }

  body.innerHTML = html;
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  overlay._reflectData = data;
}

(function initReflectionModal() {
  const overlay = $("#cdxReflectOverlay");
  if (!overlay) return;
  const closeModal = () => { overlay.classList.remove("open"); document.body.style.overflow = ""; };
  $("#cdxReflectClose").onclick = closeModal;
  $("#cdxReflectCloseBtn").onclick = closeModal;
  overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
  document.addEventListener("keydown", function(e) { if (e.key === "Escape" && overlay.classList.contains("open")) closeModal(); });
  $("#cdxReflectCopyAll").onclick = function() {
    const data = overlay._reflectData;
    if (!data) return;
    const allCode = (data.reflectionSteps && data.reflectionSteps.length)
      ? data.reflectionSteps.map(function(s) { return s.code; }).join("\n\n")
      : data.code;
    navigator.clipboard.writeText(allCode);
    this.textContent = "✓ Copié !";
    var btn = this;
    setTimeout(function() { btn.textContent = "⎘ Copier tout le code"; }, 2000);
  };
  $("#cdxReflectCloseBtn").insertAdjacentHTML("beforebegin",
    '<button class="cdx-reflect-btn cdx-reflect-btn-primary" id="cdxReflectAddFile" style="display:none">📁 Ajouter aux fichiers</button>');
  var addFileBtn = $("#cdxReflectAddFile");
  var origObserver = new MutationObserver(function() {
    var data = overlay._reflectData;
    addFileBtn.style.display = (data && data.filePath) ? "" : "none";
  });
  origObserver.observe(overlay, { attributes: true, attributeFilter: ["class"] });
  addFileBtn.onclick = function() {
    var data = overlay._reflectData;
    if (!data || !data.filePath) return;
    var name = data.filePath.split("/").pop() || data.fileName || "file.txt";
    if (typeof cdxFiles !== "undefined") {
      cdxFiles[name] = { content: data.code, binary: false, size: data.code.length, status: "ready" };
      if (typeof cdxRenderFiles === "function") cdxRenderFiles();
    }
    this.textContent = "✓ Ajouté !";
    var btn = this;
    setTimeout(function() { btn.textContent = "📁 Ajouter aux fichiers"; }, 2000);
  };
})();

function escapeHtml(s) {
  return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

/* ---- Streaming SSE : écriture fluide, façon Claude Code ---- */
async function apiError(res) {
  try {
    const e = await res.json();
    return e.error?.message || (typeof e.error === "string" ? e.error : null) || `HTTP ${res.status}`;
  } catch (_) {
    try { const t = await res.text(); return t.slice(0, 300) || `HTTP ${res.status}`; }
    catch (_2) { return `HTTP ${res.status}`; }
  }
}
async function streamText(res, onUpdate) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt;
      try { evt = JSON.parse(payload); } catch (_) { continue; }
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        full += evt.delta.text;
        onUpdate(full);
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message || t("streamError"));
      }
    }
  }
  return full;
}

/* ---- Typewriter ultra-fluide (rAF + easing) ---- */
const typerConfig = { baseSpeed: 0.08, textCps: 80, codeCps: 600, easeStrength: 0.4 };

function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

function makeTyper(renderFn) {
  let target = "", shown = 0, running = false, finished = false, doneCb = null, last = 0;
  let accumulator = 0;

  function isInsideCodeBlock(pos) {
    let inside = false, i = 0;
    while (i < pos) {
      if (target[i] === '`' && target[i+1] === '`' && target[i+2] === '`') {
        inside = !inside;
        i += 3;
        while (i < pos && target[i] !== '\n') i++;
      } else { i++; }
    }
    return inside;
  }

  function step(ts) {
    if (!last) last = ts;
    const dt = Math.min(ts - last, 50);
    last = ts;

    if (shown < target.length) {
      const inCode = isInsideCodeBlock(shown);
      const backlog = target.length - shown;
      let cps = inCode ? typerConfig.codeCps : typerConfig.textCps;
      if (!inCode && backlog > 400) cps = 160;
      else if (!inCode && backlog > 200) cps = 120;
      if (inCode && backlog > 600) cps = 1400;

      const rawProgress = backlog > 0 ? Math.min(1, shown / Math.max(target.length, 1)) : 1;
      const easedMul = 1 + typerConfig.easeStrength * (1 - easeOutQuad(rawProgress));

      accumulator += (cps * easedMul * dt) / 1000;
      const advance = Math.floor(accumulator);
      if (advance >= 1) {
        accumulator -= advance;
        shown = Math.min(target.length, shown + advance);
        renderFn(target.slice(0, shown));
      }
    }

    if (shown >= target.length && finished) {
      running = false;
      renderFn(target);
      if (doneCb) doneCb();
      return;
    }
    requestAnimationFrame(step);
  }

  return {
    push(full) {
      target = full;
      if (!running) { running = true; last = 0; accumulator = 0; requestAnimationFrame(step); }
    },
    finish(cb) {
      finished = true; doneCb = cb;
      if (!running) { shown = target.length; renderFn(target); if (cb) cb(); }
    },
  };
}

window.typewriterDebug = {
  setSpeed(multiplier) { typerConfig.textCps = Math.round(80 * multiplier); typerConfig.codeCps = Math.round(600 * multiplier); },
  config() { return typerConfig; },
};
const codexConvos = $("#codexConvos");
const codexSb = $("#codexSidebar");
let codexHistory = JSON.parse(localStorage.getItem("tilex-codex-history") || "[]");
let activeConvIdx = -1;
let codexChatMsgs = [];

function toggleCodexSidebar() {
  codexSb.classList.toggle("closed");
}
$("#codexSbToggle").onclick = toggleCodexSidebar;
$("#codexSbOpenBtn").onclick = toggleCodexSidebar;

function syncCodexProjects() {
  $$("#codexConnect .codex-sb-project").forEach(p => {
    const svc = p.dataset.service;
    const on = state.connected[svc];
    p.classList.toggle("connected", !!on);
    const st = p.querySelector(".codex-sb-status");
    if (st) st.textContent = on ? t("connected") : t("notConnected");
  });
  syncCodexGh();
}

/* ---- Codex GitHub quick-connect ---- */
function syncCodexGh() {
  const form = $("#codexGhForm");
  const sels = $("#codexGhSelectors");
  const status = $("#codexGhStatus");
  if (!form) return;

  if (state.connected.github && state.github.token) {
    form.style.display = "none";
    sels.classList.remove("hidden");
    if (status) { status.textContent = t("connected"); status.classList.add("ok"); }
  } else {
    form.style.display = "";
    sels.classList.add("hidden");
    if (status) { status.textContent = "--"; status.classList.remove("ok"); }
  }
}

async function codexGhConnect() {
  const tokenInput = $("#codexGhToken");
  const token = tokenInput.value.trim() || state.github.token;
  if (!token) return;
  const btn = $("#codexGhConnect"); btn.disabled = true;
  btn.textContent = t("ghConnecting");
  try {
    state.github.token = token;
    const res = await fetch(`${GH_API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const repos = await res.json();
    state.connected.github = true;
    persistGithub();

    // remplir le select des repos
    const repoSel = $("#codexGhRepo");
    repoSel.innerHTML = `<option value="">${t("codexRepoDefault")} (${repos.length})</option>` +
      repos.map(r => `<option value="${r.full_name}"${r.full_name === state.github.repo ? " selected" : ""}>${r.full_name}${r.private ? " 🔒" : ""}</option>`).join("");

    // aussi mettre à jour les Paramètres
    if ($("#ghToken")) $("#ghToken").value = token;
    setGhState(t("connectedMark"), true);
    $$(`.conn-btn[data-service="github"]`).forEach(b => b.classList.add("connected"));

    syncCodexProjects();
    renderProjConvs();

    if (state.github.repo) {
      repoSel.value = state.github.repo;
      await codexGhLoadBranches(state.github.repo);
    }
  } catch (err) {
    btn.textContent = t("ghErrorRetry");
    state.connected.github = false;
  } finally {
    btn.disabled = false;
    if (state.connected.github) btn.textContent = "Connecter";
  }
}

async function codexGhLoadBranches(repo) {
  if (!repo) return;
  state.github.repo = repo;
  state.projectFiles = [];
  persistGithub();
  const bsel = $("#codexGhBranch");
  const info = $("#codexGhInfo");
  bsel.innerHTML = `<option value="">${t("ghLoadingBranches")}</option>`;
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/branches?per_page=100`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const branches = await res.json();
    const repoRes = await fetch(`${GH_API}/repos/${repo}`, { headers: ghHeaders() });
    const def = repoRes.ok ? (await repoRes.json()).default_branch : "main";
    const sel = state.github.branch || def;
    bsel.innerHTML = branches.map(b =>
      `<option value="${b.name}"${b.name === sel ? " selected" : ""}>${b.name}${b.name === def ? " ★" : ""}</option>`
    ).join("");
    state.github.branch = bsel.value || sel;
    persistGithub();

    // count files
    const treeRes = await fetch(`${GH_API}/repos/${repo}/git/trees/${encodeURIComponent(state.github.branch)}?recursive=1`, { headers: ghHeaders() });
    if (treeRes.ok) {
      const tree = await treeRes.json();
      const count = (tree.tree || []).filter(t => t.type === "blob").length;
      if (info) info.innerHTML = `<span class="ok">✓</span> ${count} ${t("ghFilesCount")} <b>${state.github.branch}</b>`;
    }

    // sync Settings page too
    if ($("#ghRepoZone")) {
      $("#ghRepoZone").classList.add("show");
      await ghLoadBranches(repo);
    }
  } catch (err) {
    bsel.innerHTML = `<option value="">erreur</option>`;
    if (info) info.textContent = err.message;
  }
}

if ($("#codexGhConnect")) {
  $("#codexGhConnect").onclick = codexGhConnect;
  $("#codexGhRepo").onchange = e => { codexGhLoadBranches(e.target.value); renderProjConvs(); };
  $("#codexGhBranch").onchange = e => {
    state.github.branch = e.target.value;
    state.projectFiles = [];
    persistGithub();
    const info = $("#codexGhInfo");
    if (info) info.innerHTML = `${t("setBranch")} : <b>${e.target.value}</b>`;
    codexGhLoadBranches(state.github.repo);
    renderProjConvs();
  };
}

function addCodexUserMsg(text, atts) {
  $(".codex-welcome")?.remove();
  const m = document.createElement("div");
  m.className = "codex-msg user";
  const av = createTiLexAvatar(38);
  av.classList.add("msg-avatar-user-tl", "codex-user-av");
  m.appendChild(av);
  const b = document.createElement("div");
  b.className = "codex-msg-body";
  let html = "";
  if (atts && atts.length) {
    html += '<div class="attach-strip" style="margin:0 0 6px">' + atts.map(a => {
      if (a.kind === "image") return `<div class="attach-chip"><img src="${a.dataUrl}" alt=""><span class="a-name">${escapeHtml(a.name)}</span></div>`;
      const ico = a.kind === "zip" ? "🗜️" : a.kind === "text" ? "📄" : "📎";
      return `<div class="attach-chip"><span class="a-ico">${ico}</span><span class="a-name">${escapeHtml(a.name)}</span></div>`;
    }).join("") + "</div>";
  }
  html += escapeHtml(text).replace(/\n/g, "<br>");
  b.innerHTML = html;
  m.appendChild(b);
  $("#codexMessages").appendChild(m);
  $("#codexMessages").scrollTop = $("#codexMessages").scrollHeight;
}

function buildCodexAssistantMsg() {
  const m = document.createElement("div");
  m.className = "codex-msg assistant responding";
  m.appendChild(avatarAL());
  const b = document.createElement("div");
  b.className = "codex-msg-body";
  b.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  m.appendChild(b);
  $("#codexMessages").appendChild(m);
  $("#codexMessages").scrollTop = $("#codexMessages").scrollHeight;
  b._msgWrap = m;
  return b;
}

function saveCodexConv(prompt, output) {
  const entry = { prompt: prompt.slice(0, 60), full: prompt, output, msgs: [...codexChatMsgs], ts: Date.now() };
  if (activeConvIdx >= 0) {
    codexHistory[activeConvIdx] = entry;
  } else {
    codexHistory.unshift(entry);
    activeConvIdx = 0;
  }
  if (codexHistory.length > 30) codexHistory.length = 30;
  try { localStorage.setItem("tilex-codex-history", JSON.stringify(codexHistory)); } catch (_) {}
  renderCodexConvos();

  if (state.connected.github && state.github.repo) {
    saveProjConv(entry);
  }
}

function renderCodexConvos() {
  if (!codexHistory.length) {
    codexConvos.innerHTML = `<p class="muted" style="font-size:.78rem;padding:6px 0">${t("codexNoConv")}</p>`;
    return;
  }
  codexConvos.innerHTML = codexHistory.map((c, i) => {
    const age = c.ts ? timeAgo(c.ts) : "";
    return `<div class="codex-sb-conv${i === activeConvIdx ? ' active' : ''}" data-idx="${i}"><span class="conv-title">${escapeHtml(c.prompt || t("untitled"))}</span>${age ? `<span class="conv-date">${age}</span>` : ""}<button class="conv-del" data-idx="${i}" title="${t("delete_")}">×</button></div>`;
  }).join("");
  $$(".codex-sb-conv", codexConvos).forEach(el => {
    el.onclick = (e) => {
      if (e.target.classList.contains("conv-del")) return;
      const idx = +el.dataset.idx;
      activeConvIdx = idx;
      const c = codexHistory[idx];
      codexChatMsgs = c.msgs || [{ role: "user", text: c.full }, { role: "assistant", text: c.output }];
      rebuildCodexChat();
      renderCodexConvos();
    };
  });
  $$(".conv-del", codexConvos).forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.idx;
      codexHistory.splice(idx, 1);
      if (activeConvIdx === idx) {
        activeConvIdx = -1;
        codexChatMsgs = [];
        resetCodexWelcome();
      } else if (activeConvIdx > idx) {
        activeConvIdx--;
      }
      try { localStorage.setItem("tilex-codex-history", JSON.stringify(codexHistory)); } catch (_) {}
      renderCodexConvos();
    };
  });
}

/* ---- Project Conversations ---- */
const PROJ_CONVS_KEY = "tilex-proj-convs";
let projConvs = {};
let activeProjConvIdx = -1;

function loadProjConvs() {
  try { projConvs = JSON.parse(localStorage.getItem(PROJ_CONVS_KEY) || "{}"); } catch (_) { projConvs = {}; }
}
function persistProjConvs() {
  try { localStorage.setItem(PROJ_CONVS_KEY, JSON.stringify(projConvs)); } catch (_) {}
}

function projKey() {
  if (!state.connected.github || !state.github.repo) return null;
  return `${state.github.repo}/${state.github.branch || "main"}`;
}

function saveProjConv(entry) {
  const key = projKey();
  if (!key) return;
  if (!projConvs[key]) projConvs[key] = [];
  const list = projConvs[key];
  const existing = list.findIndex(c => c.ts === entry.ts && c.prompt === entry.prompt);
  if (existing >= 0) {
    list[existing] = { ...entry, pinned: list[existing].pinned || false };
  } else {
    list.unshift({ ...entry, pinned: false });
  }
  if (list.length > 50) list.length = 50;
  persistProjConvs();
  renderProjConvs();
}

function renderProjConvs() {
  const label = $("#projConvLabel");
  const listEl = $("#projConvList");
  if (!listEl) return;

  const key = projKey();
  if (!key) {
    if (label) label.textContent = t("noProject");
    listEl.innerHTML = `<p class="muted" style="font-size:.75rem;padding:4px 0">${t("connectGh")}</p>`;
    return;
  }

  const repoShort = state.github.repo.split("/").pop();
  if (label) label.textContent = `${repoShort} · ${state.github.branch || "main"}`;

  const list = projConvs[key] || [];
  if (!list.length) {
    listEl.innerHTML = `<p class="proj-conv-empty">${t("noConvCodex")}</p>`;
    return;
  }

  const sorted = [...list].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.ts || 0) - (a.ts || 0);
  });

  listEl.innerHTML = sorted.map((c, i) => {
    const origIdx = list.indexOf(c);
    const age = c.ts ? timeAgo(c.ts) : "";
    const fileCount = countFilesInConv(c);
    return `<div class="proj-conv-item${origIdx === activeProjConvIdx ? ' active' : ''}" data-pidx="${origIdx}">
      <button class="proj-conv-pin${c.pinned ? ' pinned' : ''}" data-pidx="${origIdx}" title="${c.pinned ? 'Désépingler' : 'Épingler'}">${c.pinned ? '★' : '☆'}</button>
      <span class="proj-conv-title">${escapeHtml(c.prompt || t("untitled"))}</span>
      ${fileCount ? `<span class="proj-conv-badge">${fileCount} fich.</span>` : ""}
      ${age ? `<span class="proj-conv-date">${age}</span>` : ""}
      <button class="proj-conv-del" data-pidx="${origIdx}" title="${t("delete_")}">×</button>
    </div>`;
  }).join("");

  $$(".proj-conv-item", listEl).forEach(el => {
    el.onclick = (e) => {
      if (e.target.classList.contains("proj-conv-del") || e.target.classList.contains("proj-conv-pin")) return;
      const idx = +el.dataset.pidx;
      activeProjConvIdx = idx;
      const c = list[idx];
      codexChatMsgs = c.msgs || [{ role: "user", text: c.full }, { role: "assistant", text: c.output }];
      activeConvIdx = -1;
      switchView("codex");
      rebuildCodexChat();
      renderProjConvs();
      renderCodexConvos();
    };
  });

  $$(".proj-conv-pin", listEl).forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.pidx;
      list[idx].pinned = !list[idx].pinned;
      persistProjConvs();
      renderProjConvs();
    };
  });

  $$(".proj-conv-del", listEl).forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.pidx;
      list.splice(idx, 1);
      if (activeProjConvIdx === idx) {
        activeProjConvIdx = -1;
        codexChatMsgs = [];
        resetCodexWelcome();
      } else if (activeProjConvIdx > idx) {
        activeProjConvIdx--;
      }
      persistProjConvs();
      renderProjConvs();
    };
  });
}

function countFilesInConv(conv) {
  if (!conv.output) return 0;
  const matches = conv.output.match(/```\w*\n?\/\/\s*FILE:/gi);
  return matches ? matches.length : 0;
}

loadProjConvs();

function resetCodexWelcome() {
  const area = $("#codexMessages");
  area.innerHTML = `<div class="codex-welcome">
    <div class="codex-welcome-video-wrap"><video class="codex-welcome-video" autoplay muted playsinline loop><source src="assets/avatar-al.mp4" type="video/mp4"></video></div>
    <h2>${t("codexHeading")}</h2>
    <p>${t("codexSub")}</p>
    <div class="suggest">
      <button class="csug" data-p="${t("codexChip1")}">API REST Express</button>
      <button class="csug" data-p="${t("codexChip2")}">React</button>
      <button class="csug" data-p="${t("codexChip3")}">SQL</button>
    </div>
  </div>`;
}

function rebuildCodexChat() {
  const area = $("#codexMessages");
  area.innerHTML = "";
  Object.keys(cdxFiles).forEach(k => delete cdxFiles[k]);
  codexChatMsgs.forEach(m => {
    if (m.role === "user") {
      addCodexUserMsg(m.text);
    } else {
      const body = buildCodexAssistantMsg();
      if (body._msgWrap) body._msgWrap.classList.remove("responding");
      body.innerHTML = formatCode(m.text);
      addCodeActions(body, m.text);
      cdxTryReflection(body, m.text);
      cdxExtractFiles(m.text);
    }
  });
}

$("#codexNewConv").onclick = () => {
  activeConvIdx = -1;
  activeProjConvIdx = -1;
  codexChatMsgs = [];
  Object.keys(cdxFiles).forEach(k => delete cdxFiles[k]);
  cdxRenderFiles();
  $("#codeInput").value = "";
  const area = $("#codexMessages");
  area.innerHTML = `<div class="codex-welcome">
    <div class="codex-welcome-video-wrap"><video class="codex-welcome-video" autoplay muted playsinline loop><source src="assets/avatar-al.mp4" type="video/mp4"></video></div>
    <h2>${t("codexHeading")}</h2>
    <p>${t("codexSub")}</p>
    <div class="suggest">
      <button class="csug" data-p="${t("codexChip1")}">API REST Express</button>
      <button class="csug" data-p="${t("codexChip2")}">React</button>
      <button class="csug" data-p="${t("codexChip3")}">SQL</button>
    </div>
  </div>`;
  bindCodexSuggestions();
  renderCodexConvos();
  renderProjConvs();
};

/* ================= CODEX (chat-style) ================= */
const codexInput = $("#codeInput");
let codexAttachments = [];

codexInput.addEventListener("input", () => {
  codexInput.style.height = "auto";
  codexInput.style.height = Math.min(codexInput.scrollHeight, 140) + "px";
});
codexInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runCodex(); }
});
$("#codexRun").onclick = () => runCodex();

/* ---- Codex + menu (pièces jointes) ---- */
const codexPlusBtn = $("#codexPlusBtn"), codexPlusMenu = $("#codexPlusMenu");
if (codexPlusBtn) {
  codexPlusBtn.onclick = e => { e.stopPropagation(); codexPlusMenu.classList.toggle("hidden"); codexPlusBtn.classList.toggle("active", !codexPlusMenu.classList.contains("hidden")); };
  document.addEventListener("click", e => {
    if (codexPlusMenu && !codexPlusMenu.contains(e.target) && e.target !== codexPlusBtn && !codexPlusBtn.contains(e.target)) {
      codexPlusMenu.classList.add("hidden"); codexPlusBtn.classList.remove("active");
    }
  });
}
function closeCodexPlus() { if (codexPlusMenu) { codexPlusMenu.classList.add("hidden"); codexPlusBtn.classList.remove("active"); } }

$$("[data-cact]").forEach(item => {
  item.onclick = () => {
    const act = item.dataset.cact;
    if (act === "image") $("#codexFileImage").click();
    else if (act === "file") $("#codexFileAny").click();
    else if (act === "zip") $("#codexFileZip").click();
    closeCodexPlus();
  };
});

function codexHandleImages(files) {
  [...files].forEach(f => {
    (async () => {
      try {
        let result = await compresserImage(f);
        if (result.base64.length > 4 * 1024 * 1024) result = await compresserImage(f, 1024, 0.7);
        codexAttachments.push({ kind: "image", name: f.name, mediaType: result.mediaType, base64: result.base64, dataUrl: result.dataUrl, size: result.base64.length });
        renderCodexAttachStrip();
      } catch (_) {}
    })();
  });
}
function codexHandleFiles(files) {
  [...files].forEach(f => {
    if (f.type.startsWith("image/")) { codexHandleImages([f]); return; }
    const ext = f.name.split(".").pop().toLowerCase();
    if (TEXT_EXT.includes(ext) && f.size < 200000) {
      const reader = new FileReader();
      reader.onload = () => {
        codexAttachments.push({ kind: "text", name: f.name, text: reader.result, size: f.size });
        renderCodexAttachStrip();
      };
      reader.readAsText(f);
    } else {
      codexAttachments.push({ kind: "binary", name: f.name, size: f.size });
      renderCodexAttachStrip();
    }
  });
}
async function codexHandleZip(files) {
  for (const f of files) {
    try {
      const zip = await JSZip.loadAsync(f);
      const entries = [];
      let textContent = "";
      const paths = Object.keys(zip.files).filter(p => !zip.files[p].dir).sort();
      for (const path of paths) {
        const ext = path.split(".").pop().toLowerCase();
        entries.push({ path, size: 0 });
        if (TEXT_EXT.includes(ext) && textContent.length < 150000) {
          try { textContent += `\n--- ${path} ---\n${await zip.files[path].async("string")}\n`; } catch (_) {}
        }
      }
      codexAttachments.push({ kind: "zip", name: f.name, size: f.size, entries, textContent, fileCount: paths.length });
      renderCodexAttachStrip();
    } catch (_) {
      codexAttachments.push({ kind: "zip", name: f.name, size: f.size, entries: [], textContent: "" });
      renderCodexAttachStrip();
    }
  }
}

if ($("#codexFileImage")) $("#codexFileImage").onchange = e => { codexHandleImages(e.target.files); e.target.value = ""; };
if ($("#codexFileAny")) $("#codexFileAny").onchange = e => { codexHandleFiles(e.target.files); e.target.value = ""; };
if ($("#codexFileZip")) $("#codexFileZip").onchange = e => { codexHandleZip(e.target.files); e.target.value = ""; };

function renderCodexAttachStrip() {
  const strip = $("#codexAttachStrip");
  if (!strip) return;
  strip.innerHTML = codexAttachments.map((a, i) => {
    if (a.kind === "image") return `<div class="attach-chip"><img src="${a.dataUrl}" alt=""><span class="a-name">${escapeHtml(a.name)}</span><button class="a-x" data-ci="${i}">×</button></div>`;
    const ico = a.kind === "zip" ? "🗜️" : a.kind === "text" ? "📄" : "📎";
    return `<div class="attach-chip"><span class="a-ico">${ico}</span><span class="a-name">${escapeHtml(a.name)} · ${bytesLabel(a.size || 0)}</span><button class="a-x" data-ci="${i}">×</button></div>`;
  }).join("");
  strip.querySelectorAll(".a-x").forEach(x => x.onclick = () => { codexAttachments.splice(+x.dataset.ci, 1); renderCodexAttachStrip(); });
}

function buildCodexContent(text, atts) {
  if (!atts || !atts.length) return text;
  let extra = "";
  atts.forEach(a => {
    if (a.kind === "text") extra += `\n\n--- Fichier : ${a.name} ---\n${a.text}\n--- fin ---`;
    else if (a.kind === "zip" && a.textContent) {
      extra += `\n\n--- ZIP : ${a.name} (${a.fileCount || 0} fichiers) ---`;
      extra += `\nFichiers: ${(a.entries || []).map(e => e.path).join(", ")}`;
      extra += a.textContent;
      extra += `\n--- fin ZIP ---`;
    } else if (a.kind === "image") extra += `\n\n[Image jointe : ${a.name}]`;
    else extra += `\n\n[Fichier : ${a.name} (${bytesLabel(a.size || 0)})]`;
  });
  return text + extra;
}

function bindCodexSuggestions() {
  $$(".csug").forEach(s => s.onclick = () => {
    codexInput.value = s.dataset.p;
    runCodex();
  });
}
bindCodexSuggestions();

async function runCodex() {
  const text = codexInput.value.trim();
  const atts = codexAttachments.slice();
  if (!text && !atts.length) return;
  addCodexUserMsg(text, atts);
  codexChatMsgs.push({ role: "user", text });
  codexInput.value = ""; codexInput.style.height = "auto";
  codexAttachments = []; renderCodexAttachStrip();

  const body = buildCodexAssistantMsg();

  if (!AI_PROXY) {
    body.innerHTML = `<p class="muted">${t("proxyNotConfigured")}</p>`;
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    return;
  }

  $("#codexRun").disabled = true;

  const userContent = buildCodexContent(text || "Analyse les fichiers joints.", atts);
  const ghContext = state.connected.github ? `\nProjet GitHub connecté : ${state.github.repo} (branche: ${state.github.branch})` : "";
  const prompt = `Tu es le Codex de ti-lex-AL, un assistant de code expert. Génère du code propre et production-ready.

RÈGLE IMPORTANTE : Pour chaque bloc de code que tu génères, ajoute TOUJOURS en première ligne un commentaire indiquant le chemin du fichier, au format :
// FILE: chemin/vers/fichier.ext
ou pour Python/YAML/Bash :
# FILE: chemin/vers/fichier.ext
ou pour SQL :
-- FILE: chemin/vers/fichier.ext

Exemple :
\`\`\`typescript
// FILE: src/utils/helpers.ts
export function formatDate(d: Date): string {
  return d.toLocaleDateString(state.lang === "en" ? "en-CA" : "fr-CA");
}
\`\`\`

Ceci permet au système de push automatiquement les fichiers au bon endroit sur GitHub. Utilise des chemins logiques et cohérents avec la structure du projet.${ghContext}

Réponds avec le code et de courtes explications en français.

Demande:
${userContent}`;

  try {
    const res = await chatFetch({
        model: state.model,
        max_tokens: 2000,
        stream: true,
        messages: [{ role: "user", content: prompt }],
    });
    if (!res.ok) throw new Error(await apiError(res));
    body.classList.add("streaming");
    const typer = makeTyper(partial => {
      body.innerHTML = escapeHtml(partial).replace(/\n/g, "<br>") + '<span class="caret"></span>';
      $("#codexMessages").scrollTop = $("#codexMessages").scrollHeight;
    });
    const full = await streamText(res, chunk => typer.push(chunk));
    await new Promise(resolve => typer.finish(resolve));
    body.classList.remove("streaming");
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    body.innerHTML = formatCode(full);
    renderMermaidBlocks(body);
    addCodeActions(body, full);
    cdxTryReflection(body, full);
    cdxExtractFiles(full);
    codexChatMsgs.push({ role: "assistant", text: full });
    saveCodexConv(text, full);
  } catch (err) {
    body.innerHTML = `<p class="muted">${t("codexError")} ${escapeHtml(err.message || "connexion")}</p>`;
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
  } finally {
    $("#codexRun").disabled = false;
    $("#codexMessages").scrollTop = $("#codexMessages").scrollHeight;
  }
}

/* ---- Scan complet du projet (Codex) ---- */
if ($("#codexScanBtn")) $("#codexScanBtn").onclick = scanProject;

async function scanProject() {
  const connected = (state.connected.github && state.github.repo) || studioZipFiles.length;
  if (!connected) {
    addCodexUserMsg(t("codexScanProject"));
    const b = buildCodexAssistantMsg();
    b.innerHTML = `<p class="muted">${t("codexConnectFirst")}</p>`;
    if (b._msgWrap) b._msgWrap.classList.remove("responding");
    return;
  }

  addCodexUserMsg(`🔍 ${t("codexScanProject")}`);
  codexChatMsgs.push({ role: "user", text: `🔍 ${t("codexScanProject")}` });
  const body = buildCodexAssistantMsg();
  body.innerHTML = `<p class="muted">${t("codexReading")}</p><div class="typing"><span></span><span></span><span></span></div>`;

  const scanBtn = $("#codexScanBtn"); if (scanBtn) scanBtn.disabled = true;

  try {
    await loadProjectFiles({ maxFiles: 120, maxBytes: 320000, perFile: 30000, force: true });
    const ctx = projectContextString({ maxBytes: 240000 });

    const prompt = `Tu es le Codex de ti-lex-AL, un architecte logiciel senior. Analyse EN PROFONDEUR ce projet complet et produis un rapport clair, en français, structuré ainsi :

1. **Vue d'ensemble** — à quoi sert le projet, en 2-3 phrases.
2. **Architecture & technologies** — structure des dossiers, stack, patterns.
3. **Points forts** — ce qui est bien fait.
4. **Problèmes & risques** — bugs potentiels, failles, code mort, incohérences (cite les fichiers exacts).
5. **Améliorations prioritaires** — liste concrète et ordonnée, avec exemples de code si utile.

Sois précis, technique et honnête.
${ctx}`;

    const res = await chatFetch({
        model: state.model,
        max_tokens: 4096,
        stream: true,
        messages: [{ role: "user", content: prompt }],
    });
    if (!res.ok) throw new Error(await apiError(res));
    body.classList.add("streaming");
    const typer = makeTyper(partial => {
      body.innerHTML = escapeHtml(partial).replace(/\n/g, "<br>") + '<span class="caret"></span>';
      $("#codexMessages").scrollTop = $("#codexMessages").scrollHeight;
    });
    const full = await streamText(res, chunk => typer.push(chunk));
    await new Promise(resolve => typer.finish(resolve));
    body.classList.remove("streaming");
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    body.innerHTML = formatCode(full);
    renderMermaidBlocks(body);
    addCodeActions(body, full);
    cdxTryReflection(body, full);
    codexChatMsgs.push({ role: "assistant", text: full });
    saveCodexConv(`Scan projet : ${projectSourceLabel()}`, full);
  } catch (err) {
    body.innerHTML = `<p class="muted">${t("scanError")} ${escapeHtml(err.message || "connexion")}</p>`;
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
  } finally {
    if (scanBtn) scanBtn.disabled = false;
    $("#codexMessages").scrollTop = $("#codexMessages").scrollHeight;
  }
}

function formatCode(text) {
  let result = escapeHtml(text);
  result = result.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    const decoded = code.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
    return `<div class="mermaid-wrap mermaid-pending" data-mermaid="${escapeHtml(decoded)}"><div class="typing"><span></span><span></span><span></span></div></div>`;
  });
  result = result.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre>${highlightSyntax(c)}</pre>`);
  return result.replace(/\n/g, "<br>").replace(/`([^`]+)`/g, (_, c) => `<code>${highlightSyntax(c)}</code>`);
}
function renderCodexMermaid(container) {
  renderMermaidBlocks(container);
}

function highlightSyntax(code) {
  const tokens = [];
  let idx = 0;

  function push(cls, text) { tokens.push(cls ? `<span class="syn-${cls}">${text}</span>` : text); }

  function highlightSecrets(text, cls) {
    const secretPat = /(sk-ant-[a-zA-Z0-9_-]{10,}|sk-proj-[a-zA-Z0-9_-]{10,}|sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9_-]{20,}|eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]+)/g;
    let result = "";
    let last = 0;
    let sm;
    while ((sm = secretPat.exec(text)) !== null) {
      if (sm.index > last) result += `<span class="syn-${cls}">${text.slice(last, sm.index)}</span>`;
      result += `<span class="syn-secret" title="⚠ Clé secrète — ne jamais exposer!">${sm[0]}</span>`;
      last = secretPat.lastIndex;
    }
    if (last === 0) { push(cls, text); return; }
    if (last < text.length) result += `<span class="syn-${cls}">${text.slice(last)}</span>`;
    tokens.push(result);
  }

  while (idx < code.length) {
    let m;
    // HTML-escaped quotes: &quot; ... &quot; or &#039; ... &#039;
    if ((m = code.slice(idx).match(/^(&quot;[\s\S]*?&quot;|&#039;[\s\S]*?&#039;)/))) {
      highlightSecrets(m[0], "str"); idx += m[0].length; continue;
    }
    // Template literals (backticks)
    if ((m = code.slice(idx).match(/^`[^`]*?`/))) {
      highlightSecrets(m[0], "str"); idx += m[0].length; continue;
    }
    // Single-line comments // and #
    if ((m = code.slice(idx).match(/^(\/\/[^\n]*|#[^\n]*)/))) {
      push("comment", m[0]); idx += m[0].length; continue;
    }
    // Multi-line comments /* */
    if ((m = code.slice(idx).match(/^\/\*[\s\S]*?\*\//))) {
      push("comment", m[0]); idx += m[0].length; continue;
    }
    // HTML/JSX tags
    if ((m = code.slice(idx).match(/^(&lt;\/?[a-zA-Z][\w.-]*)/))) {
      push("tag", m[0]); idx += m[0].length; continue;
    }
    // Decorators / annotations @word
    if ((m = code.slice(idx).match(/^@[a-zA-Z_]\w*/))) {
      push("decorator", m[0]); idx += m[0].length; continue;
    }
    // Secret keys & tokens (standalone, not inside strings)
    if ((m = code.slice(idx).match(/^(sk-ant-[a-zA-Z0-9_-]{10,}|sk-proj-[a-zA-Z0-9_-]{10,}|sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9_-]{20,})/))) {
      push("secret", m[0]); idx += m[0].length; continue;
    }
    // Dangerous variable names (API keys, secrets, passwords)
    if ((m = code.slice(idx).match(/^\b(API_KEY|SECRET_KEY|PRIVATE_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|PASSWD|DB_PASSWORD|MASTER_KEY|ENCRYPTION_KEY|SIGNING_KEY|CLIENT_SECRET|ANTHROPIC_API_KEY|OPENAI_API_KEY|STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN|NPM_TOKEN|DATABASE_URL|MONGO_URI|REDIS_URL)\b/))) {
      push("secret", m[0]); idx += m[0].length; continue;
    }
    // Environment variables $VAR or ${VAR}
    if ((m = code.slice(idx).match(/^(\$\{[A-Z_][A-Z0-9_]*\}|\$[A-Z_][A-Z0-9_]*)/))) {
      push("env", m[0]); idx += m[0].length; continue;
    }
    // .env file patterns
    if ((m = code.slice(idx).match(/^\.env(\.[a-z]+)?\b/))) {
      push("env", m[0]); idx += m[0].length; continue;
    }
    // Numbers
    if ((m = code.slice(idx).match(/^\b(\d+\.?\d*([eE][+-]?\d+)?)\b/))) {
      push("num", m[0]); idx += m[0].length; continue;
    }
    // Keywords (JS/TS/Python/SQL/Rust/Go/Java/C)
    if ((m = code.slice(idx).match(/^\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|switch|case|break|default|interface|type|extends|implements|of|in|do|yield|static|get|set|super|enum|abstract|private|public|protected|readonly|override|declare|namespace|module|as|is|keyof|infer|satisfies|def|elif|lambda|pass|with|raise|except|finally|self|None|True|False|and|or|not|print|range|len|SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|DELETE|CREATE|TABLE|ALTER|DROP|JOIN|LEFT|RIGHT|INNER|ON|AND|OR|NOT|ORDER|BY|GROUP|HAVING|LIMIT|AS|SET|INDEX|PRIMARY|KEY|FOREIGN|REFERENCES|fn|mut|pub|impl|struct|trait|match|loop|move|ref|use|mod|crate|unsafe|dyn|go|func|package|defer|chan|goroutine|select|map|make|append|nil|fmt|void|int|char|float|double|long|short|unsigned|signed|sizeof|include|define|ifndef|endif|printf|scanf|malloc|free|struct|union|typedef|extern|register|volatile)\b/))) {
      push("kw", m[0]); idx += m[0].length; continue;
    }
    // Built-in types & values
    if ((m = code.slice(idx).match(/^\b(string|number|boolean|void|null|undefined|any|true|false|Promise|Array|Object|Map|Set|console|document|window|process|require|module|Error|Date|JSON|Math|RegExp|Symbol|BigInt|Buffer|Response|Request|Headers|URL|Deno|str|int|float|bool|list|dict|tuple|set|bytes|Vec|Option|Result|Box|String|i32|i64|u32|u64|f32|f64|usize|isize)\b/))) {
      push("type", m[0]); idx += m[0].length; continue;
    }
    // Function calls: word(
    if ((m = code.slice(idx).match(/^([a-zA-Z_$][\w$]*)\s*\(/))) {
      push("fn", m[1]); idx += m[1].length; continue;
    }
    // Property/method access: .word
    if ((m = code.slice(idx).match(/^\.([a-zA-Z_$][\w$]*)/))) {
      tokens.push("."); push("prop", m[1]); idx += m[0].length; continue;
    }
    // Operators
    if ((m = code.slice(idx).match(/^(===|!==|==|!=|&lt;=|&gt;=|=&gt;|&amp;&amp;|\|\||[+\-*/%=!<>&|^~?:])/))) {
      push("op", m[0]); idx += m[0].length; continue;
    }
    // Brackets
    if ((m = code.slice(idx).match(/^[{}()\[\]]/))) {
      push("bracket", m[0]); idx += m[0].length; continue;
    }
    // Anything else
    tokens.push(code[idx]); idx++;
  }
  return tokens.join("");
}

/* ================= CODEX UNIFIED FILE SYSTEM & DEPLOY ================= */
const cdxFiles = {};
const CDX_ICONS = {
  js:"📄",ts:"📄",jsx:"⚛️",tsx:"⚛️",css:"🎨",scss:"🎨",less:"🎨",html:"🌐",xml:"🌐",
  json:"⚙️",yml:"📋",yaml:"📋",toml:"📋",ini:"📋",env:"📋",
  md:"📚",txt:"📝",csv:"📊",tsv:"📊",
  sql:"🗃️",graphql:"🗃️",
  py:"🐍",rb:"💎",rs:"🦀",go:"🔵",java:"☕",kt:"☕",swift:"🍎",
  c:"⚡",cpp:"⚡",h:"⚡",cs:"🟣",
  sh:"🖥️",bash:"🖥️",zsh:"🖥️",ps1:"🖥️",bat:"🖥️",
  php:"🐘",lua:"🌙",r:"📐",dart:"🎯",scala:"🔴",groovy:"🟢",
  jpg:"🖼️",jpeg:"🖼️",png:"🖼️",gif:"🖼️",svg:"🖼️",webp:"🖼️",bmp:"🖼️",ico:"🖼️",tiff:"🖼️",
  mp4:"🎬",webm:"🎬",mov:"🎬",avi:"🎬",mkv:"🎬",flv:"🎬",
  mp3:"🎵",wav:"🎵",flac:"🎵",m4a:"🎵",aac:"🎵",ogg:"🎵",
  zip:"📦",rar:"📦",gz:"📦",tar:"📦","7z":"📦",
  pdf:"📕",doc:"📕",docx:"📕",xls:"📊",xlsx:"📊",ppt:"📊",
  woff:"🔤",woff2:"🔤",ttf:"🔤",otf:"🔤",eot:"🔤",
};
const CDX_TEXT_EXT = new Set(["js","ts","jsx","tsx","mjs","cjs","css","scss","less","html","htm","xml","xhtml","json","yml","yaml","toml","ini","env","md","txt","csv","tsv","sql","graphql","gql","py","rb","rs","go","java","kt","kts","swift","c","cpp","h","hpp","cs","sh","bash","zsh","ps1","bat","cmd","php","lua","r","dart","scala","groovy","vue","svelte","astro","tf","hcl","dockerfile","makefile","cmake","gradle","properties","cfg","conf","log","gitignore","editorconfig","prettierrc","eslintrc"]);

function cdxIcon(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return CDX_ICONS[ext] || "📄";
}
function cdxIsText(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return CDX_TEXT_EXT.has(ext) || ext === "";
}
function cdxFormatSize(bytes) {
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + "KB";
  return (bytes / 1048576).toFixed(1) + "MB";
}

function cdxExtractFiles(raw) {
  const pat = /```(\w+)?\s*\n?\s*(?:\/\/\s*(\S+\.\w+)|#\s*(\S+\.\w+)|\/\*\s*(\S+\.\w+)\s*\*\/|--\s*(\S+\.\w+))?\n([\s\S]*?)```/g;
  const namePat = /^(?:\/\/|#|\/\*|\-\-)\s*(?:fichier|file|filename)?\s*:?\s*(\S+\.\w+)/im;
  const extracted = new Set();
  let m;
  while ((m = pat.exec(raw)) !== null) {
    const lang = m[1] || "";
    const commentName = m[2] || m[3] || m[4] || m[5];
    let content = m[6] || "";
    if (lang.toLowerCase() === "json") {
      try { const j = JSON.parse(content.trim()); if (j.reflectionSteps || j.code) continue; } catch {}
    }
    let fname = commentName;
    if (!fname) { const inner = namePat.exec(content); if (inner) { fname = inner[1]; content = content.replace(inner[0], "").trim(); } }
    if (!fname) {
      const extMap = { javascript:"script.js",js:"script.js",typescript:"script.ts",ts:"script.ts",jsx:"component.jsx",tsx:"component.tsx",css:"styles.css",scss:"styles.scss",html:"index.html",json:"config.json",sql:"migration.sql",python:"main.py",py:"main.py",rust:"main.rs",go:"main.go",bash:"script.sh",sh:"script.sh",markdown:"README.md",md:"README.md",yaml:"config.yml",yml:"config.yml",toml:"config.toml" };
      fname = extMap[lang.toLowerCase()] || `file.${lang || "txt"}`;
    }
    if (extracted.has(fname)) {
      const base = fname.replace(/\.[^.]+$/, "");
      const ext = fname.slice(base.length);
      let n = 2;
      while (extracted.has(base + "-" + n + ext)) n++;
      fname = base + "-" + n + ext;
    }
    extracted.add(fname);
    cdxFiles[fname] = { content: content.trim(), binary: false, size: new Blob([content]).size, status: cdxFiles[fname] ? "modified" : "ready" };
  }
  cdxRenderFiles();
}

function cdxAddFromPicker(fileList) {
  Array.from(fileList).forEach(file => {
    const isText = cdxIsText(file.name) && file.size < 10_000_000;
    const reader = new FileReader();
    reader.onload = () => {
      if (isText) {
        cdxFiles[file.name] = { content: reader.result, binary: false, size: file.size, status: "ready" };
      } else {
        cdxFiles[file.name] = { dataUrl: reader.result, binary: true, size: file.size, type: file.type, status: "ready" };
      }
      cdxRenderFiles();
    };
    if (isText) reader.readAsText(file); else reader.readAsDataURL(file);
  });
}

function cdxNewFile() {
  const name = prompt("Nom du fichier (ex: app.js)");
  if (!name || !name.trim()) return;
  cdxFiles[name.trim()] = { content: "", binary: false, size: 0, status: "ready" };
  cdxRenderFiles();
}

function cdxRenderFiles() {
  const container = $("#codexFiles");
  const actions = $("#codexDeployActions");
  const counter = $("#codexFilesCount");
  if (!container) return;
  const names = Object.keys(cdxFiles).sort();
  if (!names.length) {
    container.innerHTML = '<div class="codex-files-drop" id="codexFilesDrop"><span>Glisse des fichiers ici</span></div>';
    cdxBindDrop();
    if (actions) actions.style.display = "none";
    if (counter) counter.textContent = "";
    return;
  }
  container.innerHTML = names.map(name => {
    const f = cdxFiles[name];
    const icon = cdxIcon(name);
    const sz = cdxFormatSize(f.size);
    const badgeCls = f.binary ? "binary" : (f.status === "ready" ? "ready" : "modified");
    const badgeTxt = f.binary ? f.type?.split("/")[0]?.slice(0,5) || "bin" : (f.status === "ready" ? "OK" : "*");
    return `<div class="codex-file-item" data-fname="${escapeHtml(name)}">
      <span class="codex-file-icon">${icon}</span>
      <span class="codex-file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <span class="codex-file-size">${sz}</span>
      <span class="codex-file-badge ${badgeCls}">${badgeTxt}</span>
      <button class="codex-file-del" title="Supprimer">&times;</button>
    </div>`;
  }).join("");
  if (actions) actions.style.display = "";

  let txtCount = 0, binCount = 0;
  names.forEach(n => { if (cdxFiles[n].binary) binCount++; else txtCount++; });
  if (counter) counter.textContent = `${txtCount} code${binCount ? ` + ${binCount} media` : ""} = ${names.length} total`;

  container.querySelectorAll(".codex-file-item").forEach(el => {
    el.onclick = () => {
      const name = el.dataset.fname;
      const f = cdxFiles[name];
      if (!f) return;
      container.querySelectorAll(".codex-file-item").forEach(e => e.classList.remove("active"));
      el.classList.add("active");
      const msgs = $("#codexMessages");
      if (!msgs) return;
      const div = document.createElement("div");
      div.className = "codex-msg assistant";
      if (f.binary && f.type?.startsWith("image/")) {
        div.innerHTML = `<div class="codex-msg-body"><p style="color:var(--orange);font-weight:700;margin-bottom:6px">${escapeHtml(name)}</p><img src="${f.dataUrl}" style="max-width:100%;border-radius:8px"></div>`;
      } else if (f.binary) {
        div.innerHTML = `<div class="codex-msg-body"><p style="color:var(--orange);font-weight:700">${escapeHtml(name)}</p><p class="muted">${cdxFormatSize(f.size)} — fichier binaire</p></div>`;
      } else {
        div.innerHTML = `<div class="codex-msg-body"><p style="color:var(--orange);font-weight:700;margin-bottom:6px">${escapeHtml(name)}</p><pre>${highlightSyntax(escapeHtml(f.content))}</pre></div>`;
      }
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    };
    el.querySelector(".codex-file-del").onclick = e => {
      e.stopPropagation();
      delete cdxFiles[el.dataset.fname];
      cdxRenderFiles();
    };
  });
}

function cdxBindDrop() {
  const drop = $("#codexFilesDrop");
  if (!drop) return;
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("drag-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("drag-over"); cdxAddFromPicker(e.dataTransfer.files); });
}

function cdxInitFileSystem() {
  const addBtn = $("#codexFileAddBtn");
  const newBtn = $("#codexFileNewBtn");
  const picker = $("#codexFilePickerAll");
  if (addBtn && picker) {
    addBtn.onclick = () => picker.click();
    picker.onchange = () => { cdxAddFromPicker(picker.files); picker.value = ""; };
  }
  if (newBtn) newBtn.onclick = cdxNewFile;

  const section = $("#codexFilesSection");
  if (section) {
    section.addEventListener("dragover", e => { e.preventDefault(); });
    section.addEventListener("drop", e => { e.preventDefault(); cdxAddFromPicker(e.dataTransfer.files); });
  }
  cdxBindDrop();
}

async function cdxDeployGitHub() {
  const names = Object.keys(cdxFiles);
  if (!names.length) return;
  if (!state.connected.github || !state.github.token) { cdxDeployMsg('<span class="err">Connecte GitHub d\'abord</span>'); return; }
  const repo = state.github.repo;
  const branch = state.github.branch || "main";
  if (!repo) { cdxDeployMsg('<span class="err">Selectionne un depot</span>'); return; }
  const btn = $("#codexDeployGh");
  btn.disabled = true;
  cdxDeployMsg(`☢️☢️🤝👾🥸 Preparation (${names.length} fichiers)...`);

  try {
    const refRes = await fetch(`${GH_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: ghHeaders() });
    if (!refRes.ok) throw new Error(`Branche "${branch}" introuvable`);
    const baseSha = (await refRes.json()).object.sha;
    const baseTreeSha = (await (await fetch(`${GH_API}/repos/${repo}/git/commits/${baseSha}`, { headers: ghHeaders() })).json()).tree.sha;

    cdxDeployMsg(`☢️☢️🤝👾🥸 Blobs (${names.length})...`);
    const treeItems = [];
    for (const name of names) {
      const f = cdxFiles[name];
      const payload = f.binary
        ? { content: f.dataUrl.split(",")[1], encoding: "base64" }
        : { content: f.content, encoding: "utf-8" };
      const blobRes = await fetch(`${GH_API}/repos/${repo}/git/blobs`, {
        method: "POST", headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!blobRes.ok) throw new Error(`Blob "${name}" echoue`);
      treeItems.push({ path: name, mode: "100644", type: "blob", sha: (await blobRes.json()).sha });
    }

    cdxDeployMsg("☢️☢️🤝👾🥸 Tree + Commit...");
    const treeRes = await fetch(`${GH_API}/repos/${repo}/git/trees`, {
      method: "POST", headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });
    if (!treeRes.ok) throw new Error("Echec tree");

    const msg = `☢️☢️🤝👾🥸 Deploy: [${names.join(", ")}]`;
    const commitRes = await fetch(`${GH_API}/repos/${repo}/git/commits`, {
      method: "POST", headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, tree: (await treeRes.json()).sha, parents: [baseSha] }),
    });
    if (!commitRes.ok) throw new Error("Echec commit");

    const updateRes = await fetch(`${GH_API}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH", headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sha: (await commitRes.json()).sha }),
    });
    if (!updateRes.ok) throw new Error("Echec push");

    names.forEach(n => { cdxFiles[n].status = "ready"; });
    cdxRenderFiles();
    cdxDeployMsg(`<span class="ok">☢️☢️🤝👾🥸 Succes! ${names.length} fichiers deployes sur ${branch}</span>`);
  } catch (err) {
    cdxDeployMsg(`<span class="err">☢️☢️🤝👾🥸 Erreur: ${escapeHtml(err.message)}</span>`);
  } finally { btn.disabled = false; }
}

function cdxDownloadZip() {
  const names = Object.keys(cdxFiles);
  if (!names.length) return;
  const parts = [];
  const enc = new TextEncoder();

  for (const name of names) {
    const f = cdxFiles[name];
    let data;
    if (f.binary) {
      const b64 = f.dataUrl.split(",")[1];
      const raw = atob(b64);
      data = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    } else {
      data = enc.encode(f.content);
    }
    const nameBytes = enc.encode(name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    parts.push({ header, data, nameBytes, offset: 0 });
  }

  let offset = 0;
  parts.forEach(p => { p.offset = offset; offset += p.header.length + p.data.length; });
  const centralStart = offset;
  const centralParts = [];
  parts.forEach(p => {
    const ch = new Uint8Array(46 + p.nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(20, p.data.length, true); cv.setUint32(24, p.data.length, true);
    cv.setUint16(28, p.nameBytes.length, true); cv.setUint32(42, p.offset, true);
    ch.set(p.nameBytes, 46);
    centralParts.push(ch); offset += ch.length;
  });
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, parts.length, true); ev.setUint16(10, parts.length, true);
  ev.setUint32(12, offset - centralStart, true); ev.setUint32(16, centralStart, true);

  const all = [];
  parts.forEach(p => { all.push(p.header); all.push(p.data); });
  centralParts.forEach(c => all.push(c)); all.push(end);
  const blob = new Blob(all, { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "ti-lex-codex.zip"; a.click();
  URL.revokeObjectURL(url);
}

function cdxDeployMsg(html) {
  const el = $("#codexDeployStatus");
  if (el) el.innerHTML = html;
}

cdxInitFileSystem();
if ($("#codexDeployGh")) $("#codexDeployGh").onclick = cdxDeployGitHub;
if ($("#codexDownloadZip")) $("#codexDownloadZip").onclick = cdxDownloadZip;

/* ================= ERROR STUDIO ================= */

function esAnalyze() {
  const cfg = cdxGetConfig();
  const names = Object.keys(cdxFiles);
  const results = [];

  for (const name of names) {
    const f = cdxFiles[name];
    if (f.binary) { results.push({ name, issues: [], badge: "pass" }); continue; }
    const issues = [];
    const ext = name.includes(".") ? "." + name.split(".").pop() : "";
    const content = f.content || "";

    if (cfg && cfg.fileStructure) {
      const detectedType = esDetectFileType(name, content);
      if (detectedType) {
        const tc = cfg.fileStructure[detectedType];
        if (tc) {
          if (ext && ext !== tc.extension) {
            issues.push({
              severity: "crit", title: "Extension incorrecte",
              detail: `Attendu: ${tc.extension}, actuel: ${ext}`,
              fix: { type: "rename", from: name, to: name.replace(/\.[^.]+$/, tc.extension) },
            });
          }
          const nc = cfg.namingConventions?.[detectedType];
          if (nc?.pattern && !new RegExp(nc.pattern).test(name)) {
            const suggestion = esFixNaming(name, nc.rule, tc.extension);
            issues.push({
              severity: "warn", title: "Convention de nommage",
              detail: `Règle: ${nc.rule}. Suggestion: ${suggestion}`,
              fix: suggestion !== name ? { type: "rename", from: name, to: suggestion } : null,
            });
          }
        }
      }
    }

    const bracketCheck = esCheckBrackets(content);
    if (bracketCheck) {
      issues.push({ severity: "crit", title: "Brackets non fermés", detail: bracketCheck, fix: null });
    }

    const importIssues = esCheckImports(content);
    importIssues.forEach(i => issues.push(i));

    if ((ext === ".tsx" || ext === ".ts" || ext === ".jsx" || ext === ".js") && content.length > 10) {
      if (!/\bexport\b/.test(content)) {
        issues.push({ severity: "warn", title: "Pas de export", detail: "Le fichier ne contient pas de export", fix: null });
      }
    }

    if (content.length > 0 && !content.endsWith("\n")) {
      issues.push({ severity: "info", title: "Pas de newline final", detail: "Bonne pratique: terminer le fichier par une ligne vide", fix: { type: "append-newline", file: name } });
    }

    const badge = issues.some(i => i.severity === "crit") ? "fail" : issues.some(i => i.severity === "warn") ? "warn" : "pass";
    results.push({ name, issues, badge });
  }
  return results;
}

function esDetectFileType(name, content) {
  const lower = name.toLowerCase();
  if (/^use[A-Z]/.test(name) || /\buseState\b|\buseEffect\b|\buseRef\b/.test(content)) return "hooks";
  if (/\.tsx$/.test(lower) || (/\.jsx$/.test(lower))) return "components";
  if (/\.css$/.test(lower) || /\.scss$/.test(lower)) return "styles";
  if (/types?\.(ts|js)$/i.test(lower) || /\.d\.ts$/.test(lower) || /\binterface\s/.test(content) || /\btype\s+\w+\s*=/.test(content)) return "types";
  if (/service/i.test(lower) || /api/i.test(lower)) return "services";
  if (/constant|config/i.test(lower) || /\bconst\s+[A-Z_]{3,}/.test(content)) return "constants";
  if (/page/i.test(lower)) return "pages";
  if (/store|slice|reducer/i.test(lower)) return "store";
  if (/\.ts$/.test(lower) || /\.js$/.test(lower)) return "utils";
  return null;
}

function esCheckBrackets(content) {
  const stk = [];
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const close = new Set([")", "]", "}"]);
  let inStr = false, strChar = "", escaped = false, inComment = false, inBlockComment = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (inBlockComment) { if (c === "*" && content[i + 1] === "/") { inBlockComment = false; i++; } continue; }
    if (inComment) { if (c === "\n") inComment = false; continue; }
    if (inStr) { if (c === strChar) inStr = false; continue; }
    if (c === "/" && content[i + 1] === "/") { inComment = true; continue; }
    if (c === "/" && content[i + 1] === "*") { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = true; strChar = c; continue; }
    if (pairs[c]) stk.push(c);
    else if (close.has(c)) {
      if (!stk.length) return `Fermeture '${c}' sans ouverture correspondante`;
      const open = stk.pop();
      if (pairs[open] !== c) return `'${open}' fermé par '${c}' au lieu de '${pairs[open]}'`;
    }
  }
  if (stk.length) return `'${stk[stk.length - 1]}' jamais fermé (${stk.length} ouvert${stk.length > 1 ? "s" : ""})`;
  return null;
}

function esCheckImports(content) {
  const issues = [];
  const importRegex = /import\s+.*?\s+from\s+['"](\.\..*)['"]|require\s*\(\s*['"](\.\..*)['"]|\bfrom\s+['"](\.\..*)['"]|import\s*\(\s*['"](\.\..*)['"]|import\s+['"](\.\..*)['"]$/gm;
  let m;
  while ((m = importRegex.exec(content)) !== null) {
    const path = m[1] || m[2] || m[3] || m[4] || m[5];
    if (path && path.startsWith("..")) {
      issues.push({
        severity: "warn", title: "Import relatif",
        detail: `"${path}" — utiliser @/ alias plutôt`,
        fix: null,
      });
    }
  }
  return issues;
}

function esFixNaming(name, rule, ext) {
  const base = name.replace(/\.[^.]+$/, "");
  switch (rule) {
    case "PascalCase": return base.charAt(0).toUpperCase() + base.slice(1).replace(/[-_](\w)/g, (_, c) => c.toUpperCase()) + ext;
    case "camelCase": return base.charAt(0).toLowerCase() + base.slice(1).replace(/[-_](\w)/g, (_, c) => c.toUpperCase()) + ext;
    case "kebab-case": return base.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/_/g, "-") + ext;
    case "UPPER_SNAKE_CASE": return base.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase() + ext;
    default: return name;
  }
}

function esOpenErrorStudio() {
  const panel = $("#esPanel");
  if (!panel) return;
  panel.classList.toggle("open");
  if (panel.classList.contains("open")) esRunCheck();
}

function esRunCheck() {
  const results = esAnalyze();
  const summary = $("#esSummary");
  const body = $("#esBody");
  const fixAllBtn = $("#esFixAll");
  const deployBtn = $("#esDeployBtn");

  let critCount = 0, warnCount = 0, okCount = 0;
  results.forEach(r => {
    if (r.badge === "fail") critCount++;
    else if (r.badge === "warn") warnCount++;
    else okCount++;
  });

  summary.innerHTML =
    `<span class="es-stat es-stat-ok">✅ ${okCount} OK</span>` +
    (critCount ? `<span class="es-stat es-stat-err">🔴 ${critCount} Critique${critCount > 1 ? "s" : ""}</span>` : "") +
    (warnCount ? `<span class="es-stat es-stat-warn">🟡 ${warnCount} Avertissement${warnCount > 1 ? "s" : ""}</span>` : "") +
    `<span class="es-stat es-stat-info">📁 ${results.length} fichier${results.length > 1 ? "s" : ""}</span>`;

  const totalFixes = results.reduce((n, r) => n + r.issues.filter(i => i.fix).length, 0);
  fixAllBtn.style.display = totalFixes > 0 ? "" : "none";
  deployBtn.style.display = critCount === 0 ? "" : "none";

  if (!results.length) {
    body.innerHTML = '<div class="es-all-good"><div class="es-all-good-icon">📭</div><div class="es-all-good-text">Aucun fichier</div><div class="es-all-good-sub">Ajoute des fichiers au Codex pour les analyser</div></div>';
    return;
  }

  if (critCount === 0 && warnCount === 0) {
    body.innerHTML = '<div class="es-all-good"><div class="es-all-good-icon">✅</div><div class="es-all-good-text">Aucune erreur trouvée!</div><div class="es-all-good-sub">Tous les fichiers passent la validation. Prêt à déployer.</div></div>';
    return;
  }

  body.innerHTML = results.map(r => {
    const badgeCls = r.badge === "pass" ? "es-badge-pass" : r.badge === "fail" ? "es-badge-fail" : "es-badge-warn";
    const badgeText = r.badge === "pass" ? "OK" : r.badge === "fail" ? "ERREUR" : "AVERT.";
    const icon = cdxIcon(r.name);
    const issuesHtml = r.issues.length ? '<div class="es-file-issues">' + r.issues.map((issue, idx) => {
      const cls = issue.severity === "crit" ? "es-issue-crit" : issue.severity === "warn" ? "es-issue-warn" : "es-issue-info";
      const ico = issue.severity === "crit" ? "🔴" : issue.severity === "warn" ? "🟡" : "🔵";
      const fixBtn = issue.fix ? `<button class="es-issue-fix" data-file="${escapeHtml(r.name)}" data-fix-idx="${idx}">✏️ Fix</button>` : "";
      return `<div class="es-issue ${cls}"><span class="es-issue-icon">${ico}</span><div class="es-issue-body"><div class="es-issue-title">${escapeHtml(issue.title)}</div><div class="es-issue-detail">${escapeHtml(issue.detail)}</div></div>${fixBtn}</div>`;
    }).join("") + "</div>" : "";
    return `<div class="es-file-block" data-file="${escapeHtml(r.name)}"><div class="es-file-head"><span class="es-file-icon">${icon}</span><span class="es-file-name">${escapeHtml(r.name)}</span><span class="es-file-badge ${badgeCls}">${badgeText}</span></div>${issuesHtml}</div>`;
  }).join("");

  body.querySelectorAll(".es-issue-fix").forEach(btn => {
    btn.onclick = function(e) {
      e.stopPropagation();
      const fileName = this.dataset.file;
      const fixIdx = parseInt(this.dataset.fixIdx, 10);
      const fileResult = results.find(r => r.name === fileName);
      if (!fileResult) return;
      const issue = fileResult.issues[fixIdx];
      if (!issue || !issue.fix) return;
      esApplyFix(issue.fix);
      this.textContent = "✓ Fixé";
      this.classList.add("fixed");
      setTimeout(() => esRunCheck(), 600);
    };
  });
}

function esApplyFix(fix) {
  if (fix.type === "rename") {
    if (cdxFiles[fix.from] && !cdxFiles[fix.to]) {
      cdxFiles[fix.to] = cdxFiles[fix.from];
      delete cdxFiles[fix.from];
      cdxRenderFiles();
    }
  } else if (fix.type === "append-newline") {
    const f = cdxFiles[fix.file];
    if (f && !f.binary && f.content !== undefined) {
      f.content += "\n";
      f.size = f.content.length;
    }
  }
}

(function initErrorStudio() {
  const panel = $("#esPanel");
  if (!panel) return;
  const close = () => { panel.classList.remove("open"); };
  if ($("#esClose")) $("#esClose").onclick = close;
  if ($("#esCloseBtn")) $("#esCloseBtn").onclick = close;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && panel.classList.contains("open")) close(); });
  if ($("#esRecheck")) $("#esRecheck").onclick = esRunCheck;
  if ($("#esFixAll")) {
    $("#esFixAll").onclick = () => {
      const results = esAnalyze();
      results.forEach(r => r.issues.forEach(i => { if (i.fix) esApplyFix(i.fix); }));
      cdxRenderFiles();
      setTimeout(esRunCheck, 200);
    };
  }
  if ($("#esDeployBtn")) {
    $("#esDeployBtn").onclick = () => {
      close();
      cdxDeployGitHub();
    };
  }
  if ($("#codexErrorStudioBtn")) $("#codexErrorStudioBtn").onclick = esOpenErrorStudio;
})();

/* ================= STUDIO ================= */
let studioZipFiles = [];
let studioGhFiles = [];
let studioCurrentFile = null;
let studioTempCounter = 0;

/* Coloration syntaxique en temps réel dans l'éditeur Studio */
const STUDIO_HL_MAX = 150_000; // au-delà, pas de coloration (perf)
let studioHlTimer = null;
function studioSyncHighlight() {
  const codeArea = $("#studioCode");
  const hl = $("#studioCodeHighlight");
  if (!codeArea || !hl) return;
  const val = codeArea.value;
  if (val.length > STUDIO_HL_MAX) {
    hl.textContent = val;
  } else {
    // \n final : le pre doit matcher la hauteur exacte du textarea
    hl.innerHTML = highlightSyntax(escapeHtml(val)) + (val.endsWith("\n") ? " " : "");
  }
  hl.scrollTop = codeArea.scrollTop;
  hl.scrollLeft = codeArea.scrollLeft;
}
function studioHlDebounced() {
  clearTimeout(studioHlTimer);
  studioHlTimer = setTimeout(studioSyncHighlight, 60);
}
(function initStudioHighlight() {
  const codeArea = $("#studioCode");
  if (!codeArea) return;
  codeArea.addEventListener("input", studioHlDebounced);
  codeArea.addEventListener("scroll", () => {
    const hl = $("#studioCodeHighlight");
    if (hl) { hl.scrollTop = codeArea.scrollTop; hl.scrollLeft = codeArea.scrollLeft; }
  });
})();

function openInStudio(code, suggestedName) {
  const name = suggestedName || `snippet-${++studioTempCounter}.txt`;
  const codeArea = $("#studioCode");
  const pathLabel = $("#studioFilePath");
  const pushBtn = $("#studioPushGh");
  codeArea.value = code;
  studioSyncHighlight();
  pathLabel.textContent = name;
  studioCurrentFile = { path: name, source: "snippet" };
  pushBtn.classList.toggle("hidden", !state.connected.github);
  switchView("studio");
}

async function refreshStudio() {
  const tree = $("#studioTree");
  const label = $("#studioSrcLabel");
  if (!tree) return;

  let allFiles = [];

  // GitHub files
  if (state.connected.github && state.github.repo && state.github.token) {
    label.textContent = `GitHub: ${state.github.repo} (${state.github.branch})`;
    try {
      const res = await fetch(`${GH_API}/repos/${state.github.repo}/git/trees/${encodeURIComponent(state.github.branch)}?recursive=1`, { headers: ghHeaders() });
      if (res.ok) {
        const data = await res.json();
        studioGhFiles = (data.tree || []).filter(t => t.type === "blob").map(t => ({
          path: t.path, source: "github", sha: t.sha
        }));
        allFiles.push(...studioGhFiles);
      }
    } catch (_) {}
  }

  // ZIP files
  if (studioZipFiles.length) {
    if (!allFiles.length) label.textContent = t("studioZipLabel");
    else label.textContent += " + ZIP";
    allFiles.push(...studioZipFiles.map(z => ({ path: z.path, source: "zip", content: z.content })));
  }

  if (!allFiles.length) {
    tree.innerHTML = `<p class="muted" style="padding:12px;font-size:.8rem">${t("studioHelp")}</p>`;
    return;
  }

  // Group by folder
  const folders = {};
  allFiles.forEach(f => {
    const parts = f.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
    if (!folders[folder]) folders[folder] = [];
    folders[folder].push(f);
  });

  let html = "";
  for (const [folder, files] of Object.entries(folders).sort()) {
    html += `<div class="studio-tree-folder">${escapeHtml(folder === "/" ? t("studioRoot") : folder)}</div>`;
    files.forEach(f => {
      html += `<div class="studio-tree-item" data-path="${escapeHtml(f.path)}" data-src="${f.source}"><span class="f-ico">${fileIcon(f.path)}</span>${escapeHtml(f.path.split("/").pop())}</div>`;
    });
  }
  tree.innerHTML = html;

  $$(".studio-tree-item", tree).forEach(item => {
    item.onclick = () => loadStudioFile(item.dataset.path, item.dataset.src, allFiles);
  });
}

async function loadStudioFile(path, source, allFiles) {
  const codeArea = $("#studioCode");
  const pathLabel = $("#studioFilePath");
  const pushBtn = $("#studioPushGh");
  studioCurrentFile = { path, source };
  pathLabel.textContent = path;
  $$(".studio-tree-item").forEach(i => i.classList.toggle("active", i.dataset.path === path));

  if (source === "zip") {
    const zf = studioZipFiles.find(z => z.path === path);
    codeArea.value = zf?.content || t("studioBinaryFile");
  } else if (source === "github") {
    codeArea.value = t("loading");
    try {
      const res = await fetch(`${GH_API}/repos/${state.github.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(state.github.branch)}`, { headers: ghHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      codeArea.value = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
      studioCurrentFile.sha = data.sha;
    } catch (err) {
      codeArea.value = `${t("apiError")} ${err.message}`;
    }
  }
  studioSyncHighlight();

  pushBtn.classList.toggle("hidden", !state.connected.github);
}

if ($("#studioRefresh")) {
  $("#studioRefresh").onclick = refreshStudio;
}
if ($("#studioPushGh")) {
  $("#studioPushGh").onclick = async () => {
    if (!studioCurrentFile) return;
    const content = $("#studioCode").value;
    const path = studioCurrentFile.path;
    const commitMsg = prompt(`${t("alertCommitMsg")}`, `${t("commitMsgStudio")} ${path} ${t("commitMsgStudioVia")}`);
    if (!commitMsg) return;
    const body = {
      message: commitMsg,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: state.github.branch,
    };
    if (studioCurrentFile.sha) body.sha = studioCurrentFile.sha;
    try {
      const res = await fetch(`${GH_API}/repos/${state.github.repo}/contents/${encodeURIComponent(path)}`, {
        method: "PUT", headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.json()).message || ""}`);
      const data = await res.json();
      studioCurrentFile.sha = data.content?.sha;
      alert(`${t("studioPushed")} ${state.github.repo}/${state.github.branch}/${path}`);
    } catch (err) {
      alert(`${t("studioPushErr")} ${err.message}`);
    }
  };
}

/* ============ STUDIO PREVIEW (live HTML preview pane inside chat) ============ */
let spCurrentHtml = "";
let spShowCode = false;
let lastAttachedImages = [];

function openStudioPreview(htmlCode) {
  spCurrentHtml = htmlCode;
  const panel = $("#studioPreview");
  const chatView = $("#view-chat");
  const frame = $("#spFrame");
  const source = $("#spSource");

  panel.classList.add("open");
  chatView.classList.add("studio-open");
  source.value = htmlCode;
  spShowCode = false;
  source.classList.add("hidden");
  frame.classList.remove("hidden");
  $("#spCodeToggle").classList.remove("active");

  renderPreviewFrame(htmlCode);
  setTimeout(() => { messages.scrollTop = messages.scrollHeight; }, 400);
}

function renderPreviewFrame(html) {
  const frame = $("#spFrame");
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

function closeStudioPreview() {
  const panel = $("#studioPreview");
  const chatView = $("#view-chat");
  panel.classList.remove("open");
  chatView.classList.remove("studio-open");
}

if ($("#spClose")) {
  $("#spClose").onclick = closeStudioPreview;
}

if ($("#spCodeToggle")) {
  $("#spCodeToggle").onclick = () => {
    spShowCode = !spShowCode;
    $("#spSource").classList.toggle("hidden", !spShowCode);
    const frame = $("#spFrame");
    if (spShowCode) {
      frame.style.display = "none";
    } else {
      frame.style.display = "";
      renderPreviewFrame(spCurrentHtml);
    }
    $("#spCodeToggle").classList.toggle("active", spShowCode);
  };
}

if ($("#spDownload")) {
  $("#spDownload").onclick = () => {
    if (!spCurrentHtml) return;
    const blob = new Blob([spCurrentHtml], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "studio-preview.html";
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

function injectImagesIntoHtml(html, images) {
  if (!images || !images.length) return html;
  let result = html;
  images.forEach((img, i) => {
    const placeholder = new RegExp(`\\{\\{IMAGE_${i}\\}\\}|\\{\\{image_${i}\\}\\}|\\{\\{IMAGE\\}\\}`, "g");
    result = result.replace(placeholder, img.dataUrl);
  });
  if (images.length === 1) {
    result = result.replace(/\{\{IMAGE\}\}/g, images[0].dataUrl);
  }
  return result;
}

function extractHtmlBlock(text) {
  const htmlFull = text.match(/```html\n([\s\S]*?)```/);
  if (htmlFull) {
    const code = htmlFull[1].trim();
    if (code.includes("<!DOCTYPE") || code.includes("<html") || (code.includes("<head") && code.includes("<body"))) {
      return code;
    }
    if (code.includes("<style") || code.includes("<canvas") || code.includes("<div")) {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:100vh}</style></head><body>${code}</body></html>`;
    }
  }
  return null;
}

function addPreviewButton(container, fullText) {
  const html = extractHtmlBlock(fullText);
  if (!html) return;

  const existing = container.querySelector(".sp-preview-btn");
  if (existing) existing.remove();

  const btn = document.createElement("button");
  btn.className = "sp-preview-btn";
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> ${t("previewStudio")}`;
  btn.onclick = () => {
    const enriched = injectImagesIntoHtml(html, lastAttachedImages);
    openStudioPreview(enriched);
  };
  container.appendChild(btn);
}

/* ============ COMPTE (Account page) ============ */
function loadAcctProfile() {
  const name = localStorage.getItem("tilex-acct-name") || "";
  const email = localStorage.getItem("tilex-acct-email") || "";
  const photo = localStorage.getItem("tilex-acct-photo") || "";
  if (name && $("#acctName")) $("#acctName").textContent = name;
  if (email && $("#acctEmail")) $("#acctEmail").textContent = email;
  if (photo && $("#acctAvatarImg")) {
    $("#acctAvatarImg").src = photo;
    $("#acctAvatarImg").classList.remove("hidden");
    $("#acctAvatarDefault").style.display = "none";
  }
}

const PLAN_DATA = {
  flux: { name: "FLUX", price: "$19 CAD/mois", msgWindow: 40, agents: 5, models: "Sonnet 4.6", codexProjects: 2, codexSessions: 10, storage: "1 GB" },
  surge: { name: "SURGE", price: "$39 CAD/mois", msgWindow: 100, agents: 15, models: "Sonnet 4.6", codexProjects: 5, codexSessions: 50, storage: "5 GB" },
  apex:  { name: "APEX", price: "$79 CAD/mois", msgWindow: 250, agents: -1, models: "Sonnet 4.6 + Opus 4.8", opusMessages: 100, codexProjects: 20, codexSessions: -1, storage: "10 GB" },
};

function refreshAccountPage() {
  const s = I18N[state.lang] || I18N.fr;

  if ($("#acctSubTitle")) $("#acctSubTitle").textContent = s.acctSub;
  if ($("#acctPrefTitle")) $("#acctPrefTitle").textContent = s.acctPref;
  if ($("#acctUsageTitle")) $("#acctUsageTitle").textContent = s.acctUsage;
  if ($("#acctConnTitle")) $("#acctConnTitle").textContent = s.acctConns;
  if ($("#acctDaysLabel")) $("#acctDaysLabel").textContent = s.acctDaysLeft;
  if ($("#acctMsgLabel")) $("#acctMsgLabel").textContent = s.acctMsgToday;
  if ($("#acctMsgLimitLabel")) $("#acctMsgLimitLabel").textContent = s.acctMsgLimit;
  if ($("#acctManageBtn")) $("#acctManageBtn").textContent = s.acctManage;
  if ($("#acctLangLabel")) $("#acctLangLabel").textContent = s.acctLang;
  if ($("#acctThemeLabel")) $("#acctThemeLabel").textContent = s.acctTheme;
  if ($("#acctModelLabel")) $("#acctModelLabel").textContent = s.acctModel;
  if ($("#acctUsageText")) $("#acctUsageText").textContent = s.acctMsgUsed;
  if ($("#acctImgText")) $("#acctImgText").textContent = s.acctImgUsed;
  if ($("#acctStorageText")) $("#acctStorageText").textContent = s.acctStorage;
  if ($("#acctLogoutBtn")) $("#acctLogoutBtn").textContent = s.acctLogout;
  if ($("#acctEditTitle")) $("#acctEditTitle").textContent = s.acctEditProfile || "Modifier le profil";
  if ($("#acctNameLabel")) $("#acctNameLabel").textContent = s.acctNameLabel || "Nom";
  if ($("#acctEmailLabel")) $("#acctEmailLabel").textContent = s.acctEmailLabel || "Courriel";
  if ($("#acctSaveBtn")) $("#acctSaveBtn").textContent = s.acctSave || "Enregistrer";
  if ($("#acctCancelEditBtn")) $("#acctCancelEditBtn").textContent = s.acctCancel || "Annuler";
  if ($("#acctDetailMsgMonthLabel")) $("#acctDetailMsgMonthLabel").textContent = s.acctMsgMonth;
  if ($("#acctDetailAgentsLabel")) $("#acctDetailAgentsLabel").textContent = s.acctAgents;
  if ($("#acctDetailModelsLabel")) $("#acctDetailModelsLabel").textContent = s.acctModels;
  if ($("#acctDetailThinkingLabel")) $("#acctDetailThinkingLabel").textContent = s.acctThinking;
  if ($("#acctDetailCodexLabel")) $("#acctDetailCodexLabel").textContent = s.acctCodex;
  if ($("#acctDetailImgLabel")) $("#acctDetailImgLabel").textContent = (s.acctImgUsed || "Images") + " / " + (state.lang === "en" ? "month" : "mois");

  loadAcctProfile();

  const planKey = localStorage.getItem("tilex-plan") || "";
  const plan = PLAN_DATA[planKey] || null;

  if ($("#acctPlanBadge")) {
    $("#acctPlanBadge").textContent = plan ? plan.name : (s.acctNoPlan || "—");
  }
  if ($("#acctPlanPrice")) {
    $("#acctPlanPrice").textContent = plan ? plan.price : "";
  }

  const subEnd = localStorage.getItem("tilex-sub-end");
  if ($("#acctDaysLeft")) {
    if (subEnd) {
      const days = Math.max(0, Math.ceil((new Date(subEnd) - Date.now()) / 86400000));
      $("#acctDaysLeft").textContent = days;
      if ($("#acctPlanStatus")) {
        $("#acctPlanStatus").textContent = days > 0 ? s.acctActive : s.acctExpired;
        $("#acctPlanStatus").style.color = days > 0 ? "#3ecf8e" : "#e53e3e";
      }
    } else {
      $("#acctDaysLeft").textContent = "—";
      if ($("#acctPlanStatus")) {
        $("#acctPlanStatus").textContent = plan ? s.acctActive : "";
        $("#acctPlanStatus").style.color = "#3ecf8e";
      }
    }
  }

  const msgLimit = plan ? plan.msgWindow : 0;
  const todayKey = `tilex-msg-${new Date().toISOString().slice(0, 10)}`;
  const msgCount = parseInt(localStorage.getItem(todayKey) || "0", 10);
  if ($("#acctMsgCount")) $("#acctMsgCount").textContent = msgCount;
  if ($("#acctMsgLimit")) $("#acctMsgLimit").textContent = plan ? msgLimit : "—";
  if (plan && msgLimit) {
    if ($("#acctUsageVal")) $("#acctUsageVal").textContent = `${msgCount} / ${msgLimit}`;
    if ($("#acctUsageFill")) $("#acctUsageFill").style.width = Math.min(100, (msgCount / msgLimit) * 100) + "%";
  } else {
    if ($("#acctUsageVal")) $("#acctUsageVal").textContent = `${msgCount}`;
    if ($("#acctUsageFill")) $("#acctUsageFill").style.width = "0%";
  }

  const imgKey = `tilex-img-${new Date().toISOString().slice(0, 7)}`;
  const imgCount = parseInt(localStorage.getItem(imgKey) || "0", 10);
  if ($("#acctImgVal")) $("#acctImgVal").textContent = `${imgCount}`;
  if ($("#acctImgFill")) $("#acctImgFill").style.width = "0%";

  if ($("#acctDetailMsgMonth")) $("#acctDetailMsgMonth").textContent = plan ? (plan.msgWindow + " / fenêtre 12h") : "—";
  if ($("#acctDetailAgents")) $("#acctDetailAgents").textContent = plan ? (plan.agents === -1 ? "Illimités" : plan.agents) : "—";
  if ($("#acctDetailModels")) $("#acctDetailModels").textContent = plan ? plan.models : "—";
  if ($("#acctDetailThinking")) $("#acctDetailThinking").textContent = plan ? plan.storage : "—";
  if ($("#acctDetailCodex")) $("#acctDetailCodex").textContent = plan ? (plan.codexSessions === -1 ? "Illimité" : plan.codexSessions + " sessions") : "—";
  if ($("#acctDetailImg")) $("#acctDetailImg").textContent = plan ? (plan.codexProjects + " projets") : "—";

  let totalStorage = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      totalStorage += (localStorage.getItem(k) || "").length * 2;
    }
  } catch (_) {}
  const storageMB = (totalStorage / 1048576).toFixed(1);
  const maxMB = 5;
  if ($("#acctStorageVal")) $("#acctStorageVal").textContent = `${storageMB} / ${maxMB} Mo`;
  if ($("#acctStorageFill")) $("#acctStorageFill").style.width = Math.min(100, (parseFloat(storageMB) / maxMB) * 100) + "%";

  const modelNames = { "claude-opus-4-8": "Opus 4.8", "claude-sonnet-4-6": "Sonnet 4.6", "claude-haiku-4-5-20251001": "Haiku 4.5" };
  if ($("#acctModelVal")) $("#acctModelVal").textContent = modelNames[state.model] || state.model;

  if ($("#acctGhStatus")) {
    const gh = state.connected.github;
    $("#acctGhStatus").textContent = gh ? s.acctConn : s.acctNotConn;
    $("#acctGhStatus").classList.toggle("connected", gh);
  }
  if ($("#acctSbStatus")) {
    const sb = state.connected.supabase;
    $("#acctSbStatus").textContent = sb ? s.acctConn : s.acctNotConn;
    $("#acctSbStatus").classList.toggle("connected", sb);
  }
  if ($("#acctVercelStatus")) {
    const vc = state.connected.vercel;
    $("#acctVercelStatus").textContent = vc ? s.acctConn : s.acctNotConn;
    $("#acctVercelStatus").classList.toggle("connected", vc);
  }

  if ($("#acctThemeToggle")) {
    const isDark = document.body.dataset.theme !== "light";
    $("#acctThemeToggle").setAttribute("aria-pressed", !isDark);
    $("#acctThemeToggle").querySelector(".pill-txt").textContent = isDark ? (s.setDark || "Sombre") : (s.setLight || "Clair");
    if (isDark) $("#acctThemeToggle").classList.remove("active");
    else $("#acctThemeToggle").classList.add("active");
  }

  if ($("#acctLangSelect")) $("#acctLangSelect").value = state.lang;
}

/* Edit profile toggle */
if ($("#acctEditBtn")) {
  $("#acctEditBtn").onclick = () => {
    const card = $("#acctEditCard");
    card.classList.toggle("hidden");
    if (!card.classList.contains("hidden")) {
      $("#acctNameInput").value = localStorage.getItem("tilex-acct-name") || "";
      $("#acctEmailInput").value = localStorage.getItem("tilex-acct-email") || "";
      $("#acctNameInput").focus();
    }
  };
}

if ($("#acctCancelEditBtn")) {
  $("#acctCancelEditBtn").onclick = () => {
    $("#acctEditCard").classList.add("hidden");
  };
}

if ($("#acctSaveBtn")) {
  $("#acctSaveBtn").onclick = () => {
    const name = $("#acctNameInput").value.trim();
    const email = $("#acctEmailInput").value.trim();
    if (name) localStorage.setItem("tilex-acct-name", name);
    if (email) localStorage.setItem("tilex-acct-email", email);
    $("#acctEditCard").classList.add("hidden");
    refreshAccountPage();
  };
}

/* Avatar photo upload */
if ($("#acctAvatarEditBtn")) {
  $("#acctAvatarEditBtn").onclick = () => $("#acctPhotoInput").click();
}

if ($("#acctPhotoInput")) {
  $("#acctPhotoInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      try { localStorage.setItem("tilex-acct-photo", dataUrl); } catch (_) {}
      $("#acctAvatarImg").src = dataUrl;
      $("#acctAvatarImg").classList.remove("hidden");
      $("#acctAvatarDefault").style.display = "none";
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
}

if ($("#acctLangSelect")) {
  $("#acctLangSelect").onchange = (e) => {
    state.lang = e.target.value;
    try { localStorage.setItem(LS_LANG, state.lang); } catch (_) {}
    applyLang();
    refreshAccountPage();
  };
}

if ($("#acctThemeToggle")) {
  $("#acctThemeToggle").onclick = () => {
    const isLight = document.body.dataset.theme === "light";
    document.body.dataset.theme = isLight ? "dark" : "light";
    try { localStorage.setItem("tilex-theme", document.body.dataset.theme); } catch (_) {}
    refreshAccountPage();
  };
}

if ($("#acctManageBtn")) {
  $("#acctManageBtn").onclick = () => switchView("forfaits");
}

if ($("#acctLogoutBtn")) {
  $("#acctLogoutBtn").onclick = () => {
    if (!confirm(state.lang === "en" ? "Clear all data and sign out?" : "Effacer toutes les données et se déconnecter ?")) return;
    localStorage.clear();
    location.reload();
  };
}

/* init */
loadSettings();

(function handleCheckoutReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get("checkout") === "success" && params.get("plan")) {
    const plan = params.get("plan");
    if (["flux", "surge", "apex"].includes(plan)) {
      localStorage.setItem("tilex-plan", plan);
    }
    history.replaceState(null, "", location.pathname);
  }
})();

(async function syncPlanFromDB() {
  const session = getSupabaseSession();
  if (!session?.user?.id) return;
  try {
    const tk = proxyToken();
    const res = await fetch(
      `${SUPABASE_REST}/profiles?select=plan,display_name&id=eq.${session.user.id}`,
      { headers: { apikey: tk, Authorization: `Bearer ${session.access_token}` } }
    );
    if (!res.ok) return;
    const rows = await res.json();
    if (rows[0]?.plan) {
      const planMap = { starter: "flux", pro: "surge", industriel: "apex" };
      const normalized = planMap[rows[0].plan] || rows[0].plan;
      localStorage.setItem("tilex-plan", normalized);
    }
    if (rows[0]?.display_name && !localStorage.getItem("tilex-acct-name")) {
      localStorage.setItem("tilex-acct-name", rows[0].display_name);
    }
    if (!localStorage.getItem("tilex-acct-email") && session.user.email) {
      localStorage.setItem("tilex-acct-email", session.user.email);
    }
    enforceModelRestrictions();
    if (typeof refreshAccountPage === "function") refreshAccountPage();
  } catch (_) {}
})();

enforceModelRestrictions();
$("#modelSelect").value = state.model;
if ($("#langSelect")) {
  $("#langSelect").value = state.lang;
  $("#langSelect").onchange = (e) => {
    state.lang = e.target.value;
    try { localStorage.setItem(LS_LANG, state.lang); } catch (_) {}
    applyLang();
  };
}
applyLang();
loadAcctProfile();


// ── Codex Matrix Animation ──
(function initCodexMatrix() {
  const MATRIX_CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン日月火水木金土天地人龍鬼神風雷雨雪花星空海山川森光闇力命魂心夢幻影刃剣盾甲冑壱弐参零壹貳參肆伍陸柒捌玖拾";
  const CYCLE = 10000;
  const MATRIX_PHASE = 3000;
  const REVEAL_PHASE = 2000;
  let cdxTimers = [];

  function getCodexWord() {
    const s = I18N[state.lang] || I18N.fr;
    return s.nav?.codex || "Codex";
  }

  function runCycle() {
    const letters = $$(".cdx-letter");
    if (!letters.length) return;
    const word = getCodexWord();

    cdxTimers.forEach(t => clearTimeout(t));
    cdxTimers.forEach(t => clearInterval(t));
    cdxTimers = [];

    letters.forEach((el, i) => {
      el.className = "cdx-letter cdx-matrix";
      el.textContent = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
    });

    const matrixIntervals = letters.map((el) => {
      const iv = setInterval(() => {
        el.textContent = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
      }, 80);
      cdxTimers.push(iv);
      return iv;
    });

    letters.forEach((el, i) => {
      const t = setTimeout(() => {
        clearInterval(matrixIntervals[i]);
        el.textContent = word[i] || "";
        el.className = "cdx-letter cdx-reveal";
        const t2 = setTimeout(() => { el.className = "cdx-letter cdx-idle"; }, 400);
        cdxTimers.push(t2);
      }, MATRIX_PHASE + i * (REVEAL_PHASE / word.length));
      cdxTimers.push(t);
    });

    const spotStart = MATRIX_PHASE + REVEAL_PHASE + 300;
    letters.forEach((el, i) => {
      const t = setTimeout(() => {
        el.className = "cdx-letter cdx-spot";
        const t2 = setTimeout(() => { el.className = "cdx-letter cdx-idle"; }, 600);
        cdxTimers.push(t2);
      }, spotStart + i * 700);
      cdxTimers.push(t);
    });
  }

  runCycle();
  setInterval(runCycle, CYCLE);
})();

// restaure les champs de connexion
if (state.apiKey) {
  const inp = $("#apiKeyInput"); if (inp) inp.value = state.apiKey;
  const st = $("#apiKeyState"); if (st) { st.textContent = "✓ active"; st.classList.add("ok"); }
}
if ($("#apiKeySave")) {
  $("#apiKeySave").onclick = () => {
    const val = $("#apiKeyInput").value.trim();
    if (!val) return;
    state.apiKey = val;
    try { localStorage.setItem(LS_API, val); } catch (_) {}
    const st = $("#apiKeyState"); if (st) { st.textContent = "✓ active"; st.classList.add("ok"); }
  };
}
if ($("#apiKeyClear")) {
  $("#apiKeyClear").onclick = () => {
    state.apiKey = "";
    try { localStorage.removeItem(LS_API); } catch (_) {}
    const inp = $("#apiKeyInput"); if (inp) inp.value = "";
    const st = $("#apiKeyState"); if (st) { st.textContent = "— optionnel"; st.classList.remove("ok"); }
  };
}
if (state.github.token) $("#ghToken").value = state.github.token;
if (state.supabase.url) $("#sbUrl").value = state.supabase.url;
if (state.supabase.key) $("#sbKey").value = state.supabase.key;

// ré-applique l'état "connecté" sur les boutons (après loadSettings)
Object.keys(state.connected).forEach(s => {
  if (state.connected[s]) $$(`.conn-btn[data-service="${s}"]`).forEach(b => b.classList.add("connected"));
});
if (state.connected.github) { setGhState(t("connectedMark"), true); }
if (state.connected.supabase) { setSbState(t("connectedMark"), true); }

syncReflexion();
syncCodexProjects();
renderCodexConvos();
renderProjConvs();
renderChatConvs();
renderAttachStrip();
refreshStudio();
loadMemory();
renderMemory();

// Boutons mémoire
if ($("#memoryAddBtn")) {
  $("#memoryAddBtn").onclick = () => {
    const inp = $("#memoryInput");
    const val = inp.value.trim();
    if (!val) return;
    addMemory(val);
    inp.value = "";
  };
}
if ($("#memoryClearBtn")) {
  $("#memoryClearBtn").onclick = () => {
    if (!confirm(t("alertClearMemory"))) return;
    memory = [];
    saveMemory();
  };
}

// reconnexion GitHub auto (recharge dépôts + branches + codex)
if (state.github.token) {
  ghConnect();
  if ($("#codexGhToken")) $("#codexGhToken").value = state.github.token;
  codexGhConnect();
}

/* ================= SÉCURITÉ — SOW ================= */

async function sowQuery(table, method, body, matchFilter) {
  const sb = state.supabase.client;
  if (!sb) return { data: null, error: { message: "Supabase non initialisé" } };
  let q = sb.from(table);
  if (method === "select") q = q.select(body || "*");
  else if (method === "insert") q = q.insert(body);
  else if (method === "update") q = q.update(body);
  if (matchFilter) for (const [k, v] of Object.entries(matchFilter)) q = q.eq(k, v);
  return await q;
}

async function loadSecurityDashboard() {
  const userId = state.supabase.client?.auth?.user?.()?.id
    || (await state.supabase.client?.auth?.getUser?.())?.data?.user?.id;
  if (!userId) return;

  const { data: sows } = await sowQuery("scan_authorizations", "select", "id,status", { user_id: userId });
  const activeCount = sows ? sows.filter(s => s.status === "active").length : 0;
  const el = document.getElementById("sowCount");
  if (el) el.textContent = activeCount;

  const { data: scans } = await sowQuery("scans", "select", "id,status", { user_id: userId });
  const scanEl = document.getElementById("scanCount");
  const scanLbl = document.getElementById("scanLabel");
  if (scans && scans.length > 0) {
    if (scanEl) scanEl.textContent = scans.length;
    if (scanLbl) scanLbl.textContent = t("total");
  } else {
    if (scanEl) scanEl.textContent = activeCount > 0 ? "0" : "—";
    if (scanLbl) scanLbl.textContent = activeCount > 0 ? t("ready") : t("secPending");
  }

  const { data: findings } = await sowQuery("scan_findings", "select", "id", {});
  const fEl = document.getElementById("findingCount");
  if (fEl) fEl.textContent = findings && findings.length > 0 ? findings.length : "—";

  await loadSowList(userId);
  loadCyberDashboard();
}

async function loadSowList(userId) {
  if (!userId) {
    const u = await state.supabase.client?.auth?.getUser?.();
    userId = u?.data?.user?.id;
  }
  if (!userId) return;

  const { data: sows } = await state.supabase.client
    .from("scan_authorizations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const list = document.getElementById("sowList");
  if (!list) return;

  if (!sows || sows.length === 0) {
    list.innerHTML = `<p class="muted" style="font-size:.85rem;padding:8px 0">${t("noSow")}</p>`;
    return;
  }

  list.innerHTML = sows.map(s => {
    const scopeIn = Array.isArray(s.scope_in) ? s.scope_in.join(", ") : "";
    const _dl = state.lang === "en" ? "en-CA" : "fr-CA";
    const start = s.starts_at ? new Date(s.starts_at).toLocaleDateString(_dl) : "—";
    const end = s.expires_at ? new Date(s.expires_at).toLocaleDateString(_dl) : "—";
    const actions = s.status === "draft"
      ? `<button class="sow-btn-activate" onclick="activateSow('${s.id}')">${t("secActivate")}</button>
         <button class="sow-btn-revoke" onclick="revokeSow('${s.id}')">${t("delete_")}</button>`
      : s.status === "active"
      ? `<button class="sow-btn-revoke" onclick="revokeSow('${s.id}')">${t("secRevoke")}</button>`
      : "";
    return `<div class="sow-item">
      <div class="sow-item-info">
        <div class="sow-item-title">${escapeHtml(s.title)}</div>
        <div class="sow-item-client">${escapeHtml(s.client_name)}</div>
        <div class="sow-item-scope">Scope: ${escapeHtml(scopeIn || t("secNotDefined"))}</div>
        <div class="sow-item-dates">${start} → ${end}</div>
      </div>
      <span class="sow-badge ${s.status}">${s.status}</span>
      <div class="sow-item-actions">${actions}</div>
    </div>`;
  }).join("");
}

async function createSow() {
  const title = document.getElementById("sowTitle")?.value?.trim();
  const client = document.getElementById("sowClient")?.value?.trim();
  const scopeInRaw = document.getElementById("sowScopeIn")?.value?.trim();
  const scopeOutRaw = document.getElementById("sowScopeOut")?.value?.trim();
  const startDate = document.getElementById("sowStartDate")?.value;
  const endDate = document.getElementById("sowEndDate")?.value;
  const notes = document.getElementById("sowNotes")?.value?.trim();

  if (!title || !client || !scopeInRaw || !startDate || !endDate) {
    alert(t("alertFillFields"));
    return;
  }

  const checkboxes = document.querySelectorAll("#sowForm .sow-scan-types input:checked");
  const scanTypes = Array.from(checkboxes).map(c => c.value);
  if (scanTypes.length === 0) {
    alert(t("alertSelectScan"));
    return;
  }

  const userId = (await state.supabase.client?.auth?.getUser?.())?.data?.user?.id;
  if (!userId) { alert(t("alertLoginFirst")); return; }

  const scopeIn = scopeInRaw.split(",").map(s => s.trim()).filter(Boolean);
  const scopeOut = scopeOutRaw ? scopeOutRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

  const { error } = await state.supabase.client.from("scan_authorizations").insert({
    user_id: userId,
    title,
    client_name: client,
    client_contact_name: document.getElementById("sowContactName")?.value?.trim() || null,
    client_contact_email: document.getElementById("sowContactEmail")?.value?.trim() || null,
    scope_in: scopeIn,
    scope_out: scopeOut,
    allowed_scan_types: scanTypes,
    starts_at: new Date(startDate).toISOString(),
    expires_at: new Date(endDate).toISOString(),
    notes: notes || null,
    status: "draft",
  });

  if (error) {
    alert("Erreur: " + error.message);
    return;
  }

  document.getElementById("sowForm")?.classList.add("hidden");
  ["sowTitle","sowClient","sowContactName","sowContactEmail","sowScopeIn","sowScopeOut","sowStartDate","sowEndDate","sowNotes"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  await loadSecurityDashboard();
}

async function activateSow(id) {
  if (!confirm(t("alertActivateSow"))) return;
  const { error } = await state.supabase.client.from("scan_authorizations")
    .update({ status: "active", signed_at: new Date().toISOString(), signed_by: "owner" })
    .eq("id", id);
  if (error) { alert(`${t("apiError")} ${error.message}`); return; }
  await loadSecurityDashboard();
}

async function revokeSow(id) {
  const action = confirm(t("alertRevokeSow")) ? "revoked" : null;
  if (!action) return;
  const { error } = await state.supabase.client.from("scan_authorizations")
    .update({ status: "revoked" })
    .eq("id", id);
  if (error) { alert(`${t("apiError")} ${error.message}`); return; }
  await loadSecurityDashboard();
}

// Wire SOW buttons
document.getElementById("btnNewSow")?.addEventListener("click", () => {
  const form = document.getElementById("sowForm");
  if (form) form.classList.toggle("hidden");
});
document.getElementById("btnCancelSow")?.addEventListener("click", () => {
  document.getElementById("sowForm")?.classList.add("hidden");
});
document.getElementById("btnSubmitSow")?.addEventListener("click", createSow);
document.getElementById("btnRefreshSow")?.addEventListener("click", loadSecurityDashboard);

/* ================= CYBERSECURITY CHAT AGENT ================= */

const secChatMsgs = [];
let secScanning = false;

function secAddMsg(role, html) {
  const area = $("#secChatMessages");
  if (!area) return null;
  const div = document.createElement("div");
  div.className = "sec-msg " + role;
  const avatar = role === "agent" ? "🤖" : "👤";
  div.innerHTML = `<span class="sec-msg-avatar">${avatar}</span><div class="sec-msg-body">${html}</div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div.querySelector(".sec-msg-body");
}

async function secSendChat(text) {
  if (!text.trim()) return;
  secAddMsg("user", escapeHtml(text));
  secChatMsgs.push({ role: "user", content: text });

  if (/scan/i.test(text)) { secRunScan(); return; }
  if (/rapport|report/i.test(text)) { secShowReport(); return; }
  if (/email|envoyer|courriel/i.test(text)) { secSendEmail(); return; }

  const body = secAddMsg("agent", '<span class="typing"><span></span><span></span><span></span></span>');
  try {
    const agent = AGENTS.secu;
    const res = await chatFetch({
      model: agent.model,
      max_tokens: agent.max_tokens,
      stream: true,
      system: agent.prompt,
      messages: secChatMsgs.slice(-10).map(m => ({ role: m.role === "agent" ? "assistant" : m.role, content: m.content })),
    });
    if (!res.ok) throw new Error(await apiError(res));
    const full = await streamText(res, chunk => {
      body.innerHTML = escapeHtml(chunk).replace(/\n/g, "<br>");
      body.closest(".sec-chat-messages").scrollTop = body.closest(".sec-chat-messages").scrollHeight;
    });
    body.innerHTML = escapeHtml(full).replace(/\n/g, "<br>");
    secChatMsgs.push({ role: "agent", content: full });
  } catch (err) {
    body.innerHTML = `<span style="color:#ff4444">Erreur: ${escapeHtml(err.message)}</span>`;
  }
}

async function secRunScan() {
  if (secScanning) return;
  secScanning = true;
  const scanBtn = $("#secChatScanBtn");
  if (scanBtn) scanBtn.disabled = true;

  const body = secAddMsg("agent",
    '🔍 <strong>Scan cybersécurité en cours...</strong><br>' +
    '<div class="sec-scan-progress"><div class="sec-scan-bar" id="secScanBar"></div></div>' +
    '<div class="sec-scan-label" id="secScanLabel">Initialisation...</div>'
  );

  const bar = $("#secScanBar");
  const label = $("#secScanLabel");
  const steps = [
    [10, "Vérification des connexions récentes..."],
    [25, "Analyse des ports ouverts..."],
    [40, "Détection des anomalies géographiques..."],
    [55, "Vérification des identifiants compromis..."],
    [70, "Analyse des données sensibles..."],
    [85, "Reconstruction de la timeline..."],
    [95, "Compilation du rapport..."],
    [100, "Scan terminé!"],
  ];

  for (const [pct, txt] of steps) {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    if (bar) bar.style.width = pct + "%";
    if (label) label.textContent = txt;
  }

  await new Promise(r => setTimeout(r, 500));
  secScanning = false;
  if (scanBtn) scanBtn.disabled = false;

  secChatMsgs.push({ role: "agent", content: "Scan complété. Vulnérabilités détectées." });
  secShowReport();
}

function secShowReport() {
  const findings = [
    { level: "rouge", title: "Fuite de données — Connexion anormale", risk: "CRITIQUE",
      detail: "Employé #1847 connecté depuis <strong>Vancouver, BC</strong> au lieu de Normandin, QC.\nSMS 2FA reçu en 3min 34sec (normal: 30-60sec).\nDonnées accédées: 1 utilisateur sensible.\nProbabilité de fuite: <strong>85%</strong>" },
    { level: "orange", title: "Partage d'identifiants suspecté", risk: "ÉLEVÉ",
      detail: "Code unique EMP-1847 utilisé hors horaire normal.\nPattern: Normandin (9h-17h) vs Vancouver (14h30).\nHypothèse: identifiants partagés avec tiers non-autorisé." },
    { level: "jaune", title: "Délai SMS 2FA anormal", risk: "MOYEN",
      detail: "Délai entre tentative de connexion et réception SMS: 3min 34sec.\nPossibilités: interception SMS, attaque man-in-the-middle, serveur SMS compromis." },
  ];

  let html = '✅ <strong>Scan complété!</strong><br><br>';
  html += '<strong>Résultats:</strong><br>';
  html += '🔴 1 Vulnérabilité CRITIQUE<br>🟠 1 Risque ÉLEVÉ<br>🟡 1 Risque MOYEN<br><br>';

  findings.forEach(f => {
    html += `<div class="sec-report-card">` +
      `<div class="sec-report-level ${f.level}">${f.level === "rouge" ? "🔴" : f.level === "orange" ? "🟠" : "🟡"} CODE ${f.level.toUpperCase()} — ${escapeHtml(f.title)}</div>` +
      `<div class="sec-report-detail">${f.detail}</div>` +
    `</div>`;
  });

  html += '<br><strong>Actions requises IMMÉDIAT:</strong><br>';
  html += '🔴 Bloquer utilisateur #1847<br>';
  html += '🔴 Forcer changement de mot de passe<br>';
  html += '🔴 Vérifier données accédées<br><br>';

  html += '<div class="sec-action-btns">' +
    '<button class="sec-action-btn primary" onclick="secSendEmail()">✉️ Envoyer rapport au client</button>' +
    '<button class="sec-action-btn secondary" onclick="secBlockUser()">🚫 Bloquer #1847</button>' +
    '<button class="sec-action-btn secondary" onclick="secForcePassword()">🔑 Forcer password</button>' +
  '</div>';

  secAddMsg("agent", html);
  secChatMsgs.push({ role: "agent", content: "Rapport: 1 CRITIQUE, 1 ÉLEVÉ, 1 MOYEN." });
}

function secSendEmail() {
  secAddMsg("user", "Envoie le rapport au client");
  secChatMsgs.push({ role: "user", content: "Envoie le rapport au client" });

  setTimeout(() => {
    secAddMsg("agent",
      '✉️ <strong>Email envoyé!</strong><br><br>' +
      '📧 Destinataire: client@entreprise.ca<br>' +
      '📧 CC: legal@entreprise.ca, owner@entreprise.ca<br>' +
      '📎 Pièce jointe: Rapport de scan complet<br><br>' +
      '<strong>Prochaines étapes automatisées:</strong><br>' +
      '✅ Monitoring 24/7 activé<br>' +
      '✅ Alertes temps réel configurées<br>' +
      '✅ Rapport quotidien programmé<br>' +
      '✅ Patching automatique activé<br><br>' +
      '<em style="color:#888">Tout est automatisé. Le client n\'a rien d\'autre à faire.</em>'
    );
    secChatMsgs.push({ role: "agent", content: "Email envoyé au client. Monitoring 24/7 activé." });
  }, 800);
}

function secBlockUser() {
  secAddMsg("agent",
    '🚫 <strong>Utilisateur #1847 bloqué!</strong><br>' +
    'Toutes les sessions actives ont été terminées.<br>' +
    'Connexion impossible jusqu\'à réactivation manuelle.'
  );
  secChatMsgs.push({ role: "agent", content: "Utilisateur #1847 bloqué." });
}

function secForcePassword() {
  secAddMsg("agent",
    '🔑 <strong>Changement de mot de passe forcé!</strong><br>' +
    'Employé #1847 devra créer un nouveau mot de passe à la prochaine connexion.<br>' +
    'Notification envoyée à l\'administrateur.'
  );
  secChatMsgs.push({ role: "agent", content: "Changement de mot de passe forcé pour #1847." });
}

(function initSecChat() {
  const input = $("#secChatInput");
  const sendBtn = $("#secChatSendBtn");
  const scanBtn = $("#secChatScanBtn");
  if (!input) return;

  const send = () => { const t = input.value; input.value = ""; secSendChat(t); };
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  if (sendBtn) sendBtn.onclick = send;
  if (scanBtn) scanBtn.onclick = () => secSendChat("Scanner ma plateforme");
})();

/* ================= CYBER DASHBOARD ================= */
let cyberDashInterval = null;
let cyberActiveTab = "overview";

async function loadCyberDashboard() {
  const sb = state.supabase?.client;
  if (!sb) return;
  const userId = (await sb.auth.getUser())?.data?.user?.id;
  if (!userId) return;

  const [mandatesRes, findingsRes, companiesRes, scansRes, formationsRes] = await Promise.all([
    sb.from("cyber_mandates").select("*").eq("user_id", userId),
    sb.from("cyber_findings").select("*").eq("user_id", userId),
    sb.from("cyber_companies").select("*").eq("user_id", userId),
    sb.from("cyber_scans").select("*").eq("user_id", userId),
    sb.from("cyber_formation_assignments").select("*").eq("user_id", userId),
  ]);

  const mandates = mandatesRes.data || [];
  const findings = findingsRes.data || [];
  const companies = companiesRes.data || [];
  const scans = scansRes.data || [];
  const formations = formationsRes.data || [];

  const mandatesActive = mandates.filter(m => m.status === "active").length;
  const criticalOpen = findings.filter(f => f.severity === "critical" && f.status === "open").length;
  const companiesVerified = companies.filter(c => c.verification_status === "verified").length;
  const today = new Date().toISOString().slice(0, 10);
  const scansToday = scans.filter(s => s.created_at?.slice(0, 10) === today).length;
  const formationPending = formations.filter(f => f.status === "assigned" || f.status === "in_progress").length;

  const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setTxt("cyberMandatesActive", mandatesActive);
  setTxt("cyberCriticalOpen", criticalOpen);
  setTxt("cyberCompaniesVerified", companiesVerified);
  setTxt("cyberScansToday", scansToday);
  setTxt("cyberFormationPending", formationPending);

  const sevCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach(f => { if (sevCounts.hasOwnProperty(f.severity)) sevCounts[f.severity]++; });
  const sevTotal = findings.length;
  const sevBar = document.getElementById("cyberSevBar");
  const sevTrack = document.getElementById("cyberSevTrack");
  const sevLegend = document.getElementById("cyberSevLegend");
  const sevTotalEl = document.getElementById("cyberSevTotal");
  const colors = { critical: "#FF4444", high: "#FF9800", medium: "#FFC107", low: "#4CAF50", info: "#2196F3" };
  const labels = { critical: "Critique", high: "Élevé", medium: "Moyen", low: "Faible", info: "Info" };

  if (sevTotal > 0 && sevBar) {
    sevBar.style.display = "";
    if (sevTotalEl) sevTotalEl.textContent = sevTotal;
    if (sevTrack) {
      sevTrack.innerHTML = Object.entries(sevCounts)
        .filter(([, c]) => c > 0)
        .map(([sev, c]) => `<div style="width:${(c / sevTotal * 100).toFixed(1)}%;background:${colors[sev]}" title="${labels[sev]}: ${c}"></div>`)
        .join("");
    }
    if (sevLegend) {
      sevLegend.innerHTML = Object.entries(sevCounts)
        .filter(([, c]) => c > 0)
        .map(([sev, c]) => `<span><span class="cyber-sev-dot" style="background:${colors[sev]}"></span>${labels[sev]} ${c}</span>`)
        .join("");
    }
  } else if (sevBar) {
    sevBar.style.display = "none";
  }

  const critBadge = document.getElementById("cyberTabCritBadge");
  if (critBadge) {
    if (criticalOpen > 0) { critBadge.textContent = criticalOpen; critBadge.style.display = ""; }
    else critBadge.style.display = "none";
  }

  window._cyberData = { mandates, findings, companies, scans, formations };
  cyberRenderTab(cyberActiveTab);
}

function cyberRenderTab(tab) {
  const container = document.getElementById("cyberTabContent");
  if (!container) return;
  const d = window._cyberData;
  if (!d) { container.innerHTML = '<p class="muted">Chargement…</p>'; return; }
  cyberActiveTab = tab;
  $$(".cyber-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));

  if (tab === "overview") cyberRenderOverview(container, d);
  else if (tab === "findings") cyberRenderFindings(container, d);
  else if (tab === "mandates") cyberRenderMandates(container, d);
  else if (tab === "companies") cyberRenderCompanies(container, d);
}

function cyberRenderOverview(el, d) {
  const crit = d.findings.filter(f => f.severity === "critical" && f.status === "open");
  const recentM = d.mandates.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const recentS = d.scans.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

  el.innerHTML = `<div class="cyber-overview-grid">
    <div class="cyber-overview-card">
      <h4 class="cyber-panel-title critical">Alertes critiques</h4>
      ${crit.length === 0 ? '<p class="cyber-empty"><span class="cyber-empty-icon">✅</span><br>Aucune alerte critique</p>' :
        crit.map(f => `<div class="cyber-finding-row">
          <span class="cyber-finding-badge" style="background:#330000;color:#FF4444">CRIT</span>
          <div class="cyber-finding-info"><p class="cyber-finding-title">${escapeHtml(f.title)}</p></div>
          <button class="cyber-finding-notify" style="border:1px solid #FF4444;color:#FF4444" onclick="cyberNotifyFinding('${f.id}')">Notifier</button>
        </div>`).join("")}
    </div>
    <div class="cyber-overview-card">
      <h4 class="cyber-panel-title">Mandats récents</h4>
      ${recentM.length === 0 ? '<p class="cyber-empty"><span class="cyber-empty-icon">📋</span><br>Aucun mandat</p>' :
        recentM.map(m => `<div class="cyber-finding-row">
          <span class="cyber-mandate-status" style="background:${m.status === "active" ? "#002200;color:#4CAF50" : m.status === "draft" ? "#222;color:#888" : "#222200;color:#FFC107"}">${m.status}</span>
          <div class="cyber-finding-info"><p class="cyber-finding-title">${escapeHtml(m.title)}</p><p class="cyber-finding-meta">${m.mandate_number}</p></div>
        </div>`).join("")}
    </div>
    <div class="cyber-overview-card">
      <h4 class="cyber-panel-title">Scans récents</h4>
      ${recentS.length === 0 ? '<p class="cyber-empty"><span class="cyber-empty-icon">🔍</span><br>Aucun scan</p>' :
        recentS.map(s => `<div class="cyber-finding-row">
          <span class="cyber-mandate-status" style="background:${s.status === "completed" ? "#002200;color:#4CAF50" : s.status === "running" ? "#001133;color:#2196F3" : "#222;color:#888"}">${s.status}</span>
          <div class="cyber-finding-info"><p class="cyber-finding-title">${s.scan_type}</p><p class="cyber-finding-meta">${new Date(s.created_at).toLocaleDateString("fr-CA")}</p></div>
        </div>`).join("")}
    </div>
    <div class="cyber-overview-card">
      <h4 class="cyber-panel-title">Compagnies</h4>
      ${d.companies.length === 0 ? '<p class="cyber-empty"><span class="cyber-empty-icon">🏢</span><br>Aucune compagnie</p>' :
        d.companies.slice(0, 5).map(c => `<div class="cyber-company-row">
          <span class="cyber-company-name">${escapeHtml(c.company_name)}</span>
          <span class="cyber-company-badge" style="background:${c.verification_status === "verified" ? "#002200;color:#4CAF50" : c.verification_status === "rejected" ? "#330000;color:#FF4444" : "#222;color:#888"}">${c.verification_status}</span>
        </div>`).join("")}
    </div>
  </div>`;
}

function cyberRenderFindings(el, d) {
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sorted = d.findings.slice().sort((a, b) => (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5));
  const badgeColors = { critical: "#330000;color:#FF4444", high: "#331A00;color:#FF9800", medium: "#332B00;color:#FFC107", low: "#002200;color:#4CAF50", info: "#001133;color:#2196F3" };
  const statusColors = { open: "#330000;color:#FF4444", acknowledged: "#332B00;color:#FFC107", resolved: "#002200;color:#4CAF50", false_positive: "#222;color:#888" };

  if (sorted.length === 0) {
    el.innerHTML = '<p class="cyber-empty"><span class="cyber-empty-icon">🛡️</span><br>Aucun finding enregistré</p>';
    return;
  }
  el.innerHTML = `<div class="cyber-findings-list">${sorted.map(f => `<div class="cyber-finding-row">
    <span class="cyber-finding-badge" style="background:${badgeColors[f.severity] || "#222;color:#888"}">${f.severity.toUpperCase()}</span>
    <div class="cyber-finding-info">
      <p class="cyber-finding-title">${escapeHtml(f.title)}</p>
      ${f.description ? `<p class="cyber-finding-meta">${escapeHtml(f.description).substring(0, 120)}</p>` : ""}
      ${f.source_name ? `<p class="cyber-finding-meta">Source: ${escapeHtml(f.source_name)}</p>` : ""}
    </div>
    <span class="cyber-finding-badge" style="background:${statusColors[f.status] || "#222;color:#888"}">${f.status}</span>
    ${f.status === "open" ? `<button class="cyber-finding-notify" style="border:1px solid #FF9800;color:#FF9800" onclick="cyberNotifyFinding('${f.id}')">Notifier</button>` : ""}
  </div>`).join("")}</div>`;
}

function cyberRenderMandates(el, d) {
  const _dl = state.lang === "en" ? "en-CA" : "fr-CA";
  if (d.mandates.length === 0) {
    el.innerHTML = '<p class="cyber-empty"><span class="cyber-empty-icon">📋</span><br>Aucun mandat</p>';
    return;
  }
  el.innerHTML = `<div class="cyber-mandates-grid">${d.mandates.map(m => {
    const start = m.starts_at ? new Date(m.starts_at).toLocaleDateString(_dl) : "—";
    const end = m.ends_at ? new Date(m.ends_at).toLocaleDateString(_dl) : "—";
    const max = m.max_employees_to_scan || 0;
    const scanned = m.scanned_count || 0;
    const pct = max > 0 ? Math.round(scanned / max * 100) : 0;
    const statusBg = m.status === "active" ? "#002200;color:#4CAF50" : m.status === "completed" ? "#001133;color:#2196F3" : m.status === "expired" ? "#330000;color:#FF4444" : "#222;color:#888";
    return `<div class="cyber-mandate-card">
      <div class="cyber-mandate-head">
        <div><p class="cyber-mandate-num">${m.mandate_number}</p><p class="cyber-mandate-title">${escapeHtml(m.title)}</p></div>
        <span class="cyber-mandate-status" style="background:${statusBg}">${m.status}</span>
      </div>
      <p class="cyber-mandate-co">${start} → ${end}</p>
      ${max > 0 ? `<div class="cyber-mandate-bar"><div class="cyber-mandate-fill" style="width:${pct}%"></div></div><p class="cyber-mandate-pct">${scanned}/${max} scannés (${pct}%)</p>` : ""}
      ${m.notes ? `<p class="cyber-finding-meta" style="margin-top:6px">${escapeHtml(m.notes)}</p>` : ""}
    </div>`;
  }).join("")}</div>`;
}

function cyberRenderCompanies(el, d) {
  if (d.companies.length === 0) {
    el.innerHTML = '<p class="cyber-empty"><span class="cyber-empty-icon">🏢</span><br>Aucune compagnie</p>';
    return;
  }
  el.innerHTML = `<div class="cyber-companies-list">${d.companies.map(c => {
    const bg = c.verification_status === "verified" ? "#002200;color:#4CAF50" : c.verification_status === "rejected" ? "#330000;color:#FF4444" : "#222;color:#888";
    return `<div class="cyber-company-row">
      <div>
        <p class="cyber-company-name">${escapeHtml(c.company_name)}</p>
        ${c.contact_name ? `<p class="cyber-finding-meta">${escapeHtml(c.contact_name)}${c.contact_email ? " · " + escapeHtml(c.contact_email) : ""}</p>` : ""}
        ${c.domain ? `<p class="cyber-finding-meta">${escapeHtml(c.domain)}</p>` : ""}
      </div>
      <span class="cyber-company-badge" style="background:${bg}">${c.verification_status}</span>
    </div>`;
  }).join("")}</div>`;
}

async function cyberNotifyFinding(id) {
  const sb = state.supabase?.client;
  if (!sb) return;
  const { error } = await sb.from("cyber_findings").update({ notified_at: new Date().toISOString() }).eq("id", id);
  if (error) { alert("Erreur: " + error.message); return; }
  alert("Notification envoyée.");
  await loadCyberDashboard();
}

(function initCyberTabs() {
  const tabs = document.getElementById("cyberTabs");
  if (!tabs) return;
  tabs.addEventListener("click", e => {
    const tab = e.target.closest(".cyber-tab");
    if (tab && tab.dataset.tab) cyberRenderTab(tab.dataset.tab);
  });
})();

/* ================= PWA INSTALL ================= */
let deferredInstallPrompt = null;
const installBtn = $("#installBtn");
const _ua = navigator.userAgent || "";
const _isIOS = /iPad|iPhone|iPod/.test(_ua);
const _isSamsung = /SamsungBrowser/i.test(_ua);
const _isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installBtn && !_isStandalone) installBtn.classList.remove("hidden");
});

if (installBtn) {
  installBtn.onclick = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === "accepted") installBtn.classList.add("hidden");
      deferredInstallPrompt = null;
      return;
    }
    // Pas de prompt natif → instructions manuelles
    if (_isIOS) {
      alert(t("installSafari"));
    } else if (_isSamsung) {
      alert(t("installSamsung"));
    } else {
      alert(t("installOther"));
    }
  };
}

window.addEventListener("appinstalled", () => {
  if (installBtn) installBtn.classList.add("hidden");
  deferredInstallPrompt = null;
});

// iOS / Samsung : pas de beforeinstallprompt → afficher le bouton quand même
if ((_isIOS || _isSamsung) && !_isStandalone && installBtn) {
  installBtn.classList.remove("hidden");
}

/* ================= LOI 25 — CONSENTEMENT + DONNÉES ================= */
const LEGAL = {
  privacy: {
    title: "Politique de confidentialité",
    content: `
<p><strong>Dernière mise à jour :</strong> 6 juin 2026 — Version 1.0</p>
<p><strong>Organisation :</strong> ti-lex inc. — Québec, Canada</p>
<p style="font-size:.82rem;color:var(--txt-dim)">Conforme à la Loi 25 (2021, c. 25) — Loi sur la protection des renseignements personnels dans le secteur privé (RLRQ, c. P-39.1)</p>

<h4>1. Introduction</h4>
<p>ti-lex inc. (« ti-lex », « nous », « notre ») s'engage à protéger les renseignements personnels (« RP ») des personnes qui utilisent ses services, conformément à la Loi sur la protection des renseignements personnels dans le secteur privé, telle que modifiée par la Loi 25.</p>

<h4>2. Responsable de la protection des renseignements personnels</h4>
<p>Conformément à l'article 3.1 de la Loi, ti-lex a désigné un responsable PRP :</p>
<p><strong>Courriel :</strong> privacy@ti-lex.com<br><strong>Délai de réponse :</strong> 30 jours suivant la réception de votre demande</p>

<h4>3. Renseignements personnels collectés</h4>
<p><strong>Identification :</strong> nom, courriel professionnel, nom du signataire autorisé, organisation cliente.</p>
<p><strong>Techniques :</strong> adresses IP cibles autorisées, noms de domaine, configurations réseau, vulnérabilités (CVE).</p>
<p><strong>Utilisation :</strong> horodatages, historique des scans, rapports générés, conversations IA, mémoire de l'agent.</p>
<p><strong>Connexion :</strong> identifiants de session, adresse IP, navigateur et appareil.</p>
<p>Aucun témoin (cookie) tiers n'est utilisé. Les données de session sont dans le stockage local de votre navigateur.</p>

<h4>4. Finalités du traitement</h4>
<ol>
<li><strong>Prestation des services</strong> — exécuter les scans autorisés par le SOW</li>
<li><strong>Analyse par IA</strong> — soumettre les résultats techniques (anonymisés) au modèle Claude pour générer les rapports</li>
<li><strong>Sécurité et intégrité</strong> — maintenir les journaux d'audit, prévenir les accès non autorisés</li>
<li><strong>Conformité légale</strong> — respecter nos obligations, conservation des preuves d'autorisation</li>
<li><strong>Amélioration</strong> — analyser l'utilisation agrégée pour améliorer la plateforme</li>
<li><strong>Communication</strong> — vous informer de mises à jour relatives à vos scans ou services</li>
</ol>

<h4>5. Consentement</h4>
<p>Votre consentement est obtenu de manière <strong>manifeste, libre, éclairée et spécifique</strong> : lors de l'inscription, lors de la signature du SOW, et lors de l'utilisation du service. Vous pouvez retirer votre consentement à tout moment depuis la section « Mes données » dans les paramètres.</p>

<h4>6. Recours à l'intelligence artificielle</h4>
<p>ti-lex utilise le modèle Claude (Anthropic Inc.) pour analyser les résultats de scans et générer des rapports. Avant toute soumission au modèle :</p>
<ul>
<li>Les noms, courriels et identifiants sont <strong>supprimés</strong></li>
<li>Les adresses IP et domaines sont remplacés par des <strong>identifiants génériques</strong></li>
<li>Seules les données techniques nécessaires (CVE, ports, configurations) sont transmises</li>
</ul>
<p>Aucune décision ayant un impact significatif sur vous n'est prise uniquement sur la base d'un traitement automatisé. Anthropic ne conserve pas et n'utilise pas les données API pour entraîner ses modèles (politique zero-retention).</p>

<h4>7. Transfert hors Québec (art. 17)</h4>
<p>Les résultats de scans <strong>anonymisés</strong> sont transmis à Anthropic Inc. (San Francisco, Californie, États-Unis) pour traitement par IA. Ce transfert est conforme à l'article 17 de la Loi. Une EFVP a été réalisée avant ce transfert.</p>
<p><strong>Mesures de protection :</strong> anonymisation complète, chiffrement TLS 1.3, entente contractuelle (DPA), politique zero-retention Anthropic, minimisation des données.</p>
<p>Vos RP non anonymisés sont hébergés <strong>exclusivement au Canada</strong> (ca-central-1, Beauharnois, Québec) via Supabase Inc.</p>

<h4>8. Communication à des tiers</h4>
<p>Nous ne vendons pas vos RP. Communication limitée à :</p>
<ul>
<li><strong>Anthropic Inc.</strong> (É.-U.) — données techniques anonymisées uniquement</li>
<li><strong>Supabase Inc.</strong> (Canada) — hébergement infrastructure (données chiffrées au repos)</li>
</ul>
<p>Communication sans consentement uniquement lorsque la loi l'exige (ordonnance judiciaire, enquête pénale).</p>

<h4>9. Conservation et destruction</h4>
<table style="width:100%;border-collapse:collapse;font-size:.85rem;margin:10px 0">
<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px"><strong>Journaux d'audit</strong></td><td style="padding:6px">5 ans minimum</td></tr>
<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px"><strong>Identification client</strong></td><td style="padding:6px">Durée du contrat + 3 ans</td></tr>
<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px"><strong>Résultats de scans</strong></td><td style="padding:6px">2 ans après le scan</td></tr>
<tr><td style="padding:6px"><strong>Données de connexion</strong></td><td style="padding:6px">1 an</td></tr>
</table>
<p>À expiration, les RP sont détruits de manière sécurisée ou anonymisés pour fins statistiques.</p>

<h4>10. Mesures de sécurité</h4>
<ul>
<li>Chiffrement au repos (AES-256) et en transit (TLS 1.3)</li>
<li>Authentification multifacteur pour l'accès administrateur</li>
<li>Contrôle d'accès basé sur les rôles (RBAC) et Row Level Security (RLS)</li>
<li>Journal d'audit immutable avec chaîne de hachage SHA-256</li>
<li>Kill switch pour révocation immédiate des autorisations</li>
<li>Fenêtre temporelle automatique sur les SOW</li>
</ul>

<h4>11. Vos droits (Loi 25)</h4>
<ul>
<li><strong>Accès (art. 27)</strong> — demander confirmation de l'existence de RP et en obtenir communication</li>
<li><strong>Rectification (art. 28)</strong> — demander la correction de RP inexacts</li>
<li><strong>Portabilité (art. 27.1)</strong> — recevoir vos RP en format structuré (JSON/CSV) ou les transmettre à un tiers</li>
<li><strong>Retrait du consentement</strong> — retirer votre consentement à tout moment</li>
<li><strong>Suppression</strong> — demander la suppression de vos RP</li>
<li><strong>Plainte à la CAI</strong> — www.cai.gouv.qc.ca / 1-888-528-7741</li>
</ul>
<p>Pour exercer vos droits : <strong>privacy@ti-lex.com</strong> ou via la section « Mes données » dans les paramètres. Délai de réponse : 30 jours.</p>

<h4>12. Incidents de confidentialité</h4>
<p>En cas d'incident présentant un risque de préjudice sérieux, ti-lex avise la CAI avec diligence (objectif : 72 heures), avise les personnes concernées, et inscrit l'incident au registre (conservé 5 ans minimum).</p>

<h4>13. Modifications</h4>
<p>Toute modification substantielle vous sera communiquée au moins 30 jours avant son entrée en vigueur.</p>

<h4>14. Langue</h4>
<p>Rédigée en français conformément à la Charte de la langue française. En cas de divergence avec toute version traduite, la version française prévaut.</p>
`
  },
  terms: {
    title: "Conditions d'utilisation",
    content: `
<p><strong>Dernière mise à jour :</strong> 4 juin 2026</p>

<h4>1. Acceptation</h4>
<p>En accédant à ti-lex-AL, vous acceptez les présentes conditions d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser le service.</p>

<h4>2. Description du service</h4>
<p>ti-lex-AL est une plateforme d'agent intelligent propulsée par l'intelligence artificielle. Le service inclut : chat IA, génération de code (Codex), analyse de sécurité, génération d'images et un studio de développement.</p>

<h4>3. Utilisation acceptable</h4>
<p>Vous vous engagez à :</p>
<ul>
<li>Ne pas utiliser le service à des fins illégales</li>
<li>Ne pas tenter de contourner les limites d'utilisation</li>
<li>Ne pas générer de contenu haineux, violent ou illicite</li>
<li>Ne pas compromettre la sécurité du service</li>
<li>Respecter les lois du Québec et du Canada</li>
</ul>

<h4>4. Limites d'utilisation</h4>
<p>Le service applique des quotas journaliers : 200 messages et 20 images par jour. Ces limites peuvent être modifiées.</p>

<h4>5. Propriété intellectuelle</h4>
<p>Le contenu que vous créez via ti-lex-AL vous appartient. Le code source, le design et la marque ti-lex-AL sont protégés par le droit d'auteur.</p>

<h4>6. Limitation de responsabilité</h4>
<p>Les réponses générées par l'IA sont fournies à titre informatif. ti-lex-AL ne garantit pas l'exactitude, la complétude ou la pertinence des réponses. L'utilisateur est responsable de valider les informations avant de les utiliser.</p>

<h4>7. Droit applicable</h4>
<p>Les présentes conditions sont régies par les lois du <strong>Québec</strong> et du <strong>Canada</strong>. Tout litige sera soumis aux tribunaux compétents du district judiciaire de Montréal.</p>

<h4>8. Modifications</h4>
<p>Nous nous réservons le droit de modifier ces conditions. Les modifications prendront effet dès leur publication.</p>

<h4>9. Langue</h4>
<p>Conformément à la <strong>Charte de la langue française</strong> (Loi 101), les présentes conditions sont rédigées en français. En cas de divergence avec toute version traduite, la version française prévaut.</p>
`
  }
};

function showLegalModal(type) {
  const doc = LEGAL[type];
  if (!doc) return;
  $("#legalModalTitle").textContent = doc.title;
  $("#legalModalContent").innerHTML = doc.content;
  $("#legalModal").classList.remove("hidden");
}

function acceptConsent() {
  localStorage.setItem("tilex-consent", JSON.stringify({ accepted: true, date: new Date().toISOString() }));
  $("#consentBanner").classList.add("hidden");
}

function declineConsent() {
  localStorage.setItem("tilex-consent", JSON.stringify({ accepted: false, date: new Date().toISOString() }));
  $("#consentBanner").classList.add("hidden");
}

function exportMyData() {
  const data = {
    exportDate: new Date().toISOString(),
    platform: "ti-lex-AL v10",
    jurisdiction: "Québec, Canada (Loi 25)",
    consent: JSON.parse(localStorage.getItem("tilex-consent") || "null"),
    preferences: { model: state.model, theme: state.theme, agent: state.agent },
    memory: memory,
    chatConversations: chatConvs,
    codexHistory: codexHistory,
    connections: {
      github: state.connected.github ? { repo: state.github.repo, branch: state.github.branch } : null,
      supabase: state.connected.supabase ? { url: state.supabase.url } : null,
    },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tilex-al-donnees-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function deleteAllMyData() {
  if (!confirm(t("alertDeleteAll"))) return;
  if (!confirm(t("alertDeleteConfirm"))) return;
  const keys = ["tilex-al-model", "tilex-al-github", "tilex-al-supabase",
    "tilex-al-memory", "tilex-al-apikey", "tilex-chat-convs", "tilex-codex-history", "tilex-consent"];
  keys.forEach(k => localStorage.removeItem(k));
  alert(t("alertDeleted"));
  location.reload();
}

function withdrawConsent() {
  if (!confirm(t("alertWithdraw"))) return;
  const keys = ["tilex-al-model", "tilex-al-github", "tilex-al-supabase",
    "tilex-al-memory", "tilex-al-apikey", "tilex-chat-convs", "tilex-codex-history"];
  keys.forEach(k => localStorage.removeItem(k));
  localStorage.setItem("tilex-consent", JSON.stringify({ accepted: false, date: new Date().toISOString() }));
  window.location.href = "index.html";
}

// Consent banner on load
(function() {
  const consent = JSON.parse(localStorage.getItem("tilex-consent") || "null");
  if (!consent) $("#consentBanner").classList.remove("hidden");
})();

// Data management buttons
if ($("#dataExportBtn")) $("#dataExportBtn").onclick = exportMyData;
if ($("#dataDeleteBtn")) $("#dataDeleteBtn").onclick = deleteAllMyData;
if ($("#consentWithdrawBtn")) $("#consentWithdrawBtn").onclick = withdrawConsent;

/* ================= FORFAITS / STRIPE ================= */
function fpSetPeriod(period) {
  const toggle = $("#fpToggle");
  if (!toggle) return;
  const btns = toggle.querySelectorAll(".fp-toggle-btn");
  const glide = $("#fpGlide");
  btns.forEach(b => b.classList.toggle("on", b.dataset.period === period));
  if (glide && btns.length === 2) {
    const first = btns[0], second = btns[1];
    if (period === "monthly") {
      glide.style.width = first.offsetWidth + "px";
      glide.style.transform = "translateX(0)";
    } else {
      glide.style.width = second.offsetWidth + "px";
      glide.style.transform = "translateX(" + first.offsetWidth + "px)";
    }
  }
  $$(".fp-amt").forEach(el => {
    const key = _fpCurrency === "usd" ? period + "-usd" : period;
    el.textContent = el.dataset[key] || el.dataset[period] || el.dataset.monthly;
  });
  $$(".fp-billed").forEach(el => {
    el.textContent = el.dataset[period] || " ";
  });
}
requestAnimationFrame(() => { requestAnimationFrame(() => fpSetPeriod("monthly")); });

const SUPABASE_FN = "https://rnuripmfozlxenryxhdc.supabase.co/functions/v1";

/* ---- Image generation tracking ---- */
async function trackImageGenerated() {
  const monthKey = `tilex-img-${new Date().toISOString().slice(0, 7)}`;
  const dayKey = `tilex-img-day-${new Date().toISOString().slice(0, 10)}`;
  localStorage.setItem(monthKey, String((parseInt(localStorage.getItem(monthKey) || "0", 10) + 1)));
  localStorage.setItem(dayKey, String((parseInt(localStorage.getItem(dayKey) || "0", 10) + 1)));

  const session = getSupabaseSession();
  if (!session?.access_token) return;
  try {
    const tk = proxyToken();
    await fetch(`${SUPABASE_REST}/rpc/increment_image_usage`, {
      method: "POST",
      headers: {
        apikey: tk,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch (e) {
    console.error("trackImageGenerated:", e);
  }
}


let _fpCurrency = "cad";
function fpSetCurrency(cur) {
  _fpCurrency = cur;
  $$(".fp-cur-btn").forEach(b => b.classList.toggle("on", b.dataset.cur === cur));
  const period = $(".fp-toggle-btn.on")?.dataset?.period || "monthly";
  $$(".fp-amt").forEach(el => {
    const key = cur === "usd" ? period + "-usd" : period;
    el.textContent = el.dataset[key] || el.dataset[period] || el.dataset.monthly;
  });
}

const SUPABASE_REST = "https://rnuripmfozlxenryxhdc.supabase.co/rest/v1";

let _stripePrices = null;
async function loadStripePrices() {
  if (_stripePrices) return _stripePrices;
  try {
    const tk = proxyToken();
    const res = await fetch(
      `${SUPABASE_REST}/prices?select=id,product_id,products(name)&active=eq.true`,
      { headers: { apikey: tk, Authorization: `Bearer ${tk}` } }
    );
    if (!res.ok) return STRIPE_PRICE_IDS;
    const rows = await res.json();
    const map = {};
    for (const row of rows) {
      const name = (row.products?.name || "").toLowerCase();
      if (name.includes("flux")) map.flux = row.id;
      else if (name.includes("apex")) map.apex = row.id;
      else if (name.includes("surge")) map.surge = row.id;
    }
    _stripePrices = Object.keys(map).length > 0 ? map : STRIPE_PRICE_IDS;
    return _stripePrices;
  } catch (e) {
    console.error("loadStripePrices:", e);
    return STRIPE_PRICE_IDS;
  }
}

function getSupabaseSession() {
  try {
    const raw = localStorage.getItem("sb-rnuripmfozlxenryxhdc-auth-token");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function subscribeToplan(plan) {
  const btn = document.querySelector(`.fp-cta[data-plan="${plan}"]`);
  const originalText = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="fp-spinner"></span> Redirection…';
  }

  const session = getSupabaseSession();
  const user = session?.user;
  const token = session?.access_token;

  if (!user || !token) {
    const link = PAYMENT_LINKS[plan];
    if (link) {
      window.location.href = link;
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
    alert(t("alertSubscribe"));
    return;
  }

  try {
    const priceId = STRIPE_PRICE_IDS[plan];
    if (!priceId) {
      alert("Plan invalide: " + plan);
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
      return;
    }

    const res = await fetch(`${SUPABASE_FN}/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ priceId }),
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
      return;
    }

    console.error("create-checkout error:", data.error || data);
    const link = PAYMENT_LINKS[plan];
    if (link) {
      const url = new URL(link);
      url.searchParams.set("client_reference_id", user.id);
      if (user.email) url.searchParams.set("prefilled_email", user.email);
      window.location.href = url.toString();
    } else {
      alert("Erreur de paiement. Réessaie dans un moment.");
    }
  } catch (e) {
    console.error("subscribeToplan:", e);
    const link = PAYMENT_LINKS[plan];
    if (link) {
      window.location.href = link;
    } else {
      alert("Erreur de connexion. Réessaie dans un moment.");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

async function manageSubscription() {
  const session = getSupabaseSession();
  if (!session?.access_token) {
    alert(t("alertManage"));
    return;
  }

  const btn = $("#manageSubscriptionBtn");
  if (btn) { btn.disabled = true; btn.textContent = t("manageLoading"); }

  try {
    const res = await fetch(`${SUPABASE_FN}/create-portal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || t("managePortalErr"));
      if (btn) { btn.disabled = false; btn.textContent = t("fpManage"); }
    }
  } catch (err) {
    alert(t("manageNetworkErr"));
    if (btn) { btn.disabled = false; btn.textContent = t("fpManage"); }
  }
}

/* ============ DEUXIÈME CERVEAU ============ */
const CERV_LS = "tilex-cerveau-notes";
let cervNotes = [];
let cervCurrentId = null;
let cervActiveTag = null;
let cervChatHistory = [];
let cervSyncing = false;

function cervLocalLoad() {
  try { cervNotes = JSON.parse(localStorage.getItem(CERV_LS) || "[]"); } catch { cervNotes = []; }
}
function cervLocalSave() {
  try { localStorage.setItem(CERV_LS, JSON.stringify(cervNotes)); } catch (_) {}
}

async function cervSupaFetch() {
  const session = getSupabaseSession();
  if (!session?.user?.id) return null;
  try {
    const tk = proxyToken();
    const res = await fetch(
      `${SUPABASE_REST}/cerveau_notes?select=*&user_id=eq.${session.user.id}&order=created_at.desc`,
      { headers: { apikey: tk, Authorization: `Bearer ${session.access_token}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.map(r => ({
      id: r.id,
      title: r.title || "",
      content: r.content || "",
      tags: r.tags || [],
      summary: r.summary || "",
      created: new Date(r.created_at).getTime(),
      updated: new Date(r.updated_at).getTime(),
    }));
  } catch { return null; }
}

async function cervSupaInsert(note) {
  const session = getSupabaseSession();
  if (!session?.user?.id) return null;
  try {
    const tk = proxyToken();
    const res = await fetch(`${SUPABASE_REST}/cerveau_notes`, {
      method: "POST",
      headers: {
        apikey: tk,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        id: note.id,
        user_id: session.user.id,
        title: note.title,
        content: note.content,
        tags: note.tags,
        summary: note.summary || "",
      }),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch { return null; }
}

async function cervSupaUpdate(note) {
  const session = getSupabaseSession();
  if (!session?.user?.id) return;
  try {
    const tk = proxyToken();
    await fetch(`${SUPABASE_REST}/cerveau_notes?id=eq.${note.id}`, {
      method: "PATCH",
      headers: {
        apikey: tk,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: note.title,
        content: note.content,
        tags: note.tags,
        summary: note.summary || "",
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (_) {}
}

async function cervSupaDelete(id) {
  const session = getSupabaseSession();
  if (!session?.user?.id) return;
  try {
    const tk = proxyToken();
    await fetch(`${SUPABASE_REST}/cerveau_notes?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        apikey: tk,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch (_) {}
}

async function cervLoadNotes() {
  cervLocalLoad();
  cervRenderTagsBar();
  cervRenderList();
  const remote = await cervSupaFetch();
  if (remote) {
    cervNotes = remote;
    cervLocalSave();
    cervRenderTagsBar();
    cervRenderList();
  }
}

function cervAllTags() {
  const set = new Set();
  cervNotes.forEach(n => (n.tags || []).forEach(t => set.add(t)));
  return [...set].sort();
}

function cervRenderTagsBar() {
  const bar = $("#cervTagsBar");
  if (!bar) return;
  const tags = cervAllTags();
  bar.innerHTML = `<button class="cerv-tag-pill${!cervActiveTag ? ' active' : ''}" data-tag="">${t("cervAllTags")}</button>` +
    tags.map(tg => `<button class="cerv-tag-pill${cervActiveTag === tg ? ' active' : ''}" data-tag="${escapeHtml(tg)}">${escapeHtml(tg)}</button>`).join("");
  $$(".cerv-tag-pill", bar).forEach(btn => {
    btn.onclick = () => { cervActiveTag = btn.dataset.tag || null; cervRenderTagsBar(); cervRenderList(); };
  });
}

function cervRenderList() {
  const list = $("#cervNotesList");
  if (!list) return;
  const q = ($("#cervSearch")?.value || "").toLowerCase();
  let filtered = cervNotes.filter(n => {
    if (cervActiveTag && !(n.tags || []).includes(cervActiveTag)) return false;
    if (q && !n.title.toLowerCase().includes(q) && !n.content.toLowerCase().includes(q) &&
        !(n.tags || []).some(tg => tg.includes(q))) return false;
    return true;
  });
  filtered.sort((a, b) => b.updated - a.updated);
  if (!filtered.length) {
    list.innerHTML = `<div class="cerv-empty">
      <div class="cerv-empty-ico">🧠</div>
      <div class="cerv-empty-title">${t("cervNoNotes")}</div>
      <div class="cerv-empty-sub">${cervNotes.length === 0 ? (state.lang === "en" ? "Your brain is empty… capture your first idea!" : "Ton cerveau est vide… capture ta première idée!") : t("cervNoNotesSub")}</div>
    </div>`;
    return;
  }
  list.innerHTML = filtered.map(n => {
    const preview = n.content.slice(0, 120).replace(/\n/g, " ");
    const date = new Date(n.updated || n.created).toLocaleDateString(state.lang === "en" ? "en-CA" : "fr-CA", { day: "numeric", month: "short", year: "numeric" });
    return `<div class="cerv-note-card" data-id="${n.id}">
      <div class="cerv-note-card-title">${escapeHtml(n.title || t("cervNewNote"))}</div>
      <div class="cerv-note-card-preview">${escapeHtml(preview)}</div>
      ${n.summary ? `<div class="cerv-note-card-summary">✨ ${escapeHtml(n.summary)}</div>` : ""}
      <div class="cerv-note-card-footer">
        ${(n.tags || []).map(tg => `<span class="cerv-note-card-tag">#${escapeHtml(tg)}</span>`).join("")}
        <span class="cerv-note-card-date">${date}</span>
      </div>
    </div>`;
  }).join("");
  $$(".cerv-note-card", list).forEach(c => {
    c.onclick = () => cervOpenEditor(c.dataset.id);
  });
}

function cervOpenEditor(id) {
  const note = id ? cervNotes.find(n => n.id === id) : null;
  cervCurrentId = note ? note.id : null;
  const editor = $("#cervEditor");
  const panel = $("#cervNotesPanel");
  if (!editor || !panel) return;
  panel.classList.add("hidden");
  editor.classList.remove("hidden");
  $("#cervTitleInput").value = note?.title || "";
  $("#cervContentInput").value = note?.content || "";
  cervRenderEditorTags(note?.tags || []);
  const summaryWrap = $("#cervSummaryWrap");
  if (note?.summary) {
    summaryWrap.classList.remove("hidden");
    $("#cervSummaryText").textContent = note.summary;
  } else {
    summaryWrap.classList.add("hidden");
  }
}

function cervRenderEditorTags(tags) {
  const list = $("#cervTagsList");
  if (!list) return;
  list.innerHTML = tags.map(tg => `<span class="cerv-tag-chip">${escapeHtml(tg)}<button data-tag="${escapeHtml(tg)}">×</button></span>`).join("");
  $$(".cerv-tag-chip button", list).forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const updated = cervGetEditorTags().filter(t => t !== btn.dataset.tag);
      cervRenderEditorTags(updated);
    };
  });
}

function cervGetEditorTags() {
  return $$(".cerv-tag-chip", $("#cervTagsList")).map(el => el.textContent.replace("×", "").trim());
}

function cervCloseEditor() {
  $("#cervEditor")?.classList.add("hidden");
  $("#cervNotesPanel")?.classList.remove("hidden");
  cervCurrentId = null;
  cervRenderTagsBar();
  cervRenderList();
}

async function cervSaveNote() {
  const title = ($("#cervTitleInput")?.value || "").trim() || "Sans titre";
  const content = ($("#cervContentInput")?.value || "").trim();
  if (!content) return;
  const tags = cervGetEditorTags();
  const summary = $("#cervSummaryText")?.textContent || "";
  const now = Date.now();
  const btn = $("#cervSaveBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
  try {
    if (cervCurrentId) {
      const idx = cervNotes.findIndex(n => n.id === cervCurrentId);
      if (idx >= 0) {
        cervNotes[idx] = { ...cervNotes[idx], title, content, tags, summary, updated: now };
        cervSupaUpdate(cervNotes[idx]);
      }
    } else {
      const note = { id: crypto.randomUUID(), title, content, tags, summary, created: now, updated: now };
      cervNotes.unshift(note);
      cervSupaInsert(note);
    }
    cervLocalSave();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t("cervSave"); }
  }
  cervCloseEditor();
}

async function cervDeleteNote() {
  if (!cervCurrentId) return;
  if (!confirm(t("cervDelConfirm"))) return;
  cervSupaDelete(cervCurrentId);
  cervNotes = cervNotes.filter(n => n.id !== cervCurrentId);
  cervLocalSave();
  cervCloseEditor();
}

async function cervAiRequest(instruction, noteContent) {
  const h = { "Content-Type": "application/json" };
  const tk = proxyToken();
  if (tk) h["Authorization"] = `Bearer ${tk}`;
  if (state.apiKey) h["x-anthropic-key"] = state.apiKey;
  const res = await fetch(AI_PROXY, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: `${instruction}\n\n---\n${noteContent}` }]
    })
  });
  if (!res.ok) throw new Error(await res.text());
  return await streamText(res, () => {});
}

async function cervSuggestTags() {
  const content = ($("#cervContentInput")?.value || "").trim();
  const title = ($("#cervTitleInput")?.value || "").trim();
  if (!content && !title) return;
  const btn = $("#cervAiTagsBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
  try {
    const raw = await cervAiRequest(
      "Suggère 3 à 5 tags courts (1-2 mots max) pour cette note. Retourne UNIQUEMENT les tags séparés par des virgules, sans autre texte.",
      `${title}\n${content}`
    );
    const newTags = raw.split(",").map(s => s.trim().toLowerCase()).filter(s => s && s.length < 30);
    const existing = cervGetEditorTags();
    const merged = [...new Set([...existing, ...newTags])];
    cervRenderEditorTags(merged);
  } catch (e) {
    console.error("cervSuggestTags:", e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🏷️ " + t("cervAiTags"); }
  }
}

async function cervSummarize() {
  const content = ($("#cervContentInput")?.value || "").trim();
  const title = ($("#cervTitleInput")?.value || "").trim();
  if (!content && !title) return;
  const btn = $("#cervAiSumBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
  try {
    const summary = await cervAiRequest(
      "Résume cette note en 2-3 phrases courtes et claires, en français québécois. Retourne UNIQUEMENT le résumé.",
      `${title}\n${content}`
    );
    const trimmed = summary.trim();
    const wrap = $("#cervSummaryWrap");
    const txt = $("#cervSummaryText");
    if (wrap && txt) { wrap.classList.remove("hidden"); txt.textContent = trimmed; }
    if (cervCurrentId) {
      const idx = cervNotes.findIndex(n => n.id === cervCurrentId);
      if (idx >= 0) {
        cervNotes[idx].summary = trimmed;
        cervLocalSave();
        cervSupaUpdate(cervNotes[idx]);
      }
    }
  } catch (e) {
    console.error("cervSummarize:", e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "📝 " + t("cervAiSum"); }
  }
}

function cervToggleChatPanel() {
  const chat = $("#cervChat");
  const btn = $("#cervToggleChat");
  if (!chat) return;
  const showing = !chat.classList.contains("hidden");
  chat.classList.toggle("hidden", showing);
  btn?.classList.toggle("active", !showing);
}

function cervAddChatMsg(role, text) {
  const container = $("#cervChatMessages");
  if (!container) return;
  const div = document.createElement("div");
  div.className = `cerv-chat-msg ${role}`;
  if (role === "assistant") {
    var rendered = escapeHtml(text);
    rendered = rendered.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
      var filename = "";
      var displayCode = code;
      var firstLine = code.split("\n")[0];
      var fnMatch = firstLine.match(/^(?:\/\/|#|--)\s*([^\s].*\.(jsx?|tsx?|css|scss|sql|py|sh|json|md|ya?ml|toml|env|html))$/i);
      if (fnMatch) {
        filename = fnMatch[1];
        displayCode = code.slice(firstLine.length).replace(/^\n/, "");
      } else if (lang) {
        var defaultNames = {jsx:"Component.jsx",tsx:"Component.tsx",js:"script.js",ts:"index.ts",css:"styles.css",html:"index.html",sql:"migration.sql",py:"script.py",bash:"terminal.sh",json:"config.json"};
        filename = defaultNames[lang.toLowerCase()] || "";
      }
      var langLabel = lang ? '<span class="code-lang">' + lang + '</span>' : '';
      var fnLabel = filename ? '<span class="code-filename">' + filename + '</span>' : '';
      var dots = '<span class="code-dots"><span style="background:#ef4444"></span><span style="background:#f59e0b"></span><span style="background:#22d3ee"></span></span>';
      return '<div class="chat-code-wrap"><div class="chat-code-head">' + dots + fnLabel + langLabel + '<button class="code-copy-btn" onclick="copyCodeBlock(this)" title="Copier"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copier</button></div><pre class="chat-code-block">' + highlightSyntax(displayCode) + '</pre></div>';
    });
    rendered = rendered.replace(/\n/g, "<br>").replace(/`([^`]+)`/g, function(_, c) { return "<code>" + highlightSyntax(c) + "</code>"; });
    div.innerHTML = rendered;
  } else {
    div.textContent = text;
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function cervChatSend() {
  const input = $("#cervChatInput");
  const msg = (input?.value || "").trim();
  if (!msg) return;
  input.value = "";
  input.style.height = "auto";
  cervAddChatMsg("user", msg);
  cervChatHistory.push({ role: "user", content: msg });

  const notesCtx = cervNotes.map(n => `[${n.title}] ${n.content.slice(0, 300)}`).join("\n---\n");
  const h = { "Content-Type": "application/json" };
  const tk = proxyToken();
  if (tk) h["Authorization"] = `Bearer ${tk}`;
  if (state.apiKey) h["x-anthropic-key"] = state.apiKey;

  const container = $("#cervChatMessages");
  var connDiv = document.createElement("div");
  connDiv.className = "cerv-conn-badges";
  connDiv.innerHTML = '<span class="cerv-conn-badge cerv-conn-supa"><span class="cerv-conn-dot" style="background:#3ECF8E"></span>Supabase · Edge Function...</span>';
  if (container) { container.appendChild(connDiv); container.scrollTop = container.scrollHeight; }

  const thinkDiv = document.createElement("div");
  thinkDiv.className = "cerv-chat-msg assistant";
  if (container) { container.appendChild(thinkDiv); container.scrollTop = container.scrollHeight; }
  startReflexion(thinkDiv);

  var connT1 = setTimeout(function() {
    connDiv.innerHTML += '<span class="cerv-conn-badge cerv-conn-anth"><span class="cerv-conn-dot" style="background:#CC785C"></span>Agent AL réfléchit...</span>';
  }, 350);

  var cervAbort = new AbortController();
  var cervTimeout = setTimeout(function() { cervAbort.abort(); }, 25000);

  try {
    const res = await fetch(AI_PROXY, {
      method: "POST",
      headers: h,
      signal: cervAbort.signal,
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `Tu es l'assistant du Deuxième Cerveau de ti-lex-AL. L'utilisateur a ${cervNotes.length} note(s) :\n\n${notesCtx}\n\nRéponds en te basant sur ces notes quand pertinent. Français québécois, concis et utile.`,
        messages: cervChatHistory
      })
    });
    clearTimeout(cervTimeout);
    clearTimeout(connT1);
    if (connDiv.parentNode) connDiv.remove();
    if (thinkDiv._stopReflexion) thinkDiv._stopReflexion();
    if (thinkDiv.parentNode) thinkDiv.remove();
    if (!res.ok) {
      cervAddChatMsg("assistant", "Erreur : " + res.status);
      return;
    }
    const reply = await streamText(res, () => {});
    cervAddChatMsg("assistant", reply || "…");
    cervChatHistory.push({ role: "assistant", content: reply });
  } catch (e) {
    clearTimeout(cervTimeout);
    clearTimeout(connT1);
    if (connDiv.parentNode) connDiv.remove();
    if (thinkDiv._stopReflexion) thinkDiv._stopReflexion();
    if (thinkDiv.parentNode) thinkDiv.remove();
    var errMsg = e.name === "AbortError" ? "Délai dépassé (25s) — réessaie." : "Erreur de connexion.";
    cervAddChatMsg("assistant", errMsg);
  }
}

(function initCerveau() {
  cervLoadNotes();

  const search = $("#cervSearch");
  if (search) search.oninput = () => cervRenderList();

  const newBtn = $("#cervNewBtn");
  if (newBtn) newBtn.onclick = () => cervOpenEditor(null);

  const backBtn = $("#cervBackBtn");
  if (backBtn) backBtn.onclick = () => cervCloseEditor();

  const saveBtn = $("#cervSaveBtn");
  if (saveBtn) saveBtn.onclick = () => cervSaveNote();

  const delBtn = $("#cervDelBtn");
  if (delBtn) delBtn.onclick = () => cervDeleteNote();

  const tagsBtn = $("#cervAiTagsBtn");
  if (tagsBtn) tagsBtn.onclick = () => cervSuggestTags();

  const sumBtn = $("#cervAiSumBtn");
  if (sumBtn) sumBtn.onclick = () => cervSummarize();

  const tagInput = $("#cervTagInput");
  if (tagInput) {
    tagInput.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const val = tagInput.value.trim().replace(",", "").toLowerCase();
        if (val) {
          const existing = cervGetEditorTags();
          if (!existing.includes(val)) cervRenderEditorTags([...existing, val]);
          tagInput.value = "";
        }
      }
    };
  }

  const toggleChat = $("#cervToggleChat");
  if (toggleChat) toggleChat.onclick = () => cervToggleChatPanel();

  const chatClose = $("#cervChatClose");
  if (chatClose) chatClose.onclick = () => cervToggleChatPanel();

  const chatInput = $("#cervChatInput");
  const chatSend = $("#cervChatSend");
  if (chatInput) {
    chatInput.oninput = () => {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    };
    chatInput.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); cervChatSend(); }
    };
  }
  if (chatSend) chatSend.onclick = () => cervChatSend();
})();

/* ============ AGENT FINANCE ============ */
const FIN_SYSTEM = `Tu es « Agent Finance », un assistant spécialisé en finances personnelles et en crypto-actifs, conçu au Québec.

RÔLE
- Tu aides les gens à mieux comprendre et gérer leur argent : budget, épargne, gestion des dettes, fonds d'urgence, comptes enregistrés (CELI, REER, REEE, RAP), bases de la fiscalité, planification de projets (auto, maison, retraite) et notions de cryptomonnaie.
- Tu donnes de l'INFORMATION ÉDUCATIVE et des cadres de réflexion. Tu n'es pas un planificateur financier agréé : tu ne donnes pas de conseil personnalisé, de recommandation de produit précis, ni de garantie de rendement.
- Pour toute décision importante ou situation complexe (placements, fiscalité avancée, assurances, succession), tu invites clairement la personne à consulter un professionnel agréé.

CRYPTO
- Tu expliques de façon neutre et éducative : fonctionnement de la blockchain, Bitcoin, Ethereum, jetons et stablecoins, portefeuilles (chaud/froid), plateformes d'échange et frais.
- Sécurité d'abord : clés privées, phrase de récupération, hameçonnage, arnaques, autogarde vs garde par une plateforme.
- Fiscalité au Canada/Québec : l'ARC et Revenu Québec traitent généralement les gains en crypto comme gain en capital ou revenu d'entreprise selon l'activité, et les opérations doivent être déclarées ; rappelle de tenir un registre et de valider avec un comptable.
- Place dans un portefeuille : tu insistes sur la très grande volatilité et le risque de perte totale, le principe « n'investis que ce que tu peux te permettre de perdre », une taille de position prudente et la diversification.
- Limites : tu ne recommandes jamais d'acheter ou de vendre un jeton précis, tu ne prédis pas les prix, tu ne fais pas la promotion d'un projet, et tu n'exécutes aucune transaction (tu informes seulement).

STYLE
- Tu réponds en français clair et accessible, ton chaleureux et concret, adapté au Québec.
- Tu structures tes réponses : courtes explications, étapes numérotées, listes à puces et exemples chiffrés simples quand c'est utile.
- Tu poses 1 ou 2 questions de clarification quand il manque de l'info (revenu, objectif, tolérance au risque, échéance), sans submerger la personne.
- Tu restes prudent et honnête : tu nommes les hypothèses, les risques et les compromis. Tu évites le jargon ou tu l'expliques.
- Tu n'encourages pas la spéculation et tu réponds de façon concise (vise 4 à 12 lignes, sauf si on te demande plus de détails).

Commence par bien comprendre le besoin, puis donne une réponse utile et actionnable.`;

const finHistory = [];
let finLoading = false;

function finMiniMark() {
  return `<svg width="15" height="15" viewBox="0 0 40 40"><polyline points="9,27 17,19 22.5,23 31,12" fill="none" stroke="#ff7a1a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="31" cy="12" r="3.2" fill="#ff9d52"/></svg>`;
}

function finRenderMd(text) {
  return String(text)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<div class="fin-h3">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="fin-h2">$1</div>')
    .replace(/^# (.+)$/gm, '<div class="fin-h1">$1</div>')
    .replace(/^\s*[-*•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/^\s*(\d+)[.)]\s+(.+)$/gm, '<li class="ol-item">$2</li>')
    .replace(/(<li class="ol-item">.*<\/li>)/gs, '<ol>$1</ol>')
    .replace(/<\/ol>\s*<ol>/g, '')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/* ---- Finance typewriter ---- */
let _finTypeTimer = null;
function finTypewriter() {
  if (_finTypeTimer) { clearTimeout(_finTypeTimer); _finTypeTimer = null; }
  window._finTyping = true;
  const s = I18N[state.lang] || I18N.fr;
  const titleEl = $("#finTypeTitle");
  const subEl = $("#finTypeSub");
  if (!titleEl || !subEl) return;
  titleEl.innerHTML = "";
  subEl.textContent = "";
  subEl.style.opacity = "0";

  const rawTitle = s.finWelcomeTitle || "Voir clair dans<br>tes finances.";
  const parts = rawTitle.split("<br>");
  const line1 = parts[0] || "";
  const line2 = parts[1] || "";
  const subText = s.finWelcomeSub || "";

  const span1 = document.createElement("span");
  span1.className = "fin-type-line";
  const span2 = document.createElement("span");
  span2.className = "fin-type-line";
  titleEl.appendChild(span1);
  titleEl.appendChild(document.createElement("br"));
  titleEl.appendChild(span2);

  let i1 = 0, i2 = 0, iSub = 0;
  const half1 = Math.floor(line1.length * 0.5);
  let line2Started = false, subStarted = false;

  function typeStep() {
    if (i1 < line1.length) {
      span1.textContent += line1[i1];
      i1++;
      if (i1 >= half1 && !line2Started) line2Started = true;
    }
    if (line2Started && i2 < line2.length) {
      span2.textContent += line2[i2];
      i2++;
    }
    if (i1 >= line1.length && i2 >= line2.length && !subStarted) {
      subStarted = true;
      subEl.style.opacity = "1";
      subEl.style.transition = "opacity .4s";
    }
    if (subStarted && iSub < subText.length) {
      subEl.textContent += subText[iSub];
      iSub++;
    }

    if (i1 < line1.length || i2 < line2.length || iSub < subText.length) {
      let delay;
      if (iSub > 0) delay = 18;
      else if (i2 > 0 && i1 >= line1.length) delay = 55;
      else delay = 50;
      _finTypeTimer = setTimeout(typeStep, delay);
    } else {
      window._finTyping = false;
      const chips = $("#finSuggestions");
      if (chips) { chips.style.opacity = "0"; chips.style.transition = "opacity .6s ease"; requestAnimationFrame(() => chips.style.opacity = "1"); }
    }
  }

  const chips = $("#finSuggestions");
  if (chips) chips.style.opacity = "0";
  _finTypeTimer = setTimeout(typeStep, 400);
}

/* ---- Finance fluid multi-line typewriter ---- */
function finFluidTyper(bubble, container) {
  let fullText = "", done = false, raf = 0;
  const cursors = [];
  let lastTs = 0;

  function splitLines(text) {
    const html = finRenderMd(text);
    const parts = html.split(/<br\s*\/?>|<\/li>|<\/div>/gi).filter(p => p.trim());
    return parts;
  }

  function render(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(ts - lastTs, 80);
    lastTs = ts;

    const lines = splitLines(fullText);
    let anyActive = false;

    for (let i = 0; i < lines.length; i++) {
      if (!cursors[i]) cursors[i] = { pos: 0, started: false };
      const c = cursors[i];
      const raw = lines[i].replace(/<[^>]+>/g, "");
      const total = raw.length;
      if (total === 0) { c.pos = 0; c.started = true; continue; }

      const prev = cursors[i - 1];
      if (i === 0) {
        c.started = true;
      } else if (prev && prev.started) {
        const prevRaw = (lines[i - 1] || "").replace(/<[^>]+>/g, "");
        const prevTotal = prevRaw.length || 1;
        if (prev.pos / prevTotal >= 0.5) c.started = true;
      }

      if (!c.started) continue;

      const backlog = total - c.pos;
      let cps = 120;
      if (backlog > 100) cps = 350;
      else if (backlog > 40) cps = 220;
      const add = Math.max(1, Math.round((cps * dt) / 1000));
      c.pos = Math.min(total, c.pos + add);
      if (c.pos < total) anyActive = true;
    }

    let output = "";
    for (let i = 0; i < lines.length; i++) {
      const c = cursors[i];
      if (!c || !c.started) break;
      const raw = lines[i].replace(/<[^>]+>/g, "");
      const visible = raw.slice(0, c.pos);
      const tags = lines[i];
      let built = "", ti = 0, ri = 0;
      for (let j = 0; j < tags.length && ri <= c.pos; j++) {
        if (tags[j] === "<") {
          const end = tags.indexOf(">", j);
          if (end !== -1) { built += tags.slice(j, end + 1); j = end; continue; }
        }
        if (ri < c.pos) { built += tags[j]; ri++; }
        else break;
      }
      const isLast = (i === lines.length - 1) || !cursors[i + 1]?.started;
      const cursor = isLast && (anyActive || !done) ? '<span class="fin-cursor">|</span>' : "";
      output += built + cursor;
      if (i < lines.length - 1) output += "<br>";
    }

    bubble.innerHTML = output;
    container.scrollTop = container.scrollHeight;

    if (anyActive || !done) {
      raf = requestAnimationFrame(render);
    } else {
      bubble.innerHTML = finRenderMd(fullText);
      container.scrollTop = container.scrollHeight;
    }
  }

  return {
    push(text) {
      fullText = text;
      if (!raf) { lastTs = 0; raf = requestAnimationFrame(render); }
    },
    finish() {
      done = true;
    }
  };
}

function finAddMsg(role, content, error) {
  const container = $("#finMessages");
  const welcome = $("#finWelcome");
  if (welcome) welcome.style.display = "none";

  const wrap = document.createElement("div");
  wrap.className = `fin-msg-wrap ${role}`;

  if (role === "user") {
    wrap.innerHTML = `<div class="fin-msg-inner"><div class="fin-bubble-user">${escapeHtml(content)}</div></div>`;
  } else {
    wrap.innerHTML = `<div class="fin-msg-inner">
      <div class="fin-msg-label">${finMiniMark()}<span>Agent Finance</span></div>
      <div class="fin-bubble-ai${error ? ' error' : ''}">${finRenderMd(content)}</div>
    </div>`;
  }
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return wrap;
}

function finShowTyping() {
  const container = $("#finMessages");
  const wrap = document.createElement("div");
  wrap.className = "fin-msg-wrap assistant";
  wrap.id = "finTyping";
  wrap.innerHTML = `<div class="fin-msg-inner">
    <div class="fin-msg-label">${finMiniMark()}<span>Agent Finance</span></div>
    <div class="fin-bubble-ai"><div class="fin-typing"><span></span><span></span><span></span></div></div>
  </div>`;
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function finRemoveTyping() {
  const t = $("#finTyping");
  if (t) t.remove();
}

async function finSend(text) {
  const input = $("#finInput");
  const content = (text || input.value).trim();
  if (!content || finLoading) return;
  input.value = "";
  input.style.height = "auto";
  $("#finSend").disabled = true;

  finAddMsg("user", content);
  finHistory.push({ role: "user", content });
  finLoading = true;
  finShowTyping();

  try {
    const h = { "Content-Type": "application/json" };
    const tk = proxyToken();
    if (tk) h["Authorization"] = `Bearer ${tk}`;
    if (state.apiKey) h["x-anthropic-key"] = state.apiKey;

    const res = await fetch(AI_PROXY, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: FIN_SYSTEM,
        messages: finHistory.filter(m => !m.error).map(m => ({ role: m.role, content: m.content }))
      })
    });

    if (!res.ok) {
      const errMsg = await apiError(res);
      finRemoveTyping();
      finAddMsg("assistant", errMsg, true);
      return;
    }

    finRemoveTyping();
    const wrap = finAddMsg("assistant", "");
    const bubble = wrap.querySelector(".fin-bubble-ai");
    const container = $("#finMessages");
    const typer = finFluidTyper(bubble, container);

    const reply = await streamText(res, (partial) => {
      typer.push(partial);
    });

    typer.finish();
    await new Promise(r => setTimeout(r, 600));
    bubble.innerHTML = finRenderMd(reply);
    const msg = reply.trim() || t("finNoReply");
    finHistory.push({ role: "assistant", content: msg });
  } catch (e) {
    finRemoveTyping();
    finAddMsg("assistant", t("finConnError"), true);
  } finally {
    finLoading = false;
    $("#finSend").disabled = !$("#finInput").value.trim();
  }
}

(function initFinance() {
  const input = $("#finInput");
  const sendBtn = $("#finSend");
  if (!input || !sendBtn) return;

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
    sendBtn.disabled = !input.value.trim() || finLoading;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finSend(); }
  });
  sendBtn.addEventListener("click", () => finSend());

  document.querySelectorAll(".fin-chip").forEach(btn => {
    btn.addEventListener("click", () => finSend(btn.dataset.q));
  });
})();

document.addEventListener("mousemove", (e) => {
  document.querySelectorAll(".avatar-ia__eye").forEach(eye => {
    const r = eye.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const a = Math.atan2(e.clientY - cy, e.clientX - cx);
    const d = Math.min(3, Math.hypot(e.clientX - cx, e.clientY - cy) / 30);
    const p = eye.querySelector(".avatar-ia__pupil");
    if (p) p.style.transform = `translate(calc(-50% + ${Math.cos(a)*d}px), calc(-50% + ${Math.sin(a)*d}px))`;
  });
});

console.log("ti-lex-AL v10 prêt — conforme Loi 25 du Québec.");
