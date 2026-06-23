const TilexPush = {
  pousser(nomFichier, contenu) {
    navigator.clipboard.writeText(`// === ${nomFichier} ===\n${contenu}`)
      .then(() => { if (window.TilexToast) TilexToast.success(`📤 ${nomFichier} prêt pour ti-lex-code`); })
      .catch(() => { if (window.TilexToast) TilexToast.error("Échec copie"); });
  },
  init() {
    document.querySelectorAll("pre code").forEach((bloc, i) => {
      if (bloc.dataset.pushReady) return;
      bloc.dataset.pushReady = "true";
      const w = bloc.closest("pre"); w.style.position = "relative";
      const btn = document.createElement("button");
      btn.className = "tilex-push-btn"; btn.textContent = "📤 Pousser";
      btn.onclick = () => this.pousser(`fichier-${i}.js`, bloc.textContent);
      w.appendChild(btn);
    });
  }
};
window.TilexPush = TilexPush;
document.addEventListener("DOMContentLoaded", () => TilexPush.init());
