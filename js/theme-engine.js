(function () {
  'use strict';

  var DEFAULTS = {
    'agent-violet': '#C700E6',
    'agent-gold':   '#E6A400',
    'agent-red':    '#E60000',
    'agent-orange': '#FF7F27',
    'agent-green':  '#37E0A0',
    'agent-blue':   '#4A9EFF',
    'btn-bg':       '#FF7F27',
    'btn-fg':       '#0A0A0A',
  };

  var current = {};
  Object.keys(DEFAULTS).forEach(function(k){ current[k] = DEFAULTS[k]; });

  window.ThemeEngine = {

    apply: function(colors) {
      Object.keys(colors).forEach(function(k){ current[k] = colors[k]; });
      var root = document.documentElement;
      Object.keys(current).forEach(function(k){
        root.style.setProperty('--tilex-' + k, current[k]);
      });
    },

    get: function(key) { return current[key]; },

    getAll: function() {
      var copy = {};
      Object.keys(current).forEach(function(k){ copy[k] = current[k]; });
      return copy;
    },

    load: async function() {
      this.apply(DEFAULTS);
      try {
        var themeRes = await window.supabase
          .from('app_theme').select('colors').eq('id', 1).maybeSingle();
        if (themeRes.data && themeRes.data.colors) this.apply(themeRes.data.colors);

        var sessRes = await window.supabase.auth.getSession();
        if (sessRes.data && sessRes.data.session) {
          var usRes = await window.supabase
            .from('user_settings').select('theme')
            .eq('user_id', sessRes.data.session.user.id).maybeSingle();
          if (usRes.data && usRes.data.theme) this.apply(usRes.data.theme);
        }
      } catch (e) {
        console.warn('[ThemeEngine] cascade partielle :', e);
      }
    },

    saveUserTheme: async function(colors) {
      var sessRes = await window.supabase.auth.getSession();
      if (!sessRes.data || !sessRes.data.session) throw new Error('Non authentifié');
      var merged = {};
      Object.keys(current).forEach(function(k){ merged[k] = current[k]; });
      Object.keys(colors).forEach(function(k){ merged[k] = colors[k]; });
      var res = await window.supabase
        .from('user_settings')
        .upsert({
          user_id: sessRes.data.session.user.id,
          theme: merged,
          updated_at: new Date().toISOString(),
        });
      if (res.error) throw res.error;
      this.apply(colors);
    },

    reset: async function() {
      var sessRes = await window.supabase.auth.getSession();
      if (sessRes.data && sessRes.data.session) {
        await window.supabase.from('user_settings')
          .upsert({ user_id: sessRes.data.session.user.id, theme: {}, updated_at: new Date().toISOString() });
      }
      current = {};
      Object.keys(DEFAULTS).forEach(function(k){ current[k] = DEFAULTS[k]; });
      await this.load();
    },
  };

  window.ThemeEngine.apply(DEFAULTS);

  document.addEventListener('DOMContentLoaded', function() {
    if (window.supabase) window.ThemeEngine.load();
  });
})();
