// api/vercel-actions.js
// ============================================
// « Les Mains » — actions Vercel (redéploiement), côté serveur.
// 🔒 Admin-only (session Supabase). Le redéploiement passe par un Deploy Hook
//    Vercel (une URL secrète que tu crées) — aucun token exposé.
//
// À définir dans Vercel → Settings → Environment Variables :
//   VERCEL_DEPLOY_HOOK  (REQUIS) — URL du Deploy Hook
//     (Vercel → Settings → Git → Deploy Hooks → crée-en un sur la branche prod)
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';
const ADMIN_EMAIL = (process.env.TILEX_ADMIN_EMAIL || 'alexmarceauprevost812@gmail.com').toLowerCase();
const DEPLOY_HOOK = process.env.VERCEL_DEPLOY_HOOK || '';

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
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const email = await courrielAppelant(req);
  if (!email || email !== ADMIN_EMAIL) {
    return res.status(403).json({ erreur: "Réservé à l'administrateur ti-lex." });
  }

  const action = (req.body || {}).action;
  if (action !== 'redeploy') return res.status(400).json({ erreur: 'action invalide' });

  if (!DEPLOY_HOOK || !/^https:\/\/api\.vercel\.com\/.+/.test(DEPLOY_HOOK)) {
    return res.status(500).json({ erreur: 'VERCEL_DEPLOY_HOOK manquant/invalide (crée un Deploy Hook dans Vercel → Settings → Git).' });
  }

  try {
    const r = await fetch(DEPLOY_HOOK, { method: 'POST' });
    if (!r.ok) return res.status(r.status).json({ erreur: `Deploy hook HTTP ${r.status}` });
    const data = await r.json().catch(() => ({}));
    return res.status(200).json({ ok: true, url: data?.job?.id ? `job ${data.job.id}` : 'redeploy lancé' });
  } catch (e) {
    return res.status(500).json({ erreur: e.message });
  }
}
