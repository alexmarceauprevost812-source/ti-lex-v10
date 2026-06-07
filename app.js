/* ============================================================
   ti-lex-AL v10 — app.js
   ============================================================ */

const MODEL_DEFAULT = "claude-opus-4-8";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

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
};
state.agent = "tilex";
state.imageMode = false;
state.model = "claude-opus-4-8";

/* pièces jointes en attente d'envoi */
let attachments = [];

/* ---- Persistance locale (clé API Anthropic + modèle + connexions) ---- */
const LS_KEY = "tilex-al-apikey";
const LS_MODEL = "tilex-al-model";
const LS_GH = "tilex-al-github";
const LS_SB = "tilex-al-supabase";
const LS_MEMORY = "tilex-al-memory";
const LS_LANG = "tilex-al-lang";
function loadSettings() {
  try {
    const k = localStorage.getItem(LS_KEY);
    const m = localStorage.getItem(LS_MODEL);
    const lang = localStorage.getItem(LS_LANG);
    if (k) state.apiKey = k;
    if (m) state.model = m;
    if (lang && (lang === "fr" || lang === "en")) state.lang = lang;
    const gh = JSON.parse(localStorage.getItem(LS_GH) || "null");
    if (gh && gh.token) { state.github = gh; state.connected.github = true; }
    const sb = JSON.parse(localStorage.getItem(LS_SB) || "null");
    if (sb && sb.url) { state.supabase = sb; state.connected.supabase = true; }
  } catch (e) { /* localStorage indisponible */ }
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
  return new Date(ts).toLocaleDateString("fr-CA");
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
    const date = new Date(c.ts).toLocaleDateString("fr-CA");
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
    const date = new Date(c.ts).toLocaleDateString("fr-CA");
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
    el.innerHTML = '<p class="muted" style="font-size:.78rem;padding:6px 0">Aucun souvenir enregistré.</p>';
    return;
  }
  el.innerHTML = memory.map((m, i) => {
    const date = m.ts ? new Date(m.ts).toLocaleDateString("fr-CA") : "";
    return `<div class="memory-item"><span class="memory-text">${escapeHtml(m.text)}${date ? `<span class="memory-date">${date}</span>` : ""}</span><button class="memory-del" data-idx="${i}" title="Supprimer">×</button></div>`;
  }).join("");
  $$(".memory-del", el).forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); removeMemory(+btn.dataset.idx); };
  });
}

function apiHeaders() {
  const h = { "Content-Type": "application/json" };
  if (state.apiKey) {
    h["x-api-key"] = state.apiKey;
    h["anthropic-version"] = "2023-06-01";
    h["anthropic-dangerous-direct-browser-access"] = "true";
  }
  return h;
}
function useProxy() { return !state.apiKey; }
function proxyToken() {
  return state.supabase.key || "sb_publishable_c7TOExmCXvTMtXGCYJV44A_FFa5YjAm";
}
function chatFetch(bodyObj) {
  if (useProxy()) {
    const h = { "Content-Type": "application/json" };
    const tk = proxyToken();
    if (tk) h["Authorization"] = `Bearer ${tk}`;
    return fetch(AI_PROXY, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ kind: "chat", ...bodyObj }),
    });
  }
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(bodyObj),
  });
}

/* ---- Logos SVG officiels des services (inline, monochromes adaptés) ---- */
const SERVICE = {
  anthropic: { name: "Anthropic", svg: `<svg viewBox="0 0 24 24"><path fill="#ff6600" d="M14.6 3h-3.1L17 21h3.3L14.6 3zm-5.2 0L3.7 21H7l1.1-3.2h5.4L9.4 3zm-.3 11.3l1.8-5.4 1.8 5.4H9.1z"/></svg>` },
  github:    { name: "GitHub", svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>` },
  supabase:  { name: "Supabase", svg: `<svg viewBox="0 0 24 24"><path fill="#3ecf8e" d="M13.4 22.3c-.6.76-1.83.34-1.84-.63L11.4 8h9.4c1.7 0 2.65 1.96 1.6 3.29L13.4 22.3z"/><path fill="#3ecf8e" opacity=".6" d="M10.6 1.7c.6-.76 1.83-.34 1.84.63l.13 13.67H3.2c-1.7 0-2.65-1.96-1.6-3.29L10.6 1.7z"/></svg>` },
  vercel:    { name: "Vercel", svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L22 20H2L12 2z"/></svg>` },
  gmail:     { name: "Gmail", svg: `<svg viewBox="0 0 24 24"><path fill="#ea4335" d="M12 12.7L2 6.2V18a1 1 0 0 0 1 1h3V9.9l6 4.4 6-4.4V19h3a1 1 0 0 0 1-1V6.2L12 12.7z"/><path fill="#fbbc04" d="M2 6.2v.1L12 12.7 22 6.3v-.1a2 2 0 0 0-3.1-1.7L12 9.2 5.1 4.5A2 2 0 0 0 2 6.2z"/></svg>` },
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
    titles: { chat: "Agent AL", codex: "Codex", security: "Mode Sécurité", forfaits: "Forfaits", settings: "Paramètres" },
    nav: { chat: "Chat", codex: "Codex", security: "Sécurité", forfaits: "Forfaits", settings: "Paramètres" },
    conversations: "Conversations", projet: "Projet", nouvelle: "+ Nouvelle",
    placeholder: "Écris ton message…", send: "Envoyer",
    noProject: "Aucun projet connecté",
    connectGh: "Connecte GitHub dans le Codex pour voir tes conversations de projet.",
    installer: "Installer l'app",
  },
  en: {
    titles: { chat: "Agent AL", codex: "Codex", security: "Security Mode", forfaits: "Plans", settings: "Settings" },
    nav: { chat: "Chat", codex: "Codex", security: "Security", forfaits: "Plans", settings: "Settings" },
    conversations: "Conversations", projet: "Project", nouvelle: "+ New",
    placeholder: "Type your message…", send: "Send",
    noProject: "No project connected",
    connectGh: "Connect GitHub in the Codex to see your project conversations.",
    installer: "Install app",
  }
};

