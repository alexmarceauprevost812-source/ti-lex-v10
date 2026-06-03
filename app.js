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
  apiKey: "",
  history: [],
  connected: { anthropic: true, github: false, supabase: false, vercel: false, gmail: false },
};

/* ---- Persistance locale (clé API Anthropic + modèle) ---- */
const LS_KEY = "tilex-al-apikey";
const LS_MODEL = "tilex-al-model";
function loadSettings() {
  try {
    const k = localStorage.getItem(LS_KEY);
    const m = localStorage.getItem(LS_MODEL);
    if (k) state.apiKey = k;
    if (m) state.model = m;
  } catch (e) { /* localStorage indisponible */ }
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

const TITLES = { chat: "Agent AL", codex: "Codex", security: "Mode Sécurité", settings: "Paramètres" };
function switchView(v) {
  $$(".view").forEach(el => el.classList.remove("active"));
  $(`#view-${v}`).classList.add("active");
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $("#viewTitle").textContent = TITLES[v] || "Agent AL";
  if (window.innerWidth <= 860) { document.body.classList.remove("menu-open"); $("#overlay").classList.remove("show"); }
}
$$(".nav-item").forEach(b => b.dataset.view && (b.onclick = () => switchView(b.dataset.view)));

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

/* ================= CONNECTEURS ================= */
$$(".conn-btn").forEach(btn => {
  btn.onclick = () => {
    const s = btn.dataset.service;
    state.connected[s] = !state.connected[s];
    $$(`.conn-btn[data-service="${s}"]`).forEach(b => b.classList.toggle("connected", state.connected[s]));
    syncCodexProjects();
  };
  if (state.connected[btn.dataset.service]) btn.classList.add("connected");
});

/* ================= CHAT CONVERSATIONS ================= */
let chatConvs = JSON.parse(localStorage.getItem("tilex-chat-convs") || "[]");
let activeChatConv = -1;

function saveChatConv() {
  if (!state.history.length) return;
  const title = state.history[0]?.content?.slice(0, 50) || "Sans titre";
  if (activeChatConv >= 0) {
    chatConvs[activeChatConv] = { title, messages: [...state.history], ts: Date.now() };
  } else {
    chatConvs.unshift({ title, messages: [...state.history], ts: Date.now() });
    activeChatConv = 0;
  }
  if (chatConvs.length > 20) chatConvs.length = 20;
  try { localStorage.setItem("tilex-chat-convs", JSON.stringify(chatConvs)); } catch (_) {}
  renderChatConvs();
}

function renderChatConvs() {
  const el = $("#chatConvos");
  if (!el) return;
  if (!chatConvs.length) { el.innerHTML = '<p class="muted" style="font-size:.75rem;padding:4px 0">Aucune</p>'; return; }
  el.innerHTML = chatConvs.map((c, i) =>
    `<div class="chat-conv-item" data-idx="${i}">${escapeHtml(c.title)}</div>`
  ).join("");
  $$(".chat-conv-item").forEach(item => {
    item.onclick = () => {
      const idx = +item.dataset.idx;
      activeChatConv = idx;
      state.history = [...chatConvs[idx].messages];
      rebuildChatFromHistory();
    };
  });
}

function rebuildChatFromHistory() {
  const msgs = $("#messages");
  msgs.innerHTML = "";
  state.history.forEach(m => {
    if (m.role === "user") addUserMsg(m.content);
    else {
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
    const msgs = $("#messages");
    msgs.innerHTML = `<div class="welcome">
      <img src="logo.png" alt="ti-lex-AL" class="welcome-logo">
      <h2>Bienvenue sur <span class="orange">ti-lex-AL v10</span></h2>
      <p>L'agent IA québécois. Pose ta question, code avec le Codex, ou connecte tes services.</p>
    </div>`;
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
  const d = document.createElement("div");
  d.className = "msg-avatar msg-avatar-user"; d.textContent = "A";
  return d;
}
function avatarAL() {
  const wrap = document.createElement("div");
  wrap.className = "msg-avatar-wrap";
  const img = document.createElement("img");
  img.className = "msg-avatar"; img.src = "logo.png"; img.alt = "AL";
  wrap.appendChild(img);
  const claude = document.createElement("img");
  claude.className = "claude-badge";
  claude.src = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Claude_AI_logo.svg/40px-Claude_AI_logo.svg.png";
  claude.alt = "Claude";
  wrap.appendChild(claude);
  return wrap;
}

function addUserMsg(text) {
  $(".welcome")?.remove();
  const m = document.createElement("div");
  m.className = "msg user";
  m.appendChild(avatarUser());
  const b = document.createElement("div");
  b.className = "msg-body";
  b.textContent = text;
  m.appendChild(b);
  messages.appendChild(m);
  messages.scrollTop = messages.scrollHeight;
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
  m.appendChild(avatarAL());
  const b = document.createElement("div");
  b.className = "msg-body";
  b.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  m.appendChild(b);
  messages.appendChild(m);
  messages.scrollTop = messages.scrollHeight;
  b._msgWrap = m;
  return b;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  addUserMsg(text);
  input.value = ""; input.style.height = "auto";

  const body = buildAssistantMsg();

  if (!state.apiKey) {
    renderAssistant(body, "⚙ Ajoute ta clé API Anthropic dans les Paramètres (icône en bas à gauche) pour activer Agent AL.");
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  state.history.push({ role: "user", content: text });
  $("#send").disabled = true;

  try {
    const sys = state.reflexion
      ? "Tu es Agent AL, l'agent IA de la plateforme québécoise ti-lex-AL v10. Réponds en français québécois, de façon claire et utile. Avant ta réponse finale, fournis un court raisonnement entre les balises <reflexion></reflexion>, puis la réponse normale après."
      : "Tu es Agent AL, l'agent IA de la plateforme québécoise ti-lex-AL v10. Réponds en français québécois, de façon claire, utile et directe.";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        model: state.model,
        max_tokens: 1000,
        system: sys,
        stream: true,
        messages: state.history,
      }),
    });
    if (!res.ok) throw new Error(await apiError(res));
    body.classList.add("streaming");
    let rafPending = false;
    const full = await streamText(res, chunk => {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          renderAssistant(body, chunk, true);
          messages.scrollTop = messages.scrollHeight;
          rafPending = false;
        });
      }
    });
    body.classList.remove("streaming");
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    renderAssistant(body, full);
    state.history.push({ role: "assistant", content: full });
    saveChatConv();
  } catch (err) {
    state.history.pop();
    body.innerHTML = `<p class="muted">Erreur : ${escapeHtml(err.message || "connexion à l'API")}. Vérifie ta clé API Anthropic dans les Paramètres.</p>`;
  } finally {
    $("#send").disabled = false;
    messages.scrollTop = messages.scrollHeight;
  }
}

