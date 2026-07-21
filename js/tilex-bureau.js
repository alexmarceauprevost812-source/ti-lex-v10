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
    refreshMeteo: 600000,
  };

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
    semaine:     [],              // 7 objets {jour, date, payees, banque}
    taux:        CONFIG.tauxDefaut,
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

  // ─── TOTAUX DE LA SEMAINE ──────────────────────────────────
  function _totaux() {
    let payees = 0, banque = 0;
    etat.semaine.forEach((d) => { payees += (+d.payees || 0); banque += (+d.banque || 0); });
    // Ajoute le shift en cours (aujourd'hui) au calcul en direct.
    let liveToday = 0;
    if (etat.debutShift) liveToday = (Date.now() - etat.debutShift.getTime()) / 3600000;
    const payeesTotal = payees + liveToday;
    const brut = payeesTotal * etat.taux;
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

  async function _chargerSemaine() {
    etat.semaine = _semaineDates(etat.offsetSem);
    etat.taux = parseFloat(localStorage.getItem(CONFIG.cleTaux)) || CONFIG.tauxDefaut;

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

  // ─── UI : construction ─────────────────────────────────────
  function _injecterStyle() {
    if (document.getElementById('tilex-bureau-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-bureau-style';
    s.textContent = `
      #tilex-bureau-handle {
        position: fixed; top: 50%; right: 0; transform: translateY(-50%);
        z-index: 99990; width: 26px; height: 92px; cursor: pointer;
        background: linear-gradient(135deg,#ff3c3c,#b30000); color:#fff;
        border-radius: 12px 0 0 12px; display:flex; align-items:center; justify-content:center;
        box-shadow:-3px 0 14px rgba(0,0,0,.4); font-size:15px; writing-mode:vertical-rl;
        letter-spacing:1px; user-select:none;
      }
      #tilex-bureau-overlay {
        position: fixed; inset: 0; z-index: 99991; background: rgba(0,0,0,.55);
        opacity: 0; pointer-events: none; transition: opacity .25s ease;
      }
      #tilex-bureau-overlay.on { opacity: 1; pointer-events: auto; }
      #tilex-bureau {
        position: fixed; top: 0; right: 0; height: 100vh; width: 360px; max-width: 94vw;
        z-index: 99992; background:#0d1117; border-left:1px solid #21262d;
        box-shadow:-10px 0 40px rgba(0,0,0,.6); transform: translateX(100%);
        transition: transform .28s cubic-bezier(.4,0,.2,1); overflow-y:auto;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        color:#e6edf3; -webkit-overflow-scrolling: touch;
      }
      #tilex-bureau.on { transform: translateX(0); }
      .bur-head { position:sticky; top:0; background:#0d1117; padding:16px; border-bottom:1px solid #21262d;
        display:flex; justify-content:space-between; align-items:center; z-index:2; }
      .bur-title { font-weight:800; font-size:16px; color:#ff3c3c; }
      .bur-x { background:none; border:none; color:#8b949e; font-size:22px; cursor:pointer; line-height:1; }
      .bur-sec { padding:14px 16px; }
      .bur-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .bur-card { background:#161b22; border:1px solid #21262d; border-radius:12px; padding:12px; }
      .bur-lab { font-size:10px; color:#8b949e; text-transform:uppercase; letter-spacing:.6px; font-weight:700; margin-bottom:4px; }
      .bur-val { font-size:18px; font-weight:800; }
      .bur-sub { font-size:11px; color:#8b949e; margin-top:2px; }
      .bur-blue { color:#58a6ff; } .bur-red { color:#ff3c3c; } .bur-green { color:#3fb950; }
      .bur-start { width:100%; padding:14px; border:none; border-radius:12px; font-size:15px; font-weight:800;
        cursor:pointer; background:#3fb950; color:#04260f; margin-top:4px; }
      .bur-start.on { background:#ff3c3c; color:#fff; }
      .bur-weeknav { display:flex; justify-content:space-between; align-items:center; margin:6px 0 10px; }
      .bur-weeknav button { background:#21262d; border:1px solid #30363d; color:#e6edf3; border-radius:8px;
        padding:6px 12px; cursor:pointer; font-size:13px; }
      .bur-week { display:flex; flex-direction:column; gap:6px; }
      .bur-day { display:flex; align-items:center; gap:8px; background:#161b22; border:1px solid #21262d;
        border-radius:10px; padding:8px 10px; }
      .bur-day.today { border-color:#ff3c3c; }
      .bur-day .d-nom { flex:1; font-size:13px; }
      .bur-day .d-date { font-size:10px; color:#8b949e; }
      .bur-day input { width:52px; background:#0d1117; border:1px solid #30363d; color:#e6edf3;
        border-radius:6px; padding:5px; font-size:13px; text-align:center; }
      .bur-day .d-mini { font-size:9px; color:#8b949e; text-align:center; }
      .bur-taux { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
      .bur-taux input { width:70px; background:#0d1117; border:1px solid #30363d; color:#e6edf3;
        border-radius:8px; padding:8px; font-size:14px; text-align:center; }
      .bur-fisc { background:#161b22; border:1px solid #21262d; border-radius:12px; padding:12px; }
      .bur-fisc .l { display:flex; justify-content:space-between; font-size:12px; padding:3px 0; color:#c9d1d9; }
      .bur-fisc .l.net { border-top:1px solid #30363d; margin-top:6px; padding-top:8px; font-size:15px; font-weight:800; color:#3fb950; }
      .bur-fisc .l.brut { font-weight:700; color:#e6edf3; }
      .bur-btns { display:flex; gap:8px; margin-top:12px; }
      .bur-btns button { flex:1; padding:11px; border-radius:10px; border:1px solid #30363d; background:#21262d;
        color:#e6edf3; font-size:12px; font-weight:700; cursor:pointer; }
      .bur-btns .pdf { background:#ff3c3c; border-color:#ff3c3c; color:#fff; }
      .bur-note { font-size:10px; color:#6e7681; padding:10px 16px 30px; line-height:1.5; }
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

        <div class="bur-weeknav">
          <button onclick="TilexBureau.semainePrec()">← Sem.</button>
          <span id="bur-week-label" style="font-size:12px;color:#8b949e"></span>
          <button onclick="TilexBureau.semaineSuiv()">Sem. →</button>
        </div>

        <div class="bur-week" id="bur-week"></div>
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
      </div>

      <div class="bur-sec">
        <div class="bur-btns">
          <button onclick="TilexBureau.sauverTout()">💾 Sauvegarder</button>
          <button class="pdf" onclick="TilexBureau.exporterPDF()">📄 Export PDF</button>
        </div>
      </div>

      <div class="bur-note">
        🔒 Privé : personne d'autre ne voit tes heures ni ton salaire.
        Les impôts/taxes sont une <b>estimation</b> (Québec), pas un calcul officiel.
        Sauvegardé sur ton compte. Idéal pour préparer tes impôts / ton chômage.
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
      <div class="l brut"><span>Salaire brut</span><span>${_cad(f.brut)}</span></div>
      <div class="l"><span>Impôt fédéral</span><span>- ${_cad(f.fed)}</span></div>
      <div class="l"><span>Impôt Québec</span><span>- ${_cad(f.qc)}</span></div>
      <div class="l"><span>RRQ</span><span>- ${_cad(f.rrq)}</span></div>
      <div class="l"><span>Assurance-emploi</span><span>- ${_cad(f.ae)}</span></div>
      <div class="l"><span>RQAP</span><span>- ${_cad(f.rqap)}</span></div>
      <div class="l net"><span>Net estimé (${f.tauxEffectif.toFixed(0)}% retenu)</span><span>${_cad(f.net)}</span></div>
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
    toggleShift, majJour, majTaux, semainePrec, semaineSuiv, sauverTout, exporterPDF,
    rapport,
    getEtat: () => Object.assign({}, etat, { intervalles: undefined }),
  };

})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TilexBureau.init());
} else {
  TilexBureau.init();
}
window.TilexBureau = TilexBureau;
