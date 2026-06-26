// ============================================
// js/tilex-toast.js
// TilexToast — Notifications visuelles ti-lex-AL v10
// Toasts élégants, file d'attente, bouton fermer, anti-XSS
// Auteur: Alex Marceau-Prévost
// 🔒 Message inséré via textContent (jamais innerHTML) → anti-XSS.
// 🎨 Branché sur la CSS existante (.tilex-toast-conteneur / .tilex-toast / .visible).
// ============================================

const TilexToast = {
  config: {
    duree: 3500,      // ms avant disparition auto
    maxVisible: 4     // nombre max de toasts affichés en même temps
  },

  conteneur: null,

  // ---------- INIT ----------
  init() {
    if (this.conteneur && document.body.contains(this.conteneur)) return this;
    let existant = document.querySelector(".tilex-toast-conteneur");
    if (existant) { this.conteneur = existant; }
    else {
      this.conteneur = document.createElement("div");
      this.conteneur.className = "tilex-toast-conteneur";
      document.body.appendChild(this.conteneur);
    }
    this._injecterCSS();
    return this;
  },

  // CSS d'appoint (bouton fermer + agencement) — injecté une seule fois.
  _injecterCSS() {
    if (document.getElementById("tilex-toast-extra-css")) return;
    const st = document.createElement("style");
    st.id = "tilex-toast-extra-css";
    st.textContent =
      ".tilex-toast-msg{flex:1;}" +
      ".tilex-toast-icon{font-weight:bold;}" +
      ".tilex-toast-close{background:none;border:none;color:#fff;opacity:.7;cursor:pointer;" +
      "font-size:18px;line-height:1;padding:0 2px;margin-left:4px;transition:opacity .15s;}" +
      ".tilex-toast-close:hover{opacity:1;}";
    (document.head || document.documentElement).appendChild(st);
  },

  // ---------- AFFICHER UN TOAST ----------
  show(message, type = "info", duree = null) {
    this.init();

    const c = { success: "#16a34a", error: "#dc2626", warning: "#d97706", info: "#2563eb" };
    const ic = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
    const palette = c[type] ? type : "info";

    const toast = document.createElement("div");
    toast.className = "tilex-toast";
    toast.style.background = c[palette];   // override la couleur de base → fond coloré par type

    // 🔒 Construction via DOM + textContent (anti-XSS, le message peut venir d'une API).
    const ico = document.createElement("span");
    ico.className = "tilex-toast-icon";
    ico.textContent = ic[palette];

    const txt = document.createElement("span");
    txt.className = "tilex-toast-msg";
    txt.textContent = message;

    const fermerBtn = document.createElement("button");
    fermerBtn.className = "tilex-toast-close";
    fermerBtn.setAttribute("aria-label", "Fermer");
    fermerBtn.textContent = "×";
    fermerBtn.onclick = () => this.fermer(toast);

    toast.append(ico, txt, fermerBtn);
    this.conteneur.appendChild(toast);

    // Animation d'entrée (classe .visible déjà gérée par la CSS existante)
    requestAnimationFrame(() => toast.classList.add("visible"));

    // Limite le nombre de toasts visibles
    this.limiterVisibles();

    // Auto-fermeture
    const delai = duree || this.config.duree;
    setTimeout(() => this.fermer(toast), delai);

    return toast;
  },

  // ---------- FERMER ----------
  fermer(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.remove("visible");        // glisse vers la sortie (transition CSS)
    setTimeout(() => toast.remove(), 300);
  },

  limiterVisibles() {
    const toasts = this.conteneur.querySelectorAll(".tilex-toast");
    if (toasts.length > this.config.maxVisible) this.fermer(toasts[0]);
  },

  // ---------- RACCOURCIS ----------
  success(m) { return this.show(m, "success"); },
  error(m)   { return this.show(m, "error"); },
  warning(m) { return this.show(m, "warning"); },
  info(m)    { return this.show(m, "info"); },

  // Alias rétro-compatible (ancienne API).
  afficher(m, type = "info", duree = null) { return this.show(m, type, duree); }
};

if (typeof window !== "undefined") {
  window.TilexToast = TilexToast;
  document.addEventListener("DOMContentLoaded", () => TilexToast.init());
}
