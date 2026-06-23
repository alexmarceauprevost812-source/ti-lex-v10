// ti-lex v10 — Mémoire persistante Supabase + sessions cross-session
(function () {
  'use strict';

  var _email = null;
  var _userId = null;
  var _cache = {};
  var _sessionCtx = {};

  // Test de connexion Supabase au démarrage
  async function testConnexion() {
    if (!window.supabase) {
      console.warn('[TilexMemory] window.supabase absent');
      return false;
    }
    try {
      var r = await window.supabase.from('tilex_memory').select('id').limit(1);
      if (r.error) {
        console.warn('[TilexMemory] Connexion Supabase échouée:', r.error.message);
        return false;
      }
      console.log('[TilexMemory] Connexion Supabase OK');
      return true;
    } catch (e) {
      console.warn('[TilexMemory] Test connexion échoué:', e.message);
      return false;
    }
  }

  window.TilexMemory = {
    init: async function () {
      if (!window.supabase) return;
      var ok = await testConnexion();
      if (!ok) return;
      try {
        var u = await window.supabase.auth.getUser();
        if (u.data && u.data.user) {
          _email = u.data.user.email;
          _userId = u.data.user.id;
          await this.load();
          await this.loadSession();
          console.log('[TilexMemory] Initialisé pour', _email, '—', Object.keys(_cache).length, 'clés,', Object.keys(_sessionCtx).length, 'sessions');
        }
      } catch (e) {
        console.warn('[TilexMemory] Init échoué:', e.message);
      }
    },

    load: async function () {
      if (!_email || !window.supabase) return _cache;
      try {
        var r = await window.supabase
          .from('tilex_memory')
          .select('cle, valeur, contexte, created_at')
          .eq('user_email', _email)
          .order('created_at', { ascending: false });
        if (r.data) {
          _cache = {};
          r.data.forEach(function (row) {
            if (!_cache[row.cle]) {
              _cache[row.cle] = { valeur: row.valeur, contexte: row.contexte, created_at: row.created_at };
            }
          });
        }
      } catch (e) {
        console.warn('[TilexMemory] Load échoué:', e.message);
      }
      return _cache;
    },

    save: async function (cle, valeur, contexte) {
      if (!_email || !window.supabase) return null;
      if (!cle || !valeur) return null;
      try {
        var r = await window.supabase
          .from('tilex_memory')
          .insert({ user_email: _email, cle: cle, valeur: valeur, contexte: contexte || null })
          .select()
          .single();
        if (r.data) {
          _cache[cle] = { valeur: valeur, contexte: contexte || null, created_at: r.data.created_at };
        }
        return r.data;
      } catch (e) {
        console.warn('[TilexMemory] Save échoué:', e.message);
        return null;
      }
    },

    get: function (cle) {
      var entry = _cache[cle];
      return entry ? entry.valeur : null;
    },

    getAll: function () {
      return Object.assign({}, _cache);
    },

    remove: async function (cle) {
      if (!_email || !window.supabase) return;
      try {
        await window.supabase
          .from('tilex_memory')
          .delete()
          .eq('user_email', _email)
          .eq('cle', cle);
        delete _cache[cle];
      } catch (e) {
        console.warn('[TilexMemory] Remove échoué:', e.message);
      }
    },

    // ── Mémoire cross-session ──
    loadSession: async function () {
      if (!_userId || !window.supabase) return _sessionCtx;
      try {
        var r = await window.supabase
          .from('memoire_sessions')
          .select('session_key, contexte, resume, updated_at')
          .eq('user_id', _userId)
          .order('updated_at', { ascending: false })
          .limit(20);
        if (r.data) {
          _sessionCtx = {};
          r.data.forEach(function (row) {
            _sessionCtx[row.session_key] = {
              contexte: row.contexte,
              resume: row.resume,
              updated_at: row.updated_at
            };
          });
        }
      } catch (e) {
        console.warn('[TilexMemory] loadSession échoué:', e.message);
      }
      return _sessionCtx;
    },

    saveSession: async function (sessionKey, contexte, resume) {
      if (!_userId || !window.supabase) return null;
      if (!sessionKey) return null;
      try {
        var r = await window.supabase
          .from('memoire_sessions')
          .upsert({
            user_id: _userId,
            session_key: sessionKey,
            contexte: contexte || {},
            resume: resume || null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,session_key' })
          .select()
          .single();
        if (r.data) {
          _sessionCtx[sessionKey] = { contexte: contexte, resume: resume, updated_at: r.data.updated_at };
        }
        return r.data;
      } catch (e) {
        console.warn('[TilexMemory] saveSession échoué:', e.message);
        return null;
      }
    },

    getSession: function (sessionKey) {
      return _sessionCtx[sessionKey] || null;
    },

    getLastSession: function () {
      var keys = Object.keys(_sessionCtx);
      if (keys.length === 0) return null;
      var last = keys[0];
      return { key: last, data: _sessionCtx[last] };
    },

    getAllSessions: function () {
      return Object.assign({}, _sessionCtx);
    },

    getEmail: function () { return _email; },
    getUserId: function () { return _userId; },
    isConnected: function () { return !!_userId; }
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (window.supabase) {
      setTimeout(function () { window.TilexMemory.init(); }, 500);
    }
  });

  console.log('[TilexMemory] Chargé');
})();
