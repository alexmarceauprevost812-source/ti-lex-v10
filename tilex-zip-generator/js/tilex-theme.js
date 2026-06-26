/* ============================================================
   ti-lex-AL v10 — tilex-theme.js
   Rôle : Gestion des 4 thèmes (dark → light → purple → ocean)
   Persistance via localStorage
   ============================================================ */

window.showToast = window.showToast || function (message, type) {
  try {
    var t = document.getElementById("toast");
    if (!t) { console.log("[toast] " + message); return; }
    t.textContent = message;
    t.setAttribute("data-type", type || "info");
    t.classList.add("show");
    if (t._tilexTimer) clearTimeout(t._tilexTimer);
    t._tilexTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  } catch (e) { console.error(e); }
};

window.ThemeManager = {

  /* Ordre du cycle */
  themes: ["dark", "light", "purple", "ocean"],

  /* Clé localStorage */
  STORAGE_KEY: "tilex_theme",

  /* ----------  Applique un thème  ---------- */
  set: function (theme) {
    try {
      if (this.themes.indexOf(theme) === -1) {
        theme = "dark"; // fallback
      }
      document.documentElement.setAttribute("data-theme", theme);

      try {
        localStorage.setItem(this.STORAGE_KEY, theme);
      } catch (storageErr) {
        // localStorage peut être bloqué (mode privé) — on ne plante pas
        console.warn("localStorage indisponible :", storageErr);
      }

      // Met à jour un éventuel bouton d'affichage du thème courant
      var label = document.getElementById("themeLabel");
      if (label) label.textContent = theme;

    } catch (e) {
      console.error("Erreur theme set :", e);
    }
  },

  /* ----------  Cycle vers le thème suivant  ---------- */
  toggle: function () {
    try {
      var current = document.documentElement.getAttribute("data-theme") || "dark";
      var idx = this.themes.indexOf(current);
      var next = this.themes[(idx + 1) % this.themes.length];
      this.set(next);
      window.showToast("Thème : " + next, "info");
    } catch (e) {
      console.error("Erreur theme toggle :", e);
    }
  },

  /* ----------  Charge le thème sauvegardé au démarrage  ---------- */
  init: function () {
    try {
      var saved = "dark";
      try {
        saved = localStorage.getItem(this.STORAGE_KEY) || "dark";
      } catch (storageErr) {
        console.warn("localStorage indisponible :", storageErr);
      }
      this.set(saved);
    } catch (e) {
      console.error("Erreur theme init :", e);
    }
  }
};

/* Application immédiate du thème sauvegardé au chargement */
document.addEventListener("DOMContentLoaded", function () {
  window.ThemeManager.init();
});
