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

})();
