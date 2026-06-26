'use strict';

window.TILEX = window.TILEX || {};

TILEX.typewriterConfig = {
  vitesse:         22,
  pauseEntrePhases: 180,
  glitch:          true,
  scanline:        true,
};

TILEX.ecrireTexte = function(el, texte, onDone) {
  if (!el) return { annuler: function(){} };

  var cfg    = TILEX.typewriterConfig;
  var annule = false;
  var rafId  = null;

  el.classList.add('tx-typewriter', 'ecrit');
  el.classList.remove('phase-2', 'termine');
  el.classList.add('phase-1');
  el.textContent = '';

  // ── Noeuds créés UNE seule fois : on les mute frame par frame.
  //    JAMAIS de el.textContent='' + reconstruction (cause des saccades mobile).
  var noeudTexte = document.createTextNode('');
  var spanGlitch = document.createElement('span');
  spanGlitch.className = 'tx-glitch';
  var cursor = document.createElement('span');
  cursor.className = 'tx-cursor';
  el.appendChild(noeudTexte);
  el.appendChild(spanGlitch);
  el.appendChild(cursor);

  // Affiche les i premiers caractères en mutant les noeuds existants.
  // Index simple (+1) géré dans la boucle : aucun re-scan, aucun rebuild DOM.
  function afficher(i) {
    var sub = texte.slice(0, i);
    if (cfg.glitch && sub.length > 0) {
      noeudTexte.data        = sub.slice(0, -1); // partie stable
      spanGlitch.textContent = sub.slice(-1);    // dernier caractère qui glitch
    } else {
      noeudTexte.data        = sub;
      spanGlitch.textContent = '';
    }
  }

  // États de la boucle d'animation (machine à états dans un seul rAF)
  var PHASE_1 = 1, PAUSE = 2, PHASE_2 = 3;
  var phase     = PHASE_1;
  var i         = 0;
  var dernierTs = 0;
  var accumule  = 0; // accumulateur de temps (delta) : synchro sur le vrai refresh

  function boucle(ts) {
    if (annule) return;
    try {
      if (!dernierTs) dernierTs = ts;
      accumule += (ts - dernierTs);
      dernierTs = ts;

      if (phase === PHASE_1 || phase === PHASE_2) {
        // On avance d'autant de caractères que le temps écoulé le permet.
        var aChange = false;
        while (accumule >= cfg.vitesse && i <= texte.length) {
          accumule -= cfg.vitesse;
          i++;
          aChange = true;
        }
        if (aChange) afficher(i > texte.length ? texte.length : i);

        if (i > texte.length) {
          if (phase === PHASE_1) {
            // BUG 3 : transition phrase 1 → phrase 2 SANS setTimeout.
            // La pause est comptée par l'accumulateur, sur les frames suivants.
            phase    = PAUSE;
            accumule = 0;
          } else {
            terminer();
            return;
          }
        }
      } else if (phase === PAUSE) {
        // Pause entre les deux phrases, en temps réel (aucun timer empilé).
        if (accumule >= cfg.pauseEntrePhases) {
          el.classList.remove('phase-1');
          el.classList.add('phase-2');
          phase    = PHASE_2;
          i        = 0;
          accumule = 0;
        }
      }

      rafId = requestAnimationFrame(boucle);
    } catch (e) {
      console.log('[TILEX ecrireTexte] ' + (e && e.message ? e.message : e));
    }
  }

  function terminer() {
    el.classList.remove('phase-1', 'phase-2', 'ecrit');
    el.classList.add('termine');
    el.textContent = texte; // efface curseur + noeuds, pose le texte final
    if (typeof onDone === 'function') onDone();
  }

  rafId = requestAnimationFrame(boucle);

  return {
    annuler: function() {
      annule = true;
      if (rafId) cancelAnimationFrame(rafId);
      terminer();
    }
  };
};

TILEX.phase2Seulement = function(el, texte, onDone) {
  if (!el) return { annuler: function(){} };

  var cfg    = TILEX.typewriterConfig;
  var annule = false;
  var rafId  = null;
  var len    = texte.length;

  el.classList.add('tx-typewriter', 'ecrit', 'phase-2');
  el.classList.remove('phase-1', 'termine');
  el.textContent = '';

  // Vitesse adaptée à la longueur, calculée UNE seule fois (pas à chaque frame).
  var vitesse = cfg.vitesse;
  if (len > 600)      vitesse = 2;
  else if (len > 300) vitesse = 6;
  else if (len > 150) vitesse = 12;

  // Noeuds persistants : on mute au lieu de reconstruire le DOM chaque frame.
  var noeudTexte = document.createTextNode('');
  var spanGlitch = document.createElement('span');
  spanGlitch.className = 'tx-glitch';
  var cursor = document.createElement('span');
  cursor.className = 'tx-cursor';
  el.appendChild(noeudTexte);
  el.appendChild(spanGlitch);
  el.appendChild(cursor);

  function afficher(i) {
    var sub = texte.slice(0, i);
    if (cfg.glitch && sub.length > 0) {
      noeudTexte.data        = sub.slice(0, -1);
      spanGlitch.textContent = sub.slice(-1);
    } else {
      noeudTexte.data        = sub;
      spanGlitch.textContent = '';
    }
  }

  var i         = 0;
  var dernierTs = 0;
  var accumule  = 0; // accumulateur de temps (delta) synchro sur le refresh

  function boucle(ts) {
    if (annule) return;
    try {
      if (!dernierTs) dernierTs = ts;
      accumule += (ts - dernierTs);
      dernierTs = ts;

      // Index simple +1 ; rattrape plusieurs caractères par frame si besoin.
      var aChange = false;
      while (accumule >= vitesse && i <= len) {
        accumule -= vitesse;
        i++;
        aChange = true;
      }
      if (aChange) afficher(i > len ? len : i);

      if (i > len) { terminer(); return; }
      rafId = requestAnimationFrame(boucle);
    } catch (e) {
      console.log('[TILEX phase2Seulement] ' + (e && e.message ? e.message : e));
    }
  }

  function terminer() {
    el.classList.remove('phase-1', 'phase-2', 'ecrit');
    el.classList.add('termine');
    el.textContent = texte;
    if (typeof onDone === 'function') onDone();
  }

  rafId = requestAnimationFrame(boucle);

  return {
    annuler: function() {
      annule = true;
      if (rafId) cancelAnimationFrame(rafId);
      terminer();
    }
  };
};

TILEX.doitAnimer = function() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
};
