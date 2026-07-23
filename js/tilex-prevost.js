/* ============================================================
   PREVOST — Agent autonome ti-lex
   Vanilla JS, aucun framework. Se branche dans l'interface v10.
   Adaptations ti-lex (2) :
   • CFG s'auto-remplit depuis window.SB_ANON / window.AI_PROXY
   • appelerModele parle à ai-proxy (SSE) ET à un proxy JSON classique
   ============================================================ */

const PREVOST = (() => {

  // ---------- CONFIG ----------
  const CFG = {
    SUPABASE_URL: (typeof window !== 'undefined' && window.SB_URL) || 'https://rnuripmfozlxenryxhdc.supabase.co',
    SUPABASE_KEY: (typeof window !== 'undefined' && window.SB_ANON) || '',   // clé publishable (frontend-safe)
    API_URL: (typeof window !== 'undefined' && window.AI_PROXY) || '/api/claude', // proxy vers l'API Anthropic
    MODEL: 'claude-sonnet-5',
    MAX_ETAPES: 12,                // garde-fou anti-boucle infinie
    DEBUG: true
  };

  function config(opts) { Object.assign(CFG, opts); }

  // ---------- SYSTEM PROMPT ----------
  const SYSTEM = `T'es Prevost, l'agent autonome de ti-lex — une plateforme IA québécoise (Produit du Québec).

Tu parles en français québécois, direct, pas de flafla. Tu dis la vérité même quand ça fait pas l'affaire.

TON MODE DE TRAVAIL (autonome) :
1. Tu décomposes la job en étapes.
2. Tu appelles UN outil à la fois et tu attends le résultat.
3. Tu t'ajustes selon ce que tu observes.
4. Quand la job est finie, tu réponds avec {"fini": true, "reponse": "..."}.

RÈGLES DURES — tu les brises jamais :
- JAMAIS de PATCH/UPDATE sur tilex_conversations (y'a pas de policy RLS UPDATE, ça va planter).
- Un projet doit exister dans tilex_projects AVANT d'insérer dans tilex_files (FK NOT NULL).
- Avant de toucher au schéma, tu inspectes information_schema.columns (table_schema='public').
- Les tables crypto (crypto_assets, watchlists, alerts, signals) sont du legacy. Tu y touches pas.
- T'inventes jamais un résultat d'outil. Si t'as pas l'info, tu la demandes ou tu la vas chercher.

FORMAT DE RÉPONSE — que du JSON, pas de backticks, pas de préambule :
{"pensee": "ce que je fais et pourquoi", "outil": "nom_outil", "params": {...}}
ou
{"fini": true, "reponse": "le résultat final pour Alex"}`;

  // ---------- OUTILS ----------
  const OUTILS = {

    async supabase_select({ table, filtre = '', colonnes = '*', limite = 50 }) {
      const url = `${CFG.SUPABASE_URL}/rest/v1/${table}?select=${colonnes}&limit=${limite}${filtre ? '&' + filtre : ''}`;
      return await rest(url, { method: 'GET' });
    },

    async supabase_insert({ table, rows }) {
      if (table === 'tilex_files') {
        const p = await OUTILS.supabase_select({ table: 'tilex_projects', limite: 1 });
        if (!Array.isArray(p) || !p.length) {
          return { erreur: 'Aucun projet dans tilex_projects — crée le projet avant le fichier (FK NOT NULL).' };
        }
      }
      return await rest(`${CFG.SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(Array.isArray(rows) ? rows : [rows])
      });
    },

    async supabase_update({ table, filtre, patch }) {
      if (table === 'tilex_conversations') {
        return { erreur: 'Bloqué : tilex_conversations a pas de policy RLS UPDATE. Fais un DELETE + INSERT.' };
      }
      if (!filtre) return { erreur: 'Filtre obligatoire — je fais pas de UPDATE sur toute la table.' };
      return await rest(`${CFG.SUPABASE_URL}/rest/v1/${table}?${filtre}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(patch)
      });
    },

    async supabase_delete({ table, filtre }) {
      if (!filtre) return { erreur: 'Filtre obligatoire — je vide pas une table au complet.' };
      return await rest(`${CFG.SUPABASE_URL}/rest/v1/${table}?${filtre}`, { method: 'DELETE' });
    },

    async inspecter_schema({ table }) {
      return await OUTILS.supabase_select({
        table: 'information_schema.columns',
        colonnes: 'column_name,data_type,is_nullable',
        filtre: `table_schema=eq.public&table_name=eq.${table}`,
        limite: 200
      });
    },

    async ecrire_code({ nom_fichier, contenu, langage = 'html' }) {
      hooks.onCode?.({ nom_fichier, contenu, langage });
      return { ok: true, message: `${nom_fichier} envoyé au panneau codex (${contenu.length} caractères).` };
    },

    async demander_a_alex({ question }) {
      hooks.onQuestion?.(question);
      return { en_attente: true, message: 'Question posée à Alex — attends sa réponse avant de continuer.' };
    }
  };

  function tokenSession() {
    try {
      const raw = localStorage.getItem('sb-rnuripmfozlxenryxhdc-auth-token');
      if (!raw) return null;
      const j = JSON.parse(raw);
      return (j && (j.access_token || (j.currentSession && j.currentSession.access_token))) || null;
    } catch (e) { return null; }
  }

  async function rest(url, opts = {}) {
    try {
      const tk = tokenSession();
      const r = await fetch(url, {
        ...opts,
        headers: {
          'apikey': CFG.SUPABASE_KEY,
          'Authorization': `Bearer ${tk || CFG.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          ...(opts.headers || {})
        }
      });
      const txt = await r.text();
      if (!r.ok) return { erreur: `HTTP ${r.status}`, detail: txt.slice(0, 400) };
      return txt ? JSON.parse(txt) : { ok: true };
    } catch (e) {
      return { erreur: e.message };
    }
  }

  // ---------- HOOKS UI (branche-les dans v10) ----------
  const hooks = {
    onPensee: null,   // (texte) => affiche le raisonnement
    onEtape: null,    // ({n, outil, params, resultat}) => log de l'étape
    onCode: null,     // ({nom_fichier, contenu}) => route vers le panneau codex
    onQuestion: null, // (question) => affiche la question dans le chat
    onFini: null      // (reponse) => réponse finale
  };

  function brancher(h) { Object.assign(hooks, h); }

  // ---------- BOUCLE AUTONOME ----------
  async function lancer(tache, historique = []) {
    const messages = [...historique, { role: 'user', content: tache }];

    for (let n = 1; n <= CFG.MAX_ETAPES; n++) {
      const brut = await appelerModele(messages);
      let plan;
      try {
        plan = JSON.parse(brut.replace(/```json|```/g, '').trim());
      } catch {
        hooks.onFini?.(brut);
        return { fini: true, reponse: brut, etapes: n };
      }

      if (plan.pensee) hooks.onPensee?.(plan.pensee);

      if (plan.fini) {
        hooks.onFini?.(plan.reponse);
        return { fini: true, reponse: plan.reponse, etapes: n };
      }

      const outil = OUTILS[plan.outil];
      const resultat = outil
        ? await outil(plan.params || {})
        : { erreur: `Outil inconnu : ${plan.outil}. Dispo : ${Object.keys(OUTILS).join(', ')}` };

      if (CFG.DEBUG) console.log(`[prevost ${n}]`, plan.outil, resultat);
      hooks.onEtape?.({ n, outil: plan.outil, params: plan.params, resultat });

      messages.push({ role: 'assistant', content: JSON.stringify(plan) });
      messages.push({ role: 'user', content: `Résultat de ${plan.outil} :\n${JSON.stringify(resultat).slice(0, 4000)}` });

      if (resultat.en_attente) return { fini: false, en_attente: true, messages, etapes: n };
    }

    const msg = `J'ai atteint la limite de ${CFG.MAX_ETAPES} étapes sans finir. Dis-moi si je continue.`;
    hooks.onFini?.(msg);
    return { fini: false, reponse: msg, etapes: CFG.MAX_ETAPES };
  }

  // Parle au proxy ti-lex (ai-proxy = SSE) OU à un proxy JSON Anthropic classique.
  async function appelerModele(messages) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const tk = tokenSession();
      if (tk) headers['Authorization'] = 'Bearer ' + tk;
      const r = await fetch(CFG.API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind: 'chat',
          model: CFG.MODEL,
          max_tokens: 2000,
          system: SYSTEM,
          messages
        })
      });
      const ct = (r.headers.get('content-type') || '');

      // ai-proxy → flux SSE : on accumule les text_delta.
      if (ct.includes('text/event-stream') && r.body) {
        const rd = r.body.getReader(), dc = new TextDecoder();
        let bf = '', out = '';
        while (true) {
          const ch = await rd.read();
          if (ch.done) break;
          bf += dc.decode(ch.value, { stream: true });
          const ls = bf.split('\n'); bf = ls.pop() || '';
          for (const l of ls) {
            const t = l.trim();
            if (!t.startsWith('data:')) continue;
            const p = t.slice(5).trim();
            if (!p || p === '[DONE]') continue;
            let ev; try { ev = JSON.parse(p); } catch (e) { continue; }
            if (ev.type === 'content_block_delta' && ev.delta && ev.delta.text) out += ev.delta.text;
          }
        }
        return out;
      }

      // Proxy JSON classique (réponse Anthropic non-streamée).
      const data = await r.json();
      if (data.error) return JSON.stringify({ fini: true, reponse: `Erreur du proxy : ${data.error}` });
      return (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
    } catch (e) {
      return JSON.stringify({ fini: true, reponse: `Erreur d'appel au modèle : ${e.message}` });
    }
  }

  return { config, brancher, lancer, OUTILS, SYSTEM, CFG };
})();

if (typeof window !== 'undefined') window.PREVOST = PREVOST;
