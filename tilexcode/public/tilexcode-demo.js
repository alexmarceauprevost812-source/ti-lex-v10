/* ============================================================================
   public/tilexcode-demo.js
   Câblage de la page démo + initialisation de Supabase Auth.
   Externalisé (pas d'inline) pour respecter une CSP stricte.
   ============================================================================ */
(function () {
  'use strict';

  // --- 1. Init du client Supabase (requis pour authentifier les agents) -----
  // Remplace la clé publiable ci-dessous (même que dans tilexcode-agents.js).
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      window.supabaseClient = window.supabase.createClient(
        'https://rnuripmfozlxenryxhdc.supabase.co',
        'REMPLACE_PAR_TA_CLE_PUBLIABLE'
      );
    } else {
      console.warn('supabase-js non chargé : les appels d\'agents seront en 401.');
    }
  } catch (e) {
    console.error('Init Supabase:', e);
  }

  // --- 2. Câblage de l'interface --------------------------------------------
  function demarrer() {
    try {
      if (!window.TilexCodeAgents) {
        console.error('TilexCodeAgents non chargé.');
        return;
      }
      window.TilexCodeAgents.init('zone-agents');

      var btn = document.getElementById('btn-pipeline');
      if (btn) {
        btn.addEventListener('click', function () {
          try {
            var champ = document.getElementById('tilex-prompt');
            var prompt = champ ? champ.value : '';
            window.TilexCodeAgents.runPipeline(prompt, function (res) {
              window.TilexCodeAgents.afficherSortie(res);
            }).catch(function () { /* géré par toast */ });
          } catch (e) {
            console.error('Clic pipeline:', e);
          }
        });
      }
    } catch (e) {
      console.error('Démarrage démo:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})();
