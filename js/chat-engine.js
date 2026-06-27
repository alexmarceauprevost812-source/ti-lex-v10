// ============================================================
// ti-lex v10 — ChatEngine
// Gestion du chat INDAR avec 4 pouvoirs IA.
// Vanilla JS — Supabase Edge Function agent-dispatcher via SSE.
// ============================================================

(function () {
  'use strict';

  var state = {
    agent: 'nexus',
    history: [],
    powers: { thinking: false, search: false, vision: false },
    pendingImage: null,
    isLoading: false,
  };

  window.ChatEngine = {

    setAgent: function(nom) {
      state.agent = (nom || 'nexus').toLowerCase();
      state.history = [];
    },

    getAgent: function() { return state.agent; },

    togglePower: function(power, btn) {
      if (!state.powers.hasOwnProperty(power)) return;
      state.powers[power] = !state.powers[power];

      if (btn) {
        var colors = { thinking: '#c084fc', search: '#4a9eff', vision: '#37e0a0' };
        btn.classList.toggle('power-btn--active', state.powers[power]);
        btn.style.borderColor = state.powers[power] ? (colors[power] || '#ff7f27') : '';
        btn.style.color = state.powers[power] ? (colors[power] || '#ff7f27') : '';
      }

      if (power === 'vision' && state.powers.vision) {
        _openVisionPicker();
      } else if (power === 'vision' && !state.powers.vision) {
        state.pendingImage = null;
      }
    },

    getPowers: function() { return Object.assign({}, state.powers); },

    setImage: function(base64, mediaType) {
      state.pendingImage = { base64: base64, media_type: mediaType };
      state.powers.vision = true;
    },

    clearImage: function() {
      state.pendingImage = null;
      state.powers.vision = false;
    },

    isLoading: function() { return state.isLoading; },

    sendToAgent: async function(agentId, message, opts) {
      if (state.isLoading) return null;
      state.isLoading = true;

      var options = opts || {};
      var deepThink = options.deepThink || state.powers.thinking;
      var webSearch = options.webSearch || state.powers.search;
      var image = options.image || state.pendingImage;

      var token = typeof getToken === 'function' ? getToken() : (typeof SB_ANON !== 'undefined' ? SB_ANON : '');
      if (!token) {
        state.isLoading = false;
        return { error: 'Non authentifié' };
      }

      var userId = null;
      try {
        var u = await supabase.auth.getUser();
        if (u.data && u.data.user) userId = u.data.user.id;
      } catch (e) {}

      var scanContext = null;
      try {
        var res = await supabase.from('scans').select('*').order('created_at', { ascending: false }).limit(5);
        if (!res.error && res.data && res.data.length > 0) scanContext = JSON.stringify(res.data, null, 2);
      } catch (e) {}

      var payload = {
        agent_id: agentId || state.agent,
        message: message || 'Présente-toi et explique ta mission INDAR.',
        user_id: userId,
        scan_context: scanContext,
        deep_think: deepThink,
        web_search: webSearch,
      };

      if (image && image.base64) {
        payload.image_base64 = image.base64;
        payload.image_media_type = image.media_type || 'image/jpeg';
      }

      try {
        var response = await fetch(SB_URL + '/functions/v1/agent-dispatcher', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SB_ANON,
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Erreur API: ' + response.status);

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var streamedText = '';
        var buffer = '';
        var wsUsed = false;
        var dtUsed = false;

        var onText = options.onText || function() {};
        var onSearchStart = options.onSearchStart || function() {};
        var onDone = options.onDone || function() {};

        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;

          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.startsWith('data: ')) continue;
            try {
              var event = JSON.parse(line.slice(6));

              if (event.type === 'text' && event.delta) {
                streamedText += event.delta;
                onText(streamedText, event.delta);
              }
              if (event.type === 'web_search_start') {
                wsUsed = true;
                onSearchStart();
              }
              if (event.type === 'done') {
                wsUsed = event.web_search_used || wsUsed;
                dtUsed = event.deep_think || false;
                onDone(streamedText, wsUsed, dtUsed);
              }
              if (event.type === 'error') {
                throw new Error(event.message || 'Erreur streaming');
              }
            } catch (parseErr) {
              if (parseErr.message && parseErr.message !== 'Erreur streaming') continue;
              throw parseErr;
            }
          }
        }

        state.pendingImage = null;
        state.isLoading = false;

        return { text: streamedText, webSearch: wsUsed, deepThink: dtUsed };

      } catch (err) {
        state.isLoading = false;
        return { error: err.message || 'Réseau indisponible' };
      }
    },
  };

  function _openVisionPicker() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) { state.powers.vision = false; return; }
      _readImageFile(file);
    };
    input.click();
  }

  function _readImageFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var dataUrl = e.target.result;
      var base64 = dataUrl.split(',')[1];
      state.pendingImage = { base64: base64, media_type: file.type || 'image/jpeg' };
    };
    reader.readAsDataURL(file);
  }

  document.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        state.powers.vision = true;
        _readImageFile(items[i].getAsFile());
        break;
      }
    }
  });

  console.log('[ChatEngine] ✅ Chargé — pouvoirs disponibles : Thinking, Search, Vision, Streaming');

  // ── Sources web (citations avec favicon) ─────────────────────
  window.ChatEngine.appendSources = function(msgEl, sources) {
    if (!sources || !sources.length || !msgEl) return;

    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';

    var label = document.createElement('span');
    label.textContent = '🌐 Sources :';
    label.style.cssText = 'color:#4a9eff;font-size:11px;font-family:monospace;margin-right:4px;';
    wrap.appendChild(label);

    sources.forEach(function(src) {
      var host = src.url;
      try { host = new URL(src.url).hostname.replace('www.', ''); } catch(e) {}
      var favicon = 'https://www.google.com/s2/favicons?domain=' + host + '&sz=32';

      var badge = document.createElement('a');
      badge.href = src.url;
      badge.target = '_blank';
      badge.rel = 'noopener noreferrer';
      badge.title = src.title;
      badge.style.cssText = 'display:inline-flex;align-items:center;gap:5px;'
        + 'padding:3px 9px;background:#1a1a1a;border:1px solid #2a3a4a;'
        + 'border-radius:12px;color:#4a9eff;font-size:11px;'
        + 'font-family:monospace;text-decoration:none;'
        + 'max-width:180px;transition:border-color .2s;';
      badge.onmouseover = function() { badge.style.borderColor = '#4a9eff'; };
      badge.onmouseout = function() { badge.style.borderColor = '#2a3a4a'; };
      badge.innerHTML = '<img src="' + favicon + '" width="14" height="14" style="border-radius:3px;" onerror="this.style.display=\'none\'">'
        + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + host + '</span>';
      wrap.appendChild(badge);
    });

    msgEl.appendChild(wrap);
  };

  // ── Bouton « Réaliser un schéma » ────────────────────────────
  window.ChatEngine.attachRealizeButton = function(msgEl, fullText) {
    if (!fullText || !msgEl) return;
    var codeBlocks = [];
    var re = /```(?:sql|inject|js|ts|javascript|typescript)?\n([\s\S]*?)```/gi;
    var m;
    while ((m = re.exec(fullText)) !== null) { codeBlocks.push(m[1]); }
    var blocks = codeBlocks.filter(function(b) { return b.trim().length > 20; });
    if (!blocks.length) return;

    blocks.forEach(function(code) {
      var btn = document.createElement('button');
      btn.textContent = '⚡ Réaliser ce schéma';
      btn.style.cssText = 'margin-top:8px;padding:8px 16px;background:transparent;'
        + 'border:1px solid #ff7f27;border-radius:8px;color:#ff7f27;'
        + 'font-family:monospace;font-size:12px;cursor:pointer;'
        + 'transition:all .2s;display:block;';
      btn.onmouseover = function() { btn.style.background = '#ff7f27'; btn.style.color = '#0a0a0a'; };
      btn.onmouseout = function() { btn.style.background = 'transparent'; btn.style.color = '#ff7f27'; };
      btn.onclick = function() { _realizeFlow(code.trim(), btn); };
      msgEl.appendChild(btn);
    });
  };

  async function _realizeFlow(code, btn) {
    // ⚠️ tilex-realize non déployée (404) → flow désactivé pour éviter les erreurs en prod.
    // TODO: réactiver quand l'Edge Function tilex-realize existera côté Supabase.
    if (typeof showToast === 'function') showToast("⚙️ Réalisation auto (SQL/GitHub) bientôt disponible — copie ton code en attendant.", "info");
    return;
    btn.disabled = true;
    btn.textContent = '⏳ Analyse...';

    try {
      var det = await window.supabase.functions.invoke('tilex-realize', {
        body: { action: 'detect', content: code }
      });
      var kind = (det.data && det.data.kind) || 'github';
      var destructive = (det.data && det.data.destructive) || false;

      var ok = await _showRealizePreview(code, kind, destructive);
      if (!ok) { btn.disabled = false; btn.textContent = '⚡ Réaliser ce schéma'; return; }

      var confirmedDestructive = false;
      if (destructive) {
        confirmedDestructive = confirm(
          '⚠️ DANGER : ce schéma contient une opération destructrice (DROP/DELETE/TRUNCATE).\n\n'
          + 'Es-tu ABSOLUMENT certain ? Cette action peut détruire des données.'
        );
        if (!confirmedDestructive) { btn.disabled = false; btn.textContent = '⚡ Réaliser ce schéma'; return; }
      }

      btn.textContent = '⚡ Réalisation...';
      var target = kind === 'github' ? prompt('Chemin du fichier dans le repo :', 'tilex/schema-' + Date.now() + '.sql') : '';
      var res = await window.supabase.functions.invoke('tilex-realize', {
        body: { action: 'realize', content: code, kind: kind, target: target, confirmed: true, confirmed_destructive: confirmedDestructive }
      });

      if (res.error || (res.data && res.data.ok === false)) throw new Error((res.data && res.data.error) || (res.error && res.error.message) || 'Échec');

      btn.textContent = kind === 'sql' ? '✅ SQL appliqué sur Supabase' : '✅ Poussé sur GitHub';
      btn.style.borderColor = '#37e0a0';
      btn.style.color = '#37e0a0';

      if (res.data && res.data.result && res.data.result.url) {
        var link = document.createElement('a');
        link.href = res.data.result.url;
        link.target = '_blank';
        link.textContent = '↗ Voir le commit';
        link.style.cssText = 'display:block;margin-top:4px;color:#4a9eff;font-size:11px;font-family:monospace;';
        btn.after(link);
      }
    } catch (e) {
      btn.textContent = '❌ ' + (e.message || 'Erreur');
      btn.style.borderColor = '#ff3b3b';
      btn.style.color = '#ff3b3b';
      setTimeout(function() {
        btn.disabled = false;
        btn.textContent = '⚡ Réessayer';
        btn.style.borderColor = '#ff7f27';
        btn.style.color = '#ff7f27';
      }, 3000);
    }
  }

  function _showRealizePreview(code, kind, destructive) {
    return new Promise(function(resolve) {
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10000;'
        + 'display:flex;align-items:center;justify-content:center;padding:20px;';
      var badge = kind === 'sql'
        ? '<span style="color:#37e0a0;">🗄️ SQL → Supabase</span>'
        : '<span style="color:#c084fc;">📦 Code → GitHub</span>';
      var warn = destructive
        ? '<div style="color:#ff3b3b;font-size:12px;margin:8px 0;">⚠️ Opération destructrice détectée</div>' : '';

      overlay.innerHTML = '<div style="background:#0a0a0a;border:1px solid #2a2a2a;border-radius:14px;max-width:640px;width:100%;max-height:80vh;overflow:auto;padding:20px;font-family:monospace;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<span style="font-size:14px;font-weight:700;">Aperçu avant réalisation — ' + badge + '</span></div>'
        + warn
        + '<pre style="background:#141414;border:1px solid #222;border-radius:8px;padding:12px;font-size:12px;color:#ddd;white-space:pre-wrap;overflow:auto;max-height:50vh;">' + code.replace(/</g, '&lt;') + '</pre>'
        + '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">'
        + '<button data-cancel style="padding:8px 16px;background:transparent;border:1px solid #444;border-radius:8px;color:#888;font-family:inherit;font-size:12px;cursor:pointer;">Annuler</button>'
        + '<button data-confirm style="padding:8px 16px;background:#ff7f27;border:none;border-radius:8px;color:#0a0a0a;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;">Confirmer la réalisation</button>'
        + '</div></div>';

      overlay.querySelector('[data-cancel]').onclick = function() { overlay.remove(); resolve(false); };
      overlay.querySelector('[data-confirm]').onclick = function() { overlay.remove(); resolve(true); };
      overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); resolve(false); } };
      document.body.appendChild(overlay);
    });
  }

})();
