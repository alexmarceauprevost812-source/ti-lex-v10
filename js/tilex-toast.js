// js/tilex-toast.js
// Système de notifications toast pour ti-lex-AL v10

const TilexToast = {
  conteneur: null,

  init() {
    if (this.conteneur) return;
    this.conteneur = document.createElement("div");
    this.conteneur.className = "tilex-toast-conteneur";
    document.body.appendChild(this.conteneur);
  },

  afficher(message, type = "info", duree = 3000) {
    this.init();
    const couleurs = {
      success: "#3ECF8E",
      error: "#F22F46",
      info: "#4285F4",
      warning: "#FBBC05"
    };
    const icones = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };

    const toast = document.createElement("div");
    toast.className = "tilex-toast";
    toast.style.borderLeft = `4px solid ${couleurs[type]}`;
    toast.innerHTML = `
      <span class="tilex-toast-icone" style="color:${couleurs[type]}">${icones[type]}</span>
      <span class="tilex-toast-message">${message}</span>
    `;
    this.conteneur.appendChild(toast);

    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, duree);
  },

  success(msg) { this.afficher(msg, "success"); },
  error(msg) { this.afficher(msg, "error"); },
  info(msg) { this.afficher(msg, "info"); },
  warning(msg) { this.afficher(msg, "warning"); }
};

window.TilexToast = TilexToast;
