// ============================================================
// js/tilex-bureau.js — TilexBureau v1.0
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// « Bureau de travail » privé, par utilisateur.
//   • S'ouvre en glissant le pouce depuis le bord DROIT vers la gauche
//     (ou en touchant la poignée sur le bord droit).
//   • Horloge + météo de TA position précise (géolocalisation).
//   • Start/Stop d'un shift, calendrier de la semaine (heures par jour).
//   • Heures payées / heures en banque, salaire brut.
//   • Estimation impôts + taxes (Québec) → salaire net estimé.
//   • Tout sauvegardé sur Supabase, PRIVÉ (RLS : chacun voit juste le sien).
//   • Export PDF (impôts / chômage / relevé).
//
// ⚠️ Les montants d'impôts sont une ESTIMATION, pas un avis fiscal officiel.
// ============================================================

const TilexBureau = (() => {

  // ─── CONFIG ────────────────────────────────────────────────
  const CONFIG = {
    tauxDefaut:   40,
    cleTaux:      'tilex_bureau_taux',
    cleShift:     'tilex_bureau_shift',
    cleCacheSem:  'tilex_bureau_cache',    // repli hors-ligne
    cleSupp:      'tilex_bureau_supp',     // heures supp optionnelles
    refreshMeteo: 600000,
  };

  const MOIS_NOMS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

  // Barèmes d'estimation (Québec, ordre de grandeur récent).
  // ⚠️ Estimation seulement. Ajustable si les taux changent.
  const FISC = {
    fed: {
      paliers: [[0,0.15],[55867,0.205],[111733,0.26],[173205,0.29],[246752,0.33]],
      montantPersonnel: 15705, tauxCredit: 0.15,
    },
    qc: {
      paliers: [[0,0.14],[51780,0.19],[103545,0.24],[126000,0.2575]],
      montantPersonnel: 18056, tauxCredit: 0.14,
    },
    rrq:  { taux: 0.064,   exemption: 3500, max: 68500 },  // Régime de rentes du Québec
    ae:   { taux: 0.0132,  max: 63200 },                   // Assurance-emploi (taux QC réduit)
    rqap: { taux: 0.00494, max: 94000 },                   // RQAP / assurance parentale
  };

  const JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  // ─── ÉTAT ──────────────────────────────────────────────────
  let etat = {
    ouvert:      false,
    offsetSem:   0,               // 0 = semaine courante, -1 = précédente…
    moisOffset:  0,               // 0 = mois courant, -1 = mois précédent…
    semaine:     [],              // 7 objets {jour, date, payees, banque}
    taux:        CONFIG.tauxDefaut,
    supp:        { seuil: 0, taux: 0 },   // heures supp : après {seuil} h/sem au taux {taux} (0 = désactivé)
    debutShift:  null,            // Date début shift en cours
    meteo:       { temp: null, lieu: null, icone: '🌡️' },
    intervalles: [],
    uid:         null,
  };

  // ─── OUTILS DATE ───────────────────────────────────────────
  function _iso(d) { return d.toISOString().slice(0, 10); }

  function _lundiDe(ref) {
    const d = new Date(ref);
    d.setHours(0,0,0,0);
    const j = (d.getDay() + 6) % 7;      // 0 = lundi
    d.setDate(d.getDate() - j);
    return d;
  }

  function _semaineDates(offset) {
    const base = _lundiDe(new Date());
    base.setDate(base.getDate() + offset * 7);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out.push({ jour: JOURS[i], date: _iso(d), payees: 0, banque: 0 });
    }
    return out;
  }

  // ─── ARGENT ────────────────────────────────────────────────
  function _cad(n) {
    return (n || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 });
  }

  // Argent : le nombre en OR, le signe $ en VERT. Signe optionnel devant (ex. « - »).
  function _argentHTML(n, signe) {
    const nombre = (n || 0).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${signe || ''}<span class="bur-or">${nombre}</span> <span class="bur-vert">$</span>`;
  }

  function _progressif(revenu, paliers) {
    let impot = 0;
    for (let i = 0; i < paliers.length; i++) {
      const seuil = paliers[i][0];
      const taux  = paliers[i][1];
      const haut  = (i + 1 < paliers.length) ? paliers[i + 1][0] : Infinity;
      if (revenu > seuil) impot += (Math.min(revenu, haut) - seuil) * taux;
    }
    return impot;
  }

  // Estimation des retenues sur un salaire BRUT hebdomadaire.
  function estimerNet(brutHebdo) {
    const annuel = brutHebdo * 52;

    let fed = _progressif(annuel, FISC.fed.paliers) - FISC.fed.montantPersonnel * FISC.fed.tauxCredit;
    let qc  = _progressif(annuel, FISC.qc.paliers)  - FISC.qc.montantPersonnel  * FISC.qc.tauxCredit;
    fed = Math.max(0, fed);
    qc  = Math.max(0, qc);

    const rrq  = Math.min(Math.max(annuel - FISC.rrq.exemption, 0), FISC.rrq.max - FISC.rrq.exemption) * FISC.rrq.taux;
    const ae   = Math.min(annuel, FISC.ae.max)   * FISC.ae.taux;
    const rqap = Math.min(annuel, FISC.rqap.max) * FISC.rqap.taux;

    const totAnnuel = fed + qc + rrq + ae + rqap;
    const parSem = (x) => x / 52;

    const retenues = parSem(totAnnuel);
    const net = brutHebdo - retenues;
    return {
      brut: brutHebdo,
      fed: parSem(fed), qc: parSem(qc), rrq: parSem(rrq), ae: parSem(ae), rqap: parSem(rqap),
      retenues, net,
      tauxEffectif: brutHebdo > 0 ? (retenues / brutHebdo) * 100 : 0,
    };
  }

  // Brut d'une semaine, avec heures supp OPTIONNELLES (après un seuil hebdo).
  function _brutSemaine(heuresPayees) {
    const s = etat.supp;
    if (s && s.seuil > 0 && s.taux > 0 && heuresPayees > s.seuil) {
      return s.seuil * etat.taux + (heuresPayees - s.seuil) * s.taux;
    }
    return heuresPayees * etat.taux;
  }

  // ─── TOTAUX DE LA SEMAINE ──────────────────────────────────
  function _totaux() {
    let payees = 0, banque = 0;
    etat.semaine.forEach((d) => { payees += (+d.payees || 0); banque += (+d.banque || 0); });
    // Ajoute le shift en cours (aujourd'hui) au calcul en direct.
    let liveToday = 0;
    if (etat.debutShift) liveToday = (Date.now() - etat.debutShift.getTime()) / 3600000;
    const payeesTotal = payees + liveToday;
    const brut = _brutSemaine(payeesTotal);
    const fisc = estimerNet(brut);
    return { payees: payeesTotal, banque, brut, fisc, liveToday };
  }

  // ─── SUPABASE ──────────────────────────────────────────────
  async function _getUid() {
    try {
      if (window.supabase && window.supabase.auth) {
        const u = await window.supabase.auth.getUser();
        return u && u.data && u.data.user ? u.data.user.id : null;
      }
    } catch (e) {}
    return null;
  }

  function _chargerSupp() {
    try {
      const s = JSON.parse(localStorage.getItem(CONFIG.cleSupp) || 'null');
      if (s && typeof s.seuil !== 'undefined') etat.supp = { seuil: +s.seuil || 0, taux: +s.taux || 0 };
    } catch (e) {}
  }

  async function _chargerSemaine() {
    etat.semaine = _semaineDates(etat.offsetSem);
    etat.taux = parseFloat(localStorage.getItem(CONFIG.cleTaux)) || CONFIG.tauxDefaut;
    _chargerSupp();

    const debut = etat.semaine[0].date;
    const fin   = etat.semaine[6].date;

    // 1) Repli local immédiat (hors-ligne / pas connecté).
    try {
      const cache = JSON.parse(localStorage.getItem(CONFIG.cleCacheSem) || '{}');
      etat.semaine.forEach((d) => {
        if (cache[d.date]) { d.payees = cache[d.date].payees || 0; d.banque = cache[d.date].banque || 0; }
      });
    } catch (e) {}

    // 2) Source de vérité : Supabase (si connecté).
    etat.uid = await _getUid();
    if (etat.uid && window.supabase) {
      try {
        const { data, error } = await window.supabase
          .from('bureau_heures')
          .select('jour,heures_payees,heures_banque,taux')
          .gte('jour', debut).lte('jour', fin);
        if (!error && data) {
          data.forEach((row) => {
            const cell = etat.semaine.find((d) => d.date === row.jour);
            if (cell) { cell.payees = +row.heures_payees || 0; cell.banque = +row.heures_banque || 0; }
            if (row.taux) etat.taux = +row.taux;
          });
        }
      } catch (e) {}
    }
    _sauverCacheLocal();
  }

  function _sauverCacheLocal() {
    try {
      const cache = {};
      etat.semaine.forEach((d) => { cache[d.date] = { payees: +d.payees || 0, banque: +d.banque || 0 }; });
      localStorage.setItem(CONFIG.cleCacheSem, JSON.stringify(cache));
    } catch (e) {}
  }

  async function _sauverJour(cell) {
    _sauverCacheLocal();
    if (!etat.uid) etat.uid = await _getUid();
    if (!etat.uid || !window.supabase) return false;   // pas connecté → local seulement
    try {
      const { error } = await window.supabase.from('bureau_heures').upsert({
        user_id: etat.uid,
        jour: cell.date,
        heures_payees: +cell.payees || 0,
        heures_banque: +cell.banque || 0,
        taux: etat.taux,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,jour' });
      return !error;
    } catch (e) { return false; }
  }

  // ─── CALENDRIER DU MOIS ────────────────────────────────────
  // Charge toutes les heures d'un mois (Supabase + repli cache local).
  async function _chargerMois(offset) {
    const ref = new Date();
    ref.setDate(1);
    ref.setMonth(ref.getMonth() + offset);
    const annee = ref.getFullYear(), mois = ref.getMonth();
    const premier = _iso(new Date(annee, mois, 1));
    const dernier = _iso(new Date(annee, mois + 1, 0));

    const map = {};
    // Repli local.
    try {
      const cache = JSON.parse(localStorage.getItem(CONFIG.cleCacheSem) || '{}');
      Object.keys(cache).forEach((dte) => {
        if (dte >= premier && dte <= dernier) map[dte] = { payees: +cache[dte].payees || 0, banque: +cache[dte].banque || 0 };
      });
    } catch (e) {}
    // Supabase.
    if (!etat.uid) etat.uid = await _getUid();
    if (etat.uid && window.supabase) {
      try {
        const { data, error } = await window.supabase
          .from('bureau_heures')
          .select('jour,heures_payees,heures_banque')
          .gte('jour', premier).lte('jour', dernier);
        if (!error && data) data.forEach((r) => { map[r.jour] = { payees: +r.heures_payees || 0, banque: +r.heures_banque || 0 }; });
      } catch (e) {}
    }
    return { annee, mois, premier, dernier, map };
  }

  // Total du mois avec heures supp appliquées SEMAINE par semaine.
  function _totalMois(map) {
    let heures = 0, brut = 0;
    // Regroupe par lundi (semaine) pour appliquer le seuil hebdo.
    const parSemaine = {};
    Object.keys(map).forEach((dte) => {
      const p = +map[dte].payees || 0;
      heures += p;
      const lundi = _iso(_lundiDe(new Date(dte + 'T00:00:00')));
      parSemaine[lundi] = (parSemaine[lundi] || 0) + p;
    });
    Object.keys(parSemaine).forEach((lun) => { brut += _brutSemaine(parSemaine[lun]); });
    return { heures, brut };
  }

  async function ouvrirMois() {
    const m = await _chargerMois(etat.moisOffset);
    _rendreMois(m);
  }
  function moisPrec() { etat.moisOffset--; ouvrirMois(); }
  function moisSuiv() { etat.moisOffset++; ouvrirMois(); }

  function _rendreMois(m) {
    let modal = document.getElementById('bur-mois');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bur-mois';
      document.body.appendChild(modal);
    }
    const auj = _iso(new Date());
    const decalage = (new Date(m.annee, m.mois, 1).getDay() + 6) % 7; // lundi=0
    const nbJours = new Date(m.annee, m.mois + 1, 0).getDate();
    const tot = _totalMois(m.map);

    let cases = '';
    for (let i = 0; i < decalage; i++) cases += `<div class="bm-cell vide"></div>`;
    for (let j = 1; j <= nbJours; j++) {
      const dte = _iso(new Date(m.annee, m.mois, j));
      const h = m.map[dte] ? (+m.map[dte].payees || 0) : 0;
      const today = dte === auj ? ' today' : '';
      cases += `<div class="bm-cell${today}${h > 0 ? ' rempli' : ''}">
        <div class="bm-num">${j}</div>
        ${h > 0 ? `<div class="bm-h">${h.toFixed(1)}h</div>` : ''}
      </div>`;
    }

    modal.innerHTML = `
      <div class="bm-back" onclick="TilexBureau.fermerMois()"></div>
      <div class="bm-panel">
        <div class="bm-head">
          <button class="bm-nav" onclick="TilexBureau.moisPrec()">←</button>
          <span class="bm-titre">${MOIS_NOMS[m.mois]} ${m.annee}</span>
          <button class="bm-nav" onclick="TilexBureau.moisSuiv()">→</button>
          <button class="bm-x" onclick="TilexBureau.fermerMois()">✕</button>
        </div>
        <div class="bm-jours">
          <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>
        </div>
        <div class="bm-grid">${cases}</div>
        <div class="bm-tot">
          <div><div class="bm-tot-l">Heures ce mois</div><div class="bm-tot-v">${tot.heures.toFixed(1)}h</div></div>
          <div><div class="bm-tot-l">Brut estimé</div><div class="bm-tot-v"><span class="bur-or">${tot.brut.toLocaleString('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:2})}</span> <span class="bur-vert">$</span></div></div>
        </div>
        <button class="bm-pdf" onclick="TilexBureau.exporterMoisPDF()">📄 Télécharger le mois (PDF)</button>
        <div class="bm-note">⚠️ Estimation seulement — pas des vrais chiffres officiels. Pratique pour tes impôts / ton chômage.</div>
      </div>
    `;
    modal._mois = m;
    requestAnimationFrame(() => modal.classList.add('on'));
  }

  function fermerMois() {
    const modal = document.getElementById('bur-mois');
    if (modal) modal.classList.remove('on');
  }

  function exporterMoisPDF() {
    const modal = document.getElementById('bur-mois');
    const m = modal && modal._mois;
    if (!m) return;
    const tot = _totalMois(m.map);
    const nbJours = new Date(m.annee, m.mois + 1, 0).getDate();
    let rows = '';
    for (let j = 1; j <= nbJours; j++) {
      const dte = _iso(new Date(m.annee, m.mois, j));
      const c = m.map[dte];
      if (c && (c.payees || c.banque)) {
        rows += `<tr><td>${dte}</td><td style="text-align:right">${(+c.payees||0).toFixed(2)} h</td>
          <td style="text-align:right">${(+c.banque||0).toFixed(2)} h</td></tr>`;
      }
    }
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
      <title>Relevé du mois — ${MOIS_NOMS[m.mois]} ${m.annee}</title>
      <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:auto;padding:36px;color:#111}
      h1{color:#ff7a00;font-size:22px;margin:0 0 4px}.meta{color:#666;font-size:12px;margin-bottom:22px}
      table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 10px;border-bottom:1px solid #eee}
      th{text-align:left;color:#666;font-size:11px;text-transform:uppercase}.tot{background:#faf7f2;font-weight:800}
      footer{margin-top:28px;font-size:10px;color:#999}</style></head><body>
      <h1>⚡ Relevé du mois — Ti-lex</h1>
      <div class="meta">${MOIS_NOMS[m.mois]} ${m.annee} · Taux ${etat.taux}$/h · Généré le ${new Date().toLocaleString('fr-CA')}</div>
      <table><tr><th>Jour</th><th style="text-align:right">Payées</th><th style="text-align:right">Banque</th></tr>
      ${rows || '<tr><td colspan="3" style="color:#999">Aucune heure ce mois</td></tr>'}
      <tr class="tot"><td>Total — ${tot.heures.toFixed(2)} h</td><td colspan="2" style="text-align:right">Brut estimé ${tot.brut.toLocaleString('fr-CA',{style:'currency',currency:'CAD'})}</td></tr>
      </table>
      <footer>⚠️ Estimation (barèmes du Québec) — ne remplace pas un calcul officiel. Ti-lex-AL — Bureau de travail.</footer>
      </body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const w = window.open(url, '_blank');
    if (w) { w.onload = () => setTimeout(() => w.print(), 700); }
    else { const a = document.createElement('a'); a.href = url; a.download = `releve-${m.annee}-${String(m.mois+1).padStart(2,'0')}.html`; a.click(); }
  }

  // ─── UI : construction ─────────────────────────────────────
  function _injecterStyle() {
    if (document.getElementById('tilex-bureau-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-bureau-style';
    s.textContent = `
      #tilex-bureau-handle {
        position: fixed; top: 50%; right: 0; transform: translateY(-50%);
        z-index: 99990; width: 24px; height: 96px; cursor: pointer;
        background: linear-gradient(135deg,#ff7a00,#c25400); color:#000;
        border-radius: 12px 0 0 12px; display:flex; align-items:center; justify-content:center;
        box-shadow:-3px 0 14px rgba(0,0,0,.5); font-size:13px; font-weight:800; writing-mode:vertical-rl;
        letter-spacing:1px; user-select:none;
      }
      #tilex-bureau-overlay {
        position: fixed; inset: 0; z-index: 99991; background: rgba(0,0,0,.65);
        opacity: 0; pointer-events: none; transition: opacity .25s ease;
      }
      #tilex-bureau-overlay.on { opacity: 1; pointer-events: auto; }
      #tilex-bureau {
        position: fixed; top: 0; right: 0; height: 100vh; width: 360px; max-width: 94vw;
        z-index: 99992; background:#000; border-left:1px solid #1a1a1a;
        box-shadow:-10px 0 40px rgba(0,0,0,.8); transform: translateX(100%);
        transition: transform .28s cubic-bezier(.4,0,.2,1); overflow-y:auto;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        color:#fff; -webkit-overflow-scrolling: touch;
      }
      #tilex-bureau.on { transform: translateX(0); }
      #tilex-bureau .bur-or   { color:#ffd23f; font-weight:800; }   /* argent gagné = or */
      #tilex-bureau .bur-vert { color:#3fd07f; font-weight:800; }   /* signe $ = vert */
      .bur-head { position:sticky; top:0; background:#000; padding:16px; border-bottom:1px solid #1a1a1a;
        display:flex; justify-content:space-between; align-items:center; z-index:2; }
      .bur-title { font-weight:800; font-size:16px; color:#fff; }
      .bur-x { background:none; border:none; color:#888; font-size:22px; cursor:pointer; line-height:1; }
      .bur-sec { padding:14px 16px; }
      .bur-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .bur-card { background:#0b0b0b; border:1px solid #1e1e1e; border-radius:12px; padding:12px; }
      .bur-lab { font-size:10px; color:#8a8a8a; text-transform:uppercase; letter-spacing:.6px; font-weight:700; margin-bottom:4px; }
      .bur-val { font-size:18px; font-weight:800; color:#fff; }
      .bur-sub { font-size:11px; color:#8a8a8a; margin-top:2px; }
      .bur-start { width:100%; padding:14px; border:none; border-radius:12px; font-size:15px; font-weight:800;
        cursor:pointer; background:#ff7a00; color:#000; margin-top:4px; }
      .bur-start.on { background:#ff4500; color:#fff; }
      .bur-weeknav { display:flex; justify-content:space-between; align-items:center; margin:6px 0 10px; }
      .bur-weeknav button { background:#111; border:1px solid #ff7a00; color:#ff7a00; border-radius:8px;
        padding:6px 12px; cursor:pointer; font-size:13px; font-weight:700; }
      .bur-week { display:flex; flex-direction:column; gap:6px; }
      .bur-day { display:flex; align-items:center; gap:8px; background:#0b0b0b; border:1px solid #1e1e1e;
        border-radius:10px; padding:8px 10px; }
      .bur-day.today { border-color:#ff7a00; }
      .bur-day .d-nom { flex:1; font-size:13px; color:#fff; }
      .bur-day .d-date { font-size:10px; color:#8a8a8a; }
      .bur-day input { width:52px; background:#000; border:1px solid #333; color:#fff;
        border-radius:6px; padding:5px; font-size:13px; text-align:center; }
      .bur-day .d-mini { font-size:9px; color:#8a8a8a; text-align:center; }
      .bur-taux { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
      .bur-taux input { width:70px; background:#000; border:1px solid #ff7a00; color:#ffd23f;
        border-radius:8px; padding:8px; font-size:14px; text-align:center; font-weight:800; }
      .bur-fisc { background:#0b0b0b; border:1px solid #1e1e1e; border-radius:12px; padding:12px; }
      .bur-fisc .l { display:flex; justify-content:space-between; font-size:12px; padding:3px 0; color:#cfcfcf; }
      .bur-fisc .l.net { border-top:1px solid #333; margin-top:6px; padding-top:8px; font-size:16px; font-weight:800; }
      .bur-fisc .l.brut { font-weight:700; color:#fff; }
      .bur-ia { margin-top:12px; }
      .bur-ia-lab { font-size:11px; color:#8a8a8a; margin-bottom:6px; }
      .bur-ia-btns { display:flex; gap:8px; }
      .bur-ia-btns button { flex:1; padding:11px; border-radius:10px; border:1px solid #ff7a00; background:#ff7a00;
        color:#000; font-size:12px; font-weight:800; cursor:pointer; }
      .bur-btns { display:flex; gap:8px; margin-top:12px; }
      .bur-btns button { flex:1; padding:11px; border-radius:10px; border:1px solid #ff7a00; background:#111;
        color:#ff7a00; font-size:12px; font-weight:800; cursor:pointer; }
      .bur-btns .pdf { background:#ff7a00; color:#000; }
      .bur-note { font-size:11px; color:#7a7a7a; padding:12px 16px 34px; line-height:1.6; }
      .bur-note b { color:#9a9a9a; }
      .bur-mois-btn { width:100%; padding:11px; border-radius:10px; border:1px solid #ff7a00; background:#111;
        color:#ff7a00; font-size:13px; font-weight:800; cursor:pointer; margin-top:8px; }
      .bur-supp { margin-top:10px; }
      .bur-supp summary { font-size:11px; color:#8a8a8a; cursor:pointer; padding:4px 0; }
      .bur-supp .row2 { display:flex; gap:8px; align-items:center; margin-top:6px; }
      .bur-supp input { width:64px; background:#000; border:1px solid #333; color:#fff; border-radius:8px; padding:7px; text-align:center; }
      .bur-supp .mini { font-size:10px; color:#8a8a8a; }

      /* Calendrier du mois */
      #bur-mois { position:fixed; inset:0; z-index:99995; opacity:0; pointer-events:none; transition:opacity .2s; }
      #bur-mois.on { opacity:1; pointer-events:auto; }
      #bur-mois .bm-back { position:absolute; inset:0; background:rgba(0,0,0,.7); }
      #bur-mois .bm-panel { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        width:360px; max-width:94vw; background:#000; border:1px solid #1e1e1e; border-radius:16px;
        padding:16px; box-shadow:0 20px 60px rgba(0,0,0,.8); color:#fff;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
      #bur-mois .bm-head { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
      #bur-mois .bm-titre { flex:1; text-align:center; font-weight:800; font-size:15px; text-transform:capitalize; }
      #bur-mois .bm-nav { background:#111; border:1px solid #ff7a00; color:#ff7a00; border-radius:8px; padding:4px 10px; cursor:pointer; font-weight:800; }
      #bur-mois .bm-x { background:none; border:none; color:#888; font-size:20px; cursor:pointer; }
      #bur-mois .bm-jours { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin-bottom:4px; }
      #bur-mois .bm-jours span { text-align:center; font-size:10px; color:#8a8a8a; font-weight:700; }
      #bur-mois .bm-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
      #bur-mois .bm-cell { aspect-ratio:1; background:#0b0b0b; border:1px solid #1a1a1a; border-radius:8px;
        display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2px; }
      #bur-mois .bm-cell.vide { background:transparent; border:none; }
      #bur-mois .bm-cell.rempli { border-color:#ff7a00; background:#1a0f00; }
      #bur-mois .bm-cell.today { outline:2px solid #ffd23f; }
      #bur-mois .bm-num { font-size:11px; color:#cfcfcf; }
      #bur-mois .bm-h { font-size:10px; color:#ffd23f; font-weight:800; }
      #bur-mois .bm-tot { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:14px 0 10px; }
      #bur-mois .bm-tot > div { background:#0b0b0b; border:1px solid #1e1e1e; border-radius:10px; padding:10px; }
      #bur-mois .bm-tot-l { font-size:10px; color:#8a8a8a; text-transform:uppercase; font-weight:700; }
      #bur-mois .bm-tot-v { font-size:18px; font-weight:800; margin-top:3px; }
      #bur-mois .bm-pdf { width:100%; padding:11px; border-radius:10px; border:none; background:#ff7a00; color:#000; font-weight:800; cursor:pointer; }
      #bur-mois .bm-note { font-size:10px; color:#7a7a7a; margin-top:10px; text-align:center; }
    `;
    document.head.appendChild(s);
  }

  function _construire() {
    if (document.getElementById('tilex-bureau')) return;
    _injecterStyle();

    const overlay = document.createElement('div');
    overlay.id = 'tilex-bureau-overlay';
    overlay.addEventListener('click', fermer);
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = 'tilex-bureau';
    panel.innerHTML = `
      <div class="bur-head">
        <span class="bur-title">🗂️ Bureau de travail</span>
        <button class="bur-x" onclick="TilexBureau.fermer()">✕</button>
      </div>

      <div class="bur-sec">
        <div class="bur-row">
          <div class="bur-card">
            <div class="bur-lab">🕐 Heure</div>
            <div class="bur-val bur-blue" id="bur-heure">--:--:--</div>
            <div class="bur-sub" id="bur-date">—</div>
          </div>
          <div class="bur-card">
            <div class="bur-lab">🌤️ Météo (ta position)</div>
            <div class="bur-val bur-blue" id="bur-meteo">…</div>
            <div class="bur-sub" id="bur-lieu">Localisation…</div>
          </div>
        </div>
      </div>

      <div class="bur-sec">
        <button class="bur-start" id="bur-start" onclick="TilexBureau.toggleShift()">▶ Démarrer</button>
        <div class="bur-sub" id="bur-shift-info" style="text-align:center;margin-top:6px;"></div>
      </div>

      <div class="bur-sec">
        <div class="bur-taux">
          <span class="bur-lab" style="margin:0">💵 Taux horaire</span>
          <input id="bur-taux" type="number" min="0" step="0.5" value="40"/>
          <span class="bur-sub">$/h</span>
        </div>

        <details class="bur-supp">
          <summary>⚙️ Heures supplémentaires (optionnel)</summary>
          <div class="row2">
            <span class="mini">Après</span>
            <input id="bur-supp-seuil" type="number" min="0" step="1" placeholder="0"/>
            <span class="mini">h/sem, payées</span>
            <input id="bur-supp-taux" type="number" min="0" step="0.5" placeholder="0"/>
            <span class="mini">$/h</span>
          </div>
          <div class="mini" style="margin-top:5px">Laisse à 0 si tu n'as pas de temps supp — c'est débranché par défaut.</div>
        </details>

        <div class="bur-weeknav">
          <button onclick="TilexBureau.semainePrec()">← Sem.</button>
          <span id="bur-week-label" style="font-size:12px;color:#8b949e"></span>
          <button onclick="TilexBureau.semaineSuiv()">Sem. →</button>
        </div>

        <div class="bur-week" id="bur-week"></div>

        <button class="bur-mois-btn" onclick="TilexBureau.ouvrirMois()">📅 Voir le mois complet</button>
      </div>

      <div class="bur-sec">
        <div class="bur-row" style="margin-bottom:10px">
          <div class="bur-card">
            <div class="bur-lab">⏱️ Payées</div>
            <div class="bur-val bur-red" id="bur-tot-payees">0.0h</div>
          </div>
          <div class="bur-card">
            <div class="bur-lab">🏦 En banque</div>
            <div class="bur-val" id="bur-tot-banque">0.0h</div>
          </div>
        </div>

        <div class="bur-fisc" id="bur-fisc"></div>

        <div class="bur-ia">
          <div class="bur-ia-lab">🤖 Demander à une IA de calculer (au lieu d'une calculatrice) :</div>
          <div class="bur-ia-btns">
            <button onclick="TilexBureau.demanderIA('marceau')">Marceau</button>
            <button onclick="TilexBureau.demanderIA('ti-lex-al')">TI-LEX-AL</button>
          </div>
        </div>
      </div>

      <div class="bur-sec">
        <div class="bur-btns">
          <button onclick="TilexBureau.sauverTout()">💾 Sauvegarder</button>
          <button class="pdf" onclick="TilexBureau.exporterPDF()">📄 Export PDF</button>
        </div>
      </div>

      <div class="bur-note">
        🔒 Privé : personne d'autre ne voit tes heures ni ton salaire.<br><br>
        <b>⚠️ Ce ne sont PAS des vrais chiffres officiels.</b> C'est juste une
        <b>estimation</b> faite par l'outil pour te donner une <i>idée</i> de ta paye.
        Les vrais montants d'impôts et de taxes varient et sont décidés par le
        gouvernement — pas par cet outil. Sers-toi-z-en pour avoir une idée avant
        ta paye, préparer tes impôts ou ton chômage. Rien d'officiel.
      </div>
    `;
    document.body.appendChild(panel);
  }

  // ─── UI : rendu ────────────────────────────────────────────
  function _rendreSemaine() {
    const box = document.getElementById('bur-week');
    const lbl = document.getElementById('bur-week-label');
    if (!box) return;
    const auj = _iso(new Date());
    box.innerHTML = etat.semaine.map((d, i) => {
      const today = d.date === auj ? ' today' : '';
      const dd = d.date.slice(8) + '/' + d.date.slice(5, 7);
      return `
        <div class="bur-day${today}">
          <div style="flex:1">
            <div class="d-nom">${d.jour}</div>
            <div class="d-date">${dd}</div>
          </div>
          <div>
            <input type="number" min="0" step="0.25" value="${(+d.payees||0)}"
              onchange="TilexBureau.majJour(${i},'payees',this.value)"/>
            <div class="d-mini">payées</div>
          </div>
          <div>
            <input type="number" min="0" step="0.25" value="${(+d.banque||0)}"
              onchange="TilexBureau.majJour(${i},'banque',this.value)"/>
            <div class="d-mini">banque</div>
          </div>
        </div>`;
    }).join('');
    if (lbl) lbl.textContent = 'Semaine du ' + etat.semaine[0].date.slice(8) + '/' + etat.semaine[0].date.slice(5,7);
    const ti = document.getElementById('bur-taux');
    if (ti) ti.value = etat.taux;
    const ss = document.getElementById('bur-supp-seuil');
    const st = document.getElementById('bur-supp-taux');
    if (ss && etat.supp.seuil) ss.value = etat.supp.seuil;
    if (st && etat.supp.taux)  st.value = etat.supp.taux;
  }

  function _rendreTotaux() {
    const t = _totaux();
    const p = document.getElementById('bur-tot-payees');
    const b = document.getElementById('bur-tot-banque');
    if (p) p.textContent = t.payees.toFixed(1) + 'h';
    if (b) b.textContent = t.banque.toFixed(1) + 'h';

    const f = t.fisc;
    const box = document.getElementById('bur-fisc');
    if (box) box.innerHTML = `
      <div class="l brut"><span>Salaire brut</span><span>${_argentHTML(f.brut)}</span></div>
      <div class="l"><span>Impôt fédéral</span><span>${_argentHTML(f.fed, '- ')}</span></div>
      <div class="l"><span>Impôt Québec</span><span>${_argentHTML(f.qc, '- ')}</span></div>
      <div class="l"><span>RRQ</span><span>${_argentHTML(f.rrq, '- ')}</span></div>
      <div class="l"><span>Assurance-emploi</span><span>${_argentHTML(f.ae, '- ')}</span></div>
      <div class="l"><span>RQAP</span><span>${_argentHTML(f.rqap, '- ')}</span></div>
      <div class="l net"><span>Net estimé (${f.tauxEffectif.toFixed(0)}% retenu)</span><span>${_argentHTML(f.net)}</span></div>
    `;
  }

  // ─── HORLOGE + MÉTÉO ───────────────────────────────────────
  function _demarrerHorloge() {
    const tick = () => {
      const now = new Date();
      const h = document.getElementById('bur-heure');
      const d = document.getElementById('bur-date');
      if (h) h.textContent = now.toLocaleTimeString('fr-CA', { hour12: false });
      if (d) {
        const s = now.toLocaleDateString('fr-CA', { weekday:'long', day:'numeric', month:'long' });
        d.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      }
      if (etat.debutShift) {
        const min = Math.floor((Date.now() - etat.debutShift.getTime()) / 60000);
        const info = document.getElementById('bur-shift-info');
        if (info) info.textContent = `⏱️ En cours : ${Math.floor(min/60)}h ${min%60}min`;
        _rendreTotaux();
      }
    };
    tick();
    etat.intervalles.push(setInterval(tick, 1000));
  }

  async function _geoMeteo() {
    const elM = document.getElementById('bur-meteo');
    const elL = document.getElementById('bur-lieu');
    if (!navigator.geolocation) { if (elL) elL.textContent = 'Géo non supportée'; return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`);
        const j = await r.json();
        const cw = j && j.current_weather;
        if (cw) {
          const temp = Math.round(cw.temperature);
          const icone = _iconeMeteo(cw.weathercode, cw.is_day);
          etat.meteo = { temp, icone, lieu: etat.meteo.lieu };
          if (elM) elM.textContent = `${icone} ${temp}°C`;
        }
      } catch (e) { if (elM) elM.textContent = 'Indispo'; }
      // Nom de la ville (reverse geocoding gratuit, sans clé).
      try {
        const g = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=fr`);
        const gj = await g.json();
        const lieu = gj.city || gj.locality || gj.principalSubdivision || 'Ta position';
        etat.meteo.lieu = lieu;
        if (elL) elL.textContent = lieu;
      } catch (e) { if (elL) elL.textContent = 'Ta position'; }
    }, () => {
      if (elL) elL.textContent = 'Position non partagée';
      if (elM) elM.textContent = '—';
    }, { timeout: 8000, maximumAge: 600000 });
  }

  function _iconeMeteo(code, isDay) {
    if (code === 0)  return isDay ? '☀️' : '🌙';
    if (code <= 2)   return isDay ? '⛅' : '🌤️';
    if (code === 3)  return '☁️';
    if (code <= 49)  return '🌫️';
    if (code <= 59)  return '🌦️';
    if (code <= 69)  return '🌧️';
    if (code <= 79)  return '🌨️';
    if (code <= 86)  return '❄️';
    if (code <= 99)  return '⛈️';
    return '🌡️';
  }

  // ─── ACTIONS PUBLIQUES ─────────────────────────────────────
  function majJour(i, champ, val) {
    if (!etat.semaine[i]) return;
    etat.semaine[i][champ] = parseFloat(val) || 0;
    _rendreTotaux();
    _sauverJour(etat.semaine[i]);
  }

  function toggleShift() {
    const btn = document.getElementById('bur-start');
    if (!etat.debutShift) {
      etat.debutShift = new Date();
      try { localStorage.setItem(CONFIG.cleShift, JSON.stringify({ debut: etat.debutShift.toISOString(), jour: _iso(new Date()) })); } catch (e) {}
      if (btn) { btn.textContent = '⏹ Arrêter'; btn.classList.add('on'); }
    } else {
      const h = (Date.now() - etat.debutShift.getTime()) / 3600000;
      const auj = _iso(new Date());
      const cell = etat.semaine.find((d) => d.date === auj);
      if (cell) { cell.payees = (+cell.payees || 0) + h; _sauverJour(cell); }
      etat.debutShift = null;
      try { localStorage.removeItem(CONFIG.cleShift); } catch (e) {}
      if (btn) { btn.textContent = '▶ Démarrer'; btn.classList.remove('on'); }
      const info = document.getElementById('bur-shift-info');
      if (info) info.textContent = '';
      if (window.TilexToast && TilexToast.show) TilexToast.show(`Shift ajouté : ${h.toFixed(2)}h`, 'success');
      _rendreSemaine(); _rendreTotaux();
    }
  }

  function _restaurerShift() {
    try {
      const b = JSON.parse(localStorage.getItem(CONFIG.cleShift) || 'null');
      if (b && b.debut) {
        etat.debutShift = new Date(b.debut);
        const btn = document.getElementById('bur-start');
        if (btn) { btn.textContent = '⏹ Arrêter'; btn.classList.add('on'); }
      }
    } catch (e) {}
  }

  function majTaux() {
    const ti = document.getElementById('bur-taux');
    if (!ti) return;
    etat.taux = parseFloat(ti.value) || CONFIG.tauxDefaut;
    try { localStorage.setItem(CONFIG.cleTaux, etat.taux); } catch (e) {}
    _rendreTotaux();
    // Persiste le taux sur les jours déjà remplis.
    etat.semaine.forEach((d) => { if ((+d.payees || 0) || (+d.banque || 0)) _sauverJour(d); });
  }

  function majSupp() {
    const seuil = document.getElementById('bur-supp-seuil');
    const taux  = document.getElementById('bur-supp-taux');
    etat.supp = { seuil: parseFloat(seuil && seuil.value) || 0, taux: parseFloat(taux && taux.value) || 0 };
    try { localStorage.setItem(CONFIG.cleSupp, JSON.stringify(etat.supp)); } catch (e) {}
    _rendreTotaux();
  }

  async function semainePrec() { etat.offsetSem--; await _chargerSemaine(); _rendreSemaine(); _rendreTotaux(); }
  async function semaineSuiv() { etat.offsetSem++; await _chargerSemaine(); _rendreSemaine(); _rendreTotaux(); }

  async function sauverTout() {
    let ok = 0;
    for (const d of etat.semaine) { if (await _sauverJour(d)) ok++; }
    if (window.TilexToast && TilexToast.show) {
      TilexToast.show(etat.uid ? `💾 Semaine sauvegardée (${ok}/7)` : '💾 Sauvé localement — connecte-toi pour synchroniser', 'success');
    }
  }

  // ─── EXPORT PDF ────────────────────────────────────────────
  function exporterPDF() {
    const t = _totaux();
    const f = t.fisc;
    const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const rows = etat.semaine.map((d) =>
      `<tr><td>${esc(d.jour)} <span style="color:#888">${d.date}</span></td>
       <td style="text-align:right">${(+d.payees||0).toFixed(2)} h</td>
       <td style="text-align:right">${(+d.banque||0).toFixed(2)} h</td>
       <td style="text-align:right">${_cad((+d.payees||0)*etat.taux)}</td></tr>`).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
      <title>Relevé de travail — semaine du ${etat.semaine[0].date}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:auto;padding:36px;color:#111}
        h1{color:#ff3c3c;font-size:22px;margin:0 0 4px}
        .meta{color:#666;font-size:12px;margin-bottom:24px}
        table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px}
        th,td{padding:8px 10px;border-bottom:1px solid #eee}
        th{text-align:left;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
        .tot{background:#faf7f2}
        .fisc td{border:none;padding:4px 10px}
        .net{font-weight:800;color:#0a7a2f;font-size:16px;border-top:2px solid #ddd}
        footer{margin-top:32px;font-size:10px;color:#999}
      </style></head><body>
      <h1>⚡ Relevé de travail — Ti-lex</h1>
      <div class="meta">Semaine du ${etat.semaine[0].date} au ${etat.semaine[6].date} · Taux : ${etat.taux}$/h · Généré le ${new Date().toLocaleString('fr-CA')}</div>
      <table>
        <tr><th>Jour</th><th style="text-align:right">Payées</th><th style="text-align:right">Banque</th><th style="text-align:right">Brut</th></tr>
        ${rows}
        <tr class="tot"><td><b>Total</b></td><td style="text-align:right"><b>${t.payees.toFixed(2)} h</b></td>
          <td style="text-align:right"><b>${t.banque.toFixed(2)} h</b></td><td style="text-align:right"><b>${_cad(t.brut)}</b></td></tr>
      </table>
      <table class="fisc">
        <tr><td>Salaire brut</td><td style="text-align:right">${_cad(f.brut)}</td></tr>
        <tr><td>Impôt fédéral (est.)</td><td style="text-align:right">- ${_cad(f.fed)}</td></tr>
        <tr><td>Impôt Québec (est.)</td><td style="text-align:right">- ${_cad(f.qc)}</td></tr>
        <tr><td>RRQ (est.)</td><td style="text-align:right">- ${_cad(f.rrq)}</td></tr>
        <tr><td>Assurance-emploi (est.)</td><td style="text-align:right">- ${_cad(f.ae)}</td></tr>
        <tr><td>RQAP (est.)</td><td style="text-align:right">- ${_cad(f.rqap)}</td></tr>
        <tr class="net"><td>Net estimé</td><td style="text-align:right">${_cad(f.net)}</td></tr>
      </table>
      <footer>⚠️ Les montants d'impôts et de taxes sont une ESTIMATION (barèmes du Québec) et ne remplacent pas un calcul officiel. Document généré par Ti-lex-AL — Bureau de travail.</footer>
    </body></html>`;

    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const w = window.open(url, '_blank');
    if (w) { w.onload = () => setTimeout(() => w.print(), 700); }
    else {
      const a = document.createElement('a'); a.href = url;
      a.download = `releve-travail-${etat.semaine[0].date}.html`; a.click();
    }
  }

  // ─── DEMANDER À L'IA DE CALCULER (Marceau ou TI-LEX-AL) ────
  // Construit une question en français avec les chiffres de la semaine et
  // l'envoie à l'agent choisi. La page fournit le pont via
  // window.tilexBureauEnvoyerIA(texte, agent). L'utilisateur decide : rien
  // n'est envoye tant qu'il ne clique pas.
  function demanderIA(agent) {
    const r = rapport();
    const lignes = r.jours
      .filter((j) => j.payees || j.banque)
      .map((j) => `- ${j.jour} : ${j.payees}h payées${j.banque ? ', ' + j.banque + 'h en banque' : ''}`)
      .join('\n') || '- (aucune heure entrée pour l\'instant)';

    const texte =
`Aide-moi à calculer ma paye — c'est une estimation, pas des chiffres officiels.

Mon taux : ${r.taux}$/h
Mes heures cette semaine (semaine du ${r.semaine_du}) :
${lignes}

Total payées : ${r.total_heures_payees}h → brut ${r.salaire_brut}$.
Peux-tu me donner une idée de mon salaire NET après impôts et taxes du Québec (fédéral, Québec, RRQ, assurance-emploi, RQAP), et m'expliquer simplement? Rappelle que c'est une estimation.`;

    fermer();
    if (typeof window.tilexBureauEnvoyerIA === 'function') {
      window.tilexBureauEnvoyerIA(texte, agent);
      return;
    }
    // Repli générique : remplit un champ de saisie connu.
    const inp = document.getElementById('composer-input') || document.getElementById('input') || document.getElementById('chat-in');
    if (inp) { inp.value = texte; inp.focus(); }
    else if (window.TilexToast && TilexToast.show) TilexToast.show('Ouvre le chat pour poser la question à l\'IA', 'info');
  }

  // Données pour l'IA (si l'utilisateur choisit de les partager dans le chat).
  function rapport() {
    const t = _totaux();
    return {
      semaine_du: etat.semaine[0].date,
      taux: etat.taux,
      jours: etat.semaine.map((d) => ({ jour: d.jour, date: d.date, payees: +d.payees||0, banque: +d.banque||0 })),
      total_heures_payees: +t.payees.toFixed(2),
      total_heures_banque: +t.banque.toFixed(2),
      salaire_brut: +t.brut.toFixed(2),
      estimation: {
        federal: +t.fisc.fed.toFixed(2), quebec: +t.fisc.qc.toFixed(2),
        rrq: +t.fisc.rrq.toFixed(2), ae: +t.fisc.ae.toFixed(2), rqap: +t.fisc.rqap.toFixed(2),
        net_estime: +t.fisc.net.toFixed(2),
      },
      avertissement: 'Estimation seulement — pas un calcul fiscal officiel.',
    };
  }

  // ─── OUVRIR / FERMER ───────────────────────────────────────
  async function ouvrir() {
    _construire();
    if (!etat._init) {
      _demarrerHorloge();
      const ti = document.getElementById('bur-taux');
      if (ti) ti.addEventListener('change', majTaux);
      const ss = document.getElementById('bur-supp-seuil');
      const st = document.getElementById('bur-supp-taux');
      if (ss) ss.addEventListener('change', majSupp);
      if (st) st.addEventListener('change', majSupp);
      etat._init = true;
    }
    await _chargerSemaine();
    _restaurerShift();
    _rendreSemaine();
    _rendreTotaux();
    _geoMeteo();
    requestAnimationFrame(() => {
      document.getElementById('tilex-bureau').classList.add('on');
      document.getElementById('tilex-bureau-overlay').classList.add('on');
    });
    etat.ouvert = true;
  }

  function fermer() {
    const p = document.getElementById('tilex-bureau');
    const o = document.getElementById('tilex-bureau-overlay');
    if (p) p.classList.remove('on');
    if (o) o.classList.remove('on');
    etat.ouvert = false;
  }

  function basculer() { etat.ouvert ? fermer() : ouvrir(); }

  // ─── GESTE : glisser depuis le bord DROIT vers la gauche ───
  function _brancherGeste() {
    let x0 = null, y0 = null, depuisBord = false;
    const SEUIL = 55;      // px vers la gauche pour ouvrir
    const BORD  = 30;      // zone du bord droit

    document.addEventListener('touchstart', (e) => {
      if (etat.ouvert) return;
      const t = e.touches[0];
      depuisBord = t.clientX >= (window.innerWidth - BORD);
      x0 = t.clientX; y0 = t.clientY;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (etat.ouvert || !depuisBord || x0 == null) return;
      const t = e.touches[0];
      const dx = x0 - t.clientX;               // positif = vers la gauche
      const dy = Math.abs(t.clientY - y0);
      if (dx > SEUIL && dy < 45) { depuisBord = false; x0 = null; ouvrir(); }
    }, { passive: true });

    document.addEventListener('touchend', () => { x0 = null; y0 = null; depuisBord = false; });

    // Fermer en glissant vers la droite dans le panneau.
    let px0 = null;
    document.addEventListener('touchstart', (e) => {
      if (etat.ouvert) px0 = e.touches[0].clientX;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (etat.ouvert && px0 != null && e.changedTouches[0].clientX - px0 > 70) fermer();
      px0 = null;
    }, { passive: true });
  }

  function _ajouterPoignee() {
    if (document.getElementById('tilex-bureau-handle')) return;
    _injecterStyle();
    const h = document.createElement('div');
    h.id = 'tilex-bureau-handle';
    h.title = 'Bureau de travail';
    h.textContent = '🗂️ TRAVAIL';
    h.addEventListener('click', ouvrir);
    document.body.appendChild(h);
  }

  function init() {
    _ajouterPoignee();
    _brancherGeste();
  }

  return {
    init, ouvrir, fermer, basculer,
    toggleShift, majJour, majTaux, majSupp, semainePrec, semaineSuiv, sauverTout, exporterPDF,
    ouvrirMois, fermerMois, moisPrec, moisSuiv, exporterMoisPDF,
    demanderIA, rapport,
    getEtat: () => Object.assign({}, etat, { intervalles: undefined }),
  };

})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TilexBureau.init());
} else {
  TilexBureau.init();
}
window.TilexBureau = TilexBureau;
