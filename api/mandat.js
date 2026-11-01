/* ============================================
   TI-LEX-AL v10
   Fichier   : api/mandat.js
   Auteur    : Alex Marceau-Prévost
   Rôle      : Endpoint UNIQUE du système de mandat de scan (regroupe
               4 anciens endpoints pour rester sous la limite Hobby de
               fonctions serverless). L'action est choisie par le champ
               `action` du body (ou le paramètre ?action= d'un rewrite) :
                 • generer   → génère un code de vérif + upsert scan_mandats
                 • verifier  → cherche le code (DNS TXT / fichier) → verifie=true
                 • signer    → signature électronique (IP + date) → mandat_signe=true
                 • autoriser → LE GARDIEN : autorise=true seulement si
                               verifie ET mandat_signe (fail-safe sinon)
   Sécurité  : courriel décodé du JWT (anti-usurpation) ; la RLS Supabase
               le revalide. Aucune clé secrète exposée : anon key + token user.
   ============================================ */

import crypto from 'crypto';
import dns from 'dns';
import net from 'node:net';

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

function ipDeLaRequete(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'inconnue';
}

function headersSb(bearer, extra) {
  return {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}


function adressePrivee(ip) {
  if (!net.isIP(ip)) return true;
  if (net.isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return adressePrivee(v.slice(7));
    return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') ||
      /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('2001:db8:');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 ||
    a === 198 && (b === 18 || b === 19) || a === 198 && b === 51 ||
    a === 203 && b === 0;
}

async function verifierDestination(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw Error('Destination interdite');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) || net.isIP(u.hostname)) throw Error('Domaine invalide');
  const addresses = await dns.promises.lookup(u.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(v => adressePrivee(v.address))) throw Error('Réseau privé interdit');
}

// --- Cherche le code dans les TXT du domaine (@ et _silex-verify.domaine). ---
async function chercherDNS(domaine, code) {
  const cibles = [domaine, '_silex-verify.' + domaine];
  for (const cible of cibles) {
    try {
      const records = await dns.promises.resolveTxt(cible);
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
    await verifierDestination(url);
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'error' });
    clearTimeout(t);
    if (!r.ok) return false;
    const txt = (await r.text()).slice(0, 2000);
    return txt.includes(code);
  } catch (e) { return false; }
}

// ─────────────────────────── ACTIONS ───────────────────────────

async function actionGenerer(req, res, { email, bearer, domaine }) {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domaine)) {
    return res.status(400).json({ erreur: 'Domaine invalide (ex: exemple.com).' });
  }
  const code = 'silex-verify-' + crypto.randomBytes(8).toString('hex');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/scan_mandats?on_conflict=user_email,domaine`, {
    method: 'POST',
    headers: headersSb(bearer, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({
      user_email: email, domaine, code_verif: code,
      verifie: false, mandat_signe: false, signe_le: null, ip_signature: null,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    return res.status(r.status).json({ erreur: 'Enregistrement refusé', detail: t.slice(0, 200) });
  }
  return res.status(200).json({
    ok: true, domaine, code_verif: code,
    instructions: {
      dns_txt: {
        titre: 'Méthode 1 — Enregistrement DNS TXT', type: 'TXT',
        hote: '@ (ou ' + domaine + ')', valeur: code,
        note: 'Ajoute cet enregistrement TXT chez ton registraire de domaine. La propagation DNS peut prendre de quelques minutes à 1 heure.',
      },
      fichier: {
        titre: 'Méthode 2 — Fichier de vérification',
        chemin: 'https://' + domaine + '/.well-known/silex-verify.txt', contenu: code,
        note: 'Crée ce fichier sur ton serveur avec exactement ce contenu.',
      },
    },
  });
}

async function actionVerifier(req, res, { email, bearer, domaine }) {
  const q = `${SUPABASE_URL}/rest/v1/scan_mandats?domaine=eq.${encodeURIComponent(domaine)}&user_email=eq.${encodeURIComponent(email)}&select=code_verif&limit=1`;
  const rg = await fetch(q, { headers: headersSb(bearer) });
  const rows = await rg.json().catch(() => []);
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(404).json({ erreur: 'Aucun code pour ce domaine. Génère-le d\'abord.' });
  }
  const code = rows[0].code_verif;

  let methode = null;
  if (await chercherDNS(domaine, code)) methode = 'dns_txt';
  else if (await chercherFichier(domaine, code)) methode = 'fichier';

  if (!methode) {
    return res.status(200).json({ verifie: false, message: 'Code pas encore trouvé (DNS pas propagé ou fichier absent). Réessaie plus tard.' });
  }

  const up = await fetch(`${SUPABASE_URL}/rest/v1/scan_mandats?domaine=eq.${encodeURIComponent(domaine)}&user_email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: headersSb(bearer, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ verifie: true, methode_preuve: methode }),
  });
  if (!up.ok) {
    const t = await up.text().catch(() => '');
    return res.status(up.status).json({ verifie: false, erreur: 'Mise à jour refusée', detail: t.slice(0, 200) });
  }
  return res.status(200).json({ verifie: true, methode });
}

async function actionSigner(req, res, { email, bearer, domaine }) {
  if ((req.body || {}).accepte !== true) {
    return res.status(400).json({ erreur: 'Tu dois cocher et accepter le mandat pour signer.' });
  }
  const ip = ipDeLaRequete(req);
  const maintenant = new Date().toISOString();
  const up = await fetch(`${SUPABASE_URL}/rest/v1/scan_mandats?domaine=eq.${encodeURIComponent(domaine)}&user_email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: headersSb(bearer, { Prefer: 'return=representation' }),
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
}

async function actionAutoriser(req, res, { email, bearer, domaine }) {
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
      autorise: false, raison, verifie: !!m.verifie, mandat_signe: !!m.mandat_signe,
      message: !m.verifie ? 'Propriété du domaine non vérifiée.' : 'Mandat d\'autorisation non signé.',
    });
  }
  return res.status(200).json({
    autorise: true, domaine, verifie: true, mandat_signe: true,
    signe_le: m.signe_le, methode: m.methode_preuve,
  });
}

const ACTIONS = {
  generer: actionGenerer,
  verifier: actionVerifier,
  signer: actionSigner,
  autoriser: actionAutoriser,
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, apikey');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST seulement' });

  // L'action vient du body (appel direct) ou du query (rewrite des anciennes URLs).
  const action = (req.body && req.body.action) || (req.query && req.query.action) || '';
  const fn = ACTIONS[action];
  if (!fn) {
    return res.status(400).json({ erreur: 'Action inconnue.', actions: Object.keys(ACTIONS) });
  }

  const auth = req.headers.authorization || '';
  const emailNonVerifie = emailDuJWT(auth);
  if (!emailNonVerifie) {
    const corps = action === 'autoriser' ? { autorise: false, erreur: 'Connexion requise.' } : { erreur: 'Connexion requise (aucun courriel dans la session).' };
    return res.status(401).json(corps);
  }
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const domaine = nettoyerDomaine((req.body || {}).domaine);
  if (!domaine) {
    const corps = action === 'autoriser' ? { autorise: false, erreur: 'Domaine manquant.' } : { erreur: 'Domaine manquant.' };
    return res.status(400).json(corps);
  }

  try {
    return await fn(req, res, { email, bearer, domaine });
  } catch (e) {
    const corps = action === 'autoriser' ? { autorise: false, erreur: e.message } : { erreur: e.message };
    return res.status(500).json(corps);
  }
}
