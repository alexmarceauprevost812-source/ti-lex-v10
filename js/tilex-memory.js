// ti-lex v10 — Mémoire persistante Supabase
(function () {
  'use strict';

  var _email = null;
  var _cache = {};

  window.TilexMemory = {
    init: async function () {
      if (!window.supabase) return;
      try {
        var u = await window.supabase.auth.getUser();
        if (u.data && u.data.user && u.data.user.email) {
          _email = u.data.user.email;
          await this.load();
          console.log('[TilexMemory] Initialisé pour', _email, '—', Object.keys(_cache).length, 'clés chargées');
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

    getEmail: function () { return _email; }
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (window.supabase) {
      setTimeout(function () { window.TilexMemory.init(); }, 500);
    }
  });

  console.log('[TilexMemory] Chargé');
})();
