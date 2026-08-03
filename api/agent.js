// api/agent.js
// ============================================================
// ⚙️ Moteur multi-agents — route serverless Vercel → Claude.
// Reçoit { role, job, contexte, consigne } et fait parler l'agent spécialisé.
// `consigne` = chantier propre à un équipier quand le renfort est actif.
// La clé ANTHROPIC_API_KEY reste CÔTÉ SERVEUR. Repli auto sur l'edge
// function Supabase « tilex-agent » si la clé n'est pas dans Vercel.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';

// Personas des agents spécialisés (français québécois, direct).
const ROLES = {
  codeur:
    "Tu es le CODEUR de l'équipe ti-lex. Tu écris du code COMPLET et fonctionnel " +
    "(vanilla JS/HTML/CSS par défaut, ou le langage demandé) pour réaliser la tâche. " +
    "Rends le code dans un bloc markdown avec le langage, puis 2-3 lignes d'explication. Pas de blabla.",
  reviseur:
    "Tu es le RÉVISEUR de l'équipe ti-lex. On te donne le code du codeur. Tu relèves les bugs, " +
    "les problèmes de sécurité et les améliorations concrètes. Si besoin, tu fournis une version corrigée " +
    "dans un bloc markdown. Sois précis et bref.",
  testeur:
    "Tu es le TESTEUR de l'équipe ti-lex. On te donne le code révisé. Tu décris comment le tester, " +
    "les cas limites, et tu donnes un VERDICT clair : PASS ✅ ou FAIL ❌, avec les raisons. Court et concret.",
  gardien:
    "Tu es le GARDIEN de l'équipe ti-lex. Vérification FINALE de qualité et de sécurité. " +
    "Donne le verdict final GO 🟢 ou NO-GO 🔴, un résumé de ce qui a été produit, et les prochaines étapes " +
    "s'il y en a. Rappelle tout risque (secret exposé, action destructrice). Bref et clair.",
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, apikey');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST seulement' });

  const { role, job, contexte, consigne } = req.body || {};
  const persona = ROLES[role];
  if (!persona) return res.status(400).json({ erreur: 'Rôle inconnu' });
  if (!job || typeof job !== 'string') return res.status(400).json({ erreur: 'Job manquant' });

  const message =
    `JOB À RÉALISER : ${job}\n\n` +
    (contexte ? `TRAVAIL DES AGENTS PRÉCÉDENTS :\n${String(contexte).slice(0, 6000)}\n\n` : '') +
    // Renfort multi-agents : chaque équipier reçoit SON chantier. Sans cette
    // consigne, les cinq équipiers referaient exactement le même travail.
    (consigne ? `TON CHANTIER PRÉCIS (ne fais que celui-là) :\n${String(consigne).slice(0, 2000)}\n\n` : '') +
    `Fais ta partie en tant que ${role}.`;

  try {
    const cle = process.env.ANTHROPIC_API_KEY;

    // Chemin A : clé Vercel → Claude direct.
    if (cle) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 2000,
          system: persona,
          messages: [{ role: 'user', content: message }],
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return res.status(502).json({ erreur: `Anthropic ${r.status}`, detail: t.slice(0, 200) });
      }
      const data = await r.json();
      const texte = (data.content || []).map((b) => b.text || '').join('').trim();
      return res.status(200).json({ texte });
    }

    // Chemin B : repli sur l'edge function Supabase (qui a la clé).
    const r = await fetch(`${SUPABASE_URL}/functions/v1/tilex-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ system: persona, message, max_tokens: 2000 }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ erreur: data.erreur || `Serveur ${r.status}` });
    return res.status(200).json({ texte: data.texte || '' });
  } catch (e) {
    return res.status(500).json({ erreur: e.message });
  }
}
