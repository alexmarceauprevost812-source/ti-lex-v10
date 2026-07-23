// api/translate.js
// ============================================================
// 🌐 Traduction terrain — route serverless Vercel qui appelle Claude.
// La clé ANTHROPIC_API_KEY reste CÔTÉ SERVEUR (jamais dans le front).
//
// Deux chemins, dans l'ordre :
//   A) ANTHROPIC_API_KEY présente dans les env Vercel  → appel direct Claude.
//   B) Sinon → relais vers l'edge function Supabase « translate » (qui a la clé).
// Comme ça, ça marche même si la clé n'est pas (encore) dans Vercel.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rnuripmfozlxenryxhdc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudXJpcG1mb3pseGVucnl4aGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE0NTEsImV4cCI6MjA4ODgzNzQ1MX0.kpF2fkUUShtCpkFGWuPBIRBaNnRVZNGIRmyuwpZZnmA';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, apikey');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST seulement' });

  const { texte, source, cible } = req.body || {};
  if (!texte || typeof texte !== 'string' || !texte.trim()) {
    return res.status(400).json({ erreur: 'Texte vide' });
  }
  const src = (typeof source === 'string' && source) ? source : 'français québécois';
  const dst = (typeof cible === 'string' && cible) ? cible : 'anglais';
  const contenu = texte.trim().slice(0, 3000);

  const systeme =
    "Tu es un traducteur professionnel. Traduis fidèlement le texte de l'utilisateur " +
    `de ${src} vers ${dst}. Garde le sens, le ton et le registre. ` +
    "Réponds UNIQUEMENT avec la traduction, sans guillemets, sans explication, sans préambule.";

  try {
    const cle = process.env.ANTHROPIC_API_KEY;

    // ── Chemin A : clé Vercel présente → Claude direct.
    if (cle) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cle,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1500,
          system: systeme,
          messages: [{ role: 'user', content: contenu }],
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return res.status(502).json({ erreur: `Anthropic ${r.status}`, detail: t.slice(0, 200) });
      }
      const data = await r.json();
      const traduction = (data.content || []).map((b) => b.text || '').join('').trim();
      return res.status(200).json({ traduction });
    }

    // ── Chemin B : pas de clé Vercel → relais vers l'edge function Supabase.
    const r = await fetch(`${SUPABASE_URL}/functions/v1/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ texte: contenu, source: src, cible: dst }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ erreur: data.erreur || `Serveur ${r.status}` });
    return res.status(200).json({ traduction: data.traduction || '' });
  } catch (e) {
    return res.status(500).json({ erreur: e.message });
  }
}
