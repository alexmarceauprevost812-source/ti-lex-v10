// ti-lex v10 — TilexStream : écriture fluide lettre par lettre
(function () {
  'use strict';

  var _isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 768);

  var VITESSE_MS = _isMobile ? 35 : 18;
  var _queue = [];
  var _running = false;

  window.TilexStream = {
    vitesse: VITESSE_MS,

    ecrire: function (element, texte, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        _queue.push({
          el: element,
          texte: texte,
          vitesse: opts.vitesse || window.TilexStream.vitesse,
          callback: resolve,
          curseur: opts.curseur !== false,
          html: opts.html || false
        });
        if (!_running) _processQueue();
      });
    },

    ecrireHTML: function (element, html, opts) {
      opts = opts || {};
      opts.html = true;
      return window.TilexStream.ecrire(element, html, opts);
    },

    instant: function (element, texte) {
      if (element) element.textContent = texte;
    },

    annulerTout: function () {
      _queue = [];
      _running = false;
    },

    setVitesse: function (ms) {
      window.TilexStream.vitesse = ms;
      VITESSE_MS = ms;
    }
  };

  function _processQueue() {
    if (_queue.length === 0) { _running = false; return; }
    _running = true;
    var job = _queue.shift();
    _stream(job);
  }

  function _stream(job) {
    var el = job.el;
    if (!el) { job.callback(); _processQueue(); return; }

    var texte = job.texte || '';
    var vitesse = job.vitesse;
    var idx = 0;

    if (job.html) {
      el.innerHTML = '';
      var temp = document.createElement('div');
      temp.innerHTML = texte;
      var plainText = temp.textContent || '';
      _streamPlain(el, plainText, vitesse, function () {
        el.innerHTML = texte;
        _finalize(el, job);
      });
      return;
    }

    el.textContent = '';
    var cursor = null;
    if (job.curseur) {
      cursor = document.createElement('span');
      cursor.className = 'tilex-stream-cursor';
      cursor.textContent = '▋';
      cursor.style.cssText = 'color:var(--orange,#ff7f27);animation:tilexCursorBlink .6s steps(2) infinite;';
      el.appendChild(cursor);
    }

    _streamPlain(el, texte, vitesse, function () {
      _finalize(el, job);
    }, cursor);
  }

  function _streamPlain(el, texte, vitesse, done, cursor) {
    var idx = 0;
    var chunkSize = _isMobile ? 3 : 1;
    var textNode = document.createTextNode('');
    if (cursor) {
      el.insertBefore(textNode, cursor);
    } else {
      el.appendChild(textNode);
    }

    function tick() {
      if (idx >= texte.length) {
        done();
        return;
      }
      var end = Math.min(idx + chunkSize, texte.length);
      var chunk = texte.slice(idx, end);
      textNode.textContent += chunk;
      var lastCh = chunk[chunk.length - 1];
      idx = end;

      var delay = vitesse;
      if (lastCh === '\n') delay = vitesse * 3;
      else if ('.!?'.indexOf(lastCh) !== -1) delay = vitesse * 4;
      else if (',;:'.indexOf(lastCh) !== -1) delay = vitesse * 2;

      setTimeout(tick, delay);
    }
    tick();
  }

  function _finalize(el, job) {
    var cur = el.querySelector('.tilex-stream-cursor');
    if (cur) {
      cur.style.animation = 'none';
      setTimeout(function () { if (cur.parentNode) cur.remove(); }, 400);
    }
    el.classList.add('tilex-stream-done');
    job.callback();
    _processQueue();
  }

  var style = document.createElement('style');
  style.textContent = '@keyframes tilexCursorBlink{50%{opacity:0}}';
  document.head.appendChild(style);

  console.log('[TilexStream] Chargé — ' + (_isMobile ? 'mobile' : 'desktop') + ' ' + VITESSE_MS + 'ms/car, chunk=' + (_isMobile ? 3 : 1));
})();
