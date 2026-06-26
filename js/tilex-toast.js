const TilexToast = {
  conteneur: null,
  init() { if (this.conteneur) return; this.conteneur = document.createElement("div"); this.conteneur.className = "tilex-toast-conteneur"; document.body.appendChild(this.conteneur); },
  afficher(message, type = "info", duree = 3000) {
    this.init();
    const c = { success: "#3ECF8E", error: "#F22F46", info: "#4285F4", warning: "#FBBC05" };
    const ic = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
    const palette = c[type] ? type : "info";
    const t = document.createElement("div");
    t.className = "tilex-toast"; t.style.borderLeft = `4px solid ${c[palette]}`;
    // 🔒 textContent (pas innerHTML) : le message peut venir d'une API/utilisateur → anti-XSS.
    const ico = document.createElement("span");
    ico.style.color = c[palette]; ico.style.fontWeight = "bold"; ico.textContent = ic[palette];
    const txt = document.createElement("span");
    txt.textContent = message;
    t.append(ico, txt);
    this.conteneur.appendChild(t);
    setTimeout(() => t.classList.add("visible"), 10);
    setTimeout(() => { t.classList.remove("visible"); setTimeout(() => t.remove(), 300); }, duree);
  },
  success(m){this.afficher(m,"success");}, error(m){this.afficher(m,"error");}, info(m){this.afficher(m,"info");}
};
window.TilexToast = TilexToast;
