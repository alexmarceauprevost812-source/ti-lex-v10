// js/tilex-theme.js
// Gestion des thèmes jour/nuit pour ti-lex-AL v10

const TilexTheme = {
  cle: "tilex-theme",

  init() {
    const sauve = localStorage.getItem(this.cle) || "nuit";
    this.appliquer(sauve);
  },

  appliquer(theme) {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(this.cle, theme);
    const btn = document.getElementById("tilex-theme-btn");
    if (btn) btn.textContent = theme === "nuit" ? "🌙" : "☀️";
  },

  basculer() {
    const actuel = document.body.getAttribute("data-theme") || "nuit";
    const nouveau = actuel === "nuit" ? "jour" : "nuit";
    this.appliquer(nouveau);
    if (window.TilexToast) TilexToast.info(`Thème ${nouveau} activé`);
  }
};

window.TilexTheme = TilexTheme;
document.addEventListener("DOMContentLoaded", () => TilexTheme.init());
