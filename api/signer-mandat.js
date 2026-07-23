/* ============================================
   TI-LEX-AL v10
   Fichier   : api/signer-mandat.js
   Auteur    : Alex Marceau-Prévost
   Rôle      : Signature électronique du mandat d'autorisation de scan.
               Journalise l'IP + la date, passe mandat_signe=true.
               Refuse si l'utilisateur n'a pas coché accepte=true.
   ============================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';

function emailDuJWT(authHeader) {
  try {
    const tok = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    const p = tok.split('.')[1];
    if (!p) return null;
    const json = Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    const data = JSON.parse(json);
    return data.email || (data.user_metadata && data.user_metadata.email) || null;
  } catch (e) { return null; }
}

function nettoyerDomaine(d) {
  return String(d || '')
    .trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/:?#].*$/, '')
    .replace(/\s/g, '');
}

function ipDeLaRequete(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'inconnue';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, apikey');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST seulement' });

  const auth = req.headers.authorization || '';
  const email = emailDuJWT(auth);
  if (!email) return res.status(401).json({ erreur: 'Connexion requise.' });

  const body = req.body || {};
  const domaine = nettoyerDomaine(body.domaine);
  if (!domaine) return res.status(400).json({ erreur: 'Domaine manquant.' });
  if (body.accepte !== true) {
    return res.status(400).json({ erreur: 'Tu dois cocher et accepter le mandat pour signer.' });
  }

  const ip = ipDeLaRequete(req);
  const maintenant = new Date().toISOString();
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();

  try {
    const up = await fetch(`${SUPABASE_URL}/rest/v1/scan_mandats?domaine=eq.${encodeURIComponent(domaine)}&user_email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ mandat_signe: true, signe_le: maintenant, ip_signature: ip }),
    });
    const rows = await up.json().catch(() => []);
    if (!up.ok) {
      return res.status(up.status).json({ erreur: 'Signature refusée', detail: JSON.stringify(rows).slice(0, 200) });
    }
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(404).json({ erreur: 'Aucun mandat pour ce domaine. Génère d\'abord ton code.' });
    }

    return res.status(200).json({ ok: true, mandat_signe: true, signe_le: maintenant, ip_signature: ip });
  } catch (e) {
    return res.status(500).json({ erreur: e.message });
  }
}

/* ============================================
   📋 POUR CLAUDE CODE :
   - Refus si accepte !== true.
   - IP prise depuis x-forwarded-for (Vercel), date en ISO.
   - RLS : l'utilisateur ne signe QUE ses propres mandats.
   ============================================ */
