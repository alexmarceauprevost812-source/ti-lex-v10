const MAX_STEPS_LIMIT = 12;
const DEFAULT_MAX_STEPS = 6;
const SAFE_HTTP_HOSTS = new Set([
  'api.github.com',
  'en.wikipedia.org',
  'fr.wikipedia.org',
  'api.open-meteo.com'
]);

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

function cleanText(value, max = 12000) {
  return String(value ?? '').replace(/\u0000/g, '').slice(0, max);
}

function parseModelJson(text) {
  const raw = cleanText(text, 30000).trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Le modèle n’a pas retourné un objet JSON valide.');
  return JSON.parse(match[0]);
}

async function callAnthropic(messages, system) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY manquante.');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1800,
      temperature: 0.2,
      system,
      messages
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`);
  return data.content?.map(x => x.text || '').join('\n') || '';
}

async function callOpenAI(messages, system) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY manquante.');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.2',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, ...messages]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
  return data.choices?.[0]?.message?.content || '';
}

async function callModel(messages, system, provider) {
  if (provider === 'openai') return callOpenAI(messages, system);
  return callAnthropic(messages, system);
}

async function memoryRead(agentId, query) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { enabled: false, items: [] };
  const endpoint = `${url}/rest/v1/agent_memory?agent_id=eq.${encodeURIComponent(agentId)}&order=created_at.desc&limit=20`;
  const response = await fetch(endpoint, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Supabase memory_read HTTP ${response.status}`);
  const rows = await response.json();
  const q = cleanText(query, 500).toLowerCase();
  const items = rows.filter(r => !q || `${r.key} ${r.content}`.toLowerCase().includes(q)).slice(0, 8);
  return { enabled: true, items };
}

async function memoryWrite(agentId, keyName, content) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { enabled: false, saved: false };
  const response = await fetch(`${url}/rest/v1/agent_memory`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}`,
      prefer: 'return=minimal'
    },
    body: JSON.stringify({ agent_id: agentId, key: cleanText(keyName, 120), content: cleanText(content, 8000) })
  });
  if (!response.ok) throw new Error(`Supabase memory_write HTTP ${response.status}`);
  return { enabled: true, saved: true };
}

async function safeHttpGet(inputUrl) {
  const url = new URL(cleanText(inputUrl, 2000));
  if (url.protocol !== 'https:' || !SAFE_HTTP_HOSTS.has(url.hostname)) {
    throw new Error(`Domaine non autorisé: ${url.hostname}`);
  }
  const response = await fetch(url, { headers: { 'user-agent': 'TI-LEX-Agent/1.0' }, redirect: 'follow' });
  const text = await response.text();
  return { status: response.status, url: response.url, content: cleanText(text, 12000) };
}

async function executeTool(agentId, tool, input) {
  switch (tool) {
    case 'memory_read': return memoryRead(agentId, input?.query || '');
    case 'memory_write': return memoryWrite(agentId, input?.key || 'note', input?.content || '');
    case 'http_get': return safeHttpGet(input?.url || '');
    case 'finish': return { finished: true, answer: cleanText(input?.answer, 16000) };
    case 'think': return { note: cleanText(input?.note, 4000) };
    default: throw new Error(`Outil inconnu: ${tool}`);
  }
}

const SYSTEM = `Tu es TI-LEX AUTONOME, un agent planificateur-exécuteur défensif et légal.
Tu dois atteindre l’objectif avec un minimum d’étapes, vérifier tes résultats et ne jamais prétendre avoir exécuté une action non exécutée.
Tu n’as accès qu’aux outils fournis. Aucune commande système, aucun accès secret, aucune action destructive.
Pour toute action à impact réel, financière, juridique, publication, suppression, modification de compte ou sécurité offensive, arrête-toi et demande une validation humaine dans finish.
Réponds UNIQUEMENT avec ce JSON:
{"reasoning_summary":"résumé bref","tool":"think|memory_read|memory_write|http_get|finish","input":{},"progress":0}
progress est un entier de 0 à 100. Utilise finish avec {"answer":"..."} quand le travail est terminé ou bloqué.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non permise.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const goal = cleanText(body.goal, 6000).trim();
    if (!goal) return json(res, 400, { error: 'Le champ goal est requis.' });

    const provider = body.provider === 'openai' ? 'openai' : 'anthropic';
    const maxSteps = Math.min(Math.max(Number(body.maxSteps) || DEFAULT_MAX_STEPS, 1), MAX_STEPS_LIMIT);
    const agentId = cleanText(body.agentId || 'ti-lex-autonome', 120);
    const trace = [];
    const messages = [{ role: 'user', content: `OBJECTIF:\n${goal}\n\nCommence par décider de la meilleure prochaine action.` }];

    for (let step = 1; step <= maxSteps; step++) {
      const raw = await callModel(messages, SYSTEM, provider);
      const decision = parseModelJson(raw);
      const tool = cleanText(decision.tool, 40);
      const result = await executeTool(agentId, tool, decision.input || {});
      trace.push({ step, progress: Number(decision.progress) || 0, summary: cleanText(decision.reasoning_summary, 500), tool, result });

      if (tool === 'finish') {
        return json(res, 200, { ok: true, status: 'completed', provider, agentId, answer: result.answer, trace });
      }

      messages.push({ role: 'assistant', content: JSON.stringify(decision) });
      messages.push({ role: 'user', content: `RÉSULTAT OUTIL:\n${JSON.stringify(result).slice(0, 16000)}\nChoisis la prochaine action. Étape ${step}/${maxSteps}.` });
    }

    return json(res, 200, {
      ok: true,
      status: 'max_steps_reached',
      provider,
      agentId,
      answer: 'La limite d’étapes a été atteinte. Consulte la trace et relance avec un objectif plus précis ou davantage d’étapes.',
      trace
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || 'Erreur interne.' });
  }
}
