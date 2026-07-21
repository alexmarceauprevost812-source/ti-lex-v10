// ============================================================
// js/tilex-schema-panel.js — TilexSchemaPanel v1.0
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Ouvre le MOTEUR DE SCHÉMAS ANIMÉS (schemas-animes/index.html)
// directement par-dessus le chat, sur demande (/schema).
// ============================================================

const TilexSchemaPanel = (() => {

  const SRC = '/schemas-animes/index.html';
  let etat = { ouvert: false, charge: false };

  function _style() {
    if (document.getElementById('tilex-schema-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-schema-style';
    s.textContent = `
      #tilex-schema { position:fixed; inset:0; z-index:99997; opacity:0; pointer-events:none;
        transition:opacity .2s; background:rgba(0,0,0,.75); }
      #tilex-schema.on { opacity:1; pointer-events:auto; }
      #tilex-schema .ts-panel { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        width:min(960px,96vw); height:min(88vh,900px); background:#0b0f14; border:1px solid #1e2630;
        border-radius:16px; overflow:hidden; box-shadow:0 24px 70px rgba(0,0,0,.85);
        display:flex; flex-direction:column; }
      #tilex-schema .ts-head { display:flex; justify-content:space-between; align-items:center;
        padding:10px 14px; background:#0d1117; border-bottom:1px solid #1e2630; flex-shrink:0;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
      #tilex-schema .ts-titre { font-weight:800; font-size:14px; color:#ff7a00; }
      #tilex-schema .ts-actions { display:flex; gap:8px; align-items:center; }
      #tilex-schema .ts-open { background:#111; border:1px solid #ff7a00; color:#ff7a00; border-radius:8px;
        padding:5px 10px; font-size:12px; font-weight:700; cursor:pointer; text-decoration:none; }
      #tilex-schema .ts-x { background:none; border:none; color:#8b949e; font-size:22px; cursor:pointer; line-height:1; }
      #tilex-schema iframe { flex:1; width:100%; border:0; background:#0b0f14; }
    `;
    document.head.appendChild(s);
  }

  function _construire() {
    if (document.getElementById('tilex-schema')) return;
    _style();
    const el = document.createElement('div');
    el.id = 'tilex-schema';
    el.innerHTML = `
      <div class="ts-panel" onclick="event.stopPropagation()">
        <div class="ts-head">
          <span class="ts-titre">🗺️ Schémas animés</span>
          <div class="ts-actions">
            <a class="ts-open" href="${SRC}" target="_blank" rel="noopener">Ouvrir en grand ↗</a>
            <button class="ts-x" onclick="TilexSchemaPanel.fermer()">✕</button>
          </div>
        </div>
        <iframe id="tilex-schema-frame" title="Moteur de schémas animés" loading="lazy"
          allow="clipboard-write"></iframe>
      </div>`;
    el.addEventListener('click', fermer);  // clic sur le fond = ferme
    document.body.appendChild(el);
  }

  function ouvrir() {
    _construire();
    // Charge l'iframe seulement à la 1re ouverture (économie).
    if (!etat.charge) {
      const f = document.getElementById('tilex-schema-frame');
      if (f) { f.src = SRC; etat.charge = true; }
    }
    requestAnimationFrame(() => document.getElementById('tilex-schema').classList.add('on'));
    etat.ouvert = true;
  }

  function fermer() {
    const el = document.getElementById('tilex-schema');
    if (el) el.classList.remove('on');
    etat.ouvert = false;
  }

  function basculer() { if (etat.ouvert) { fermer(); return false; } ouvrir(); return true; }

  return { ouvrir, fermer, basculer };

})();

// Pas d'affichage auto : s'ouvre SUR DEMANDE (commande /schema dans le chat).
window.TilexSchemaPanel = TilexSchemaPanel;
