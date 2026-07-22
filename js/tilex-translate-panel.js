// ============================================================
// js/tilex-translate-panel.js — TilexTranslatePanel v1.0
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Ouvre la TRADUCTION (TilexTranslate) dans une fenêtre par-dessus
// le chat, sur demande (/traduire).
// ============================================================

const TilexTranslatePanel = (() => {

  let etat = { ouvert: false, monte: false };

  function _style() {
    if (document.getElementById('tilex-trad-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-trad-style';
    s.textContent = `
      #tilex-trad { position:fixed; inset:0; z-index:99997; opacity:0; pointer-events:none;
        transition:opacity .2s; background:rgba(0,0,0,.75); }
      #tilex-trad.on { opacity:1; pointer-events:auto; }
      #tilex-trad .trd-back { position:absolute; inset:0; }
      #tilex-trad .trd-panel { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        width:min(620px,94vw); max-height:88vh; overflow-y:auto; background:#0b0b0f; border:1px solid #232330;
        border-radius:16px; padding:16px; box-shadow:0 24px 70px rgba(0,0,0,.85); color:#eee;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; -webkit-overflow-scrolling:touch; }
      #tilex-trad .trd-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      #tilex-trad .trd-titre { font-weight:800; font-size:15px; color:#e63946; }
      #tilex-trad .trd-x { background:none; border:none; color:#8b949e; font-size:22px; cursor:pointer; line-height:1; }
    `;
    document.head.appendChild(s);
  }

  function _construire() {
    if (document.getElementById('tilex-trad')) return;
    _style();
    const el = document.createElement('div');
    el.id = 'tilex-trad';
    el.innerHTML = `
      <div class="trd-back" onclick="TilexTranslatePanel.fermer()"></div>
      <div class="trd-panel" onclick="event.stopPropagation()">
        <div class="trd-head">
          <span class="trd-titre">🌐 Traduction terrain</span>
          <button class="trd-x" onclick="TilexTranslatePanel.fermer()">✕</button>
        </div>
        <div id="tilex-translate"></div>
      </div>`;
    document.body.appendChild(el);
  }

  function ouvrir() {
    _construire();
    if (!etat.monte) {
      if (window.TilexTranslate && typeof TilexTranslate.monter === 'function') {
        TilexTranslate.monter('tilex-translate');
        etat.monte = true;
      }
    }
    requestAnimationFrame(() => document.getElementById('tilex-trad').classList.add('on'));
    etat.ouvert = true;
  }
  function fermer() {
    const el = document.getElementById('tilex-trad');
    if (el) el.classList.remove('on');
    etat.ouvert = false;
  }
  function basculer() { if (etat.ouvert) { fermer(); return false; } ouvrir(); return true; }

  return { ouvrir, fermer, basculer };

})();

// Pas d'affichage auto : s'ouvre SUR DEMANDE (commande /traduire dans le chat).
window.TilexTranslatePanel = TilexTranslatePanel;
