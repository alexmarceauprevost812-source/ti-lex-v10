(function () {
  'use strict';

  var LANG_MAP = {
    js:    { hljs: 'javascript', badge: 'JS',    classe: 'badge-js'    },
    mjs:   { hljs: 'javascript', badge: 'JS',    classe: 'badge-js'    },
    cjs:   { hljs: 'javascript', badge: 'JS',    classe: 'badge-js'    },
    jsx:   { hljs: 'javascript', badge: 'JSX',   classe: 'badge-js'    },
    ts:    { hljs: 'typescript', badge: 'TS',    classe: 'badge-ts'    },
    tsx:   { hljs: 'typescript', badge: 'TSX',   classe: 'badge-ts'    },
    html:  { hljs: 'html',      badge: 'HTML',  classe: 'badge-html'  },
    htm:   { hljs: 'html',      badge: 'HTML',  classe: 'badge-html'  },
    vue:   { hljs: 'html',      badge: 'VUE',   classe: 'badge-html'  },
    css:   { hljs: 'css',       badge: 'CSS',   classe: 'badge-css'   },
    scss:  { hljs: 'scss',      badge: 'SCSS',  classe: 'badge-css'   },
    sass:  { hljs: 'scss',      badge: 'SASS',  classe: 'badge-css'   },
    less:  { hljs: 'less',      badge: 'LESS',  classe: 'badge-css'   },
    json:  { hljs: 'json',      badge: 'JSON',  classe: 'badge-json'  },
    jsonc: { hljs: 'json',      badge: 'JSONC', classe: 'badge-json'  },
    md:    { hljs: null,        badge: 'MD',    classe: 'badge-md'    },
    mdx:   { hljs: null,        badge: 'MDX',   classe: 'badge-md'    },
    py:    { hljs: 'python',    badge: 'PY',    classe: 'badge-py'    },
    sql:   { hljs: 'sql',       badge: 'SQL',   classe: 'badge-sql'   },
    sh:    { hljs: 'bash',      badge: 'SH',    classe: 'badge-autre' },
    bash:  { hljs: 'bash',      badge: 'BASH',  classe: 'badge-autre' },
    yml:   { hljs: 'yaml',      badge: 'YAML',  classe: 'badge-json'  },
    yaml:  { hljs: 'yaml',      badge: 'YAML',  classe: 'badge-json'  },
    toml:  { hljs: 'ini',       badge: 'TOML',  classe: 'badge-json'  },
    xml:   { hljs: 'xml',       badge: 'XML',   classe: 'badge-html'  },
    svg:   { hljs: 'xml',       badge: 'SVG',   classe: 'badge-html'  },
    php:   { hljs: 'php',       badge: 'PHP',   classe: 'badge-autre' },
    rb:    { hljs: 'ruby',      badge: 'RUBY',  classe: 'badge-autre' },
    rs:    { hljs: 'rust',      badge: 'RUST',  classe: 'badge-autre' },
    go:    { hljs: 'go',        badge: 'GO',    classe: 'badge-autre' },
    txt:   { hljs: null,        badge: 'TXT',   classe: 'badge-txt'   },
    log:   { hljs: null,        badge: 'LOG',   classe: 'badge-txt'   },
    env:   { hljs: 'bash',      badge: 'ENV',   classe: 'badge-autre' }
  };

  var ICONES = {
    js: '🟨', jsx: '🟨', ts: '🔷', tsx: '🔷',
    html: '🌐', css: '🎨', scss: '🎨', sass: '🎨',
    json: '📋', md: '📝', mdx: '📝', py: '🐍',
    sql: '🗄️', sh: '⚙️', bash: '⚙️', yml: '📋',
    yaml: '📋', txt: '📄', log: '📄'
  };

  function getExtension(nom) {
    var parts = nom.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'txt';
  }

  function getLangInfo(nom) {
    var ext = getExtension(nom);
    return LANG_MAP[ext] || { hljs: null, badge: ext.toUpperCase(), classe: 'badge-autre' };
  }

  function getIcone(nom) {
    return ICONES[getExtension(nom)] || '📄';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' o';
    return (bytes / 1024).toFixed(1) + ' Ko';
  }

  function compterLignes(contenu) {
    return contenu.split('\n').length;
  }

  function genererNums(n) {
    var html = '';
    for (var i = 1; i <= n; i++) {
      html += '<span>' + i + '</span>';
    }
    return html;
  }

  function creerModalDOM() {
    var overlay = document.createElement('div');
    overlay.className = 'preview-overlay';
    overlay.id = 'tilex-preview-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="preview-modal" id="tilex-preview-modal">' +
        '<div class="preview-header">' +
          '<span class="preview-header-icon" id="preview-icone">📄</span>' +
          '<span class="preview-header-nom" id="preview-nom">fichier.txt</span>' +
          '<span class="preview-header-badge badge-txt" id="preview-badge">TXT</span>' +
          '<div class="preview-header-actions">' +
            '<button class="preview-btn" id="preview-btn-copier">Copier</button>' +
            '<button class="preview-btn" id="preview-btn-dl">⬇ Télécharger</button>' +
            '<button class="preview-btn preview-btn-fermer" id="preview-btn-fermer" title="Fermer (Échap)">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="preview-meta">' +
          '<div class="preview-meta-item">Taille : <span id="preview-taille">—</span></div>' +
          '<div class="preview-meta-item">Lignes : <span id="preview-lignes">—</span></div>' +
          '<div class="preview-meta-item">Encoding : <span>UTF-8</span></div>' +
        '</div>' +
        '<div class="preview-body" id="preview-body"></div>' +
        '<div class="preview-footer">' +
          '<div class="preview-footer-hint">Fermer avec <kbd>Échap</kbd></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function rendreContenu(body, fichier) {
    var ext = getExtension(fichier.nom);
    var langInfo = getLangInfo(fichier.nom);
    body.innerHTML = '';

    if (ext === 'md' || ext === 'mdx') {
      if (typeof marked !== 'undefined') {
        var div = document.createElement('div');
        div.className = 'preview-markdown';
        marked.setOptions({ breaks: true, gfm: true });
        div.innerHTML = marked.parse(fichier.contenu);
        body.appendChild(div);
      } else {
        rendreBrut(body, fichier.contenu);
      }
      return;
    }

    if (!langInfo.hljs) {
      rendreBrut(body, fichier.contenu);
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'preview-code-wrap';

    var nbLignes = compterLignes(fichier.contenu);
    var numsDiv = document.createElement('div');
    numsDiv.className = 'preview-line-nums';
    numsDiv.innerHTML = genererNums(nbLignes);
    wrap.appendChild(numsDiv);

    var pre = document.createElement('pre');
    var code = document.createElement('code');

    try {
      if (typeof hljs !== 'undefined') {
        var langs = hljs.listLanguages();
        if (langs.indexOf(langInfo.hljs) !== -1) {
          code.innerHTML = hljs.highlight(fichier.contenu, {
            language: langInfo.hljs,
            ignoreIllegals: true
          }).value;
          code.className = 'hljs language-' + langInfo.hljs;
        } else {
          code.innerHTML = hljs.highlightAuto(fichier.contenu).value;
          code.className = 'hljs';
        }
      } else {
        code.textContent = fichier.contenu;
        code.className = 'hljs';
      }
    } catch (e) {
      code.textContent = fichier.contenu;
      code.className = 'hljs';
    }

    pre.appendChild(code);
    wrap.appendChild(pre);
    body.appendChild(wrap);

    pre.addEventListener('scroll', function () {
      numsDiv.scrollTop = pre.scrollTop;
    });
  }

  function rendreBrut(body, contenu) {
    var div = document.createElement('div');
    div.className = 'preview-texte-brut';
    div.textContent = contenu;
    body.appendChild(div);
  }

  var fichierCourant = null;
  var overlay = null;

  function ouvrir(fichier) {
    if (!overlay) overlay = creerModalDOM();
    fichierCourant = fichier;

    var langInfo = getLangInfo(fichier.nom);
    var taille = new Blob([fichier.contenu]).size;
    var nbLignes = compterLignes(fichier.contenu);

    document.getElementById('preview-icone').textContent = getIcone(fichier.nom);
    document.getElementById('preview-nom').textContent = fichier.nom;

    var badge = document.getElementById('preview-badge');
    badge.textContent = langInfo.badge;
    badge.className = 'preview-header-badge ' + langInfo.classe;

    document.getElementById('preview-taille').textContent = formatBytes(taille);
    document.getElementById('preview-lignes').textContent = nbLignes;

    rendreContenu(document.getElementById('preview-body'), fichier);

    overlay.classList.add('ouvert');
    document.body.style.overflow = 'hidden';
  }

  function fermer() {
    if (!overlay) return;
    overlay.classList.remove('ouvert');
    document.body.style.overflow = '';
    fichierCourant = null;
    setTimeout(function () {
      var body = document.getElementById('preview-body');
      if (body) body.innerHTML = '';
    }, 200);
  }

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'tilex-preview-overlay') fermer();
    if (e.target && e.target.id === 'preview-btn-fermer') fermer();

    if (e.target && e.target.id === 'preview-btn-copier') {
      if (!fichierCourant) return;
      var btn = e.target;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fichierCourant.contenu).then(function () {
          btn.textContent = '✓ Copié!';
          btn.classList.add('copie-ok');
          setTimeout(function () { btn.textContent = 'Copier'; btn.classList.remove('copie-ok'); }, 1800);
        }).catch(function () { fallbackCopy(fichierCourant.contenu); });
      } else {
        fallbackCopy(fichierCourant.contenu);
      }
    }

    if (e.target && e.target.id === 'preview-btn-dl') {
      if (!fichierCourant) return;
      var blob = new Blob([fichierCourant.contenu], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fichierCourant.nom;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('ouvert')) {
      fermer();
    }
  });

  window.tilexPreview = { ouvrir: ouvrir, fermer: fermer };
})();
