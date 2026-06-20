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
  var timer  = null;

  el.classList.add('tx-typewriter', 'ecrit');
  el.textContent = '';

  var cursor = document.createElement('span');
  cursor.className = 'tx-cursor';

  function phase1(i) {
    if (annule) return;
    el.classList.remove('phase-2', 'termine');
    el.classList.add('phase-1');

    if (i <= texte.length) {
      rendrePartiel(texte.slice(0, i), cfg.glitch);
      el.appendChild(cursor);
      timer = setTimeout(function(){ phase1(i + 1); }, cfg.vitesse);
    } else {
      timer = setTimeout(function(){ phase2(0); }, cfg.pauseEntrePhases);
    }
  }

  function phase2(i) {
    if (annule) return;
    el.classList.remove('phase-1');
    el.classList.add('phase-2');

    if (i <= texte.length) {
      rendrePartiel(texte.slice(0, i), cfg.glitch);
      el.appendChild(cursor);
      timer = setTimeout(function(){ phase2(i + 1); }, cfg.vitesse);
    } else {
      terminer();
    }
  }

  function rendrePartiel(sousTexte, avecGlitch) {
    el.textContent = '';
    if (!sousTexte) return;

    if (avecGlitch && sousTexte.length > 0) {
      var avant   = sousTexte.slice(0, -1);
      var dernier = sousTexte.slice(-1);

      if (avant) el.appendChild(document.createTextNode(avant));

      var span = document.createElement('span');
      span.className   = 'tx-glitch';
      span.textContent = dernier;
      el.appendChild(span);
    } else {
      el.appendChild(document.createTextNode(sousTexte));
    }
  }

  function terminer() {
    el.classList.remove('phase-1', 'phase-2', 'ecrit');
    el.classList.add('termine');
    el.textContent = texte;
    if (cursor.parentNode) cursor.remove();
    if (typeof onDone === 'function') onDone();
  }

  phase1(0);

  return {
    annuler: function() {
      annule = true;
      if (timer) clearTimeout(timer);
      terminer();
    }
  };
};

TILEX.phase2Seulement = function(el, texte, onDone) {
  if (!el) return { annuler: function(){} };

  var cfg    = TILEX.typewriterConfig;
  var annule = false;
  var timer  = null;
  var len    = texte.length;

  el.classList.add('tx-typewriter', 'ecrit', 'phase-2');
  el.classList.remove('phase-1', 'termine');
  el.textContent = '';

  var cursor = document.createElement('span');
  cursor.className = 'tx-cursor';

  function tick(i) {
    if (annule) return;

    if (i <= len) {
      var delay = cfg.vitesse;
      if (len > 600)      delay = 2;
      else if (len > 300) delay = 6;
      else if (len > 150) delay = 12;

      el.textContent = '';
      var sub = texte.slice(0, i);
      if (cfg.glitch && sub.length > 0) {
        var avant = sub.slice(0, -1);
        var dern  = sub.slice(-1);
        if (avant) el.appendChild(document.createTextNode(avant));
        var g = document.createElement('span');
        g.className = 'tx-glitch';
        g.textContent = dern;
        el.appendChild(g);
      } else {
        el.appendChild(document.createTextNode(sub));
      }
      el.appendChild(cursor);
      timer = setTimeout(function(){ tick(i + 1); }, delay);
    } else {
      terminer();
    }
  }

  function terminer() {
    el.classList.remove('phase-1', 'phase-2', 'ecrit');
    el.classList.add('termine');
    el.textContent = texte;
    if (cursor.parentNode) cursor.remove();
    if (typeof onDone === 'function') onDone();
  }

  tick(0);

  return {
    annuler: function() {
      annule = true;
      if (timer) clearTimeout(timer);
      terminer();
    }
  };
};

TILEX.doitAnimer = function() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
};
