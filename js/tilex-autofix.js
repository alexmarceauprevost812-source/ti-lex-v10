// ============================================================
// js/tilex-autofix.js — TilexAutoFix v1.0
// Ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// Détecte les erreurs JS en live + propose un fix automatique
// ============================================================

const TilexAutoFix = (() => {

  // ─── CONFIG ────────────────────────────────────────────────
  const CONFIG = {
    maxErreurs:    50,       // max erreurs gardées en mémoire
    delaiDebounce: 300,      // ms avant d'analyser après une erreur
    afficherToast: true,     // affiche un toast à chaque erreur
    sauvegarderLog: true,    // sauvegarde dans localStorage
    cleStorage:    'tilex_autofix_log'
  };

  // ─── ÉTAT INTERNE ──────────────────────────────────────────
  let erreurs    = [];
  let actif      = false;
  let dernierMsg = '';       // dedup : évite d'analyser 2x la même erreur d'affilée

  // Bruit connu (extensions, ResizeObserver, réseau tiers) : on log en
  // mémoire mais SANS toast, pour ne pas réintroduire le spam de bannières.
  const BRUIT = [
    /ResizeObserver loop/i,
    /Script error\.?$/i,
    /Non-Error promise rejection captured/i,
    /Load failed$/i,
    /extension context/i,
    /chrome-extension:|moz-extension:/i
  ];

  function estBruit(msg) {
    return BRUIT.some((r) => r.test(msg || ''));
  }

  // ─── UTILITAIRE : échappement HTML (anti-injection) ────────
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── BASE DE FIXES CONNUS ──────────────────────────────────
  const FIXES_CONNUS = [
    {
      pattern: /Cannot read propert(?:y|ies) ['"](.*?)['"] of (null|undefined)/i,
      titre:   'Valeur nulle ou indéfinie',
      fix: (msg) => {
        const prop = (msg.match(/['"](.*?)['"]/) || [])[1] || 'prop';
        return [
          `Vérifie que l'objet existe avant d'accéder à \`.${prop}\``,
          `✅ Utilise l'optional chaining : \`obj?.${prop}\``,
          `✅ Ou une garde : \`if (obj && obj.${prop}) { ... }\``
        ];
      }
    },
    {
      pattern: /(\w+) is not defined/i,
      titre:   'Variable non déclarée',
      fix: (msg) => {
        const varName = (msg.match(/(\w+) is not defined/i) || [])[1] || 'variable';
        return [
          `La variable \`${varName}\` n'est pas déclarée dans ce scope.`,
          `✅ Déclare-la avec \`const ${varName} = ...\` ou \`let ${varName}\``,
          `✅ Vérifie l'ordre de chargement de tes fichiers JS`
        ];
      }
    },
    {
      pattern: /(\w+) is not a function/i,
      titre:   'Appel sur quelque chose qui n\'est pas une fonction',
      fix: (msg) => {
        const fn = (msg.match(/(\w+) is not a function/i) || [])[1] || 'fn';
        return [
          `\`${fn}\` n'est pas une fonction — peut-être undefined ou un objet?`,
          `✅ Vérifie : \`typeof ${fn} === 'function'\` avant l'appel`,
          `✅ Assure-toi que le module qui définit \`${fn}\` est bien chargé`
        ];
      }
    },
    {
      pattern: /Unexpected token/i,
      titre:   'Erreur de syntaxe JS',
      fix: () => [
        `Erreur de syntaxe dans ton code JavaScript.`,
        `✅ Cherche une accolade \`{\`, parenthèse \`(\` ou virgule manquante`,
        `✅ Vérifie les template literals : les backticks sont bien fermés?`,
        `✅ Une virgule en trop dans un objet ou tableau?`
      ]
    },
    {
      pattern: /Failed to fetch|NetworkError|net::ERR/i,
      titre:   'Erreur réseau / fetch échoué',
      fix: () => [
        `Une requête réseau a échoué.`,
        `✅ Vérifie ta connexion internet`,
        `✅ L'URL de l'API est-elle correcte? (Supabase URL, Anthropic endpoint)`,
        `✅ CORS bloqué? Ajoute les headers nécessaires côté serveur`,
        `✅ La clé API est-elle valide et non expirée?`
      ]
    },
    {
      pattern: /401|403|Unauthorized|Forbidden/i,
      titre:   'Erreur d\'authentification',
      fix: () => [
        `Accès refusé — problème d'authentification.`,
        `✅ Vérifie ta clé API Supabase (anon key)`,
        `✅ La session utilisateur est-elle active? (token expiré?)`,
        `✅ Les politiques RLS de Supabase bloquent peut-être la requête`
      ]
    },
    {
      pattern: /Maximum call stack size exceeded/i,
      titre:   'Récursion infinie',
      fix: () => [
        `Stack overflow — une fonction s'appelle elle-même à l'infini.`,
        `✅ Cherche une fonction récursive sans condition d'arrêt`,
        `✅ Un event listener qui se déclenche lui-même?`,
        `✅ Vérifie les \`setState\` dans les composants (boucle de rendu)`
      ]
    },
    {
      pattern: /Promise|async|await|Unhandled/i,
      titre:   'Promesse non gérée',
      fix: () => [
        `Une Promise a été rejetée sans être catchée.`,
        `✅ Ajoute \`.catch(err => console.error(err))\` à tes Promises`,
        `✅ Entoure ton \`await\` d'un \`try { } catch(e) { }\``,
        `✅ Vérifie que les fonctions async retournent bien une valeur`
      ]
    },
    {
      pattern: /CORS/i,
      titre:   'Erreur CORS',
      fix: () => [
        `Le navigateur bloque la requête cross-origin.`,
        `✅ L'API doit retourner : \`Access-Control-Allow-Origin: *\``,
        `✅ Utilise un proxy Vercel (/api/) pour cacher les appels externes`,
        `✅ Dans Supabase : vérifie les allowed origins dans les settings`
      ]
    },
    {
      pattern: /.*/,  // fallback générique
      titre:   'Erreur inconnue',
      fix: (msg) => [
        `Erreur non reconnue dans la base de fixes.`,
        `✅ Copie le message exact dans ti-lex-AL pour une analyse complète`,
        `Message : \`${(msg || '').slice(0, 120)}\``
      ]
    }
  ];

  // ─── ANALYSE D'UNE ERREUR ──────────────────────────────────
  function analyserErreur(msg, source, ligne) {
    msg = msg || 'Erreur inconnue';

    // Dedup immédiat : même message deux fois d'affilée = on ignore.
    if (msg === dernierMsg) return null;
    dernierMsg = msg;

    const fixMatch = FIXES_CONNUS.find(f => f.pattern.test(msg));
    const fixes    = fixMatch ? fixMatch.fix(msg) : ['Erreur inconnue'];
    const titre    = fixMatch ? fixMatch.titre : 'Erreur JS';

    const entree = {
      id:        Date.now(),
      timestamp: new Date().toLocaleString('fr-CA'),
      message:   msg,
      source:    source || 'inconnu',
      ligne:     ligne  || '?',
      titre,
      fixes
    };

    erreurs.unshift(entree);
    if (erreurs.length > CONFIG.maxErreurs) erreurs.pop();

    if (CONFIG.sauvegarderLog) {
      try {
        localStorage.setItem(CONFIG.cleStorage, JSON.stringify(erreurs.slice(0, 20)));
      } catch (e) {}
    }

    // Toast seulement pour les vraies erreurs (jamais le bruit connu).
    if (CONFIG.afficherToast && !estBruit(msg)) {
      afficherToastErreur(entree);
    }

    // Event custom pour les autres modules.
    window.dispatchEvent(new CustomEvent('tilex:erreur', { detail: entree }));

    return entree;
  }

  // ─── TOAST ERREUR ──────────────────────────────────────────
  function afficherToastErreur(entree) {
    const ancien = document.getElementById('tilex-autofix-toast');
    if (ancien) ancien.remove();

    const toast = document.createElement('div');
    toast.id    = 'tilex-autofix-toast';
    toast.innerHTML = `
      <div style="
        position:fixed; bottom:80px; right:16px; z-index:99999;
        background:#1c2128; border:1px solid #ff3c3c;
        border-radius:12px; padding:14px 18px; max-width:340px;
        box-shadow:0 8px 32px rgba(0,0,0,0.5);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        animation: tilexSlideIn 0.3s ease;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="color:#ff3c3c;font-weight:700;font-size:13px">🔧 ${escapeHtml(entree.titre)}</span>
          <button onclick="document.getElementById('tilex-autofix-toast').remove()"
            style="background:none;border:none;color:#8b949e;cursor:pointer;font-size:16px;padding:0 4px">✕</button>
        </div>
        <div style="color:#8b949e;font-size:11px;margin-bottom:10px;word-break:break-all">
          ${escapeHtml(entree.message.slice(0, 100))}${entree.message.length > 100 ? '…' : ''}
        </div>
        <div style="font-size:12px;color:#e6edf3;line-height:1.6">
          ${entree.fixes.map(f => `<div>• ${escapeHtml(f)}</div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="TilexAutoFix.voirLog()"
            style="flex:1;background:#21262d;border:1px solid #30363d;color:#e6edf3;
                   border-radius:6px;padding:6px;font-size:11px;cursor:pointer">
            📋 Voir log
          </button>
          <button onclick="TilexAutoFix.copierDerniereErreur()"
            style="flex:1;background:#ff3c3c;border:none;color:#fff;
                   border-radius:6px;padding:6px;font-size:11px;cursor:pointer;font-weight:600">
            📋 Copier fix
          </button>
        </div>
      </div>
    `;

    if (!document.getElementById('tilex-autofix-style')) {
      const style = document.createElement('style');
      style.id    = 'tilex-autofix-style';
      style.textContent = `
        @keyframes tilexSlideIn {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0);    }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => { const t = document.getElementById('tilex-autofix-toast'); if (t) t.remove(); }, 12000);
  }

  // ─── PANEL LOG ─────────────────────────────────────────────
  function voirLog() {
    const ancien = document.getElementById('tilex-autofix-panel');
    if (ancien) { ancien.remove(); return; }

    const panel = document.createElement('div');
    panel.id    = 'tilex-autofix-panel';

    const lignes = erreurs.length === 0
      ? `<div style="color:#8b949e;padding:20px;text-align:center">✅ Aucune erreur détectée</div>`
      : erreurs.map((e, i) => `
          <div style="padding:12px;border-bottom:1px solid #21262d;${i === 0 ? 'background:#1c2128' : ''}">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="color:#ff3c3c;font-weight:700;font-size:12px">${escapeHtml(e.titre)}</span>
              <span style="color:#8b949e;font-size:10px">${escapeHtml(e.timestamp)}</span>
            </div>
            <div style="color:#e6edf3;font-size:11px;margin-bottom:6px;word-break:break-all">
              ${escapeHtml(e.message.slice(0, 150))}
            </div>
            <div style="color:#58a6ff;font-size:11px;line-height:1.6">
              ${e.fixes.map(f => `<div>→ ${escapeHtml(f)}</div>`).join('')}
            </div>
          </div>
        `).join('');

    panel.innerHTML = `
      <div style="
        position:fixed; top:0; right:0; width:380px; max-width:90vw; height:100vh;
        background:#0d1117; border-left:1px solid #21262d;
        z-index:99998; display:flex; flex-direction:column;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        box-shadow:-8px 0 32px rgba(0,0,0,0.5);
      ">
        <div style="padding:16px 20px;border-bottom:1px solid #21262d;display:flex;justify-content:space-between;align-items:center">
          <span style="color:#e6edf3;font-weight:700;font-size:15px">🔧 AutoFix Log</span>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="background:#ff3c3c;color:#fff;border-radius:12px;padding:2px 8px;font-size:11px">
              ${erreurs.length} erreur${erreurs.length !== 1 ? 's' : ''}
            </span>
            <button onclick="TilexAutoFix.viderLog()"
              style="background:#21262d;border:1px solid #30363d;color:#8b949e;
                     border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer">
              🗑️ Vider
            </button>
            <button onclick="document.getElementById('tilex-autofix-panel').remove()"
              style="background:none;border:none;color:#8b949e;cursor:pointer;font-size:18px">✕</button>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto">${lignes}</div>
        <div style="padding:12px 16px;border-top:1px solid #21262d">
          <button onclick="TilexAutoFix.copierToutLog()"
            style="width:100%;background:#21262d;border:1px solid #30363d;color:#e6edf3;
                   border-radius:6px;padding:10px;font-size:12px;cursor:pointer;font-weight:600">
            📋 Copier tout le log
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
  }

  // ─── COPIE PRESSE-PAPIER ───────────────────────────────────
  function texteEntree(e) {
    return `🔧 ${e.titre}\n[${e.timestamp}] ${e.source}:${e.ligne}\n${e.message}\n` +
           e.fixes.map(f => `  → ${f}`).join('\n');
  }

  async function copier(texte, okMsg) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(texte);
      } else {
        const ta = document.createElement('textarea');
        ta.value = texte;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      if (window.TilexToast && typeof window.TilexToast.show === 'function') {
        window.TilexToast.show(okMsg || '📋 Copié!', 'success');
      }
      return true;
    } catch (e) {
      console.warn('[TilexAutoFix] copie échouée:', e);
      return false;
    }
  }

  function copierDerniereErreur() {
    if (!erreurs.length) return;
    copier(texteEntree(erreurs[0]), '📋 Fix copié!');
  }

  function copierToutLog() {
    if (!erreurs.length) return;
    copier(erreurs.map(texteEntree).join('\n\n──────────\n\n'), '📋 Log complet copié!');
  }

  // ─── VIDER LE LOG ──────────────────────────────────────────
  function viderLog() {
    erreurs = [];
    dernierMsg = '';
    try { localStorage.removeItem(CONFIG.cleStorage); } catch (e) {}
    const panel = document.getElementById('tilex-autofix-panel');
    if (panel) { panel.remove(); voirLog(); }
  }

  // ─── CAPTURE DES ERREURS ───────────────────────────────────
  function activer() {
    if (actif) return;
    actif = true;

    // Restaure le log précédent depuis localStorage.
    try {
      const brut = localStorage.getItem(CONFIG.cleStorage);
      if (brut) erreurs = JSON.parse(brut) || [];
    } catch (e) {}

    window.addEventListener('error', (ev) => {
      const msg = ev.message || (ev.error && ev.error.message) || String(ev.error || 'Erreur');
      const src = ev.filename ? ev.filename.split('/').pop() : 'inconnu';
      analyserErreur(msg, src, ev.lineno);
    });

    window.addEventListener('unhandledrejection', (ev) => {
      const r = ev.reason;
      const msg = (r && r.message) ? r.message : String(r || 'Promesse rejetée');
      analyserErreur(msg, 'promise', '?');
    });
  }

  function desactiver() { actif = false; CONFIG.afficherToast = false; }

  // ─── API PUBLIQUE ──────────────────────────────────────────
  return {
    CONFIG,
    activer,
    desactiver,
    analyser: analyserErreur,
    voirLog,
    viderLog,
    copierDerniereErreur,
    copierToutLog,
    getErreurs: () => erreurs.slice(),
    silence: () => { CONFIG.afficherToast = false; },   // coupe les toasts, garde le log
    parler:  () => { CONFIG.afficherToast = true;  }
  };

})();

// Démarrage auto.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => TilexAutoFix.activer());
} else {
  TilexAutoFix.activer();
}

window.TilexAutoFix = TilexAutoFix;
