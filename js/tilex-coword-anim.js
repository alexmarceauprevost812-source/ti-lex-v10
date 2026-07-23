/* ============================================================
   js/tilex-coword-anim.js — Coword animé + coloration du code
   ti-lex-AL v10 — Alex Marceau-Prévost
   • Schéma animé étape par étape (💻 Codeur → 🔍 Réviseur →
     🧪 Testeur → 🛡️ Gardien) : ligne ORANGE qui coule pendant
     qu'une étape travaille, ligne VERTE quand elle est finie.
   • Coloration syntaxique des mots-clés dans le code écrit.
   API :
     TilexCowordAnim.injecterStyle()
     TilexCowordAnim.pipelineHTML(tasks)   -> schéma animé
     TilexCowordAnim.colorer(code, lang)   -> code coloré (HTML)
     TilexCowordAnim.rendreResultat(texte) -> prose + blocs colorés
   ============================================================ */

const TilexCowordAnim = (() => {

  const ORDRE  = ['codeur', 'reviseur', 'testeur', 'gardien'];
  const ICONES = { codeur: '💻', reviseur: '🔍', testeur: '🧪', gardien: '🛡️' };
  const NOMS   = { codeur: 'Codeur', reviseur: 'Réviseur', testeur: 'Testeur', gardien: 'Gardien' };
  const CLS    = { pending: 'st-pending', en_cours: 'st-run', fini: 'st-done', erreur: 'st-err' };

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ─── Mots-clés par langage ─── */
  const KW = {
    js: ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','class','extends','super','this','async','await','try','catch','finally','throw','typeof','instanceof','import','export','default','from','of','in','yield','static','get','set','delete','void','null','true','false','undefined'],
    css: ['important','from','to','and','or','not','only','media','keyframes','import','supports','var','calc','inherit','initial','unset','none','auto','flex','grid','block','inline','absolute','relative','fixed','sticky'],
    py: ['def','return','if','elif','else','for','while','import','from','as','class','try','except','finally','with','lambda','yield','pass','break','continue','and','or','not','in','is','None','True','False','global','nonlocal','raise','async','await'],
    sql: ['select','from','where','insert','into','values','update','set','delete','create','table','alter','drop','join','left','right','inner','outer','on','group','by','order','having','limit','and','or','not','null','primary','key','foreign','references','default','as','distinct'],
  };
  function _langKey(lang) {
    const l = (lang || '').toLowerCase();
    if (/^(js|javascript|jsx|ts|typescript|tsx|mjs|cjs|json)$/.test(l)) return 'js';
    if (/^(css|scss|less)$/.test(l)) return 'css';
    if (/^(py|python)$/.test(l)) return 'py';
    if (/^(sql)$/.test(l)) return 'sql';
    if (/^(sh|bash|shell|zsh)$/.test(l)) return 'py'; // set proche (mots + # commentaires)
    return 'js';
  }
  const _reCache = {};
  function _kwRe(key) {
    if (_reCache[key]) return _reCache[key];
    const list = KW[key] || KW.js;
    const re = new RegExp('\\b(' + list.join('|') + ')\\b', 'g');
    _reCache[key] = re; return re;
  }

  /* ─── Coloration d'un bloc de code (retourne du HTML échappé) ─── */
  function colorer(code, lang) {
    code = String(code == null ? '' : code);
    const key = _langKey(lang);
    const hash = /^(py|sql)$/.test(key) || /^(sh|bash|shell|zsh|yaml|yml|toml|env|ruby|rb)$/.test((lang || '').toLowerCase());
    const comPart = hash
      ? '\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*|<!--[\\s\\S]*?-->|#[^\\n]*'
      : '\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*|<!--[\\s\\S]*?-->';
    const re = new RegExp('(' + comPart + ')|("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`)|(\\b\\d[\\d._]*\\b)', 'g');
    const kwRe = _kwRe(key);

    function gap(txt) { return _esc(txt).replace(kwRe, '<span class="tk-kw">$1</span>'); }

    let out = '', last = 0, m;
    while ((m = re.exec(code)) !== null) {
      out += gap(code.slice(last, m.index));
      if (m[1])      out += '<span class="tk-com">' + _esc(m[1]) + '</span>';
      else if (m[2]) out += '<span class="tk-str">' + _esc(m[2]) + '</span>';
      else if (m[3]) out += '<span class="tk-num">' + _esc(m[3]) + '</span>';
      last = re.lastIndex;
      if (m.index === re.lastIndex) re.lastIndex++; // sécurité anti-boucle
    }
    out += gap(code.slice(last));
    return out;
  }

  /* ─── Rend un résultat d'agent : prose échappée + code coloré ─── */
  function rendreResultat(texte) {
    if (!texte) return '';
    const parts = String(texte).split(/(```[^\n`]*\n[\s\S]*?```)/g);
    return parts.map((seg) => {
      const m = seg.match(/^```([^\n`]*)\n([\s\S]*?)```$/);
      if (m) {
        const info = (m[1] || '').trim();
        const lang = (info.split(/\s+/)[0] || '').replace(/[^\w.-]/g, '');
        return '<pre class="cw-code">' + colorer(m[2].replace(/\s+$/, ''), lang) + '</pre>';
      }
      return '<span class="cw-prose">' + _esc(seg) + '</span>';
    }).join('');
  }

  /* ─── Schéma animé du pipeline ─── */
  function pipelineHTML(tasks) {
    const parAgent = {};
    (tasks || []).forEach((t) => { if (t && t.agent) parAgent[String(t.agent).toLowerCase()] = t; });

    let html = '<div class="cw-pipe">';
    ORDRE.forEach((ag, i) => {
      const t = parAgent[ag];
      const statut = t ? (t.statut || 'pending') : 'pending';
      const cls = CLS[statut] || 'st-pending';
      // Étape
      html += `<div class="cw-step ${cls}">
        <div class="cw-node">${ICONES[ag]}</div>
        <div class="cw-lbl">${NOMS[ag]}</div>
      </div>`;
      // Lien vers l'étape suivante : prend l'état de CETTE étape
      // (verte quand finie, orange qui coule quand en cours).
      if (i < ORDRE.length - 1) html += `<div class="cw-link ${cls}"></div>`;
    });
    html += '</div>';
    return html;
  }

  /* ─── Styles (une seule fois) ─── */
  function injecterStyle() {
    if (document.getElementById('tilex-coword-anim-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-coword-anim-style';
    s.textContent = `
      .cw-pipe{display:flex;align-items:flex-start;justify-content:space-between;gap:2px;
        padding:14px 6px 6px;margin-bottom:10px;}
      .cw-step{display:flex;flex-direction:column;align-items:center;width:64px;flex:0 0 auto;}
      .cw-node{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        font-size:18px;border:2px solid #30363d;background:#101017;transition:all .3s;}
      .cw-lbl{font-size:10px;margin-top:5px;color:#8b949e;text-align:center;transition:color .3s;}
      .cw-link{flex:1;height:4px;border-radius:3px;background:#23232e;margin:18px 2px 0;overflow:hidden;transition:background .3s;}
      /* En attente */
      .cw-step.st-pending .cw-node{border-color:#30363d;color:#6e7681;}
      /* En cours : orange qui pulse + ligne orange qui coule */
      .cw-step.st-run .cw-node{border-color:#ff7a00;color:#ff7a00;background:#241400;
        animation:cwPulse 1.2s infinite;}
      .cw-step.st-run .cw-lbl{color:#ff7a00;font-weight:700;}
      .cw-link.st-run{
        background-image:linear-gradient(90deg,#ff7a00 25%,#5a2c00 25% 50%,#ff7a00 50% 75%,#5a2c00 75%);
        background-size:22px 100%;animation:cwFlow .55s linear infinite;}
      /* Fini : vert */
      .cw-step.st-done .cw-node{border-color:#3fb950;color:#3fb950;background:#0f2a17;}
      .cw-step.st-done .cw-lbl{color:#3fb950;}
      .cw-link.st-done{background:#3fb950;}
      /* Erreur : rouge */
      .cw-step.st-err .cw-node{border-color:#f85149;color:#f85149;background:#2a1414;}
      .cw-step.st-err .cw-lbl{color:#f85149;}
      .cw-link.st-err{background:#f85149;}
      @keyframes cwPulse{0%{box-shadow:0 0 0 0 rgba(255,122,0,.55);}70%{box-shadow:0 0 0 9px rgba(255,122,0,0);}100%{box-shadow:0 0 0 0 rgba(255,122,0,0);}}
      @keyframes cwFlow{to{background-position:22px 0;}}
      /* Code coloré */
      pre.cw-code{margin:8px 0;padding:11px;background:#05050a;border:1px solid #1c1c26;border-radius:9px;
        overflow-x:auto;font-family:'Share Tech Mono',ui-monospace,Menlo,monospace;font-size:12px;line-height:1.55;
        color:#c9d1d9;white-space:pre;}
      .cw-prose{white-space:pre-wrap;}
      .tk-kw{color:#ff7b72;}
      .tk-str{color:#a5d6ff;}
      .tk-com{color:#8b949e;font-style:italic;}
      .tk-num{color:#79c0ff;}
    `;
    document.head.appendChild(s);
  }

  return { injecterStyle, pipelineHTML, colorer, rendreResultat };

})();

window.TilexCowordAnim = TilexCowordAnim;
