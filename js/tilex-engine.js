// ============================================================
// js/tilex-engine.js — TilexEngine (moteur multi-agents)
// ti-lex-AL v10 | Auteur: Alex Marceau-Prévost
// File de tâches (Supabase) + orchestrateur + agents spécialisés :
//   Codeur → Réviseur → Testeur → Gardien
// La clé Claude reste côté serveur (via /api/agent). Privé par utilisateur.
// ============================================================

const TilexEngine = (() => {

  const API = '/api/agent';
  // Pipeline fixe : chaque job passe par ces 4 agents, dans l'ordre.
  const PIPELINE = [
    { agent: 'codeur',   titre: '💻 Codeur — écrit le code' },
    { agent: 'reviseur', titre: '🔍 Réviseur — vérifie et corrige' },
    { agent: 'testeur',  titre: '🧪 Testeur — teste et valide' },
    { agent: 'gardien',  titre: '🛡️ Gardien — verdict final' },
  ];

  // ─── RENFORT MULTI-AGENTS ────────────────────────────────────────────
  // Sur un gros projet, un seul codeur devient le goulot d'étranglement. Le
  // renfort découpe le travail en chantiers indépendants et met jusqu'à cinq
  // équipiers dessus, puis le pipeline habituel reprend la main pour réviser,
  // tester et rendre le verdict sur l'ensemble.
  const RENFORT_MAX = 5;

  // Détecte un gros projet à partir de la demande elle-même : plusieurs
  // livrables énumérés, plusieurs fichiers joints, ou une description longue.
  function estGrosProjet(titre, pieces) {
    const t = String(titre || '');
    const indices =
      (t.length > 220 ? 1 : 0) +
      ((t.match(/\bet\b|,|;|\+/g) || []).length >= 4 ? 1 : 0) +
      ((t.match(/\n\s*[-*\d]/g) || []).length >= 3 ? 1 : 0) +
      (/\b(page|module|écran|ecran|composant|fonctionnalit|section|api|table)\w*\b.*\b(et|,)\b/i.test(t) ? 1 : 0) +
      ((pieces && pieces.length >= 3) ? 1 : 0) +
      (/\b(gros|complet|entier|toute? l[ae]|refonte|migration|plateforme)\b/i.test(t) ? 1 : 0);
    return indices >= 2;
  }

  // Combien d'équipiers pour cette demande ? 'auto' décide tout seul.
  function nbAgentsPour(titre, pieces, demande) {
    if (demande === 'auto' || demande == null) {
      return estGrosProjet(titre, pieces) ? RENFORT_MAX : 1;
    }
    const n = parseInt(demande, 10);
    if (isNaN(n)) return 1;
    return Math.min(RENFORT_MAX, Math.max(1, n));
  }

  // Découpe la demande en N chantiers. On demande d'abord au répartiteur ;
  // s'il ne répond pas, on retombe sur un découpage par couches, qui reste
  // un vrai partage du travail plutôt que N fois la même tâche.
  async function _decouper(titre, n) {
    const secours = [
      'Structure et balisage : la base HTML/structure du livrable.',
      'Style et mise en page : CSS, disposition, responsive.',
      'Logique et interactions : le JavaScript et les comportements.',
      'Données et intégrations : appels API, stockage, état.',
      'Robustesse : cas limites, erreurs, accessibilité, performance.',
    ].slice(0, n);

    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'codeur',
          job: titre,
          contexte:
            'Tu es le RÉPARTITEUR. Découpe ce travail en exactement ' + n +
            ' chantiers indépendants, réalisables en parallèle sans se marcher dessus. ' +
            'Réponds UNIQUEMENT par un tableau JSON de ' + n +
            ' chaînes, une phrase par chantier, sans texte autour.',
        }),
      });
      const d = await r.json().catch(() => ({}));
      const brut = String(d.texte || '');
      const m = brut.match(/\[[\s\S]*\]/);
      if (m) {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr) && arr.length) {
          const propres = arr.map((x) => String(x).trim()).filter(Boolean).slice(0, n);
          if (propres.length) return propres;
        }
      }
    } catch (e) {
      console.warn('[coword] répartiteur indisponible, découpage par couches :', e.message);
    }
    return secours;
  }

  // ─── Client Supabase (réutilise celui de la page, sinon en crée un) ──
  function _sb() {
    if (window.__engineSb) return window.__engineSb;
    if (window.supabase && typeof window.supabase.from === 'function') { window.__engineSb = window.supabase; return window.__engineSb; }
    if (window.supabase && typeof window.supabase.createClient === 'function' && window.SB_URL && window.SB_ANON) {
      window.__engineSb = window.supabase.createClient(window.SB_URL, window.SB_ANON);
      return window.__engineSb;
    }
    return null;
  }

  async function _uid() {
    const sb = _sb(); if (!sb) return null;
    try { const u = await sb.auth.getUser(); return u && u.data && u.data.user ? u.data.user.id : null; } catch (e) { return null; }
  }

  function _emit() { try { window.dispatchEvent(new CustomEvent('tilex:engine:maj')); } catch (e) {} }

  // ─── Lancer une job : découpe + exécute le pipeline ──────────────────
  async function lancerJob(titre, pieces, options) {
    titre = (titre || '').trim();
    if (!titre) return { ok: false, erreur: 'Décris la job d\'abord.' };
    options = options || {};
    const nbAgents = nbAgentsPour(titre, pieces, options.agents);
    const sb = _sb();
    const uid = await _uid();
    if (!sb || !uid) return { ok: false, erreur: 'Connecte-toi d\'abord (compte ti-lex).' };

    // 1) Créer le job.
    const { data: jobRows, error: e1 } = await sb.from('tilex_jobs')
      .insert({ user_id: uid, titre, statut: 'en_cours', nb_agents: nbAgents }).select().limit(1);
    if (e1 || !jobRows || !jobRows.length) return { ok: false, erreur: 'Création du job échouée : ' + (e1 && e1.message || '?') };
    const job = jobRows[0];

    // 1b) Sauvegarder les pièces jointes (images / fichiers / zip) AVANT de lancer
    //     le serveur, pour que les agents puissent travailler avec.
    if (pieces && pieces.length) {
      try {
        const rows = pieces.map((p) => ({ job_id: job.id, user_id: uid, nom: p.nom, type: p.type, mime: p.mime || '', contenu: p.contenu || '' }));
        await sb.from('tilex_job_pieces').insert(rows);
      } catch (e) { /* pièces facultatives */ }
    }

    // 2) Créer les sous-tâches.
    //    Sans renfort : le pipeline habituel (codeur → réviseur → testeur → gardien).
    //    Avec renfort : N équipiers sur des chantiers distincts, puis les trois
    //    agents de contrôle qui reprennent l'ensemble.
    let tasksToInsert;
    if (nbAgents > 1) {
      const chantiers = await _decouper(titre, nbAgents);
      tasksToInsert = chantiers.map((c, k) => ({
        job_id: job.id, user_id: uid, agent: 'codeur',
        titre: '👷 Équipier ' + (k + 1) + ' — ' + c.slice(0, 70),
        consigne: c, ordre: k, lot: 1, statut: 'pending',
      }));
      PIPELINE.slice(1).forEach((p, i) => {
        tasksToInsert.push({
          job_id: job.id, user_id: uid, agent: p.agent, titre: p.titre,
          ordre: nbAgents + i, lot: 0, statut: 'pending',
        });
      });
    } else {
      tasksToInsert = PIPELINE.map((p, i) => ({
        job_id: job.id, user_id: uid, agent: p.agent, titre: p.titre,
        ordre: i, lot: 0, statut: 'pending',
      }));
    }
    const { data: taskRows } = await sb.from('tilex_tasks').insert(tasksToInsert).select();
    _emit();

    // 3) Demander la permission de notif (geste utilisateur) au premier lancement.
    _demanderPermNotif();
    // Abonner au Web Push → notif même app fermée (best-effort, non bloquant).
    try { if (window.TilexPushNotif) window.TilexPushNotif.activer(true); } catch (e) {}

    // 4) Lancer CÔTÉ SERVEUR : l'edge function continue même si on change de
    //    page ou qu'on ferme l'app. Repli sur le pipeline navigateur si absente.
    const surServeur = await _lancerServeur(job.id);
    if (!surServeur) {
      _executerPipeline(job, (taskRows || []).sort((a, b) => a.ordre - b.ordre));
    }
    return { ok: true, jobId: job.id, serveur: surServeur, agents: nbAgents };
  }

  // Lance le pipeline sur l'edge function (tâche de fond serveur).
  async function _lancerServeur(jobId) {
    const sb = _sb();
    if (!sb || !sb.functions || typeof sb.functions.invoke !== 'function') return false;
    try {
      let headers = {};
      try { const { data } = await sb.auth.getSession(); if (data && data.session) headers = { Authorization: 'Bearer ' + data.session.access_token }; } catch (e) {}
      const { data, error } = await sb.functions.invoke('tilex-coword', { body: { jobId }, headers });
      if (error) return false;
      return !!(data && data.ok);
    } catch (e) { return false; }
  }

  // Exécute une tâche et renvoie son texte (ou lève).
  async function _executerTache(job, t, contexte) {
    const sb = _sb();
    await sb.from('tilex_tasks').update({ statut: 'en_cours', updated_at: new Date().toISOString() }).eq('id', t.id);
    _emit();
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: t.agent, job: job.titre, contexte, consigne: t.consigne || '' }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.erreur) throw new Error(data.erreur || ('HTTP ' + r.status));
    const texte = data.texte || '(vide)';
    await sb.from('tilex_tasks').update({ statut: 'fini', resultat: texte, updated_at: new Date().toISOString() }).eq('id', t.id);
    _emit();
    return texte;
  }

  async function _executerPipeline(job, tasks) {
    const sb = _sb();
    let contexte = '';
    let erreurGlobale = false;

    // Les équipiers (lot 1) travaillent EN MÊME TEMPS : c'est tout l'intérêt
    // du renfort. Les agents de contrôle reprennent ensuite, en séquence.
    const equipiers = tasks.filter((t) => t.lot === 1);
    if (equipiers.length > 1) {
      const resultats = await Promise.all(equipiers.map(async (t) => {
        try {
          return { t, texte: await _executerTache(job, t, contexte) };
        } catch (e) {
          erreurGlobale = true;
          await sb.from('tilex_tasks').update({ statut: 'erreur', resultat: '❌ ' + e.message, updated_at: new Date().toISOString() }).eq('id', t.id);
          _emit();
          return { t, texte: null };
        }
      }));
      for (const r of resultats) {
        if (r.texte) contexte += '\n\n### ÉQUIPIER (' + (r.t.consigne || r.t.agent) + ') :\n' + r.texte;
      }
      tasks = tasks.filter((t) => t.lot !== 1);
    }

    for (const t of tasks) {
      await sb.from('tilex_tasks').update({ statut: 'en_cours', updated_at: new Date().toISOString() }).eq('id', t.id);
      _emit();
      try {
        const r = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: t.agent, job: job.titre, contexte }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.erreur) throw new Error(data.erreur || ('HTTP ' + r.status));

        const texte = data.texte || '(vide)';
        contexte += `\n\n### ${t.agent.toUpperCase()} :\n${texte}`;
        await sb.from('tilex_tasks').update({ statut: 'fini', resultat: texte, updated_at: new Date().toISOString() }).eq('id', t.id);
      } catch (e) {
        erreurGlobale = true;
        await sb.from('tilex_tasks').update({ statut: 'erreur', resultat: '❌ ' + e.message, updated_at: new Date().toISOString() }).eq('id', t.id);
      }
      _emit();
    }

    await sb.from('tilex_jobs').update({ statut: erreurGlobale ? 'erreur' : 'fini', updated_at: new Date().toISOString() }).eq('id', job.id);
    _emit();
  }

  // ─── Lecture ─────────────────────────────────────────────────────────
  async function listerJobs(limite = 20) {
    const sb = _sb(); if (!sb) return [];
    const { data } = await sb.from('tilex_jobs').select('*').order('created_at', { ascending: false }).limit(limite);
    return data || [];
  }
  async function listerTaches(jobId) {
    const sb = _sb(); if (!sb) return [];
    const { data } = await sb.from('tilex_tasks').select('*').eq('job_id', jobId).order('ordre', { ascending: true });
    return data || [];
  }
  async function supprimerJob(jobId) {
    const sb = _sb(); if (!sb) return;
    await sb.from('tilex_jobs').delete().eq('id', jobId); // cascade supprime les tâches
    _emit();
  }

  // ─── Notifications de fin (marche tant qu'une page est ouverte) ──────
  function _demanderPermNotif() {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  }
  const _notifies = new Set();
  function _notifier(job) {
    if (!job || !job.id || _notifies.has(job.id)) return;
    _notifies.add(job.id);
    const titre = job.titre || 'Coword';
    const ok = job.statut === 'fini';
    const msg = ok ? ('✅ Coword a fini : « ' + titre + ' »') : ('❌ Coword — erreur : « ' + titre + ' »');
    try { if (window.showToastMsg) window.showToastMsg(msg); else if (window.showToast) window.showToast(msg); } catch (e) {}
    const titreN = ok ? '✅ Travail terminé — Coword' : '❌ Coword';
    const opts = {
      body: ok ? ('Ton code est prêt : ' + titre) : ('Une étape a échoué : ' + titre),
      icon: '/assets/coword-tilex.png', badge: '/icon-192.png', tag: 'coword-' + job.id, data: { url: '/moteur' },
    };
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready
            .then((reg) => { try { reg.showNotification(titreN, opts); } catch (e) { try { new Notification(titreN, opts); } catch (e2) {} } })
            .catch(() => { try { new Notification(titreN, opts); } catch (e) {} });
        } else { try { new Notification(titreN, opts); } catch (e) {} }
      }
    } catch (e) {}
  }

  // ─── Temps réel (respecte la RLS : seulement mes lignes) ─────────────
  async function brancherRealtime() {
    const sb = _sb(); if (!sb || window.__engineRT) return;
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) { try { await sb.realtime.setAuth(data.session.access_token); } catch (e) {} }
      window.__engineRT = sb.channel('tilex-engine')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tilex_jobs' }, (payload) => {
          _emit();
          try { const n = payload && payload.new; if (n && (n.statut === 'fini' || n.statut === 'erreur')) _notifier(n); } catch (e) {}
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tilex_tasks' }, _emit)
        .subscribe();
    } catch (e) {}
  }

  // ─── Reprise : relance côté serveur les jobs bloqués (> 2 min) ────────
  async function reprendre() {
    const sb = _sb(); if (!sb) return;
    try {
      const uid = await _uid(); if (!uid) return;
      const { data } = await sb.from('tilex_jobs').select('*').eq('statut', 'en_cours');
      const maintenant = Date.now();
      for (const j of (data || [])) {
        const t = j.updated_at ? Date.parse(j.updated_at) : 0;
        if (!t || (maintenant - t) > 120000) _lancerServeur(j.id);
      }
    } catch (e) {}
  }

  // ─── Auto-init : branche le temps réel + reprise dès que Supabase est prêt.
  //     Ça fait marcher les notifications sur TOUTE page qui charge ce module.
  (function _autoInit() {
    let n = 0;
    const iv = setInterval(() => {
      n++;
      const sb = _sb();
      if (sb && sb.auth) {
        clearInterval(iv);
        brancherRealtime().catch(() => {});
        reprendre().catch(() => {});
        try { if (window.TilexPushNotif) window.TilexPushNotif.synchroniser(); } catch (e) {}
      } else if (n > 25) clearInterval(iv);
    }, 1000);
  })();

  return { lancerJob, listerJobs, listerTaches, supprimerJob, brancherRealtime, reprendre,
           PIPELINE, RENFORT_MAX, estGrosProjet, nbAgentsPour };

})();

window.TilexEngine = TilexEngine;
