/* ============================================================
   PREVOST — adaptateur de compatibilité
   Le vrai moteur est partagé avec TI-LEX-AL et Marceau dans
   js/tilex-agent-core-max.js.
   ============================================================ */
(function (global) {
  'use strict';

  function expose() {
    const core = global.TilexAgentCoreMAX;
    if (!core) return false;

    const agent = core.getAgent('prevost');
    global.PREVOST = {
      CFG: core.CFG,
      SYSTEM: agent.system(),
      OUTILS: core.TOOLS,
      config: core.configure,
      brancher(hooks) {
        core.bindHooks({
          onStatus: hooks?.onStatus,
          onStep: hooks?.onEtape,
          onCode: hooks?.onCode,
          onQuestion: hooks?.onQuestion,
          onFinish: hooks?.onFini
            ? ({ answer }) => hooks.onFini(answer)
            : undefined,
          requestApproval: hooks?.requestApproval,
        });
      },
      lancer(tache, historique) {
        return agent.run(tache, historique);
      },
    };

    // Les trois agents partagent exactement les mêmes outils et fichiers.
    global.TILEX_AL = global.TILEX_AL || core.getAgent('ti-lex-al');
    global.MARCEAU_AGENT = global.MARCEAU_AGENT || core.getAgent('marceau');
    return true;
  }

  if (expose()) return;

  const script = document.createElement('script');
  script.src = 'js/tilex-agent-core-max.js';
  script.defer = true;
  script.onload = expose;
  script.onerror = function () {
    console.error('[TI-LEX] Impossible de charger tilex-agent-core-max.js');
  };
  document.head.appendChild(script);

  global.addEventListener?.('tilex-agent-core-ready', expose, { once: true });
})(typeof window !== 'undefined' ? window : globalThis);
