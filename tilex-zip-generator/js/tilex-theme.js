/* ════════════════════════════════════════════
   TILEX-THEME.JS — ti-lex-AL v10
   Feature 8 : Thème personnalisable
════════════════════════════════════════════ */
'use strict';

window.TILEX = window.TILEX || {};

const LS_KEY_THEME  = 'tilex_theme';
const LS_KEY_COLORS = 'tilex_custom_colors';

/* ════════════════════════════════════════════
   DÉFINITIONS DES THÈMES
════════════════════════════════════════════ */
const THEMES = {
  dark: {
    label:    'Cyberpunk',
    hljs:     'github-dark',
    hljsUrl:  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css',
  },
  light: {
    label:    'Lumière',
    hljs:     'github',
    hljsUrl:  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css',
  },
  monokai: {
    label:    'Monokai',
    hljs:     'monokai',
    hljsUrl:  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/monokai.min.css',
  },
  custom: {
    label:    'Custom',
    hljs:     'github-dark',
    hljsUrl:  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css',
  },
};

/* ════════════════════════════════════════════
   APPLIQUER UN THÈME
════════════════════════════════════════════ */
TILEX.appliquerTheme = function(theme, couleurs = null) {
  const html   = document.documentElement;
  const hljsCss = document.getElementById('hljs-theme-css');

  html.setAttribute('data-theme', theme);
  TILEX.state.theme = theme;

  // Changer le CSS de highlight.js
  if (hljsCss && THEMES[theme]) {
    hljsCss.href = THEMES[theme].hljsUrl;
  }

  // Couleurs custom
  if (theme === 'custom' && couleurs) {
    Object.entries(couleurs).forEach(([k, v]) => {
      html.style.setProperty('--custom-' + k, v);
    });
    localStorage.setItem(LS_KEY_COLORS, JSON.stringify(couleurs));
  }

  // Mettre à jour les boutons actifs
  document.querySelectorAll('.tx-theme-choice').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  localStorage.setItem(LS_KEY_THEME, theme);
};

/* ════════════════════════════════════════════
   MODAL THÈME
════════════════════════════════════════════ */
TILEX.ouvrirModalTheme = function() {
  const overlay = document.getElementById('modal-theme');
  if (overlay) overlay.classList.remove('hidden');

  // Marquer le thème actif
  document.querySelectorAll('.tx-theme-choice').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (TILEX.state.theme || 'dark'));
  });

  // Charger les couleurs custom
  const couleurs = JSON.parse(localStorage.getItem(LS_KEY_COLORS) || 'null');
  if (couleurs) {
    Object.entries(couleurs).forEach(([k, v]) => {
      const inp = document.getElementById('color-' + k);
      const lbl = document.getElementById('color-' + k + '-val');
      if (inp) inp.value   = v;
      if (lbl) lbl.textContent = v;
    });
  }

  // Montrer/cacher les couleurs custom
  const customColors = document.getElementById('custom-colors');
  if (customColors) {
    customColors.style.display = TILEX.state.theme === 'custom' ? 'flex' : 'none';
  }
};

TILEX.fermerModalTheme = function() {
  const overlay = document.getElementById('modal-theme');
  if (overlay) overlay.classList.add('hidden');
};

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const overlay   = document.getElementById('modal-theme');
  const fermer    = document.getElementById('theme-fermer');
  const appliquer = document.getElementById('btn-appliquer-theme');
  const custom    = document.getElementById('custom-colors');

  // Fermer
  if (fermer) fermer.addEventListener('click', TILEX.fermerModalTheme);
  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) TILEX.fermerModalTheme();
  });

  // Boutons de thème prédéfinis
  document.querySelectorAll('.tx-theme-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      TILEX.appliquerTheme(theme);

      // Afficher/cacher les couleurs custom
      if (custom) {
        custom.style.display = theme === 'custom' ? 'flex' : 'none';
      }
    });
  });

  // Color pickers live
  ['accent', 'bg', 'surface', 'text'].forEach(key => {
    const inp = document.getElementById('color-' + key);
    const lbl = document.getElementById('color-' + key + '-val');
    if (!inp) return;

    inp.addEventListener('input', () => {
      if (lbl) lbl.textContent = inp.value;
      // Aperçu live si custom actif
      if (TILEX.state.theme === 'custom') {
        document.documentElement.style.setProperty('--custom-' + key, inp.value);
      }
    });
  });

  // Bouton Appliquer (theme custom)
  if (appliquer) appliquer.addEventListener('click', () => {
    const couleurs = {};
    ['accent', 'bg', 'surface', 'text'].forEach(key => {
      const inp = document.getElementById('color-' + key);
      if (inp) couleurs[key] = inp.value;
    });
    TILEX.appliquerTheme('custom', couleurs);
    TILEX.toast('🎨 Thème custom appliqué !');
  });

  // Charger le thème sauvegardé
  const themeSauve   = localStorage.getItem(LS_KEY_THEME) || 'dark';
  const couleursSauv = JSON.parse(localStorage.getItem(LS_KEY_COLORS) || 'null');
  TILEX.appliquerTheme(themeSauve, couleursSauv);

  console.log('[ti-lex] Thème initialisé ✓ (' + themeSauve + ')');
});
