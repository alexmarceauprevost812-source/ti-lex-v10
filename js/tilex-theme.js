// js/tilex-theme.js
// Thème nuit par défaut — fond noir, texte selon choix utilisateur, boutons orange

const TilexTheme = {
  cle: "tilex-theme",

  init() {
    const sauve = localStorage.getItem(this.cle) || "nuit";
    this.appliquer(sauve);
  },

  appliquer(theme) {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(this.cle, theme);
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
