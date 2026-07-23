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
  const AVATAR = '/assets/coword-tilex.png';

  // Ce que chaque agent FAIT (verbe d'action affiché à côté de l'image)
  // resume = phrase au passé, style Claude Code (« A utilisé 4 outils, édité un fichier »)
  const ACTIONS = {
    codeur:   { fait: 'Écrit le code',     encours: '✍️ En train de coder…',   resume: 'A écrit le code' },
    reviseur: { fait: 'Révise & corrige',  encours: '🔍 Recherche les bugs…',  resume: 'A révisé pis corrigé le code' },
    testeur:  { fait: 'Teste & valide',    encours: '🧪 Teste le code…',       resume: 'A testé pis validé le code' },
    gardien:  { fait: 'Verdict final',     encours: '🛡️ Vérifie tout…',        resume: 'A donné son verdict final' },
  };

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

  // Tâches dont le code a déjà été « écrit » (pour pas ré-animer au refresh).
  const _animes = new Set();

  /* ─── Indicateur « en train d'écrire » (pendant qu'une étape travaille) ─── */
  function ecritureHTML(agent) {
    const a = ACTIONS[(agent || '').toLowerCase()] || { encours: 'Écrit…' };
    return `<div class="cw-writing">
      <span class="cw-wcaret"></span>
      <span class="cw-wbar"></span><span class="cw-wbar"></span><span class="cw-wbar"></span>
      <span class="cw-wtxt">${a.encours}</span>
    </div>`;
  }

  /* ─── Rend un résultat d'agent : prose + code coloré, écriture fluide ───
     opts = { taskId, statut } — anime le code (révélation) la 1re fois
     qu'une étape finie apparaît. */
  function rendreResultat(texte, opts) {
    if (!texte) return '';
    const o = opts || {};
    const enCours = o.statut === 'en_cours';
    // En streaming (en_cours avec texte) : on marque comme "déjà écrit" pour
    // pas ré-animer une révélation par-dessus le texte qui coule en direct.
    if (enCours && o.taskId != null) _animes.add(o.taskId);
    const faireAnim = o.statut === 'fini' && o.taskId != null && !_animes.has(o.taskId);
    if (faireAnim) _animes.add(o.taskId);

    const parts = String(texte).split(/(```[^\n`]*\n[\s\S]*?```)/g);
    let html = parts.map((seg) => {
      const m = seg.match(/^```([^\n`]*)\n([\s\S]*?)```$/);
      if (m) {
        const info = (m[1] || '').trim();
        const lang = (info.split(/\s+/)[0] || '').replace(/[^\w.-]/g, '');
        const code = m[2].replace(/\s+$/, '');
        if (faireAnim) {
          const nl = Math.min(code.split('\n').length, 40);
          const dur = Math.max(0.7, Math.min(2.6, 0.5 + nl * 0.07)).toFixed(2);
          return `<pre class="cw-code cw-fluide" style="--cwd:${dur}s">` + colorer(code, lang) + '</pre>';
        }
        return '<pre class="cw-code">' + colorer(code, lang) + '</pre>';
      }
      return '<span class="cw-prose">' + _esc(seg) + '</span>';
    }).join('');
    // Caret vivant pendant que ça s'écrit en temps réel.
    if (enCours) html += '<span class="cw-livecaret"></span>';
    return html;
  }

  /* ─── Avatar Marceau qui « respire » + étapes en cours à côté ─── */
  function avatarHTML(tasks) {
    const parAgent = {};
    (tasks || []).forEach((t) => { if (t && t.agent) parAgent[String(t.agent).toLowerCase()] = t; });

    const enCours = ORDRE.some((ag) => parAgent[ag] && parAgent[ag].statut === 'en_cours');
    const tousFinis = ORDRE.every((ag) => parAgent[ag] && parAgent[ag].statut === 'fini');
    const erreur = ORDRE.some((ag) => parAgent[ag] && parAgent[ag].statut === 'erreur');

    // Étape active + son texte
    let entete;
    if (erreur && !enCours) entete = '⚠️ Coword a rencontré une erreur';
    else if (tousFinis) entete = '✅ Coword a fini — ton code est prêt';
    else if (enCours) {
      const actif = ORDRE.map((ag) => parAgent[ag]).find((t) => t && t.statut === 'en_cours');
      const a = actif ? ACTIONS[actif.agent] : null;
      entete = a ? a.encours : 'Coword travaille…';
    } else entete = 'Coword est prêt à travailler';

    // Liste verticale des étapes avec ce qu'elles font
    const lignes = ORDRE.map((ag) => {
      const t = parAgent[ag];
      const statut = t ? (t.statut || 'pending') : 'pending';
      const cls = CLS[statut] || 'st-pending';
      const act = ACTIONS[ag] || { fait: '', encours: '' };
      let ico, txt;
      if (statut === 'fini') { ico = '✅'; txt = act.fait + ' — fait'; }
      else if (statut === 'en_cours') { ico = '<span class="cw-mini-spin"></span>'; txt = act.encours; }
      else if (statut === 'erreur') { ico = '❌'; txt = 'Erreur'; }
      else { ico = '⏳'; txt = act.fait; }
      return `<div class="cw-actline ${cls}">
        <span class="cw-actico">${ico}</span>
        <span class="cw-actnom">${ICONES[ag]} ${NOMS[ag]}</span>
        <span class="cw-acttxt">${txt}</span>
      </div>`;
    }).join('');

    const avaCls = enCours ? 'cw-ava respire' : (tousFinis ? 'cw-ava fini' : 'cw-ava');
    return `<div class="cw-work">
      <div class="cw-ava-wrap">
        <img class="${avaCls}" src="${AVATAR}" alt="Coword — Marceau" loading="lazy"/>
        <div class="cw-ava-cap">${entete}</div>
      </div>
      <div class="cw-acts">${lignes}</div>
    </div>`;
  }

  /* ─── Étape style « Claude Code » : ligne repliable + chevron ───
     Fini    : « ✅ 💻 Codeur — A écrit le code › » (clic = déplie le résultat)
     En cours: spinner pointillé + « Traitement en cours… » (résultat visible en direct)
     Attente : ligne tamisée « ⏳ … — en attente »
     ouvert = true → le corps (résultat) est déplié. */
  function etapeHTML(t, ouvert) {
    if (!t) return '';
    const ag = String(t.agent || '').toLowerCase();
    const act = ACTIONS[ag] || {};
    const nom = (ICONES[ag] || '') + ' ' + (NOMS[ag] || t.agent || '');
    const st = t.statut || 'pending';

    let corps = '';
    if (t.resultat) corps = rendreResultat(t.resultat, { taskId: t.id, statut: st });
    else if (st === 'en_cours') corps = ecritureHTML(ag);

    // En cours : toujours déplié (on voit le code s'écrire en direct).
    const montrerCorps = st === 'en_cours' ? !!corps : (!!ouvert && !!corps);

    let head;
    if (st === 'en_cours') {
      head = '<span class="cwcc-spin"></span><span class="cwcc-txt cwcc-run">Traitement en cours… <b>' + nom + '</b></span>';
    } else if (st === 'fini') {
      head = '<span class="cwcc-txt">✅ ' + nom + ' — ' + (act.resume || 'terminé') + '</span>'
        + '<span class="cwcc-chev' + (montrerCorps ? ' open' : '') + '">›</span>';
    } else if (st === 'erreur') {
      head = '<span class="cwcc-txt cwcc-err">❌ ' + nom + ' — erreur</span>'
        + '<span class="cwcc-chev' + (montrerCorps ? ' open' : '') + '">›</span>';
    } else {
      head = '<span class="cwcc-txt cwcc-dim">⏳ ' + nom + ' — en attente</span>';
    }

    return '<div class="cwcc-step">'
      + '<div class="cwcc-head" data-tache="' + t.id + '">' + head + '</div>'
      + (montrerCorps ? '<div class="cwcc-body">' + corps + '</div>' : '')
      + '</div>';
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
      /* Avatar Marceau + activités */
      .cw-work{display:flex;gap:14px;align-items:flex-start;padding:12px;margin-bottom:10px;
        background:#0d0d13;border:1px solid #23232e;border-radius:14px;}
      .cw-ava-wrap{flex:0 0 auto;width:96px;text-align:center;}
      .cw-ava{width:88px;height:88px;object-fit:contain;border-radius:16px;border:2px solid #30363d;
        background:#101017;display:block;transition:border-color .3s;}
      .cw-ava.respire{border-color:#ff7a00;animation:cwRespire 2.4s ease-in-out infinite;}
      .cw-ava.fini{border-color:#3fb950;}
      .cw-ava-cap{font-size:10px;color:#c9d1d9;margin-top:7px;line-height:1.35;min-height:26px;}
      .cw-ava.respire + .cw-ava-cap{color:#ff7a00;font-weight:700;}
      @keyframes cwRespire{
        0%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,122,0,.45);}
        50%{transform:scale(1.06);box-shadow:0 0 18px 4px rgba(255,122,0,.28);}
        100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,122,0,.45);}}
      .cw-acts{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}
      .cw-actline{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:9px;
        background:#101017;border:1px solid #1c1c26;font-size:12px;transition:all .3s;}
      .cw-actline .cw-actico{width:16px;flex:0 0 auto;text-align:center;display:flex;align-items:center;justify-content:center;}
      .cw-actline .cw-actnom{font-weight:700;flex:0 0 auto;color:#e6edf3;}
      .cw-actline .cw-acttxt{flex:1;min-width:0;color:#8b949e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .cw-actline.st-run{border-color:#ff7a00;background:#241400;}
      .cw-actline.st-run .cw-acttxt{color:#ff7a00;font-weight:700;}
      .cw-actline.st-done{border-color:#1a4028;}
      .cw-actline.st-done .cw-acttxt{color:#3fb950;}
      .cw-actline.st-err{border-color:#5a1f1f;}
      .cw-actline.st-err .cw-acttxt{color:#f85149;}
      .cw-mini-spin{width:13px;height:13px;border:2px solid #3a2400;border-top-color:#ff7a00;border-radius:50%;
        display:inline-block;animation:cwSpin .7s linear infinite;}
      @keyframes cwSpin{to{transform:rotate(360deg)}}
      @media(max-width:420px){.cw-work{flex-direction:column;align-items:center;}.cw-acts{width:100%;}}
      /* Code coloré */
      pre.cw-code{margin:8px 0;padding:11px;background:#05050a;border:1px solid #1c1c26;border-radius:9px;
        overflow-x:auto;font-family:'Share Tech Mono',ui-monospace,Menlo,monospace;font-size:12px;line-height:1.55;
        color:#c9d1d9;white-space:pre;}
      /* Écriture fluide : le code se révèle du haut vers le bas, ligne par ligne */
      pre.cw-code.cw-fluide{animation:cwEcrire var(--cwd,1.2s) steps(24,end) both;}
      @keyframes cwEcrire{from{clip-path:inset(0 0 100% 0);}to{clip-path:inset(0 0 0 0);}}
      @media (prefers-reduced-motion: reduce){pre.cw-code.cw-fluide{animation:none;}}
      .cw-prose{white-space:pre-wrap;}
      /* Caret vivant pendant l'écriture temps réel */
      .cw-livecaret{display:inline-block;width:8px;height:15px;background:#ff7a00;vertical-align:text-bottom;
        margin-left:2px;border-radius:1px;animation:cwCaret .8s steps(1) infinite;box-shadow:0 0 6px #ff7a00;}
      /* Indicateur « en train d'écrire » */
      .cw-writing{display:flex;align-items:center;gap:6px;margin:8px 0;padding:10px 12px;background:#05050a;
        border:1px solid #241400;border-radius:9px;}
      .cw-writing .cw-wcaret{width:2px;height:15px;background:#ff7a00;animation:cwCaret .8s steps(1) infinite;}
      .cw-writing .cw-wbar{height:8px;border-radius:4px;background:linear-gradient(90deg,#ff7a00,#5a2c00);
        animation:cwWrite 1.1s ease-in-out infinite;}
      .cw-writing .cw-wbar:nth-child(2){width:60px;animation-delay:0s;}
      .cw-writing .cw-wbar:nth-child(3){width:38px;animation-delay:.18s;}
      .cw-writing .cw-wbar:nth-child(4){width:52px;animation-delay:.36s;}
      .cw-writing .cw-wtxt{font-size:11px;color:#ff7a00;font-weight:700;margin-left:4px;}
      @keyframes cwCaret{0%,100%{opacity:1;}50%{opacity:0;}}
      @keyframes cwWrite{0%,100%{transform:scaleX(.5);opacity:.5;transform-origin:left;}50%{transform:scaleX(1);opacity:1;transform-origin:left;}}
      .tk-kw{color:#ff7b72;}
      .tk-str{color:#a5d6ff;}
      .tk-com{color:#8b949e;font-style:italic;}
      .tk-num{color:#79c0ff;}
      /* ── Étapes style Claude Code : lignes repliables + spinner pointillé ── */
      .cwcc-step{border-top:1px solid #1c1c26;}
      .cwcc-step:first-of-type{border-top:none;}
      .cwcc-head{display:flex;align-items:center;gap:9px;padding:11px 4px;cursor:pointer;
        -webkit-user-select:none;user-select:none;}
      .cwcc-head:active{opacity:.7;}
      .cwcc-txt{flex:1;min-width:0;font-size:13px;color:#8b949e;font-style:italic;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .cwcc-txt b{color:#c9d1d9;font-style:normal;}
      .cwcc-txt.cwcc-run{color:#c9d1d9;}
      .cwcc-txt.cwcc-dim{opacity:.55;}
      .cwcc-txt.cwcc-err{color:#f85149;}
      .cwcc-chev{flex:0 0 auto;color:#6e7681;font-size:16px;font-style:normal;
        transition:transform .2s;line-height:1;}
      .cwcc-chev.open{transform:rotate(90deg);}
      /* Spinner « pointillé » orange, comme le Traitement en cours… de Claude Code */
      .cwcc-spin{flex:0 0 auto;width:16px;height:16px;border-radius:50%;
        border:2px dotted #ff7a00;animation:cwccSpin 1.1s linear infinite;}
      @keyframes cwccSpin{to{transform:rotate(360deg)}}
      .cwcc-body{padding:0 4px 12px;}
    `;
    document.head.appendChild(s);
  }

  return { injecterStyle, avatarHTML, pipelineHTML, colorer, rendreResultat, ecritureHTML, etapeHTML };

})();

window.TilexCowordAnim = TilexCowordAnim;
