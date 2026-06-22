/* ============================================================
   ti-lex-AL v10 — tilex-share.js
   Rôle : Partage et export/import du projet (JSON)
   ============================================================ */

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

window.ShareManager = {

  /* ----------  Ouvre le modal de partage  ---------- */
  open: function () {
    try {
      var modal = document.getElementById("shareModal");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("active");
      }
      // Pré-remplit le champ lien avec l'URL courante
      var link = document.getElementById("shareLink");
      if (link && !link.value) link.value = window.location.href;
    } catch (e) {
      console.error("Erreur share open :", e);
    }
  },

  /* ----------  Ferme le modal de partage  ---------- */
  close: function () {
    try {
      var modal = document.getElementById("shareModal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    } catch (e) {
      console.error("Erreur share close :", e);
    }
  },

  /* ----------  Copie le lien (#shareLink)  ---------- */
  copy: function () {
    try {
      var link = document.getElementById("shareLink");
      var text = link ? link.value : window.location.href;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          window.showToast("Lien copié", "success");
        }).catch(function () {
          window.ShareManager._fallbackCopy(text);
        });
      } else {
        this._fallbackCopy(text);
      }
    } catch (e) {
      console.error("Erreur share copy :", e);
      window.showToast("Erreur de copie", "error");
    }
  },

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
      window.showToast("Lien copié", "success");
    } catch (e) {
      window.showToast("Copie impossible", "error");
    }
  },

  /* ----------  Exporte tous les fichiers ZIP en JSON  ---------- */
  exportJSON: function () {
    try {
      var files = (window.ZipManager && window.ZipManager.files) ? window.ZipManager.files : [];
      if (!files.length) {
        window.showToast("Aucun fichier à exporter", "error");
        return;
      }

      var data = {
        app: "ti-lex-AL v10",
        version: "1.0.0",
        date: new Date().toISOString(),
        files: files
      };

      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: "application/json;charset=utf-8" });
      var name = "tilex-export-" + Date.now() + ".json";

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

      window.showToast("Export JSON (" + files.length + " fichiers)", "success");

    } catch (e) {
      console.error("Erreur exportJSON :", e);
      window.showToast("Erreur d'export", "error");
    }
  },

  /* ----------  Importe un JSON et recharge les fichiers dans ZipManager  ----------
     Ouvre un sélecteur de fichier, lit le JSON, et réinjecte les fichiers. */
  importJSON: function () {
    try {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";

      input.addEventListener("change", function (ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var data = JSON.parse(e.target.result);
            var files = data.files || data; // tolère un tableau brut

            if (!Array.isArray(files)) {
              window.showToast("JSON invalide", "error");
              return;
            }

            if (!window.ZipManager) {
              window.showToast("ZipManager indisponible", "error");
              return;
            }

            files.forEach(function (f) {
              if (f && f.name) {
                window.ZipManager.add(f.name, f.content || "");
              }
            });

            window.showToast("Import réussi (" + files.length + " fichiers)", "success");

          } catch (parseErr) {
            console.error("Erreur parsing JSON :", parseErr);
            window.showToast("Fichier JSON illisible", "error");
          }
        };
        reader.onerror = function () {
          window.showToast("Erreur de lecture du fichier", "error");
        };
        reader.readAsText(file);
      });

      input.click();

    } catch (e) {
      console.error("Erreur importJSON :", e);
      window.showToast("Erreur d'import", "error");
    }
  }
};
