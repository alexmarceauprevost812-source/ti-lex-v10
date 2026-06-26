// ti-lex v10 — AL Connexion Auto (vanilla JS)
const SUPABASE_URL  = window.SB_URL  || "https://rnuripmfozlxenryxhdc.supabase.co";
const SUPABASE_ANON = window.SB_ANON ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA";
const FN_URL = SUPABASE_URL + "/functions/v1/agent-al";

const T = {
  bg: "#0a0a0a", orange: "#ff7f27", green: "#37e0a0", gold: "#E6A400",
  red: "#E60000", blue: "#4a9eff", violet: "#C700E6",
  font: "'JetBrains Mono', ui-monospace, monospace",
};

var projectContext = null;
var history = [];
var connected = false;

// ---------- Styles ----------
function injectStyles() {
  if (document.getElementById("al-ca-styles")) return;
  var css =
    "@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');\n" +
    "#al-ca { position: fixed; bottom: 20px; right: 20px; width: 420px; max-width: calc(100vw - 32px);" +
    "  height: 580px; max-height: calc(100vh - 40px); background: " + T.bg + "; border: 1px solid #1c1c1c;" +
    "  border-radius: 16px; box-shadow: 0 0 0 1px rgba(255,127,39,.15), 0 24px 60px rgba(0,0,0,.6);" +
    "  display: flex; flex-direction: column; font-family: " + T.font + "; color: #e8e8e8; z-index: 9999; overflow: hidden; }\n" +
    "#al-ca.hidden { display: none; }\n" +
    "#al-ca .ca-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px;" +
    "  border-bottom: 1px solid #1c1c1c; background: linear-gradient(180deg,#111,#0a0a0a); }\n" +
    "#al-ca .ca-logo { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center;" +
    "  background: " + T.orange + "1a; border: 1px solid " + T.orange + "; color: " + T.orange + "; font-weight: 700; font-size: 14px; }\n" +
    "#al-ca .ca-title { font-weight: 700; font-size: 14px; }\n" +
    "#al-ca .ca-sub { font-size: 10px; color: #777; }\n" +
    "#al-ca .ca-x { margin-left: auto; background: none; border: none; color: #666; cursor: pointer; font-size: 18px; }\n" +
    "#al-ca .ca-status { display: flex; align-items: center; gap: 8px; padding: 7px 14px; font-size: 11px;" +
    "  border-bottom: 1px solid #1c1c1c; color: #aaa; }\n" +
    "#al-ca .ca-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }\n" +
    "#al-ca .ca-dot.connecting { background: " + T.orange + "; animation: capulse 1s infinite; }\n" +
    "#al-ca .ca-dot.connected { background: " + T.green + "; box-shadow: 0 0 8px " + T.green + "; }\n" +
    "#al-ca .ca-dot.error { background: " + T.red + "; }\n" +
    "@keyframes capulse { 0%,100%{opacity:1} 50%{opacity:.3} }\n" +
    "#al-ca .ca-msgs { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }\n" +
    "#al-ca .ca-msg { max-width: 85%; padding: 9px 12px; border-radius: 12px; font-size: 13px;" +
    "  line-height: 1.5; white-space: pre-wrap; word-break: break-word; }\n" +
    "#al-ca .ca-msg.user { align-self: flex-end; background: " + T.orange + "; color: #0a0a0a; border-bottom-right-radius: 3px; font-weight: 600; }\n" +
    "#al-ca .ca-msg.al { align-self: flex-start; background: #131313; border: 1px solid #222; border-bottom-left-radius: 3px; }\n" +
    "#al-ca .ca-thinking { align-self: flex-start; font-size: 11px; color: " + T.orange + "; padding: 2px 4px; }\n" +
    "#al-ca .ca-inject { align-self: flex-start; width: 85%; background: #0d0d0d; border: 1px solid " + T.green + "55;" +
    "  border-radius: 10px; padding: 8px; font-size: 11px; }\n" +
    "#al-ca .ca-inject .p { color: " + T.green + "; margin-bottom: 6px; }\n" +
    "#al-ca .ca-inject pre { max-height: 180px; overflow: auto; background: #000; padding: 8px; border-radius: 6px;" +
    "  color: #cfcfcf; margin: 0 0 8px; }\n" +
    "#al-ca .ca-inject button { background: " + T.green + "; color: #0a0a0a; border: none; border-radius: 6px;" +
    "  padding: 6px 10px; font-family: " + T.font + "; font-weight: 700; font-size: 11px; cursor: pointer; }\n" +
    "#al-ca .ca-input { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #1c1c1c; }\n" +
    "#al-ca .ca-input input { flex: 1; background: #111; border: 1px solid #222; border-radius: 10px;" +
    "  padding: 10px 12px; color: #eee; font-family: " + T.font + "; font-size: 13px; outline: none; }\n" +
    "#al-ca .ca-input input:focus { border-color: " + T.orange + "; }\n" +
    "#al-ca .ca-input button { background: " + T.orange + "; color: #0a0a0a; border: none; border-radius: 10px;" +
    "  padding: 0 16px; font-family: " + T.font + "; font-weight: 700; cursor: pointer; }\n" +
    "#al-ca .ca-input button:disabled { opacity: .4; cursor: default; }\n" +
    "#al-ca-fab { position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px; border-radius: 16px;" +
    "  background: " + T.orange + "; color: #0a0a0a; border: none; font-family: " + T.font + "; font-weight: 700; font-size: 16px;" +
    "  cursor: pointer; z-index: 9998; box-shadow: 0 10px 30px rgba(255,127,39,.4); }";
  var s = document.createElement("style");
  s.id = "al-ca-styles"; s.textContent = css;
  document.head.appendChild(s);
}

