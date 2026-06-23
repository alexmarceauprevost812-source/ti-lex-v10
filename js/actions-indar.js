// ============================================================
// ti-lex v10 — Actions Centre INDAR
// Tous les handlers de boutons, enregistrés dans ButtonEngine.
// Chargé APRÈS button-engine.js.
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  if (!window.ButtonEngine) return;

  ButtonEngine.registerAll({

    // ── Navigation / Projet ─────────────────────────────────
    'nouveau-projet': function () {
      if (typeof createProject === 'function') createProject();
    },

    'nouvelle-conversation': function () {
      if (typeof newConversation === 'function') newConversation();
    },

    'effacer-conversation': function (el) {
      var idx = el.dataset.idx;
      if (idx != null && typeof deleteConv === 'function') deleteConv(parseInt(idx, 10));
    },

    // ── Composer menu ──────────────────────────────────────
    'composer-menu-toggle': function () {
      var menu = document.getElementById('composer-menu');
      if (menu) menu.classList.toggle('open');
    },

    'compose-file': function ()  { if (typeof composeAction === 'function') composeAction('file');  },
    'compose-zip': function ()   { if (typeof composeAction === 'function') composeAction('zip');   },
    'compose-image': function () { if (typeof composeAction === 'function') composeAction('image'); },
    'compose-web': function ()   { if (typeof composeAction === 'function') composeAction('web');   },

    // ── Agents INDAR ───────────────────────────────────────
    'ouvrir-nexus':       function () { if (typeof indarOuvrirAgent === 'function') indarOuvrirAgent('nexus'); },
    'ouvrir-marceau':     function () { if (typeof indarOuvrirAgent === 'function') indarOuvrirAgent('marceau'); },
    'ouvrir-cipher':      function () { if (typeof indarOuvrirAgent === 'function') indarOuvrirAgent('cipher'); },
    'ouvrir-sentinel':    function () { if (typeof indarOuvrirAgent === 'function') indarOuvrirAgent('sentinel'); },
    'ouvrir-oracle':      function () { if (typeof indarOuvrirAgent === 'function') indarOuvrirAgent('oracle'); },
    'ouvrir-phantom-red': function () { if (typeof indarOuvrirAgent === 'function') indarOuvrirAgent('phantom'); },
    'ouvrir-reaper':      function () { if (typeof indarOuvrirAgent === 'function') indarOuvrirAgent('reaper'); },

    'demarrer-indar': function () {
      if (typeof indarDemarrer === 'function') indarDemarrer();
    },

    // ── Scan ───────────────────────────────────────────────
    'lancer-scan': function (el) {
      if (typeof silexLaunchScan === 'function') silexLaunchScan();
    },

    'exporter-rapport': function () {
      var output = document.getElementById('indar-stream-output') ||
                   document.querySelector('[data-indar-corps] div[style*="pre-wrap"]');
      if (!output) return;
      var blob = new Blob([output.innerText], { type: 'text/plain' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rapport-indar-' + Date.now() + '.txt';
      a.click();
    },

    // ── Pouvoirs IA (INDAR superpowers) ─────────────────────
    'toggle-thinking': function (el) {
      var cb = document.getElementById('indar-deepthink-cb');
      if (cb) { cb.checked = !cb.checked; el.classList.toggle('active', cb.checked); }
    },

    'toggle-search': function (el) {
      if (typeof indarToggleWebSearch === 'function') indarToggleWebSearch();
    },

    'toggle-vision': function () {
      var input = document.getElementById('indar-img-input');
      if (input) input.click();
    },

    // ── Chat ───────────────────────────────────────────────
    'envoyer-message': function () {
      if (typeof sendChat === 'function') sendChat();
    },

    // ── UI générale ─────────────────────────────────────────
    'fermer-modal': function (el) {
      var modal = el.closest('[data-modal]') ||
                  el.closest('.modal') ||
                  document.querySelector('.modal.active');
      if (modal) modal.style.display = 'none';
    },

    'copier-texte': function (el) {
      var target = el.dataset.copyTarget;
      var text = target
        ? (document.querySelector(target) || {}).innerText
        : (el.previousElementSibling || {}).innerText || el.dataset.text || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(function() {
        var original = el.textContent;
        el.textContent = '✅ Copié!';
        setTimeout(function() { el.textContent = original; }, 1500);
      });
    },

    'toggle-sidebar': function () {
      if (typeof toggleSidebar === 'function') toggleSidebar();
    },

    // ── Quick scan grid ─────────────────────────────────────
    'scan-sequentiel': function () {
      var target = (document.getElementById('indar-scan-target') || {}).value || '';
      if (typeof indarRunSequential === 'function') indarRunSequential(target.trim());
    },

    'scan-complet': function () {
      var target = (document.getElementById('indar-scan-target') || {}).value || '';
      if (typeof indarRunAll === 'function') indarRunAll(target.trim());
    },

    'grid-reset': function () {
      if (typeof indarGridFullReset === 'function') indarGridFullReset();
    },

    // ── Theme toggle ────────────────────────────────────────
    'toggle-theme': function () {
      if (typeof toggleTheme === 'function') toggleTheme();
      if (typeof closeComposerMenu === 'function') closeComposerMenu();
    },

    // ── Studio ──────────────────────────────────────────────
    'studio-copier': function () {
      if (window.TilexStudio && typeof TilexStudio.copierCode === 'function') TilexStudio.copierCode();
    },

    'studio-push': function () {
      if (window.TilexStudio && typeof TilexStudio.pousserVersCodex === 'function') TilexStudio.pousserVersCodex();
    },

    'studio-preview': function () {
      if (window.TilexStudio && typeof TilexStudio.changerOnglet === 'function') TilexStudio.changerOnglet('preview');
    },
  });

  console.log('[INDAR] ✅ Actions enregistrées :', ButtonEngine.list());
});
