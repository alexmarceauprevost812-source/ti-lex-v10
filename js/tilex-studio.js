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

  /* ── Extensions d'images reconnues ── */
  var IMG_EXTS = ['png','jpg','jpeg','gif','svg','webp','ico','bmp','avif'];

  /* ── Icônes par extension ── */
  var ICONES = {
    'html':'📄','css':'🎨','js':'⚡','json':'📋','python':'🐍','py':'🐍',
    'sql':'🗃️','bash':'🖥️','sh':'🖥️','ts':'💎','tsx':'⚛️','jsx':'⚛️',
    'md':'📝','xml':'📃','yaml':'⚙️','yml':'⚙️','php':'🐘','ruby':'💎',
    'go':'🔵','rust':'🦀','java':'☕','c':'⚙️','cpp':'⚙️',
    'png':'🖼️','jpg':'🖼️','jpeg':'🖼️','gif':'🖼️','svg':'🖼️',
    'webp':'🖼️','ico':'🖼️','bmp':'🖼️','avif':'🖼️','default':'📄'
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

    /* Drag & drop d'images sur le panneau Studio */
    var panel = document.getElementById('studio-panel');
    if(panel){
      panel.addEventListener('dragover', function(e){
        e.preventDefault();
        e.stopPropagation();
        var dz = document.getElementById('studio-dropzone');
        if(dz) dz.classList.add('active');
      });
      panel.addEventListener('dragleave', function(e){
        if(e.relatedTarget && panel.contains(e.relatedTarget)) return;
        var dz = document.getElementById('studio-dropzone');
        if(dz) dz.classList.remove('active');
      });
      panel.addEventListener('drop', function(e){
        e.preventDefault();
        e.stopPropagation();
        var dz = document.getElementById('studio-dropzone');
        if(dz) dz.classList.remove('active');
        traiterFichiersDroppes(e.dataTransfer.files);
      });
    }

    /* Input fichier caché pour le bouton "Ajouter image" */
    var imgInput = document.getElementById('studio-img-input');
    if(imgInput){
      imgInput.addEventListener('change', function(){
        traiterFichiersDroppes(this.files);
        this.value = '';
      });
    }

    /* Fichier initial vide */
    _fichiers.push({ nom:'sans-titre.html', lang:'html', contenu:'', type:'code' });
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

  function validerEtAfficher(){
    var code = obtenirCode();
    var f = _fichiers[_fichierActif];
    var lang = f ? f.lang : 'html';

    if(!code){
      masquerPanneauErreurs();
      return { ok: true, alertes: [] };
    }

    if(typeof TilexGardien === 'undefined'){
      return { ok: true, alertes: [] };
    }

    var resultat = TilexGardien.valider(code, lang);
    afficherPanneauErreurs(resultat);
    return resultat;
  }

  function afficherPanneauErreurs(resultat){
    var panel = document.getElementById('studio-erreurs');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'studio-erreurs';
      panel.className = 'studio-erreurs-panel';
      var editorWrap = document.querySelector('.studio-editor-wrap');
      if(editorWrap) editorWrap.appendChild(panel);
      else return;
    }

    panel.innerHTML = '';
    panel.style.display = 'block';

    if(resultat.ok){
      panel.className = 'studio-erreurs-panel ok';
      panel.innerHTML = '<div class="se-header ok">Aucune erreur</div>';
      setTimeout(function(){ masquerPanneauErreurs(); }, 3000);
      return;
    }

    panel.className = 'studio-erreurs-panel erreur';
    var titre = document.createElement('div');
    titre.className = 'se-header erreur';
    titre.textContent = resultat.resume;
    panel.appendChild(titre);

    resultat.alertes.forEach(function(a){
      var el = document.createElement('div');
      el.className = 'se-ligne ' + a.niveau;
      var ligneInfo = a.ligne > 0 ? ' L' + a.ligne : '';
      el.innerHTML = '<span class="se-badge ' + a.niveau + '">'
        + a.niveau.toUpperCase() + '</span> '
        + '<span class="se-msg">' + a.message + ligneInfo + '</span>';
      if(a.extrait){
        var ext = document.createElement('code');
        ext.className = 'se-extrait';
        ext.textContent = a.extrait;
        el.appendChild(ext);
      }
      panel.appendChild(el);
    });
  }

  function masquerPanneauErreurs(){
    var panel = document.getElementById('studio-erreurs');
    if(panel) panel.style.display = 'none';
  }

  function pousserVersCodex(){
    var code = obtenirCode();
    if(!code){
      if(typeof showToastMsg === 'function') showToastMsg('Rien à envoyer');
      return;
    }

    var resultat = validerEtAfficher();
    if(!resultat.ok && resultat.critiques && resultat.critiques.length > 0){
      if(typeof showToastMsg === 'function') showToastMsg('Push bloqué par le Gardien');
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

    /* Rassembler le HTML, CSS, JS et images de tous les fichiers */
    var html = '', css = '', js = '', images = [];
    for(var i = 0; i < _fichiers.length; i++){
      var f = _fichiers[i];
      if(estImage(f) && f.dataUrl){
        images.push(f);
      } else if(f.lang === 'html') html += f.contenu + '\n';
      else if(f.lang === 'css') css += f.contenu + '\n';
      else if(f.lang === 'js' || f.lang === 'javascript') js += f.contenu + '\n';
    }

    /* Si rien de trouvé, utiliser le fichier actif */
    if(!html && !css && !js && !images.length){
      var fa = _fichiers[_fichierActif];
      if(fa){
        if(estImage(fa) && fa.dataUrl){
          images.push(fa);
        } else if(fa.lang === 'html') html = fa.contenu;
        else if(fa.lang === 'css') css = fa.contenu;
        else if(fa.lang === 'js' || fa.lang === 'javascript') js = fa.contenu;
        else html = '<pre style="font-family:monospace;padding:20px;color:#222;">' + echapperHtml(fa.contenu) + '</pre>';
      }
    }

    /* Ajouter les images en tant que balises <img> si pas de HTML existant les référençant */
    if(images.length && html.indexOf('<img') === -1){
      var imgsHtml = '';
      images.forEach(function(img){
        imgsHtml += '<div style="margin:10px 0;"><img src="' + img.dataUrl
          + '" alt="' + echapperHtml(img.nom)
          + '" style="max-width:100%;border-radius:8px;"></div>\n';
      });
      html = imgsHtml + html;
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

  /* Extraire les blocs <pre><code> et images, ajouter le bouton "→ Studio" */
  function extraireCodeDuMessage(msgEl){
    /* Blocs de code */
    var blocs = msgEl.querySelectorAll('pre code, pre');
    blocs.forEach(function(bloc){
      if(bloc._studioBtn) return;

      var codeEl = bloc.tagName === 'CODE' ? bloc : bloc.querySelector('code') || bloc;
      var code = codeEl.textContent || '';
      if(code.length < 10) return;

      var lang = 'html';
      var cls = codeEl.className || '';
      var m = cls.match(/language-(\w+)/);
      if(m) lang = m[1].toLowerCase();

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

    /* Images dans le message IA → bouton "→ Studio" */
    var imgs = msgEl.querySelectorAll('img');
    imgs.forEach(function(img){
      if(img._studioBtn) return;
      var src = img.src;
      if(!src || src.indexOf('tilex-logo') !== -1) return;

      var wrapper = img.parentElement;
      if(wrapper){
        wrapper.style.position = 'relative';
        var btn = document.createElement('button');
        btn.className = 'studio-inject-btn';
        btn.textContent = '🖼️ Studio';
        btn.title = 'Ajouter l\'image au Studio';
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          e.preventDefault();
          injecterImageDepuisChat(src, img.alt || 'image-chat');
        });
        wrapper.appendChild(btn);
        img._studioBtn = true;
      }
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
     IMAGES — Ajout, preview, drag & drop
     ═══════════════════════════════════════════ */

  function estImage(f){
    return f && f.type === 'image';
  }

  function estExtImage(ext){
    return IMG_EXTS.indexOf((ext||'').toLowerCase()) !== -1;
  }

  /* Traiter les fichiers déposés (drag & drop ou input file) */
  function traiterFichiersDroppes(fileList){
    if(!fileList || !fileList.length) return;
    var count = 0;
    Array.from(fileList).forEach(function(file){
      if(file.type && file.type.startsWith('image/')){
        var reader = new FileReader();
        reader.onload = function(e){
          ajouterImage(file.name, e.target.result, file.size);
          count++;
          if(count === fileList.length) rendreFichiers();
        };
        reader.readAsDataURL(file);
      } else {
        var reader = new FileReader();
        reader.onload = function(e){
          var ext = file.name.split('.').pop().toLowerCase();
          var lang = ext;
          if(!PRISM_LANG[lang] && !estExtImage(lang)) lang = 'html';
          ajouterFichier(file.name, lang, e.target.result);
          count++;
          if(count === fileList.length) rendreFichiers();
        };
        reader.readAsText(file);
      }
    });
    if(!_ouvert) ouvrir();
    changerOnglet('files');
    if(typeof showToastMsg === 'function') showToastMsg(fileList.length + ' fichier(s) ajouté(s)');
  }

  /* Ajouter une image au Studio */
  function ajouterImage(nom, dataUrl, taille){
    var ext = nom.split('.').pop().toLowerCase();
    _fichiers.push({
      nom: nom,
      lang: ext,
      type: 'image',
      contenu: '',
      dataUrl: dataUrl,
      taille: taille || 0
    });
    _fichierActif = _fichiers.length - 1;
    rendreFichiers();
    afficherImage(_fichierActif);
  }

  /* Afficher l'image dans la zone éditeur */
  function afficherImage(idx){
    var f = _fichiers[idx];
    if(!f || f.type !== 'image') return;
    _fichierActif = idx;

    var editorWrap = document.querySelector('.studio-editor-wrap');
    if(!editorWrap) return;

    /* Cacher éditeur et highlight, montrer preview image */
    editorWrap.classList.remove('mode-edit','mode-view');
    editorWrap.classList.add('mode-image');

    /* Créer ou réutiliser le conteneur de preview image */
    var preview = document.getElementById('studio-img-view');
    if(!preview){
      preview = document.createElement('div');
      preview.id = 'studio-img-view';
      preview.className = 'studio-img-preview';
      editorWrap.appendChild(preview);
    }

    var dims = '';
    var img = new Image();
    img.src = f.dataUrl;
    img.onload = function(){
      dims = img.naturalWidth + ' × ' + img.naturalHeight + ' px';
      var info = preview.querySelector('.sip-info');
      if(info) info.innerHTML = '<strong>' + echapperHtml(f.nom) + '</strong><br>'
        + dims + ' · ' + formaterTaille(f.taille);
    };

    preview.innerHTML = '';
    var imgEl = document.createElement('img');
    imgEl.src = f.dataUrl;
    imgEl.alt = f.nom;
    preview.appendChild(imgEl);

    var info = document.createElement('div');
    info.className = 'sip-info';
    info.innerHTML = '<strong>' + echapperHtml(f.nom) + '</strong><br>Chargement...';
    preview.appendChild(info);

    /* Mettre à jour la barre de langage */
    var langBar = document.querySelector('.studio-lang-bar');
    if(langBar) langBar.style.display = 'none';

    rendreFichiers();
  }

  /* Revenir au mode éditeur de code (quitter le mode image) */
  function quitterModeImage(){
    var editorWrap = document.querySelector('.studio-editor-wrap');
    if(!editorWrap) return;
    editorWrap.classList.remove('mode-image');
    var imgView = document.getElementById('studio-img-view');
    if(imgView) imgView.remove();
    var langBar = document.querySelector('.studio-lang-bar');
    if(langBar) langBar.style.display = '';
  }

  function formaterTaille(octets){
    if(!octets) return '';
    if(octets < 1024) return octets + ' o';
    if(octets < 1048576) return (octets / 1024).toFixed(1) + ' Ko';
    return (octets / 1048576).toFixed(1) + ' Mo';
  }

  /* Ouvrir le sélecteur de fichiers image */
  function ouvrirSelecteurImage(){
    var input = document.getElementById('studio-img-input');
    if(input) input.click();
  }

  /* Injecter une image depuis le chat (img src en data URL ou URL) */
  function injecterImageDepuisChat(src, alt){
    if(src.startsWith('data:')){
      var ext = 'png';
      var m = src.match(/data:image\/(\w+)/);
      if(m) ext = m[1];
      ajouterImage(alt || ('image.' + ext), src, 0);
    } else {
      /* URL externe : fetch et convertir en data URL */
      fetch(src).then(function(r){ return r.blob(); }).then(function(blob){
        var reader = new FileReader();
        reader.onload = function(e){
          var ext = src.split('.').pop().split('?')[0].toLowerCase();
          if(!estExtImage(ext)) ext = 'png';
          ajouterImage(alt || ('image.' + ext), e.target.result, blob.size);
        };
        reader.readAsDataURL(blob);
      }).catch(function(){
        if(typeof showToastMsg === 'function') showToastMsg('Impossible de charger l\'image');
      });
    }
    if(!_ouvert) ouvrir();
    changerOnglet('files');
  }


  /* ═══════════════════════════════════════════
     GESTION DES FICHIERS
     ═══════════════════════════════════════════ */

  function ajouterFichier(nom, lang, contenu){
    lang = lang || 'html';
    nom = nom || ('fichier-' + (_fichiers.length + 1) + '.' + lang);
    _fichiers.push({ nom: nom, lang: lang, contenu: contenu || '', type:'code' });
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

    /* Si c'est une image, afficher la preview image */
    if(estImage(f)){
      afficherImage(idx);
      return;
    }

    /* Sinon c'est du code — quitter le mode image si actif */
    quitterModeImage();
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
      var isImg = estImage(f);
      var ico = ICONES[f.lang] || ICONES['default'];
      var nomLang = NOMS_LANG[f.lang] || f.lang.toUpperCase();
      var el = document.createElement('div');
      el.className = 'studio-file' + (i === _fichierActif ? ' active' : '') + (isImg ? ' img-file' : '');

      if(isImg && f.dataUrl){
        /* Afficher une miniature pour les images */
        el.innerHTML = '<img class="studio-file-thumb" src="' + f.dataUrl + '" alt="' + echapperHtml(f.nom) + '">'
          + '<span class="studio-file-name">' + echapperHtml(f.nom)
          + '<span class="studio-file-size">' + formaterTaille(f.taille) + '</span></span>'
          + '<span class="studio-file-ext">' + (f.lang || 'IMG').toUpperCase() + '</span>'
          + '<button class="studio-file-del" title="Supprimer">&times;</button>';
      } else {
        el.innerHTML = '<span class="studio-file-ico">' + ico + '</span>'
          + '<span class="studio-file-name">' + echapperHtml(f.nom) + '</span>'
          + '<span class="studio-file-ext">' + nomLang + '</span>'
          + '<button class="studio-file-del" title="Supprimer">&times;</button>';
      }

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

    /* Bouton + Ajouter image */
    var imgAjout = document.createElement('button');
    imgAjout.className = 'studio-file-img-add';
    imgAjout.innerHTML = '🖼️ Ajouter image';
    imgAjout.addEventListener('click', function(){ ouvrirSelecteurImage(); });
    liste.appendChild(imgAjout);
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
    ajouterImage: ajouterImage,
    ouvrirSelecteurImage: ouvrirSelecteurImage,
    injecterImageDepuisChat: injecterImageDepuisChat,
    changerLang: changerLang,
    coloriserCode: coloriserCode,
    /* Alias anglais */
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
    addImage: ajouterImage,
    injectImageFromChat: injecterImageDepuisChat,
    changeLang: changerLang,
    validerEtAfficher: validerEtAfficher,
    validate: validerEtAfficher
  };

})();

window.TilexStudio = TilexStudio;
