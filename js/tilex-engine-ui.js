// ============================================================
// js/tilex-engine-ui.js — TilexEngineUI (tableau de bord multi-agents)
// ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Panneau sur demande : lancer une job + suivre les sous-tâches
// (Codeur → Réviseur → Testeur → Gardien) en temps réel.
// ============================================================

const TilexEngineUI = (() => {

  let etat = { ouvert: false, jobsOuverts: {} };

  const STATUTS = {
    pending:  { txt: 'En attente', cls: 'st-pending', ico: '⏳' },
    en_cours: { txt: 'En cours',   cls: 'st-run',     ico: '⚙️' },
    fini:     { txt: 'Fini',       cls: 'st-done',    ico: '✅' },
    erreur:   { txt: 'Erreur',     cls: 'st-err',     ico: '❌' },
  };

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // Échappe pour insérer dans une chaîne JS entre apostrophes, dans un attribut HTML.
  function _escAttr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/[\r\n]+/g, ' '); }

  function _style() {
    if (document.getElementById('tilex-engine-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-engine-style';
    s.textContent = `
      #tilex-engine-modal { position:fixed; inset:0; z-index:99997; opacity:0; pointer-events:none;
        transition:opacity .2s; background:rgba(0,0,0,.78); }
      #tilex-engine-modal.on { opacity:1; pointer-events:auto; }
      #tilex-engine-modal .em-back { position:absolute; inset:0; }
      #tilex-engine-modal .em-panel { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        width:min(640px,95vw); max-height:90vh; overflow-y:auto; background:#0b0b10; border:1px solid #23232e;
        border-radius:16px; padding:16px; box-shadow:0 24px 70px rgba(0,0,0,.85); color:#e6e6ee;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; -webkit-overflow-scrolling:touch; }
      #tilex-engine-modal .em-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      #tilex-engine-modal .em-titre { font-weight:800; font-size:15px; color:#ff7a00; }
      #tilex-engine-modal .em-x { background:none; border:none; color:#8b949e; font-size:22px; cursor:pointer; }
      #tilex-engine-modal .em-new { display:flex; gap:8px; margin-bottom:14px; }
      #tilex-engine-modal .em-new input { flex:1; background:#07070b; border:1px solid #2a2a36; color:#eee;
        border-radius:10px; padding:11px; font-size:14px; }
      #tilex-engine-modal .em-new button { background:#ff7a00; border:none; color:#000; border-radius:10px;
        padding:11px 14px; font-size:14px; font-weight:800; cursor:pointer; white-space:nowrap; }
      #tilex-engine-modal .em-job { background:#101017; border:1px solid #23232e; border-radius:12px; margin-bottom:10px; overflow:hidden; }
      #tilex-engine-modal .em-job-head { display:flex; align-items:center; gap:8px; padding:11px 12px; cursor:pointer; }
      #tilex-engine-modal .em-job-titre { flex:1; font-size:13px; font-weight:700; }
      #tilex-engine-modal .em-badge { font-size:10px; font-weight:800; border-radius:20px; padding:2px 9px; }
      .st-pending { background:#2a2a1a; color:#e2c04a; } .st-run { background:#1a2436; color:#58a6ff; }
      .st-done { background:#0f2a17; color:#3fb950; } .st-err { background:#2a1414; color:#f85149; }
      #tilex-engine-modal .em-del { background:none; border:none; color:#6e7681; cursor:pointer; font-size:14px; }
      #tilex-engine-modal .em-studio { background:none; border:none; cursor:pointer; font-size:14px; filter:grayscale(.2); }
      #tilex-engine-modal .em-studio:hover { filter:none; }
      #tilex-engine-modal .em-tasks { padding:0 12px 10px; }
      #tilex-engine-modal .em-task { border-top:1px solid #1c1c26; padding:9px 0; }
      #tilex-engine-modal .em-task-h { display:flex; align-items:center; gap:8px; }
      #tilex-engine-modal .em-task-t { flex:1; font-size:12px; }
      #tilex-engine-modal .em-task-r { margin-top:6px; background:#07070b; border:1px solid #1c1c26; border-radius:8px;
        padding:9px; font-size:11px; color:#c9c9d4; white-space:pre-wrap; max-height:220px; overflow:auto; }
      #tilex-engine-modal .em-task-r pre, #tilex-engine-modal .em-task-r code { white-space:pre-wrap; word-break:break-word; }
      #tilex-engine-modal .em-vide { color:#8b949e; text-align:center; padding:20px; font-size:13px; }
      #tilex-engine-modal .em-note { font-size:10px; color:#6e7681; text-align:center; margin-top:10px; }
    `;
    document.head.appendChild(s);
  }

  function _construire() {
    if (document.getElementById('tilex-engine-modal')) return;
    _style();
    const el = document.createElement('div');
    el.id = 'tilex-engine-modal';
    el.innerHTML = `
      <div class="em-back" onclick="TilexEngineUI.fermer()"></div>
      <div class="em-panel" onclick="event.stopPropagation()">
        <div class="em-head">
          <span class="em-titre">⚙️ Moteur multi-agents</span>
          <button class="em-x" onclick="TilexEngineUI.fermer()">✕</button>
        </div>
        <div class="em-new">
          <input id="em-input" type="text" placeholder="Décris une job (ex: bouton bleu qui affiche l'heure)…"/>
          <button onclick="TilexEngineUI.lancer()">🚀 Lancer</button>
        </div>
        <div id="em-liste"><div class="em-vide">Aucune job pour l'instant. Lance-en une! 🚀</div></div>
        <div class="em-note">Codeur → Réviseur → Testeur → Gardien · sauvegardé sur ton compte · temps réel</div>
      </div>`;
    document.body.appendChild(el);
    const inp = el.querySelector('#em-input');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') lancer(); });
  }

  async function lancer() {
    const inp = document.getElementById('em-input');
    if (!inp) return;
    const titre = inp.value.trim();
    if (!titre) return;
    inp.value = '';
    const r = await TilexEngine.lancerJob(titre);
    if (!r.ok && window.showToastMsg) showToastMsg(r.erreur);
    else if (!r.ok && window.TilexToast && TilexToast.show) TilexToast.show(r.erreur, 'error');
    rafraichir();
  }

  async function rafraichir() {
    const box = document.getElementById('em-liste');
    if (!box) return;
    const jobs = await TilexEngine.listerJobs(20);
    if (!jobs.length) { box.innerHTML = `<div class="em-vide">Aucune job pour l'instant. Lance-en une! 🚀</div>`; return; }

    const parts = [];
    for (const j of jobs) {
      const st = STATUTS[j.statut] || STATUTS.pending;
      const ouvert = !!etat.jobsOuverts[j.id];
      let tasksHtml = '';
      if (ouvert) {
        const tasks = await TilexEngine.listerTaches(j.id);
        const ava = window.TilexCowordAnim ? TilexCowordAnim.avatarHTML(tasks) : '';
        const pipe = window.TilexCowordAnim ? TilexCowordAnim.pipelineHTML(tasks) : '';
        tasksHtml = '<div class="em-tasks">' + ava + pipe + tasks.map((t) => {
          const ts = STATUTS[t.statut] || STATUTS.pending;
          let corps = '';
          if (t.resultat) corps = window.TilexCowordAnim ? TilexCowordAnim.rendreResultat(t.resultat, { taskId: t.id, statut: t.statut }) : _esc(t.resultat);
          else if (t.statut === 'en_cours' && window.TilexCowordAnim) corps = TilexCowordAnim.ecritureHTML(t.agent);
          const res = corps ? `<div class="em-task-r">${corps}</div>` : '';
          return `<div class="em-task"><div class="em-task-h"><span>${ts.ico}</span>
            <span class="em-task-t">${_esc(t.titre)}</span>
            <span class="em-badge ${ts.cls}">${ts.txt}</span></div>${res}</div>`;
        }).join('') + '</div>';
      }
      parts.push(`
        <div class="em-job">
          <div class="em-job-head" onclick="TilexEngineUI.toggleJob(${j.id})">
            <span>${st.ico}</span>
            <span class="em-job-titre">${_esc(j.titre)}</span>
            <span class="em-badge ${st.cls}">${st.txt}</span>
            <button class="em-studio" title="Studio du code — voir/copier/télécharger" onclick="event.stopPropagation();TilexEngineUI.studio(${j.id},'${_escAttr(j.titre)}')">🎨</button>
            <button class="em-del" title="Supprimer" onclick="event.stopPropagation();TilexEngineUI.supprimer(${j.id})">🗑️</button>
          </div>
          ${tasksHtml}
        </div>`);
    }
    box.innerHTML = parts.join('');
  }

  function toggleJob(id) { etat.jobsOuverts[id] = !etat.jobsOuverts[id]; rafraichir(); }
  async function supprimer(id) { await TilexEngine.supprimerJob(id); delete etat.jobsOuverts[id]; rafraichir(); }

  // 🎨 Studio du code : récupère les tâches de la job, extrait le code, l'affiche
  // prêt à copier-coller ou télécharger.
  async function studio(id, titre) {
    if (!window.TilexStudioCode) { if (window.showToastMsg) showToastMsg('Studio pas chargé'); return; }
    const tasks = await TilexEngine.listerTaches(id);
    TilexStudioCode.ouvrir(tasks, titre || 'Coword');
  }

  function ouvrir() {
    _construire();
    if (window.TilexCowordAnim) TilexCowordAnim.injecterStyle();
    if (window.TilexEngine) TilexEngine.brancherRealtime();
    rafraichir();
    requestAnimationFrame(() => document.getElementById('tilex-engine-modal').classList.add('on'));
    etat.ouvert = true;
  }
  function fermer() {
    const el = document.getElementById('tilex-engine-modal');
    if (el) el.classList.remove('on');
    etat.ouvert = false;
  }
  function basculer() { if (etat.ouvert) { fermer(); return false; } ouvrir(); return true; }

  // Rafraîchit tout seul quand le moteur bouge (ou le temps réel).
  window.addEventListener('tilex:engine:maj', () => { if (etat.ouvert) rafraichir(); });

  return { ouvrir, fermer, basculer, lancer, rafraichir, toggleJob, supprimer, studio };

})();

// Pas d'affichage auto : s'ouvre SUR DEMANDE (commande /moteur dans le chat).
window.TilexEngineUI = TilexEngineUI;
