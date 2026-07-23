// ============================================================
// supabase/functions/tilex-coword — Orchestrateur multi-agents
// ti-lex-AL v10 — Alex Marceau-Prévost
// Reçoit { jobId } + le token de l'utilisateur. Exécute TOUT le
// pipeline (Codeur → Réviseur → Testeur → Gardien) CÔTÉ SERVEUR,
// en tâche de fond (EdgeRuntime.waitUntil) : le travail continue
// même si l'utilisateur change de page ou ferme l'app. Chaque étape
// est sauvegardée dans tilex_tasks au fur et à mesure ; à la fin, le
// job passe à 'fini' → le temps réel Supabase notifie l'utilisateur.
// La clé Claude reste côté serveur. RLS respectée (token utilisateur).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORDRE = ["codeur", "reviseur", "testeur", "gardien"];

const ROLES: Record<string, string> = {
  codeur:
    "Tu es le CODEUR de l'équipe ti-lex. Tu écris du code COMPLET et fonctionnel " +
    "(vanilla JS/HTML/CSS par défaut, ou le langage demandé) pour réaliser la tâche. " +
    "Rends CHAQUE fichier dans son propre bloc markdown en indiquant le nom du fichier " +
    "(ex: ```js js/truc.js), puis 2-3 lignes d'explication. Pas de blabla.",
  reviseur:
    "Tu es le RÉVISEUR de l'équipe ti-lex. On te donne le code du codeur. Tu relèves les bugs, " +
    "les problèmes de sécurité et les améliorations concrètes. Fournis la version CORRIGÉE COMPLÈTE " +
    "de chaque fichier dans son bloc markdown (avec le nom du fichier). Sois précis et bref.",
  testeur:
    "Tu es le TESTEUR de l'équipe ti-lex. On te donne le code révisé. Tu décris comment le tester, " +
    "les cas limites, et tu donnes un VERDICT clair : PASS ✅ ou FAIL ❌, avec les raisons. Court et concret.",
  gardien:
    "Tu es le GARDIEN de l'équipe ti-lex. Vérification FINALE de qualité et de sécurité. " +
    "Donne le verdict final GO 🟢 ou NO-GO 🔴, un résumé de ce qui a été produit, et les prochaines étapes " +
    "s'il y en a. Rappelle tout risque (secret exposé, action destructrice). Bref et clair.",
};

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

async function appelClaude(system: string, message: string): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2400,
      system,
      messages: [{ role: "user", content: message.slice(0, 8000) }],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("Anthropic " + r.status + " " + t.slice(0, 160));
  }
  const ai = await r.json();
  return (ai.content ?? []).map((b: { text?: string }) => b.text ?? "").join("").trim();
}

// deno-lint-ignore no-explicit-any
async function executerPipeline(supa: any, job: any): Promise<void> {
  const { data: tasks } = await supa
    .from("tilex_tasks").select("*").eq("job_id", job.id).order("ordre", { ascending: true });
  const liste = (tasks ?? []).sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0));

  // Reconstruit le contexte à partir des étapes déjà finies (reprise possible).
  let contexte = "";
  for (const t of liste) {
    if (t.statut === "fini" && t.resultat) contexte += `\n\n### ${String(t.agent).toUpperCase()} :\n${t.resultat}`;
  }

  let erreur = false;
  for (const t of liste) {
    if (t.statut === "fini") continue; // déjà fait → on saute (reprise)
    await supa.from("tilex_tasks")
      .update({ statut: "en_cours", updated_at: new Date().toISOString() }).eq("id", t.id);
    try {
      const persona = ROLES[t.agent] ?? "Tu es un agent de l'équipe ti-lex.";
      const message =
        `JOB À RÉALISER : ${job.titre}\n\n` +
        (contexte ? `TRAVAIL DES AGENTS PRÉCÉDENTS :\n${contexte.slice(0, 6000)}\n\n` : "") +
        `Fais ta partie en tant que ${t.agent}.`;
      const texte = (await appelClaude(persona, message)) || "(vide)";
      contexte += `\n\n### ${String(t.agent).toUpperCase()} :\n${texte}`;
      await supa.from("tilex_tasks")
        .update({ statut: "fini", resultat: texte, updated_at: new Date().toISOString() }).eq("id", t.id);
    } catch (e) {
      erreur = true;
      await supa.from("tilex_tasks")
        .update({ statut: "erreur", resultat: "❌ " + String((e as Error).message ?? e), updated_at: new Date().toISOString() })
        .eq("id", t.id);
    }
  }

  await supa.from("tilex_jobs")
    .update({ statut: erreur ? "erreur" : "fini", updated_at: new Date().toISOString() }).eq("id", job.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const h = { ...cors(req), "Content-Type": "application/json" };
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erreur: "POST seulement" }), { status: 405, headers: h });
  }

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const body = await req.json().catch(() => ({}));
    const jobId = body.jobId;
    if (!jobId) return new Response(JSON.stringify({ erreur: "jobId manquant" }), { status: 400, headers: h });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Client avec le token de l'utilisateur → RLS respectée (il ne touche que SES lignes).
    const supa = createClient(url, anon, { global: { headers: { Authorization: auth } } });

    const { data: jobs, error } = await supa.from("tilex_jobs").select("*").eq("id", jobId).limit(1);
    if (error) return new Response(JSON.stringify({ erreur: error.message }), { status: 500, headers: h });
    if (!jobs || !jobs.length) {
      return new Response(JSON.stringify({ erreur: "Job introuvable ou accès refusé" }), { status: 404, headers: h });
    }
    const job = jobs[0];

    // Tâche de fond : continue sur le serveur même si le navigateur part.
    const p = executerPipeline(supa, job);
    // @ts-ignore — EdgeRuntime existe dans l'environnement Supabase.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(p);
    else await p;

    return new Response(JSON.stringify({ ok: true, started: true, jobId }), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ erreur: String(e) }), { status: 500, headers: h });
  }
});