function renderAssistant(body, full, streaming) {
  let reflex = "", answer = full;
  const closed = full.match(/<reflexion>([\s\S]*?)<\/reflexion>/i);
  if (closed) {
    reflex = closed[1].trim();
    answer = full.replace(closed[0], "").trim();
  } else {
    // pendant le streaming : la balise de réflexion est ouverte mais pas encore fermée
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
  const ans = escapeHtml(answer).replace(/\n/g, "<br>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const caret = streaming ? '<span class="caret"></span>' : '';
  html += `<div>${ans}${caret}</div>`;
  if (!streaming) html += serviceTags(answer);
  body.innerHTML = html;
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

/* ================= CODEX SIDEBAR ================= */
const codexSb = $("#codexSidebar");
const codexConvos = $("#codexConvos");
let codexHistory = JSON.parse(localStorage.getItem("tilex-codex-history") || "[]");
let activeConvIdx = -1;

function toggleCodexSidebar() {
  codexSb.classList.toggle("closed");
}
$("#codexSbToggle").onclick = toggleCodexSidebar;
$("#codexSbOpenBtn").onclick = toggleCodexSidebar;

function syncCodexProjects() {
  $$("#codexProjects .codex-sb-project").forEach(p => {
    const svc = p.dataset.service;
    const on = state.connected[svc];
    p.classList.toggle("connected", !!on);
    p.querySelector(".codex-sb-status").textContent = on ? "connecté" : "—";
  });
}

function saveCodexConv(prompt, output) {
  const entry = { prompt: prompt.slice(0, 60), full: prompt, output, lang: $("#lang").value, ts: Date.now() };
  codexHistory.unshift(entry);
  if (codexHistory.length > 30) codexHistory.length = 30;
  try { localStorage.setItem("tilex-codex-history", JSON.stringify(codexHistory)); } catch (_) {}
  renderCodexConvos();
}

function renderCodexConvos() {
  if (!codexHistory.length) {
    codexConvos.innerHTML = '<p class="muted" style="font-size:.78rem;padding:6px 0">Aucune conversation</p>';
    return;
  }
  codexConvos.innerHTML = codexHistory.map((c, i) =>
    `<div class="codex-sb-conv${i === activeConvIdx ? ' active' : ''}" data-idx="${i}">${escapeHtml(c.prompt || "Sans titre")}</div>`
  ).join("");
  $$(".codex-sb-conv").forEach(el => {
    el.onclick = () => {
      const idx = +el.dataset.idx;
      activeConvIdx = idx;
      const c = codexHistory[idx];
      $("#codeInput").value = c.full || c.prompt;
      $("#lang").value = c.lang || "TypeScript";
      $("#codeOut").innerHTML = formatCode(c.output || "");
      renderCodexConvos();
    };
  });
}

$("#codexNewConv").onclick = () => {
  activeConvIdx = -1;
  $("#codeInput").value = "";
  $("#codeOut").innerHTML = '<p class="muted">La sortie du Codex apparaîtra ici.</p>';
  renderCodexConvos();
};

/* ================= CODEX ================= */
$("#codexRun").onclick = () => runCodex("generate");
$("#codexExplain").onclick = () => runCodex("explain");

async function runCodex(mode) {
  const code = $("#codeInput").value.trim();
  const lang = $("#lang").value;
  if (!code) { $("#codeOut").innerHTML = `<p class="muted">Écris d'abord quelque chose dans l'éditeur.</p>`; return; }
  if (!state.apiKey) { $("#codeOut").innerHTML = `<p class="muted">⚙ Ajoute ta clé API Anthropic dans les Paramètres pour utiliser le Codex.</p>`; return; }
  $("#codeOut").innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;

  const prompt = mode === "generate"
    ? `Tu es le Codex de ti-lex-AL, un assistant de code expert. Génère du code ${lang} propre, commenté et production-ready à partir de cette demande. Réponds uniquement avec le code et de courtes explications.\n\nDemande:\n${code}`
    : `Tu es le Codex de ti-lex-AL. Explique ce code ${lang} clairement, en français, étape par étape.\n\nCode:\n${code}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        model: state.model,
        max_tokens: 1500,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await apiError(res));
    const out = await streamText(res, chunk => {
      $("#codeOut").innerHTML = `<div>${escapeHtml(chunk).replace(/\n/g, "<br>")}<span class="caret"></span></div>`;
      $("#codeOut").scrollTop = $("#codeOut").scrollHeight;
    });
    $("#codeOut").innerHTML = formatCode(out);
    saveCodexConv(code, out);
  } catch (err) {
    $("#codeOut").innerHTML = `<p class="muted">Erreur Codex : ${escapeHtml(err.message || "connexion")}. Vérifie ta clé API.</p>`;
  }
}

function formatCode(text) {
  return escapeHtml(text)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre>${highlightSyntax(c)}</pre>`)
    .replace(/\n/g, "<br>");
}

function highlightSyntax(code) {
  return code
    .replace(/(\/\/[^\n]*)/g, '<span class="syn-comment">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|switch|case|break|default|interface|type|extends|implements)\b/g, '<span class="syn-kw">$1</span>')
    .replace(/\b(string|number|boolean|void|null|undefined|any|true|false|Promise)\b/g, '<span class="syn-type">$1</span>')
    .replace(/(&quot;[^&]*?&quot;|&#039;[^&]*?&#039;|`[^`]*?`)/g, '<span class="syn-str">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="syn-num">$1</span>')
    .replace(/([a-zA-Z_$][\w$]*)\s*\(/g, '<span class="syn-fn">$1</span>(');
}

/* ================= CODEX FILE TABS ================= */
const FILE_EXT_MAP = { ts:'ts', js:'js', css:'css', html:'html', py:'py', sql:'sql', rs:'rs', json:'json' };
function getExtClass(name) {
  const ext = name.split('.').pop().toLowerCase();
  return FILE_EXT_MAP[ext] || 'ts';
}
$$(".codex-tab").forEach(tab => {
  tab.onclick = () => {
    $$(".codex-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const ext = getExtClass(tab.dataset.file);
    const langMap = { ts:'TypeScript', js:'JavaScript', css:'CSS', html:'HTML', py:'Python', sql:'SQL', rs:'Rust' };
    if (langMap[ext]) $("#lang").value = langMap[ext];
  };
});
$("#codexAddTab").onclick = () => {
  const name = prompt("Nom du fichier (ex: utils.ts)");
  if (!name) return;
  const ext = getExtClass(name);
  const tab = document.createElement("button");
  tab.className = "codex-tab";
  tab.dataset.file = name;
  tab.innerHTML = `<span class="ftab-dot ${ext}"></span>${escapeHtml(name)}`;
  tab.onclick = () => {
    $$(".codex-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
  };
  $("#codexAddTab").before(tab);
};

/* ================= CODEX CHAT BUBBLE ================= */
let codexChatOpen = false;
let codexChatHistory = [];

$("#codexChatBubble").onclick = () => {
  codexChatOpen = true;
  $("#codexChatWindow").classList.remove("hidden");
  $("#codexChatBubble").style.display = "none";
  if (!codexChatHistory.length) addCodexChatMsg("agent", "Salut! Je suis Agent AL. Demande-moi de l'aide avec ton code.");
  $("#codexChatInput").focus();
};
$("#codexChatClose").onclick = () => {
  codexChatOpen = false;
  $("#codexChatWindow").classList.add("hidden");
  $("#codexChatBubble").style.display = "flex";
};

function addCodexChatMsg(role, text) {
  codexChatHistory.push({ role, text });
  renderCodexChat();
}
function renderCodexChat() {
  const c = $("#codexChatMsgs");
  c.innerHTML = codexChatHistory.map(m =>
    `<div class="codex-chat-msg ${m.role}">${escapeHtml(m.text).replace(/\n/g, "<br>")}</div>`
  ).join("");
  c.scrollTop = c.scrollHeight;
}

async function sendCodexChat() {
  const inp = $("#codexChatInput");
  const text = inp.value.trim();
  if (!text) return;
  addCodexChatMsg("user", text);
  inp.value = "";

  if (!state.apiKey) {
    addCodexChatMsg("agent", "Ajoute ta clé API dans Paramètres pour activer le chat.");
    return;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "codex-chat-msg agent";
  placeholder.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  $("#codexChatMsgs").appendChild(placeholder);
  $("#codexChatMsgs").scrollTop = $("#codexChatMsgs").scrollHeight;

  try {
    const codeCtx = $("#codeInput").value.trim();
    const sysPrompt = `Tu es Agent AL, assistant code de ti-lex-AL v10. Réponds en français québécois, concis et utile.${codeCtx ? "\n\nContexte code de l'utilisateur:\n" + codeCtx.slice(0, 1000) : ""}`;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        model: state.model, max_tokens: 800, stream: true,
        system: sysPrompt,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) throw new Error(await apiError(res));
    let displayed = "";
    const full = await streamText(res, chunk => {
      displayed = chunk;
      placeholder.innerHTML = escapeHtml(chunk).replace(/\n/g, "<br>") + '<span class="caret"></span>';
      $("#codexChatMsgs").scrollTop = $("#codexChatMsgs").scrollHeight;
    });
    placeholder.remove();
    addCodexChatMsg("agent", full);
  } catch (err) {
    placeholder.remove();
    addCodexChatMsg("agent", "Erreur: " + (err.message || "connexion"));
  }
}

$("#codexChatSend").onclick = sendCodexChat;
$("#codexChatInput").onkeydown = e => { if (e.key === "Enter") sendCodexChat(); };

/* init */
loadSettings();
$("#apiKey").value = state.apiKey;
$("#modelSelect").value = state.model;
syncReflexion();
syncCodexProjects();
renderCodexConvos();
renderChatConvs();
console.log("ti-lex-AL v10 prêt.");
