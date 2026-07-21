// api/vercel-logs.js
// ============================================
// ROUTE SERVERLESS VERCEL — « Les Yeux »
// Lit les déploiements + logs de build Vercel. Le token VERCEL_TOKEN reste
// côté serveur (variables Vercel) — JAMAIS dans le browser.
// 🔒 Réservé à l'administrateur ti-lex : on vérifie la session Supabase.
//
// À définir dans Vercel → Settings → Environment Variables :
//   VERCEL_TOKEN       (REQUIS) — token API Vercel (Account Settings → Tokens)
//   VERCEL_PROJECT_ID  (optionnel — défaut : le projet ti-lex)
//   VERCEL_TEAM_ID     (optionnel — défaut : l'équipe ti-lex)
//   TILEX_ADMIN_EMAIL  (optionnel — défaut : le courriel admin)
// ============================================

const VERCEL_API = 'https://api.vercel.com';
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_SFxxvqKj7OiiGflaX9odUwxwHUXm';
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_hGtz54T1dwArVaZE8Jdj4DLd';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';
const ADMIN_EMAIL = (process.env.TILEX_ADMIN_EMAIL || 'alexmarceauprevost812@gmail.com').toLowerCase();

// Vérifie que l'appelant est bien l'administrateur (via sa session Supabase).
async function estAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return (u && u.email ? u.email : '').toLowerCase() === ADMIN_EMAIL;
  } catch (_) {
    return false;
  }
}

function teamQS() {
  return TEAM_ID ? `&teamId=${encodeURIComponent(TEAM_ID)}` : '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, apikey');
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  }

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return res.status(500).json({ erreur: 'VERCEL_TOKEN manquant côté serveur (Vercel → Settings → Environment Variables).' });
  }

  if (!(await estAdmin(req))) {
    return res.status(403).json({ erreur: "Réservé à l'administrateur ti-lex." });
  }

  const action = req.query.action || 'deployments';
  const H = { Authorization: `Bearer ${token}` };

  try {
    if (action === 'deployments') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
      const r = await fetch(`${VERCEL_API}/v6/deployments?projectId=${encodeURIComponent(PROJECT_ID)}${teamQS()}&limit=${limit}`, { headers: H });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ erreur: data?.error?.message || `Vercel ${r.status}` });
      return res.status(200).json({ deployments: data.deployments || [] });
    }

    if (action === 'logs') {
      const id = String(req.query.id || '');
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
        return res.status(400).json({ erreur: 'id de déploiement invalide' });
      }
      const r = await fetch(`${VERCEL_API}/v3/deployments/${id}/events?builds=1&limit=1000${teamQS()}`, { headers: H });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ erreur: data?.error?.message || `Vercel logs ${r.status}` });
      const events = Array.isArray(data) ? data : (data.events || []);
      const logs = events.map(e => ({
        type: e.type || 'stdout',
        text: (e.payload?.text ?? e.text ?? '').toString(),
      }));
      return res.status(200).json({ logs });
    }

    return res.status(400).json({ erreur: `Action inconnue : ${action}` });
  } catch (err) {
    return res.status(502).json({ erreur: err.message || 'Vercel injoignable' });
  }
}
