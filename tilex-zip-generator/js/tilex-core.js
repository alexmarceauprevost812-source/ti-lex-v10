/* ============================================================
   ti-lex-AL v10 — tilex-core.js
   Rôle : Génération du contenu de fichier selon le type choisi
   Vanilla JS pur — aucune dépendance import/export
   ============================================================ */

/* ----------  Toast partagé (défini une seule fois)  ---------- */
/* Chaque module est indépendant : le premier chargé définit le toast,
   les autres réutilisent la même fonction sans conflit. */
window.showToast = window.showToast || function (message, type) {
  try {
    type = type || "info";
    var toast = document.getElementById("toast");
    if (!toast) {
      // Sécurité : si le #toast n'existe pas dans le DOM, on log au lieu de planter
      console.log("[ti-lex][toast][" + type + "] " + message);
      return;
    }
    toast.textContent = message;
    toast.setAttribute("data-type", type); // dark/light styling via CSS
    toast.classList.add("show");
    // On nettoie un éventuel timer précédent
    if (toast._tilexTimer) clearTimeout(toast._tilexTimer);
    toast._tilexTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2600);
  } catch (e) {
    console.error("Erreur showToast :", e);
  }
};

/* ----------  CoreManager  ---------- */
window.CoreManager = {

  /* Dernier fichier généré, gardé en mémoire pour addToZip() */
  lastFile: null,

  /* ----------  Templates de contenu par type de fichier  ---------- */
  _builders: {
    html: function (name, desc) {
      return '<!DOCTYPE html>\n' +
        '<html lang="fr" data-theme="dark">\n' +
        '<head>\n' +
        '  <meta charset="UTF-8">\n' +
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '  <title>' + (name || "ti-lex") + '</title>\n' +
        '  <!-- ' + (desc || "Généré par ti-lex-AL v10") + ' -->\n' +
        '</head>\n' +
        '<body>\n' +
        '  <h1>' + (name || "ti-lex") + '</h1>\n' +
        '  <p>' + (desc || "Produit du Québec — ti-lex-AL v10") + '</p>\n' +
        '</body>\n' +
        '</html>\n';
    },

    css: function (name, desc) {
      return '/* ' + (name || "styles") + ' — ' + (desc || "ti-lex-AL v10") + ' */\n' +
        ':root {\n' +
        '  --noir: #0a0a0a;\n' +
        '  --orange: #ff7f27;\n' +
        '  --or: #ffcf4a;\n' +
        '  --vert: #37e0a0;\n' +
        '  --bordure: #23232c;\n' +
        '  --texte: #ffffff;\n' +
        '}\n\n' +
        '* { margin: 0; padding: 0; box-sizing: border-box; }\n\n' +
        'body {\n' +
        '  background: var(--noir);\n' +
        '  color: var(--texte);\n' +
        '  font-family: system-ui, sans-serif;\n' +
        '}\n';
    },

    js: function (name, desc) {
      var safe = (name || "module").replace(/[^a-zA-Z0-9_]/g, "_");
      return '/* ' + (name || "module") + ' — ' + (desc || "ti-lex-AL v10") + ' */\n' +
        '(function () {\n' +
        '  "use strict";\n\n' +
        '  // ' + (desc || "Logique du module") + '\n' +
        '  window.' + safe + ' = {\n' +
        '    init: function () {\n' +
        '      console.log("' + safe + ' initialisé");\n' +
        '    }\n' +
        '  };\n\n' +
        '  document.addEventListener("DOMContentLoaded", function () {\n' +
        '    window.' + safe + '.init();\n' +
        '  });\n' +
        '})();\n';
    },

    md: function (name, desc) {
      return '# ' + (name || "Document") + '\n\n' +
        '> ' + (desc || "Généré par ti-lex-AL v10 — Produit du Québec") + '\n\n' +
        '## Description\n\n' +
        (desc || "À compléter.") + '\n\n' +
        '## Notes\n\n' +
        '- \n';
    },

    json: function (name, desc) {
      var obj = {
        nom: name || "ti-lex",
        description: desc || "Généré par ti-lex-AL v10",
        version: "1.0.0",
        date: new Date().toISOString()
      };
      return JSON.stringify(obj, null, 2) + "\n";
    },

    py: function (name, desc) {
      return '#!/usr/bin/env python3\n' +
        '# -*- coding: utf-8 -*-\n' +
        '"""' + (name || "script") + ' — ' + (desc || "ti-lex-AL v10") + '"""\n\n\n' +
        'def main():\n' +
        '    # ' + (desc || "Logique principale") + '\n' +
        '    print("ti-lex-AL v10")\n\n\n' +
        'if __name__ == "__main__":\n' +
        '    main()\n';
    },

    sql: function (name, desc) {
      var table = (name || "ma_table").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
      return '-- ' + (name || "table") + ' — ' + (desc || "ti-lex-AL v10") + '\n' +
        'create table if not exists public.' + table + ' (\n' +
        '  id uuid primary key default gen_random_uuid(),\n' +
        '  created_at timestamptz default now()\n' +
        ');\n\n' +
        'alter table public.' + table + ' enable row level security;\n';
    }
  },

  /* ----------  Génère le fichier selon les champs du formulaire  ---------- */
  generateFile: function () {
    try {
      var nameEl = document.getElementById("fileName");
      var typeEl = document.getElementById("fileType");
      var descEl = document.getElementById("fileDescription");

      var rawName = nameEl ? nameEl.value.trim() : "";
      var type = typeEl ? typeEl.value.trim().toLowerCase() : "txt";
      var desc = descEl ? descEl.value.trim() : "";

      if (!rawName) {
        window.showToast("Entre un nom de fichier", "error");
        return null;
      }

      // On retire une extension déjà présente pour éviter "fichier.js.js"
      var baseName = rawName.replace(/\.[a-zA-Z0-9]+$/, "");
      var filename = baseName + "." + type;

      // Choix du générateur, fallback texte simple
      var builder = this._builders[type];
      var content = builder
        ? builder(baseName, desc)
        : (desc || baseName) + "\n";

      // On garde en mémoire pour addToZip()
      this.lastFile = { name: filename, type: type, content: content };

      // Aperçu
      if (window.PreviewManager && typeof window.PreviewManager.show === "function") {
        window.PreviewManager.show(filename, content);
      }

      // Historique Supabase
      if (window.HistoryManager && typeof window.HistoryManager.add === "function") {
        window.HistoryManager.add(filename, type, content);
      }

      window.showToast("Fichier généré : " + filename, "success");
      return this.lastFile;

    } catch (e) {
      console.error("Erreur generateFile :", e);
      window.showToast("Erreur lors de la génération", "error");
      return null;
    }
  },

  /* ----------  Ajoute le dernier fichier généré au ZIP  ---------- */
  addToZip: function () {
    try {
      if (!this.lastFile) {
        window.showToast("Génère d'abord un fichier", "error");
        return;
      }
      if (window.ZipManager && typeof window.ZipManager.add === "function") {
        window.ZipManager.add(this.lastFile.name, this.lastFile.content);
        window.showToast("Ajouté au ZIP : " + this.lastFile.name, "success");
      } else {
        window.showToast("ZipManager indisponible", "error");
      }
    } catch (e) {
      console.error("Erreur addToZip :", e);
      window.showToast("Erreur ajout au ZIP", "error");
    }
  }
};
