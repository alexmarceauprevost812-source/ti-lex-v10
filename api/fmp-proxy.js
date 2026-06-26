// api/fmp-proxy.js
// ============================================
// ROUTE SERVERLESS VERCEL — PROXY FMP (Financial Modeling Prep)
// La clé FMP_API_KEY reste côté serveur (variables Vercel) — JAMAIS dans le browser.
// Le frontend appelle /api/fmp-proxy?endpoint=quote&symbol=AAPL
// ⚠️ Clé FMP_API_KEY à définir dans Vercel → Settings → Environment Variables
// ============================================

const FMP_BASE = 'https://financialmodelingprep.com/stable';

// 🔒 Allowlist : seuls ces endpoints (lecture seule) sont relayés.
//    Empêche d'utiliser le proxy comme passerelle ouverte.
const ENDPOINTS_AUTORISES = new Set([
  'profile',
  'quote',
  'quote-short',
  'search-symbol',
]);

// 🔒 Allowlist des paramètres de requête transmis à FMP.
const PARAMS_AUTORISES = new Set(['symbol', 'query', 'limit']);

// Validation simple des valeurs pour éviter toute injection dans l'URL.
function valeurValide(cle, valeur) {
  if (typeof valeur !== 'string' || valeur.length === 0 || valeur.length > 40) return false;
  if (cle === 'symbol') return /^[A-Za-z0-9.\-^]{1,15}$/.test(valeur);
  if (cle === 'limit') return /^[0-9]{1,3}$/.test(valeur);
  if (cle === 'query') return /^[A-Za-z0-9 .\-&]{1,40}$/.test(valeur);
  return false;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  }

  const cle = process.env.FMP_API_KEY;
  if (!cle) {
    return res.status(500).json({ erreur: 'Clé FMP manquante côté serveur' });
  }

  const { endpoint, ...reste } = req.query || {};

  if (!endpoint || !ENDPOINTS_AUTORISES.has(endpoint)) {
    return res.status(400).json({ erreur: `Endpoint non autorisé : ${endpoint || '(vide)'}` });
  }

  // Construit la requête FMP en ne gardant que les paramètres autorisés et valides.
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(reste)) {
    if (!PARAMS_AUTORISES.has(k)) continue;
    const valeur = Array.isArray(v) ? v[0] : v;
    if (!valeurValide(k, valeur)) {
      return res.status(400).json({ erreur: `Paramètre invalide : ${k}` });
    }
    params.set(k, valeur);
  }
  params.set('apikey', cle); // 🔑 ajoutée côté serveur uniquement

  try {
    const reponse = await fetch(`${FMP_BASE}/${endpoint}?${params.toString()}`);
    if (!reponse.ok) {
      return res.status(reponse.status).json({ erreur: `FMP HTTP ${reponse.status}` });
    }
    const data = await reponse.json();

    // Cache court côté CDN Vercel pour limiter la consommation du quota FMP.
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ erreur: err.message || 'FMP injoignable' });
  }
}
