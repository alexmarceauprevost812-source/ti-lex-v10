// ============================================
// 📁 js/tilex-crypto-logos.js
// MOTEUR LOGOS CRYPTO WEALTHSIMPLE 🇨🇦 — ti-lex-AL v10
// Logos + prix CAD + flag staking pour les cryptos dispo sur Wealthsimple
// Auteur: Alex Marceau-Prévost
// 🔒 Texte échappé avant insertion (anti-XSS).
// ============================================
(function () {
  "use strict";

  const TilexCryptoLogos = {

    // 🍁 Cryptos Wealthsimple (top populaires) — staking=true = stakable sur WS
    cryptos: {
      btc:  { nom:'Bitcoin',     symbole:'BTC',  id:'bitcoin',      couleur:'#F7931A', staking:false, logo:'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',     alias:['btc','bitcoin','bitcoine','bitcoinne'] },
      eth:  { nom:'Ethereum',    symbole:'ETH',  id:'ethereum',     couleur:'#627EEA', staking:true,  logo:'https://assets.coingecko.com/coins/images/279/small/ethereum.png',  alias:['eth','ethereum','ether','ethereume'] },
      sol:  { nom:'Solana',      symbole:'SOL',  id:'solana',       couleur:'#14F195', staking:true,  logo:'https://assets.coingecko.com/coins/images/4128/small/solana.png',  alias:['sol','solana','solanna'] },
      ada:  { nom:'Cardano',     symbole:'ADA',  id:'cardano',      couleur:'#0033AD', staking:true,  logo:'https://assets.coingecko.com/coins/images/975/small/cardano.png',  alias:['ada','cardano'] },
      dot:  { nom:'Polkadot',    symbole:'DOT',  id:'polkadot',     couleur:'#E6007A', staking:true,  logo:'https://assets.coingecko.com/coins/images/12171/small/polkadot.png', alias:['dot','polkadot'] },
      xrp:  { nom:'XRP',         symbole:'XRP',  id:'ripple',       couleur:'#23292F', staking:false, logo:'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png', alias:['xrp','ripple'] },
      doge: { nom:'Dogecoin',    symbole:'DOGE', id:'dogecoin',     couleur:'#C2A633', staking:false, logo:'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',    alias:['doge','dogecoin','doge coin'] },
      bch:  { nom:'Bitcoin Cash',symbole:'BCH',  id:'bitcoin-cash', couleur:'#0AC18E', staking:false, logo:'https://assets.coingecko.com/coins/images/780/small/bitcoin-cash-circle.png', alias:['bch','bitcoin cash','bitcoincash'] },
      ltc:  { nom:'Litecoin',    symbole:'LTC',  id:'litecoin',     couleur:'#345D9D', staking:false, logo:'https://assets.coingecko.com/coins/images/2/small/litecoin.png',    alias:['ltc','litecoin'] },
      avax: { nom:'Avalanche',   symbole:'AVAX', id:'avalanche-2',  couleur:'#E84142', staking:false, logo:'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png', alias:['avax','avalanche'] },
      link: { nom:'Chainlink',   symbole:'LINK', id:'chainlink',    couleur:'#2A5ADA', staking:false, logo:'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png', alias:['link','chainlink'] },
      bnb:  { nom:'BNB',         symbole:'BNB',  id:'binancecoin',  couleur:'#F3BA2F', staking:false, logo:'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png', alias:['bnb','binance coin','binancecoin'] },
      arb:  { nom:'Arbitrum',    symbole:'ARB',  id:'arbitrum',     couleur:'#28A0F0', staking:false, logo:'https://assets.coingecko.com/coins/images/16547/small/arb.jpg',     alias:['arb','arbitrum'] },
      algo: { nom:'Algorand',    symbole:'ALGO', id:'algorand',     couleur:'#000000', staking:false, logo:'https://assets.coingecko.com/coins/images/4380/small/download.png',  alias:['algo','algorand'] },
      aave: { nom:'Aave',        symbole:'AAVE', id:'aave',         couleur:'#B6509E', staking:false, logo:'https://assets.coingecko.com/coins/images/12645/small/aave-token-round.png', alias:['aave'] },
      bonk: { nom:'Bonk',        symbole:'BONK', id:'bonk',         couleur:'#FF7A00', staking:false, logo:'https://assets.coingecko.com/coins/images/28600/small/bonk.jpg',    alias:['bonk'] }
    },

    // 💾 Cache des prix (évite de spammer l'API)
    prixCache: {},
    derniereMaj: 0,
    _enCours: null,

    // Échappe les caractères HTML (anti-XSS).
    _esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },

    /** 💰 Récupère les prix en CAD via CoinGecko (gratuit, aucune clé). Cache 60 s + dédup. */
    async chargerPrix() {
      const maintenant = Date.now();
      if (maintenant - this.derniereMaj < 60000 && Object.keys(this.prixCache).length) {
        return this.prixCache;
      }
      if (this._enCours) return this._enCours;
      const ids = Object.values(this.cryptos).map((c) => c.id).join(',');
      const url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + ids +
        '&vs_currencies=cad&include_24hr_change=true';
      this._enCours = (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          this.prixCache = data;
          this.derniereMaj = Date.now();
          return data;
        } catch (e) {
          console.warn('⚠️ TilexCrypto: prix CAD pas dispo (offline?)', e);
          return this.prixCache;
        } finally {
          this._enCours = null;
        }
      })();
      return this._enCours;
    },

    /** 🔍 Cherche une crypto à partir d'un mot */
    trouver(mot) {
      const clean = mot.toLowerCase().trim();
      for (const key in this.cryptos) {
        if (this.cryptos[key].alias.includes(clean)) return this.cryptos[key];
      }
      return null;
    },

    /** 💵 Formate un prix en dollars canadiens (style québécois) */
    formatCAD(montant) {
      if (montant == null) return '';
      return new Intl.NumberFormat('fr-CA', {
        style: 'currency', currency: 'CAD',
        maximumFractionDigits: montant < 1 ? 6 : 2
      }).format(montant);
    },

    /** 🏷️ Badge logo + prix CAD + variation + flag staking 🥩 */
    badge(crypto) {
      const data = this.prixCache[crypto.id];
      const prix = data ? this._esc(this.formatCAD(data.cad)) : '';
      const change = data ? data.cad_24h_change : null;
      let variation = '';
      if (change != null && isFinite(change)) {
        const fleche = change >= 0 ? '▲' : '▼';
        const classeVar = change >= 0 ? 'tilex-up' : 'tilex-down';
        variation = '<span class="tilex-crypto-var ' + classeVar + '">' +
          fleche + ' ' + Math.abs(change).toFixed(1) + '%</span>';
      }
      const stake = crypto.staking
        ? '<span class="tilex-crypto-stake" title="Stakable sur Wealthsimple">🥩</span>' : '';
      return '<span class="tilex-crypto-badge" style="--c:' + crypto.couleur + '" title="' + this._esc(crypto.nom) + ' • Wealthsimple">' +
        '<img src="' + crypto.logo + '" alt="' + crypto.symbole + '" class="tilex-crypto-logo" onerror="this.style.display=\'none\'">' +
        '<span class="tilex-crypto-nom">' + crypto.symbole + '</span>' +
        (prix ? '<span class="tilex-crypto-prix">' + prix + '</span>' : '') +
        variation + stake +
      '</span>';
    },

    // Remplacement synchrone (texte échappé + badges depuis le cache).
    _injecterSync(texte) {
      return this._esc(texte).replace(/\b([a-zA-Zéè]+)\b/g, (match) => {
        const crypto = this.trouver(match);
        return crypto ? this.badge(crypto) : match;
      });
    },

    /** ✨ Scanne un texte → badges (prix CAD live). ASYNC. Texte échappé (anti-XSS). */
    async injecter(texte) {
      await this.chargerPrix();
      return this._injecterSync(texte);
    },

    _contientCrypto(texte) {
      const mots = String(texte).match(/[a-zA-Zéè]+/g);
      return mots ? mots.some((m) => this.trouver(m)) : false;
    },

    /** 🌳 Rehausse un élément déjà rendu (Markdown/HTML) — texte seulement, saute pre/code/a. */
    async rehausser(root) {
      if (!root || !root.ownerDocument) return;
      await this.chargerPrix();
      const SKIP = { PRE: 1, CODE: 1, A: 1, SCRIPT: 1, STYLE: 1, BUTTON: 1, IMG: 1, TEXTAREA: 1 };
      const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          let p = node.parentNode;
          while (p && p !== root) {
            if (SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
            if (p.classList && p.classList.contains("tilex-crypto-badge")) return NodeFilter.FILTER_REJECT;
            p = p.parentNode;
          }
          return this._contientCrypto(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      const cibles = [];
      let n;
      while ((n = walker.nextNode())) cibles.push(n);
      cibles.forEach((textNode) => {
        const span = document.createElement("span");
        span.innerHTML = this._injecterSync(textNode.nodeValue);
        textNode.parentNode.replaceChild(span, textNode);
      });
    }
  };

  // CSS du badge (injecté une seule fois).
  if (!document.getElementById("tilex-crypto-logos-css")) {
    const st = document.createElement("style");
    st.id = "tilex-crypto-logos-css";
    st.textContent =
      ".tilex-crypto-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 9px 2px 4px;margin:0 2px;" +
      "border-radius:20px;background:rgba(255,255,255,0.06);border:1px solid var(--c,#F7931A);vertical-align:middle;" +
      "font-weight:600;transition:transform .15s ease,box-shadow .15s ease;}" +
      ".tilex-crypto-badge:hover{transform:translateY(-1px);box-shadow:0 0 12px var(--c,#F7931A);}" +
      ".tilex-crypto-logo{width:18px;height:18px;border-radius:50%;}" +
      ".tilex-crypto-nom{color:var(--c,#F7931A);font-size:.85em;letter-spacing:.5px;}" +
      ".tilex-crypto-prix{color:#e8e8e8;font-size:.82em;font-weight:700;}" +
      ".tilex-crypto-var{font-size:.75em;font-weight:700;}" +
      ".tilex-up{color:#16c784;}" +
      ".tilex-down{color:#ea3943;}" +
      ".tilex-crypto-stake{font-size:.85em;line-height:1;}";
    (document.head || document.documentElement).appendChild(st);
  }

  // 🌍 Expose globalement pour ti-lex-AL
  window.TilexCryptoLogos = TilexCryptoLogos;
})();
