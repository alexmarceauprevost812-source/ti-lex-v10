/* ============================================================
   TI-LEX AGENT CORE MAX
   Un seul noyau pour TI-LEX-AL, Marceau et Prevost.
   Même mémoire, mêmes fichiers, mêmes outils, mêmes garde-fous.
   ============================================================ */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const AGENT_IDS = ['ti-lex-al', 'marceau', 'prevost'];
  const WRITE_TOOLS = new Set(['supabase_insert', 'supabase_update', 'supabase_delete']);
  const DANGEROUS_TABLES = new Set(['app_secrets', 'auth.users', 'vault.secrets']);
  const LEGACY_TABLES = new Set(['crypto_assets', 'watchlists', 'alerts', 'signals']);

  const CFG = {
    API_URL: global.AI_PROXY || '/api/claude',
    SUPABASE_URL: global.SB_URL || 'https://rnuripmfozlxenryxhdc.supabase.co',
    SUPABASE_KEY: global.SB_ANON || '',
    MODEL: 'claude-sonnet-5',
    MAX_STEPS: 20,
    MAX_TOOL_RESULT_CHARS: 12000,
    MEMORY_KEY: 'tilex-agents-max-memory-v1',
    DEBUG: false,
  };

  const PERSONAS = {
    'ti-lex-al': {
      name: 'TI-LEX-AL',
      style: 'professionnel, précis, direct et orienté résultat',
      avatar: 'assets/agents/ti-lex-al.png',
    },
    marceau: {
      name: 'Marceau',
      style: 'français québécois naturel, créatif, concret et chaleureux',
      avatar: 'assets/agents/marceau-logo.png',
    },
    prevost: {
      name: 'Prevost',
      style: 'français québécois direct, technique, méthodique et sans flafla',
      avatar: 'assets/agents/prevost.png',
    },
  };

  const sharedHooks = {
    onStatus: null,
    onStep: null,
    onCode: null,
    onQuestion: null,
    onFinish: null,
    requestApproval: null,
  };

  function configure(opts) {
    Object.assign(CFG, opts || {});
    return { ...CFG };
  }

  function bindHooks(hooks) {
    Object.assign(sharedHooks, hooks || {});
  }

  function sessionToken() {
    try {
      const direct = global.supabaseClient?.auth?.getSession;
      if (direct) {
        // La lecture synchrone du stockage reste le repli le plus fiable ici.
      }
      const keys = Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k));
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const token = parsed?.access_token || parsed?.currentSession?.access_token;
        if (token) return token;
      }
    } catch (_) {}
    return '';
  }

  function loadMemory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CFG.MEMORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(-200) : [];
    } catch (_) {
      return [];
    }
  }

  function saveMemory(entry) {
    const memory = loadMemory();
    memory.push({ id: cryptoRandomId(), at: new Date().toISOString(), ...entry });
    localStorage.setItem(CFG.MEMORY_KEY, JSON.stringify(memory.slice(-200)));
  }

  function cryptoRandomId() {
    try { return crypto.randomUUID(); } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
  }

  function sanitizePath(path) {
    const value = String(path || '').trim().replace(/^\/+/, '');
    if (!value || value.includes('..') || /[\0\r\n]/.test(value)) throw new Error('Chemin de fichier invalide.');
    return value;
  }

  function safeTable(table) {
    const value = String(table || '').trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(value)) throw new Error('Nom de table invalide.');
    if (DANGEROUS_TABLES.has(value)) throw new Error('Table secrète ou système bloquée.');
    if (LEGACY_TABLES.has(value)) throw new Error('Table legacy bloquée.');
    return value;
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : { ok: true }; }
    catch (_) { data = { text }; }
    if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    return data;
  }

  async function githubListFiles({ repo = '', branch = '' } = {}) {
    const params = new URLSearchParams({ mode: 'tree' });
    if (repo) params.set('repo', repo);
    if (branch) params.set('branch', branch);
    return fetchJson(`/api/github-read?${params.toString()}`);
  }

  async function githubReadFile({ path, repo = '', branch = '' }) {
    const params = new URLSearchParams({ file: sanitizePath(path) });
    if (repo) params.set('repo', repo);
    if (branch) params.set('branch', branch);
    return fetchJson(`/api/github-read?${params.toString()}`);
  }

  async function supabaseRest(table, query, options = {}) {
    const token = sessionToken();
    const url = `${CFG.SUPABASE_URL}/rest/v1/${safeTable(table)}${query ? `?${query}` : ''}`;
    return fetchJson(url, {
      ...options,
      headers: {
        apikey: CFG.SUPABASE_KEY,
        Authorization: `Bearer ${token || CFG.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  }

  const TOOLS = {
    async github_list_files(args) {
      return githubListFiles(args);
    },

    async github_read_file(args) {
      return githubReadFile(args);
    },

    async supabase_select({ table, filtre = '', colonnes = '*', limite = 100 }) {
      const q = new URLSearchParams({ select: colonnes, limit: String(Math.min(Math.max(Number(limite) || 100, 1), 500)) });
      const suffix = filtre ? `${q.toString()}&${String(filtre).replace(/^&/, '')}` : q.toString();
      return supabaseRest(table, suffix, { method: 'GET' });
    },

    async inspecter_schema({ table }) {
      return TOOLS.supabase_select({
        table: 'information_schema.columns',
        colonnes: 'column_name,data_type,is_nullable,column_default',
        filtre: `table_schema=eq.public&table_name=eq.${encodeURIComponent(safeTable(table))}`,
        limite: 300,
      });
    },

    async supabase_insert({ table, rows }) {
      if (table === 'tilex_files') {
        const projects = await TOOLS.supabase_select({ table: 'tilex_projects', limite: 1 });
        if (!Array.isArray(projects) || projects.length === 0) throw new Error('Crée un projet avant le fichier.');
      }
      return supabaseRest(table, '', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
      });
    },

    async supabase_update({ table, filtre, patch }) {
      if (table === 'tilex_conversations') throw new Error('UPDATE bloqué sur tilex_conversations.');
      if (!filtre) throw new Error('Filtre obligatoire pour une mise à jour.');
      return supabaseRest(table, String(filtre), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch || {}),
      });
    },

    async supabase_delete({ table, filtre }) {
      if (!filtre) throw new Error('Filtre obligatoire pour une suppression.');
      return supabaseRest(table, String(filtre), {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      });
    },

    async memory_read({ recherche = '', limite = 30 } = {}) {
      const words = String(recherche).toLowerCase().split(/\s+/).filter(Boolean);
      const rows = loadMemory().filter(row => !words.length || words.every(w => JSON.stringify(row).toLowerCase().includes(w)));
      return rows.slice(-Math.min(Number(limite) || 30, 100));
    },

    async memory_write({ titre = '', contenu, tags = [] }) {
      saveMemory({ type: 'note', titre: String(titre), contenu, tags: Array.isArray(tags) ? tags : [] });
      return { ok: true, message: 'Mémoire commune mise à jour.' };
    },

    async ecrire_code({ nom_fichier, contenu, langage = 'text' }) {
      const file = sanitizePath(nom_fichier);
      sharedHooks.onCode?.({ nom_fichier: file, contenu: String(contenu || ''), langage });
      global.dispatchEvent?.(new CustomEvent('tilex-agent-code', { detail: { nom_fichier: file, contenu, langage } }));
      return { ok: true, nom_fichier: file, caracteres: String(contenu || '').length };
    },

    async demander_a_alex({ question }) {
      sharedHooks.onQuestion?.(String(question || ''));
      return { en_attente: true, question: String(question || '') };
    },

    async finish({ reponse }) {
      return { fini: true, reponse: String(reponse || '') };
    },
  };

  const TOOL_DEFINITIONS = Object.freeze([
    ['github_list_files', 'Liste tous les fichiers du dépôt et de la branche choisis.', ['repo', 'branch']],
    ['github_read_file', 'Lit le contenu réel d’un fichier GitHub avant de le modifier.', ['path', 'repo', 'branch']],
    ['supabase_select', 'Lit des lignes Supabase avec RLS.', ['table', 'filtre', 'colonnes', 'limite']],
    ['inspecter_schema', 'Inspecte les colonnes réelles d’une table.', ['table']],
    ['supabase_insert', 'Insère des lignes après approbation.', ['table', 'rows']],
    ['supabase_update', 'Met à jour des lignes filtrées après approbation.', ['table', 'filtre', 'patch']],
    ['supabase_delete', 'Supprime des lignes filtrées après approbation explicite.', ['table', 'filtre']],
    ['memory_read', 'Lit la mémoire partagée des trois agents.', ['recherche', 'limite']],
    ['memory_write', 'Écrit dans la mémoire partagée des trois agents.', ['titre', 'contenu', 'tags']],
    ['ecrire_code', 'Envoie un fichier complet au Codex/Studio.', ['nom_fichier', 'contenu', 'langage']],
    ['demander_a_alex', 'Pose une question uniquement lorsqu’une donnée indispensable manque.', ['question']],
    ['finish', 'Termine la tâche avec une réponse finale.', ['reponse']],
  ].map(([name, description, params]) => ({ name, description, params })));

  function systemPrompt(agentId) {
    const persona = PERSONAS[agentId] || PERSONAS['ti-lex-al'];
    return `Tu es ${persona.name}, un des trois agents MAX de TI-LEX, créé pour Alex Marceau Prevost.

Les trois agents TI-LEX-AL, Marceau et Prevost utilisent EXACTEMENT le même noyau technique, les mêmes fichiers, les mêmes outils, la même mémoire et les mêmes protections. Ta différence est seulement ton nom, ton avatar et ton style: ${persona.style}.

MODE MAX:
- Analyse la demande, construis un plan interne, puis exécute les étapes utiles sans demander la permission à chaque étape.
- Lis toujours les vrais fichiers avant de proposer une modification.
- Utilise la mémoire partagée pour éviter de refaire le même travail.
- Vérifie les résultats des outils. N’invente jamais un résultat.
- En cas d’échec, corrige l’approche et réessaie avec une méthode sûre.
- Livre un résultat terminé, pas seulement un plan.
- Ne révèle pas de raisonnement privé détaillé; fournis seulement un résumé d’étape utile.

SÉCURITÉ:
- Toute écriture Supabase, suppression, écrasement ou opération sensible demande une approbation explicite du propriétaire.
- Aucun filtre vide pour UPDATE ou DELETE.
- Ne lis ni ne exposes les secrets, clés privées ou tables système.
- Ne contourne jamais l’authentification, la RLS ou les autorisations.

Réponds à chaque tour avec UN SEUL objet JSON valide:
{"resume":"résumé bref de l’étape","outil":"nom_outil","params":{}}
ou
{"fini":true,"reponse":"résultat final complet"}.

Outils disponibles: ${TOOL_DEFINITIONS.map(t => `${t.name}(${t.params.join(', ')})`).join('; ')}.`;
  }

  async function askApproval(agentId, tool, params) {
    if (!WRITE_TOOLS.has(tool)) return true;
    const detail = { agentId, tool, params };
    if (typeof sharedHooks.requestApproval === 'function') {
      return (await sharedHooks.requestApproval(detail)) === true;
    }
    const label = PERSONAS[agentId]?.name || agentId;
    return global.confirm?.(`${label} veut exécuter ${tool}.\n\n${JSON.stringify(params, null, 2).slice(0, 1800)}\n\nAutoriser cette action?`) === true;
  }

  async function callModel(agentId, messages) {
    const headers = { 'Content-Type': 'application/json' };
    const token = sessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(CFG.API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'chat',
        model: CFG.MODEL,
        max_tokens: 4000,
        system: systemPrompt(agentId),
        messages,
      }),
    });
    if (!response.ok) throw new Error(`Erreur du modèle (${response.status}).`);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let output = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim().startsWith('data:')) continue;
          const payload = line.trim().slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const event = JSON.parse(payload);
            if (event.type === 'content_block_delta' && event.delta?.text) output += event.delta.text;
            else if (typeof event.text === 'string') output += event.text;
          } catch (_) {}
        }
      }
      return output;
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error?.message || data.error);
    return (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n') || data.text || data.response || '';
  }

  function parseDecision(raw) {
    const clean = String(raw || '').replace(/```json|```/gi, '').trim();
    try { return JSON.parse(clean); }
    catch (_) {
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
      return { fini: true, reponse: clean || 'Aucune réponse du modèle.' };
    }
  }

  function createAgent(agentId) {
    if (!AGENT_IDS.includes(agentId)) throw new Error(`Agent inconnu: ${agentId}`);
    const persona = PERSONAS[agentId];
    return Object.freeze({
      id: agentId,
      name: persona.name,
      persona,
      tools: TOOLS,
      system: () => systemPrompt(agentId),
      config: configure,
      bind: bindHooks,
      async run(task, history = []) {
        const messages = [...history, { role: 'user', content: String(task || '') }];
        const trace = [];
        sharedHooks.onStatus?.({ agentId, status: 'running', task });
        saveMemory({ type: 'task', agentId, task: String(task || '') });

        for (let step = 1; step <= CFG.MAX_STEPS; step++) {
          let decision;
          try {
            decision = parseDecision(await callModel(agentId, messages));
          } catch (error) {
            const result = { fini: false, erreur: error.message, trace };
            sharedHooks.onStatus?.({ agentId, status: 'error', error: error.message });
            return result;
          }

          if (decision.fini) {
            const answer = String(decision.reponse || 'Tâche terminée.');
            saveMemory({ type: 'result', agentId, task: String(task || ''), answer });
            sharedHooks.onFinish?.({ agentId, answer, trace });
            sharedHooks.onStatus?.({ agentId, status: 'finished' });
            return { fini: true, reponse: answer, etapes: step, trace };
          }

          const toolName = String(decision.outil || '');
          const params = decision.params || {};
          const tool = TOOLS[toolName];
          let result;

          if (!tool) {
            result = { erreur: `Outil inconnu: ${toolName}` };
          } else if (!(await askApproval(agentId, toolName, params))) {
            result = { refuse: true, message: 'Action refusée par Alex.' };
          } else {
            try { result = await tool(params); }
            catch (error) { result = { erreur: error.message }; }
          }

          const item = { step, agentId, resume: decision.resume || '', outil: toolName, params, resultat: result };
          trace.push(item);
          sharedHooks.onStep?.(item);
          if (CFG.DEBUG) console.log('[TilexAgentsMAX]', item);

          messages.push({ role: 'assistant', content: JSON.stringify(decision) });
          messages.push({
            role: 'user',
            content: `Résultat réel de ${toolName}:\n${JSON.stringify(result).slice(0, CFG.MAX_TOOL_RESULT_CHARS)}`,
          });

          if (result?.en_attente) {
            return { fini: false, en_attente: true, messages, etapes: step, trace };
          }
        }

        const answer = `Limite sécuritaire de ${CFG.MAX_STEPS} étapes atteinte.`;
        sharedHooks.onFinish?.({ agentId, answer, trace });
        return { fini: false, reponse: answer, etapes: CFG.MAX_STEPS, trace };
      },
    });
  }

  const agents = Object.freeze({
    'ti-lex-al': createAgent('ti-lex-al'),
    marceau: createAgent('marceau'),
    prevost: createAgent('prevost'),
  });

  const api = Object.freeze({
    VERSION,
    CFG,
    PERSONAS,
    TOOLS,
    TOOL_DEFINITIONS,
    configure,
    bindHooks,
    createAgent,
    getAgent(id) { return agents[id] || agents['ti-lex-al']; },
    agents,
    memory: { read: loadMemory, write: saveMemory },
  });

  global.TilexAgentCoreMAX = api;
  global.TilexAgentsMAX = agents;
  global.TILEX_AL_MAX = agents['ti-lex-al'];
  global.MARCEAU_MAX = agents.marceau;
  global.PREVOST_MAX = agents.prevost;
  global.dispatchEvent?.(new CustomEvent('tilex-agent-core-ready', { detail: { version: VERSION, agents: AGENT_IDS } }));
})(typeof window !== 'undefined' ? window : globalThis);
