// api/vercel-actions.js
// ============================================
// « Les Mains » — Redéclenche un déploiement Vercel. Token côté serveur seulement.
// 🔒 Admin-only (session Supabase vérifiée) — sinon n'importe qui pourrait spammer
//    des redéploiements. Deux façons de redéployer :
//   Option A — Deploy Hook (le plus simple) : VERCEL_HOOK_URL (ou VERCEL_DEPLOY_HOOK)
//   Option B — API Vercel : VERCEL_TOKEN + VERCEL_PROJECT_ID (redeploy du dernier)
//   Optionnel : VERCEL_TEAM_ID (défaut = l'équipe ti-lex ; requis pour un projet d'équipe)
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';
const ADMIN_EMAIL = (process.env.TILEX_ADMIN_EMAIL || 'alexmarceauprevost812@gmail.com').toLowerCase();
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_hGtz54T1dwArVaZE8Jdj4DLd';
const teamQS = TEAM_ID ? `&teamId=${encodeURIComponent(TEAM_ID)}` : '';

async function courrielAppelant(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return (u && u.email ? u.email : '').toLowerCase();
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, apikey');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST seulement' });

  // 🔒 Verrou admin.
  const email = await courrielAppelant(req);
  if (!email || email !== ADMIN_EMAIL) {
    return res.status(403).json({ erreur: "Réservé à l'administrateur ti-lex." });
  }

  const TOKEN = process.env.VERCEL_TOKEN;
  const PROJECT = process.env.VERCEL_PROJECT_ID;
  const HOOK = process.env.VERCEL_HOOK_URL || process.env.VERCEL_DEPLOY_HOOK; // Deploy Hook = le plus simple

  const { action } = req.body || {};
  if (action !== 'redeploy') return res.status(400).json({ erreur: 'action invalide' });

  try {
    // Option A : Deploy Hook (le plus simple, aucun token requis).
    if (HOOK && /^https:\/\//.test(HOOK)) {
      const r = await fetch(HOOK, { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ erreur: `Deploy hook HTTP ${r.status}` });
      return res.status(200).json({ url: 'hook déclenché', data });
    }

    // Option B : API Vercel avec token — redéploie le dernier déploiement.
    if (!TOKEN || !PROJECT) {
      return res.status(500).json({ erreur: 'VERCEL_HOOK_URL ou (VERCEL_TOKEN + VERCEL_PROJECT_ID) manquant' });
    }

    const H = { Authorization: `Bearer ${TOKEN}` };
    const list = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(PROJECT)}&limit=1${teamQS}`,
      { headers: H }
    );
    const listData = await list.json();
    const deployments = listData.deployments;
    if (!deployments?.length) return res.status(404).json({ erreur: 'aucun deploy à relancer' });

    const r = await fetch(`https://api.vercel.com/v13/deployments?${teamQS.replace(/^&/, '')}`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: deployments[0].name,
        deploymentId: deployments[0].uid,
        target: 'production',
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ erreur: data?.error?.message || `Vercel ${r.status}` });
    return res.status(200).json({ url: data.url, id: data.id });
  } catch (e) {
    return res.status(500).json({ erreur: e.message });
  }
}
