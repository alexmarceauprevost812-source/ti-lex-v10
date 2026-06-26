// api/vision.js
// ============================================
// ROUTE SERVERLESS VERCEL — TILEXVISION
// Utilise Claude Vision (Anthropic) — inclus dans ta clé existante
// ⚠️ Clé ANTHROPIC_API_KEY dans les variables Vercel
// ============================================
// 🔒 $$ : limite par IP (via check_rate_limit en base) pour éviter qu'un
// abuseur ne fasse exploser le quota Anthropic. Fail-open si Supabase non config.
async function verifierDebitIP(req, max, fenetreSec) {
  try {
    const xff = req.headers['x-forwarded-for'] || '';
    const ip = String(xff).split(',')[0].trim() || 'inconnu';
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return true;
    const r = await fetch(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_key: `vision:${ip}`, p_max: max, p_window_seconds: fenetreSec })
    });
    if (!r.ok) return true;
    return (await r.json()) === true;
  } catch { return true; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  }

  const within = await verifierDebitIP(req, 15, 60);
  if (!within) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ erreur: 'Trop de requêtes. Réessaie dans une minute.' });
  }

  const { maxTokens, messages, prompt, image_base64, image_media_type } = req.body || {};

  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    return res.status(500).json({ erreur: 'Clé API manquante côté serveur' });
  }

  try {
    let claudeMessages;

    if (messages && Array.isArray(messages) && messages.length > 0) {
      claudeMessages = messages.map(function(m) {
        if (typeof m.content === 'string') {
          return { role: m.role || 'user', content: m.content };
        }
        const blocks = [];
        if (Array.isArray(m.content)) {
          for (const c of m.content) {
            if (c.type === 'text') {
              blocks.push({ type: 'text', text: c.text });
            } else if (c.type === 'image_url' && c.image_url && c.image_url.url) {
              const dataUrl = c.image_url.url;
              const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
              if (match) {
                blocks.push({
                  type: 'image',
                  source: { type: 'base64', media_type: match[1], data: match[2] }
                });
              }
            }
          }
        }
        return { role: m.role || 'user', content: blocks.length > 0 ? blocks : m.content };
      });
    } else if (image_base64) {
      const mediaType = image_media_type || 'image/jpeg';
      const txt = prompt || 'Analyse cette image en détail. Décris ce que tu vois.';
      claudeMessages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image_base64 } },
          { type: 'text', text: txt }
        ]
      }];
    } else {
      return res.status(400).json({ erreur: 'messages ou image_base64 requis' });
    }

    const reponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cle,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens || 1000,
        messages: claudeMessages
      })
    });

    const data = await reponse.json();

    if (data.error) {
      return res.status(500).json({ erreur: data.error.message });
    }

    const contenu = (data.content || [])
      .filter(function(b) { return b.type === 'text'; })
      .map(function(b) { return b.text; })
      .join('');

    if (!contenu) {
      return res.status(500).json({ erreur: 'Réponse vide du moteur vision' });
    }

    return res.status(200).json({ resultat: contenu });
  } catch (err) {
    return res.status(500).json({ erreur: err.message });
  }
}