// ---------- DOM ----------
var el = {};
function buildUI() {
  var panel = document.createElement("div");
  panel.id = "al-ca"; panel.className = "hidden";
  panel.innerHTML =
    '<div class="ca-head">' +
    '  <div class="ca-logo">AL</div>' +
    '  <div>' +
    '    <div class="ca-title">Agent AL</div>' +
    '    <div class="ca-sub">ti-lex v10 · connexion auto</div>' +
    '  </div>' +
    '  <button class="ca-x" title="Fermer">×</button>' +
    '</div>' +
    '<div class="ca-status"><span class="ca-dot connecting"></span><span class="ca-status-txt">Connexion au projet…</span></div>' +
    '<div class="ca-msgs"></div>' +
    '<div class="ca-input">' +
    '  <input type="text" placeholder="Demande à AL (il connaît ton repo)…" />' +
    '  <button>›</button>' +
    '</div>';
  document.body.appendChild(panel);

  var fab = document.createElement("button");
  fab.id = "al-ca-fab"; fab.textContent = "AL";
  document.body.appendChild(fab);

  el = {
    panel: panel, fab: fab,
    dot: panel.querySelector(".ca-dot"),
    statusTxt: panel.querySelector(".ca-status-txt"),
    msgs: panel.querySelector(".ca-msgs"),
    input: panel.querySelector(".ca-input input"),
    send: panel.querySelector(".ca-input button"),
    close: panel.querySelector(".ca-x"),
  };

  fab.onclick = function () { panel.classList.remove("hidden"); fab.style.display = "none"; el.input.focus(); };
  el.close.onclick = function () { panel.classList.add("hidden"); fab.style.display = "block"; };
  el.send.onclick = onSend;
  el.input.addEventListener("keydown", function (e) { if (e.key === "Enter") onSend(); });
}

function setStatus(state, text) {
  el.dot.className = "ca-dot " + state;
  el.statusTxt.textContent = text;
}

function addMsg(role, text) {
  var d = document.createElement("div");
  d.className = "ca-msg " + role;
  d.textContent = text;
  el.msgs.appendChild(d);
  el.msgs.scrollTop = el.msgs.scrollHeight;
  return d;
}

// ---------- Auth header ----------
function authHeaders() {
  var headers = { "Content-Type": "application/json", apikey: SUPABASE_ANON };
  try {
    if (window.supabaseClient) {
      var sess = null;
      window.supabaseClient.auth.getSession().then(function (r) {
        if (r && r.data && r.data.session) {
          headers.Authorization = "Bearer " + r.data.session.access_token;
        }
      });
    }
  } catch (e) { /* ignore */ }
  if (!headers.Authorization) { headers.Authorization = "Bearer " + SUPABASE_ANON; }
  return headers;
}

