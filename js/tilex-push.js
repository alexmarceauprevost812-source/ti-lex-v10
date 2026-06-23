// ti-lex v10 — TilexPush : bouton pour pousser du code vers ti-lex-code
(function () {
  'use strict';

  window.TilexPush = {
    pushToClipboard: function (code, langHint) {
      if (!code) return;
      var wrapped = '```' + (langHint || '') + '\n' + code + '\n```';
      navigator.clipboard.writeText(wrapped).then(function () {
        if (window.TilexToast) TilexToast.success('Code copié pour ti-lex-code');
      }).catch(function () {
        _fallbackCopy(wrapped);
      });
    },

    pushToProject: async function (code, filename) {
      if (!code || !window.supabase) return;
      try {
        var u = await window.supabase.auth.getUser();
        if (!u.data || !u.data.user) {
          if (window.TilexToast) TilexToast.error('Connecte-toi pour pousser du code');
          return;
        }

        var token = typeof getToken === 'function' ? getToken() : '';
        var sbUrl = typeof SB_URL !== 'undefined' ? SB_URL : '';
        var sbAnon = typeof SB_ANON !== 'undefined' ? SB_ANON : '';

        var res = await fetch(sbUrl + '/functions/v1/agent-al', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'apikey': sbAnon
          },
          body: JSON.stringify({
            action: 'chat',
            question: 'Injecte ce code dans le projet ti-lex-code. Fichier: ' + (filename || 'nouveau-fichier.js') + '\n\n```\n' + code + '\n```',
            history: []
          })
        });

        if (res.ok) {
          if (window.TilexToast) TilexToast.success('Code envoyé à Agent AL');
        } else {
          if (window.TilexToast) TilexToast.error('Erreur lors de l\'envoi');
        }
      } catch (e) {
        console.warn('[TilexPush] Erreur:', e.message);
        if (window.TilexToast) TilexToast.error('Erreur réseau');
      }
    },

    attachButton: function (codeBlock, code, lang) {
      if (!codeBlock || codeBlock.querySelector('.tilex-push-btn')) return;

      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:6px;margin-top:6px;';

      var btnCopy = document.createElement('button');
      btnCopy.className = 'tilex-push-btn';
      btnCopy.textContent = 'Copier';
      btnCopy.style.cssText = 'padding:4px 12px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.1));background:transparent;color:var(--muted,#888);font-size:11px;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit;';
      btnCopy.addEventListener('click', function () {
        window.TilexPush.pushToClipboard(code, lang);
      });

      var btnPush = document.createElement('button');
      btnPush.className = 'tilex-push-btn';
      btnPush.innerHTML = '&#9889; Pousser vers ti-lex-code';
      btnPush.style.cssText = 'padding:4px 12px;border-radius:8px;border:1px solid var(--orange,#ff7f27);background:rgba(255,127,39,0.1);color:var(--orange,#ff7f27);font-size:11px;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit;';
      btnPush.addEventListener('click', function () {
        var fname = prompt('Nom du fichier :', 'code.' + (lang || 'js'));
        if (fname) window.TilexPush.pushToProject(code, fname);
      });

      wrap.appendChild(btnCopy);
      wrap.appendChild(btnPush);
      codeBlock.parentNode.insertBefore(wrap, codeBlock.nextSibling);
    }
  };

  function _fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    if (window.TilexToast) TilexToast.success('Code copié');
  }

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        var blocks = node.querySelectorAll ? node.querySelectorAll('pre code, .code-block') : [];
        blocks.forEach(function (block) {
          var pre = block.closest('pre') || block;
          var lang = '';
          var cls = block.className || '';
          var match = cls.match(/language-(\w+)/);
          if (match) lang = match[1];
          window.TilexPush.attachButton(pre, block.textContent, lang);
        });
      });
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    var chatArea = document.getElementById('chat-messages') || document.body;
    observer.observe(chatArea, { childList: true, subtree: true });
  });

  console.log('[TilexPush] Chargé');
})();
