// ============================================================
// ti-lex-AL v10 — Module Météo Live (Open-Meteo, sans clé API)
// Auteur: Alex Marceau-Prévost
// API gratuite https://open-meteo.com — AUCUNE clé requise (rien à exposer).
// Marche partout (Starlink). Alertes auto pour conditions dangereuses.
//   TilexMeteo.fetch(lat,lon)  → {temp,ressenti,vent,precip,code,emoji,desc,...}
//   TilexMeteo.normandin()     → météo de Normandin
//   TilexMeteo.rendreHTML(m)   → carte HTML prête à afficher
//   TilexMeteo.alertes(m)      → tableau d'alertes (verglas, froid, etc.)
// ============================================================
(function () {
  "use strict";

  // Code WMO → emoji + description (fixe, donc rendu HTML sûr)
  var WMO = {
    0:["☀️","Dégagé"], 1:["🌤️","Plutôt dégagé"], 2:["⛅","Partiellement nuageux"], 3:["☁️","Couvert"],
    45:["🌫️","Brouillard"], 48:["🌫️","Brouillard givrant"],
    51:["🌦️","Bruine légère"], 53:["🌦️","Bruine"], 55:["🌦️","Bruine dense"],
    56:["🧊","Bruine verglaçante"], 57:["🧊","Bruine verglaçante"],
    61:["🌧️","Pluie légère"], 63:["🌧️","Pluie"], 65:["🌧️","Pluie forte"],
    66:["🧊","Pluie verglaçante"], 67:["🧊","Pluie verglaçante forte"],
    71:["❄️","Neige légère"], 73:["❄️","Neige"], 75:["❄️","Neige forte"], 77:["🌨️","Grains de neige"],
    80:["🌦️","Averses"], 81:["🌦️","Averses"], 82:["🌦️","Averses violentes"],
    85:["🌨️","Averses de neige"], 86:["🌨️","Averses de neige fortes"],
    95:["⛈️","Orage"], 96:["⛈️","Orage + grêle"], 99:["⛈️","Orage violent + grêle"]
  };

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function decode(code){ var w = WMO[code] || ["🌡️","Conditions inconnues"]; return { emoji:w[0], desc:w[1] }; }

  function fetchMeteo(lat, lon){
    var u = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&timezone=auto";
    return fetch(u).then(function(r){
      if(!r.ok) throw new Error("Météo HTTP " + r.status);
      return r.json();
    }).then(function(j){
      var c = j.current || {};
      var d = decode(c.weather_code);
      return {
        lat: lat, lon: lon,
        temp: c.temperature_2m, ressenti: c.apparent_temperature,
        vent: c.wind_speed_10m, precip: c.precipitation,
        code: c.weather_code, heure: c.time,
        emoji: d.emoji, desc: d.desc
      };
    });
  }

  // Alertes conditions dangereuses (routes / travail forêt / camion)
  function alertes(m){
    if(!m) return [];
    var a = [];
    var code = m.code, vent = m.vent || 0, t = (m.ressenti != null ? m.ressenti : m.temp);
    if (t != null && t <= -25) a.push("🥶 Froid extrême (" + Math.round(t) + "°) — protège-toi");
    if ([56,57,66,67].indexOf(code) !== -1) a.push("🧊 VERGLAS — routes glacées, prudence");
    if ([71,73,75,77,85,86].indexOf(code) !== -1 && vent >= 30) a.push("🌨️ Poudrerie / visibilité réduite");
    else if ([75,86].indexOf(code) !== -1) a.push("❄️ Neige forte");
    if (vent >= 40) a.push("💨 Vents forts (" + Math.round(vent) + " km/h)");
    if ([95,96,99].indexOf(code) !== -1) a.push("⛈️ Orage");
    return a;
  }

  function rendreHTML(m){
    if(!m) return '<div class="tlx-meteo tm-err">🌐 Météo indisponible</div>';
    var al = alertes(m);
    var alHtml = al.length ? '<div class="tm-alert">⚠️ ' + al.map(esc).join("<br>⚠️ ") + '</div>' : '';
    return '<div class="tlx-meteo">' +
      '<div class="tm-main"><span class="tm-emo">' + m.emoji + '</span>' +
        '<div><div class="tm-temp">' + Math.round(m.temp) + '°C</div>' +
        '<div class="tm-desc">' + esc(m.desc) + ' · ressenti ' + Math.round(m.ressenti) + '°</div></div></div>' +
      '<div class="tm-row">💨 ' + Math.round(m.vent || 0) + ' km/h · 🌧️ ' + (m.precip || 0) + ' mm</div>' +
      alHtml + '</div>';
  }

  // CSS auto-injectée (marche sur n'importe quelle page)
  function injectCSS(){
    if(document.getElementById("tlx-meteo-css")) return;
    var st = document.createElement("style"); st.id = "tlx-meteo-css";
    st.textContent =
      ".tlx-meteo{background:#14141c;border:1px solid #26263a;border-radius:14px;padding:14px 16px;color:#e8e8e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
      ".tlx-meteo.tm-err{color:#888;text-align:center;font-size:.9rem;}" +
      ".tm-main{display:flex;align-items:center;gap:14px;}" +
      ".tm-emo{font-size:2.4rem;line-height:1;}" +
      ".tm-temp{font-size:1.7rem;font-weight:800;color:#fff;}" +
      ".tm-desc{color:#9aa;font-size:.85rem;margin-top:2px;}" +
      ".tm-row{margin-top:10px;color:#bbb;font-size:.85rem;}" +
      ".tm-alert{margin-top:10px;background:rgba(255,59,59,.12);border:1px solid #ff3b3b55;color:#ffb3b3;border-radius:10px;padding:8px 10px;font-size:.82rem;font-weight:600;line-height:1.5;}";
    (document.head || document.documentElement).appendChild(st);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectCSS); else injectCSS();

  window.TilexMeteo = {
    fetch: fetchMeteo,
    normandin: function(){ return fetchMeteo(48.83, -72.53); },
    decode: decode,
    alertes: alertes,
    rendreHTML: rendreHTML
  };
})();
