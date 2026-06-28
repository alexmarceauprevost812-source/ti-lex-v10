// ============================================================
// ti-lex-AL v10 — Module Météo Live
// Auteur: Alex Marceau-Prévost
// API: Open-Meteo (gratuit, AUCUNE clé requise)
// Marche partout via Starlink — météo exacte selon GPS
// ============================================================

const TilexMeteo = {

  // Codes météo WMO → emoji + texte français
  CODES: {
    0:  ['☀️','Ciel clair'],
    1:  ['🌤️','Plutôt clair'],
    2:  ['⛅','Partiellement nuageux'],
    3:  ['☁️','Nuageux'],
    45: ['🌫️','Brouillard'],
    48: ['🌫️','Brouillard givrant'],
    51: ['🌧️','Bruine légère'],
    53: ['🌧️','Bruine'],
    55: ['🌧️','Bruine forte'],
    61: ['🌧️','Pluie légère'],
    63: ['🌧️','Pluie'],
    65: ['🌧️','Pluie forte'],
    66: ['🌨️','Pluie verglaçante'],
    67: ['🌨️','Pluie verglaçante forte'],
    71: ['🌨️','Neige légère'],
    73: ['❄️','Neige'],
    75: ['❄️','Neige forte'],
    77: ['🌨️','Grains de neige'],
    80: ['🌦️','Averses légères'],
    81: ['🌦️','Averses'],
    82: ['⛈️','Averses violentes'],
    85: ['🌨️','Averses de neige'],
    86: ['❄️','Fortes averses de neige'],
    95: ['⛈️','Orage'],
    96: ['⛈️','Orage avec grêle'],
    99: ['⛈️','Orage violent avec grêle']
  },

  // ============================================================
  // 1. MÉTÉO ACTUELLE selon coords GPS
  // ============================================================
  async actuelle(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation`
      + `&timezone=America%2FMontreal`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Réseau');
      const data = await res.json();
      const c = data.current;
      const [emoji, texte] = this.CODES[c.weather_code] || ['❓','Inconnu'];

      return {
        ok: true,
        temp: Math.round(c.temperature_2m),
        ressenti: Math.round(c.apparent_temperature),
        emoji: emoji,
        description: texte,
        vent: Math.round(c.wind_speed_10m),
        precip: c.precipitation,
        code: c.weather_code
      };
    } catch (e) {
      return { ok: false, erreur: e.message };
    }
  },

  // ============================================================
  // 2. PRÉVISION 7 JOURS
  // ============================================================
  async prevision(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum`
      + `&timezone=America%2FMontreal&forecast_days=7`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      const d = data.daily;
      return {
        ok: true,
        jours: d.time.map((date, i) => {
          const [emoji, texte] = this.CODES[d.weather_code[i]] || ['❓','?'];
          return {
            date: date,
            emoji: emoji,
            description: texte,
            max: Math.round(d.temperature_2m_max[i]),
            min: Math.round(d.temperature_2m_min[i]),
            precip: d.precipitation_sum[i]
          };
        })
      };
    } catch (e) {
      return { ok: false, erreur: e.message };
    }
  },

  // ============================================================
  // 3. ALERTE CONDITIONS DANGEREUSES (pour le bois!)
  // ============================================================
  alerteDanger(meteo) {
    const alertes = [];
    if (!meteo.ok) return alertes;

    // Codes dangereux pour conduire dans le bois
    const dangerCodes = [66, 67, 75, 86, 95, 96, 99, 82];
    if (dangerCodes.includes(meteo.code)) {
      alertes.push('⚠️ ' + meteo.description + ' — conditions difficiles!');
    }
    if (meteo.temp <= -25) {
      alertes.push('🥶 Froid extrême (' + meteo.temp + '°C) — attention!');
    }
    if (meteo.vent >= 50) {
      alertes.push('💨 Vents forts (' + meteo.vent + ' km/h)');
    }
    if (meteo.precip >= 10) {
      alertes.push('🌧️ Grosses précipitations — chemins glissants');
    }
    return alertes;
  },

  // ============================================================
  // 4. MÉTÉO POUR NORMANDIN (raccourci maison)
  // ============================================================
  async normandin() {
    return this.actuelle(48.8290, -72.5320);
  },

  // ============================================================
  // 5. MÉTÉO SELON GPS DU TÉLÉPHONE (dans le truck)
  // ============================================================
  async iciMaintenant() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ ok: false, erreur: 'GPS non disponible' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const m = await this.actuelle(pos.coords.latitude, pos.coords.longitude);
          resolve(m);
        },
        () => resolve({ ok: false, erreur: 'Position refusée' }),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  },

  // ============================================================
  // 6. AFFICHAGE HTML (carte météo prête à coller)
  // ============================================================
  rendreHTML(meteo) {
    if (!meteo || !meteo.ok) {
      return `<div style="color:#888;padding:14px;">🌐 Météo indisponible (${(meteo && meteo.erreur) || 'réseau'})</div>`;
    }
    const alertes = this.alerteDanger(meteo);
    const alertesHTML = alertes.length
      ? `<div style="background:#ff3b3b22;border:1px solid #ff3b3b;border-radius:8px;padding:8px;margin-top:8px;font-size:0.8rem;color:#ffb38a;">${alertes.join('<br>')}</div>`
      : '';

    return `
      <div style="background:#14141c;border:1px solid #26263a;border-radius:14px;padding:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:2.8rem;">${meteo.emoji}</div>
          <div>
            <div style="font-size:1.8rem;font-weight:700;color:#fff;">${meteo.temp}°C</div>
            <div style="color:#999;font-size:0.85rem;">${meteo.description} • ressenti ${meteo.ressenti}°C</div>
          </div>
        </div>
        <div style="display:flex;gap:16px;margin-top:12px;color:#aaa;font-size:0.82rem;">
          <span>💨 ${meteo.vent} km/h</span>
          <span>🌧️ ${meteo.precip} mm</span>
        </div>
        ${alertesHTML}
      </div>`;
  }
};

// Export global
if (typeof window !== 'undefined') window.TilexMeteo = TilexMeteo;
if (typeof module !== 'undefined') module.exports = TilexMeteo;
