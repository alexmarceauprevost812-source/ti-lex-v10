const TilexToast = {
  conteneur: null,
  init() { if (this.conteneur) return; this.conteneur = document.createElement("div"); this.conteneur.className = "tilex-toast-conteneur"; document.body.appendChild(this.conteneur); },
  afficher(message, type = "info", duree = 3000) {
    this.init();
    const c = { success: "#3ECF8E", error: "#F22F46", info: "#4285F4", warning: "#FBBC05" };
    const ic = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
    const t = document.createElement("div");
    t.className = "tilex-toast"; t.style.borderLeft = `4px solid ${c[type]}`;
    t.innerHTML = `<span style="color:${c[type]};font-weight:bold">${ic[type]}</span><span>${message}</span>`;
    this.conteneur.appendChild(t);
    setTimeout(() => t.classList.add("visible"), 10);
    setTimeout(() => { t.classList.remove("visible"); setTimeout(() => t.remove(), 300); }, duree);
  },
  success(m){this.afficher(m,"success");}, error(m){this.afficher(m,"error");}, info(m){this.afficher(m,"info");}
};
window.TilexToast = TilexToast;
