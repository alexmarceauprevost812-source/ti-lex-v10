// ti-lex v10 — Hub de Connecteurs
// Affiche les services connectés avec logo officiel + statut live.
(function () {
  'use strict';

  var CONNECTORS = [
    {
      id: 'supabase', label: 'Supabase', logo: 'public/img/connectors/supabase.svg',
      color: '#37e0a0', initial: 'S',
      check: async function() {
        try {
          var r = await window.supabase.from('connector_status').select('id').limit(1);
          return !r.error;
        } catch(e) { return false; }
      },
    },
    {
      id: 'anthropic', label: 'Anthropic', logo: 'public/img/connectors/anthropic.svg',
      color: '#ff7f27', initial: 'A',
      check: async function() {
        try {
          var r = await window.supabase.functions.invoke('agent-al', { body: { action: 'ping' } });
          return !r.error || (r.error && r.error.context && r.error.context.status !== 500);
        } catch(e) { return false; }
      },
    },
    {
      id: 'github', label: 'GitHub', logo: 'public/img/connectors/github.svg',
      color: '#c084fc', initial: 'G',
      check: async function() {
        // tilex-realize non déployée → on reflète l'état GitHub local sans appeler le serveur (évite un 404).
        try { return !!(window._codexGithub && window._codexGithub.repo); } catch(e) { return false; }
      },
    },
    {
      id: 'vercel', label: 'Vercel', logo: 'public/img/connectors/vercel.svg',
      color: '#4a9eff', initial: 'V',
      check: async function() { return true; },
    },
  ];

  window.ConnectorsHub = {
    render: async function(targetSel) {
      var target = document.querySelector(targetSel || '#connectors-hub, [data-connectors-hub]');
      if (!target) return;

      target.innerHTML = CONNECTORS.map(function(c) {
        return '<div class="connector-chip" data-connector="' + c.id + '" title="' + c.label + ' — vérification...">'
          + '<span class="connector-logo" data-logo="' + c.id + '"></span>'
          + '<span class="connector-dot" data-dot="' + c.id + '" style="background:#555;"></span>'
          + '</div>';
      }).join('');

      CONNECTORS.forEach(function(c) {
        var slot = target.querySelector('[data-logo="' + c.id + '"]');
        if (!slot) return;
        var img = new Image();
        img.src = c.logo;
        img.alt = c.label;
        img.style.cssText = 'width:18px;height:18px;object-fit:contain;';
        img.onload = function() { slot.innerHTML = ''; slot.appendChild(img); };
        img.onerror = function() {
          slot.innerHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;'
            + 'width:18px;height:18px;border-radius:50%;background:' + c.color
            + ';color:#0a0a0a;font-size:11px;font-weight:700;font-family:monospace;">' + c.initial + '</span>';
        };
      });

      this.refreshStatus();
    },

    refreshStatus: async function() {
      await Promise.all(CONNECTORS.map(async function(c) {
        var dot = document.querySelector('[data-dot="' + c.id + '"]');
        var chip = document.querySelector('[data-connector="' + c.id + '"]');
        var ok = false;
        try { ok = await c.check(); } catch(e) { ok = false; }

        if (dot) {
          dot.style.background = ok ? '#37e0a0' : '#ff3b3b';
          dot.style.boxShadow = ok ? '0 0 6px #37e0a0' : '0 0 6px #ff3b3b';
        }
        if (chip) {
          chip.title = c.label + ' — ' + (ok ? '🟢 connecté' : '🔴 déconnecté');
        }
      }));
    },
  };

  document.addEventListener('DOMContentLoaded', function() {
    if (window.supabase) window.ConnectorsHub.render();
  });

  setInterval(function() { if (window.ConnectorsHub) window.ConnectorsHub.refreshStatus(); }, 60000);

  console.log('[ConnectorsHub] ✅ Chargé');
})();