function t(key) { return I18N[state.lang]?.[key] ?? I18N.fr[key] ?? key; }

function applyLang() {
  const lang = state.lang;
  const strings = I18N[lang] || I18N.fr;
  $$(".nav-item[data-view]").forEach(b => {
    const lbl = $(".lbl", b);
    if (lbl && strings.nav[b.dataset.view]) lbl.textContent = strings.nav[b.dataset.view];
  });
  const convTitle = $(".conn-title");
  if (convTitle) convTitle.textContent = strings.conversations;
  const projTitle = $(".proj-section-header .conn-title");
  if (projTitle) projTitle.textContent = strings.projet;
  const newBtn = $("#newChatConv");
  if (newBtn) newBtn.textContent = strings.nouvelle;
  const projLabel = $("#projConvLabel");
  if (projLabel && projLabel.textContent.includes("Aucun") || projLabel?.textContent.includes("No "))
    projLabel.textContent = strings.noProject;
  const installBtn = $("#installBtn span");
  if (installBtn) installBtn.textContent = strings.installer;
  const input = $("#chatInput");
  if (input) input.placeholder = strings.placeholder;
}

const TITLES = I18N.fr.titles;
function switchView(v) {
  $$(".view").forEach(el => el.classList.remove("active"));
  $(`#view-${v}`).classList.add("active");
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  const titles = I18N[state.lang]?.titles || TITLES;
  $("#viewTitle").textContent = titles[v] || "Agent AL";
  if (window.innerWidth <= 860) { document.body.classList.remove("menu-open"); $("#overlay").classList.remove("show"); }
  if (v === "security" && typeof loadSecurityDashboard === "function") loadSecurityDashboard();
}
$$(".nav-item").forEach(b => b.dataset.view && (b.onclick = () => switchView(b.dataset.view)));

/* ================= SÉLECTEUR D'AGENTS ================= */
function renderAgents() {
  const list = $("#agentsList");
  if (!list) return;
  list.innerHTML = Object.entries(AGENTS).map(([key, a]) => `
    <button class="agent-card${key === state.agent ? ' active' : ''}" data-agent="${key}">
      <div class="agent-card-top">
        <span class="agent-emoji">${a.img ? `<img src="${a.img}" alt="">` : a.emoji}</span>
        <span class="agent-name">${a.name}</span>
      </div>
      <span class="agent-desc">${a.desc}</span>
    </button>`).join("");
  $$(".agent-card").forEach(c => c.onclick = () => {
    selectAgent(c.dataset.agent);
    closeAgents();
  });
}

function selectAgent(key) {
  state.agent = key;
  const a = AGENTS[key];
  if (a.model) {
    state.model = a.model;
    const ms = $("#modelSelect");
    if (ms) ms.value = a.model;
  }
  $("#agentsToggleName").textContent = a.name.replace("AL ", "") || a.name;
  const inp = $("#input");
  if (inp && !state.imageMode) inp.placeholder = `Écris à ${a.name}…`;
  renderAgents();
  renderAgentPicker();
}

function openAgents(){ $("#agentsPanel").classList.add("open"); $("#agentsOverlay").classList.add("show"); }
function closeAgents(){ $("#agentsPanel").classList.remove("open"); $("#agentsOverlay").classList.remove("show"); }
if ($("#agentsToggle")) $("#agentsToggle").onclick = openAgents;
if ($("#agentsClose")) $("#agentsClose").onclick = closeAgents;
if ($("#agentsOverlay")) $("#agentsOverlay").onclick = closeAgents;
renderAgents();

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
  menu.innerHTML = Object.entries(AGENTS).map(([key, a]) => `
    <button class="agent-pick${key === state.agent ? ' active' : ''}" data-agent="${key}">
      <span class="agent-pick-icon">${a.img ? `<img src="${a.img}" alt="">` : a.emoji}</span>
      <span class="agent-pick-info">
        <span class="agent-pick-name">${a.name}</span>
        <span class="agent-pick-desc">${a.desc}</span>
      </span>
    </button>`).join("");
  $$(".agent-pick", menu).forEach(p => {
    p.onclick = () => {
      selectAgent(p.dataset.agent);
      toggleAgentPicker(false);
    };
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
  $("#input").placeholder = state.imageMode ? "Décris l'image à générer…" : `Écris à ${AGENTS[state.agent].name}…`;
  let banner = $(".image-mode-banner");
  if (state.imageMode && !banner) {
    banner = document.createElement("div");
    banner.className = "image-mode-banner";
    banner.innerHTML = `🎨 Mode image <button id="exitImageMode">×</button>`;
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

    body.innerHTML = `<div class="typing"><span></span><span></span><span></span></div><p class="muted" style="margin-top:8px;font-size:.82rem">🎨 Amélioration du prompt par Claude…</p>`;

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

    body.innerHTML = `<div class="typing"><span></span><span></span><span></span></div><p class="muted" style="margin-top:8px;font-size:.82rem">🖼️ Génération de l'image en cours…</p>`;

    const res = await fetch(AI_PROXY, {
      method: "POST", headers: ih,
      body: JSON.stringify({ kind: "image", prompt: enhancedPrompt, size: "1024x1024" }),
    });
    const data = await res.json();
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    if (!res.ok || !data.b64) throw new Error(data.error || "Échec de génération");
    const src = `data:image/png;base64,${data.b64}`;
    body.innerHTML = `<div class="gen-image-wrap">
      <img src="${src}" alt="${escapeHtml(prompt)}" class="gen-image">
      <div class="gen-image-info">
        <p class="gen-image-prompt-label">Prompt amélioré :</p>
        <p class="gen-image-prompt">${escapeHtml(enhancedPrompt)}</p>
      </div>
      <div class="gen-image-actions">
        <a href="${src}" download="tilex-image.png" class="gen-dl-btn">⬇ Télécharger</a>
      </div>
    </div>`;
  } catch (err) {
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    body.innerHTML = `<p class="muted">Erreur image : ${escapeHtml(err.message)}</p>`;
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
    const t = $(".pill-txt", b);
    if (b.id === "reflexionToggle2") t.textContent = state.reflexion ? "Activé" : "Désactivé";
  });
  $("#modeHint").innerHTML = state.reflexion
    ? 'Mode réflexion <span class="orange">activé</span>'
    : 'Mode réflexion <span class="muted">désactivé</span>';
}
bindReflexion($("#reflexionToggle"));
bindReflexion($("#reflexionToggle2"));

