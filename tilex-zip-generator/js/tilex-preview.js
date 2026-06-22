/* ============================================================
   ti-lex-AL v10 — tilex-preview.js
   Rôle : Aperçu du fichier généré (#previewContent / #previewSection)
   ============================================================ */

/* Toast partagé (sécurité si ce fichier est chargé en premier) */
window.showToast = window.showToast || function (message, type) {
  try {
    var t = document.getElementById("toast");
    if (!t) { console.log("[toast] " + message); return; }
    t.textContent = message;
    t.setAttribute("data-type", type || "info");
    t.classList.add("show");
    if (t._tilexTimer) clearTimeout(t._tilexTimer);
    t._tilexTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  } catch (e) { console.error(e); }
};

window.PreviewManager = {

  /* Fichier actuellement affiché, gardé pour copy() / download() */
  current: { filename: null, content: null },

  /* ----------  Affiche le contenu dans l'aperçu  ---------- */
  show: function (filename, content) {
    try {
      this.current = { filename: filename, content: content };

      var pre = document.getElementById("previewContent");
      var section = document.getElementById("previewSection");

      if (pre) {
        // textContent => pas d'injection HTML, le code s'affiche tel quel
        pre.textContent = content;
      }
      if (section) {
        section.style.display = "block";
        section.classList.add("active");
        // Petit scroll vers l'aperçu pour le rendre visible
        section.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (e) {
      console.error("Erreur preview show :", e);
      window.showToast("Erreur d'aperçu", "error");
    }
  },

  /* ----------  Cache la section d'aperçu  ---------- */
  hide: function () {
    try {
      var section = document.getElementById("previewSection");
      if (section) {
        section.style.display = "none";
        section.classList.remove("active");
      }
    } catch (e) {
      console.error("Erreur preview hide :", e);
    }
  },

  /* ----------  Copie le contenu dans le presse-papier  ---------- */
  copy: function () {
    try {
      if (!this.current.content) {
        window.showToast("Aucun aperçu à copier", "error");
        return;
      }
      var content = this.current.content;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(content).then(function () {
          window.showToast("Contenu copié", "success");
        }).catch(function () {
          window.PreviewManager._fallbackCopy(content);
        });
      } else {
        this._fallbackCopy(content);
      }
    } catch (e) {
      console.error("Erreur preview copy :", e);
      window.showToast("Erreur de copie", "error");
    }
  },

  /* Copie de secours pour navigateurs sans clipboard API */
  _fallbackCopy: function (text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      window.showToast("Contenu copié", "success");
    } catch (e) {
      window.showToast("Copie impossible", "error");
    }
  },

  /* ----------  Télécharge le fichier seul  ---------- */
  download: function () {
    try {
      if (!this.current.content) {
        window.showToast("Aucun fichier à télécharger", "error");
        return;
      }
      var blob = new Blob([this.current.content], { type: "text/plain;charset=utf-8" });
      var name = this.current.filename || "fichier.txt";

      // FileSaver si dispo, sinon lien temporaire
      if (typeof saveAs === "function") {
        saveAs(blob, name);
      } else {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      window.showToast("Téléchargé : " + name, "success");
    } catch (e) {
      console.error("Erreur preview download :", e);
      window.showToast("Erreur de téléchargement", "error");
    }
  }
};
