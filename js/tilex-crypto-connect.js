// ============================================
// 📁 js/tilex-crypto-connect.js
// BRANCHEMENT CRYPTO LOGOS — ti-lex-AL v10
// Applique les badges (logo + prix CAD) aux messages de l'IA déjà rendus.
// ⚠️ À charger APRÈS js/tilex-crypto-logos.js (le moteur).
// Sûr : utilise rehausser() (texte seulement, saute code/liens, anti-XSS).
// Idempotent : chaque bulle n'est traitée qu'une fois (data-crypto-done).
// ============================================
(function () {
  "use strict";

  // Sélecteurs des bulles de message de l'agent, terminées (plus en streaming).
  const SEL_BULLE = ".cmsg-bbl.a:not(.stream-active):not([data-crypto-done])";
  const SEL_CHAT = "#chat-msgs, #chat-messages, .chat-msgs, .messages, #messages, main";

  function scan() {
    if (!window.TilexCryptoLogos || typeof window.TilexCryptoLogos.rehausser !== "function") return;
    document.querySelectorAll(SEL_BULLE).forEach(function (bulle) {
      bulle.setAttribute("data-crypto-done", "1"); // marque avant (évite double passage)
      window.TilexCryptoLogos.rehausser(bulle);
    });
  }

  let pending = null;
  function planifier() {
    if (pending) return;
    // Pas de scan pendant qu'une bulle est en cours d'écriture (évite le reflow concurrent → saccade).
    if (document.querySelector(".cmsg-bbl.stream-active, .cmsg-bbl.ecriture-active")) return;
    pending = setTimeout(function () { pending = null; scan(); }, 150); // debounce (pas une anim)
  }

  function init() {
    const chat = document.querySelector(SEL_CHAT);
    if (!chat) { setTimeout(init, 500); return; } // attend que le chat existe
    new MutationObserver(planifier).observe(chat, { childList: true, subtree: true });
    scan(); // traite aussi les messages déjà présents (historique)
    console.log("🔌 TilexCrypto branché sur le chat");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
