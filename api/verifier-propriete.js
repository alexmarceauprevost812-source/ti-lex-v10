/* ============================================
   TI-LEX-AL v10
   Fichier   : api/verifier-propriete.js
   Auteur    : Alex Marceau-Prévost
   Rôle      : Vérifie la propriété d'un domaine. Cherche le code_verif
               (a) dans les enregistrements DNS TXT, OU
               (b) dans https://domaine/.well-known/silex-verify.txt.
               Si trouvé → passe verifie=true dans scan_mandats.
   ============================================ */

import dns from 'dns';

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

// --- Cherche le code dans les TXT du domaine (@ et _silex-verify.domaine). ---
async function chercherDNS(domaine, code) {
  const cibles = [domaine, '_silex-verify.' + domaine];
  for (const cible of cibles) {
    try {
      const records = await dns.promises.resolveTxt(cible); // [[ "chaine" ], ...]
      for (const rec of records) {
        const valeur = Array.isArray(rec) ? rec.join('') : String(rec);
        if (valeur.includes(code)) return true;
      }
    } catch (e) { /* pas de TXT sur cette cible → on continue */ }
  }
  return false;
}

// --- Cherche le code dans le fichier /.well-known/silex-verify.txt. ---
async function chercherFichier(domaine, code) {
  const url = 'https://' + domaine + '/.well-known/silex-verify.txt';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!r.ok) return false;
    const txt = (await r.text()).slice(0, 2000);
    return txt.includes(code);
  } catch (e) { return false; }
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

  const domaine = nettoyerDomaine((req.body || {}).domaine);
  if (!domaine) return res.status(400).json({ erreur: 'Domaine manquant.' });

  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const headersSb = { apikey: SUPABASE_ANON, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };

  try {
    // 1) Récupère la ligne (et le code attendu) — RLS filtre par courriel.
    const q = `${SUPABASE_URL}/rest/v1/scan_mandats?domaine=eq.${encodeURIComponent(domaine)}&user_email=eq.${encodeURIComponent(email)}&select=code_verif&limit=1`;
    const rg = await fetch(q, { headers: headersSb });
    const rows = await rg.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(404).json({ erreur: 'Aucun code pour ce domaine. Génère-le d\'abord.' });
    }
    const code = rows[0].code_verif;

    // 2) Vérifie DNS, sinon fichier.
    let methode = null;
    if (await chercherDNS(domaine, code)) methode = 'dns_txt';
    else if (await chercherFichier(domaine, code)) methode = 'fichier';

    if (!methode) {
      return res.status(200).json({ verifie: false, message: 'Code pas encore trouvé (DNS pas propagé ou fichier absent). Réessaie plus tard.' });
    }

    // 3) Marque comme vérifié.
    const up = await fetch(`${SUPABASE_URL}/rest/v1/scan_mandats?domaine=eq.${encodeURIComponent(domaine)}&user_email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { ...headersSb, Prefer: 'return=minimal' },
      body: JSON.stringify({ verifie: true, methode_preuve: methode }),
    });
    if (!up.ok) {
      const t = await up.text().catch(() => '');
      return res.status(up.status).json({ verifie: false, erreur: 'Mise à jour refusée', detail: t.slice(0, 200) });
    }

    return res.status(200).json({ verifie: true, methode });
  } catch (e) {
    return res.status(500).json({ erreur: e.message });
  }
}

/* ============================================
   📋 POUR CLAUDE CODE :
   - DNS via le module natif Node (dns.promises.resolveTxt).
   - Fichier via fetch avec timeout de 8 s.
   - RLS : l'utilisateur ne peut vérifier QUE ses propres domaines.
   ============================================ */
