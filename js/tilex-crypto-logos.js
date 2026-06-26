// ============================================
// 📁 js/tilex-crypto-logos.js
// MOTEUR LOGOS CRYPTO + PRIX CAD 🇨🇦 — ti-lex-AL v10
// Affiche logo + prix en dollars canadiens en temps réel
// Auteur: Alex Marceau-Prévost
// 🔒 Le texte est échappé avant insertion (anti-XSS).
// ============================================
(function () {
  "use strict";

  const TilexCryptoLogos = {

    // 🎨 Base de données des cryptos (avec l'ID CoinGecko pour le prix)
    cryptos: {
      btc: { nom: 'Bitcoin', symbole: 'BTC', id: 'bitcoin', couleur: '#F7931A',
        logo: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
        alias: ['btc', 'bitcoin', 'bitcoine', 'bitcoinne'] },
      eth: { nom: 'Ethereum', symbole: 'ETH', id: 'ethereum', couleur: '#627EEA',
        logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        alias: ['eth', 'ethereum', 'ether', 'ethereume'] },
      sol: { nom: 'Solana', symbole: 'SOL', id: 'solana', couleur: '#14F195',
        logo: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
        alias: ['sol', 'solana', 'solanna'] },
      xrp: { nom: 'XRP', symbole: 'XRP', id: 'ripple', couleur: '#23292F',
        logo: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
        alias: ['xrp', 'ripple'] },
      ada: { nom: 'Cardano', symbole: 'ADA', id: 'cardano', couleur: '#0033AD',
        logo: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
        alias: ['ada', 'cardano'] },
      doge: { nom: 'Dogecoin', symbole: 'DOGE', id: 'dogecoin', couleur: '#C2A633',
        logo: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
        alias: ['doge', 'dogecoin', 'doge coin'] }
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

    /**
     * 💰 Récupère les prix en CAD via CoinGecko (API gratuite, pas de clé).
     * Cache 60 s + déduplication des appels concurrents.
     */
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
          return this.prixCache; // ancien cache si offline
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
        maximumFractionDigits: montant < 1 ? 4 : 2
      }).format(montant);
    },

    /** 🏷️ Génère le badge logo + prix CAD + variation (données internes/numériques = sûres) */
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
      return '<span class="tilex-crypto-badge" style="--c:' + crypto.couleur + '">' +
        '<img src="' + crypto.logo + '" alt="' + crypto.symbole + '" class="tilex-crypto-logo" ' +
        'onerror="this.style.display=\'none\'">' +
        '<span class="tilex-crypto-nom">' + crypto.symbole + '</span>' +
        (prix ? '<span class="tilex-crypto-prix">' + prix + '</span>' : '') +
        variation +
      '</span>';
    },

    // Remplacement synchrone (texte échappé + badges depuis le cache).
    _injecterSync(texte) {
      return this._esc(texte).replace(/\b([a-zA-Zéè]+)\b/g, (match) => {
        const crypto = this.trouver(match);
        return crypto ? this.badge(crypto) : match;
      });
    },

    /**
     * ✨ Scanne un texte et remplace les cryptos par des badges (avec prix CAD).
     * ⚠️ ASYNC : charge les prix live avant. Texte échappé (anti-XSS).
     */
    async injecter(texte) {
      await this.chargerPrix();
      return this._injecterSync(texte);
    },

    _contientCrypto(texte) {
      const mots = String(texte).match(/[a-zA-Zéè]+/g);
      return mots ? mots.some((m) => this.trouver(m)) : false;
    },

    /**
     * 🌳 Rehausse un élément DÉJÀ rendu (Markdown/HTML) : badges crypto dans le
     * texte seulement (saute pre/code/a/…). Charge les prix une fois, puis remplace.
     */
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
      ".tilex-down{color:#ea3943;}";
    (document.head || document.documentElement).appendChild(st);
  }

  // 🌍 Expose globalement pour ti-lex-AL
  window.TilexCryptoLogos = TilexCryptoLogos;
})();
