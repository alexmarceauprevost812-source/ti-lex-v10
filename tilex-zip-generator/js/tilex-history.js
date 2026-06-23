/* ============================================================
   ti-lex-AL v10 — tilex-history.js
   Rôle : Historique des fichiers créés (Supabase — table zip_historique)
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

window.HistoryManager = {

  /* ----------  Configuration Supabase  ----------
     Le projet ti-lex : rnuripmfozlxenryxhdc
     ⚠️ Remplace SUPABASE_ANON_KEY par ta vraie clé anon (publique, sans risque). */
  SUPABASE_URL: window.SB_URL || "https://rnuripmfozlxenryxhdc.supabase.co",
  SUPABASE_ANON_KEY: window.SB_ANON || "",

  _client: null,

  /* Récupère (ou crée) le client Supabase.
     Réutilise un client global existant si index.html en a déjà créé un. */
  _getClient: function () {
    try {
      // 1) Un client déjà partagé dans la page ?
      if (window.supabaseClient) return window.supabaseClient;
      if (window.tilexSupabase) return window.tilexSupabase;

      // 2) Sinon on en crée un si la librairie est chargée
      if (this._client) return this._client;

      if (window.supabase && typeof window.supabase.createClient === "function") {
        this._client = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY);
        return this._client;
      }

      return null; // librairie absente
    } catch (e) {
      console.error("Erreur client Supabase :", e);
      return null;
    }
  },

  /* ----------  Ouvre le modal historique  ---------- */
  open: function () {
    try {
      var modal = document.getElementById("historyModal");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("active");
      }
      this.load(); // recharge à chaque ouverture
    } catch (e) {
      console.error("Erreur history open :", e);
    }
  },

  /* ----------  Ferme le modal historique  ---------- */
  close: function () {
    try {
      var modal = document.getElementById("historyModal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    } catch (e) {
      console.error("Erreur history close :", e);
    }
  },

  /* ----------  Ajoute une entrée dans Supabase  ---------- */
  add: function (filename, type, content) {
    try {
      var client = this._getClient();
      if (!client) {
        // Pas de Supabase => on échoue silencieusement (la génération continue)
        console.warn("Supabase indisponible — historique non sauvegardé");
        return;
      }

      // user_id récupéré si une session existe (sinon null)
      client.auth.getUser().then(function (res) {
        var uid = (res && res.data && res.data.user) ? res.data.user.id : null;

        client.from("zip_historique").insert([{
          nom_fichier: filename,
          type_fichier: type,
          contenu: content,
          user_id: uid
        }]).then(function (r) {
          if (r.error) {
            console.error("Erreur insert historique :", r.error);
          }
        });
      }).catch(function (err) {
        console.error("Erreur getUser :", err);
      });

    } catch (e) {
      console.error("Erreur history add :", e);
    }
  },

  /* ----------  Charge et affiche l'historique  ---------- */
  load: function () {
    try {
      var list = document.getElementById("historyList");
      if (list) list.innerHTML = '<div class="history-loading">Chargement…</div>';

      var client = this._getClient();
      if (!client) {
        if (list) list.innerHTML = '<div class="history-empty">Supabase non configuré</div>';
        return;
      }

      client.from("zip_historique")
        .select("*")
        .order("date_creation", { ascending: false })
        .limit(50)
        .then(function (res) {
          if (res.error) {
            console.error("Erreur load historique :", res.error);
            if (list) list.innerHTML = '<div class="history-empty">Erreur de chargement</div>';
            return;
          }
          window.HistoryManager._render(res.data || []);
        });

    } catch (e) {
      console.error("Erreur history load :", e);
    }
  },

  /* ----------  Rendu de la liste dans #historyList  ---------- */
  _render: function (rows) {
    try {
      var list = document.getElementById("historyList");
      if (!list) return;

      list.innerHTML = "";

      if (!rows.length) {
        list.innerHTML = '<div class="history-empty">Aucun fichier dans l\'historique</div>';
        return;
      }

      rows.forEach(function (row) {
        var item = document.createElement("div");
        item.className = "history-item";

        var nom = document.createElement("span");
        nom.className = "history-nom";
        nom.textContent = row.nom_fichier || "(sans nom)";

        var meta = document.createElement("span");
        meta.className = "history-meta";
        var date = row.date_creation ? new Date(row.date_creation).toLocaleString("fr-CA") : "";
        meta.textContent = (row.type_fichier || "") + " · " + date;

        // Bouton pour réutiliser le contenu (renvoie vers l'aperçu)
        var reuse = document.createElement("button");
        reuse.type = "button";
        reuse.className = "history-reuse";
        reuse.textContent = "↺";
        reuse.title = "Réafficher";
        reuse.addEventListener("click", function () {
          if (window.PreviewManager) {
            window.PreviewManager.show(row.nom_fichier, row.contenu || "");
          }
        });

        item.appendChild(nom);
        item.appendChild(meta);
        item.appendChild(reuse);
        list.appendChild(item);
      });
    } catch (e) {
      console.error("Erreur history render :", e);
    }
  },

  /* ----------  Efface tout l'historique  ---------- */
  clear: function () {
    try {
      var client = this._getClient();
      if (!client) {
        window.showToast("Supabase non configuré", "error");
        return;
      }

      if (!confirm("Effacer tout l'historique ?")) return;

      // Supprime toutes les lignes de l'utilisateur (RLS limite déjà au user courant)
      client.from("zip_historique")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000")
        .then(function (res) {
          if (res.error) {
            console.error("Erreur clear historique :", res.error);
            window.showToast("Erreur d'effacement", "error");
            return;
          }
          window.showToast("Historique effacé", "success");
          window.HistoryManager.load();
        });

    } catch (e) {
      console.error("Erreur history clear :", e);
      window.showToast("Erreur d'effacement", "error");
    }
  }
};
