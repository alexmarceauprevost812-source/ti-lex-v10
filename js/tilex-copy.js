// js/tilex-copy.js
// Ajoute un bouton "Copier" sur tous les blocs de code du chat

const TilexCopy = {
  init() {
    document.querySelectorAll("pre code").forEach(bloc => {
      if (bloc.dataset.copyReady) return;
      bloc.dataset.copyReady = "true";

      const wrapper = bloc.closest("pre");
      wrapper.style.position = "relative";

      const btn = document.createElement("button");
      btn.className = "tilex-copy-btn";
      btn.textContent = "📋 Copier";
      btn.onclick = () => this.copier(bloc.textContent, btn);
      wrapper.appendChild(btn);
    });
  },

  copier(texte, btn) {
    navigator.clipboard.writeText(texte).then(() => {
      btn.textContent = "✓ Copié !";
      btn.classList.add("copied");
      if (window.TilexToast) TilexToast.success("Code copié dans le presse-papier");
      setTimeout(() => {
        btn.textContent = "📋 Copier";
        btn.classList.remove("copied");
      }, 2000);
    });
  }
};

window.TilexCopy = TilexCopy;
document.addEventListener("DOMContentLoaded", () => TilexCopy.init());
