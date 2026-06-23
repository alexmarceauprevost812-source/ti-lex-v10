/* ══════════════════════════════════════════════════
   TilexStudio — Panneau split-view code + preview
   Produit du Québec ⚜️
   ══════════════════════════════════════════════════ */

var TilexStudio = (function(){

  /* ── État interne ── */
  var _ouvert = false;
  var _onglet = 'code';
  var _fichiers = [];
  var _fichierActif = 0;
  var _resize = false;
  var _modeEdit = true;

  /* ── Correspondance langage → Prism ── */
  var PRISM_LANG = {
    'html':'markup','css':'css','js':'javascript','javascript':'javascript',
    'json':'json','python':'python','py':'python','sql':'sql',
    'bash':'bash','sh':'bash','ts':'typescript','typescript':'typescript',
    'jsx':'jsx','tsx':'tsx','markdown':'markdown','md':'markdown',
    'xml':'markup','yaml':'yaml','yml':'yaml','php':'php','ruby':'ruby',
    'go':'go','rust':'rust','java':'java','c':'c','cpp':'cpp'
  };

  /* ── Icônes par extension ── */
  var ICONES = {
    'html':'📄','css':'🎨','js':'⚡','json':'📋','python':'🐍','py':'🐍',
    'sql':'🗃️','bash':'🖥️','sh':'🖥️','ts':'💎','tsx':'⚛️','jsx':'⚛️',
    'md':'📝','xml':'📃','yaml':'⚙️','yml':'⚙️','php':'🐘','ruby':'💎',
    'go':'🔵','rust':'🦀','java':'☕','c':'⚙️','cpp':'⚙️','default':'📄'
  };

  /* ── Noms de langages pour l'affichage ── */
  var NOMS_LANG = {
    'html':'HTML','css':'CSS','js':'JavaScript','javascript':'JavaScript',
    'json':'JSON','python':'Python','py':'Python','sql':'SQL',
    'bash':'Bash','sh':'Bash','ts':'TypeScript','typescript':'TypeScript',
    'jsx':'JSX','tsx':'TSX','md':'Markdown','yaml':'YAML','yml':'YAML',
    'xml':'XML','php':'PHP','ruby':'Ruby','go':'Go','rust':'Rust',
    'java':'Java','c':'C','cpp':'C++'
  };


  /* ═══════════════════════════════════════════
     1. INITIALISATION
     ═══════════════════════════════════════════ */

  function init(){
    /* Bouton ⚡ Studio dans le header */
    var hdrBtn = document.getElementById('studio-hdr-btn');
    if(hdrBtn) hdrBtn.addEventListener('click', basculer);

    /* Onglets */
    document.querySelectorAll('.studio-tab').forEach(function(tab){
      tab.addEventListener('click', function(){ changerOnglet(this.dataset.tab); });
    });

    /* Éditeur : événements */
    var editor = document.getElementById('studio-editor');
    if(editor){
      editor.addEventListener('input', surEdition);
      editor.addEventListener('keydown', surTouche);
      editor.addEventListener('focus', function(){ modeEdition(true); });
    }

    /* Poignée de redimensionnement */
    var poignee = document.getElementById('studio-resize');
    if(poignee){
      poignee.addEventListener('mousedown', debutResize);
      document.addEventListener('mousemove', enResize);
      document.addEventListener('mouseup', finResize);
      poignee.addEventListener('touchstart', function(e){ debutResize(e.touches[0]); }, {passive:true});
      document.addEventListener('touchmove', function(e){ if(_resize) enResize(e.touches[0]); }, {passive:true});
      document.addEventListener('touchend', finResize);
    }

    /* Fichier initial vide */
    _fichiers.push({ nom:'sans-titre.html', lang:'html', contenu:'' });
    rendreFichiers();
    majLangSel();
    majCompteur();

    /* Observer les messages du chat pour l'injection auto */
    observerChat();
  }


  /* ═══════════════════════════════════════════
     2. OUVERTURE / FERMETURE (animation fluide)
     ═══════════════════════════════════════════ */

  function ouvrir(){
    _ouvert = true;
    document.body.classList.add('studio-open');
    var btn = document.getElementById('studio-hdr-btn');
    if(btn){ btn.classList.add('active'); btn.classList.remove('has-code'); }
    var editor = document.getElementById('studio-editor');
    if(editor) editor.focus();
  }

  function fermer(){
    _ouvert = false;
    document.body.classList.remove('studio-open');
    var btn = document.getElementById('studio-hdr-btn');
    if(btn) btn.classList.remove('active');
  }

  function basculer(){
    _ouvert ? fermer() : ouvrir();
  }

  function estOuvert(){ return _ouvert; }


  /* ═══════════════════════════════════════════
     3. ONGLETS : Code / Preview / Fichiers
     ═══════════════════════════════════════════ */

  function changerOnglet(tab){
    _onglet = tab;
    document.querySelectorAll('.studio-tab').forEach(function(t){
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.studio-pane').forEach(function(p){
      p.classList.toggle('active', p.id === 'studio-pane-' + tab);
    });
    /* Rafraîchir la preview si on change vers cet onglet */
    if(tab === 'preview') rafraichirPreview();
    /* Coloriser le code si on passe en mode lecture */
    if(tab === 'code') coloriserCode();
  }


  /* ═══════════════════════════════════════════
     4. ÉDITEUR DE CODE + COLORATION PRISM.JS
     ═══════════════════════════════════════════ */

  function surEdition(){
    var editor = document.getElementById('studio-editor');
    if(!editor) return;
    var f = _fichiers[_fichierActif];
    if(f) f.contenu = editor.value;
    majCompteur();
  }

  /* Tabulation insère 2 espaces au lieu de quitter le champ */
  function surTouche(e){
    if(e.key === 'Tab'){
      e.preventDefault();
      var ed = e.target;
      var s = ed.selectionStart, end = ed.selectionEnd;
      ed.value = ed.value.substring(0, s) + '  ' + ed.value.substring(end);
      ed.selectionStart = ed.selectionEnd = s + 2;
      surEdition();
    }
    /* Ctrl+S / Cmd+S → coloriser */
    if((e.ctrlKey || e.metaKey) && e.key === 's'){
      e.preventDefault();
      modeEdition(false);
      coloriserCode();
    }
  }

  /* Basculer entre mode édition (textarea) et mode lecture (Prism) */
  function modeEdition(edit){
    _modeEdit = edit;
    var wrap = document.querySelector('.studio-editor-wrap');
    if(!wrap) return;
    wrap.classList.toggle('mode-edit', edit);
    wrap.classList.toggle('mode-view', !edit);
    if(!edit) coloriserCode();
  }

  /* Appliquer la coloration syntaxique Prism.js */
  function coloriserCode(){
    if(typeof Prism === 'undefined') return;
    var f = _fichiers[_fichierActif];
    if(!f) return;
    var hlWrap = document.getElementById('studio-highlight');
    if(!hlWrap) return;

    var prismLang = PRISM_LANG[f.lang] || 'markup';
    var grammar = Prism.languages[prismLang] || Prism.languages.markup;

    var codeEl = document.createElement('code');
    codeEl.className = 'language-' + prismLang;
    codeEl.textContent = f.contenu;

    var preEl = document.createElement('pre');
    preEl.className = 'language-' + prismLang;
    preEl.appendChild(codeEl);

    hlWrap.innerHTML = '';
    hlWrap.appendChild(preEl);

    Prism.highlightElement(codeEl);

    /* Clic sur le code colorisé → retour en édition */
    preEl.addEventListener('click', function(){ modeEdition(true); });
  }

  function majCompteur(){
    var editor = document.getElementById('studio-editor');
    var ct = document.getElementById('studio-char-ct');
    if(!editor || !ct) return;
    var lignes = editor.value.split('\n').length;
    ct.textContent = editor.value.length + ' car · ' + lignes + ' lig';
  }

  function majLangSel(){
    var sel = document.getElementById('studio-lang-sel');
    if(!sel) return;
    var f = _fichiers[_fichierActif];
    if(f) sel.value = f.lang;
  }

  function changerLang(lang){
    var f = _fichiers[_fichierActif];
    if(f){
      f.lang = lang;
      f.nom = f.nom.replace(/\.[^.]+$/, '') + '.' + lang;
      rendreFichiers();
      coloriserCode();
    }
  }

  function obtenirCode(){
    var editor = document.getElementById('studio-editor');
    return editor ? editor.value : '';
  }

  function definirCode(code, lang){
    var editor = document.getElementById('studio-editor');
    if(!editor) return;
    editor.value = code;
    var f = _fichiers[_fichierActif];
    if(f){
      f.contenu = code;
      if(lang){
        f.lang = lang;
        f.nom = f.nom.replace(/\.[^.]+$/, '') + '.' + lang;
      }
    }
    majLangSel();
    majCompteur();
    modeEdition(false);
    coloriserCode();
    signalerCode();
  }


  /* ═══════════════════════════════════════════
     5. BOUTON 📋 COPIER
     ═══════════════════════════════════════════ */

  function copierCode(){
    var code = obtenirCode();
    if(!code){
      if(typeof showToastMsg === 'function') showToastMsg('Rien à copier');
      return;
    }
    navigator.clipboard.writeText(code).then(function(){
      if(typeof showToastMsg === 'function') showToastMsg('Code copié !');
    });
  }


  /* ═══════════════════════════════════════════
     6. BOUTON 🚀 PUSH (TilexPush → ti-lex-code)
     ═══════════════════════════════════════════ */

  function pousserVersCodex(){
    var code = obtenirCode();
    if(!code){
      if(typeof showToastMsg === 'function') showToastMsg('Rien à envoyer');
      return;
    }
    var f = _fichiers[_fichierActif];
    var lang = f ? f.lang : 'html';
    var nom = f ? f.nom : 'code.html';

    /* Utilise TilexPush si disponible (intégration ti-lex-code) */
    if(window.TilexPush && typeof window.TilexPush === 'function'){
      window.TilexPush({ nom: nom, lang: lang, code: code });
      if(typeof showToastMsg === 'function') showToastMsg('Envoyé via TilexPush !');
      return;
    }

    /* Fallback : envoyerVersCodex (Edge Function) */
    if(typeof envoyerVersCodex === 'function'){
      envoyerVersCodex(
        'Studio: ' + nom,
        'Intègre ce code (' + lang + '):\n```' + lang + '\n' + code + '\n```',
        []
      );
      if(typeof showToastMsg === 'function') showToastMsg('Envoyé à TILEXCODE !');
      return;
    }

    /* Dernier recours : copier et naviguer */
    navigator.clipboard.writeText(code);
    if(typeof showTab === 'function') showTab('codex');
    if(typeof showToastMsg === 'function') showToastMsg('Code copié — colle-le dans TILEXCODE');
  }


  /* ═══════════════════════════════════════════
     7. PREVIEW LIVE (iframe sandboxé)
     ═══════════════════════════════════════════ */

  function rafraichirPreview(){
    var iframe = document.getElementById('studio-preview-frame');
    if(!iframe) return;

    /* Rassembler le HTML, CSS et JS de tous les fichiers */
    var html = '', css = '', js = '';
    for(var i = 0; i < _fichiers.length; i++){
      var f = _fichiers[i];
      if(f.lang === 'html') html += f.contenu + '\n';
      else if(f.lang === 'css') css += f.contenu + '\n';
      else if(f.lang === 'js' || f.lang === 'javascript') js += f.contenu + '\n';
    }

    /* Si rien de trouvé, utiliser le fichier actif */
    if(!html && !css && !js){
      var fa = _fichiers[_fichierActif];
      if(fa){
        if(fa.lang === 'html') html = fa.contenu;
        else if(fa.lang === 'css') css = fa.contenu;
        else if(fa.lang === 'js' || fa.lang === 'javascript') js = fa.contenu;
        else html = '<pre style="font-family:monospace;padding:20px;color:#222;">' + echapperHtml(fa.contenu) + '</pre>';
      }
    }

    /* Construire le document complet */
    var doc = html;
    if(doc.indexOf('<html') === -1){
      doc = '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<style>*{box-sizing:border-box;}body{font-family:system-ui,sans-serif;margin:16px;color:#222;}'
        + css + '</style></head><body>'
        + html + '<script>' + js + '<\/script></body></html>';
    } else {
      if(css) doc = doc.replace('</head>', '<style>' + css + '</style></head>');
      if(js) doc = doc.replace('</body>', '<script>' + js + '<\/script></body>');
    }

    /* Injecter via blob URL */
    var blob = new Blob([doc], {type:'text/html'});
    iframe.src = URL.createObjectURL(blob);
  }


  /* ═══════════════════════════════════════════
     8. INJECTION AUTO depuis le chat
     ═══════════════════════════════════════════ */

  /* Observer les nouveaux messages IA dans le chat */
  function observerChat(){
    var observer = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        m.addedNodes.forEach(function(node){
          if(node.nodeType !== 1) return;
          if(!node.classList || !node.classList.contains('cmsg')) return;
          if(!node.classList.contains('a')) return;
          /* Attendre que le rendu Markdown soit terminé */
          setTimeout(function(){ extraireCodeDuMessage(node); }, 800);
        });
      });
    });
    var msgs = document.getElementById('chat-msgs');
    if(msgs) observer.observe(msgs, { childList: true });
  }

  /* Extraire les blocs <pre><code> et ajouter le bouton "→ Studio" */
  function extraireCodeDuMessage(msgEl){
    var blocs = msgEl.querySelectorAll('pre code, pre');
    if(!blocs.length) return;

    blocs.forEach(function(bloc){
      if(bloc._studioBtn) return;

      var codeEl = bloc.tagName === 'CODE' ? bloc : bloc.querySelector('code') || bloc;
      var code = codeEl.textContent || '';
      if(code.length < 10) return;

      /* Détecter le langage depuis la classe CSS */
      var lang = 'html';
      var cls = codeEl.className || '';
      var m = cls.match(/language-(\w+)/);
      if(m) lang = m[1].toLowerCase();

      /* Créer le bouton d'injection */
      var btn = document.createElement('button');
      btn.className = 'studio-inject-btn';
      btn.textContent = '→ Studio';
      btn.title = 'Envoyer au Studio';
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        e.preventDefault();
        injecterDepuisChat(code, lang);
      });

      var wrapper = bloc.tagName === 'CODE' ? bloc.parentElement : bloc;
      wrapper.style.position = 'relative';
      wrapper.appendChild(btn);
      bloc._studioBtn = true;
    });
  }

  /* Injecter le code dans le Studio et l'ouvrir */
  function injecterDepuisChat(code, lang){
    lang = (lang || 'html').toLowerCase();
    if(!PRISM_LANG[lang]) lang = 'html';

    /* Chercher un fichier vide du même langage, sinon en créer un nouveau */
    var trouve = false;
    for(var i = 0; i < _fichiers.length; i++){
      if(_fichiers[i].lang === lang && !_fichiers[i].contenu){
        _fichierActif = i;
        trouve = true;
        break;
      }
    }
    if(!trouve){
      if(_fichiers.length === 1 && !_fichiers[0].contenu){
        _fichierActif = 0;
      } else {
        _fichiers.push({
          nom: 'code-' + (_fichiers.length + 1) + '.' + lang,
          lang: lang,
          contenu: ''
        });
        _fichierActif = _fichiers.length - 1;
      }
    }

    definirCode(code, lang);
    rendreFichiers();

    if(!_ouvert) ouvrir();
    changerOnglet('code');
    if(typeof showToastMsg === 'function') showToastMsg('Code injecté dans le Studio');
  }


  /* ═══════════════════════════════════════════
     GESTION DES FICHIERS
     ═══════════════════════════════════════════ */

  function ajouterFichier(nom, lang, contenu){
    lang = lang || 'html';
    nom = nom || ('fichier-' + (_fichiers.length + 1) + '.' + lang);
    _fichiers.push({ nom: nom, lang: lang, contenu: contenu || '' });
    _fichierActif = _fichiers.length - 1;
    rendreFichiers();
    chargerFichier(_fichierActif);
  }

  function supprimerFichier(idx){
    if(_fichiers.length <= 1) return;
    _fichiers.splice(idx, 1);
    if(_fichierActif >= _fichiers.length) _fichierActif = _fichiers.length - 1;
    rendreFichiers();
    chargerFichier(_fichierActif);
  }

  function chargerFichier(idx){
    if(idx < 0 || idx >= _fichiers.length) return;
    _fichierActif = idx;
    var f = _fichiers[idx];
    var editor = document.getElementById('studio-editor');
    if(editor) editor.value = f.contenu;
    majLangSel();
    majCompteur();
    rendreFichiers();
    modeEdition(false);
    coloriserCode();
  }

  function rendreFichiers(){
    var liste = document.getElementById('studio-files-list');
    if(!liste) return;
    liste.innerHTML = '';

    if(_fichiers.length === 0){
      liste.innerHTML = '<div class="studio-files-vide">Aucun fichier.<br>Clique <strong>+</strong> pour en créer un.</div>';
      return;
    }

    _fichiers.forEach(function(f, i){
      var ico = ICONES[f.lang] || ICONES['default'];
      var nomLang = NOMS_LANG[f.lang] || f.lang.toUpperCase();
      var el = document.createElement('div');
      el.className = 'studio-file' + (i === _fichierActif ? ' active' : '');
      el.innerHTML = '<span class="studio-file-ico">' + ico + '</span>'
        + '<span class="studio-file-name">' + echapperHtml(f.nom) + '</span>'
        + '<span class="studio-file-ext">' + nomLang + '</span>'
        + '<button class="studio-file-del" title="Supprimer">&times;</button>';
      el.addEventListener('click', function(e){
        if(e.target.classList.contains('studio-file-del')){
          supprimerFichier(i);
          return;
        }
        chargerFichier(i);
        changerOnglet('code');
      });
      liste.appendChild(el);
    });

    /* Bouton + Nouveau fichier */
    var ajout = document.createElement('button');
    ajout.className = 'studio-file-ajout';
    ajout.innerHTML = '+ Nouveau fichier';
    ajout.addEventListener('click', function(){ ajouterFichier(); });
    liste.appendChild(ajout);
  }

  function viderEditeur(){
    var editor = document.getElementById('studio-editor');
    if(editor) editor.value = '';
    var f = _fichiers[_fichierActif];
    if(f) f.contenu = '';
    majCompteur();
    var hlWrap = document.getElementById('studio-highlight');
    if(hlWrap) hlWrap.innerHTML = '';
  }


  /* ═══════════════════════════════════════════
     REDIMENSIONNEMENT DU PANNEAU
     ═══════════════════════════════════════════ */

  function debutResize(e){
    _resize = true;
    var el = document.getElementById('studio-resize');
    if(el) el.classList.add('dragging');
    if(e && e.preventDefault) e.preventDefault();
  }

  function enResize(e){
    if(!_resize) return;
    var w = window.innerWidth - (e.clientX || e.pageX);
    w = Math.max(320, Math.min(w, window.innerWidth * 0.75));
    document.documentElement.style.setProperty('--studio-w', w + 'px');
  }

  function finResize(){
    if(!_resize) return;
    _resize = false;
    var el = document.getElementById('studio-resize');
    if(el) el.classList.remove('dragging');
  }


  /* ═══════════════════════════════════════════
     UTILITAIRES
     ═══════════════════════════════════════════ */

  function echapperHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function signalerCode(){
    var btn = document.getElementById('studio-hdr-btn');
    if(btn && obtenirCode()) btn.classList.add('has-code');
  }


  /* ═══════════════════════════════════════════
     AUTO-INIT AU DOMContentLoaded
     ═══════════════════════════════════════════ */

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }


  /* ═══════════════════════════════════════════
     API PUBLIQUE — window.TilexStudio
     ═══════════════════════════════════════════ */

  return {
    ouvrir: ouvrir,
    fermer: fermer,
    basculer: basculer,
    estOuvert: estOuvert,
    changerOnglet: changerOnglet,
    definirCode: definirCode,
    obtenirCode: obtenirCode,
    injecterDepuisChat: injecterDepuisChat,
    copierCode: copierCode,
    pousserVersCodex: pousserVersCodex,
    rafraichirPreview: rafraichirPreview,
    viderEditeur: viderEditeur,
    ajouterFichier: ajouterFichier,
    changerLang: changerLang,
    coloriserCode: coloriserCode,
    /* Alias anglais pour compatibilité */
    open: ouvrir,
    close: fermer,
    toggle: basculer,
    isOpen: estOuvert,
    switchTab: changerOnglet,
    setCode: definirCode,
    getCode: obtenirCode,
    injectFromChat: injecterDepuisChat,
    copyCode: copierCode,
    pushToCodex: pousserVersCodex,
    refreshPreview: rafraichirPreview,
    clearEditor: viderEditeur,
    addFile: ajouterFichier,
    changeLang: changerLang
  };

})();

window.TilexStudio = TilexStudio;
