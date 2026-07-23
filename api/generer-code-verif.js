/* ============================================
   TI-LEX-AL v10
   Fichier   : api/generer-code-verif.js
   Auteur    : Alex Marceau-Prévost
   Rôle      : Génère un code de vérification unique pour un domaine
               et crée (ou réinitialise) la ligne dans scan_mandats.
               Retourne les 2 méthodes de preuve (DNS TXT / fichier).
   ============================================ */

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';

// --- Décode le courriel depuis le JWT Supabase (sans vérifier la signature :
//     la RLS de la BD, elle, la vérifie pour de vrai). ---
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

// --- Nettoie un domaine : enlève protocole, chemin, port, met en minuscules. ---
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
  if (!email) return res.status(401).json({ erreur: 'Connexion requise (aucun courriel dans la session).' });

  const body = req.body || {};
  const domaine = nettoyerDomaine(body.domaine);
  if (!domaine || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domaine)) {
    return res.status(400).json({ erreur: 'Domaine invalide (ex: exemple.com).' });
  }

  const code = 'silex-verify-' + crypto.randomBytes(8).toString('hex');

  try {
    // Upsert : une seule ligne par (user_email, domaine). On (ré)initialise
    // verifie/mandat_signe à false quand on (re)génère un code.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/scan_mandats?on_conflict=user_email,domaine`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${auth.replace(/^Bearer\s+/i, '').trim()}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_email: email,
        domaine,
        code_verif: code,
        verifie: false,
        mandat_signe: false,
        signe_le: null,
        ip_signature: null,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(r.status).json({ erreur: 'Enregistrement refusé', detail: t.slice(0, 200) });
    }

    return res.status(200).json({
      ok: true,
      domaine,
      code_verif: code,
      instructions: {
        dns_txt: {
          titre: 'Méthode 1 — Enregistrement DNS TXT',
          type: 'TXT',
          hote: '@ (ou ' + domaine + ')',
          valeur: code,
          note: 'Ajoute cet enregistrement TXT chez ton registraire de domaine. La propagation DNS peut prendre de quelques minutes à 1 heure.',
        },
        fichier: {
          titre: 'Méthode 2 — Fichier de vérification',
          chemin: 'https://' + domaine + '/.well-known/silex-verify.txt',
          contenu: code,
          note: 'Crée ce fichier sur ton serveur avec exactement ce contenu.',
        },
      },
    });
  } catch (e) {
    return res.status(500).json({ erreur: e.message });
  }
}

/* ============================================
   📋 POUR CLAUDE CODE :
   - Le courriel vient du JWT (anti-usurpation) ; la RLS le revalide.
   - Aucune clé secrète exposée : anon key seulement + token utilisateur.
   ============================================ */
