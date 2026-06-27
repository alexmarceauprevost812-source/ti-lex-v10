// ============================================
// js/tilex-matrix-bg.js — Fond Matrix plateforme
// Ti-lex-AL v10 — pluie matrix en arrière-plan (pro.html)
// Piloté par le panneau de contrôle (web.html) via :
//   • localStorage 'tilex_matrix'  (persistance + sync inter-onglets)
//   • event 'storage'              (live d'un autre onglet web.html)
//   • event 'tilex:matrix'         (live dans la même page)
// ============================================
(function () {
  "use strict";
  var LS = 'tilex_matrix';
  var DEF = { color: '#e63946', chars: '01', speed: 50, dens: 14, fade: 8, enabled: false, opacity: 0.20 };
  var cfg = Object.assign({}, DEF);
  var cv = null, ctx = null, drops = [], cols = 0, fontSize = 0, last = 0, raf = null, running = false;

  function load() { try { var s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s) cfg = Object.assign({}, DEF, s); } catch (e) {} }

  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.id = 'tilex-matrix-bg';
    // derrière le contenu (au-dessus du fond du body), non cliquable
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:none;opacity:' + (cfg.opacity || 0.2) + ';';
    if (document.body) document.body.insertBefore(cv, document.body.firstChild);
    ctx = cv.getContext('2d');
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause(); else if (cfg.enabled) start();
    });
  }

  function resize() {
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1, w = window.innerWidth, h = window.innerHeight;
    cv.width = Math.max(1, w * dpr); cv.height = Math.max(1, h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fontSize = Math.max(10, Math.floor(w / (cfg.dens || 14)));
    cols = Math.max(1, Math.floor(w / fontSize));
    drops = new Array(cols).fill(0).map(function () { return Math.random() * (h / fontSize); });
  }

  function draw() {
    var w = window.innerWidth, h = window.innerHeight;
    ctx.fillStyle = 'rgba(0,0,0,' + ((cfg.fade || 8) / 100) + ')';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cfg.color || '#e63946';
    ctx.font = fontSize + 'px monospace';
    var set = cfg.chars || '01';
    for (var i = 0; i < drops.length; i++) {
      var ch = set.charAt(Math.floor(Math.random() * set.length));
      var x = i * fontSize, y = drops[i] * fontSize;
      ctx.fillText(ch, x, y);
      if (y > h && Math.random() > 0.975) drops[i] = 0;
      drops[i] += (cfg.speed || 50) / 50;
    }
  }

  function loop(ts) { if (!running) return; if (ts - last > 33) { draw(); last = ts; } raf = requestAnimationFrame(loop); }
  function start() { ensureCanvas(); cv.style.display = 'block'; cv.style.opacity = (cfg.opacity || 0.2); if (running) { resize(); return; } resize(); running = true; last = 0; raf = requestAnimationFrame(loop); }
  function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }
  function hide() { pause(); if (cv) cv.style.display = 'none'; }

  function apply(newCfg) {
    if (newCfg) cfg = Object.assign({}, DEF, cfg, newCfg);
    if (cfg.enabled) start(); else hide();
  }

  function boot() { ensureCanvas(); if (cfg.enabled) start(); else hide(); }

  load();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  // live : même page
  window.addEventListener('tilex:matrix', function (e) { apply(e.detail || {}); });
  // live : autre onglet (web.html écrit dans localStorage → storage event ici)
  window.addEventListener('storage', function (e) { if (e.key === LS) { try { apply(JSON.parse(e.newValue || '{}')); } catch (_) {} } });

  window.TilexMatrixBG = {
    apply: apply,
    enable: function () { cfg.enabled = true; apply(); },
    disable: function () { cfg.enabled = false; hide(); },
    reload: function () { load(); apply(); },
    get cfg() { return cfg; }
  };
})();
