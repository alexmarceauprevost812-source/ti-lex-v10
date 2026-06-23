// ti-lex v10 — Mode vocal québécois (Deepgram STT)
(function () {
  'use strict';

  var _socket = null;
  var _recorder = null;
  var _stream = null;
  var _isRecording = false;
  var _transcript = '';

  function getDeepgramKey() {
    return (window.TILEX_CONFIG && window.TILEX_CONFIG.DEEPGRAM_KEY) || '';
  }

  window.TilexVocal = {
    isRecording: function () { return _isRecording; },

    toggle: async function () {
      if (_isRecording) {
        this.stop();
      } else {
        await this.start();
      }
    },

    start: async function () {
      var key = getDeepgramKey();
      if (!key) {
        console.warn('[TilexVocal] Clé Deepgram manquante (TILEX_CONFIG.DEEPGRAM_KEY)');
        if (typeof toast === 'function') toast('Clé Deepgram non configurée', 'error');
        return;
      }

      try {
        _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.warn('[TilexVocal] Accès micro refusé:', e.message);
        if (typeof toast === 'function') toast('Accès au micro refusé', 'error');
        return;
      }

      _transcript = '';
      _isRecording = true;
      _updateButton(true);

      var wsUrl = 'wss://api.deepgram.com/v1/listen'
        + '?language=fr-CA'
        + '&model=nova-2'
        + '&smart_format=true'
        + '&punctuate=true'
        + '&interim_results=true';

      _socket = new WebSocket(wsUrl, ['token', key]);

      _socket.onopen = function () {
        console.log('[TilexVocal] WebSocket connecté');
        _recorder = new MediaRecorder(_stream, { mimeType: 'audio/webm;codecs=opus' });
        _recorder.ondataavailable = function (e) {
          if (e.data.size > 0 && _socket && _socket.readyState === WebSocket.OPEN) {
            _socket.send(e.data);
          }
        };
        _recorder.start(250);
      };

      _socket.onmessage = function (e) {
        try {
          var msg = JSON.parse(e.data);
          if (msg.channel && msg.channel.alternatives && msg.channel.alternatives[0]) {
            var alt = msg.channel.alternatives[0];
            if (msg.is_final && alt.transcript) {
              _transcript += (_transcript ? ' ' : '') + alt.transcript;
              _fillInput(_transcript);
            } else if (alt.transcript) {
              _fillInput(_transcript + (_transcript ? ' ' : '') + alt.transcript);
            }
          }
        } catch (err) { /* ignore parse errors */ }
      };

      _socket.onerror = function (e) {
        console.warn('[TilexVocal] WebSocket erreur:', e);
        window.TilexVocal.stop();
      };

      _socket.onclose = function () {
        if (_isRecording) window.TilexVocal.stop();
      };
    },

    stop: function () {
      _isRecording = false;
      _updateButton(false);

      if (_recorder && _recorder.state !== 'inactive') {
        try { _recorder.stop(); } catch (e) { /* ignore */ }
      }
      _recorder = null;

      if (_socket) {
        try { _socket.close(); } catch (e) { /* ignore */ }
        _socket = null;
      }

      if (_stream) {
        _stream.getTracks().forEach(function (t) { t.stop(); });
        _stream = null;
      }

      if (_transcript) {
        _fillInput(_transcript);
        console.log('[TilexVocal] Transcription finale:', _transcript);
      }
    },

    getTranscript: function () { return _transcript; }
  };

  function _fillInput(text) {
    var input = document.getElementById('chat-input');
    if (input) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function _updateButton(active) {
    var btn = document.getElementById('vocal-btn');
    if (!btn) return;
    if (active) {
      btn.classList.add('recording');
      btn.title = 'Arrêter la dictée';
    } else {
      btn.classList.remove('recording');
      btn.title = 'Dictée vocale';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var composerRow = document.querySelector('.composer-actions-row');
    if (!composerRow) return;
    var btn = document.createElement('button');
    btn.id = 'vocal-btn';
    btn.className = 'composer-plus';
    btn.title = 'Dictée vocale';
    btn.innerHTML = '🎙️';
    btn.style.cssText = 'font-size:16px;';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      window.TilexVocal.toggle();
    });
    composerRow.appendChild(btn);
  });

  console.log('[TilexVocal] Chargé');
})();
