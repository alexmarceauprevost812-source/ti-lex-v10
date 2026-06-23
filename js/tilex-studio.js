/* ══════════════════════════════════════════════════
   ti-lex Studio — Split-view code panel
   Produit du Québec
   ══════════════════════════════════════════════════ */

var TilexStudio = (function(){

  var _open = false;
  var _activeTab = 'code';
  var _files = [];
  var _activeFileIdx = 0;
  var _resizing = false;

  var LANG_MAP = {
    'html':'HTML','css':'CSS','js':'JavaScript','javascript':'JavaScript',
    'json':'JSON','python':'Python','py':'Python','sql':'SQL',
    'bash':'Bash','sh':'Bash','typescript':'TypeScript','ts':'TypeScript',
    'jsx':'JSX','tsx':'TSX','markdown':'Markdown','md':'Markdown',
    'xml':'XML','yaml':'YAML','yml':'YAML','php':'PHP','ruby':'Ruby',
    'go':'Go','rust':'Rust','java':'Java','c':'C','cpp':'C++',
    'csharp':'C#','cs':'C#','swift':'Swift','kotlin':'Kotlin',
    'dart':'Dart','r':'R','lua':'Lua','perl':'Perl','toml':'TOML'
  };

  var FILE_ICONS = {
    'html':'📄','css':'🎨','js':'⚡','json':'📋','python':'🐍','py':'🐍',
    'sql':'🗃️','bash':'🖥️','sh':'🖥️','ts':'💎','tsx':'⚛️','jsx':'⚛️',
    'md':'📝','xml':'📃','yaml':'⚙️','yml':'⚙️','default':'📄'
  };

  function init(){
    var toggle = document.getElementById('studio-toggle');
    if(toggle) toggle.addEventListener('click', function(){ _open ? close() : open(); });

    document.querySelectorAll('.studio-tab').forEach(function(tab){
      tab.addEventListener('click', function(){ switchTab(this.dataset.tab); });
    });

    var editor = document.getElementById('studio-editor');
    if(editor){
      editor.addEventListener('input', onEditorInput);
      editor.addEventListener('keydown', onEditorKeydown);
    }

    var resizer = document.getElementById('studio-resize');
    if(resizer){
      resizer.addEventListener('mousedown', startResize);
      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
    }

    _files.push({ name:'sans-titre.html', lang:'html', content:'' });
    renderFiles();
    updateLangSel();
    updateCharCount();
  }

  function open(){
    _open = true;
    document.body.classList.add('studio-open');
    var toggle = document.getElementById('studio-toggle');
    if(toggle){ toggle.innerHTML = '▶<span class="studio-dot"></span>'; toggle.title = 'Fermer Studio'; }
    var editor = document.getElementById('studio-editor');
    if(editor) editor.focus();
  }

  function close(){
    _open = false;
    document.body.classList.remove('studio-open');
    var toggle = document.getElementById('studio-toggle');
    if(toggle){ toggle.innerHTML = '◀<span class="studio-dot"></span>'; toggle.title = 'Ouvrir Studio'; }
  }

  function toggle(){
    _open ? close() : open();
  }

  function isOpen(){ return _open; }

  function switchTab(tab){
    _activeTab = tab;
    document.querySelectorAll('.studio-tab').forEach(function(t){
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.studio-pane').forEach(function(p){
      p.classList.toggle('active', p.id === 'studio-pane-' + tab);
    });
    if(tab === 'preview') refreshPreview();
  }

  function onEditorInput(){
    var editor = document.getElementById('studio-editor');
    if(!editor) return;
    var f = _files[_activeFileIdx];
    if(f) f.content = editor.value;
    updateCharCount();
  }

  function onEditorKeydown(e){
    if(e.key === 'Tab'){
      e.preventDefault();
      var editor = e.target;
      var start = editor.selectionStart;
      var end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      onEditorInput();
    }
  }

  function updateCharCount(){
    var editor = document.getElementById('studio-editor');
    var counter = document.getElementById('studio-char-count');
    if(!editor || !counter) return;
    var lines = editor.value.split('\n').length;
    counter.textContent = editor.value.length + ' car · ' + lines + ' lig';
  }

  function updateLangSel(){
    var sel = document.getElementById('studio-lang-sel');
    if(!sel) return;
    var f = _files[_activeFileIdx];
    if(f) sel.value = f.lang;
  }

  function changeLang(lang){
    var f = _files[_activeFileIdx];
    if(f){
      f.lang = lang;
      var ext = lang;
      var name = f.name.replace(/\.[^.]+$/, '') + '.' + ext;
      f.name = name;
      renderFiles();
    }
  }

  function getCode(){
    var editor = document.getElementById('studio-editor');
    return editor ? editor.value : '';
  }

  function setCode(code, lang){
    var editor = document.getElementById('studio-editor');
    if(!editor) return;
    editor.value = code;
    var f = _files[_activeFileIdx];
    if(f){
      f.content = code;
      if(lang){
        f.lang = lang;
        var ext = lang;
        f.name = f.name.replace(/\.[^.]+$/, '') + '.' + ext;
      }
    }
    updateLangSel();
    updateCharCount();
    highlightToggle();
  }

  function injectFromChat(code, lang){
    lang = (lang || 'html').toLowerCase();
    if(LANG_MAP[lang]) lang = lang;
    else lang = 'html';

    var existing = false;
    for(var i = 0; i < _files.length; i++){
      if(_files[i].lang === lang && !_files[i].content){
        _activeFileIdx = i;
        existing = true;
        break;
      }
    }
    if(!existing && _files.length > 0 && _files[_activeFileIdx].content){
      _files.push({ name: 'code-' + (_files.length + 1) + '.' + lang, lang: lang, content: '' });
      _activeFileIdx = _files.length - 1;
    }

    setCode(code, lang);
    renderFiles();

    if(!_open) {
      var toggle = document.getElementById('studio-toggle');
      if(toggle) toggle.classList.add('has-code');
      open();
    }
    switchTab('code');
    if(typeof showToastMsg === 'function') showToastMsg('Code injecté dans le Studio');
  }

  function copyCode(){
    var code = getCode();
    if(!code){ if(typeof showToastMsg === 'function') showToastMsg('Rien à copier'); return; }
    navigator.clipboard.writeText(code).then(function(){
      if(typeof showToastMsg === 'function') showToastMsg('Code copié !');
    });
  }

  function pushToCodex(){
    var code = getCode();
    if(!code){ if(typeof showToastMsg === 'function') showToastMsg('Rien à envoyer'); return; }
    var f = _files[_activeFileIdx];
    var lang = f ? f.lang : 'html';
    var name = f ? f.name : 'code.html';

    if(typeof envoyerVersCodex === 'function'){
      envoyerVersCodex('Studio: ' + name, 'Intègre ce code (' + lang + '):\n```' + lang + '\n' + code + '\n```', []);
      if(typeof showToastMsg === 'function') showToastMsg('Envoyé à TILEXCODE !');
    } else if(typeof showTab === 'function'){
      showTab('codex');
      if(typeof showToastMsg === 'function') showToastMsg('Copie le code et colle-le dans TILEXCODE');
    }
  }

  function refreshPreview(){
    var iframe = document.getElementById('studio-preview-frame');
    if(!iframe) return;

    var html = '';
    var css = '';
    var js = '';

    for(var i = 0; i < _files.length; i++){
      var f = _files[i];
      if(f.lang === 'html') html += f.content + '\n';
      else if(f.lang === 'css') css += f.content + '\n';
      else if(f.lang === 'js' || f.lang === 'javascript') js += f.content + '\n';
    }

    if(!html && !css && !js){
      var f = _files[_activeFileIdx];
      if(f){
        if(f.lang === 'html') html = f.content;
        else if(f.lang === 'css') css = f.content;
        else if(f.lang === 'js' || f.lang === 'javascript') js = f.content;
        else html = '<pre>' + escapeHtml(f.content) + '</pre>';
      }
    }

    var fullDoc = html;
    if(fullDoc.indexOf('<html') === -1){
      fullDoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<style>body{font-family:system-ui,sans-serif;margin:16px;color:#222;}' + css + '</style></head><body>'
        + html + '<script>' + js + '<\/script></body></html>';
    } else {
      if(css) fullDoc = fullDoc.replace('</head>', '<style>' + css + '</style></head>');
      if(js) fullDoc = fullDoc.replace('</body>', '<script>' + js + '<\/script></body>');
    }

    var blob = new Blob([fullDoc], {type:'text/html'});
    iframe.src = URL.createObjectURL(blob);
  }

  function escapeHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function clearEditor(){
    var editor = document.getElementById('studio-editor');
    if(editor) editor.value = '';
    var f = _files[_activeFileIdx];
    if(f) f.content = '';
    updateCharCount();
  }

  /* ── Files management ── */
  function addFile(name, lang, content){
    lang = lang || 'html';
    name = name || ('fichier-' + (_files.length + 1) + '.' + lang);
    _files.push({ name: name, lang: lang, content: content || '' });
    _activeFileIdx = _files.length - 1;
    renderFiles();
    loadFile(_activeFileIdx);
  }

  function removeFile(idx){
    if(_files.length <= 1) return;
    _files.splice(idx, 1);
    if(_activeFileIdx >= _files.length) _activeFileIdx = _files.length - 1;
    renderFiles();
    loadFile(_activeFileIdx);
  }

  function loadFile(idx){
    if(idx < 0 || idx >= _files.length) return;
    _activeFileIdx = idx;
    var f = _files[idx];
    var editor = document.getElementById('studio-editor');
    if(editor) editor.value = f.content;
    updateLangSel();
    updateCharCount();
    renderFiles();
  }

  function renderFiles(){
    var list = document.getElementById('studio-files-list');
    if(!list) return;
    list.innerHTML = '';

    if(_files.length === 0){
      list.innerHTML = '<div class="studio-files-empty">Aucun fichier. Clique + pour en créer un.</div>';
      return;
    }

    _files.forEach(function(f, i){
      var icon = FILE_ICONS[f.lang] || FILE_ICONS['default'];
      var item = document.createElement('div');
      item.className = 'studio-file-item' + (i === _activeFileIdx ? ' active' : '');
      item.innerHTML = '<span class="studio-file-icon">' + icon + '</span>'
        + '<span class="studio-file-name">' + escapeHtml(f.name) + '</span>'
        + '<span class="studio-file-lang">' + (LANG_MAP[f.lang] || f.lang) + '</span>'
        + '<button class="studio-file-del" title="Supprimer">&times;</button>';
      item.addEventListener('click', function(e){
        if(e.target.classList.contains('studio-file-del')){
          removeFile(i);
          return;
        }
        loadFile(i);
        switchTab('code');
      });
      list.appendChild(item);
    });

    var addBtn = document.createElement('button');
    addBtn.className = 'studio-file-add';
    addBtn.innerHTML = '+ Nouveau fichier';
    addBtn.addEventListener('click', function(){ addFile(); });
    list.appendChild(addBtn);
  }

  function highlightToggle(){
    var toggle = document.getElementById('studio-toggle');
    if(toggle && getCode()) toggle.classList.add('has-code');
  }

  /* ── Resize ── */
  function startResize(e){
    _resizing = true;
    document.getElementById('studio-resize').classList.add('dragging');
    e.preventDefault();
  }
  function doResize(e){
    if(!_resizing) return;
    var w = window.innerWidth - e.clientX;
    w = Math.max(320, Math.min(w, window.innerWidth * 0.7));
    document.documentElement.style.setProperty('--studio-w', w + 'px');
  }
  function stopResize(){
    if(!_resizing) return;
    _resizing = false;
    var el = document.getElementById('studio-resize');
    if(el) el.classList.remove('dragging');
  }

  /* ── Auto-detect code blocks from AI messages ── */
  function watchChatMessages(){
    var observer = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        m.addedNodes.forEach(function(node){
          if(node.nodeType !== 1) return;
          if(!node.classList || !node.classList.contains('cmsg')) return;
          if(!node.classList.contains('a')) return;
          setTimeout(function(){ extractCodeFromMessage(node); }, 500);
        });
      });
    });
    var msgs = document.getElementById('chat-msgs');
    if(msgs) observer.observe(msgs, { childList: true });
  }

  function extractCodeFromMessage(msgEl){
    var blocks = msgEl.querySelectorAll('pre code, pre');
    if(!blocks.length) return;

    blocks.forEach(function(block){
      var codeEl = block.tagName === 'CODE' ? block : block.querySelector('code') || block;
      var code = codeEl.textContent || '';
      if(code.length < 10) return;

      var lang = 'html';
      var cls = codeEl.className || '';
      var m = cls.match(/language-(\w+)/);
      if(m) lang = m[1];

      if(!block._studioBtn){
        var btn = document.createElement('button');
        btn.className = 'studio-btn';
        btn.style.cssText = 'position:absolute;top:4px;right:4px;padding:3px 8px;font-size:10px;z-index:2;';
        btn.textContent = '→ Studio';
        btn.title = 'Envoyer au Studio';
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          injectFromChat(code, lang);
        });
        var wrapper = block.tagName === 'CODE' ? block.parentElement : block;
        wrapper.style.position = 'relative';
        wrapper.appendChild(btn);
        block._studioBtn = true;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    init();
    watchChatMessages();
  });

  return {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    switchTab: switchTab,
    setCode: setCode,
    getCode: getCode,
    injectFromChat: injectFromChat,
    copyCode: copyCode,
    pushToCodex: pushToCodex,
    refreshPreview: refreshPreview,
    clearEditor: clearEditor,
    addFile: addFile,
    changeLang: changeLang
  };

})();

window.TilexStudio = TilexStudio;
