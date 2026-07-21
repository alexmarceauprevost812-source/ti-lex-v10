// ============================================================
// js/tilex-truck-panel.js — TilexTruckPanel v1.0
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Ouvre le SUIVI DU CAMION en direct (truck-map.html) par-dessus
// le chat, sur demande (/camion). Bouton pour démarrer le tracking.
// ============================================================

const TilexTruckPanel = (() => {

  const SRC_MAP   = '/truck-map';   // carte live (viewer, temps réel)
  const SRC_TRACK = '/truck';       // traqueur (à ouvrir sur le téléphone dans le camion)
  let etat = { ouvert: false, charge: false };

  function _style() {
    if (document.getElementById('tilex-truck-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-truck-style';
    s.textContent = `
      #tilex-truck { position:fixed; inset:0; z-index:99997; opacity:0; pointer-events:none;
        transition:opacity .2s; background:rgba(0,0,0,.78); }
      #tilex-truck.on { opacity:1; pointer-events:auto; }
      #tilex-truck .tt-panel { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        width:min(960px,96vw); height:min(90vh,920px); background:#0a0a0f; border:1px solid #1e1e2a;
        border-radius:16px; overflow:hidden; box-shadow:0 24px 70px rgba(0,0,0,.85);
        display:flex; flex-direction:column; }
      #tilex-truck .tt-head { display:flex; justify-content:space-between; align-items:center; gap:8px;
        padding:10px 14px; background:#0c0c12; border-bottom:1px solid #1e1e2a; flex-shrink:0;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
      #tilex-truck .tt-titre { font-weight:800; font-size:14px; color:#ff3b3b; white-space:nowrap; }
      #tilex-truck .tt-actions { display:flex; gap:8px; align-items:center; }
      #tilex-truck .tt-track { background:#2ecc71; border:none; color:#04260f; border-radius:8px;
        padding:6px 11px; font-size:12px; font-weight:800; cursor:pointer; text-decoration:none; white-space:nowrap; }
      #tilex-truck .tt-open { background:#111; border:1px solid #ff7a00; color:#ff7a00; border-radius:8px;
        padding:6px 10px; font-size:12px; font-weight:700; cursor:pointer; text-decoration:none; white-space:nowrap; }
      #tilex-truck .tt-x { background:none; border:none; color:#8b949e; font-size:22px; cursor:pointer; line-height:1; }
      #tilex-truck iframe { flex:1; width:100%; border:0; background:#0a0a0f; }
    `;
    document.head.appendChild(s);
  }

  function _construire() {
    if (document.getElementById('tilex-truck')) return;
    _style();
    const el = document.createElement('div');
    el.id = 'tilex-truck';
    el.innerHTML = `
      <div class="tt-panel" onclick="event.stopPropagation()">
        <div class="tt-head">
          <span class="tt-titre">🚛 Suivi du camion — direct</span>
          <div class="tt-actions">
            <a class="tt-track" href="${SRC_TRACK}" target="_blank" rel="noopener" title="À ouvrir sur le téléphone dans le camion">▶ Démarrer le tracking</a>
            <a class="tt-open" href="${SRC_MAP}" target="_blank" rel="noopener">Grand ↗</a>
            <button class="tt-x" onclick="TilexTruckPanel.fermer()">✕</button>
          </div>
        </div>
        <iframe id="tilex-truck-frame" title="Carte du camion en direct" loading="lazy"
          allow="geolocation"></iframe>
      </div>`;
    el.addEventListener('click', fermer);
    document.body.appendChild(el);
  }

  function ouvrir() {
    _construire();
    if (!etat.charge) {
      const f = document.getElementById('tilex-truck-frame');
      if (f) { f.src = SRC_MAP; etat.charge = true; }
    }
    requestAnimationFrame(() => document.getElementById('tilex-truck').classList.add('on'));
    etat.ouvert = true;
  }
  function fermer() {
    const el = document.getElementById('tilex-truck');
    if (el) el.classList.remove('on');
    etat.ouvert = false;
  }
  function basculer() { if (etat.ouvert) { fermer(); return false; } ouvrir(); return true; }

  return { ouvrir, fermer, basculer };

})();

// Pas d'affichage auto : s'ouvre SUR DEMANDE (commande /camion dans le chat).
window.TilexTruckPanel = TilexTruckPanel;
