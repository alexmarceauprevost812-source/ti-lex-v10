/* ============================================================
   js/tilex-scan.js — Scanner de projet (front)
   ti-lex-AL v10 — Alex Marceau-Prévost
   Lance /api/scan-repo (token GitHub côté serveur) et affiche
   un rapport visuel : problèmes, doublons, fichiers vides, extensions.
   ============================================================ */

const TilexScan = (() => {

  const API = '/api/scan-repo';
  let etat = { ouvert: false, occupe: false };

  const SEV = {
    critique: { txt: 'Critique', ico: '🛑', cls: 'sc-crit' },
    eleve:    { txt: 'Élevé',    ico: '⚠️', cls: 'sc-haut' },
    moyen:    { txt: 'Moyen',    ico: '🟡', cls: 'sc-moy'  },
  };

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function _style() {
    if (document.getElementById('tilex-scan-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-scan-style';
    s.textContent = `
      #tilex-scan { position:fixed; inset:0; z-index:99997; opacity:0; pointer-events:none;
        transition:opacity .2s; background:rgba(0,0,0,.78); }
      #tilex-scan.on { opacity:1; pointer-events:auto; }
      #tilex-scan .sc-back { position:absolute; inset:0; }
      #tilex-scan .sc-panel { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        width:min(640px,95vw); max-height:90vh; overflow-y:auto; background:#0b0b10; border:1px solid #23232e;
        border-radius:16px; padding:16px; box-shadow:0 24px 70px rgba(0,0,0,.85); color:#e6edf3;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; -webkit-overflow-scrolling:touch; }
      #tilex-scan .sc-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      #tilex-scan .sc-titre { font-weight:800; font-size:15px; color:#ff7a00; }
      #tilex-scan .sc-x { background:none; border:none; color:#8b949e; font-size:22px; cursor:pointer; }
      #tilex-scan .sc-go { width:100%; background:#ff7a00; border:none; color:#000; border-radius:11px;
        padding:13px; font-size:15px; font-weight:800; cursor:pointer; margin-bottom:12px; }
      #tilex-scan .sc-go:disabled { opacity:.6; }
      #tilex-scan .sc-meta { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
      #tilex-scan .sc-chip { background:#101017; border:1px solid #23232e; border-radius:20px; padding:5px 11px; font-size:12px; color:#c9d1d9; }
      #tilex-scan .sc-chip b { color:#fff; }
      #tilex-scan .sc-sect { margin-bottom:14px; }
      #tilex-scan .sc-sect h4 { font-size:12px; text-transform:uppercase; letter-spacing:.6px; color:#8b949e; margin:0 0 7px; font-weight:800; }
      #tilex-scan .sc-pb { border-radius:9px; padding:9px 11px; margin-bottom:6px; font-size:12px; border:1px solid #23232e; background:#101017; }
      #tilex-scan .sc-pb .f { color:#58a6ff; word-break:break-all; }
      #tilex-scan .sc-pb.sc-crit { border-color:#f8514966; } #tilex-scan .sc-pb.sc-crit .b { color:#f85149; }
      #tilex-scan .sc-pb.sc-haut { border-color:#ff7a0066; } #tilex-scan .sc-pb.sc-haut .b { color:#ff7a00; }
      #tilex-scan .sc-pb.sc-moy  { border-color:#e2c04a66; } #tilex-scan .sc-pb.sc-moy  .b { color:#e2c04a; }
      #tilex-scan .sc-ok { color:#3fb950; font-size:13px; padding:8px 0; }
      #tilex-scan .sc-li { font-size:12px; color:#c9d1d9; padding:3px 0; word-break:break-all; }
      #tilex-scan .sc-ext { display:flex; flex-wrap:wrap; gap:6px; }
      #tilex-scan .sc-ext span { background:#101017; border:1px solid #23232e; border-radius:8px; padding:4px 9px; font-size:11px; color:#c9d1d9; }
      #tilex-scan .sc-note { font-size:10px; color:#6e7681; text-align:center; margin-top:8px; }
    `;
    document.head.appendChild(s);
  }

  function _construire() {
    if (document.getElementById('tilex-scan')) return;
    _style();
    const el = document.createElement('div');
    el.id = 'tilex-scan';
    el.innerHTML = `
      <div class="sc-back" onclick="TilexScan.fermer()"></div>
      <div class="sc-panel" onclick="event.stopPropagation()">
        <div class="sc-head">
          <span class="sc-titre">🔍 Scanner le projet</span>
          <button class="sc-x" onclick="TilexScan.fermer()">✕</button>
        </div>
        <button class="sc-go" id="sc-go" onclick="TilexScan.lancer()">▶ Lancer le scan du repo</button>
        <div id="sc-res"><div class="sc-note">Analyse l'arbre du repo GitHub : clés exposées, fichiers coupés, doublons, TODO…</div></div>
      </div>`;
    document.body.appendChild(el);
  }

  async function lancer() {
    if (etat.occupe) return;
    etat.occupe = true;
    const btn = document.getElementById('sc-go');
    const res = document.getElementById('sc-res');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Scan en cours…'; }
    if (res) res.innerHTML = `<div class="sc-note">⏳ Lecture du repo pis analyse des fichiers…</div>`;
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.erreur || ('HTTP ' + r.status));
      _rendre(d);
    } catch (e) {
      if (res) res.innerHTML = `<div class="sc-pb sc-crit"><span class="b">Erreur :</span> ${_esc(e.message)}</div>`
        + `<div class="sc-note">Astuce : ajoute <b>GITHUB_TOKEN</b>, <b>GITHUB_OWNER</b> et <b>GITHUB_REPO</b> dans les variables d'env Vercel.</div>`;
    } finally {
      etat.occupe = false;
      if (btn) { btn.disabled = false; btn.textContent = '↺ Relancer le scan'; }
    }
  }

  function _rendre(d) {
    const res = document.getElementById('sc-res');
    if (!res) return;
    const rap = d.rapport || {};
    const pbs = rap.problemes || [];

    // Métadonnées
    let html = `<div class="sc-meta">
      <span class="sc-chip">📦 <b>${_esc(d.repo)}</b></span>
      <span class="sc-chip">🌿 ${_esc(d.branche)}</span>
      <span class="sc-chip">📄 <b>${d.total_fichiers}</b> fichiers</span>
      <span class="sc-chip">💾 <b>${d.taille_totale_ko}</b> Ko</span>
      <span class="sc-chip">${pbs.length ? '⚠️' : '✅'} <b>${pbs.length}</b> problème(s)</span>
    </div>`;

    // Problèmes (triés par sévérité)
    const rang = { critique: 0, eleve: 1, moyen: 2 };
    const tri = pbs.slice().sort((a, b) => (rang[a.severite] ?? 9) - (rang[b.severite] ?? 9));
    html += `<div class="sc-sect"><h4>Problèmes</h4>`;
    if (!tri.length) {
      html += `<div class="sc-ok">✅ Aucun problème détecté. Propre en masse!</div>`;
    } else {
      html += tri.map((p) => {
        const sv = SEV[p.severite] || { txt: p.severite, ico: '•', cls: '' };
        return `<div class="sc-pb ${sv.cls}"><span class="b">${sv.ico} ${sv.txt}</span> · ${_esc(p.probleme)}<br><span class="f">${_esc(p.fichier)}</span></div>`;
      }).join('');
    }
    html += `</div>`;

    // Doublons de noms
    const dbl = rap.doublons_noms || [];
    if (dbl.length) {
      html += `<div class="sc-sect"><h4>Doublons de noms (${dbl.length})</h4>` +
        dbl.map((x) => `<div class="sc-li">📑 <b>${_esc(x.nom)}</b> — ${_esc((x.emplacements || []).join(', '))}</div>`).join('') + `</div>`;
    }

    // Fichiers vides
    const vides = rap.fichiers_vides || [];
    if (vides.length) {
      html += `<div class="sc-sect"><h4>Fichiers vides (${vides.length})</h4>` +
        vides.map((f) => `<div class="sc-li">⬜ ${_esc(f)}</div>`).join('') + `</div>`;
    }

    // Répartition par extension
    const ext = rap.par_extension || {};
    const keys = Object.keys(ext).sort((a, b) => ext[b] - ext[a]);
    if (keys.length) {
      html += `<div class="sc-sect"><h4>Par type de fichier</h4><div class="sc-ext">` +
        keys.map((k) => `<span>.${_esc(k)} · ${ext[k]}</span>`).join('') + `</div></div>`;
    }

    res.innerHTML = html;
  }

  function ouvrir() { _construire(); requestAnimationFrame(() => document.getElementById('tilex-scan').classList.add('on')); etat.ouvert = true; }
  function fermer() { const el = document.getElementById('tilex-scan'); if (el) el.classList.remove('on'); etat.ouvert = false; }
  function basculer() { if (etat.ouvert) { fermer(); return false; } ouvrir(); return true; }

  return { lancer, ouvrir, fermer, basculer };

})();

// Pas d'affichage auto : s'ouvre SUR DEMANDE (commande /scan dans le chat).
window.TilexScan = TilexScan;
