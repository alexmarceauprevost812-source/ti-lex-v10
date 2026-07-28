/* ============================================================
   MIDAS — Définition d'agent pour le Centre INDAR
   ti-lex-AL v10 · Produit du Québec ⚜️
   ------------------------------------------------------------
   Carte d'agent à ajouter à ta liste INDAR existante (les 6 :
   NEXUS-AL, MARCEAU, CIPHER, SENTINEL, ORACLE, PHANTOM-RED).
   MIDAS devient le 7e — le Stratège Financier, aura dorée.

   Couleurs ti-lex : --orange #ff7f27 · --or #ffcf4a · --vert #37e0a0
   --rouge #ff4d4d · JetBrains Mono (--font-tilex).
   ============================================================ */

(function () {
  "use strict";

  // Glyphe SVG : losange doré (la « touche de Midas ») avec un graphique montant.
  const GLYPHE_MIDAS =
    '<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">' +
      '<polygon points="24,3 45,24 24,45 3,24" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<polyline points="13,30 20,24 26,28 35,16" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="35" cy="16" r="2.4" fill="currentColor"/>' +
    '</svg>';

  const MIDAS = {
    code: "MIDAS",
    nom: "MIDAS",
    titre: "Le Stratège Financier",
    role: "Recherche financière, analyse crypto/actions et signaux de marché.",
    pouvoir: "Transforme les données de marché en signaux structurés (confluence d'indicateurs) " +
      "et détecte les chutes rapides — information, jamais garantie.",
    aura: "#ffcf4a",            // or ti-lex
    auraSecondaire: "#f59e0b",  // ambre profond
    forme: "losange",
    glyphe: GLYPHE_MIDAS,

    // Prompt système (miroir de celui de l'Edge Function, pour cohérence d'affichage)
    systeme:
      "Tu es MIDAS, le stratège financier de ti-lex-AL. Tu fournis de l'INFORMATION " +
      "et de l'éducation financière, jamais un conseil personnalisé. Tu ne garantis aucun " +
      "rendement, tu n'inventes aucun chiffre, et tu fais passer la gestion du risque avant le " +
      "signal. Tu analyses par confluence (tendance, momentum, volatilité, volume) et tu nuances " +
      "toujours. Tu rappelles : information éducative, pas un conseil — consultez un conseiller " +
      "inscrit à l'AMF. Les données crypto de la plateforme sont en DOLLARS CANADIENS (CAD) : tu " +
      "précises la devise quand tu cites un prix et tu ne convertis pas en USD sans qu'on le demande.",

    endpoint: "https://rnuripmfozlxenryxhdc.supabase.co/functions/v1/midas-agent"
  };

  // Expose pour l'enregistrer dans le dispatcher INDAR.
  // Ex. d'usage dans ton app.js :
  //   if (window.INDAR_AGENTS) window.INDAR_AGENTS.push(window.MIDAS_AGENT);
  window.MIDAS_AGENT = MIDAS;
  console.log("[MIDAS] Agent INDAR défini (aura dorée).");
})();
