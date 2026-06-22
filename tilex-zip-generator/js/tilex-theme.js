// =============================================================
// tilex-theme.js — Gestion des 4 thèmes CSS
// ti-lex-AL v10 | Vanilla JS pur
// =============================================================

window.ThemeManager = {

  // Ordre du cycle des thèmes
  _themes : ['dark', 'light', 'purple', 'ocean'],
  _current: null,
  _storageKey: 'tilex-theme',

  // ----------------------------------------------------------
  // Initialisation au chargement — applique le thème sauvegardé
  // ----------------------------------------------------------
  init: function () {
    try {
      const sauvegarde = localStorage.getItem(ThemeManager._storageKey);
      const theme = sauvegarde && ThemeManager._themes.includes(sauvegarde)
        ? sauvegarde
        : 'dark'; // Thème par défaut : dark

      ThemeManager.set(theme);
      console.log(`[ThemeManager] Thème chargé : ${theme}`);

    } catch (err) {
      console.error('[ThemeManager] init:', err);
      ThemeManager.set('dark'); // Fallback
    }
  },

  // ----------------------------------------------------------
  // Cycle entre les thèmes : dark → light → purple → ocean → dark
  // ----------------------------------------------------------
  toggle: function () {
    try {
      const themes  = ThemeManager._themes;
      const current = ThemeManager._current || 'dark';
      const index   = themes.indexOf(current);
      const next    = themes[(index + 1) % themes.length];

      ThemeManager.set(next);

      const labels = {
        dark  : '🌑 Sombre',
        light : '☀️ Clair',
        purple: '🟣 Violet',
        ocean : '🌊 Océan'
      };
      ThemeManager._toast(`Thème : ${labels[next] || next}`, 'info');

    } catch (err) {
      console.error('[ThemeManager] toggle:', err);
    }
  },

  // ----------------------------------------------------------
  // Applique un thème spécifique et le sauvegarde
  // ----------------------------------------------------------
  set: function (theme) {
    try {
      if (!ThemeManager._themes.includes(theme)) {
        console.warn(`[ThemeManager] Thème "${theme}" inconnu.`);
        theme = 'dark';
      }

      // Applique l'attribut sur <html>
      document.documentElement.setAttribute('data-theme', theme);
      ThemeManager._current = theme;

      // Sauvegarde dans localStorage
      localStorage.setItem(ThemeManager._storageKey, theme);

      // Met à jour le bouton de thème si présent
      ThemeManager._updateButton(theme);

    } catch (err) {
      console.error('[ThemeManager] set:', err);
    }
  },

  // ----------------------------------------------------------
  // Retourne le thème actif
  // ----------------------------------------------------------
  get: function () {
    return ThemeManager._current || 'dark';
  },

  // ----------------------------------------------------------
  // Met à jour l'affichage du bouton de thème
  // ----------------------------------------------------------
  _updateButton: function (theme) {
    try {
      const btn = document.getElementById('themeBtn');
      if (!btn) return;

      const icones = {
        dark  : '🌑',
        light : '☀️',
        purple: '🟣',
        ocean : '🌊'
      };
      btn.textContent = `${icones[theme] || '🎨'} Thème`;
      btn.setAttribute('data-theme', theme);

    } catch (err) {
      // Silencieux — le bouton est optionnel
    }
  },

  // ----------------------------------------------------------
  // Toast de notification
  // ----------------------------------------------------------
  _toast: function (message, type = 'info') {
    if (window.CoreManager && CoreManager._toast) {
      CoreManager._toast(message, type);
      return;
    }
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className   = `toast toast-${type} toast-visible`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }
};

// ----------------------------------------------------------
// Auto-initialisation dès que le DOM est prêt
// ----------------------------------------------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ThemeManager.init);
} else {
  ThemeManager.init();
}
