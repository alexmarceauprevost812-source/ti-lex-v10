// ============================================================
// js/tilex-dashboard.js — TilexDashboard v1.0
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Mini-tableau de bord live : heure, BTC, météo, heures du jour
// ============================================================

const TilexDashboard = (() => {

  // ─── CONFIG ────────────────────────────────────────────────
  const CONFIG = {
    taux_horaire:    40,          // $ / heure (ton taux ti-lex)
    ville_meteo:     'Normandin', // ta ville
    devise:          'CAD',       // dollar canadien
    refresh_crypto:  60000,       // refresh BTC toutes les 60s
    refresh_meteo:   600000,      // refresh météo toutes les 10min
    refresh_horloge: 1000,        // horloge chaque seconde
    cleShift:        'tilex_dashboard_shift',
  };

  // ─── ÉTAT ──────────────────────────────────────────────────
  let etat = {
    btc_prix:       null,
    btc_variation:  null,
    meteo_temp:     null,
    meteo_desc:     null,
    heure_debut:    null,         // Date de début de shift (ou null)
    heures_today:   0,
    salaire_today:  0,
    intervalles:    [],
    visible:        false,
  };

  // ─── INIT ──────────────────────────────────────────────────
  function init() {
    if (etat.visible) return;
    _creerUI();
    _demarrerHorloge();
    _fetchBTC();
    _fetchMeteo();
    _chargerHeuresLocales();

    etat.intervalles.push(setInterval(_fetchBTC,   CONFIG.refresh_crypto));
    etat.intervalles.push(setInterval(_fetchMeteo, CONFIG.refresh_meteo));

    etat.visible = true;
    console.log('[TilexDashboard] ✅ Initialisé');
  }

  // ─── CRÉATION UI ───────────────────────────────────────────
  function _creerUI() {
    if (document.getElementById('tilex-dashboard')) return;

    const style = document.createElement('style');
    style.id    = 'tilex-dashboard-style';
    style.textContent = `
      #tilex-dashboard {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 9990;
        background: #0d1117;
        border: 1px solid #21262d;
        border-radius: 14px;
        padding: 14px 16px;
        width: 260px;
        max-width: 88vw;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        transition: all 0.3s ease;
        user-select: none;
      }
      #tilex-dashboard.collapsed {
        width: auto;
        padding: 10px 14px;
        border-radius: 30px;
      }
      #tilex-dashboard.collapsed .dash-body { display: none; }
      .dash-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        cursor: pointer;
      }
      #tilex-dashboard.collapsed .dash-header { margin-bottom: 0; }
      .dash-title {
        color: #ff3c3c;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.5px;
      }
      .dash-toggle {
        background: none;
        border: none;
        color: #8b949e;
        cursor: pointer;
        font-size: 14px;
        padding: 0;
        line-height: 1;
      }
      .dash-body {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .dash-card {
        background: #161b22;
        border: 1px solid #21262d;
        border-radius: 10px;
        padding: 10px 12px;
      }
      .dash-card-label {
        font-size: 10px;
        color: #8b949e;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin-bottom: 4px;
        font-weight: 600;
      }
      .dash-card-value {
        font-size: 18px;
        font-weight: 700;
        color: #e6edf3;
        line-height: 1.2;
      }
      .dash-card-sub {
        font-size: 11px;
        color: #8b949e;
        margin-top: 2px;
      }
      .dash-card-value.positif { color: #3fb950; }
      .dash-card-value.negatif { color: #f85149; }
      .dash-card-value.neutre  { color: #58a6ff; }
      .dash-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .dash-shift {
        border-color: #ff3c3c44;
      }
      .dash-shift .dash-card-value {
        color: #ff3c3c;
        font-size: 16px;
      }
      .dash-btn {
        width: 100%;
        padding: 8px;
        border-radius: 8px;
        border: 1px solid #30363d;
        background: #21262d;
        color: #e6edf3;
        font-size: 12px;
        cursor: pointer;
        font-weight: 600;
        transition: background 0.2s;
      }
      .dash-btn:hover { background: #30363d; }
      .dash-btn.active {
        background: #ff3c3c;
        border-color: #ff3c3c;
        color: #fff;
      }
      #tilex-dashboard .pulse {
        animation: tilexPulse 1.5s ease-in-out infinite;
      }
      @keyframes tilexPulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);

    const dash = document.createElement('div');
    dash.id    = 'tilex-dashboard';
    dash.innerHTML = `
      <div class="dash-header" onclick="TilexDashboard.toggle()">
        <span class="dash-title">⚡ TilexDashboard</span>
        <button class="dash-toggle" id="dash-toggle-btn">−</button>
      </div>
      <div class="dash-body">

        <!-- Horloge -->
        <div class="dash-card">
          <div class="dash-card-label">🕐 Heure locale</div>
          <div class="dash-card-value neutre" id="dash-heure">--:--:--</div>
          <div class="dash-card-sub" id="dash-date">Chargement...</div>
        </div>

        <!-- BTC -->
        <div class="dash-card">
          <div class="dash-card-label">₿ Bitcoin (CAD)</div>
          <div class="dash-card-value" id="dash-btc">Chargement…</div>
          <div class="dash-card-sub" id="dash-btc-sub">
            <span class="pulse">●</span> Live via CoinGecko
          </div>
        </div>

        <!-- Météo -->
        <div class="dash-card">
          <div class="dash-card-label">🌤️ Météo — ${CONFIG.ville_meteo}</div>
          <div class="dash-card-value neutre" id="dash-meteo">Chargement…</div>
          <div class="dash-card-sub" id="dash-meteo-sub">Open-Meteo API</div>
        </div>

        <!-- Shift / Heures -->
        <div class="dash-grid-2">
          <div class="dash-card dash-shift">
            <div class="dash-card-label">⏱️ Heures</div>
            <div class="dash-card-value" id="dash-heures">0.0h</div>
            <div class="dash-card-sub">aujourd'hui</div>
          </div>
          <div class="dash-card dash-shift">
            <div class="dash-card-label">💰 Salaire</div>
            <div class="dash-card-value" id="dash-salaire">0$</div>
            <div class="dash-card-sub">@${CONFIG.taux_horaire}$/h</div>
          </div>
        </div>

        <!-- Bouton shift -->
        <button class="dash-btn" id="dash-shift-btn" onclick="TilexDashboard.toggleShift()">
          ▶ Démarrer le shift
        </button>

      </div>
    `;
    document.body.appendChild(dash);
  }

  // ─── HORLOGE ───────────────────────────────────────────────
  function _demarrerHorloge() {
    const tick = () => {
      const now   = new Date();
      const heure = now.toLocaleTimeString('fr-CA', { hour12: false });
      const date  = now.toLocaleDateString('fr-CA', {
        weekday: 'long', day: 'numeric', month: 'long'
      });

      const elH = document.getElementById('dash-heure');
      const elD = document.getElementById('dash-date');
      if (elH) elH.textContent = heure;
      if (elD) elD.textContent = date.charAt(0).toUpperCase() + date.slice(1);

      // Si shift actif → calcul en temps réel
      if (etat.heure_debut) {
        const diffMs  = now - etat.heure_debut;
        const diffH   = diffMs / 3600000;
        const salaire = diffH * CONFIG.taux_horaire;

        const elHr  = document.getElementById('dash-heures');
        const elSal = document.getElementById('dash-salaire');
        if (elHr)  elHr.textContent  = diffH.toFixed(1) + 'h';
        if (elSal) elSal.textContent = Math.floor(salaire) + '$';

        etat.heures_today  = diffH;
        etat.salaire_today = salaire;
      }
    };

    tick();
    etat.intervalles.push(setInterval(tick, CONFIG.refresh_horloge));
  }

  // ─── FETCH BTC ─────────────────────────────────────────────
  async function _fetchBTC() {
    const el    = document.getElementById('dash-btc');
    const elSub = document.getElementById('dash-btc-sub');
    try {
      const res  = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=cad&include_24hr_change=true'
      );
      const data  = await res.json();
      const prix  = data && data.bitcoin ? data.bitcoin.cad : null;
      const var24 = data && data.bitcoin ? data.bitcoin.cad_24h_change : undefined;

      etat.btc_prix      = prix;
      etat.btc_variation = var24;

      if (el) {
        const formatted = prix
          ? prix.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
          : 'Indispo';
        el.textContent = formatted;
        el.className   = 'dash-card-value ' + (var24 >= 0 ? 'positif' : 'negatif');
      }
      if (elSub && var24 !== undefined) {
        const signe = var24 >= 0 ? '▲' : '▼';
        const color = var24 >= 0 ? '#3fb950' : '#f85149';
        elSub.innerHTML = `<span style="color:${color}">${signe} ${Math.abs(var24).toFixed(2)}% (24h)</span>`;
      }
    } catch (e) {
      if (el)    { el.textContent = 'Erreur API'; el.className = 'dash-card-value negatif'; }
      if (elSub) elSub.textContent = 'CoinGecko indisponible';
    }
  }

  // ─── FETCH MÉTÉO (Open-Meteo — gratuit, sans clé API) ──────
  async function _fetchMeteo() {
    const el    = document.getElementById('dash-meteo');
    const elSub = document.getElementById('dash-meteo-sub');
    try {
      // Coordonnées de Normandin, Québec
      const lat = 48.8333;
      const lon = -72.5333;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m&timezone=America%2FToronto`;

      const res  = await fetch(url);
      const data = await res.json();
      const cw   = data ? data.current_weather : null;

      if (cw) {
        const temp  = Math.round(cw.temperature);
        const vent  = Math.round(cw.windspeed);
        const icone = _iconeMeteo(cw.weathercode, cw.is_day);

        etat.meteo_temp = temp;
        etat.meteo_desc = `${icone} ${temp}°C`;

        if (el)    el.textContent    = `${icone} ${temp}°C`;
        if (elSub) elSub.textContent = `Vent : ${vent} km/h — ${CONFIG.ville_meteo}`;
      }
    } catch (e) {
      if (el)    el.textContent    = 'Météo indispo';
      if (elSub) elSub.textContent = 'Open-Meteo inaccessible';
    }
  }

  function _iconeMeteo(code, isDay) {
    if (code === 0)  return isDay ? '☀️' : '🌙';
    if (code <= 2)   return isDay ? '⛅' : '🌤️';
    if (code === 3)  return '☁️';
    if (code <= 49)  return '🌫️';
    if (code <= 59)  return '🌦️';
    if (code <= 69)  return '🌧️';
    if (code <= 79)  return '🌨️';
    if (code <= 82)  return '🌧️';
    if (code <= 86)  return '❄️';
    if (code <= 99)  return '⛈️';
    return '🌡️';
  }

  // ─── GESTION DU SHIFT ──────────────────────────────────────
  function toggleShift() {
    const btn = document.getElementById('dash-shift-btn');
    if (!etat.heure_debut) {
      // Démarrer
      etat.heure_debut = new Date();
      _sauverShift();
      if (btn) {
        btn.textContent = '⏹ Arrêter le shift';
        btn.classList.add('active');
      }
    } else {
      // Arrêter
      const fin   = new Date();
      const diffH = (fin - etat.heure_debut) / 3600000;
      const gain  = diffH * CONFIG.taux_horaire;

      etat.heure_debut = null;
      _sauverShift();

      if (btn) {
        btn.textContent = '▶ Démarrer le shift';
        btn.classList.remove('active');
      }
      if (window.TilexToast && typeof window.TilexToast.show === 'function') {
        window.TilexToast.show(
          `Shift terminé — ${diffH.toFixed(1)}h = ${Math.floor(gain)}$`, 'success'
        );
      }
    }
  }

  function _sauverShift() {
    try {
      localStorage.setItem(CONFIG.cleShift, JSON.stringify({
        debut: etat.heure_debut ? etat.heure_debut.toISOString() : null,
        jour:  new Date().toISOString().slice(0, 10)
      }));
    } catch (e) {}
  }

  function _chargerHeuresLocales() {
    try {
      const brut = localStorage.getItem(CONFIG.cleShift);
      if (!brut) return;
      const info = JSON.parse(brut);
      // Ne restaure un shift en cours que s'il a démarré aujourd'hui.
      const aujd = new Date().toISOString().slice(0, 10);
      if (info && info.debut && info.jour === aujd) {
        etat.heure_debut = new Date(info.debut);
        const btn = document.getElementById('dash-shift-btn');
        if (btn) {
          btn.textContent = '⏹ Arrêter le shift';
          btn.classList.add('active');
        }
      }
    } catch (e) {}
  }

  // ─── AFFICHAGE ─────────────────────────────────────────────
  function toggle() {
    const dash = document.getElementById('tilex-dashboard');
    const btn  = document.getElementById('dash-toggle-btn');
    if (!dash) return;
    dash.classList.toggle('collapsed');
    if (btn) btn.textContent = dash.classList.contains('collapsed') ? '+' : '−';
  }

  function detruire() {
    etat.intervalles.forEach((id) => clearInterval(id));
    etat.intervalles = [];
    const dash  = document.getElementById('tilex-dashboard');
    const style = document.getElementById('tilex-dashboard-style');
    if (dash)  dash.remove();
    if (style) style.remove();
    etat.visible = false;
  }

  // ─── API PUBLIQUE ──────────────────────────────────────────
  return {
    CONFIG,
    init,
    toggle,
    toggleShift,
    detruire,
    getEtat: () => Object.assign({}, etat, { intervalles: undefined }),
  };

})();

// Démarrage auto.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TilexDashboard.init());
} else {
  TilexDashboard.init();
}

window.TilexDashboard = TilexDashboard;
