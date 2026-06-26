// ============================================
// tilex-studio-auto.js — Studio Auto-Inject (module séparé)
// Ti-lex-AL v10 — Alex Marceau-Prévost
// 🔒 SÉCURITÉ NIVEAU 3 :
//   - iframe sandbox="allow-scripts" UNIQUEMENT (origine opaque) → l'aperçu
//     ne peut PAS atteindre cookies/session/localStorage/DOM de l'app.
//   - rendu via srcdoc (pas de doc.write same-origin).
//   - injection sur CLIC utilisateur (jamais automatique/silencieuse).
//   - plafond de taille + IDs préfixés "tsa-" (zéro collision avec TilexStudio).
//   N'écrase PAS le Studio existant (global distinct : window.TilexStudioAuto).
// ============================================
(function () {
  "use strict";

  const MAX_CODE = 500000; // 500 Ko max par aperçu

  const TilexStudioAuto = {
    iframe: null,
    imageFond: null,
    dernierCode: "",
    _candidat: "",

    init() {
      if (document.getElementById("tsa-studio")) return; // déjà initialisé
      this.creerPanneau();
      this.ecouterMessages();
      console.log("🎬 TilexStudioAuto (sandbox lvl 3) ON");
    },

    creerPanneau() {
      const studio = document.createElement("div");
      studio.id = "tsa-studio";
      studio.innerHTML =
        '<div id="tsa-header">' +
          '<span>🎬 Studio Auto</span>' +
          '<div id="tsa-actions">' +
            '<button id="tsa-btn-dl" title="Télécharger index.html">📂 Télécharger</button>' +
            '<button id="tsa-btn-close" title="Fermer">✕</button>' +
          '</div>' +
        '</div>' +
        '<div id="tsa-body">' +
          // 🔒 sandbox = allow-scripts SEULEMENT (origine opaque, isolé de l'app)
          '<iframe id="tsa-iframe" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Aperçu Studio"></iframe>' +
        '</div>';
      document.body.appendChild(studio);

      const style = document.createElement("style");
      style.textContent = [
        "#tsa-studio{position:fixed;top:0;right:-55%;width:50%;height:100vh;background:#0d0d0d;",
        "border-left:2px solid #a855f7;box-shadow:-8px 0 40px rgba(168,85,247,.3);z-index:9999;",
        "display:flex;flex-direction:column;transition:right .4s cubic-bezier(.4,0,.2,1);",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
        "#tsa-studio.ouvert{right:0;}",
        "#tsa-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;",
        "background:#1a1a2e;border-bottom:1px solid #a855f7;color:#a855f7;font-weight:700;font-size:14px;flex-shrink:0;}",
        "#tsa-actions{display:flex;gap:8px;}",
        "#tsa-btn-dl{background:#a855f7;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;}",
        "#tsa-btn-dl:hover{background:#9333ea;}",
        "#tsa-btn-close{background:transparent;color:#888;border:1px solid #333;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;}",
        "#tsa-btn-close:hover{color:#fff;border-color:#666;}",
        "#tsa-body{flex:1;overflow:hidden;position:relative;}",
        "#tsa-iframe{width:100%;height:100%;border:none;background:#fff;}",
        "#tsa-open{position:fixed;bottom:24px;right:24px;background:linear-gradient(135deg,#a855f7,#6366f1);",
        "color:#fff;border:0;padding:14px 20px;border-radius:50px;cursor:pointer;font-size:14px;font-weight:700;",
        "box-shadow:0 4px 20px rgba(168,85,247,.5);z-index:9998;transition:transform .2s,box-shadow .2s;display:none;}",
        "#tsa-open:hover{transform:translateY(-2px);box-shadow:0 6px 30px rgba(168,85,247,.7);}",
        "#tsa-open.visible{display:flex;align-items:center;gap:8px;}",
        "@media(max-width:768px){#tsa-studio{width:100%;right:-105%;}#tsa-studio.ouvert{right:0;}#tsa-open{bottom:80px;right:16px;}}",
      ].join("");
      document.head.appendChild(style);

      const open = document.createElement("button");
      open.id = "tsa-open";
      open.innerHTML = "🎬 Voir dans Studio";
      document.body.appendChild(open);

      this.iframe = document.getElementById("tsa-iframe");
      document.getElementById("tsa-btn-close").addEventListener("click", () => this.fermer());
      document.getElementById("tsa-btn-dl").addEventListener("click", () => this.telecharger());
      // 🔒 Clic utilisateur = injecte le dernier candidat détecté (jamais auto).
      open.addEventListener("click", () => {
        if (this._candidat) this.injecter(this._candidat);
        else this.ouvrir();
        open.classList.remove("visible"); // le bouton disparaît après le clic
      });
    },

    // Injection EXPLICITE (appelée sur clic) — srcdoc dans iframe sandbox opaque.
    injecter(html, imageFond) {
      html = String(html == null ? "" : html).slice(0, MAX_CODE);
      this.dernierCode = html;
      const src = imageFond || this.imageFond;
      const finalHtml = src ? this.injecterImageFond(html, src) : html;
      this.iframe.removeAttribute("src");
      this.iframe.srcdoc = finalHtml; // isolé : origine opaque (pas allow-same-origin)
      this.ouvrir();
      console.log("✅ Aperçu Studio injecté (sandbox opaque)");
    },

    injecterImageFond(html, imageSrc) {
      const stylesFond =
        "<style>body{position:relative;min-height:100vh;}" +
        "body::before{content:'';position:fixed;top:0;left:0;width:100%;height:100%;" +
        "background-image:url('" + String(imageSrc).replace(/'/g, "%27") + "');background-size:cover;" +
        "background-position:center;background-repeat:no-repeat;opacity:.3;z-index:0;pointer-events:none;}" +
        "body>*{position:relative;z-index:1;}</style>";
      if (html.includes("</head>")) return html.replace("</head>", stylesFond + "</head>");
      if (html.includes("<body")) return html.replace("<body", stylesFond + "<body");
      return stylesFond + html;
    },

    chargerImage(fichier) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => { this.imageFond = e.target.result; resolve(e.target.result); };
        reader.readAsDataURL(fichier);
      });
    },

    ouvrir() {
      const el = document.getElementById("tsa-studio");
      if (el) el.classList.add("ouvert");
    },
    fermer() {
      const el = document.getElementById("tsa-studio");
      if (el) el.classList.remove("ouvert");
    },

    telecharger(nom = "index.html") {
      if (!this.dernierCode) { alert("Aucun code à télécharger — génère quelque chose d'abord !"); return; }
      const h = this.imageFond ? this.injecterImageFond(this.dernierCode, this.imageFond) : this.dernierCode;
      if (window.TilexExport && typeof window.TilexExport.html === "function") {
        window.TilexExport.html(h, nom);
      } else {
        const url = URL.createObjectURL(new Blob([h], { type: "text/html;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url; a.download = nom; document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }
    },

    // 🔒 Détecte du HTML généré dans le chat → AFFICHE le bouton (pas d'injection auto).
    ecouterMessages() {
      const estHtml = (t) =>
        t && (t.includes("<!DOCTYPE") || t.includes("<html") || t.includes("<body") || t.includes("<div"));
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
          m.addedNodes.forEach((node) => {
            if (node.nodeType !== 1) return;
            const blocs = node.querySelectorAll ? node.querySelectorAll("pre code, .code-block, pre") : [];
            blocs.forEach((bloc) => {
              const contenu = bloc.textContent || "";
              if (estHtml(contenu)) {
                this._candidat = contenu; // mémorise, n'injecte PAS tout seul
                const btn = document.getElementById("tsa-open");
                if (btn) btn.classList.add("visible");
              }
            });
          });
        });
      });
      const chat = document.querySelector("#chat-msgs, #chat-messages, .chat-msgs, .messages, #messages, main");
      if (chat) {
        observer.observe(chat, { childList: true, subtree: true });
        console.log("👁️ Studio Auto écoute le chat (bouton sur détection, injection sur clic).");
      }
    },
  };

  window.TilexStudioAuto = TilexStudioAuto;
  document.addEventListener("DOMContentLoaded", () => TilexStudioAuto.init());
})();
