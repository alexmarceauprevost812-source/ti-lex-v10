/* ============================================================
   ti-lex-AL v10 — tilex-templates.js
   Rôle : Templates de projets prêts à l'emploi (#templateSelect)
   Chaque template ajoute ses fichiers directement dans ZipManager
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

window.TemplateManager = {

  /* ----------  Définition des templates  ---------- */
  templates: {

    /* --- WEBAPP : index.html + style.css + app.js --- */
    webapp: [
      {
        name: "index.html",
        content:
          '<!DOCTYPE html>\n<html lang="fr" data-theme="dark">\n<head>\n' +
          '  <meta charset="UTF-8">\n' +
          '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
          '  <title>Mon App</title>\n' +
          '  <link rel="stylesheet" href="style.css">\n' +
          '</head>\n<body>\n' +
          '  <h1>Mon App</h1>\n' +
          '  <script src="app.js"></script>\n' +
          '</body>\n</html>\n'
      },
      {
        name: "style.css",
        content:
          ':root {\n  --noir: #0a0a0a;\n  --orange: #ff7f27;\n  --texte: #fff;\n}\n' +
          '* { margin: 0; padding: 0; box-sizing: border-box; }\n' +
          'body { background: var(--noir); color: var(--texte); font-family: system-ui, sans-serif; }\n'
      },
      {
        name: "app.js",
        content:
          '"use strict";\n' +
          'document.addEventListener("DOMContentLoaded", function () {\n' +
          '  console.log("App prête");\n});\n'
      }
    ],

    /* --- API : server.js + package.json + .env.example --- */
    api: [
      {
        name: "server.js",
        content:
          'const express = require("express");\n' +
          'const app = express();\n' +
          'app.use(express.json());\n\n' +
          'app.get("/", (req, res) => res.json({ ok: true }));\n\n' +
          'const PORT = process.env.PORT || 3000;\n' +
          'app.listen(PORT, () => console.log("API sur le port " + PORT));\n'
      },
      {
        name: "package.json",
        content: JSON.stringify({
          name: "mon-api",
          version: "1.0.0",
          main: "server.js",
          scripts: { start: "node server.js" },
          dependencies: { express: "^4.19.2" }
        }, null, 2) + "\n"
      },
      {
        name: ".env.example",
        content: "PORT=3000\nDATABASE_URL=\nAPI_KEY=\n"
      }
    ],

    /* --- SUPABASE : schema.sql + config.js + README.md --- */
    supabase: [
      {
        name: "schema.sql",
        content:
          'create table if not exists public.items (\n' +
          '  id uuid primary key default gen_random_uuid(),\n' +
          '  nom text not null,\n' +
          '  user_id uuid references auth.users(id),\n' +
          '  created_at timestamptz default now()\n' +
          ');\n\n' +
          'alter table public.items enable row level security;\n\n' +
          'create policy "items_select_own" on public.items\n' +
          '  for select using (auth.uid() = user_id);\n'
      },
      {
        name: "config.js",
        content:
          'const SUPABASE_URL = "https://rnuripmfozlxenryxhdc.supabase.co";\n' +
          'const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON";\n' +
          'const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);\n'
      },
      {
        name: "README.md",
        content:
          '# Projet Supabase\n\n' +
          '> Produit du Québec — ti-lex-AL v10\n\n' +
          '## Installation\n\n1. Exécuter `schema.sql` dans Supabase\n2. Remplir la clé anon dans `config.js`\n'
      }
    ],

    /* --- PYTHON : main.py + requirements.txt + README.md --- */
    python: [
      {
        name: "main.py",
        content:
          '#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\n' +
          '"""Point d\'entrée du projet."""\n\n\n' +
          'def main():\n    print("ti-lex-AL v10")\n\n\n' +
          'if __name__ == "__main__":\n    main()\n'
      },
      {
        name: "requirements.txt",
        content: "requests>=2.31.0\n"
      },
      {
        name: "README.md",
        content:
          '# Projet Python\n\n> Produit du Québec — ti-lex-AL v10\n\n' +
          '## Lancer\n\n```bash\npip install -r requirements.txt\npython main.py\n```\n'
      }
    ],

    /* --- TILEX : structure complète ti-lex-AL v10 --- */
    tilex: [
      {
        name: "index.html",
        content:
          '<!DOCTYPE html>\n<html lang="fr" data-theme="dark">\n<head>\n' +
          '  <meta charset="UTF-8">\n' +
          '  <title>ti-lex-AL v10</title>\n' +
          '  <link rel="stylesheet" href="css/tilex.css">\n' +
          '</head>\n<body>\n' +
          '  <h1>ti-lex-AL v10</h1>\n' +
          '  <div id="toast"></div>\n' +
          '  <script src="js/tilex-core.js"></script>\n' +
          '</body>\n</html>\n'
      },
      {
        name: "css/tilex.css",
        content:
          ':root {\n  --noir: #0a0a0a;\n  --orange: #ff7f27;\n  --or: #ffcf4a;\n' +
          '  --vert: #37e0a0;\n  --bordure: #23232c;\n  --texte: #fff;\n}\n' +
          'body { background: var(--noir); color: var(--texte); font-family: system-ui, sans-serif; }\n'
      },
      {
        name: "js/tilex-core.js",
        content: '/* Cœur ti-lex-AL v10 — à compléter */\nconsole.log("ti-lex prêt");\n'
      },
      {
        name: "README.md",
        content:
          '# ti-lex-AL v10\n\n> Produit du Québec — plateforme IA de cybersécurité défensive\n\n' +
          '## Stack\n\n- Vanilla JS\n- Supabase\n- Vercel\n'
      }
    ]
  },

  /* ----------  Charge le template sélectionné dans ZipManager  ---------- */
  load: function () {
    try {
      var select = document.getElementById("templateSelect");
      if (!select) {
        window.showToast("Sélecteur de template introuvable", "error");
        return;
      }

      var key = select.value;
      var tpl = this.templates[key];

      if (!tpl) {
        window.showToast("Template inconnu : " + key, "error");
        return;
      }

      if (!window.ZipManager || typeof window.ZipManager.add !== "function") {
        window.showToast("ZipManager indisponible", "error");
        return;
      }

      tpl.forEach(function (file) {
        window.ZipManager.add(file.name, file.content);
      });

      window.showToast("Template « " + key + " » chargé (" + tpl.length + " fichiers)", "success");

    } catch (e) {
      console.error("Erreur template load :", e);
      window.showToast("Erreur chargement template", "error");
    }
  }
};
