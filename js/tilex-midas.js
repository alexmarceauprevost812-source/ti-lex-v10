// ============================================================
// js/tilex-midas.js — TilexMIDAS v1.0
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Prix live BTC/ETH/SOL/BNB/XRP en CAD via CoinGecko
// Zéro clé API requise — gratuit, 30 calls/min
// ============================================================

const TilexMIDAS = (() => {

  // ─── CONFIG ────────────────────────────────────────────────
  const CONFIG = {
    refresh_ms:  60000,   // refresh toutes les 60 secondes
    devise:      'cad',   // dollar canadien
    devise_label:'CAD',
    api_base:    'https://api.coingecko.com/api/v3',
    cryptos: [
      { id: 'bitcoin',  symbole: 'BTC', emoji: '₿',  couleur: '#f7931a' },
      { id: 'ethereum', symbole: 'ETH', emoji: 'Ξ',  couleur: '#627eea' },
      { id: 'solana',   symbole: 'SOL', emoji: '◎',  couleur: '#9945ff' },
      { id: 'binancecoin', symbole: 'BNB', emoji: '⬡', couleur: '#f3ba2f' },
      { id: 'ripple',   symbole: 'XRP', emoji: '✕',  couleur: '#00aae4' },
    ]
  };

  let intervalle   = null;
  let derniereMAJ  = null;

  // ─── INIT ──────────────────────────────────────────────────

  function init() {
    if (document.getElementById('tilex-midas')) return;
    _injecterStyles();
    _injecterUI();
    _fetchPrix();
    intervalle = setInterval(_fetchPrix, CONFIG.refresh_ms);
    console.log('[TilexMIDAS] ✅ Démarré — refresh toutes les 60s');
  }

  function destroy() {
    clearInterval(intervalle);
    const el = document.getElementById('tilex-midas');
    if (el) el.remove();
  }

  // ─── STYLES ────────────────────────────────────────────────

  function _injecterStyles() {
    if (document.getElementById('tilex-midas-style')) return;
    const s = document.createElement('style');
    s.id = 'tilex-midas-style';
    s.textContent = `
      #tilex-midas {
        position: fixed;
        bottom: 80px;
        left: 12px;
        z-index: 9980;
        background: #0d1117;
        border: 1px solid #21262d;
        border-radius: 16px;
        width: 230px;
        max-width: 80vw;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        overflow: hidden;
        transition: all 0.3s ease;
      }

      #tilex-midas.collapsed { width: auto; border-radius: 30px; }
      #tilex-midas.collapsed .midas-body { display: none; }
      #tilex-midas.collapsed .midas-footer { display: none; }

      .midas-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        cursor: pointer;
        background: #161b22;
        border-bottom: 1px solid #21262d;
      }

      #tilex-midas.collapsed .midas-header {
        border-bottom: none;
        padding: 10px 14px;
      }

      .midas-title {
        font-size: 13px;
        font-weight: 700;
        color: #f7931a;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .midas-toggle {
        background: none;
        border: none;
        color: #8b949e;
        cursor: pointer;
        font-size: 15px;
        line-height: 1;
        padding: 0;
      }

      .midas-body {
        padding: 8px 0;
      }

      .midas-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 14px;
        transition: background 0.15s;
        cursor: default;
      }

      .midas-row:hover {
        background: #161b22;
      }

      .midas-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .midas-emoji {
        font-size: 16px;
        width: 22px;
        text-align: center;
        line-height: 1;
      }

      .midas-symbole {
        font-size: 13px;
        font-weight: 700;
        color: #e6edf3;
      }

      .midas-right {
        text-align: right;
      }

      .midas-prix {
        font-size: 13px;
        font-weight: 700;
        color: #e6edf3;
        font-variant-numeric: tabular-nums;
      }

      .midas-variation {
        font-size: 10px;
        font-weight: 600;
        margin-top: 1px;
      }

      .midas-variation.up   { color: #3fb950; }
      .midas-variation.down { color: #f85149; }
      .midas-variation.flat { color: #8b949e; }

      .midas-footer {
        padding: 8px 14px;
        border-top: 1px solid #21262d;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .midas-maj {
        font-size: 10px;
        color: #8b949e;
      }

      .midas-refresh-btn {
        background: none;
        border: 1px solid #30363d;
        color: #8b949e;
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 10px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .midas-refresh-btn:hover {
        background: #21262d;
        color: #e6edf3;
      }

      .midas-spinner {
        display: inline-block;
        animation: midasSpin 1s linear infinite;
      }

      @keyframes midasSpin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }

      .midas-skeleton {
        background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
        background-size: 200% 100%;
        animation: midasShimmer 1.2s ease-in-out infinite;
        border-radius: 4px;
        height: 13px;
        width: 80px;
      }

      @keyframes midasShimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      .midas-dot-live {
        width: 6px;
        height: 6px;
        background: #3fb950;
        border-radius: 50%;
        display: inline-block;
        animation: midasPulse 2s ease-in-out infinite;
      }

      @keyframes midasPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.4; transform: scale(0.8); }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── UI ────────────────────────────────────────────────────

  function _injecterUI() {
    if (document.getElementById('tilex-midas')) return;

    const rows = CONFIG.cryptos.map(c => `
      <div class="midas-row" id="midas-row-${c.id}">
        <div class="midas-left">
          <span class="midas-emoji" style="color:${c.couleur}">${c.emoji}</span>
          <span class="midas-symbole" style="color:${c.couleur}">${c.symbole}</span>
        </div>
        <div class="midas-right">
          <div class="midas-prix" id="midas-prix-${c.id}">
            <span class="midas-skeleton"></span>
          </div>
          <div class="midas-variation flat" id="midas-var-${c.id}">—</div>
        </div>
      </div>
    `).join('');

    const div = document.createElement('div');
    div.id    = 'tilex-midas';
    div.innerHTML = `
      <div class="midas-header" onclick="TilexMIDAS.toggle()">
        <div class="midas-title">
          <span>⚡</span>
          <span>MIDAS</span>
          <span class="midas-dot-live"></span>
        </div>
        <button class="midas-toggle" id="midas-toggle-btn">−</button>
      </div>
      <div class="midas-body">${rows}</div>
      <div class="midas-footer">
        <span class="midas-maj" id="midas-maj">En attente…</span>
        <button class="midas-refresh-btn" onclick="TilexMIDAS.refresh()">↺ Refresh</button>
      </div>
    `;
    document.body.appendChild(div);
  }

  // ─── FETCH PRIX ────────────────────────────────────────────

  async function _fetchPrix() {
    const ids = CONFIG.cryptos.map(c => c.id).join(',');
    const url = `${CONFIG.api_base}/simple/price?ids=${ids}&vs_currencies=${CONFIG.devise}&include_24hr_change=true&include_market_cap=false`;

    // Indicateur de chargement
    const majEl = document.getElementById('midas-maj');
    if (majEl) majEl.innerHTML = `<span class="midas-spinner">↺</span> Chargement…`;

    try {
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      CONFIG.cryptos.forEach(c => {
        const info     = data[c.id];
        const prixRaw  = info ? info[CONFIG.devise] : undefined;
        const varRaw   = info ? info[`${CONFIG.devise}_24h_change`] : undefined;

        const elPrix = document.getElementById(`midas-prix-${c.id}`);
        const elVar  = document.getElementById(`midas-var-${c.id}`);

        if (elPrix && prixRaw !== undefined) {
          // Formatage selon la valeur (grands prix vs petits)
          let prixFmt;
          if (prixRaw >= 1000) {
            prixFmt = prixRaw.toLocaleString('fr-CA', {
              style: 'currency', currency: 'CAD', maximumFractionDigits: 0
            });
          } else if (prixRaw >= 1) {
            prixFmt = prixRaw.toLocaleString('fr-CA', {
              style: 'currency', currency: 'CAD', maximumFractionDigits: 2
            });
          } else {
            prixFmt = prixRaw.toLocaleString('fr-CA', {
              style: 'currency', currency: 'CAD', maximumFractionDigits: 4
            });
          }
          elPrix.textContent = prixFmt;
        } else if (elPrix) {
          elPrix.textContent = 'N/D';
        }

        if (elVar && varRaw !== undefined) {
          const signe    = varRaw >= 0 ? '▲' : '▼';
          const classe   = varRaw > 0.01 ? 'up' : varRaw < -0.01 ? 'down' : 'flat';
          elVar.textContent = `${signe} ${Math.abs(varRaw).toFixed(2)}%`;
          elVar.className   = `midas-variation ${classe}`;
        }
      });

      derniereMAJ = new Date();
      if (majEl) {
        const heure = derniereMAJ.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        majEl.textContent = `MAJ ${heure}`;
      }

    } catch (err) {
      console.error('[TilexMIDAS] Erreur fetch:', err);
      if (majEl) majEl.textContent = '⚠️ Erreur API';

      CONFIG.cryptos.forEach(c => {
        const el = document.getElementById(`midas-prix-${c.id}`);
        if (el) el.textContent = 'Erreur';
      });
    }
  }

  // ─── TOGGLE (ouvrir/fermer) ─────────────────────────────────

  function toggle() {
    const panel = document.getElementById('tilex-midas');
    const btn   = document.getElementById('midas-toggle-btn');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    if (btn) btn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
  }

  // ─── REFRESH MANUEL ────────────────────────────────────────

  function refresh() {
    _fetchPrix();
  }

  // ─── GETTER DONNÉES ────────────────────────────────────────

  function getDonnees() {
    // Retourne les données brutes pour usage externe
    return {
      derniereMAJ,
      devise: CONFIG.devise_label
    };
  }

  // ─── AJOUTER UNE CRYPTO ────────────────────────────────────

  function ajouterCrypto(id, symbole, emoji, couleur) {
    // Ex: TilexMIDAS.ajouterCrypto('dogecoin', 'DOGE', '🐕', '#c3a634')
    const existe = CONFIG.cryptos.find(c => c.id === id);
    if (existe) return;

    const coul = couleur || '#8b949e';
    CONFIG.cryptos.push({ id, symbole, emoji: emoji || '●', couleur: coul });

    const body = document.querySelector('.midas-body');
    if (body) {
      const row = document.createElement('div');
      row.className = 'midas-row';
      row.id        = `midas-row-${id}`;
      row.innerHTML = `
        <div class="midas-left">
          <span class="midas-emoji" style="color:${coul}">${emoji || '●'}</span>
          <span class="midas-symbole" style="color:${coul}">${symbole}</span>
        </div>
        <div class="midas-right">
          <div class="midas-prix" id="midas-prix-${id}"><span class="midas-skeleton"></span></div>
          <div class="midas-variation flat" id="midas-var-${id}">—</div>
        </div>
      `;
      body.appendChild(row);
    }
    _fetchPrix();
  }

  // ─── RETIRER UNE CRYPTO ────────────────────────────────────

  function retirerCrypto(id) {
    CONFIG.cryptos = CONFIG.cryptos.filter(c => c.id !== id);
    const row = document.getElementById(`midas-row-${id}`);
    if (row) row.remove();
  }

  // Ouvre le ticker s'il est fermé, le ferme s'il est ouvert. Retourne true si ouvert.
  function basculer() {
    if (document.getElementById('tilex-midas')) { destroy(); return false; }
    init();
    return true;
  }

  // ─── API PUBLIQUE ──────────────────────────────────────────
  return {
    init, destroy, basculer, toggle, refresh, getDonnees, ajouterCrypto, retirerCrypto,
  };

})();

// PAS d'affichage automatique : le ticker crypto s'ouvre SUR DEMANDE
// (commande /midas, /crypto, /bourse, /btc dans le chat) via TilexMIDAS.basculer().
window.TilexMIDAS = TilexMIDAS;
