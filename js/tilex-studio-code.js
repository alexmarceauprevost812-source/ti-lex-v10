/* ============================================================
   js/tilex-studio-code.js — Studio du code (Coword)
   ti-lex-AL v10 — Alex Marceau-Prévost
   Une fois que l'équipe multi-agents (Codeur → Réviseur → Testeur
   → Gardien) a fini, on récupère TOUT le code écrit, dédupliqué
   par fichier (la version la plus complète/corrigée gagne), pis on
   l'affiche prêt à COPIER-COLLER ou TÉLÉCHARGER — facile à mettre
   sur ton projet.
   API : TilexStudioCode.ouvrir(tasks, titreJob)  ·  .extraire(tasks)
   ============================================================ */

const TilexStudioCode = (() => {

  let _fichiers = [];

  /* --- Extension → langage (affichage) --- */
  const EXT_LANG = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
    ts: 'typescript', tsx: 'tsx', html: 'html', htm: 'html', css: 'css',
    scss: 'scss', json: 'json', md: 'markdown', py: 'python', rb: 'ruby',
    php: 'php', java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp', go: 'go',
    rs: 'rust', sh: 'bash', bash: 'bash', sql: 'sql', yaml: 'yaml', yml: 'yaml',
    vue: 'vue', svelte: 'svelte', txt: 'text', env: 'env', toml: 'toml', xml: 'xml',
  };
  /* --- Langage → extension (pour nommer les extraits anonymes) --- */
  const LANG_EXT = {
    javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
    html: 'html', css: 'css', scss: 'scss', json: 'json', markdown: 'md', md: 'md',
    python: 'py', py: 'py', ruby: 'rb', php: 'php', java: 'java', c: 'c', cpp: 'cpp',
    csharp: 'cs', go: 'go', rust: 'rs', bash: 'sh', sh: 'sh', shell: 'sh', sql: 'sql',
    yaml: 'yml', vue: 'vue', svelte: 'svelte', text: 'txt', env: 'env', toml: 'toml', xml: 'xml',
  };

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _extLang(f) { const e = (f.split('.').pop() || '').toLowerCase(); return EXT_LANG[e] || e || 'text'; }
  function _langExt(l) { return LANG_EXT[(l || '').toLowerCase()] || 'txt'; }

  /* Analyse l'info-string d'un bloc ``` : "js", "js path/f.js" ou "path/f.js" */
  function _parseInfo(info) {
    let lang = '', fichier = '';
    const parts = (info || '').split(/\s+/).filter(Boolean);
    for (const p of parts) {
      if (!fichier && /[\w-]\.[a-z0-9]{1,8}$/i.test(p) && /[a-z]/i.test(p)) { fichier = p.replace(/^\.?\//, ''); }
      else if (!lang) { lang = p.toLowerCase(); }
    }
    return { lang, fichier };
  }

  /* Cherche un nom de fichier dans les 5 premières lignes (commentaire) */
  function _nomDepuisCode(code) {
    const lignes = code.split('\n').slice(0, 5);
    for (const l of lignes) {
      const m = l.match(/(?:\/\/|#|\/\*|<!--|\*)\s*([\w./-]+\.[a-z0-9]{1,8})\b/i);
      if (m && m[1].length < 90 && /[a-z]/i.test(m[1])) return m[1].replace(/^\.?\//, '');
    }
    return '';
  }

  /* ─── Extraction : retourne [{fichier, lang, code, agent}] ─── */
  function extraire(tasks) {
    const parFichier = new Map();   // nom -> {fichier,lang,code,agent,rank,len}
    const anonSeen = new Set();
    const anonymes = [];
    const RANG = { reviseur: 3, codeur: 2, testeur: 1, gardien: 0 };

    (tasks || []).forEach((t) => {
      const txt = t && t.resultat ? String(t.resultat) : '';
      if (!txt) return;
      const agent = (t.agent || '').toLowerCase();
      const rank = RANG[agent] != null ? RANG[agent] : 0;
      const rx = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
      let m;
      while ((m = rx.exec(txt)) !== null) {
        const info = (m[1] || '').trim();
        const code = m[2].replace(/\s+$/, '');
        if (!code.trim()) continue;
        let { lang, fichier } = _parseInfo(info);
        if (!fichier) fichier = _nomDepuisCode(code);
        if (!lang) lang = fichier ? _extLang(fichier) : 'text';

        if (fichier) {
          const len = code.length;
          const prev = parFichier.get(fichier);
          // On garde la version la plus complète ; à taille comparable, l'agent
          // le plus avancé (réviseur > codeur) gagne — sans se faire écraser par
          // un petit patch/extrait.
          let garder = false;
          if (!prev) garder = true;
          else if (rank > prev.rank && len >= prev.len * 0.6) garder = true;
          else if (rank <= prev.rank && len > prev.len) garder = true;
          if (garder) parFichier.set(fichier, { fichier, lang, code, agent, rank, len });
        } else {
          const cle = code.replace(/\s+/g, ' ').slice(0, 220);
          if (anonSeen.has(cle)) continue;
          anonSeen.add(cle);
          anonymes.push({ lang, code, agent });
        }
      }
    });

    const out = [...parFichier.values()].map((f) => ({ fichier: f.fichier, lang: f.lang, code: f.code, agent: f.agent }));
    let n = 0;
    anonymes.forEach((a) => { n++; out.push({ fichier: 'extrait-' + n + '.' + _langExt(a.lang), lang: a.lang, code: a.code, agent: a.agent }); });
    return out;
  }

  /* ─── Styles ─── */
  function _style() {
    if (document.getElementById('tilex-studio-code-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-studio-code-style';
    s.textContent = `
      #tilex-studio-code{position:fixed;inset:0;z-index:99999;opacity:0;pointer-events:none;
        transition:opacity .2s;background:rgba(0,0,0,.86);}
      #tilex-studio-code.on{opacity:1;pointer-events:auto;}
      #tilex-studio-code .sd-back{position:absolute;inset:0;}
      #tilex-studio-code .sd-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        width:min(820px,96vw);max-height:92vh;display:flex;flex-direction:column;background:#0b0b10;
        border:1px solid #23232e;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.9);color:#e6edf3;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overflow:hidden;}
      #tilex-studio-code .sd-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #1c1c26;flex-wrap:wrap;}
      #tilex-studio-code .sd-titre{font-weight:800;font-size:15px;color:#ff7a00;flex:1;min-width:140px;}
      #tilex-studio-code .sd-titre small{display:block;color:#8b949e;font-size:11px;font-weight:600;margin-top:2px;}
      #tilex-studio-code .sd-act{background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:9px;
        padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;}
      #tilex-studio-code .sd-act.p{background:#ff7a00;border-color:#ff7a00;color:#000;}
      #tilex-studio-code .sd-x{background:none;border:none;color:#8b949e;font-size:22px;cursor:pointer;line-height:1;}
      #tilex-studio-code .sd-body{overflow-y:auto;padding:14px 16px;-webkit-overflow-scrolling:touch;}
      #tilex-studio-code .sd-file{background:#0d0d13;border:1px solid #23232e;border-radius:12px;margin-bottom:14px;overflow:hidden;}
      #tilex-studio-code .sd-fhead{display:flex;align-items:center;gap:9px;padding:10px 12px;background:#101017;border-bottom:1px solid #1c1c26;flex-wrap:wrap;}
      #tilex-studio-code .sd-fname{font-family:'Share Tech Mono',ui-monospace,Menlo,monospace;font-size:13px;color:#58a6ff;
        font-weight:700;flex:1;min-width:120px;word-break:break-all;}
      #tilex-studio-code .sd-chip{font-size:10px;font-weight:800;border-radius:20px;padding:2px 9px;background:#161b22;border:1px solid #30363d;color:#c9d1d9;}
      #tilex-studio-code .sd-chip.ag{background:#0f2a17;border-color:#1a4028;color:#3fb950;}
      #tilex-studio-code .sd-mini{background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:8px;
        padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;}
      #tilex-studio-code .sd-mini.p{background:#238636;border-color:#238636;color:#fff;}
      #tilex-studio-code pre.sd-code{margin:0;max-height:340px;overflow:auto;padding:12px;background:#05050a;
        font-family:'Share Tech Mono',ui-monospace,Menlo,monospace;font-size:12px;line-height:1.55;color:#c9d1d9;
        white-space:pre;word-break:normal;}
      #tilex-studio-code .sd-vide{color:#8b949e;text-align:center;padding:40px 16px;font-size:14px;line-height:1.6;}
      #tilex-studio-code .sd-note{font-size:10px;color:#6e7681;text-align:center;padding:0 16px 14px;line-height:1.5;}
      @media(max-width:560px){#tilex-studio-code .sd-panel{width:100vw;height:100vh;max-height:100vh;border-radius:0;top:0;left:0;transform:none;}}
    `;
    document.head.appendChild(s);
  }

  /* ─── Ouverture ─── */
  function ouvrir(tasks, titreJob) {
    _style();
    _fichiers = extraire(tasks);
    let host = document.getElementById('tilex-studio-code');
    if (!host) { host = document.createElement('div'); host.id = 'tilex-studio-code'; document.body.appendChild(host); }

    const nb = _fichiers.length;
    const topActs = nb
      ? `<button class="sd-act" onclick="TilexStudioCode.copierTout()">📋 Copier tout</button>
         <button class="sd-act p" onclick="TilexStudioCode.telechargerTout()">⬇️ Tout télécharger</button>`
      : '';

    let corps;
    if (!nb) {
      corps = `<div class="sd-vide">🕳️ Pas de code détecté dans cette job.<br>Le studio s'affiche quand l'équipe a écrit du code dans ses réponses.</div>`;
    } else {
      corps = _fichiers.map((f, i) => `
        <div class="sd-file">
          <div class="sd-fhead">
            <span class="sd-fname">📄 ${_esc(f.fichier)}</span>
            <span class="sd-chip">${_esc(f.lang)}</span>
            ${f.agent ? `<span class="sd-chip ag">${_esc(f.agent)}</span>` : ''}
            <span class="sd-chip">${f.code.length} car.</span>
            <button class="sd-mini" onclick="TilexStudioCode.copier(${i},this)">📋 Copier</button>
            <button class="sd-mini p" onclick="TilexStudioCode.telecharger(${i})">⬇️ Fichier</button>
          </div>
          <pre class="sd-code">${_esc(f.code)}</pre>
        </div>`).join('');
    }

    host.innerHTML = `
      <div class="sd-back" onclick="TilexStudioCode.fermer()"></div>
      <div class="sd-panel" onclick="event.stopPropagation()">
        <div class="sd-head">
          <div class="sd-titre">🎨 Studio du code<small>${_esc(titreJob || 'Coword')} · ${nb} fichier${nb > 1 ? 's' : ''}</small></div>
          ${topActs}
          <button class="sd-x" onclick="TilexStudioCode.fermer()">✕</button>
        </div>
        <div class="sd-body">${corps}</div>
        <div class="sd-note">🔒 Copie-colle ou télécharge — prêt à déposer sur ton projet.</div>
      </div>`;

    requestAnimationFrame(() => host.classList.add('on'));
  }

  function fermer() { const el = document.getElementById('tilex-studio-code'); if (el) el.classList.remove('on'); }

  /* ─── Copier / Télécharger ─── */
  function _copierTexte(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
    return new Promise((res) => {
      const ta = document.createElement('textarea'); ta.value = txt;
      ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); res();
    });
  }
  function _toast(m) { if (window.showToastMsg) return window.showToastMsg(m); if (window.showToast) return window.showToast(m); }

  function copier(i, btn) {
    const f = _fichiers[i]; if (!f) return;
    _copierTexte(f.code).then(() => {
      if (btn) { const o = btn.textContent; btn.textContent = '✓ Copié'; setTimeout(() => { btn.textContent = o; }, 1400); }
      _toast('📋 ' + f.fichier + ' copié');
    });
  }
  function copierTout() {
    if (!_fichiers.length) return;
    const tout = _fichiers.map((f) => `/* ===== ${f.fichier} ===== */\n${f.code}`).join('\n\n\n');
    _copierTexte(tout).then(() => _toast('📋 ' + _fichiers.length + ' fichier(s) copié(s)'));
  }
  function _dl(nom, code) {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function telecharger(i) { const f = _fichiers[i]; if (!f) return; _dl(f.fichier, f.code); _toast('⬇️ ' + f.fichier); }
  function telechargerTout() {
    if (!_fichiers.length) return;
    _fichiers.forEach((f, k) => setTimeout(() => _dl(f.fichier, f.code), k * 350));
    _toast('⬇️ ' + _fichiers.length + ' fichier(s)');
  }

  return { ouvrir, fermer, extraire, copier, copierTout, telecharger, telechargerTout };

})();

window.TilexStudioCode = TilexStudioCode;
