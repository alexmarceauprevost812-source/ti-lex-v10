/* ============================================================
   ti-lex-AL v10 — tilex-zip.js
   Rôle : Gestion complète du ZIP (JSZip + FileSaver)
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

window.ZipManager = {

  /* Tableau des fichiers ajoutés : { name, content } */
  files: [],

  /* ----------  Ajoute un fichier au ZIP  ---------- */
  add: function (filename, content) {
    try {
      if (!filename) {
        window.showToast("Nom de fichier manquant", "error");
        return;
      }
      // Si un fichier du même nom existe déjà, on le remplace
      var existing = this.files.findIndex(function (f) { return f.name === filename; });
      if (existing !== -1) {
        this.files[existing].content = content || "";
        window.showToast("Fichier remplacé : " + filename, "info");
      } else {
        this.files.push({ name: filename, content: content || "" });
      }
      this._render();
    } catch (e) {
      console.error("Erreur zip add :", e);
      window.showToast("Erreur ajout ZIP", "error");
    }
  },

  /* ----------  Retire un fichier par index  ---------- */
  remove: function (index) {
    try {
      if (index >= 0 && index < this.files.length) {
        var removed = this.files.splice(index, 1)[0];
        this._render();
        window.showToast("Retiré : " + removed.name, "info");
      }
    } catch (e) {
      console.error("Erreur zip remove :", e);
      window.showToast("Erreur retrait", "error");
    }
  },

  /* ----------  Vide la liste  ---------- */
  clear: function () {
    try {
      this.files = [];
      this._render();
      window.showToast("Liste ZIP vidée", "info");
    } catch (e) {
      console.error("Erreur zip clear :", e);
    }
  },

  /* ----------  Génère et télécharge le ZIP  ---------- */
  download: function () {
    try {
      if (this.files.length === 0) {
        window.showToast("Aucun fichier dans le ZIP", "error");
        return;
      }
      if (typeof JSZip === "undefined") {
        window.showToast("JSZip non chargé", "error");
        return;
      }

      var zip = new JSZip();
      this.files.forEach(function (f) {
        zip.file(f.name, f.content);
      });

      window.showToast("Génération du ZIP…", "info");

      zip.generateAsync({ type: "blob" }).then(function (blob) {
        var name = "tilex-projet-" + Date.now() + ".zip";
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
        window.showToast("ZIP téléchargé (" + window.ZipManager.files.length + " fichiers)", "success");
      }).catch(function (err) {
        console.error("Erreur génération ZIP :", err);
        window.showToast("Erreur génération ZIP", "error");
      });

    } catch (e) {
      console.error("Erreur zip download :", e);
      window.showToast("Erreur ZIP", "error");
    }
  },

  /* ----------  Ouvre le modal d'aperçu du ZIP  ---------- */
  preview: function () {
    try {
      this._render();
      var modal = document.getElementById("zipPreviewModal");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("active");
      }
    } catch (e) {
      console.error("Erreur zip preview :", e);
    }
  },

  /* ----------  Ferme le modal d'aperçu  ---------- */
  closePreview: function () {
    try {
      var modal = document.getElementById("zipPreviewModal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    } catch (e) {
      console.error("Erreur zip closePreview :", e);
    }
  },

  /* ----------  Met à jour #zipFileList dans le DOM  ---------- */
  _render: function () {
    try {
      var list = document.getElementById("zipFileList");
      if (!list) return;

      list.innerHTML = "";

      if (this.files.length === 0) {
        var vide = document.createElement("div");
        vide.className = "zip-empty";
        vide.textContent = "Aucun fichier ajouté";
        list.appendChild(vide);
        return;
      }

      this.files.forEach(function (f, i) {
        var row = document.createElement("div");
        row.className = "zip-file-item";

        var nameSpan = document.createElement("span");
        nameSpan.className = "zip-file-name";
        nameSpan.textContent = f.name;

        var sizeSpan = document.createElement("span");
        sizeSpan.className = "zip-file-size";
        sizeSpan.textContent = (new Blob([f.content]).size) + " o";

        var del = document.createElement("button");
        del.className = "zip-file-del";
        del.type = "button";
        del.textContent = "🗑️";
        del.title = "Retirer ce fichier";
        // Closure sur l'index courant
        del.addEventListener("click", function () {
          window.ZipManager.remove(i);
        });

        row.appendChild(nameSpan);
        row.appendChild(sizeSpan);
        row.appendChild(del);
        list.appendChild(row);
      });
    } catch (e) {
      console.error("Erreur zip render :", e);
    }
  }
};

/* Premier rendu au chargement */
document.addEventListener("DOMContentLoaded", function () {
  if (window.ZipManager && typeof window.ZipManager._render === "function") {
    window.ZipManager._render();
  }
});
