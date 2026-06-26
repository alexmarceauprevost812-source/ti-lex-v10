/* ============================================================
   ti-lex-AL v10 — js/tilex-image.js
   Rôle : interface de génération d'image (texte/joual -> image).
   Appelle la fonction Edge `tilex-image` (Claude + moteur image).

   Style ti-lex : vanilla JS pur, AUCUN import/export,
   global sur window, try/catch partout, commentaires en français.
   ============================================================ */

/* ----------  Toast partagé (chaîne de priorité)  ---------- */
window.tilexToast = window.tilexToast || function (message, type) {
  try {
    if (window.TilexToast && typeof window.TilexToast.show === "function") {
      window.TilexToast.show(message, type);
    } else if (typeof window.showToast === "function") {
      window.showToast(message, type);
    } else {
      console.log("[ti-lex:" + (type || "info") + "] " + message);
    }
  } catch (e) {
    console.log("[ti-lex] " + message);
  }
};

window.TilexImageManager = {

  config: {
    // À adapter : URL de ta fonction Edge.
    endpoint: "",                 // ex: https://rnuripmfozlxenryxhdc.supabase.co/functions/v1/tilex-image
    cleAnon: "",                  // clé publique sb_publishable_* (publique par design)
    tailleDefaut: "1024x1024",
    qualiteDefaut: "medium",
  },

  enCours: false,
  derniereImage: null,            // { base64 | url, prompt }

  // ============================================================
  // 1. INITIALISATION
  //    formSelector  : conteneur avec #tilex-img-idee, #tilex-img-taille,
  //                    #tilex-img-qualite, #tilex-img-go
  //    resultSelector: conteneur où afficher l'image
  // ============================================================
  init(formSelector, resultSelector, options) {
    try {
      this.formEl = document.querySelector(formSelector);
      this.resultEl = document.querySelector(resultSelector);

      if (options) Object.assign(this.config, options);

      if (!this.formEl || !this.resultEl) {
        console.error("TilexImageManager: conteneur(s) introuvable(s)");
        return;
      }

      const bouton = this.formEl.querySelector("#tilex-img-go");
      if (bouton) {
        bouton.addEventListener("click", () => this.genererImage());
      }

      // Entrée clavier dans le champ d'idée = générer
      const idee = this.formEl.querySelector("#tilex-img-idee");
      if (idee) {
        idee.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) this.genererImage();
        });
      }

      console.log("🎨 TilexImageManager initialisé");
    } catch (err) {
      console.error("TilexImageManager init erreur:", err.message);
    }
  },

  // ============================================================
  // 2. GÉNÉRER UNE IMAGE
  // ============================================================
  async genererImage() {
    if (this.enCours) return;

    try {
      const ideeEl = this.formEl.querySelector("#tilex-img-idee");
      const idee = (ideeEl ? ideeEl.value : "").trim();

      if (!idee) {
        window.tilexToast("Écris-moi ton idée d'image", "attention");
        return;
      }
      if (!this.config.endpoint) {
        window.tilexToast("Endpoint non configuré", "erreur");
        return;
      }

      const tailleEl = this.formEl.querySelector("#tilex-img-taille");
      const qualiteEl = this.formEl.querySelector("#tilex-img-qualite");
      const taille = (tailleEl && tailleEl.value) || this.config.tailleDefaut;
      const qualite = (qualiteEl && qualiteEl.value) || this.config.qualiteDefaut;

      this.enCours = true;
      this.afficherChargement();

      const data = await this.appelerEdge({ idee, taille, qualite });

      if (!data || data.erreur) {
        throw new Error(data && data.erreur ? data.erreur : "Réponse vide");
      }

      this.derniereImage = {
        base64: data.image_base64 || null,
        url: data.image_url || null,
        prompt: data.prompt_utilise || idee,
      };

      this.afficherImage(this.derniereImage);
      window.tilexToast("Image générée", "succes");

    } catch (err) {
      console.error("TilexImageManager genererImage:", err.message);
      this.afficherErreur(err.message);
      window.tilexToast("Échec de la génération", "erreur");
    } finally {
      this.enCours = false;
    }
  },

  // ============================================================
  // 3. APPEL À LA FONCTION EDGE
  // ============================================================
  async appelerEdge(charge) {
    try {
      const jeton = await this.obtenirJeton();
      const entetes = { "Content-Type": "application/json" };
      if (this.config.cleAnon) entetes["apikey"] = this.config.cleAnon;
      if (jeton) entetes["Authorization"] = "Bearer " + jeton;

      const reponse = await fetch(this.config.endpoint, {
        method: "POST",
        headers: entetes,
        body: JSON.stringify({ ...charge, raffiner: true }),
      });

      return await reponse.json();
    } catch (err) {
      console.error("TilexImageManager appelerEdge:", err.message);
      return { erreur: "Connexion au serveur impossible" };
    }
  },

  // ============================================================
  // 4. RÉCUPÉRER LE JETON DE SESSION (Supabase Auth)
  // ============================================================
  async obtenirJeton() {
    try {
      if (window.supabase && window.supabase.auth) {
        const { data } = await window.supabase.auth.getSession();
        return data && data.session ? data.session.access_token : null;
      }
      // Repli : clé anon (la fonction valide quand même via getUser)
      return this.config.cleAnon || null;
    } catch (err) {
      console.error("TilexImageManager obtenirJeton:", err.message);
      return null;
    }
  },

  // ============================================================
  // 5. AFFICHAGE
  // ============================================================
  afficherChargement() {
    try {
      this.resultEl.innerHTML =
        '<div class="tilex-img-chargement">🎨 ti-lex dessine ton image…</div>';
    } catch (e) { console.error(e); }
  },

  afficherImage(img) {
    try {
      const src = img.base64
        ? "data:image/png;base64," + img.base64
        : img.url;

      this.resultEl.innerHTML =
        '<figure class="tilex-img-figure">' +
          '<img class="tilex-img-rendu" src="' + src + '" alt="Image générée par ti-lex">' +
          '<figcaption class="tilex-img-prompt">' +
            this.echapper(img.prompt) +
          '</figcaption>' +
          '<button class="tilex-img-dl" id="tilex-img-dl">Télécharger</button>' +
        '</figure>';

      const dl = this.resultEl.querySelector("#tilex-img-dl");
      if (dl) dl.addEventListener("click", () => this.telecharger(src));
    } catch (err) {
      console.error("TilexImageManager afficherImage:", err.message);
    }
  },

  afficherErreur(message) {
    try {
      this.resultEl.innerHTML =
        '<div class="tilex-img-erreur">⚠️ ' + this.echapper(message) + '</div>';
    } catch (e) { console.error(e); }
  },

  // ============================================================
  // 6. TÉLÉCHARGEMENT
  // ============================================================
  telecharger(src) {
    try {
      const a = document.createElement("a");
      a.href = src;
      a.download = "ti-lex-" + Date.now() + ".png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.tilexToast("Téléchargement lancé", "succes");
    } catch (err) {
      console.error("TilexImageManager telecharger:", err.message);
      window.tilexToast("Téléchargement impossible", "erreur");
    }
  },

  // ----------  Petit utilitaire anti-injection HTML  ----------
  echapper(txt) {
    try {
      const d = document.createElement("div");
      d.textContent = txt == null ? "" : String(txt);
      return d.innerHTML;
    } catch (e) {
      return "";
    }
  },
};
