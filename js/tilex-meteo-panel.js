// ============================================================
// js/tilex-meteo-panel.js — TilexMeteoPanel v1.0
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Panneau météo (sur demande dans le chat) :
//   • n'importe quelle ville / secteur du Québec (recherche)
//   • 📍 partage de position live → météo la plus précise
//   • météo actuelle + prévisions 7 jours
// Open-Meteo (gratuit, AUCUNE clé API).
// ============================================================

const TilexMeteoPanel = (() => {

  const CODES = {
    0:['☀️','Ciel clair'],1:['🌤️','Plutôt clair'],2:['⛅','Partiellement nuageux'],3:['☁️','Nuageux'],
    45:['🌫️','Brouillard'],48:['🌫️','Brouillard givrant'],51:['🌧️','Bruine légère'],53:['🌧️','Bruine'],
    55:['🌧️','Bruine forte'],56:['🌨️','Bruine verglaçante'],57:['🌨️','Bruine verglaçante forte'],
    61:['🌧️','Pluie légère'],63:['🌧️','Pluie'],65:['🌧️','Pluie forte'],66:['🌨️','Pluie verglaçante'],
    67:['🌨️','Pluie verglaçante forte'],71:['🌨️','Neige légère'],73:['❄️','Neige'],75:['❄️','Neige forte'],
    77:['🌨️','Grains de neige'],80:['🌦️','Averses légères'],81:['🌦️','Averses'],82:['⛈️','Averses violentes'],
    85:['🌨️','Averses de neige'],86:['❄️','Fortes averses de neige'],95:['⛈️','Orage'],
    96:['⛈️','Orage avec grêle'],99:['⛈️','Orage violent avec grêle'],
  };
  function code(c) { return CODES[c] || ['❓','—']; }

  // Villes / secteurs du Québec en accès rapide.
  const VILLES = [
    { nom: 'Ma position', gps: true },
    { nom: 'Montréal', lat: 45.5019, lon: -73.5674 },
    { nom: 'Québec', lat: 46.8139, lon: -71.2080 },
    { nom: 'Laval', lat: 45.6066, lon: -73.7124 },
    { nom: 'Gatineau', lat: 45.4765, lon: -75.7013 },
    { nom: 'Sherbrooke', lat: 45.4042, lon: -71.8929 },
    { nom: 'Trois-Rivières', lat: 46.3432, lon: -72.5432 },
    { nom: 'Saguenay', lat: 48.4280, lon: -71.0680 },
    { nom: 'Normandin', lat: 48.8290, lon: -72.5320 },
    { nom: 'Roberval', lat: 48.5170, lon: -72.2260 },
    { nom: 'Alma', lat: 48.5500, lon: -71.6490 },
    { nom: 'Rimouski', lat: 48.4489, lon: -68.5236 },
    { nom: 'Rouyn-Noranda', lat: 48.2360, lon: -79.0230 },
    { nom: "Val-d'Or", lat: 48.0970, lon: -77.7970 },
    { nom: 'Sept-Îles', lat: 50.2170, lon: -66.3820 },
    { nom: 'Gaspé', lat: 48.8330, lon: -64.4870 },
    { nom: 'Baie-Comeau', lat: 49.2160, lon: -68.1490 },
    { nom: 'Drummondville', lat: 45.8833, lon: -72.4833 },
    { nom: 'Saint-Jérôme', lat: 45.7803, lon: -74.0037 },
    { nom: 'Granby', lat: 45.4000, lon: -72.7333 },
  ];

  const JOURS_CT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  let etat = { ouvert: false, lieu: 'Normandin' };

  // ─── STYLE ─────────────────────────────────────────────────
  function _style() {
    if (document.getElementById('tilex-meteo-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-meteo-style';
    s.textContent = `
      #tilex-meteo { position:fixed; inset:0; z-index:99994; opacity:0; pointer-events:none; transition:opacity .2s; }
      #tilex-meteo.on { opacity:1; pointer-events:auto; }
      #tilex-meteo .tm-back { position:absolute; inset:0; background:rgba(0,0,0,.7); }
      #tilex-meteo .tm-panel { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        width:380px; max-width:94vw; max-height:88vh; overflow-y:auto; background:#0b0f14;
        border:1px solid #1e2630; border-radius:18px; padding:16px; color:#e6edf3;
        box-shadow:0 20px 60px rgba(0,0,0,.8); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        -webkit-overflow-scrolling:touch; }
      #tilex-meteo .tm-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      #tilex-meteo .tm-titre { font-weight:800; font-size:16px; color:#58a6ff; }
      #tilex-meteo .tm-x { background:none; border:none; color:#8b949e; font-size:22px; cursor:pointer; }
      #tilex-meteo .tm-search { display:flex; gap:8px; margin-bottom:10px; }
      #tilex-meteo .tm-search input { flex:1; background:#0d1117; border:1px solid #30363d; color:#e6edf3;
        border-radius:10px; padding:10px; font-size:13px; }
      #tilex-meteo .tm-gps { background:#ff7a00; border:none; color:#000; border-radius:10px; padding:10px 12px;
        font-size:13px; font-weight:800; cursor:pointer; white-space:nowrap; }
      #tilex-meteo .tm-sugg { background:#0d1117; border:1px solid #30363d; border-radius:10px; margin-bottom:10px; overflow:hidden; }
      #tilex-meteo .tm-sugg div { padding:9px 12px; font-size:13px; cursor:pointer; border-bottom:1px solid #161b22; }
      #tilex-meteo .tm-sugg div:hover { background:#161b22; }
      #tilex-meteo .tm-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
      #tilex-meteo .tm-chip { background:#0d1117; border:1px solid #30363d; color:#c9d1d9; border-radius:20px;
        padding:5px 11px; font-size:12px; cursor:pointer; }
      #tilex-meteo .tm-chip:hover { border-color:#58a6ff; color:#fff; }
      #tilex-meteo .tm-chip.gps { border-color:#ff7a00; color:#ff7a00; font-weight:700; }
      #tilex-meteo .tm-now { background:#0d1117; border:1px solid #1e2630; border-radius:14px; padding:16px; margin-bottom:12px; }
      #tilex-meteo .tm-now-lieu { font-size:13px; color:#8b949e; margin-bottom:8px; }
      #tilex-meteo .tm-now-main { display:flex; align-items:center; gap:14px; }
      #tilex-meteo .tm-now-emoji { font-size:52px; line-height:1; }
      #tilex-meteo .tm-now-temp { font-size:38px; font-weight:800; color:#fff; }
      #tilex-meteo .tm-now-desc { color:#c9d1d9; font-size:13px; }
      #tilex-meteo .tm-now-det { display:flex; flex-wrap:wrap; gap:14px; margin-top:12px; color:#8b949e; font-size:12px; }
      #tilex-meteo .tm-alerte { background:rgba(255,59,59,.12); border:1px solid #ff3b3b; color:#ffb38a;
        border-radius:10px; padding:9px 12px; margin-top:10px; font-size:12px; }
      #tilex-meteo .tm-7 { display:grid; grid-template-columns:repeat(7,1fr); gap:5px; }
      #tilex-meteo .tm-day { background:#0d1117; border:1px solid #1e2630; border-radius:10px; padding:8px 3px; text-align:center; }
      #tilex-meteo .tm-day-nom { font-size:10px; color:#8b949e; font-weight:700; }
      #tilex-meteo .tm-day-emoji { font-size:20px; margin:3px 0; }
      #tilex-meteo .tm-day-max { font-size:12px; font-weight:800; color:#fff; }
      #tilex-meteo .tm-day-min { font-size:11px; color:#58a6ff; }
      #tilex-meteo .tm-day-pp { font-size:9px; color:#58a6ff; margin-top:2px; }
      #tilex-meteo .tm-loading { text-align:center; color:#8b949e; padding:26px; font-size:13px; }
      #tilex-meteo .tm-note { font-size:10px; color:#6e7681; text-align:center; margin-top:10px; }
      @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
    `;
    document.head.appendChild(s);
  }

  // ─── UI ────────────────────────────────────────────────────
  function _construire() {
    if (document.getElementById('tilex-meteo')) return;
    _style();
    const chips = VILLES.map((v, i) =>
      `<span class="tm-chip${v.gps ? ' gps' : ''}" onclick="TilexMeteoPanel.choisir(${i})">${v.gps ? '📍 ' : ''}${v.nom}</span>`
    ).join('');

    const el = document.createElement('div');
    el.id = 'tilex-meteo';
    el.innerHTML = `
      <div class="tm-back" onclick="TilexMeteoPanel.fermer()"></div>
      <div class="tm-panel">
        <div class="tm-head">
          <span class="tm-titre">🌤️ Météo Québec</span>
          <button class="tm-x" onclick="TilexMeteoPanel.fermer()">✕</button>
        </div>
        <div class="tm-search">
          <input id="tm-input" type="text" placeholder="Cherche une ville du Québec…" autocomplete="off"/>
          <button class="tm-gps" onclick="TilexMeteoPanel.maPosition()">📍 Ma position</button>
        </div>
        <div class="tm-sugg" id="tm-sugg" style="display:none"></div>
        <div class="tm-chips">${chips}</div>
        <div id="tm-contenu"><div class="tm-loading">Choisis une ville ou partage ta position 🌡️</div></div>
        <div class="tm-note">Données Open-Meteo · gratuit · mises à jour en direct</div>
      </div>`;
    document.body.appendChild(el);

    const inp = document.getElementById('tm-input');
    let deb = null;
    inp.addEventListener('input', () => {
      clearTimeout(deb);
      const q = inp.value.trim();
      if (q.length < 2) { document.getElementById('tm-sugg').style.display = 'none'; return; }
      deb = setTimeout(() => _rechercher(q), 350);
    });
  }

  // ─── RECHERCHE DE VILLE (géocodage Open-Meteo) ─────────────
  async function _rechercher(q) {
    const box = document.getElementById('tm-sugg');
    if (!box) return;
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=fr&country=CA`);
      const j = await r.json();
      // Priorité au Québec.
      const res = (j.results || []).filter((x) => x.admin1 && /Qu[ée]bec/i.test(x.admin1));
      const liste = res.length ? res : (j.results || []);
      if (!liste.length) { box.style.display = 'none'; return; }
      box.innerHTML = liste.slice(0, 8).map((x) => {
        const sous = [x.admin2, x.admin1].filter(Boolean).join(', ');
        return `<div onclick="TilexMeteoPanel.parCoords(${x.latitude},${x.longitude},'${(x.name || '').replace(/'/g, '')}')">${x.name}${sous ? ` <span style="color:#8b949e;font-size:11px">— ${sous}</span>` : ''}</div>`;
      }).join('');
      box.style.display = 'block';
    } catch (e) { box.style.display = 'none'; }
  }

  // ─── MÉTÉO (actuelle + 7 jours en un appel) ────────────────
  async function _charger(lat, lon, nomLieu) {
    etat.lieu = nomLieu || etat.lieu;
    const box = document.getElementById('tm-contenu');
    const sg = document.getElementById('tm-sugg'); if (sg) sg.style.display = 'none';
    if (box) box.innerHTML = `<div class="tm-loading"><span style="display:inline-block;animation:spin 1s linear infinite">⏳</span> Chargement…</div>`;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation`
        + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`
        + `&timezone=America%2FMontreal&forecast_days=7`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('réseau');
      const d = await r.json();
      _rendre(d, etat.lieu);
    } catch (e) {
      if (box) box.innerHTML = `<div class="tm-loading">🌐 Météo indisponible — vérifie ta connexion.</div>`;
    }
  }

  function _rendre(d, lieu) {
    const box = document.getElementById('tm-contenu');
    if (!box) return;
    const c = d.current;
    const [em, txt] = code(c.weather_code);

    // Alertes (froid, vents, précip, conditions).
    const alertes = [];
    const dangers = [66, 67, 75, 86, 95, 96, 99, 82];
    if (dangers.includes(c.weather_code)) alertes.push(`⚠️ ${txt} — conditions difficiles`);
    if (Math.round(c.temperature_2m) <= -25) alertes.push(`🥶 Froid extrême (${Math.round(c.temperature_2m)}°C)`);
    if (Math.round(c.wind_speed_10m) >= 50) alertes.push(`💨 Vents forts (${Math.round(c.wind_speed_10m)} km/h)`);

    const jours = d.daily.time.map((date, i) => {
      const [e2] = code(d.daily.weather_code[i]);
      const jj = new Date(date + 'T12:00:00');
      const pp = d.daily.precipitation_probability_max ? d.daily.precipitation_probability_max[i] : null;
      return `<div class="tm-day">
        <div class="tm-day-nom">${i === 0 ? "Auj." : JOURS_CT[jj.getDay()]}</div>
        <div class="tm-day-emoji">${e2}</div>
        <div class="tm-day-max">${Math.round(d.daily.temperature_2m_max[i])}°</div>
        <div class="tm-day-min">${Math.round(d.daily.temperature_2m_min[i])}°</div>
        ${pp != null ? `<div class="tm-day-pp">💧${pp}%</div>` : ''}
      </div>`;
    }).join('');

    box.innerHTML = `
      <div class="tm-now">
        <div class="tm-now-lieu">📍 ${lieu}</div>
        <div class="tm-now-main">
          <div class="tm-now-emoji">${em}</div>
          <div>
            <div class="tm-now-temp">${Math.round(c.temperature_2m)}°C</div>
            <div class="tm-now-desc">${txt} · ressenti ${Math.round(c.apparent_temperature)}°C</div>
          </div>
        </div>
        <div class="tm-now-det">
          <span>💨 ${Math.round(c.wind_speed_10m)} km/h</span>
          <span>💧 ${c.relative_humidity_2m}%</span>
          <span>🌧️ ${c.precipitation} mm</span>
        </div>
        ${alertes.length ? `<div class="tm-alerte">${alertes.join('<br>')}</div>` : ''}
      </div>
      <div class="tm-7">${jours}</div>
    `;
  }

  // ─── ACTIONS PUBLIQUES ─────────────────────────────────────
  function choisir(i) {
    const v = VILLES[i];
    if (!v) return;
    if (v.gps) { maPosition(); return; }
    _charger(v.lat, v.lon, v.nom);
  }

  function parCoords(lat, lon, nom) { _charger(lat, lon, nom); }

  function maPosition() {
    const box = document.getElementById('tm-contenu');
    if (!navigator.geolocation) {
      if (box) box.innerHTML = `<div class="tm-loading">📍 Géolocalisation non supportée sur cet appareil.</div>`;
      return;
    }
    if (box) box.innerHTML = `<div class="tm-loading">📍 On cherche ta position…</div>`;
    navigator.geolocation.getCurrentPosition(
      (pos) => _charger(pos.coords.latitude, pos.coords.longitude, 'Ta position (GPS)'),
      () => { if (box) box.innerHTML = `<div class="tm-loading">📍 Position non partagée — autorise la localisation pour la météo précise, ou choisis une ville.</div>`; },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
    );
  }

  function ouvrir() {
    _construire();
    requestAnimationFrame(() => document.getElementById('tilex-meteo').classList.add('on'));
    etat.ouvert = true;
    // Ouvre sur Normandin par défaut si rien n'est encore chargé.
    const box = document.getElementById('tm-contenu');
    if (box && box.querySelector('.tm-loading') && !box.querySelector('.tm-now')) {
      const n = VILLES.find((v) => v.nom === 'Normandin');
      if (n) _charger(n.lat, n.lon, n.nom);
    }
  }
  function fermer() {
    const el = document.getElementById('tilex-meteo');
    if (el) el.classList.remove('on');
    etat.ouvert = false;
  }
  function basculer() { if (etat.ouvert) { fermer(); return false; } ouvrir(); return true; }

  return { ouvrir, fermer, basculer, choisir, parCoords, maPosition };

})();

// Pas d'affichage auto : la météo s'ouvre SUR DEMANDE (commande /meteo dans le chat).
window.TilexMeteoPanel = TilexMeteoPanel;
