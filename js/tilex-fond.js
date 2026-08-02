/* ══════════════════════════════════════════════════════════════════════════
   ti-lex v10 — IMAGE DE FOND D'APPLICATION (40 % visible)
   ---------------------------------------------------------------------------
   Installe une couche image fixe derrière toute l'application.

   Pour utiliser ta propre image : dépose-la dans assets/fond-app.png
   (ou .jpg / .webp) — elle est reprise automatiquement, sans toucher au code.
   Sinon, le logo ti-lex v10 sert de fond par défaut.

   Réglages à chaud (console ou autre script) :
     TilexFond.definir('assets/mon-image.png');
     TilexFond.opacite(0.4);        // 40 %
     TilexFond.retirer();
   La valeur d'opacité choisie est mémorisée dans le navigateur.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var CLE_OPACITE = "tilex_fond_opacite";
  var CLE_IMAGE = "tilex_fond_image";
  var OPACITE_DEFAUT = 0.4; /* 40 % — demandé */

  /* Candidats testés dans l'ordre : la première image qui charge est retenue. */
  var CANDIDATS = [
    "assets/fond-app.png",
    "assets/fond-app.jpg",
    "assets/fond-app.webp",
    "assets/tilex-v10-logo.png"
  ];

  var couche = null;

  function racineRelative() {
    /* Les pages sont servies à la racine; on garde les chemins relatifs tels
       quels pour rester compatible avec un sous-dossier de déploiement. */
    return "";
  }

  function creerCouche() {
    if (couche) return couche;
    couche = document.getElementById("tilex-fond");
    if (!couche) {
      couche = document.createElement("div");
      couche.id = "tilex-fond";
      couche.setAttribute("aria-hidden", "true");
      document.body.insertBefore(couche, document.body.firstChild);
    }
    document.documentElement.classList.add("tilex-fond-actif");
    return couche;
  }

  function appliquer(url) {
    var el = creerCouche();
    el.style.backgroundImage = 'url("' + url + '")';
  }

  function tester(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = url;
    });
  }

  async function choisirImage() {
    var memorisee = null;
    try { memorisee = localStorage.getItem(CLE_IMAGE); } catch (e) { /* stockage indisponible */ }

    var liste = [];
    if (global.TILEX_FOND_IMAGE) liste.push(global.TILEX_FOND_IMAGE);
    if (memorisee) liste.push(memorisee);
    liste = liste.concat(CANDIDATS);

    for (var i = 0; i < liste.length; i++) {
      var url = racineRelative() + liste[i];
      if (await tester(url)) return url;
    }
    return null;
  }

  function opacite(valeur) {
    if (typeof valeur === "number" && valeur >= 0 && valeur <= 1) {
      document.documentElement.style.setProperty("--tilex-fond-opacite", String(valeur));
      try { localStorage.setItem(CLE_OPACITE, String(valeur)); } catch (e) { /* ignoré */ }
    }
    var lu = getComputedStyle(document.documentElement).getPropertyValue("--tilex-fond-opacite");
    return parseFloat(lu) || OPACITE_DEFAUT;
  }

  function definir(url) {
    if (!url) return;
    try { localStorage.setItem(CLE_IMAGE, url); } catch (e) { /* ignoré */ }
    appliquer(url);
  }

  function retirer() {
    if (couche && couche.parentNode) couche.parentNode.removeChild(couche);
    couche = null;
    document.documentElement.classList.remove("tilex-fond-actif");
  }

  async function init() {
    var memo = null;
    try { memo = localStorage.getItem(CLE_OPACITE); } catch (e) { /* ignoré */ }
    document.documentElement.style.setProperty(
      "--tilex-fond-opacite",
      String(memo !== null ? parseFloat(memo) : OPACITE_DEFAUT)
    );

    var url = await choisirImage();
    if (!url) {
      console.warn("[tilex-fond] Aucune image de fond trouvée — dépose ton image dans assets/fond-app.png");
      return;
    }
    appliquer(url);
  }

  global.TilexFond = {
    init: init,
    definir: definir,
    opacite: opacite,
    retirer: retirer,
    CANDIDATS: CANDIDATS
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
