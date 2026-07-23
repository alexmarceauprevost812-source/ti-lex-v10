/* ============================================
   TI-LEX-AL v10
   Fichier   : api/verifier-autorisation-scan.js
   Auteur    : Alex Marceau-Prévost
   Rôle      : LE GARDIEN. SILEX doit l'appeler AVANT chaque scan.
               Retourne autorise=true SEULEMENT si la propriété est
               vérifiée (verifie=true) ET le mandat signé (mandat_signe=true).
               Sinon : refus (scan bloqué).
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, apikey');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST seulement' });

  const auth = req.headers.authorization || '';
  const email = emailDuJWT(auth);
  if (!email) return res.status(401).json({ autorise: false, erreur: 'Connexion requise.' });

  const domaine = nettoyerDomaine((req.body || {}).domaine);
  if (!domaine) return res.status(400).json({ autorise: false, erreur: 'Domaine manquant.' });

  const bearer = auth.replace(/^Bearer\s+/i, '').trim();

  try {
    const q = `${SUPABASE_URL}/rest/v1/scan_mandats?domaine=eq.${encodeURIComponent(domaine)}&user_email=eq.${encodeURIComponent(email)}&select=verifie,mandat_signe,signe_le,methode_preuve&limit=1`;
    const r = await fetch(q, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${bearer}` } });
    const rows = await r.json().catch(() => []);

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(200).json({ autorise: false, raison: 'aucun_mandat', message: 'Aucun mandat pour ce domaine. Fais la vérification + signature d\'abord.' });
    }

    const m = rows[0];
    const autorise = m.verifie === true && m.mandat_signe === true;

    if (!autorise) {
      let raison = 'incomplet';
      if (!m.verifie) raison = 'propriete_non_verifiee';
      else if (!m.mandat_signe) raison = 'mandat_non_signe';
      return res.status(200).json({
        autorise: false,
        raison,
        verifie: !!m.verifie,
        mandat_signe: !!m.mandat_signe,
        message: !m.verifie
          ? 'Propriété du domaine non vérifiée.'
          : 'Mandat d\'autorisation non signé.',
      });
    }

    return res.status(200).json({
      autorise: true,
      domaine,
      verifie: true,
      mandat_signe: true,
      signe_le: m.signe_le,
      methode: m.methode_preuve,
    });
  } catch (e) {
    return res.status(500).json({ autorise: false, erreur: e.message });
  }
}

/* ============================================
   📋 POUR CLAUDE CODE :
   - Point d'entrée UNIQUE que SILEX appelle avant tout scan.
   - autorise=true SEULEMENT si verifie ET mandat_signe.
   - En cas de doute (erreur/absence) → autorise=false (fail-safe).
   ============================================ */
