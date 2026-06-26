const TilexGuard = {

  nettoyer(texte) {
    if (typeof texte !== "string") return "";
    return texte
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "")
      .trim();
  },

  verifierConfig() {
    const requis = ["SB_URL", "SB_ANON"];
    const manquants = requis.filter(c => !window[c]);
    if (manquants.length) {
      console.error("[TilexGuard] Config manquante:", manquants);
      if (window.TilexToast) TilexToast.error("Configuration incomplète");
      return false;
    }
    return true;
  },

  limiteur: {},
  peutAppeler(cle, maxParMinute = 30) {
    const now = Date.now();
    if (!this.limiteur[cle]) this.limiteur[cle] = [];
    this.limiteur[cle] = this.limiteur[cle].filter(t => now - t < 60000);
    if (this.limiteur[cle].length >= maxParMinute) {
      if (window.TilexToast) TilexToast.error("Trop de requêtes, attends un peu");
      return false;
    }
    this.limiteur[cle].push(now);
    return true;
  },

  init() {
    window.addEventListener("error", (e) => {
      console.error("[TilexGuard] Erreur:", e.message);
    });
    window.addEventListener("unhandledrejection", (e) => {
      console.error("[TilexGuard] Promesse rejetée:", e.reason);
    });
    console.log("[TilexGuard] Actif");
  }
};
window.TilexGuard = TilexGuard;
document.addEventListener("DOMContentLoaded", () => TilexGuard.init());