// ---------- Connexion auto ----------
function autoConnect() {
  setStatus("connecting", "Connexion au projet…");
  try {
    fetch(FN_URL, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "auto_connect" }),
    }).then(function (r) {
      if (r.status === 403) {
        setStatus("error", "Accès réservé au propriétaire ti-lex.");
        el.input.disabled = true;
        el.send.disabled = true;
        addMsg("al", "Accès réservé au propriétaire ti-lex. Connecte-toi avec le bon compte.");
        return null;
      }
      return r.json();
    }).then(function (ctx) {
      if (!ctx) return;
      if (ctx.error) throw new Error(ctx.error);
      projectContext = ctx;
      connected = true;
      var nf = (ctx.github && ctx.github.files) ? ctx.github.files.length : 0;
      var nn = (ctx.supabase && ctx.supabase.notes_count) ? ctx.supabase.notes_count : 0;
      setStatus("connected", "Projet connecté · " + nf + " fichiers · " + nn + " notes");
    }).catch(function (e) {
      setStatus("error", "Connexion échouée : " + e.message);
    });
  } catch (e) {
    setStatus("error", "Connexion échouée : " + e.message);
  }
}

// ---------- Envoi + streaming ----------
function onSend() {
  var q = el.input.value.trim();
  if (!q || el.send.disabled) return;
  el.input.value = "";
  el.send.disabled = true;

  addMsg("user", q);
  history.push({ role: "user", text: q });

  var thinking = document.createElement("div");
  thinking.className = "ca-thinking"; thinking.textContent = "AL réfléchit…";
  el.msgs.appendChild(thinking);
  el.msgs.scrollTop = el.msgs.scrollHeight;

  var bubble = addMsg("al", "");
  var raw = "";

  try {
    fetch(FN_URL, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "chat", question: q, history: history, projectContext: projectContext }),
    }).then(function (r) {
      if (r.status === 403) {
        thinking.remove();
        bubble.textContent = "Accès réservé au propriétaire ti-lex. Connecte-toi avec le bon compte.";
        el.send.disabled = false;
        return;
      }
      var reader = r.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      function pump() {
        reader.read().then(function (result) {
          if (result.done) { finish(); return; }
          buf += dec.decode(result.value, { stream: true });
          var parts = buf.split("\n\n");
          buf = parts.pop();
          for (var i = 0; i < parts.length; i++) {
            var line = parts[i].replace(/^data:\s?/, "").trim();
            if (!line || line === "[DONE]") continue;
            var ev; try { ev = JSON.parse(line); } catch (e) { continue; }
            if (ev.type === "status") { thinking.textContent = ev.text; }
            if (ev.type === "token") {
              raw += ev.text;
              bubble.textContent = raw.replace(/INJECT:.*$/s, "").trim();
              el.msgs.scrollTop = el.msgs.scrollHeight;
            }
          }
          pump();
        });
      }
      pump();
    }).catch(function (e) {
      raw = "⚠️ " + e.message;
      bubble.textContent = raw;
      finish();
    });
  } catch (e) {
    raw = "⚠️ " + e.message;
    bubble.textContent = raw;
    finish();
  }

  function finish() {
    thinking.remove();
    history.push({ role: "assistant", text: raw });
    renderInjects(raw);
    el.send.disabled = false;
    el.input.focus();
  }
}

// ---------- Blocs INJECT: ----------
function renderInjects(text) {
  var re = /INJECT:\s*(.+?)\s*```[a-z]*\n([\s\S]*?)```/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var path = m[1].trim();
    var code = m[2];
    var card = document.createElement("div");
    card.className = "ca-inject";
    var pre = document.createElement("pre");
    pre.textContent = code.length > 1200 ? code.slice(0, 1200) + "\n…" : code;
    card.innerHTML = '<div class="p">📄 ' + echapper(path) + '</div>';
    card.appendChild(pre);
    var btn = document.createElement("button");
    btn.textContent = "Pousser sur GitHub";
    (function (p, c, b) {
      b.onclick = function () {
        var pin = prompt("NIP (4 chiffres) pour pousser sur GitHub :");
        if (!pin) return;
        b.disabled = true; b.textContent = "Envoi…";
        fetch(FN_URL, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ action: "commit", path: p, code: c, pin: pin, message: "AL: maj " + p }),
        }).then(function (r) {
          if (r.status === 429) { b.textContent = "Trop d'essais"; return null; }
          if (r.status === 403) { b.textContent = "Refusé (NIP ou fichier protégé)"; b.disabled = false; return null; }
          return r.json();
        }).then(function (j) {
          if (j) b.textContent = j.result || "Fait";
        }).catch(function () { b.textContent = "Erreur"; b.disabled = false; });
      };
    })(path, code, btn);
    card.appendChild(btn);
    el.msgs.appendChild(card);
  }
  el.msgs.scrollTop = el.msgs.scrollHeight;
}

function echapper(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Init ----------
function mountAL() {
  injectStyles();
  buildUI();
  autoConnect();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountAL);
} else { mountAL(); }

window.ALConnexionAuto = { mountAL: mountAL };
