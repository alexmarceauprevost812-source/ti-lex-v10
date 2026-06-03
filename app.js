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
  github: { token: "", repo: "", branch: "" },
  supabase: { url: "", key: "" },
  webSearch: false,
};

/* pièces jointes en attente d'envoi */
let attachments = [];

/* ---- Persistance locale (clé API Anthropic + modèle + connexions) ---- */
const LS_KEY = "tilex-al-apikey";
const LS_MODEL = "tilex-al-model";
const LS_GH = "tilex-al-github";
const LS_SB = "tilex-al-supabase";
function loadSettings() {
  try {
    const k = localStorage.getItem(LS_KEY);
    const m = localStorage.getItem(LS_MODEL);
    if (k) state.apiKey = k;
    if (m) state.model = m;
    const gh = JSON.parse(localStorage.getItem(LS_GH) || "null");
    if (gh && gh.token) { state.github = gh; state.connected.github = true; }
    const sb = JSON.parse(localStorage.getItem(LS_SB) || "null");
    if (sb && sb.url) { state.supabase = sb; state.connected.supabase = true; }
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
  $("#ghBranch").onchange = e => { state.github.branch = e.target.value; persistGithub(); ghLoadFiles(state.github.repo, e.target.value); };
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
function handleZipFile(files) {
  [...files].forEach(f => {
    attachments.push({ kind: "zip", name: f.name, size: f.size });
    renderAttachStrip();
  });
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
  if (!text && !attachments.length) return;

  // snapshot des pièces jointes + recherche web, puis on vide le composer
  const atts = attachments.slice();
  const useWeb = state.webSearch;
  addUserMsg(text, atts);
  input.value = ""; input.style.height = "auto";
  attachments = []; renderAttachStrip();

  const body = buildAssistantMsg();

  if (!state.apiKey) {
    renderAssistant(body, "⚙ Ajoute ta clé API Anthropic dans les Paramètres (icône en bas à gauche) pour activer Agent AL.");
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  // construit le contenu (texte + images + fichiers texte)
  const apiContent = buildUserContent(text, atts);
  state.history.push({ role: "user", content: apiContent });
  $("#send").disabled = true;

  try {
    let sys = state.reflexion
      ? "Tu es Agent AL, l'agent IA de la plateforme québécoise ti-lex-AL v10. Réponds en français québécois, de façon claire et utile. Avant ta réponse finale, fournis un court raisonnement entre les balises <reflexion></reflexion>, puis la réponse normale après."
      : "Tu es Agent AL, l'agent IA de la plateforme québécoise ti-lex-AL v10. Réponds en français québécois, de façon claire, utile et directe.";
    if (state.connected.github && state.github.repo)
      sys += `\n\nContexte GitHub connecté : dépôt ${state.github.repo}, branche ${state.github.branch}.`;
    if (state.connected.supabase && state.supabase.url)
      sys += `\n\nContexte Supabase connecté : projet ${state.supabase.url}.`;

    const reqBody = {
      model: state.model,
      max_tokens: useWeb ? 2000 : 1000,
      system: sys,
      stream: true,
      messages: state.history,
    };
    if (useWeb) reqBody.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(reqBody),
    });
    if (!res.ok) throw new Error(await apiError(res));
    body.classList.add("streaming");
    const typer = makeTyper(partial => {
      renderAssistant(body, partial, true);
      messages.scrollTop = messages.scrollHeight;
    });
    const full = await streamText(res, chunk => typer.push(chunk));
    await new Promise(resolve => typer.finish(resolve));
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
  // pendant la frappe, masque une balise incomplète en fin de texte (ex: "<reflexi")
  if (streaming) full = full.replace(/<[^>]*$/, "");
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

/* ---- Typewriter fluide : révèle le texte caractère par caractère à vitesse
   régulière, indépendamment des paquets reçus du réseau. Continue d'écrire la
   suite (2e, 3e ligne…) pendant que le flux arrive. ---- */
function makeTyper(renderFn) {
  let target = "", shown = 0, running = false, finished = false, doneCb = null, last = 0;
  function step(ts) {
    if (!last) last = ts;
    const dt = Math.min(ts - last, 100); last = ts;
    const backlog = target.length - shown;
    // vitesse de base ~70 car/s, accélère si le flux a beaucoup d'avance
    let cps = 70;
    if (backlog > 160) cps = 300;
    else if (backlog > 80) cps = 160;
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
  $$("#codexProjects .codex-sb-project").forEach(p => {
    const svc = p.dataset.service;
    const on = state.connected[svc];
    p.classList.toggle("connected", !!on);
    p.querySelector(".codex-sb-status").textContent = on ? "connecté" : "—";
  });
}

function addCodexUserMsg(text) {
  $(".codex-welcome")?.remove();
  const m = document.createElement("div");
  m.className = "codex-msg user";
  const av = document.createElement("div");
  av.className = "cmsg-avatar"; av.textContent = "A";
  m.appendChild(av);
  const b = document.createElement("div");
  b.className = "codex-msg-body"; b.textContent = text;
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
  const entry = { prompt: prompt.slice(0, 60), full: prompt, output, lang: $("#lang").value, msgs: [...codexChatMsgs], ts: Date.now() };
  if (activeConvIdx >= 0) {
    codexHistory[activeConvIdx] = entry;
  } else {
    codexHistory.unshift(entry);
    activeConvIdx = 0;
  }
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
      codexChatMsgs = c.msgs || [{ role: "user", text: c.full }, { role: "assistant", text: c.output }];
      rebuildCodexChat();
      renderCodexConvos();
    };
  });
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
    }
  });
}

