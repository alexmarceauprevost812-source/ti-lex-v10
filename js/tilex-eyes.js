// js/tilex-eyes.js
// ti-lex-AL v10 — Module "Les Yeux"
// Lit les déploiements + logs Vercel pour détecter les erreurs de build.
// Auteur : Alex Marceau-Prévost
// Stack : Vanilla JS + Supabase + Vercel
//
// 🔒 Le token Vercel NE VA JAMAIS ici en clair côté client. On passe par la
//    fonction serveur /api/vercel-logs (Vercel) qui garde le token secret ET
//    vérifie que l'appelant est l'administrateur ti-lex (session Supabase).

const TilexEyes = {
  endpoint: '/api/vercel-logs',

  // Récupère le token de session Supabase (pour prouver qu'on est l'admin).
  async _token() {
    try {
      if (typeof window.getToken === 'function') {
        const t = window.getToken();
        if (t) return t;
      }
      if (window.supabase && window.SB_URL) {
        const c = window.__eyesSb || (window.__eyesSb = window.supabase.createClient(window.SB_URL, window.SB_ANON));
        const { data } = await c.auth.getSession();
        return data && data.session ? data.session.access_token : null;
      }
    } catch (_) {}
    return null;
  },

  async _fetch(qs) {
    const t = await this._token();
    const headers = {};
    if (t) headers.Authorization = 'Bearer ' + t;
    return fetch(`${this.endpoint}?${qs}`, { headers });
  },

  // Récupère les X derniers déploiements du projet
  async voirDeploiements(limite = 5) {
    try {
      const res = await this._fetch(`action=deployments&limit=${limite}`);
      if (!res.ok) throw new Error(`Vercel API ${res.status}`);
      const data = await res.json();

      return (data.deployments || []).map(d => ({
        id: d.uid,
        url: d.url,
        etat: d.state || d.readyState,     // READY | ERROR | BUILDING | QUEUED
        cree: d.created ? new Date(d.created).toLocaleString('fr-CA') : '—',
        branche: d.meta?.githubCommitRef || '—',
        message: d.meta?.githubCommitMessage || '—'
      }));
    } catch (e) {
      console.error('[TilexEyes] voirDeploiements:', e);
      return { erreur: e.message };
    }
  },

  // Trouve le dernier deploy qui a PLANTÉ
  async dernierEchec() {
    const deploys = await this.voirDeploiements(10);
    if (deploys.erreur) return deploys;
    const rate = deploys.find(d => d.etat === 'ERROR');
    return rate || null;
  },

  // Lit les logs de build d'un déploiement précis (pour voir POURQUOI ça a planté)
  async lireLogs(deploymentId) {
    try {
      const res = await this._fetch(`action=logs&id=${encodeURIComponent(deploymentId)}`);
      if (!res.ok) throw new Error(`Vercel logs ${res.status}`);
      const data = await res.json();

      // On garde juste les lignes d'erreur/warning, le reste c'est du bruit
      return (data.logs || [])
        .filter(l => l.type === 'stderr' || /error|failed|cannot/i.test(l.text || ''))
        .map(l => (l.text || '').trim())
        .filter(Boolean);
    } catch (e) {
      console.error('[TilexEyes] lireLogs:', e);
      return { erreur: e.message };
    }
  },

  // Le check complet : est-ce que le dernier deploy est OK ? Sinon, pourquoi ?
  async diagnostic() {
    const deploys = await this.voirDeploiements(1);
    if (deploys.erreur) return `❌ Impossible de voir Vercel : ${deploys.erreur}`;
    if (!deploys.length) return '🤷 Aucun déploiement trouvé.';

    const dernier = deploys[0];

    if (dernier.etat === 'READY') {
      return `✅ Dernier deploy OK — ${dernier.message} (${dernier.cree})`;
    }
    if (dernier.etat === 'BUILDING' || dernier.etat === 'QUEUED') {
      return `⏳ Deploy en cours... (${dernier.etat})`;
    }
    if (dernier.etat === 'ERROR') {
      const logs = await this.lireLogs(dernier.id);
      const raison = Array.isArray(logs) ? logs.slice(0, 5).join('\n') : logs.erreur;
      return `🔴 DEPLOY PLANTÉ — ${dernier.message}\n\nRaison :\n${raison}`;
    }
    return `❔ État inconnu : ${dernier.etat}`;
  }
};

// Rend dispo globalement dans ti-lex-AL
window.TilexEyes = TilexEyes;
