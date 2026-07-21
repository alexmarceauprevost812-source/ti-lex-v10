// api/supabase-actions.js
// ============================================
// « Les Mains » — exécution SQL Supabase, côté serveur.
// La cle SERVICE ROLE reste ici (variable Vercel) — JAMAIS dans le browser.
// 🔒 Admin-only (session Supabase) + garde anti-catastrophe + journal d'audit.
//    exec_sql est verrouillee au service role (migration 0057) : meme si
//    quelqu'un atteignait cet endpoint, il ne passe pas sans etre l'admin.
//
// À définir dans Vercel → Settings → Environment Variables :
//   SUPABASE_SERVICE_ROLE_KEY  (REQUIS, secret)
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_EMAIL = (process.env.TILEX_ADMIN_EMAIL || 'alexmarceauprevost812@gmail.com').toLowerCase();

// Retourne le courriel de l'appelant SI sa session Supabase est valide, sinon null.
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

// Garde-fou SERVEUR (autoritaire — on ne fait pas confiance au client) : bloque
// les commandes catastrophiques sauf si le SQL contient explicitement "-- CONFIRME".
function estDangereux(sql) {
  const s = String(sql).toLowerCase();
  if (/\b(drop\s+(table|database|schema|function|role|type|policy|trigger|index|view|owned)|truncate\b|alter\s+(role|user|system)|create\s+(role|user)|grant\s+|revoke\s+)/.test(s)) return true;
  if (/\bdelete\s+from\b/.test(s) && !/\bwhere\b/.test(s)) return true;         // DELETE sans WHERE
  if (/\bupdate\s+\S/.test(s) && /\bset\b/.test(s) && !/\bwhere\b/.test(s)) return true; // UPDATE sans WHERE
  return false;
}

async function journaliser(email, action, query, ok, erreur) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/tilex_hands_audit`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ actor_email: email, action, sql_query: query, ok, erreur }),
    });
  } catch (_) { /* le journal ne doit jamais bloquer l'action */ }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, apikey');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
  if (!SERVICE_KEY) return res.status(500).json({ erreur: 'SUPABASE_SERVICE_ROLE_KEY manquant côté serveur (variable Vercel).' });

  const email = await courrielAppelant(req);
  if (!email || email !== ADMIN_EMAIL) {
    return res.status(403).json({ erreur: "Réservé à l'administrateur ti-lex." });
  }

  const body = req.body || {};
  const action = body.action;
  const query = body.query;

  if (action !== 'sql') return res.status(400).json({ erreur: 'action invalide' });
  if (!query || typeof query !== 'string' || !query.trim()) return res.status(400).json({ erreur: 'SQL vide ou invalide' });
  if (query.length > 100000) return res.status(400).json({ erreur: 'SQL trop long' });

  if (estDangereux(query) && !query.includes('-- CONFIRME')) {
    await journaliser(email, 'sql-bloque', query, false, 'destructif sans confirmation');
    return res.status(400).json({ erreur: '⚠️ Commande destructrice détectée. Ajoute "-- CONFIRME" à la fin du SQL pour forcer.' });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql_query: query }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      await journaliser(email, 'sql', query, false, data.message || `HTTP ${r.status}`);
      return res.status(r.status).json({ erreur: data.message || data.hint || `SQL erreur ${r.status}` });
    }
    await journaliser(email, 'sql', query, true, null);
    return res.status(200).json({ ok: true, rows: data && typeof data.rows !== 'undefined' ? data.rows : 0 });
  } catch (e) {
    await journaliser(email, 'sql', query, false, e.message);
    return res.status(500).json({ erreur: e.message });
  }
}