$("#themeToggle").onclick = function () {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.body.dataset.theme = state.theme;
  this.setAttribute("aria-pressed", state.theme === "light");
  $(".pill-txt", this).textContent = state.theme === "light" ? "Clair" : "Sombre";
};

$("#modelSelect").onchange = e => {
  state.model = e.target.value;
  try { localStorage.setItem(LS_MODEL, state.model); } catch (e) {}
};
$("#saveKey").onclick = () => {
  state.apiKey = $("#apiKey").value.trim();
  try { localStorage.setItem(LS_KEY, state.apiKey); } catch (e) {}
  const b = $("#saveKey");
  b.dataset.w = "Enregis"; b.dataset.b = state.apiKey ? "tré ✓" : "tré ✗";
  setTimeout(() => { b.dataset.w = "Enregis"; b.dataset.b = "trer"; }, 1800);
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
  if (!token) { setGhState("— entre un token", false); return; }
  state.github.token = token;
  setGhState("connexion…", false);
  const btn = $("#ghConnect"); btn.disabled = true;
  try {
    const res = await fetch(`${GH_API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const repos = await res.json();
    const sel = $("#ghRepo");
    sel.innerHTML = `<option value="">— Choisir un dépôt (${repos.length}) —</option>` +
      repos.map(r => `<option value="${r.full_name}">${escapeHtml(r.full_name)}${r.private ? " 🔒" : ""}</option>`).join("");
    $("#ghRepoZone").classList.add("show");
    state.connected.github = true;
    const me = repos[0]?.owner?.login || "";
    setGhState(`✓ connecté${me ? " · " + me : ""}`, true);
    persistGithub();
    $$(`.conn-btn[data-service="github"]`).forEach(b => b.classList.add("connected"));
    syncCodexProjects();
    // restaure le dépôt précédent
    if (state.github.repo) { sel.value = state.github.repo; await ghLoadBranches(state.github.repo); }
  } catch (err) {
    setGhState(`✗ ${err.message} (token invalide ?)`, false);
    state.connected.github = false;
  } finally { btn.disabled = false; }
}

async function ghLoadBranches(repo) {
  if (!repo) return;
  state.github.repo = repo;
  state.projectFiles = [];
  const bsel = $("#ghBranch");
  bsel.innerHTML = `<option value="">chargement…</option>`;
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/branches?per_page=100`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const branches = await res.json();
    // détecte la branche par défaut
    const repoRes = await fetch(`${GH_API}/repos/${repo}`, { headers: ghHeaders() });
    const def = repoRes.ok ? (await repoRes.json()).default_branch : "main";
    bsel.innerHTML = branches.map(b =>
      `<option value="${b.name}"${b.name === def ? " selected" : ""}>${escapeHtml(b.name)}${b.name === def ? " (défaut)" : ""}</option>`
    ).join("");
    state.github.branch = bsel.value || def;
    persistGithub();
    await ghLoadFiles(repo, state.github.branch);
  } catch (err) {
    bsel.innerHTML = `<option value="">erreur: ${err.message}</option>`;
  }
}

async function ghLoadFiles(repo, branch) {
  const box = $("#ghFiles");
  box.innerHTML = `<p class="muted" style="font-size:.78rem">chargement des fichiers…</p>`;
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tree = await res.json();
    const files = (tree.tree || []).filter(t => t.type === "blob");
    if (!files.length) { box.innerHTML = `<p class="muted" style="font-size:.78rem">aucun fichier</p>`; return; }
    box.innerHTML = `<p class="muted" style="font-size:.74rem;padding:2px 6px 6px">${files.length} fichier(s) sur <b>${escapeHtml(branch)}</b></p>` +
      files.slice(0, 300).map(f =>
        `<div class="set-file-item"><span class="f-ico">${fileIcon(f.path)}</span>${escapeHtml(f.path)}</div>`
      ).join("");
  } catch (err) {
    box.innerHTML = `<p class="muted" style="font-size:.78rem">erreur fichiers: ${err.message}</p>`;
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
  if (!url || !key) { setSbState("— URL + clé requises", false); return; }
  setSbState("connexion…", false);
  const btn = $("#sbConnect"); btn.disabled = true;
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    state.supabase = { url, key };
    state.connected.supabase = true;
    setSbState("✓ connecté", true);
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

function handleImageFiles(files) {
  [...files].forEach(f => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      attachments.push({ kind: "image", name: f.name, mediaType: f.type || "image/png", base64, dataUrl, size: f.size });
      renderAttachStrip();
    };
    reader.readAsDataURL(f);
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
  if (!SR) { alert("La dictée vocale n'est pas supportée par ce navigateur."); return; }
  if (listening) { recognition && recognition.stop(); return; }
  recognition = new SR();
  recognition.lang = "fr-CA";
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
  const title = contentText(state.history[0]?.content).slice(0, 50) || "Sans titre";
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
  const el = $("#chatConvos");
  if (!el) return;
  if (!chatConvs.length) { el.innerHTML = '<p class="muted" style="font-size:.75rem;padding:4px 0">Aucune</p>'; return; }
  el.innerHTML = chatConvs.map((c, i) => {
    const age = c.ts ? timeAgo(c.ts) : "";
    return `<div class="chat-conv-item${i === activeChatConv ? ' active' : ''}" data-idx="${i}"><span class="conv-title">${escapeHtml(c.title)}</span>${age ? `<span class="conv-date">${age}</span>` : ""}<button class="conv-del" data-idx="${i}" title="Supprimer">×</button></div>`;
  }).join("");
  $$(".chat-conv-item", el).forEach(item => {
    item.onclick = (e) => {
      if (e.target.classList.contains("conv-del")) return;
      const idx = +item.dataset.idx;
      activeChatConv = idx;
      state.history = [...chatConvs[idx].messages];
      rebuildChatFromHistory();
      renderChatConvs();
    };
  });
  $$(".conv-del", el).forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.idx;
      chatConvs.splice(idx, 1);
      if (activeChatConv === idx) {
        activeChatConv = -1;
        state.history = [];
        resetChatWelcome();
      } else if (activeChatConv > idx) {
        activeChatConv--;
      }
      try { localStorage.setItem("tilex-chat-convs", JSON.stringify(chatConvs)); } catch (_) {}
      renderChatConvs();
    };
  });
}

