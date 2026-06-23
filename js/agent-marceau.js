// ── Agent MARCEAU — Dialogue multi-agents 4 phases ──

(function () {
  "use strict";

  // ── Config ──
  var MARCEAU_CONFIG = {
    EDGE_FUNCTION: (window.SB_URL||"https://rnuripmfozlxenryxhdc.supabase.co")+"/functions/v1/marceau-reflection",
  };

  // ── Couleurs ──
  var TILEX = {
    orange: "#ff7f27",
    gold: "#ffcf4a",
    muted: "#6c6c78",
    green: "#37e0a0",
    blue: "#4f8ef7",
  };

  var MARCEAU_AVATAR_URL = "assets/agents/marceau-logo.png";
  var MARCEAU_AVATAR_LOCAL = "assets/agents/marceau-logo.png";

  // ── System Prompts 4 phases + NEXUS ──
  var SYS = {
    M1:
      "Tu es MARCEAU, agent principal et créatif de ti-lex (Produit du Québec).\n" +
      "Tu OUVRES le débat sur le sujet de l'utilisateur.\n" +
      "Lance tes idées les plus créatives et audacieuses.\n" +
      "Tu apprends à connaître ton humain au fil des échanges — sois chaleureux.\n" +
      "Adresse-toi à CLAUDE-AL directement.\n" +
      "Lignes courtes (≤65 car.), max 90 mots, français québécois, sans introduction.",

    C1:
      "Tu es CLAUDE-AL, agent analytique de ti-lex (Produit du Québec).\n" +
      "MARCEAU vient d'ouvrir le débat. Réagis DIRECTEMENT à ses idées.\n" +
      "Valide le solide, challenge le fragile, ajoute des données.\n" +
      "Adresse-toi à MARCEAU directement.\n" +
      "Lignes courtes (≤65 car.), max 90 mots, français québécois professionnel, sans introduction.",

    M2:
      "Tu es MARCEAU, agent principal et créatif de ti-lex (Produit du Québec).\n" +
      "CLAUDE-AL vient de réagir. Réponds-lui directement.\n" +
      "Défends ce qui est valide, intègre les bons points, mais reste créatif.\n" +
      "Pousse l'idée encore plus loin. Pense à ce qui serait le mieux pour ton humain.\n" +
      "Lignes courtes (≤65 car.), max 90 mots, français québécois, sans introduction.",

    C2:
      "Tu es CLAUDE-AL, agent analytique de ti-lex (Produit du Québec).\n" +
      "Donne ta POSITION FINALE après cet échange.\n" +
      "Reconnais les meilleures idées de Marceau, fournis une conclusion analytique.\n" +
      "Adresse-toi à Marceau et résume pour l'utilisateur.\n" +
      "Lignes courtes (≤65 car.), max 90 mots, français québécois professionnel, sans introduction.",

    NX:
      "Tu es le SYNTHESIZER NEXUS de ti-lex. Tu as lu le dialogue complet entre MARCEAU et CLAUDE-AL.\n" +
      "RÉPONDS UNIQUEMENT avec ce JSON valide, aucun texte ni backtick:\n" +
      '{\n  "meilleure_idee_marceau": "La meilleure idée de Marceau en 1 phrase",\n' +
      '  "meilleur_apport_claude": "Le meilleur apport de Claude-AL en 1 phrase",\n' +
      '  "evolution_dialogue": "Comment la conversation a évolué en 1 phrase",\n' +
      '  "reponse_finale": "Réponse optimale issue des 4 phases, 3-4 phrases actionables",\n' +
      '  "score": 88,\n' +
      '  "justification": "Pourquoi ce score en 1 phrase"\n}',
  };

  // ── Streaming SSE ──
  function marceauGetToken() {
    if (typeof getToken === "function") return getToken();
    try {
      var r = localStorage.getItem("sb-rnuripmfozlxenryxhdc-auth-token");
      if (r) { var s = JSON.parse(r); if (s && s.access_token) return s.access_token; }
    } catch (_) {}
    return "";
  }

  async function streamFromEdge(systemPrompt, messages, onText) {
    var token = marceauGetToken();
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;

    var res = await fetch(MARCEAU_CONFIG.EDGE_FUNCTION, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ systemPrompt: systemPrompt, messages: messages }),
    });

    if (!res.ok) {
      var errText = "";
      try { var errJson = await res.json(); errText = errJson.error || ""; } catch (_) {}
      throw new Error(errText || "Edge Function error: " + res.status);
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var full = "";

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      var text = decoder.decode(chunk.value, { stream: true });
      var lines = text.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf("data: ") !== 0) continue;
        var payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          var data = JSON.parse(payload);
          if (data.text) {
            full += data.text;
            onText(full);
          }
        } catch (_) {}
      }
    }
    return full;
  }

  async function callEdge(systemPrompt, content) {
    var token = marceauGetToken();
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;

    var res = await fetch(MARCEAU_CONFIG.EDGE_FUNCTION, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        systemPrompt: systemPrompt,
        messages: [{ role: "user", content: content }],
      }),
    });

    if (!res.ok) throw new Error("Edge Function error: " + res.status);

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var full = "";
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      var text = decoder.decode(chunk.value, { stream: true });
      var lines = text.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf("data: ") !== 0) continue;
        var p = line.slice(6).trim();
        if (p === "[DONE]") continue;
        try {
          var d = JSON.parse(p);
          if (d.text) full += d.text;
        } catch (_) {}
      }
    }
    return full;
  }

  // ── StreamingText — écriture fluide multi-curseurs ──
  function StreamingText(containerEl, color) {
    this.container = containerEl;
    this.color = color;
    this.received = "";
    this.displayed = "";
    this.isDone = false;
    this.timer = null;
    this._start();
  }

  StreamingText.prototype._start = function () {
    var self = this;
    this.timer = setInterval(function () {
      if (self.displayed.length < self.received.length) {
        self.displayed = self.received.slice(0, self.displayed.length + 4);
        self._render();
      }
    }, 15);
  };

  StreamingText.prototype.update = function (text) {
    this.received = text;
  };

  StreamingText.prototype.done = function () {
    this.isDone = true;
    this.displayed = this.received;
    clearInterval(this.timer);
    this._render();
  };

  StreamingText.prototype._render = function () {
    var lines = this.displayed.split("\n");
    var n = lines.length;
    var self = this;
    var html = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var dist = n - 1 - i;
      var L1 = dist === 0 && !self.isDone;
      var L2 = dist === 1 && !self.isDone;
      var L3 = dist === 2 && !self.isDone;

      var textColor = L1 || L2 ? self.color : "var(--txt, #e2e2ea)";
      var textOpacity = L3 ? "0.65" : "1";
      var cursor = "";
      if ((L1 || L2 || L3) && line.length > 0) {
        var op = L1 ? 1 : L2 ? 0.38 : 0.14;
        var dur = L1 ? ".48s" : L2 ? "1.1s" : "2s";
        cursor =
          '<span class="stream-cursor" style="opacity:' + op +
          ";animation-duration:" + dur +
          ";background:" + self.color + '"></span>';
      }

      html +=
        '<div class="stream-line" style="color:' + textColor +
        ";opacity:" + textOpacity + '"><span>' +
        (line || "&nbsp;") + "</span>" + cursor + "</div>";
    }
    this.container.innerHTML = html;
  };

  StreamingText.prototype.destroy = function () {
    clearInterval(this.timer);
  };

  // ── SVG Avatars ──
  function svgMarceauFallback(size, gid) {
    return (
      '<svg width="' + Math.round(size * 0.56) + '" height="' + Math.round(size * 0.62) +
      '" viewBox="0 0 22 26" fill="none"><defs><linearGradient id="gm-' + gid +
      '" x1="11" y1="2" x2="11" y2="26" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffe566"/><stop offset="40%" stop-color="#ff7f27"/><stop offset="100%" stop-color="#bb1500"/></linearGradient></defs><path d="M11 26C11 26 3 20 3 12.5C3 8 7 5.5 9 7C8.5 4.5 10 2.5 11 2C12 2.5 13.5 4.5 13 7C15 5.5 19 8 19 12.5C19 20 11 26 11 26Z" fill="url(#gm-' +
      gid + ')" opacity=".92"/><path d="M11 21C11 21 7.5 17.5 7.5 14C7.5 11.5 9.5 10.5 11 12C12.5 10.5 14.5 11.5 14.5 14C14.5 17.5 11 21 11 21Z" fill="#ffee88" opacity=".55"/></svg>'
    );
  }

  function svgMarceauAvatar(size, gid) {
    return (
      '<div class="marceau-avatar-wrap" style="width:' + size + "px;height:" + size +
      'px;position:relative;flex-shrink:0;" id="avatar-marceau-' + gid + '">' +
      '<img src="' + MARCEAU_AVATAR_URL + '" alt="Marceau" class="marceau-avatar-img" style="width:' + size + "px;height:" + size +
      'px;object-fit:contain;border-radius:50%;border:2px solid #ff7f27;background:#111118;padding:2px;display:block;" onerror="this.onerror=null;this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" loading="lazy"/>' +
      '<div style="display:none;width:' + size + "px;height:" + size +
      'px;border-radius:50%;background:radial-gradient(circle at 50% 65%,#1e0800,#0a0300);border:1.5px solid #3a1200;align-items:center;justify-content:center;overflow:hidden;">' +
      svgMarceauFallback(size, gid) + '</div>' +
      '<div class="marceau-avatar-glow"></div></div>'
    );
  }

  function svgClaudeAvatar(size, gid) {
    return (
      '<div style="width:' + size + "px;height:" + size +
      'px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#060c1a,#0a1228);border:1.5px solid #1a2640;display:flex;align-items:center;justify-content:center;overflow:hidden;" id="avatar-claude-' +
      gid + '"><svg width="' + Math.round(size * 0.65) + '" height="' + Math.round(size * 0.55) +
      '" viewBox="0 0 32 22" fill="none"><defs><linearGradient id="gc-' + gid +
      '" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ffa876"/><stop offset="50%" stop-color="#ff7f27"/><stop offset="100%" stop-color="#d45000"/></linearGradient></defs><path d="M1 20 A15 15 0 0 1 31 20" stroke="url(#gc-' +
      gid + ')" stroke-width="2.8" stroke-linecap="round"/><path d="M4.5 20 A11.5 11.5 0 0 1 27.5 20" stroke="url(#gc-' +
      gid + ')" stroke-width="2.2" stroke-linecap="round" opacity=".7"/><path d="M8.5 20 A7.5 7.5 0 0 1 23.5 20" stroke="url(#gc-' +
      gid + ')" stroke-width="1.7" stroke-linecap="round" opacity=".46"/><path d="M12.5 20 A3.5 3.5 0 0 1 19.5 20" stroke="url(#gc-' +
      gid + ')" stroke-width="1.3" stroke-linecap="round" opacity=".26"/></svg></div>'
    );
  }

  function svgNexusAvatar(size, gid) {
    return (
      '<div style="width:' + size + "px;height:" + size +
      'px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 50% 50%,#15110a,#0a0800);border:1.5px solid #2a2000;display:flex;align-items:center;justify-content:center;" id="avatar-nexus-' +
      gid + '"><svg width="' + Math.round(size * 0.55) + '" height="' + Math.round(size * 0.6) +
      '" viewBox="0 0 22 26" fill="none"><defs><linearGradient id="gn-' + gid +
      '" x1="11" y1="1" x2="11" y2="25" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fff0a0"/><stop offset="100%" stop-color="#ff9500"/></linearGradient></defs><path d="M13 1L4 14 10 14 9 25 18 12 12 12Z" fill="url(#gn-' +
      gid + ')"/></svg></div>'
    );
  }

  // ── Ti-Étude context injection ──
  function getTiEtudeContext() {
    var etude = window._tiEtude;
    if (!etude) return "";
    var parts = [];
    if (etude.langue_preferee) parts.push("Langue préférée: " + etude.langue_preferee);
    if (etude.style_ecriture) parts.push("Style d'écriture: " + etude.style_ecriture);
    if (etude.theme_prefere) parts.push("Thème préféré: " + etude.theme_prefere);
    if (Array.isArray(etude.interets) && etude.interets.length) parts.push("Intérêts: " + etude.interets.join(", "));
    if (Array.isArray(etude.couleurs_preferees) && etude.couleurs_preferees.length) parts.push("Couleurs préférées: " + etude.couleurs_preferees.join(", "));
    if (Array.isArray(etude.notes_agent) && etude.notes_agent.length) {
      var recent = etude.notes_agent.slice(-5);
      parts.push("Notes récentes: " + recent.map(function(n) { return n.text; }).join(" | "));
    }
    if (!parts.length) return "";
    return "\n\n[PROFIL UTILISATEUR (ti-étude)]:\n" + parts.join("\n");
  }

  function enrichPrompt(base) {
    var ctx = base + getTiEtudeContext();
    if (window._memoireContexteCache) ctx += "\n" + window._memoireContexteCache;
    return ctx;
  }

  // ── État du dialogue ──
  var dialogueState = {
    question: "",
    phases: [],
    synth: null,
    loading: false,
    step: "idle",
  };

  function buildContext(phases, question) {
    var names = { marceau: "MARCEAU", claude: "CLAUDE-AL" };
    var history = "";
    for (var i = 0; i < phases.length; i++) {
      var p = phases[i];
      if (i > 0) history += "\n\n";
      history += "[Phase " + (i + 1) + " — " + names[p.agent] + "]:\n" + p.text;
    }
    return 'SUJET DE RÉFLEXION: "' + question + '"\n\n' + history;
  }

  // ── UI Helpers ──
  function addBubble(agent, index) {
    var dialogue = document.getElementById("marceau-dialogue");
    var isM = agent === "marceau";
    var color = isM ? TILEX.orange : TILEX.blue;
    var label = isM ? "MARCEAU" : "CLAUDE-AL";
    var phaseNum = index + 1;
    var avatar = isM ? svgMarceauAvatar(30, "b" + index) : svgClaudeAvatar(30, "b" + index);

    var div = document.createElement("div");
    div.className = isM ? "marceau-bubble" : "claude-bubble";
    div.innerHTML =
      avatar +
      '<div class="bubble-content" style="border-color:' + color + '22">' +
      '<div class="bubble-header"><span style="color:' + color + '">' +
      label + " — PHASE " + phaseNum + '</span><span id="phase-status-' +
      index + '" style="color:' + TILEX.muted + ';animation:pulse 1.2s infinite">EN COURS...</span></div>' +
      '<div id="phase-text-' + index + '"></div></div>';
    dialogue.appendChild(div);

    var textEl = document.getElementById("phase-text-" + index);
    return {
      textEl: textEl,
      markDone: function () {
        var st = document.getElementById("phase-status-" + index);
        if (st) {
          st.textContent = "TERMINÉ";
          st.style.color = TILEX.green;
          st.style.animation = "none";
        }
      },
    };
  }

  function addConnector(fromAgent, toAgent) {
    var dialogue = document.getElementById("marceau-dialogue");
    var fromColor = fromAgent === "marceau" ? TILEX.orange : TILEX.blue;
    var toColor = toAgent === "marceau" ? TILEX.orange : TILEX.blue;
    var div = document.createElement("div");
    div.className = "connector";
    div.innerHTML =
      '<div class="connector-dot">' +
      '<div class="connector-circle" style="background:' + fromColor + '"></div>' +
      '<div class="connector-line" style="background:linear-gradient(' + fromColor + "," + toColor + ')"></div>' +
      '<div class="connector-circle" style="background:' + toColor + '"></div></div>';
    dialogue.appendChild(div);
  }

  function updateStep(step) {
    var badge = document.getElementById("step-badge");
    if (!badge) return;
    var labels = {
      phase1: "PHASE 1/4",
      phase2: "PHASE 2/4",
      phase3: "PHASE 3/4",
      phase4: "PHASE 4/4",
      synthesis: "SYNTHÈSE",
      done: "TERMINÉ",
    };
    var colors = {
      phase1: TILEX.orange,
      phase2: TILEX.blue,
      phase3: TILEX.orange,
      phase4: TILEX.blue,
      synthesis: TILEX.gold,
      done: TILEX.green,
    };
    badge.textContent = labels[step] || step;
    badge.style.color = colors[step] || TILEX.muted;
    badge.style.borderColor = (colors[step] || TILEX.muted) + "50";
  }

  function showError(msg) {
    var el = document.getElementById("marceau-error");
    if (!el) return;
    el.style.display = "block";
    el.textContent = msg;
    setTimeout(function () { el.style.display = "none"; }, 8000);
  }

  function showSynthesisPanel(synth) {
    var el = document.getElementById("marceau-nexus");
    if (!el) return;
    el.style.display = "block";

    if (!synth) {
      el.innerHTML =
        '<div class="nexus-panel" style="border:1px solid ' + TILEX.gold + '22;text-align:center;padding:24px">' +
        svgNexusAvatar(40, "nx") +
        '<div style="margin-top:10px;font-size:11px;color:' + TILEX.gold + ';letter-spacing:2px;animation:pulse 1.2s infinite">NEXUS — SYNTHÈSE EN COURS...</div></div>';
      return;
    }

    var scoreColor = synth.score >= 80 ? TILEX.green : synth.score >= 60 ? TILEX.gold : "#ef4444";

    el.innerHTML =
      '<div class="nexus-panel" style="border:1px solid ' + TILEX.gold + '33">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border,#23232c)">' +
      svgNexusAvatar(32, "nxf") +
      '<div><div style="font-size:14px;font-weight:900;letter-spacing:2px;color:' + TILEX.gold + '">SYNTHÈSE NEXUS</div>' +
      '<div style="font-size:9px;color:' + TILEX.muted + ';letter-spacing:1px">RÉSULTAT DU DIALOGUE 4 PHASES</div></div></div>' +

      '<div class="nexus-row"><div class="nexus-label">MEILLEURE IDÉE MARCEAU</div>' +
      '<div class="nexus-value" style="color:' + TILEX.orange + '">' + escHtml(synth.meilleure_idee_marceau) + '</div></div>' +

      '<div class="nexus-row"><div class="nexus-label">MEILLEUR APPORT CLAUDE-AL</div>' +
      '<div class="nexus-value" style="color:' + TILEX.blue + '">' + escHtml(synth.meilleur_apport_claude) + '</div></div>' +

      '<div class="nexus-row"><div class="nexus-label">ÉVOLUTION DU DIALOGUE</div>' +
      '<div class="nexus-value">' + escHtml(synth.evolution_dialogue) + '</div></div>' +

      '<div class="nexus-row" style="background:rgba(255,207,74,.04);border-radius:6px;padding:12px;border:1px solid ' + TILEX.gold + '22"><div class="nexus-label">RÉPONSE FINALE</div>' +
      '<div class="nexus-value" style="font-size:13px;line-height:1.8">' + escHtml(synth.reponse_finale) + '</div></div>' +

      '<div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border,#23232c)">' +
      '<div style="font-size:28px;font-weight:900;color:' + scoreColor + '">' + synth.score + '</div>' +
      '<div style="flex:1"><div class="nexus-label">SCORE DE SYNTHÈSE</div>' +
      '<div class="score-bar-wrap"><div class="score-bar-fill" style="width:' + synth.score + '%;--score-color:' + scoreColor + '"></div></div>' +
      '<div style="font-size:10px;color:' + TILEX.muted + ';margin-top:4px">' + escHtml(synth.justification) + '</div></div></div></div>';
  }

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Sauvegarde Supabase ──
  async function saveToSupabase(question, phases, synth) {
    if (!window.supabase) return;
    var session = null;
    try { session = (await window.supabase.auth.getSession()).data.session; } catch (_) {}
    if (!session) return;

    try {
      var convRes = await window.supabase.from("conversations").insert({
        user_id: session.user.id,
        title: question.length > 60 ? question.slice(0, 60) + "..." : question,
        agent_name: "MARCEAU-AL",
        type: "chat",
      }).select("id").single();

      if (!convRes.data) return;
      var convId = convRes.data.id;

      var msgs = [];
      msgs.push({
        user_id: session.user.id,
        conversation_id: convId,
        role: "user",
        content: question,
      });

      var agentNames = { marceau: "MARCEAU", claude: "CLAUDE-AL" };
      for (var i = 0; i < phases.length; i++) {
        msgs.push({
          user_id: session.user.id,
          conversation_id: convId,
          role: "assistant",
          content: "[" + agentNames[phases[i].agent] + " — Phase " + (i + 1) + "]\n" + phases[i].text,
          model_used: "claude-sonnet-4-6",
        });
      }

      msgs.push({
        user_id: session.user.id,
        conversation_id: convId,
        role: "assistant",
        content: "[NEXUS — Synthèse]\n" + synth.reponse_finale +
          "\n\nScore: " + synth.score + "/100 — " + synth.justification,
        model_used: "claude-sonnet-4-6",
      });

      await window.supabase.from("messages").insert(msgs);

      await window.supabase.from("conversations").update({
        last_preview: synth.reponse_finale.slice(0, 100),
        updated_at: new Date().toISOString(),
      }).eq("id", convId);
    } catch (e) {
      console.error("MARCEAU save error:", e);
    }
  }

  // ── Logique principale du dialogue ──
  async function launchDialogue(question) {
    if (dialogueState.loading) return;
    dialogueState = { question: question, phases: [], synth: null, loading: true, step: "idle" };

    document.getElementById("marceau-dialogue").innerHTML = "";
    document.getElementById("marceau-nexus").style.display = "none";
    document.getElementById("marceau-error").style.display = "none";

    var btn = document.getElementById("marceau-launch-btn");
    if (btn) btn.disabled = true;

    var streamers = {};

    try {
      // Phase 1 — MARCEAU ouvre
      dialogueState.step = "phase1";
      var bubble1 = addBubble("marceau", 0);
      streamers[0] = new StreamingText(bubble1.textEl, TILEX.orange);
      updateStep("phase1");

      var m1 = await streamFromEdge(
        enrichPrompt(SYS.M1),
        [{ role: "user", content: 'SUJET: "' + question + '"' }],
        function (t) { streamers[0].update(t); }
      );
      streamers[0].done();
      dialogueState.phases.push({ agent: "marceau", text: m1 });
      bubble1.markDone();

      // Phase 2 — CLAUDE-AL réagit
      dialogueState.step = "phase2";
      addConnector("marceau", "claude");
      var bubble2 = addBubble("claude", 1);
      streamers[1] = new StreamingText(bubble2.textEl, TILEX.blue);
      updateStep("phase2");

      var c1 = await streamFromEdge(
        enrichPrompt(SYS.C1),
        [{ role: "user", content: buildContext(dialogueState.phases, question) }],
        function (t) { streamers[1].update(t); }
      );
      streamers[1].done();
      dialogueState.phases.push({ agent: "claude", text: c1 });
      bubble2.markDone();

      // Phase 3 — MARCEAU contre-attaque
      dialogueState.step = "phase3";
      addConnector("claude", "marceau");
      var bubble3 = addBubble("marceau", 2);
      streamers[2] = new StreamingText(bubble3.textEl, TILEX.orange);
      updateStep("phase3");

      var m2 = await streamFromEdge(
        enrichPrompt(SYS.M2),
        [{ role: "user", content: buildContext(dialogueState.phases, question) }],
        function (t) { streamers[2].update(t); }
      );
      streamers[2].done();
      dialogueState.phases.push({ agent: "marceau", text: m2 });
      bubble3.markDone();

      // Phase 4 — CLAUDE-AL conclut
      dialogueState.step = "phase4";
      addConnector("marceau", "claude");
      var bubble4 = addBubble("claude", 3);
      streamers[3] = new StreamingText(bubble4.textEl, TILEX.blue);
      updateStep("phase4");

      var c2 = await streamFromEdge(
        enrichPrompt(SYS.C2),
        [{ role: "user", content: buildContext(dialogueState.phases, question) }],
        function (t) { streamers[3].update(t); }
      );
      streamers[3].done();
      dialogueState.phases.push({ agent: "claude", text: c2 });
      bubble4.markDone();

      // NEXUS Synthèse
      dialogueState.step = "synthesis";
      showSynthesisPanel(null);
      updateStep("synthesis");

      var fullCtx = buildContext(dialogueState.phases, question);
      var raw = await callEdge(SYS.NX, fullCtx);
      var cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
      var synth = JSON.parse(cleaned);
      dialogueState.synth = synth;
      showSynthesisPanel(synth);

      await saveToSupabase(question, dialogueState.phases, synth);

      if (typeof addTiEtudeNote === "function") {
        addTiEtudeNote("Sujet exploré: " + question.slice(0, 120) + " | Score: " + synth.score);
      }

      if (window.MemoireIA) {
        MemoireIA._getUserId().then(function(uid) {
          if (uid) {
            MemoireIA.memoriser(uid, "projet", "dernier_sujet_marceau", question.slice(0, 200), "Dialogue Marceau", "conversation");
            if (synth.reponse_finale) {
              MemoireIA.extraireDeConversation(uid, question, synth.reponse_finale).then(function() {
                if (typeof chargerMemoireContexte === "function") chargerMemoireContexte();
              });
            }
          }
        });
      }

      dialogueState.step = "done";
      updateStep("done");
    } catch (err) {
      console.error("MARCEAU launchDialogue error:", err);
      showError(err.message || "Erreur inattendue");
      dialogueState.step = "idle";
      updateStep("idle");
    } finally {
      dialogueState.loading = false;
      if (btn) btn.disabled = false;
    }
  }

  // ── HTML du module ──
  function getMarceauHTML() {
    return (
      '<div id="agent-marceau-container">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border,#23232c)">' +
      '<div style="display:flex;gap:4px;align-items:center;">' +
      svgMarceauAvatar(42, "hm") + svgClaudeAvatar(34, "hc") + svgNexusAvatar(34, "hn") +
      "</div>" +
      '<div style="flex:1">' +
      '<div style="font-size:19px;font-weight:900;letter-spacing:3px;background:linear-gradient(90deg,#ff7f27,#ffcf4a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:transparent">AGENT MARCEAU</div>' +
      '<div style="font-size:9px;color:var(--muted,#6c6c78);letter-spacing:3px;margin-top:2px">DIALOGUE MULTI-AGENTS 4 PHASES</div>' +
      "</div>" +
      '<span id="step-badge" style="font-size:9px;letter-spacing:1px;font-weight:700;color:var(--muted,#6c6c78);border:1px solid rgba(108,108,120,.3);border-radius:3px;padding:2px 8px">PRÊT</span>' +
      "</div>" +

      '<div style="background:var(--bg3,#0d0d12);border:1px solid var(--border,#23232c);border-radius:8px;padding:14px;margin-bottom:14px">' +
      '<div style="font-size:9px;color:var(--muted,#6c6c78);margin-bottom:8px;letter-spacing:2px">SUJET DE RÉFLEXION</div>' +
      '<textarea id="marceau-input" rows="2" placeholder="Décris ton problème, ton idée, ou ce que tu veux créer..."></textarea>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border,#23232c)">' +
      '<span style="font-size:9px;color:var(--muted,#6c6c78)">Ctrl+Enter</span>' +
      '<button id="marceau-launch-btn">LANCER LE DIALOGUE</button>' +
      "</div></div>" +

      '<div id="marceau-error" style="display:none;background:#140808;border:1px solid #ef444445;border-radius:6px;padding:10px 14px;color:#ef4444;font-size:11px;margin-bottom:14px"></div>' +

      '<div id="marceau-dialogue"></div>' +
      '<div id="marceau-nexus" style="display:none"></div>' +

      '<div style="margin-top:20px;padding-top:12px;border-top:1px solid var(--border,#23232c);display:flex;justify-content:space-between;font-size:9px;color:rgba(108,108,120,.3);letter-spacing:1px">' +
      "<span>ti-lex v10 · Produit du Québec</span>" +
      "<span>Dialogue multi-agents 4 phases</span></div></div>"
    );
  }

  // ── Initialisation ──
  function initMarceauAgent() {
    var btn = document.getElementById("marceau-launch-btn");
    var input = document.getElementById("marceau-input");
    if (!btn || !input) return;

    btn.addEventListener("click", function () {
      var q = input.value.trim();
      if (!q) return;
      launchDialogue(q);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        var q = input.value.trim();
        if (!q) return;
        launchDialogue(q);
      }
    });
  }

  // ── Expose globals ──
  window.getMarceauHTML = getMarceauHTML;
  window.initMarceauAgent = initMarceauAgent;
  window.loadMarceauAgent = function () {
    var view = document.getElementById("view-marceau");
    if (!view) return;
    view.innerHTML = getMarceauHTML();
    initMarceauAgent();
    setTimeout(function () {
      var input = document.getElementById("marceau-input");
      if (input) input.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  };
})();
