// js/tilex-finance.js
// ti-lex-AL v10 — Module données boursières via FMP API
// Auteur: Alex Marceau-Prévost
//
// Exposé en global window.TilexFinance (convention ti-lex : scripts classiques).
//   <script src="js/tilex-finance.js"></script>
//   const p = await window.TilexFinance.getProfile('AAPL');
(function () {
  'use strict';

  const TilexFinance = {
    // ⚠️ IMPORTANT: La clé API reste dans le proxy serveur (/api/fmp-proxy), JAMAIS ici.
    baseURL: 'https://financialmodelingprep.com/stable',

    // Récupère le profil complet d'une entreprise
    async getProfile(symbol) {
      try {
        const data = await this._call('profile', { symbol });
        return this._formatProfile(data[0]);
      } catch (err) {
        console.error('[TilexFinance] Erreur profil:', err);
        return { erreur: `Impossible de charger ${symbol}` };
      }
    },

    // Récupère la cotation en temps réel
    async getQuote(symbol) {
      try {
        const data = await this._call('quote', { symbol });
        const q = data[0];
        return {
          symbole: q.symbol,
          nom: q.name,
          prix: q.price,
          variation: q.change,
          variationPct: q.changePercentage,
          volume: q.volume
        };
      } catch (err) {
        console.error('[TilexFinance] Erreur quote:', err);
        return { erreur: `Cotation indisponible pour ${symbol}` };
      }
    },

    // Appel sécurisé via ta Supabase/Vercel Edge Function (clé cachée côté serveur)
    async _call(endpoint, params) {
      const query = new URLSearchParams(params).toString();
      // 🔒 On passe par TON proxy /api/fmp-proxy, pas direct à FMP
      const res = await fetch(`/api/fmp-proxy?endpoint=${endpoint}&${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },

    // Formate joliment pour l'affichage québécois
    _formatProfile(p) {
      return {
        nom: p.companyName,
        symbole: p.symbol,
        prix: `${p.price} ${p.currency}`,
        secteur: p.sector,
        industrie: p.industry,
        pdg: p.ceo,
        employes: p.fullTimeEmployees,
        description: p.description,
        site: p.website
      };
    }
  };

  // --- Expose en global (convention ti-lex) ---
  window.TilexFinance = TilexFinance;
})();