$("#codexNewConv").onclick = () => {
  activeConvIdx = -1;
  codexChatMsgs = [];
  $("#codeInput").value = "";
  const area = $("#codexMessages");
  area.innerHTML = `<div class="codex-welcome">
    <img src="logo.png" alt="Codex" class="codex-welcome-logo">
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
};

/* ================= CODEX (chat-style) ================= */
const codexInput = $("#codeInput");
codexInput.addEventListener("input", () => {
  codexInput.style.height = "auto";
  codexInput.style.height = Math.min(codexInput.scrollHeight, 140) + "px";
});
codexInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runCodex(); }
});
$("#codexRun").onclick = () => runCodex();

function bindCodexSuggestions() {
  $$(".csug").forEach(s => s.onclick = () => {
    codexInput.value = s.dataset.p;
    runCodex();
  });
}
bindCodexSuggestions();

async function runCodex() {
  const text = codexInput.value.trim();
  const lang = $("#lang").value;
  if (!text) return;
  addCodexUserMsg(text);
  codexChatMsgs.push({ role: "user", text });
  codexInput.value = ""; codexInput.style.height = "auto";

  const body = buildCodexAssistantMsg();

  if (!state.apiKey) {
    body.innerHTML = '<p class="muted">Ajoute ta clé API Anthropic dans les Paramètres pour utiliser le Codex.</p>';
    if (body._msgWrap) body._msgWrap.classList.remove("responding");
    return;
  }

  $("#codexRun").disabled = true;

  const prompt = `Tu es le Codex de ti-lex-AL, un assistant de code expert. Génère du code ${lang} propre, commenté et production-ready à partir de cette demande. Réponds avec le code et de courtes explications en français.\n\nDemande:\n${text}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        model: state.model,
        max_tokens: 2000,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
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

/* init */
loadSettings();
$("#apiKey").value = state.apiKey;
$("#modelSelect").value = state.model;

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
renderChatConvs();
renderAttachStrip();

// reconnexion GitHub auto (recharge dépôts + branches)
if (state.github.token) ghConnect();

console.log("ti-lex-AL v10 prêt.");