function resetChatWelcome() {
  const msgs = $("#messages");
  msgs.innerHTML = `<div class="welcome">
    <div class="welcome-video-wrap">
      <video class="welcome-video" autoplay muted playsinline loop>
        <source src="assets/intro.mp4" type="video/mp4">
      </video>
    </div>
    <h2>Bienvenue sur <span class="orange">ti-lex-AL v10</span></h2>
    <p>L'agent IA québécois. Pose ta question, code avec le Codex, ou connecte tes services.</p>
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
$$(".sug").forEach(s => s.onclick = () => { input.value = s.textContent; sendMessage(); });

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
          <div style="display:flex;align-items:center;gap:6px"><span class="a-ico">🗜️</span><span class="a-name">${escapeHtml(a.name)} · ${a.entries.length} fichiers</span></div>
          <div class="zip-tree">${a.entries.slice(0, 50).map(e => `<div class="zip-tree-item"><span class="f-ico">${fileIcon(e.path)}</span>${escapeHtml(e.path)}</div>`).join("")}${a.entries.length > 50 ? `<div class="zip-tree-item muted">…et ${a.entries.length - 50} autres</div>` : ""}</div>
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
  return hits.map(s => `<span class="service-tag">${SERVICE[s].svg}${SERVICE[s].name}<span class="ok">● connecté</span></span>`).join("");
}

function buildAssistantMsg() {
  const m = document.createElement("div");
  m.className = "msg assistant responding";
  const avatarWrap = avatarAL();
  m.appendChild(avatarWrap);
  const av = avatarWrap._avatarIA || avatarWrap.querySelector(".ti-lex-avatar") || avatarWrap.querySelector(".al-avatar");
  if (av && av._setThinking) av._setThinking(true);
  const b = document.createElement("div");
  b.className = "msg-body";
  b.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  m.appendChild(b);
  messages.appendChild(m);
  messages.scrollTop = messages.scrollHeight;
  b._msgWrap = m;
  b._avatar = av;
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
  const useWeb = state.webSearch;
  addUserMsg(text, atts);
  input.value = ""; input.style.height = "auto";
  attachments = []; renderAttachStrip();

  const body = buildAssistantMsg();

  if (!state.apiKey && !AI_PROXY) {
    renderAssistant(body, "⚙ Ajoute ta clé API Anthropic dans les Paramètres (icône en bas à gauche) pour activer Agent AL.");
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  // construit le contenu (texte + images + fichiers texte)
  const apiContent = buildUserContent(text, atts);
  state.history.push({ role: "user", content: apiContent });
  $("#send").disabled = true;

  try {
    const DIAGRAM_HINT = " Quand c'est pertinent pour mieux expliquer (architecture, flux, relations, processus, comparaisons), utilise des diagrammes Mermaid dans des blocs ```mermaid. Types utiles : flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap, timeline.";
    const MEMORY_HINT = " Si l'utilisateur te demande de retenir quelque chose, inclus la balise [mémoire: fait à retenir] dans ta réponse pour que je le sauvegarde.";
    const BASE_BRAIN = AGENTS[state.agent].prompt + DIAGRAM_HINT + MEMORY_HINT + memoryContext() + recentConversationsContext();
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
    extractMemoryFromResponse(full);
    saveChatConv();
  } catch (err) {
    state.history.pop();
    if (body._avatar) { body._avatar._setThinking(false); body._avatar._setSpeaking(false); }
    body.innerHTML = `<p class="muted">Erreur : ${escapeHtml(err.message || "connexion à l'API")}. Vérifie ta clé API Anthropic dans les Paramètres.</p>`;
  } finally {
    $("#send").disabled = false;
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
      el.innerHTML = `<div class="mermaid-label"><svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/><path d="M3 9h18M9 3v18"/></svg>Diagramme</div>${svg}`;
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
  // Other code blocks
  ans = ans.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang ? `<div class="code-lang">${lang}</div>` : '';
    return `<pre class="chat-code-block">${langLabel}${highlightSyntax(code)}</pre>`;
  });
  ans = ans.replace(/\n/g, "<br>").replace(/`([^`]+)`/g, "<code>$1</code>");

  const caret = streaming ? '<span class="caret"></span>' : '';
  html += `<div>${ans}${caret}</div>`;
  if (!streaming) html += serviceTags(answer);
  body.innerHTML = html;
  if (!streaming) {
    if (answer) addCodeActions(body, full);
    renderMermaidBlocks(body);
    addTTSButton(body, answer);
  }
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
  const clean = cleanTextForTTS(text);
  if (!clean || clean.length < 5) return;

  const bar = document.createElement("div");
  bar.className = "tts-bar";
  bar.innerHTML = `
    <button class="tts-btn" title="Écouter la réponse">
      <svg class="tts-ico-play" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
      <svg class="tts-ico-stop hidden" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
      </svg>
      <span class="tts-label">Écouter</span>
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
      label.textContent = "Écouter";
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
    label.textContent = "Pause";
    btn.classList.add("tts-active");

    utterance.onend = () => {
      playIco.classList.remove("hidden");
      stopIco.classList.add("hidden");
      label.textContent = "Écouter";
      btn.classList.remove("tts-active");
    };
    utterance.onerror = utterance.onend;

    speechSynthesis.speak(utterance);
  };

  body.appendChild(bar);
}

