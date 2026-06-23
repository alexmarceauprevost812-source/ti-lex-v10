// ti-lex v10 — TilexVision : analyse d'image via Claude Vision
(function () {
  'use strict';

  var _currentImage = null;

  window.TilexVision = {
    // Charge une image depuis un input file
    loadFromInput: function (input) {
      return new Promise(function (resolve, reject) {
        var file = input && input.files && input.files[0];
        if (!file || !file.type.startsWith('image/')) {
          reject(new Error('Fichier image invalide'));
          return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
          var dataUrl = e.target.result;
          _currentImage = {
            base64: dataUrl.split(',')[1],
            mediaType: file.type,
            name: file.name,
            size: file.size,
            dataUrl: dataUrl
          };
          resolve(_currentImage);
        };
        reader.onerror = function () { reject(new Error('Erreur lecture fichier')); };
        reader.readAsDataURL(file);
      });
    },

    // Charge depuis un paste (Ctrl+V)
    loadFromPaste: function (clipboardData) {
      return new Promise(function (resolve, reject) {
        var items = clipboardData && clipboardData.items;
        if (!items) { reject(new Error('Pas de données')); return; }
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            var file = items[i].getAsFile();
            var reader = new FileReader();
            reader.onload = function (e) {
              var dataUrl = e.target.result;
              _currentImage = {
                base64: dataUrl.split(',')[1],
                mediaType: file.type,
                name: 'paste-' + Date.now() + '.png',
                size: file.size,
                dataUrl: dataUrl
              };
              resolve(_currentImage);
            };
            reader.onerror = function () { reject(new Error('Erreur lecture')); };
            reader.readAsDataURL(file);
            return;
          }
        }
        reject(new Error('Pas d\'image dans le presse-papier'));
      });
    },

    // Charge depuis un drag & drop
    loadFromDrop: function (dataTransfer) {
      return new Promise(function (resolve, reject) {
        var file = dataTransfer && dataTransfer.files && dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) {
          reject(new Error('Pas d\'image'));
          return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
          var dataUrl = e.target.result;
          _currentImage = {
            base64: dataUrl.split(',')[1],
            mediaType: file.type,
            name: file.name,
            size: file.size,
            dataUrl: dataUrl
          };
          resolve(_currentImage);
        };
        reader.onerror = function () { reject(new Error('Erreur lecture')); };
        reader.readAsDataURL(file);
      });
    },

    // Analyse via Edge Function (utilise Claude Vision)
    analyser: async function (prompt, imageData) {
      var img = imageData || _currentImage;
      if (!img || !img.base64) {
        if (typeof showToast === 'function') showToast('Aucune image chargée', 'error');
        return { ok: false, erreur: 'Aucune image' };
      }

      var token = typeof getToken === 'function' ? getToken() : '';
      var sbUrl = typeof SB_URL !== 'undefined' ? SB_URL : '';
      var sbAnon = typeof SB_ANON !== 'undefined' ? SB_ANON : '';

      try {
        var res = await fetch(sbUrl + '/functions/v1/agent-dispatcher', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'apikey': sbAnon
          },
          body: JSON.stringify({
            agent_id: 'nexus-al',
            message: prompt || 'Analyse cette image en détail. Décris ce que tu vois.',
            image_base64: img.base64,
            image_media_type: img.mediaType
          })
        });

        if (!res.ok) {
          var errData = await res.json().catch(function () { return {}; });
          throw new Error(errData.error || 'Erreur ' + res.status);
        }

        // SSE streaming ou JSON
        var contentType = res.headers.get('content-type') || '';
        if (contentType.indexOf('text/event-stream') !== -1) {
          return { ok: true, stream: res.body, image: img };
        }

        var data = await res.json();
        if (typeof showToast === 'function') showToast('Image analysée', 'success');
        return { ok: true, resultat: data.summary || data, image: img };
      } catch (e) {
        console.warn('[TilexVision] Erreur analyse:', e.message);
        if (typeof showToast === 'function') showToast('Erreur analyse image', 'error');
        return { ok: false, erreur: e.message };
      }
    },

    // Affiche un aperçu de l'image dans le chat
    showPreview: function (container, imageData) {
      var img = imageData || _currentImage;
      if (!img || !img.dataUrl) return null;

      var existing = container.querySelector('.tilex-vision-preview');
      if (existing) existing.remove();

      var wrap = document.createElement('div');
      wrap.className = 'tilex-vision-preview';

      var imgEl = document.createElement('img');
      imgEl.src = img.dataUrl;
      imgEl.alt = img.name || 'Image';

      var info = document.createElement('div');
      info.className = 'tvp-info';
      var sizeKb = Math.round((img.size || 0) / 1024);
      info.innerHTML = '<span class="tvp-name">' + _escHtml(img.name || 'image') + '</span>'
        + '<span class="tvp-size">' + sizeKb + ' Ko</span>';

      var removeBtn = document.createElement('button');
      removeBtn.className = 'tvp-remove';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Retirer l\'image';
      removeBtn.addEventListener('click', function () {
        wrap.remove();
        _currentImage = null;
      });

      wrap.appendChild(imgEl);
      wrap.appendChild(info);
      wrap.appendChild(removeBtn);
      container.appendChild(wrap);
      return wrap;
    },

    // Getter
    getImage: function () { return _currentImage; },
    hasImage: function () { return !!_currentImage; },
    clear: function () { _currentImage = null; }
  };

  function _escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Bouton Vision dans le composer ──
  document.addEventListener('DOMContentLoaded', function () {
    var composerRow = document.querySelector('.composer-actions-row');
    if (!composerRow) return;

    // Bouton
    var btn = document.createElement('button');
    btn.id = 'vision-btn';
    btn.className = 'composer-plus';
    btn.title = 'Analyser une image';
    btn.innerHTML = '👁';
    btn.style.cssText = 'font-size:16px;';

    // Input file caché
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.id = 'vision-file-input';

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      window.TilexVision.loadFromInput(fileInput).then(function (img) {
        var composer = document.querySelector('.composer-glass');
        if (composer) window.TilexVision.showPreview(composer, img);
        if (typeof showToast === 'function') showToast('Image chargée — envoie ton message pour l\'analyser', 'success');
      }).catch(function (e) {
        if (typeof showToast === 'function') showToast(e.message, 'error');
      });
      fileInput.value = '';
    });

    composerRow.appendChild(btn);
    composerRow.appendChild(fileInput);

    // ── Ctrl+V pour coller une image ──
    var chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.addEventListener('paste', function (e) {
        if (!e.clipboardData || !e.clipboardData.items) return;
        for (var i = 0; i < e.clipboardData.items.length; i++) {
          if (e.clipboardData.items[i].type.startsWith('image/')) {
            e.preventDefault();
            window.TilexVision.loadFromPaste(e.clipboardData).then(function (img) {
              var composer = document.querySelector('.composer-glass');
              if (composer) window.TilexVision.showPreview(composer, img);
              if (typeof showToast === 'function') showToast('Image collée', 'success');
            }).catch(function () {});
            return;
          }
        }
      });
    }

    // ── Drag & drop sur le chat ──
    var chatArea = document.getElementById('chat-messages');
    if (chatArea) {
      chatArea.addEventListener('dragover', function (e) { e.preventDefault(); });
      chatArea.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files[0]) return;
        if (!e.dataTransfer.files[0].type.startsWith('image/')) return;
        window.TilexVision.loadFromDrop(e.dataTransfer).then(function (img) {
          var composer = document.querySelector('.composer-glass');
          if (composer) window.TilexVision.showPreview(composer, img);
          if (typeof showToast === 'function') showToast('Image déposée', 'success');
        }).catch(function () {});
      });
    }
  });

  console.log('[TilexVision] Chargé — analyse d\'image Claude Vision');
})();
