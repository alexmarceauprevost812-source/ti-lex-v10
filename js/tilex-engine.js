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
  async function lancerJob(titre) {
    titre = (titre || '').trim();
    if (!titre) return { ok: false, erreur: 'Décris la job d\'abord.' };
    const sb = _sb();
    const uid = await _uid();
    if (!sb || !uid) return { ok: false, erreur: 'Connecte-toi d\'abord (compte ti-lex).' };

    // 1) Créer le job.
    const { data: jobRows, error: e1 } = await sb.from('tilex_jobs')
      .insert({ user_id: uid, titre, statut: 'en_cours' }).select().limit(1);
    if (e1 || !jobRows || !jobRows.length) return { ok: false, erreur: 'Création du job échouée : ' + (e1 && e1.message || '?') };
    const job = jobRows[0];

    // 2) Créer les 4 sous-tâches (une par agent).
    const tasksToInsert = PIPELINE.map((p, i) => ({
      job_id: job.id, user_id: uid, agent: p.agent, titre: p.titre, ordre: i, statut: 'pending',
    }));
    const { data: taskRows } = await sb.from('tilex_tasks').insert(tasksToInsert).select();
    _emit();

    // 3) Exécuter le pipeline en séquence (chaque agent reçoit le travail précédent).
    _executerPipeline(job, (taskRows || []).sort((a, b) => a.ordre - b.ordre));
    return { ok: true, jobId: job.id };
  }

  async function _executerPipeline(job, tasks) {
    const sb = _sb();
    let contexte = '';
    let erreurGlobale = false;

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

  // ─── Temps réel (respecte la RLS : seulement mes lignes) ─────────────
  async function brancherRealtime() {
    const sb = _sb(); if (!sb || window.__engineRT) return;
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) { try { await sb.realtime.setAuth(data.session.access_token); } catch (e) {} }
      window.__engineRT = sb.channel('tilex-engine')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tilex_jobs' }, _emit)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tilex_tasks' }, _emit)
        .subscribe();
    } catch (e) {}
  }

  return { lancerJob, listerJobs, listerTaches, supprimerJob, brancherRealtime, PIPELINE };

})();

window.TilexEngine = TilexEngine;
