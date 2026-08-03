/* ══════════════════════════════════════════════════════════════════════════
   ti-lex v10 — RÉGLAGE DE LA TAILLE DU TEXTE
   ---------------------------------------------------------------------------
   Pilote --tilex-texte-echelle (voir css/tilex-texte.css) et mémorise le
   choix dans le navigateur, pour qu'il tienne d'une session à l'autre.

     TilexTexte.echelle()       → lit l'échelle courante
     TilexTexte.echelle(1.35)   → +35 %
     TilexTexte.plus()          → un cran plus gros
     TilexTexte.moins()         → un cran plus petit
     TilexTexte.defaut()        → revient à +20 %
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var CLE = "tilex_texte_echelle";
  var DEFAUT = 1.2;   /* +20 % */
  var MIN = 0.8;
  var MAX = 2.0;
  var PAS = 0.1;

  function borner(v) {
    return Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100));
  }

  function lire() {
    var brut = getComputedStyle(document.documentElement)
      .getPropertyValue("--tilex-texte-echelle");
    var v = parseFloat(brut);
    return isNaN(v) ? DEFAUT : v;
  }

  function ecrire(v) {
    var e = borner(v);
    document.documentElement.style.setProperty("--tilex-texte-echelle", String(e));
    try { localStorage.setItem(CLE, String(e)); } catch (err) { /* stockage indisponible */ }
    return e;
  }

  function echelle(v) {
    if (typeof v === "number" && !isNaN(v)) return ecrire(v);
    return lire();
  }

  function init() {
    var memo = null;
    try { memo = localStorage.getItem(CLE); } catch (err) { /* ignoré */ }
    if (memo !== null) {
      var v = parseFloat(memo);
      if (!isNaN(v)) {
        document.documentElement.style.setProperty("--tilex-texte-echelle", String(borner(v)));
      }
    }
  }

  global.TilexTexte = {
    echelle: echelle,
    plus: function () { return ecrire(lire() + PAS); },
    moins: function () { return ecrire(lire() - PAS); },
    defaut: function () { return ecrire(DEFAUT); },
    MIN: MIN,
    MAX: MAX
  };

  init();
})(window);
