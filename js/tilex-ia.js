window.TilexIA = (function () {
  'use strict';

  async function appeler(messages, options) {
    try {
      var cfg = window.TILEX_CONFIG || { supabaseUrl: window.SB_URL };
      if (!cfg || !cfg.supabaseUrl) {
        if (typeof showToastMsg === 'function') showToastMsg('Configuration ti-lex absente.');
        return null;
      }

      var token = null;
      if (window.supabase && window.supabase.auth) {
        var session = await window.supabase.auth.getSession();
        token = session.data.session ? session.data.session.access_token : null;
      }
      if (!token) {
        if (typeof showToastMsg === 'function') showToastMsg('Connecte-toi pour utiliser l\'IA.');
        return null;
      }

      var body = { messages: messages };
      if (options && options.model) body.model = options.model;
      if (options && options.max_tokens) body.max_tokens = options.max_tokens;

      var reponse = await fetch(cfg.supabaseUrl + '/functions/v1/tilex-ia-proxy', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'apikey': cfg.supabaseKey || window.SB_ANON || ''
        },
        body: JSON.stringify(body)
      });

      if (!reponse.ok) {
        if (typeof showToastMsg === 'function') showToastMsg('Erreur du service IA.');
        return null;
      }

      var data = await reponse.json();
      return data.resultat || null;
    } catch (e) {
      console.error('[TilexIA] échec appel', e);
      if (typeof showToastMsg === 'function') showToastMsg('Impossible de joindre l\'IA.');
      return null;
    }
  }

  async function transcrire(audioBase64, contentType) {
    try {
      var cfg = window.TILEX_CONFIG || { supabaseUrl: window.SB_URL };
      if (!cfg || !cfg.supabaseUrl) return null;

      var token = null;
      if (window.supabase && window.supabase.auth) {
        var session = await window.supabase.auth.getSession();
        token = session.data.session ? session.data.session.access_token : null;
      }
      if (!token) return null;

      var reponse = await fetch(cfg.supabaseUrl + '/functions/v1/tilex-deepgram-proxy', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'apikey': cfg.supabaseKey || window.SB_ANON || ''
        },
        body: JSON.stringify({
          action: 'transcribe',
          audio_base64: audioBase64,
          content_type: contentType || 'audio/webm'
        })
      });

      if (!reponse.ok) return null;
      var data = await reponse.json();
      return data.resultat || null;
    } catch (e) {
      console.error('[TilexIA] échec transcription', e);
      return null;
    }
  }

  async function parler(texte, options) {
    try {
      var cfg = window.TILEX_CONFIG || { supabaseUrl: window.SB_URL };
      if (!cfg || !cfg.supabaseUrl) return null;

      var token = null;
      if (window.supabase && window.supabase.auth) {
        var session = await window.supabase.auth.getSession();
        token = session.data.session ? session.data.session.access_token : null;
      }
      if (!token) return null;

      var body = { text: texte };
      if (options && options.voice_id) body.voice_id = options.voice_id;
      if (options && options.model_id) body.model_id = options.model_id;

      var reponse = await fetch(cfg.supabaseUrl + '/functions/v1/tilex-elevenlabs-proxy', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'apikey': cfg.supabaseKey || window.SB_ANON || ''
        },
        body: JSON.stringify(body)
      });

      if (!reponse.ok) return null;
      var data = await reponse.json();
      return data.audio_base64 || null;
    } catch (e) {
      console.error('[TilexIA] échec synthèse vocale', e);
      return null;
    }
  }

  return { appeler: appeler, transcrire: transcrire, parler: parler };
})();
