// ============================================================
// ti-lex v10 — ButtonEngine
// Blindage complet des boutons pour Centre INDAR
// Survit à chaque deploy Vercel, chaque cache navigateur.
// ============================================================

(function () {
  'use strict';

  var ACTION_REGISTRY = {};

  window.ButtonEngine = {
    register: function(actionName, handler) {
      if (typeof handler !== 'function') {
        console.warn('[ButtonEngine] handler for "' + actionName + '" is not a function');
        return;
      }
      ACTION_REGISTRY[actionName] = handler;
    },

    registerAll: function(map) {
      var self = this;
      Object.keys(map).forEach(function(name) { self.register(name, map[name]); });
    },

    trigger: function(actionName, element, event) {
      var handler = ACTION_REGISTRY[actionName];
      if (!handler) {
        console.warn('[ButtonEngine] aucune action enregistrée : "' + actionName + '"');
        return;
      }
      _safeCall(handler, element || document.body, event);
    },

    list: function() {
      return Object.keys(ACTION_REGISTRY);
    },
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;

    var action = el.getAttribute('data-action');
    var handler = ACTION_REGISTRY[action];

    if (!handler) return;

    e.preventDefault();
    _safeCall(handler, el, e);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target.closest('[data-action][role="button"]');
    if (!el) return;
    if (el.disabled) return;
    e.preventDefault();
    var handler = ACTION_REGISTRY[el.getAttribute('data-action')];
    if (handler) _safeCall(handler, el, e);
  });

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        var candidates = [];
        if (node.hasAttribute && node.hasAttribute('data-action')) candidates.push(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('[data-action]').forEach(function(n) { candidates.push(n); });
        }
        candidates.forEach(function (el) {
          if (!el.hasAttribute('data-be-init')) {
            el.setAttribute('data-be-init', '1');
          }
        });
      });
    });
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  window.addEventListener('load', function () {
    var orphans = 0;
    document.querySelectorAll('[data-action]').forEach(function (el) {
      var action = el.getAttribute('data-action');
      if (!ACTION_REGISTRY[action]) orphans++;
    });
    if (orphans === 0) {
      console.log('[ButtonEngine] ✅ ' + Object.keys(ACTION_REGISTRY).length + ' actions — tous les boutons sont blindés.');
    } else {
      console.warn('[ButtonEngine] ⚠️ ' + orphans + ' bouton(s) sans handler.');
    }
  });

  function _safeCall(fn, el, event) {
    try {
      var wasDisabled = el.disabled;
      if (!wasDisabled && el.tagName === 'BUTTON') el.disabled = true;

      var result = fn(el, event);

      if (result && typeof result.then === 'function') {
        result
          .catch(function (err) { _handleError(err, el); })
          .finally(function () { if (!wasDisabled) el.disabled = false; });
      } else {
        if (!wasDisabled) el.disabled = false;
      }
    } catch (err) {
      el.disabled = false;
      _handleError(err, el);
    }
  }

  function _handleError(err, el) {
    console.error('[ButtonEngine] Erreur dans action "' + (el && el.getAttribute('data-action')) + '" :', err);
    _showToast('⚠️ ' + (err.message || 'Erreur système'), 'error');
  }

  function _showToast(msg, type) {
    var existing = document.getElementById('tilex-toast');
    if (existing) {
      existing.textContent = msg;
      existing.className = 'tilex-toast tilex-toast--' + (type || 'info');
      existing.style.display = 'block';
      clearTimeout(existing._timer);
      existing._timer = setTimeout(function() { existing.style.display = 'none'; }, 4000);
      return;
    }
    var t = document.createElement('div');
    t.id = 'tilex-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;'
      + 'background:#1a1a1a;border:1px solid;'
      + (type === 'error' ? 'color:#ff3b3b;border-color:#ff3b3b;' : 'color:#37e0a0;border-color:#37e0a0;')
      + 'padding:10px 18px;border-radius:8px;'
      + 'font-family:monospace;font-size:13px;'
      + 'box-shadow:0 0 16px rgba(255,59,59,.3);';
    document.body.appendChild(t);
    t._timer = setTimeout(function() { t.style.display = 'none'; }, 4000);
  }

})();
