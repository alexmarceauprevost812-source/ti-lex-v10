// ============================================
// 📁 js/tilex-crypto-logos.js
// MOTEUR LOGOS CRYPTO — ti-lex-AL v10
// Détecte les cryptos dans le texte et affiche leur logo
// Auteur: Alex Marceau-Prévost
// 🔒 injecter() échappe le texte (anti-XSS) avant d'insérer les badges.
// ============================================
(function () {
  "use strict";

  const TilexCryptoLogos = {

    // 🎨 Base de données des cryptos (logo + couleur + variantes de noms)
    cryptos: {
      btc: {
        nom: 'Bitcoin', symbole: 'BTC', couleur: '#F7931A',
        logo: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
        alias: ['btc', 'bitcoin', 'bitcoine', 'bitcoinne']
      },
      eth: {
        nom: 'Ethereum', symbole: 'ETH', couleur: '#627EEA',
        logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
        alias: ['eth', 'ethereum', 'ether', 'ethereume']
      },
      sol: {
        nom: 'Solana', symbole: 'SOL', couleur: '#14F195',
        logo: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
        alias: ['sol', 'solana', 'solanna']
      },
      xrp: {
        nom: 'XRP', symbole: 'XRP', couleur: '#23292F',
        logo: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
        alias: ['xrp', 'ripple']
      },
      ada: {
        nom: 'Cardano', symbole: 'ADA', couleur: '#0033AD',
        logo: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
        alias: ['ada', 'cardano']
      },
      doge: {
        nom: 'Dogecoin', symbole: 'DOGE', couleur: '#C2A633',
        logo: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
        alias: ['doge', 'dogecoin', 'doge coin']
      }
    },

    // Échappe les caractères HTML (anti-XSS).
    _esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },

    /**
     * 🔍 Cherche une crypto à partir d'un mot
     */
    trouver(mot) {
      const clean = mot.toLowerCase().trim();
      for (const key in this.cryptos) {
        if (this.cryptos[key].alias.includes(clean)) {
          return this.cryptos[key];
        }
      }
      return null;
    },

    /**
     * 🏷️ Génère le HTML du badge logo + nom (données internes = sûres)
     */
    badge(crypto) {
      return '<span class="tilex-crypto-badge" style="--c:' + crypto.couleur + '">' +
        '<img src="' + crypto.logo + '" alt="' + crypto.symbole + '" class="tilex-crypto-logo" ' +
        'onerror="this.style.display=\'none\'">' +
        '<span class="tilex-crypto-nom">' + crypto.symbole + '</span>' +
      '</span>';
    },

    /**
     * ✨ Scanne un texte et remplace les noms de crypto par des badges.
     * 🔒 Le texte est d'abord ÉCHAPPÉ → sûr à insérer via innerHTML même si non fiable.
     */
    injecter(texte) {
      return this._esc(texte).replace(/\b([a-zA-Zéè]+)\b/g, (match) => {
        const crypto = this.trouver(match);
        return crypto ? this.badge(crypto) : match;
      });
    }
  };

  // CSS du badge (injecté une seule fois).
  if (!document.getElementById("tilex-crypto-logos-css")) {
    const st = document.createElement("style");
    st.id = "tilex-crypto-logos-css";
    st.textContent =
      ".tilex-crypto-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px 2px 4px;margin:0 2px;" +
      "border-radius:20px;background:rgba(255,255,255,0.06);border:1px solid var(--c,#F7931A);vertical-align:middle;" +
      "font-weight:600;transition:transform .15s ease,box-shadow .15s ease;}" +
      ".tilex-crypto-badge:hover{transform:translateY(-1px);box-shadow:0 0 12px var(--c,#F7931A);}" +
      ".tilex-crypto-logo{width:18px;height:18px;border-radius:50%;}" +
      ".tilex-crypto-nom{color:var(--c,#F7931A);font-size:.85em;letter-spacing:.5px;}";
    (document.head || document.documentElement).appendChild(st);
  }

  // 🌍 Expose globalement pour ti-lex-AL
  window.TilexCryptoLogos = TilexCryptoLogos;
})();