if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = () => {};
}
async function pushToGithub(content, suggestedName) {
  if (!state.connected.github || !state.github.token || !state.github.repo) {
    alert("Connecte ton compte GitHub dans Paramètres d'abord.");
    return;
  }
  const filename = prompt("Nom du fichier à créer/mettre à jour sur GitHub :", suggestedName || "main.ts");
  if (!filename) return;
  const commitMsg = prompt("Message de commit :", `Ajout de ${filename} via ti-lex-AL`);
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
    alert(`Pushé sur ${repo}/${branch}/${filename}`);
  } catch (err) {
    alert(`Erreur push GitHub : ${err.message}`);
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
    alert("Connecte ton compte GitHub dans Paramètres d'abord.");
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
    alert(`Erreur push GitHub : ${err.message}`);
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
    header.innerHTML = `<svg viewBox="0 0 24 24" class="cfl-icon"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> <span>${codeFiles.length} fichier${codeFiles.length > 1 ? "s" : ""} détecté${codeFiles.length > 1 ? "s" : ""}</span>`;
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
      stBtn.title = "Ouvrir dans le Studio";
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
    studioBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> Ouvrir dans le Studio`;
    studioBtn.onclick = () => openInStudio(codeFiles[0].code, name);
    btns.appendChild(studioBtn);
  }

  if (state.connected.github) {
    if (codeFiles.length > 1 && codeFiles.some(f => f.detected)) {
      const pushAllBtn = document.createElement("button");
      pushAllBtn.className = "push-gh-btn push-all-btn";
      pushAllBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg> Push ${codeFiles.length} fichiers sur GitHub`;
      pushAllBtn.onclick = async () => {
        const commitMsg = prompt("Message de commit :", `Ajout de ${codeFiles.length} fichiers via Codex ti-lex-AL`);
        if (!commitMsg) return;
        pushAllBtn.disabled = true;
        pushAllBtn.innerHTML = `<span class="cfact-spin"></span> Push en cours…`;
        const ok = await pushMultipleToGithub(codeFiles, commitMsg);
        if (ok) {
          pushAllBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Pushé !`;
          pushAllBtn.classList.add("push-ok");
        } else {
          pushAllBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg> Réessayer`;
          pushAllBtn.disabled = false;
        }
      };
      btns.appendChild(pushAllBtn);

      const deployBtn = document.createElement("button");
      deployBtn.className = "push-gh-btn deploy-vercel-btn";
      deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="12 2 22 20 2 20"/></svg> Push + Deploy Vercel`;
      deployBtn.onclick = async () => {
        const commitMsg = prompt("Message de commit :", `Deploy ${codeFiles.length} fichiers via ti-lex-AL`);
        if (!commitMsg) return;
        deployBtn.disabled = true;
        deployBtn.innerHTML = `<span class="cfact-spin"></span> Push GitHub…`;
        const ok = await pushMultipleToGithub(codeFiles, commitMsg);
        if (!ok) {
          deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="12 2 22 20 2 20"/></svg> Réessayer`;
          deployBtn.disabled = false;
          return;
        }
        deployBtn.innerHTML = `<span class="cfact-spin"></span> Deploy Vercel…`;
        deployBtn.classList.add("deploying");
        setTimeout(() => {
          deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Déployé !`;
          deployBtn.classList.remove("deploying");
          deployBtn.classList.add("push-ok");
        }, 4000);
      };
      btns.appendChild(deployBtn);

    } else if (codeFiles.length === 1) {
      const ghBtn = document.createElement("button");
      ghBtn.className = "push-gh-btn";
      ghBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg> Push sur GitHub`;
      ghBtn.onclick = () => pushToGithub(codeFiles[0].code, codeFiles[0].path);
      btns.appendChild(ghBtn);

      const deployBtn = document.createElement("button");
      deployBtn.className = "push-gh-btn deploy-vercel-btn";
      deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="12 2 22 20 2 20"/></svg> Push + Deploy Vercel`;
      deployBtn.onclick = async () => {
        deployBtn.disabled = true;
        deployBtn.innerHTML = `<span class="cfact-spin"></span> Push GitHub…`;
        const ok = await pushToGithubSilent(codeFiles[0].code, codeFiles[0].path);
        if (!ok) {
          deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="12 2 22 20 2 20"/></svg> Réessayer`;
          deployBtn.disabled = false;
          return;
        }
        deployBtn.innerHTML = `<span class="cfact-spin"></span> Deploy Vercel…`;
        deployBtn.classList.add("deploying");
        setTimeout(() => {
          deployBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Déployé !`;
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

function escapeHtml(s) {
  return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

/* ---- Streaming SSE : écriture fluide, façon Claude Code ---- */
async function apiError(res) {
  try { const e = await res.json(); return e.error?.message || `HTTP ${res.status}`; }
  catch (_) { return `HTTP ${res.status}`; }
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
        throw new Error(evt.error?.message || "Erreur de diffusion");
      }
    }
  }
  return full;
}

/* ---- Typewriter fluide : révèle le texte caractère par caractère à vitesse
   régulière, indépendamment des paquets reçus du réseau. Continue d'écrire la
   suite (2e, 3e ligne…) pendant que le flux arrive. ---- */
function makeTyper(renderFn) {
  let target = "", shown = 0, running = false, finished = false, doneCb = null, last = 0;
  function step(ts) {
    if (!last) last = ts;
    const dt = Math.min(ts - last, 100); last = ts;
    const backlog = target.length - shown;
    // vitesse rapide ~200 car/s, accélère si le flux a beaucoup d'avance
    let cps = 200;
    if (backlog > 160) cps = 600;
    else if (backlog > 80) cps = 400;
    const add = Math.max(1, Math.round((cps * dt) / 1000));
    if (shown < target.length) {
      shown = Math.min(target.length, shown + add);
      renderFn(target.slice(0, shown));
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
      if (!running) { running = true; last = 0; requestAnimationFrame(step); }
    },
    finish(cb) {
      finished = true; doneCb = cb;
      if (!running) { shown = target.length; renderFn(target); if (cb) cb(); }
    },
  };
}
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
    if (st) st.textContent = on ? "connecté" : "—";
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
    if (status) { status.textContent = "connecté"; status.classList.add("ok"); }
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
  btn.textContent = "Connexion…";
  try {
    state.github.token = token;
    const res = await fetch(`${GH_API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, { headers: ghHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const repos = await res.json();
    state.connected.github = true;
    persistGithub();

    // remplir le select des repos
    const repoSel = $("#codexGhRepo");
    repoSel.innerHTML = `<option value="">— Dépôt (${repos.length}) —</option>` +
      repos.map(r => `<option value="${r.full_name}"${r.full_name === state.github.repo ? " selected" : ""}>${r.full_name}${r.private ? " 🔒" : ""}</option>`).join("");

    // aussi mettre à jour les Paramètres
    if ($("#ghToken")) $("#ghToken").value = token;
    setGhState("✓ connecté", true);
    $$(`.conn-btn[data-service="github"]`).forEach(b => b.classList.add("connected"));

    syncCodexProjects();
    renderProjConvs();

    if (state.github.repo) {
      repoSel.value = state.github.repo;
      await codexGhLoadBranches(state.github.repo);
    }
  } catch (err) {
    btn.textContent = "Erreur — réessayer";
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
  bsel.innerHTML = `<option value="">chargement…</option>`;
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
      if (info) info.innerHTML = `<span class="ok">✓</span> ${count} fichiers sur <b>${state.github.branch}</b>`;
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
    if (info) info.innerHTML = `Branche : <b>${e.target.value}</b>`;
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
    codexConvos.innerHTML = '<p class="muted" style="font-size:.78rem;padding:6px 0">Aucune conversation</p>';
    return;
  }
  codexConvos.innerHTML = codexHistory.map((c, i) => {
    const age = c.ts ? timeAgo(c.ts) : "";
    return `<div class="codex-sb-conv${i === activeConvIdx ? ' active' : ''}" data-idx="${i}"><span class="conv-title">${escapeHtml(c.prompt || "Sans titre")}</span>${age ? `<span class="conv-date">${age}</span>` : ""}<button class="conv-del" data-idx="${i}" title="Supprimer">×</button></div>`;
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
    if (label) label.textContent = "Aucun projet connecté";
    listEl.innerHTML = '<p class="muted" style="font-size:.75rem;padding:4px 0">Connecte GitHub dans le Codex pour voir tes conversations de projet.</p>';
    return;
  }

  const repoShort = state.github.repo.split("/").pop();
  if (label) label.textContent = `${repoShort} · ${state.github.branch || "main"}`;

  const list = projConvs[key] || [];
  if (!list.length) {
    listEl.innerHTML = '<p class="proj-conv-empty">Aucune conversation. Utilise le Codex pour commencer!</p>';
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
      <span class="proj-conv-title">${escapeHtml(c.prompt || "Sans titre")}</span>
      ${fileCount ? `<span class="proj-conv-badge">${fileCount} fich.</span>` : ""}
      ${age ? `<span class="proj-conv-date">${age}</span>` : ""}
      <button class="proj-conv-del" data-pidx="${origIdx}" title="Supprimer">×</button>
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
    <h2>Codex <span class="orange">ti-lex-AL</span></h2>
    <p>Décris ce que tu veux coder. Le code apparaîtra dans le chat.</p>
    <div class="suggest">
      <button class="csug" data-p="Génère une API REST Express avec TypeScript">API REST Express</button>
      <button class="csug" data-p="Crée un composant React avec hooks">Composant React</button>
      <button class="csug" data-p="Écris une migration SQL Supabase avec RLS">Migration SQL</button>
    </div>
  </div>`;
}

function rebuildCodexChat() {
  const area = $("#codexMessages");
  area.innerHTML = "";
  codexChatMsgs.forEach(m => {
    if (m.role === "user") {
      addCodexUserMsg(m.text);
    } else {
      const body = buildCodexAssistantMsg();
      if (body._msgWrap) body._msgWrap.classList.remove("responding");
      body.innerHTML = formatCode(m.text);
      addCodeActions(body, m.text);
    }
  });
}

$("#codexNewConv").onclick = () => {
  activeConvIdx = -1;
  activeProjConvIdx = -1;
  codexChatMsgs = [];
  $("#codeInput").value = "";
  const area = $("#codexMessages");
  area.innerHTML = `<div class="codex-welcome">
    <div class="codex-welcome-video-wrap"><video class="codex-welcome-video" autoplay muted playsinline loop><source src="assets/avatar-al.mp4" type="video/mp4"></video></div>
    <h2>Codex <span class="orange">ti-lex-AL</span></h2>
    <p>Décris ce que tu veux coder. Le code apparaîtra dans le chat.</p>
    <div class="suggest">
      <button class="csug" data-p="Génère une API REST Express avec TypeScript">API REST Express</button>
      <button class="csug" data-p="Crée un composant React avec hooks">Composant React</button>
      <button class="csug" data-p="Écris une migration SQL Supabase avec RLS">Migration SQL</button>
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
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      codexAttachments.push({ kind: "image", name: f.name, mediaType: f.type || "image/png", base64: dataUrl.split(",")[1], dataUrl, size: f.size });
      renderCodexAttachStrip();
    };
    reader.readAsDataURL(f);
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

  if (!state.apiKey && !AI_PROXY) {
    body.innerHTML = '<p class="muted">Ajoute ta clé API Anthropic dans les Paramètres pour utiliser le Codex.</p>';
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
  return d.toLocaleDateString("fr-CA");
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
    codexChatMsgs.push({ role: "assistant", text: full });
    saveCodexConv(text, full);
  } catch (err) {
    body.innerHTML = `<p class="muted">Erreur Codex : ${escapeHtml(err.message || "connexion")}. Vérifie ta clé API.</p>`;
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
    addCodexUserMsg("Scanner le projet");
    const b = buildCodexAssistantMsg();
    b.innerHTML = '<p class="muted">Connecte d\'abord un dépôt GitHub (Paramètres) ou uploade un ZIP pour scanner un projet.</p>';
    if (b._msgWrap) b._msgWrap.classList.remove("responding");
    return;
  }
  if (!state.apiKey) {
    addCodexUserMsg("Scanner le projet");
    const b = buildCodexAssistantMsg();
    b.innerHTML = '<p class="muted">Ajoute ta clé API Anthropic dans les Paramètres.</p>';
    if (b._msgWrap) b._msgWrap.classList.remove("responding");
    return;
  }

  addCodexUserMsg("🔍 Scanner le projet complet");
  codexChatMsgs.push({ role: "user", text: "🔍 Scanner le projet complet" });
  const body = buildCodexAssistantMsg();
  body.innerHTML = '<p class="muted">Lecture des fichiers du projet…</p><div class="typing"><span></span><span></span><span></span></div>';

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
    codexChatMsgs.push({ role: "assistant", text: full });
    saveCodexConv(`Scan projet : ${projectSourceLabel()}`, full);
  } catch (err) {
    body.innerHTML = `<p class="muted">Erreur scan : ${escapeHtml(err.message || "connexion")}.</p>`;
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
  return result.replace(/\n/g, "<br>");
}
function renderCodexMermaid(container) {
  renderMermaidBlocks(container);
}

function highlightSyntax(code) {
  return code
    .replace(/(\/\/[^\n]*)/g, '<span class="syn-comment">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|switch|case|break|default|interface|type|extends|implements|of|in|do|yield|static|get|set|super)\b/g, '<span class="syn-kw">$1</span>')
    .replace(/\b(string|number|boolean|void|null|undefined|any|true|false|Promise|Array|Object|Map|Set|console|document|window|process|require|module)\b/g, '<span class="syn-type">$1</span>')
    .replace(/(&quot;[^&]*?&quot;|&#039;[^&]*?&#039;|`[^`]*?`)/g, '<span class="syn-str">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="syn-num">$1</span>')
    .replace(/([a-zA-Z_$][\w$]*)\s*\(/g, '<span class="syn-fn">$1</span>(')
    .replace(/\.([a-zA-Z_$][\w$]*)/g, '.<span class="syn-fn">$1</span>');
}

/* ================= STUDIO ================= */
let studioZipFiles = [];
let studioGhFiles = [];
let studioCurrentFile = null;
let studioTempCounter = 0;

function openInStudio(code, suggestedName) {
  const name = suggestedName || `snippet-${++studioTempCounter}.txt`;
  const codeArea = $("#studioCode");
  const pathLabel = $("#studioFilePath");
  const pushBtn = $("#studioPushGh");
  codeArea.value = code;
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
    if (!allFiles.length) label.textContent = "Fichiers ZIP uploadés";
    else label.textContent += " + ZIP";
    allFiles.push(...studioZipFiles.map(z => ({ path: z.path, source: "zip", content: z.content })));
  }

  if (!allFiles.length) {
    tree.innerHTML = '<p class="muted" style="padding:12px;font-size:.8rem">Connecte GitHub ou uploade un ZIP pour voir les fichiers.</p>';
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
    html += `<div class="studio-tree-folder">${escapeHtml(folder === "/" ? "racine" : folder)}</div>`;
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
    codeArea.value = zf?.content || "(fichier binaire — contenu non lisible)";
  } else if (source === "github") {
    codeArea.value = "chargement…";
    try {
      const res = await fetch(`${GH_API}/repos/${state.github.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(state.github.branch)}`, { headers: ghHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      codeArea.value = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
      studioCurrentFile.sha = data.sha;
    } catch (err) {
      codeArea.value = `Erreur : ${err.message}`;
    }
  }

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
    const commitMsg = prompt("Message de commit :", `Mise à jour de ${path} via ti-lex Studio`);
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
      alert(`Pushé : ${state.github.repo}/${state.github.branch}/${path}`);
    } catch (err) {
      alert(`Erreur push : ${err.message}`);
    }
  };
}

/* init */
loadSettings();
$("#apiKey").value = state.apiKey;
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

// restaure les champs de connexion
if (state.github.token) $("#ghToken").value = state.github.token;
if (state.supabase.url) $("#sbUrl").value = state.supabase.url;
if (state.supabase.key) $("#sbKey").value = state.supabase.key;

// ré-applique l'état "connecté" sur les boutons (après loadSettings)
Object.keys(state.connected).forEach(s => {
  if (state.connected[s]) $$(`.conn-btn[data-service="${s}"]`).forEach(b => b.classList.add("connected"));
});
if (state.connected.github) { setGhState("✓ connecté", true); }
if (state.connected.supabase) { setSbState("✓ connecté", true); }

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
    if (!confirm("Effacer toute la mémoire d'Agent AL ?")) return;
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
    if (scanLbl) scanLbl.textContent = "total";
  } else {
    if (scanEl) scanEl.textContent = activeCount > 0 ? "0" : "—";
    if (scanLbl) scanLbl.textContent = activeCount > 0 ? "prêt" : "en attente d'autorisation";
  }

  const { data: findings } = await sowQuery("scan_findings", "select", "id", {});
  const fEl = document.getElementById("findingCount");
  if (fEl) fEl.textContent = findings && findings.length > 0 ? findings.length : "—";

  await loadSowList(userId);
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
    list.innerHTML = '<p class="muted" style="font-size:.85rem;padding:8px 0">Aucun SOW. Clique "+ Nouveau SOW" pour créer ta première autorisation.</p>';
    return;
  }

  list.innerHTML = sows.map(s => {
    const scopeIn = Array.isArray(s.scope_in) ? s.scope_in.join(", ") : "";
    const start = s.starts_at ? new Date(s.starts_at).toLocaleDateString("fr-CA") : "—";
    const end = s.expires_at ? new Date(s.expires_at).toLocaleDateString("fr-CA") : "—";
    const actions = s.status === "draft"
      ? `<button class="sow-btn-activate" onclick="activateSow('${s.id}')">Activer</button>
         <button class="sow-btn-revoke" onclick="revokeSow('${s.id}')">Supprimer</button>`
      : s.status === "active"
      ? `<button class="sow-btn-revoke" onclick="revokeSow('${s.id}')">Révoquer</button>`
      : "";
    return `<div class="sow-item">
      <div class="sow-item-info">
        <div class="sow-item-title">${escapeHtml(s.title)}</div>
        <div class="sow-item-client">${escapeHtml(s.client_name)}</div>
        <div class="sow-item-scope">Scope: ${escapeHtml(scopeIn || "non défini")}</div>
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
    alert("Remplis tous les champs obligatoires (*).");
    return;
  }

  const checkboxes = document.querySelectorAll("#sowForm .sow-scan-types input:checked");
  const scanTypes = Array.from(checkboxes).map(c => c.value);
  if (scanTypes.length === 0) {
    alert("Sélectionne au moins un type de scan.");
    return;
  }

  const userId = (await state.supabase.client?.auth?.getUser?.())?.data?.user?.id;
  if (!userId) { alert("Connecte-toi d'abord."); return; }

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
  if (!confirm("Activer ce SOW ? Les scans deviendront possibles pour les cibles listées.")) return;
  const { error } = await state.supabase.client.from("scan_authorizations")
    .update({ status: "active", signed_at: new Date().toISOString(), signed_by: "owner" })
    .eq("id", id);
  if (error) { alert("Erreur: " + error.message); return; }
  await loadSecurityDashboard();
}

async function revokeSow(id) {
  const action = confirm("Révoquer/supprimer ce SOW ? Les scans associés seront bloqués.") ? "revoked" : null;
  if (!action) return;
  const { error } = await state.supabase.client.from("scan_authorizations")
    .update({ status: "revoked" })
    .eq("id", id);
  if (error) { alert("Erreur: " + error.message); return; }
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
      alert("Pour installer ti-lex-AL :\n\n1. Appuie sur le bouton Partager (en bas)\n2. Choisis « Sur l'écran d'accueil »\n3. Confirme avec « Ajouter »");
    } else if (_isSamsung) {
      alert("Pour installer ti-lex-AL sur Samsung :\n\n1. Appuie sur le menu ☰ (en bas à droite)\n2. Choisis « Ajouter la page à »\n3. Sélectionne « Écran d'accueil »\n4. Confirme avec « Ajouter »");
    } else {
      alert("Pour installer ti-lex-AL :\n\n1. Ouvre le menu ⋮ de ton navigateur\n2. Choisis « Installer l'application »\n3. Confirme");
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
  if (!confirm("Supprimer TOUTES vos données locales ?\n\nConversations, mémoire, préférences, connexions — tout sera effacé.\n\nCette action est irréversible.")) return;
  if (!confirm("Dernière confirmation : voulez-vous vraiment tout supprimer ?")) return;
  const keys = ["tilex-al-apikey", "tilex-al-model", "tilex-al-github", "tilex-al-supabase",
    "tilex-al-memory", "tilex-chat-convs", "tilex-codex-history", "tilex-consent"];
  keys.forEach(k => localStorage.removeItem(k));
  alert("Toutes vos données locales ont été supprimées.");
  location.reload();
}

function withdrawConsent() {
  if (!confirm("Retirer votre consentement ?\n\nVos données locales seront supprimées et vous serez redirigé vers la page d'accueil.")) return;
  const keys = ["tilex-al-apikey", "tilex-al-model", "tilex-al-github", "tilex-al-supabase",
    "tilex-al-memory", "tilex-chat-convs", "tilex-codex-history"];
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
    el.textContent = el.dataset[period] || el.dataset.monthly;
  });
  $$(".fp-billed").forEach(el => {
    el.textContent = el.dataset[period] || " ";
  });
}
requestAnimationFrame(() => { requestAnimationFrame(() => fpSetPeriod("monthly")); });

const SUPABASE_FN = "https://rnuripmfozlxenryxhdc.supabase.co/functions/v1";

const PAYMENT_LINKS = {
  starter:    "https://buy.stripe.com/3cI9AT3Fk3vj2aCaQK53O07",
  pro:        "https://buy.stripe.com/7sY3cv1xcd5T2aC5wq53O06",
  industrial: "https://buy.stripe.com/dRmdR94Jo0j7bLc2ke53O05",
};

function getSupabaseSession() {
  try {
    const raw = localStorage.getItem("sb-rnuripmfozlxenryxhdc-auth-token");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function subscribeToplan(plan) {
  const session = getSupabaseSession();
  const user = session?.user;
  if (!user) {
    alert("Connecte-toi d'abord pour t'abonner.");
    return;
  }

  const link = PAYMENT_LINKS[plan];
  if (!link) return;

  const url = new URL(link);
  url.searchParams.set("client_reference_id", user.id);
  if (user.email) url.searchParams.set("prefilled_email", user.email);

  window.location.href = url.toString();
}

async function manageSubscription() {
  const session = getSupabaseSession();
  if (!session?.access_token) {
    alert("Connecte-toi d'abord pour gérer ton abonnement.");
    return;
  }

  const btn = $("#manageSubscriptionBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Chargement…"; }

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
      alert(data.error || "Erreur lors de l'ouverture du portail.");
      if (btn) { btn.disabled = false; btn.textContent = "Gérer mon abonnement"; }
    }
  } catch (err) {
    alert("Erreur réseau. Réessaie plus tard.");
    if (btn) { btn.disabled = false; btn.textContent = "Gérer mon abonnement"; }
  }
}

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
