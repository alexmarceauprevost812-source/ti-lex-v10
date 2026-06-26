/**
 * TypewriterManager — Animation typewriter avec chevauchement à 70%
 * Quand une phrase atteint 70% de son écriture, la phrase suivante démarre,
 * donc deux phrases s'animent en même temps.
 * Vanilla JS, exposé en global sur window.TypewriterManager (conventions ti-lex).
 *
 * Inclus dans le HTML AVANT le script qui l'utilise :
 *   <script src="js/tilex-typewriter.js"></script>
 */
(function () {
  "use strict";

  // --- Configuration par défaut ---
  const CONFIG = {
    vitesse: 18,   // ms par caractère
    seuil: 0.70    // déclenche la phrase suivante à 70%
  };

  // --- Notifications (chaîne de priorité ti-lex) ---
  function notifier(message, type) {
    try {
      if (window.TilexToast && typeof window.TilexToast.show === "function") {
        window.TilexToast.show(message, type || "info");
        return;
      }
      if (typeof window.showToast === "function") {
        window.showToast(message, type || "info");
        return;
      }
      console.log("[Typewriter] " + message);
    } catch (e) {
      console.log("[Typewriter] " + message);
    }
  }

  /**
   * Crée une animation typewriter à phrases chevauchées.
   * options = {
   *   textes: ["phrase 1", "phrase 2", ...],  // tableau de phrases (obligatoire)
   *   conteneur: HTMLElement,                  // parent où injecter (obligatoire)
   *   vitesse: 18,                             // ms/caractère (optionnel)
   *   seuil: 0.70,                             // seuil de déclenchement (optionnel)
   *   onPhrase: function(el) {},               // appelé quand une phrase finit (optionnel)
   *   onFini: function() {}                     // appelé quand tout est fini (optionnel)
   * }
   * Retourne un contrôleur { demarrer, arreter }.
   */
  function makeTyper(options) {
    options = options || {};
    const textes = Array.isArray(options.textes) ? options.textes.slice() : [];
    const conteneur = options.conteneur;
    const vitesse = typeof options.vitesse === "number" ? options.vitesse : CONFIG.vitesse;
    const seuil = typeof options.seuil === "number" ? options.seuil : CONFIG.seuil;
    const onPhrase = typeof options.onPhrase === "function" ? options.onPhrase : null;
    const onFini = typeof options.onFini === "function" ? options.onFini : null;

    if (!conteneur || !textes.length) {
      notifier("Typewriter: conteneur ou textes manquants", "error");
      return { demarrer: function () {}, arreter: function () {} };
    }

    let file = textes.slice();   // phrases en attente
    let actives = [];            // phrases en cours d'écriture
    let rafId = null;
    let enCours = false;

    // Lance une phrase: crée son élément et l'ajoute aux actives
    function lancerPhrase() {
      if (!file.length) return;
      const texte = file.shift();

      const el = document.createElement("div");
      el.className = "tilex-typer-phrase";
      // Noeud texte unique: on ajoute caractère par caractère (pas de re-scan O(n))
      el.appendChild(document.createTextNode(""));
      conteneur.appendChild(el);

      actives.push({
        texte: texte,
        noeud: el.firstChild,
        el: el,
        i: 0,
        n: texte.length,
        declenche: false,   // a-t-on déjà lancé la phrase suivante au seuil ?
        fini: false,
        prochain: 0         // timestamp du prochain caractère
      });
    }

    // Boucle d'animation (requestAnimationFrame, indépendante du framerate)
    function tick(t) {
      for (let k = 0; k < actives.length; k++) {
        const p = actives[k];
        if (p.fini) continue;

        if (p.prochain === 0) p.prochain = t;

        // Rattrapage: écrit autant de caractères que le temps écoulé le permet
        while (p.prochain <= t && p.i < p.n) {
          p.noeud.nodeValue += p.texte.charAt(p.i); // ajout 1 caractère
          p.i++;
          p.prochain += vitesse;
        }

        // Seuil 70% atteint → lance la phrase suivante (une seule fois)
        if (!p.declenche && p.i / p.n >= seuil) {
          p.declenche = true;
          lancerPhrase();
        }

        // Phrase terminée
        if (p.i >= p.n && !p.fini) {
          p.fini = true;
          if (onPhrase) {
            try { onPhrase(p.el); } catch (e) { console.log(e); }
          }
        }
      }

      // Retire les phrases finies de la liste active (elles restent dans le DOM)
      actives = actives.filter(function (p) { return !p.fini; });

      // Continue tant qu'il reste des phrases en file ou en cours
      if (actives.length || file.length) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        finTypewriter();
      }
    }

    // Démarre l'animation
    function demarrer() {
      try {
        if (enCours) return;
        enCours = true;
        lancerPhrase();              // première phrase
        rafId = window.requestAnimationFrame(tick);
      } catch (e) {
        notifier("Erreur démarrage typewriter", "error");
        console.log(e);
      }
    }

    // Arrête l'animation (annule le rAF proprement)
    function arreter() {
      try {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
        enCours = false;
      } catch (e) {
        console.log(e);
      }
    }

    // Fin: stoppe le rAF et notifie la fin
    function finTypewriter() {
      try {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
        enCours = false;
        if (onFini) onFini();
      } catch (e) {
        console.log(e);
      }
    }

    return { demarrer: demarrer, arreter: arreter };
  }

  // --- Expose en global (convention ti-lex) ---
  window.TypewriterManager = {
    makeTyper: makeTyper,
    CONFIG: CONFIG
  };
})();

/* ---------------------------------------------------------------
   EXEMPLE D'UTILISATION:

   const ctrl = window.TypewriterManager.makeTyper({
     textes: [
       "Bienvenue sur ti-lex.",
       "Produit du Québec.",
       "On part-tu?"
     ],
     conteneur: document.getElementById("zone-typer"),
     vitesse: 18,
     seuil: 0.70,
     onFini: function () { console.log("Typer fini"); }
   });

   ctrl.demarrer();
   // ctrl.arreter();  // pour stopper en cours de route
--------------------------------------------------------------- */
