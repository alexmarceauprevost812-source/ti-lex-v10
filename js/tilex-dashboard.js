// ============================================================
// js/tilex-dashboard.js — TilexDashboard v1.1
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Panneau haut-droit :
//   • PUBLIC (toujours visible)      : heure + météo
//   • PRIVÉ  (admin, sur demande)    : heures travaillées + salaire
// Le privé s'ouvre par une commande dans le chat (/heures, /salaire…)
// et n'est JAMAIS visible pour les autres utilisateurs.
// ============================================================

const TilexDashboard = (() => {

  // ─── CONFIG ────────────────────────────────────────────────
  const CONFIG = {
    taux_horaire:    40,          // $ / heure
    ville_meteo:     'Normandin',
    devise:          'CAD',
    refresh_meteo:   600000,      // météo toutes les 10 min
    refresh_horloge: 1000,        // horloge chaque seconde
    cleShift:        'tilex_dashboard_shift',
  };

  // ─── ÉTAT ──────────────────────────────────────────────────
  let etat = {
    meteo_temp:     null,
    meteo_desc:     null,
    heure_debut:    null,         // Date de début de shift (ou null)
    heures_today:   0,
    salaire_today:  0,
    intervalles:    [],
    visible:        false,
  };

  // ─── INIT (panneau PUBLIC : heure + météo) ─────────────────
  function init() {
    if (etat.visible) return;
    _creerUI();
    _demarrerHorloge();
    _fetchMeteo();
    _chargerHeuresLocales();
    etat.intervalles.push(setInterval(_fetchMeteo, CONFIG.refresh_meteo));
    etat.visible = true;
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
        width: 240px;
        max-width: 88vw;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        transition: all 0.3s ease;
        user-select: none;
      }
      #tilex-dashboard.collapsed { width: auto; padding: 10px 14px; border-radius: 30px; }
      #tilex-dashboard.collapsed .dash-body { display: none; }
      .dash-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px; cursor: pointer;
      }
      #tilex-dashboard.collapsed .dash-header { margin-bottom: 0; }
      .dash-title { color: #ff3c3c; font-weight: 700; font-size: 13px; letter-spacing: 0.5px; }
      .dash-toggle { background: none; border: none; color: #8b949e; cursor: pointer; font-size: 14px; padding: 0; line-height: 1; }
      .dash-body { display: flex; flex-direction: column; gap: 10px; }
      .dash-card { background: #161b22; border: 1px solid #21262d; border-radius: 10px; padding: 10px 12px; }
      .dash-card-label { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; font-weight: 600; }
      .dash-card-value { font-size: 18px; font-weight: 700; color: #e6edf3; line-height: 1.2; }
      .dash-card-sub { font-size: 11px; color: #8b949e; margin-top: 2px; }
      .dash-card-value.neutre  { color: #58a6ff; }
      .dash-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .dash-shift { border-color: #ff3c3c44; }
      .dash-shift .dash-card-value { color: #ff3c3c; font-size: 16px; }
      .dash-prive-tag { font-size: 9px; color: #ff3c3c; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; font-weight: 700; }
      .dash-btn { width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #30363d; background: #21262d; color: #e6edf3; font-size: 12px; cursor: pointer; font-weight: 600; transition: background 0.2s; }
      .dash-btn:hover { background: #30363d; }
      .dash-btn.active { background: #ff3c3c; border-color: #ff3c3c; color: #fff; }
    `;
    document.head.appendChild(style);

    const dash = document.createElement('div');
    dash.id    = 'tilex-dashboard';
    dash.innerHTML = `
      <div class="dash-header" onclick="TilexDashboard.toggle()">
        <span class="dash-title">⚡ Ti-lex</span>
        <button class="dash-toggle" id="dash-toggle-btn">−</button>
      </div>
      <div class="dash-body">

        <!-- Horloge (PUBLIC) -->
        <div class="dash-card">
          <div class="dash-card-label">🕐 Heure locale</div>
          <div class="dash-card-value neutre" id="dash-heure">--:--:--</div>
          <div class="dash-card-sub" id="dash-date">Chargement...</div>
        </div>

        <!-- Météo (PUBLIC) -->
        <div class="dash-card">
          <div class="dash-card-label">🌤️ Météo — ${CONFIG.ville_meteo}</div>
          <div class="dash-card-value neutre" id="dash-meteo">Chargement…</div>
          <div class="dash-card-sub" id="dash-meteo-sub">Open-Meteo API</div>
        </div>

        <!-- Emplacement du bloc PRIVÉ (heures + salaire), injecté à la demande -->

      </div>
    `;
    document.body.appendChild(dash);
  }

  // ─── HORLOGE ───────────────────────────────────────────────
  function _demarrerHorloge() {
    const tick = () => {
      const now   = new Date();
      const heure = now.toLocaleTimeString('fr-CA', { hour12: false });
      const date  = now.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });

      const elH = document.getElementById('dash-heure');
      const elD = document.getElementById('dash-date');
      if (elH) elH.textContent = heure;
      if (elD) elD.textContent = date.charAt(0).toUpperCase() + date.slice(1);

      // Shift en cours → maj heures/salaire (seulement si le bloc privé est ouvert).
      if (etat.heure_debut) {
        const diffH   = (now - etat.heure_debut) / 3600000;
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

  // ─── FETCH MÉTÉO (Open-Meteo — gratuit, sans clé API) ──────
  async function _fetchMeteo() {
    const el    = document.getElementById('dash-meteo');
    const elSub = document.getElementById('dash-meteo-sub');
    try {
      const lat = 48.8333, lon = -72.5333; // Normandin, Québec
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=America%2FToronto`;
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

  // ─── VERROU ADMIN (info privée : heures + salaire) ─────────
  function _estAdmin() {
    try {
      if (typeof window.isModeMaitre === 'function') return window.isModeMaitre();
    } catch (e) {}
    return false;
  }

  // ─── BLOC PRIVÉ : heures + salaire (admin, sur demande) ────
  function _creerPrive() {
    const body = document.querySelector('#tilex-dashboard .dash-body');
    if (!body || document.getElementById('dash-prive')) return;

    const bloc = document.createElement('div');
    bloc.id = 'dash-prive';
    bloc.innerHTML = `
      <div class="dash-prive-tag">🔒 Privé — visible par toi seulement</div>
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
      <button class="dash-btn" id="dash-shift-btn" style="margin-top:8px" onclick="TilexDashboard.toggleShift()">
        ▶ Démarrer le shift
      </button>
    `;
    body.appendChild(bloc);

    // Reflète l'état d'un shift déjà en cours.
    const btn = document.getElementById('dash-shift-btn');
    if (etat.heure_debut && btn) {
      btn.textContent = '⏹ Arrêter le shift';
      btn.classList.add('active');
    }
  }

  function _retirerPrive() {
    const bloc = document.getElementById('dash-prive');
    if (bloc) bloc.remove();
  }

  // Ouvre/ferme le bloc privé — admin uniquement. Retourne true si ouvert.
  function basculer() {
    if (!_estAdmin()) return false;   // 🔒 jamais pour les autres
    if (!document.getElementById('tilex-dashboard')) init();
    // Si le panneau était replié, on le déploie.
    const dash = document.getElementById('tilex-dashboard');
    if (dash && dash.classList.contains('collapsed')) toggle();

    if (document.getElementById('dash-prive')) { _retirerPrive(); return false; }
    _creerPrive();
    return true;
  }

  // ─── GESTION DU SHIFT ──────────────────────────────────────
  function toggleShift() {
    if (!_estAdmin()) return;
    const btn = document.getElementById('dash-shift-btn');
    if (!etat.heure_debut) {
      etat.heure_debut = new Date();
      _sauverShift();
      if (btn) { btn.textContent = '⏹ Arrêter le shift'; btn.classList.add('active'); }
    } else {
      const fin   = new Date();
      const diffH = (fin - etat.heure_debut) / 3600000;
      const gain  = diffH * CONFIG.taux_horaire;
      etat.heure_debut = null;
      _sauverShift();
      if (btn) { btn.textContent = '▶ Démarrer le shift'; btn.classList.remove('active'); }
      if (window.TilexToast && typeof window.TilexToast.show === 'function') {
        window.TilexToast.show(`Shift terminé — ${diffH.toFixed(1)}h = ${Math.floor(gain)}$`, 'success');
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
      const aujd = new Date().toISOString().slice(0, 10);
      if (info && info.debut && info.jour === aujd) {
        etat.heure_debut = new Date(info.debut); // shift repris en arrière-plan
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
    basculer,                 // ouvre/ferme le bloc privé (admin)
    estAdmin: _estAdmin,
    toggle,
    toggleShift,
    detruire,
    getEtat: () => Object.assign({}, etat, { intervalles: undefined }),
  };

})();

// Démarrage auto du panneau PUBLIC (heure + météo). Le bloc privé
// (heures + salaire) reste caché tant que l'admin ne le demande pas.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TilexDashboard.init());
} else {
  TilexDashboard.init();
}

window.TilexDashboard = TilexDashboard;
