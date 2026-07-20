import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };
const SSE_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
};

const DEFAULT_MODEL = "claude-sonnet-4-6";
const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";
const MEMORY_EXTRACTOR_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 2000;
const HISTORY_LIMIT = 50;
const WEB_SEARCH_MAX_USES = 5;
const MAX_ROUNDS = 3;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MEMORY_MATCH_COUNT = 5;
const MEMORY_MIN_SIMILARITY = 0.55;
const FILE_SEARCH_MATCH_COUNT = 8;
const FILE_SEARCH_MIN_SIMILARITY = 0.5;
const QUOTA_WARNING_THRESHOLD = 0.8;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function getEmbedding(text: string, inputType: "query" | "document" = "query"): Promise<number[]> {
  const voyageKey = Deno.env.get("VOYAGE_API_KEY");
  const cohereKey = Deno.env.get("COHERE_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (voyageKey) {
    const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${voyageKey}` },
      body: JSON.stringify({ input: [text], model: "voyage-multilingual-2", input_type: inputType }),
    });
    if (!resp.ok) throw new Error(`Voyage ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return data.data[0].embedding;
  }
  if (cohereKey) {
    const resp = await fetch("https://api.cohere.com/v2/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cohereKey}` },
      body: JSON.stringify({
        texts: [text], model: "embed-multilingual-v3.0",
        input_type: inputType === "query" ? "search_query" : "search_document",
        embedding_types: ["float"],
      }),
    });
    if (!resp.ok) throw new Error(`Cohere ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return data.embeddings.float[0];
  }
  if (openaiKey) {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
      body: JSON.stringify({ input: text, model: "text-embedding-3-small", dimensions: 1024 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return data.data[0].embedding;
  }
  throw new Error("Aucune clé d'embedding (VOYAGE_API_KEY, COHERE_API_KEY ou OPENAI_API_KEY)");
}

async function callAnthropic(apiKey: string, payload: any) {
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

async function classifySubAgent(apiKey: string, userMessage: string, subAgents: any[]) {
  if (subAgents.length === 0) return { suggestion: null as any, tokens: 0 };
  const desc = subAgents.map((a) => `- ${a.id}: ${a.name} ${a.emoji || ""} (spécialité: ${a.specialty || "généraliste"})`).join("\n");
  const prompt = `Message utilisateur:
"${userMessage}"

Sub-agents disponibles:
${desc}

Quel sub-agent est le mieux placé pour répondre? Si aucun n'est clairement pertinent (salutation, question générique), réponds null.

Réponds UNIQUEMENT avec un JSON: {"agent_id":"...","reason":"..."} ou null. Aucun texte autour.`;
  try {
    const { ok, data } = await callAnthropic(apiKey, {
      model: CLASSIFIER_MODEL, max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });
    const tokens = (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0);
    if (!ok) return { suggestion: null, tokens };
    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    const cleaned = text.replace(/```json|```/g, "").trim();
    if (cleaned === "null" || !cleaned) return { suggestion: null, tokens };
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed?.agent_id && subAgents.some((a) => a.id === parsed.agent_id)) {
        return { suggestion: { agent_id: parsed.agent_id, reason: parsed.reason || "" }, tokens };
      }
    } catch { /* ignore */ }
    return { suggestion: null, tokens };
  } catch { return { suggestion: null, tokens: 0 }; }
}

async function consultSubAgent(apiKey: string, sub: any, question: string) {
  const system = `${sub.personality || ""}\n\nSpécialité: ${sub.specialty || ""}`.trim();
  const payload: any = {
    model: DEFAULT_MODEL, max_tokens: 2000, system,
    messages: [{ role: "user", content: question }],
  };
  if (sub.can_search) payload.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
  const { ok, data } = await callAnthropic(apiKey, payload);
  const tokens = (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0);
  if (!ok) return { text: `[Erreur consultation ${sub.name}: ${data?.error?.message || "inconnue"}]`, queries: [], citations: [], results_count: 0, tokens };
  const blocks = data.content || [];
  const text = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  const queries = blocks.filter((b: any) => b.type === "server_tool_use" && b.name === "web_search")
    .map((b: any) => b.input?.query).filter((q: any) => typeof q === "string" && q.trim());
  const citations: any[] = [];
  for (const b of blocks) if (b.type === "text" && Array.isArray(b.citations)) for (const c of b.citations) citations.push(c);
  const results_count = blocks.filter((b: any) => b.type === "web_search_tool_result")
    .reduce((acc: number, b: any) => acc + (Array.isArray(b.content) ? b.content.length : 0), 0);
  return { text, queries, citations, results_count, tokens };
}

async function executeFileSearch(
  supabase: any,
  userId: string,
  query: string,
  projectId: string | undefined,
  maxResults = FILE_SEARCH_MATCH_COUNT,
): Promise<string> {
  if (!query || typeof query !== "string" || !query.trim()) {
    return "Erreur: query requis (string non vide).";
  }
  let resolvedProjectId = projectId;
  if (!resolvedProjectId) {
    const { data: proj } = await supabase
      .from("codex_projects")
      .select("id, name")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!proj) {
      return "Aucun projet Codex configuré. Crée un projet d'abord (table codex_projects).";
    }
    resolvedProjectId = proj.id;
  }
  let queryEmbedding: number[];
  try {
    queryEmbedding = await getEmbedding(query, "query");
  } catch (e) {
    return `Erreur d'embedding: ${e instanceof Error ? e.message : String(e)}`;
  }
  const { data: chunks, error } = await supabase.rpc("match_codex_embeddings", {
    query_embedding: queryEmbedding,
    target_project_id: resolvedProjectId,
    match_count: maxResults,
    min_similarity: FILE_SEARCH_MIN_SIMILARITY,
  });
  if (error) {
    return `Erreur de recherche codex_embeddings: ${error.message}`;
  }
  if (!chunks || chunks.length === 0) {
    return `Aucun résultat trouvé pour "${query}" dans le projet.`;
  }
  const formatted = chunks.map((c: any, i: number) => {
    const head = `[${i + 1}] ${c.file_path}:${c.start_line}-${c.end_line} (similarity=${c.similarity?.toFixed(2)})`;
    const lang = c.language || "";
    return `${head}\n\`\`\`${lang}\n${c.chunk_content}\n\`\`\``;
  }).join("\n\n");
  return `Trouvé ${chunks.length} résultats pour "${query}":\n\n${formatted}`;
}

// 🔰 [SILEX] Lance un vrai scan via security-agent en relayant le JWT de l'utilisateur.
async function executeLancerScan(input: any, ctx: DispatchCtx): Promise<string> {
  if (!ctx.authHeader || !ctx.supabaseUrl) return JSON.stringify({ erreur: "Contexte de scan indisponible." });
  const target = typeof input?.target === "string" ? input.target.trim().slice(0, 255) : "";
  if (!target) return JSON.stringify({ erreur: "Cible manquante." });
  const scanType = ["passive_recon", "web_scan", "vuln_scan", "config_audit", "full_audit"].includes(input?.scan_type)
    ? input.scan_type : "full_audit";
  try {
    const r = await fetch(`${ctx.supabaseUrl}/functions/v1/security-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": ctx.authHeader, "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "" },
      body: JSON.stringify({ target, scan_type: scanType }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) return JSON.stringify({ ok: false, erreur: data.error || `Scan échoué (HTTP ${r.status})` });
    return JSON.stringify({
      ok: true, cible: target, type: scanType,
      resume: data.executive_summary, compte: data.severity_counts, nombre: data.findings_count,
      findings: (data.findings || []).slice(0, 20).map((f: any) => ({
        severite: f.severity, titre: f.title, description: f.description, remediation: f.remediation,
      })),
    });
  } catch (e) {
    return JSON.stringify({ ok: false, erreur: "Scanner injoignable : " + (e instanceof Error ? e.message : String(e)) });
  }
}

// 🔰 [SILEX] Lit le dernier scan de l'utilisateur (client RLS-scopé → uniquement ses lignes).
async function executeLireDernierScan(input: any, ctx: DispatchCtx): Promise<string> {
  try {
    let q = ctx.supabase.from("security_scans")
      .select("id,target,scan_type,status,executive_summary,findings_critical,findings_high,findings_medium,findings_low,findings_info,created_at")
      .eq("user_id", ctx.userId);
    if (input?.target && typeof input.target === "string") q = q.ilike("target", "%" + input.target.trim() + "%");
    const { data: scans } = await q.order("created_at", { ascending: false }).limit(1);
    const scan = (scans as any[])?.[0];
    if (!scan) return JSON.stringify({ ok: true, trouve: false, note: "Aucun scan trouvé." });
    const { data: findings } = await ctx.supabase.from("security_findings")
      .select("severity,title,description,remediation").eq("scan_id", scan.id);
    return JSON.stringify({
      ok: true, trouve: true,
      cible: scan.target, type: scan.scan_type, statut: scan.status, date: scan.created_at,
      resume: scan.executive_summary,
      compte: {
        critical: scan.findings_critical, high: scan.findings_high, medium: scan.findings_medium,
        low: scan.findings_low, info: scan.findings_info,
      },
      findings: ((findings as any[]) || []).slice(0, 30).map((f: any) => ({
        severite: f.severity, titre: f.title, description: f.description, remediation: f.remediation,
      })),
    });
  } catch (e) {
    return JSON.stringify({ erreur: "Lecture du scan impossible : " + (e instanceof Error ? e.message : String(e)) });
  }
}

interface ExtractedMemory {
  kind: "fact" | "preference" | "summary";
  content: string;
  importance: number;
}

async function extractMemories(apiKey: string, userMessage: string, assistantMessage: string): Promise<ExtractedMemory[]> {
  const prompt = `Tu analyses un échange utilisateur ↔ assistant et tu extrais UNIQUEMENT les faits stables et préférences durables sur l'utilisateur qui méritent d'être mémorisés pour des conversations futures.

# Échange
USER: ${userMessage}
ASSISTANT: ${assistantMessage}

# Règles d'extraction
- Extraire des FAITS stables
- Extraire des PRÉFÉRENCES durables
- IGNORER l'éphémère et l'implicite
- Si rien ne mérite d'être mémorisé, renvoie []

# Format
Réponds UNIQUEMENT avec un JSON array (pas de texte autour, pas de markdown):
[{ "kind": "fact"|"preference"|"summary", "content": "...", "importance": 1-5 }]

Max 3 mémoires, content max 500 char.`;
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MEMORY_EXTRACTOR_MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    if (!resp.ok) { console.warn("[extract-memories] API error:", resp.status); return []; }
    const data = await resp.json();
    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    const cleaned = text.replace(/```json|```/g, "").trim();
    if (!cleaned || cleaned === "[]") return [];
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m) =>
      m && typeof m === "object" &&
      ["fact", "preference", "summary"].includes(m.kind) &&
      typeof m.content === "string" && m.content.length > 0 && m.content.length <= 8000 &&
      typeof m.importance === "number" && m.importance >= 1 && m.importance <= 5
    ).slice(0, 3);
  } catch (e) { console.warn("[extract-memories] parse failed:", e); return []; }
}

async function storeMemories(authHeader: string, supabaseUrl: string, memories: ExtractedMemory[], agentId: string, conversationId: string): Promise<void> {
  if (memories.length === 0) return;
  const url = `${supabaseUrl}/functions/v1/embed-store-memory`;
  await Promise.allSettled(memories.map((m) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": authHeader },
      body: JSON.stringify({
        kind: m.kind, content: m.content, importance: m.importance,
        agent_id: agentId, conversation_id: conversationId,
        metadata: { extracted_from: "agent-chat-stream", auto: true },
      }),
    }).then(async (r) => { if (!r.ok) console.warn(`[store-memory] ${r.status}:`, await r.text().catch(() => "?")); })
      .catch((e) => console.warn("[store-memory] fetch failed:", e))
  ));
}

async function extractAndStoreMemories(apiKey: string, authHeader: string, supabaseUrl: string, userMessage: string, assistantMessage: string, agentId: string, conversationId: string): Promise<void> {
  const memories = await extractMemories(apiKey, userMessage, assistantMessage);
  await storeMemories(authHeader, supabaseUrl, memories, agentId, conversationId);
}

interface AgentToolRow {
  tool_type: string; name: string; description: string;
  config: Record<string, any>; is_enabled: boolean; sort_order: number;
}
interface BuiltTools { tools: any[]; memoryRecallEnabled: boolean; subAgentConsultEnabled: boolean; }

function buildToolsFromConfig(rows: AgentToolRow[], fallbackAgent: { can_search: boolean; is_master: boolean }, subAgentIds: string[]): BuiltTools {
  if (rows.length === 0) {
    const tools: any[] = [];
    if (fallbackAgent.can_search) tools.push({ type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES });
    return { tools, memoryRecallEnabled: true, subAgentConsultEnabled: fallbackAgent.is_master && subAgentIds.length > 0 };
  }
  const tools: any[] = [];
  let memoryRecallEnabled = false;
  const enabled = rows.filter((r) => r.is_enabled).sort((a, b) => a.sort_order - b.sort_order);
  for (const row of enabled) {
    switch (row.tool_type) {
      case "web_search":
        tools.push({
          type: "web_search_20250305", name: "web_search",
          max_uses: row.config?.max_uses ?? WEB_SEARCH_MAX_USES,
          ...(row.config?.allowed_domains ? { allowed_domains: row.config.allowed_domains } : {}),
          ...(row.config?.blocked_domains ? { blocked_domains: row.config.blocked_domains } : {}),
        }); break;
      case "code_execution":
        tools.push({ type: "code_execution_20250522", name: "code_execution" }); break;
      case "memory_recall":
        memoryRecallEnabled = true; break;
      case "file_search":
        tools.push({
          name: row.name || "file_search",
          description: row.description || "Recherche sémantique dans les fichiers du projet Codex (codex_embeddings via match_codex_embeddings).",
          input_schema: {
            type: "object",
            properties: {
              query: { type: "string", description: "La requête de recherche sémantique." },
              project_id: { type: "string", description: "Optionnel: UUID d'un projet Codex spécifique. Si absent, utilise le projet le plus récent de l'utilisateur." },
            },
            required: ["query"],
          },
        }); break;
      case "custom_function":
        if (row.config?.input_schema) tools.push({ name: row.name, description: row.description || row.name, input_schema: row.config.input_schema });
        break;
      case "mcp_server": break;
      case "computer_use":
        tools.push({
          type: "computer_20250124", name: "computer",
          display_width_px: row.config?.display_width_px ?? 1024,
          display_height_px: row.config?.display_height_px ?? 768,
          display_number: row.config?.display_number ?? 1,
        }); break;
    }
  }
  return { tools, memoryRecallEnabled, subAgentConsultEnabled: fallbackAgent.is_master && subAgentIds.length > 0 };
}

function hasClientSideTool(tools: any[]): boolean {
  return tools.some((t) => !t.type);
}

interface DispatchCtx {
  supabase: any;
  userId: string;
  anthropicKey: string;
  authHeader?: string;
  supabaseUrl?: string;
  subAgents?: any[];
  enableConsultAgent?: boolean;
  onConsulting?: (info: any) => void;
  onConsulted?: (info: any) => void;
  consultations?: any[];
  aggQueries?: string[];
  aggCitations?: any[];
  aggResults?: { count: number };
  extraOutputTokens?: { count: number };
}

async function dispatchClientTool(name: string, input: any, ctx: DispatchCtx): Promise<{ content: string; is_error?: boolean }> {
  if (name === "file_search") {
    const text = await executeFileSearch(ctx.supabase, ctx.userId, input?.query, input?.project_id);
    return { content: text };
  }
  if (name === "lancer_scan_securite") {
    return { content: await executeLancerScan(input, ctx) };
  }
  if (name === "lire_dernier_scan") {
    return { content: await executeLireDernierScan(input, ctx) };
  }
  if (name === "consult_agent") {
    if (!ctx.enableConsultAgent || !ctx.subAgents) {
      return { content: "consult_agent non disponible pour cet agent", is_error: true };
    }
    const sub = ctx.subAgents.find((a) => a.id === input?.agent_id);
    const question = input?.question;
    if (!sub || !question) return { content: "sub-agent ou question invalide", is_error: true };
    ctx.onConsulting?.({ agent: { id: sub.id, name: sub.name, emoji: sub.emoji }, question });
    const c = await consultSubAgent(ctx.anthropicKey, sub, question);
    ctx.consultations?.push({
      agent: { id: sub.id, name: sub.name, emoji: sub.emoji },
      question, response_preview: c.text.slice(0, 200), queries: c.queries,
    });
    if (ctx.aggQueries) ctx.aggQueries.push(...c.queries);
    if (ctx.aggCitations) ctx.aggCitations.push(...c.citations);
    if (ctx.aggResults) ctx.aggResults.count += c.results_count;
    if (ctx.extraOutputTokens) ctx.extraOutputTokens.count += c.tokens;
    ctx.onConsulted?.({ agent: { id: sub.id, name: sub.name, emoji: sub.emoji }, tokens: c.tokens, used_search: c.queries.length > 0 });
    return { content: c.text };
  }
  return { content: `Tool inconnu: ${name}`, is_error: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Utilise POST." }, 405);

  try {
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!anthropicKey) return jsonResponse({ error: "ANTHROPIC_API_KEY manquante" }, 500);
    if (!supabaseUrl || !supabaseAnonKey) return jsonResponse({ error: "Config Supabase manquante" }, 500);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Token manquant" }, 401);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : supabase;

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Utilisateur non authentifié" }, 401);
    const userId = user.id;

    let body: any;
    try { body = await req.json(); } catch { return jsonResponse({ error: "JSON invalide" }, 400); }
    const { agent_id, conversation_id, user_message, model, max_tokens } = body;
    if (!agent_id || typeof agent_id !== "string") return jsonResponse({ error: "agent_id requis" }, 400);
    if (!user_message || typeof user_message !== "string" || !user_message.trim()) return jsonResponse({ error: "user_message requis" }, 400);

    const { data: profile } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
    const plan = profile?.plan || "free";
    const { data: limits, error: limitsError } = await admin.from("plan_limits").select("messages_per_day, messages_per_month").eq("plan", plan).single();
    if (limitsError || !limits) return jsonResponse({ error: "Plan introuvable", details: limitsError?.message }, 500);
    const today = new Date().toISOString().split("T")[0];
    const { data: usageToday } = await admin.from("usage_daily").select("messages_sent, tokens_used, cache_creation_input_tokens, cache_read_input_tokens").eq("user_id", userId).eq("usage_date", today).maybeSingle();
    const messagesToday = usageToday?.messages_sent || 0;
    if (messagesToday >= limits.messages_per_day) {
      return jsonResponse({ error: "Quota quotidien atteint", quota: { used: messagesToday, limit: limits.messages_per_day, plan } }, 429);
    }
    // Verrou MENSUEL : messages_per_month était chargé mais jamais comparé —
    // seule la limite quotidienne bloquait. Sur un mois de 31 jours, un plan
    // 40/jour + 1200/mois pouvait envoyer 1240 messages. On lit usage_monthly
    // (le même compteur que l'incrément plus bas) et on refuse au plafond.
    if (limits.messages_per_month) {
      const moisCourant = new Date().toISOString().slice(0, 7);
      const { data: usageMois } = await admin.from("usage_monthly").select("messages_sent").eq("user_id", userId).eq("usage_month", moisCourant).maybeSingle();
      const messagesCeMois = usageMois?.messages_sent || 0;
      if (messagesCeMois >= limits.messages_per_month) {
        return jsonResponse({ error: "Quota mensuel atteint", quota: { used: messagesCeMois, limit: limits.messages_per_month, plan, period: "month" } }, 429);
      }
    }
    const warningThreshold = Math.ceil(limits.messages_per_day * QUOTA_WARNING_THRESHOLD);
    if (messagesToday + 1 === warningThreshold && messagesToday + 1 < limits.messages_per_day) {
      admin.from("notifications").insert({
        user_id: userId, kind: "quota_warning",
        title: "Tu approches de ta limite quotidienne",
        body: `${messagesToday + 1}/${limits.messages_per_day} messages utilisés aujourd'hui.`,
        metadata: { used: messagesToday + 1, limit: limits.messages_per_day, plan },
      }).then(() => {}).catch((e: any) => console.warn("quota_warning notif failed:", e));
    }

    const { data: agent, error: agentError } = await supabase.from("agents").select("id, name, personality, specialty, emoji, can_search, is_master").eq("id", agent_id).maybeSingle();
    if (agentError || !agent) return jsonResponse({ error: "Agent introuvable" }, 404);

    const { data: toolRows, error: toolErr } = await supabase.from("agent_tools").select("tool_type, name, description, config, is_enabled, sort_order").eq("agent_id", agent.id);
    if (toolErr) console.warn("[agent-chat-stream] agent_tools fetch failed:", toolErr.message);

    let convId = conversation_id;
    if (!convId) {
      const title = user_message.slice(0, 50);
      const { data: newConv, error: convErr } = await supabase.from("conversations").insert({ user_id: userId, title, agent_name: agent.name, agent_id: agent.id }).select("id").single();
      if (convErr || !newConv) return jsonResponse({ error: "Échec création conversation", details: convErr?.message }, 500);
      convId = newConv.id;
    }

    const { data: history } = await supabase.from("messages").select("id, role, content, created_at").eq("conversation_id", convId).order("created_at", { ascending: true }).limit(HISTORY_LIMIT);
    const historyMessages = (history || []).map((m: any) => ({ role: m.role, content: m.content }));

    const { error: userMsgErr } = await supabase.from("messages").insert({ user_id: userId, conversation_id: convId, agent_id: agent.id, role: "user", content: user_message });
    if (userMsgErr) return jsonResponse({ error: "Échec sauvegarde message user", details: userMsgErr.message }, 500);

    let subAgents: any[] = [];
    let suggestion: { agent_id: string; reason: string } | null = null;
    let classifierTokens = 0;
    if (agent.is_master) {
      const { data: subs } = await supabase.from("agents").select("id, name, personality, specialty, emoji, can_search").eq("user_id", userId).eq("is_master", false).eq("is_active", true);
      subAgents = subs || [];
      if (subAgents.length > 0) {
        const r = await classifySubAgent(anthropicKey, user_message, subAgents);
        suggestion = r.suggestion; classifierTokens = r.tokens;
      }
    }

    const builtTools = buildToolsFromConfig((toolRows || []) as AgentToolRow[], { can_search: !!agent.can_search, is_master: !!agent.is_master }, subAgents.map((a: any) => a.id));

    let relevantMemories: Array<{ kind: string; content: string; importance: number; similarity: number }> = [];
    let memoryRetrievalError: string | null = null;
    if (builtTools.memoryRecallEnabled) {
      try {
        const queryEmbedding = await getEmbedding(user_message, "query");
        const { data: memories, error: memErr } = await supabase.rpc("match_agent_memories", { query_embedding: queryEmbedding, match_count: MEMORY_MATCH_COUNT, filter_agent_id: agent.id, min_similarity: MEMORY_MIN_SIMILARITY });
        if (memErr) { memoryRetrievalError = memErr.message; console.warn("[agent-chat-stream] match_agent_memories error:", memErr.message); }
        else if (memories) relevantMemories = memories as any[];
      } catch (e) {
        memoryRetrievalError = e instanceof Error ? e.message : String(e);
        console.warn("[agent-chat-stream] memory retrieval failed:", memoryRetrievalError);
      }
    }

    const isMasterMode = agent.is_master && subAgents.length > 0;

    // ⚡ Prompt caching (ti-lex) : on sépare la partie STABLE du system (persona,
    //    spécialité, consignes SILEX, liste des sub-agents) — mise en cache — de la
    //    partie VARIABLE (mémoires récupérées + suggestion du classifier) qui change
    //    à chaque message et ne doit PAS invalider le cache. L'ordre outils → system
    //    fait que le breakpoint sur le bloc stable met AUSSI les outils en cache.
    const tools: any[] = [...builtTools.tools];

    let systemStable = `${agent.personality || ""}\n\nSpécialité: ${agent.specialty || ""}`.trim();
    // 🔰 [SILEX] Consigne pour l'agent quand il a les outils de scan.
    if (tools.some((t: any) => t.name === "lancer_scan_securite" || t.name === "lire_dernier_scan")) {
      systemStable += `\n\n## SÉCURITÉ (SILEX)\nTu peux lancer de vrais scans (lancer_scan_securite) et lire leurs résultats (lire_dernier_scan). Après un scan, explique en français québécois clair : dis franchement si tout est correct, sinon nomme le vrai problème et l'action prioritaire. Ne dramatise pas un « info » ou un « low ». Si un scan est refusé, explique-le sans inventer de résultats.`;
    }
    if (isMasterMode) {
      const agentList = subAgents.map((a: any) => `- ${a.id}: **${a.name}** ${a.emoji || ""} — ${a.specialty || "généraliste"}`).join("\n");
      systemStable += `\n\n---\nTu as accès à ces sub-agents via consult_agent:\n${agentList}`;
      systemStable += `\n\nUtilise consult_agent(agent_id, question) quand une spécialité matche. Synthétise ensuite — l'utilisateur ne voit que ta réponse finale.`;
      tools.push({
        name: "consult_agent",
        description: "Consulter un sub-agent spécialisé en coulisse.",
        input_schema: {
          type: "object",
          properties: { agent_id: { type: "string", enum: subAgents.map((a: any) => a.id) }, question: { type: "string" } },
          required: ["agent_id", "question"],
        },
      });
    }

    // Partie variable (n'invalide pas le cache) : mémoires + suggestion du pré-classifier.
    let systemVariable = "";
    if (relevantMemories.length > 0) {
      systemVariable += `# Mémoires pertinentes\nVoici ce que tu sais déjà sur cet utilisateur :\n`;
      for (const m of relevantMemories) systemVariable += `- [${m.kind}, importance ${m.importance}] ${m.content}\n`;
      systemVariable += `\nUtilise ces souvenirs naturellement.`;
    }
    if (isMasterMode && suggestion) {
      const sugAgent = subAgents.find((a: any) => a.id === suggestion!.agent_id);
      systemVariable += `\n\nSuggestion du pré-classifier: consulter ${sugAgent?.name} (${suggestion.agent_id}) — ${suggestion.reason}`;
    }
    systemVariable = systemVariable.trim();

    // Blocs system : stable (caché) d'abord, variable (non caché) ensuite.
    const systemBlocks: any[] = [{ type: "text", text: systemStable, cache_control: { type: "ephemeral" } }];
    if (systemVariable) systemBlocks.push({ type: "text", text: systemVariable });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    async function persistAssistant(assistantText: string, totalInputTokens: number, totalOutputTokens: number, searchQueries: string[], searchCitations: any[], searchResultsCount: number, cacheCreation = 0, cacheRead = 0) {
      const totalTokens = totalInputTokens + totalOutputTokens + classifierTokens;
      let assistantMsgId: string | null = null;
      if (assistantText) {
        const { data: assistantMsg } = await supabase.from("messages").insert({
          user_id: userId, conversation_id: convId, agent_id: agent.id, role: "assistant",
          content: assistantText, agent_emoji: agent.emoji, tokens_used: totalTokens,
        }).select("id").single();
        assistantMsgId = (assistantMsg as any)?.id || null;
        if (searchQueries.length > 0) {
          const perQueryCount = Math.ceil(searchResultsCount / searchQueries.length);
          await supabase.from("searches").insert(searchQueries.map((q) => ({ user_id: userId, query: q, results_count: perQueryCount })));
        }
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
        const newDailyTokens = (usageToday?.tokens_used || 0) + totalTokens;
        // ⚡ Suivi du prompt caching : tokens écrits (creation) et lus (read, -90%).
        if (usageToday) await admin.from("usage_daily").update({ messages_sent: messagesToday + 1, tokens_used: newDailyTokens, cache_creation_input_tokens: ((usageToday as any).cache_creation_input_tokens || 0) + cacheCreation, cache_read_input_tokens: ((usageToday as any).cache_read_input_tokens || 0) + cacheRead }).eq("user_id", userId).eq("usage_date", today);
        else await admin.from("usage_daily").insert({ user_id: userId, usage_date: today, messages_sent: 1, tokens_used: totalTokens, cache_creation_input_tokens: cacheCreation, cache_read_input_tokens: cacheRead });
        const currentMonth = new Date().toISOString().slice(0, 7);
        const { data: usageMonth } = await admin.from("usage_monthly").select("messages_sent, tokens_used, cache_creation_input_tokens, cache_read_input_tokens").eq("user_id", userId).eq("usage_month", currentMonth).maybeSingle();
        if (usageMonth) await admin.from("usage_monthly").update({ messages_sent: (usageMonth.messages_sent || 0) + 1, tokens_used: (usageMonth.tokens_used || 0) + totalTokens, cache_creation_input_tokens: ((usageMonth as any).cache_creation_input_tokens || 0) + cacheCreation, cache_read_input_tokens: ((usageMonth as any).cache_read_input_tokens || 0) + cacheRead }).eq("user_id", userId).eq("usage_month", currentMonth);
        else await admin.from("usage_monthly").insert({ user_id: userId, usage_month: currentMonth, messages_sent: 1, tokens_used: totalTokens, cache_creation_input_tokens: cacheCreation, cache_read_input_tokens: cacheRead });
      }
      if (assistantText && builtTools.memoryRecallEnabled) {
        // @ts-ignore EdgeRuntime global
        EdgeRuntime.waitUntil(extractAndStoreMemories(anthropicKey, authHeader, supabaseUrl!, user_message, assistantText, agent.id, convId));
      }
      return { assistantMsgId, totalTokens };
    }

    const useMultiRound = isMasterMode || hasClientSideTool(tools);

    if (useMultiRound) {
      const clientStream = new ReadableStream({
        async start(controller) {
          const enqueue = (s: string) => controller.enqueue(encoder.encode(s));
          const consultations: any[] = [];
          const aggQueries: string[] = [];
          const aggCitations: any[] = [];
          const aggResults = { count: 0 };
          const extraOutputTokens = { count: 0 };
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          let totalCacheCreation = 0;
          let totalCacheRead = 0;
          let assistantContent = "";
          let lastBlocks: any[] = [];
          let currentMessages: any[] = [...historyMessages, { role: "user", content: user_message }];
          let errorFlag: string | null = null;

          if (isMasterMode && suggestion) {
            const s = subAgents.find((a: any) => a.id === suggestion!.agent_id);
            enqueue(sseEvent("suggestion", { agent: s ? { id: s.id, name: s.name, emoji: s.emoji } : null, reason: suggestion.reason }));
          }
          if (relevantMemories.length > 0) {
            enqueue(sseEvent("memories_loaded", { count: relevantMemories.length, memories: relevantMemories.map((m) => ({ kind: m.kind, importance: m.importance, similarity: m.similarity })) }));
          }

          enqueue(sseEvent("message_start", { type: "message_start", message: { id: `msg_fake_${crypto.randomUUID()}`, type: "message", role: "assistant", content: [], model: model || DEFAULT_MODEL, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } }));
          enqueue(sseEvent("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));

          const dispatchCtx: DispatchCtx = {
            supabase, userId, anthropicKey,
            authHeader: authHeader || undefined, supabaseUrl,
            subAgents, enableConsultAgent: isMasterMode,
            onConsulting: (info) => enqueue(sseEvent("consulting", info)),
            onConsulted: (info) => enqueue(sseEvent("consulted", info)),
            consultations, aggQueries, aggCitations, aggResults, extraOutputTokens,
          };

          try {
            for (let round = 0; round < MAX_ROUNDS; round++) {
              const payload: any = { model: model || DEFAULT_MODEL, max_tokens: Math.min(max_tokens || DEFAULT_MAX_TOKENS, 4096), system: systemBlocks, messages: currentMessages, tools };
              const { ok, data } = await callAnthropic(anthropicKey, payload);
              if (!ok) { errorFlag = data?.error?.message || "Erreur API"; break; }
              totalInputTokens += data.usage?.input_tokens || 0;
              totalOutputTokens += data.usage?.output_tokens || 0;
              totalCacheCreation += data.usage?.cache_creation_input_tokens || 0;
              totalCacheRead += data.usage?.cache_read_input_tokens || 0;
              const blocks = data.content || [];
              lastBlocks = blocks;

              for (const b of blocks) {
                if (b.type === "server_tool_use" && b.name === "web_search" && b.input?.query) aggQueries.push(b.input.query);
                if (b.type === "text" && Array.isArray(b.citations)) for (const c of b.citations) aggCitations.push(c);
                if (b.type === "web_search_tool_result" && Array.isArray(b.content)) aggResults.count += b.content.length;
              }

              const clientToolUses = blocks.filter((b: any) => b.type === "tool_use");
              if (data.stop_reason === "tool_use" && clientToolUses.length > 0) {
                currentMessages.push({ role: "assistant", content: blocks });
                const toolResults: any[] = [];
                for (const tu of clientToolUses) {
                  const res = await dispatchClientTool(tu.name, tu.input, dispatchCtx);
                  toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: res.content, ...(res.is_error ? { is_error: true } : {}) });
                }
                currentMessages.push({ role: "user", content: toolResults });
              } else {
                assistantContent = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
                break;
              }
            }
            if (!assistantContent) assistantContent = lastBlocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") || "[Aucune réponse après consultations multiples]";

            // Texte envoyé d'un coup — le client (TilexTypewriter) gère la cadence via requestAnimationFrame.
            // Plus de faux stream serveur: enlève la latence artificielle et unifie le feeling avec la Branche 2.
            enqueue(sseEvent("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: assistantContent } }));
            enqueue(sseEvent("content_block_stop", { type: "content_block_stop", index: 0 }));
            enqueue(sseEvent("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: totalOutputTokens } }));
            enqueue(sseEvent("message_stop", { type: "message_stop" }));
          } catch (err) {
            errorFlag = err instanceof Error ? err.message : String(err);
            enqueue(sseEvent("error", { message: errorFlag }));
          }

          let assistantMsgId: string | null = null;
          let totalTokens = 0;
          if (assistantContent && !errorFlag) {
            totalOutputTokens += extraOutputTokens.count;
            const r = await persistAssistant(assistantContent, totalInputTokens, totalOutputTokens, aggQueries, aggCitations, aggResults.count, totalCacheCreation, totalCacheRead);
            assistantMsgId = r.assistantMsgId; totalTokens = r.totalTokens;
          }

          enqueue(sseEvent("done", {
            conversation_id: convId, message_id: assistantMsgId,
            agent: { id: agent.id, name: agent.name, emoji: agent.emoji, is_master: agent.is_master, can_search: agent.can_search },
            master: isMasterMode ? { suggestion, consultations, consulted_count: consultations.length } : null,
            search: { used: aggQueries.length > 0, queries: aggQueries, results_count: aggResults.count, citations: aggCitations },
            memory: { count: relevantMemories.length, error: memoryRetrievalError, enabled: builtTools.memoryRecallEnabled },
            tools_count: tools.length, multi_round: true,
            usage: {
              input_tokens: totalInputTokens, output_tokens: totalOutputTokens,
              classifier_tokens: classifierTokens, total_tokens: totalTokens,
              messages_today: messagesToday + (assistantContent && !errorFlag ? 1 : 0),
              messages_today_limit: limits.messages_per_day, plan,
            },
            error: errorFlag,
          }));
          controller.close();
        },
      });
      return new Response(clientStream, { headers: SSE_HEADERS });
    }

    const anthropicMessages = [...historyMessages, { role: "user", content: user_message }];
    const payload: any = { model: model || DEFAULT_MODEL, max_tokens: Math.min(max_tokens || DEFAULT_MAX_TOKENS, 4096), system: systemBlocks, messages: anthropicMessages, stream: true };
    if (tools.length > 0) payload.tools = tools;

    const anthropicResp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
    if (!anthropicResp.ok || !anthropicResp.body) {
      const errData = await anthropicResp.json().catch(() => ({}));
      return jsonResponse({ error: "Erreur API Anthropic", details: errData }, anthropicResp.status);
    }
    const reader = anthropicResp.body.getReader();

    const clientStream = new ReadableStream({
      async start(controller) {
        let assistantText = "";
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheCreation = 0;
        let cacheRead = 0;
        let buffer = "";
        let streamError: string | null = null;
        const blockType: Record<number, string> = {};
        const blockInputJson: Record<number, string> = {};
        const citations: any[] = [];
        const searchQueries: string[] = [];
        let totalSearchResults = 0;

        if (relevantMemories.length > 0) {
          controller.enqueue(encoder.encode(sseEvent("memories_loaded", { count: relevantMemories.length, memories: relevantMemories.map((m) => ({ kind: m.kind, importance: m.importance, similarity: m.similarity })) })));
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";
            for (const part of parts) {
              for (const line of part.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (!raw) continue;
                try {
                  const data = JSON.parse(raw);
                  const idx = data.index;
                  if (data.type === "message_start") { inputTokens = data.message?.usage?.input_tokens || 0; cacheCreation = data.message?.usage?.cache_creation_input_tokens || 0; cacheRead = data.message?.usage?.cache_read_input_tokens || 0; }
                  else if (data.type === "content_block_start") {
                    const cb = data.content_block || {};
                    blockType[idx] = cb.type;
                    if (cb.type === "web_search_tool_result") totalSearchResults += Array.isArray(cb.content) ? cb.content.length : 0;
                  } else if (data.type === "content_block_delta") {
                    const d = data.delta || {};
                    if (d.type === "text_delta") assistantText += d.text || "";
                    else if (d.type === "input_json_delta") blockInputJson[idx] = (blockInputJson[idx] || "") + (d.partial_json || "");
                    else if (d.type === "citations_delta" && d.citation) citations.push(d.citation);
                  } else if (data.type === "content_block_stop") {
                    if (blockType[idx] === "server_tool_use") {
                      try {
                        const parsed = JSON.parse(blockInputJson[idx] || "{}");
                        if (typeof parsed.query === "string" && parsed.query.trim()) searchQueries.push(parsed.query);
                      } catch { /* ignore */ }
                    }
                  } else if (data.type === "message_delta") outputTokens = data.usage?.output_tokens ?? outputTokens;
                  else if (data.type === "error") streamError = data.error?.message || "Erreur stream";
                } catch { /* ignore non-JSON */ }
              }
            }
          }
        } catch (err) {
          streamError = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(sseEvent("error", { message: streamError })));
        }

        let assistantMsgId: string | null = null;
        let totalTokens = 0;
        if (assistantText && !streamError) {
          const r = await persistAssistant(assistantText, inputTokens, outputTokens, searchQueries, citations, totalSearchResults, cacheCreation, cacheRead);
          assistantMsgId = r.assistantMsgId; totalTokens = r.totalTokens;
        }

        controller.enqueue(encoder.encode(sseEvent("done", {
          conversation_id: convId, message_id: assistantMsgId,
          agent: { id: agent.id, name: agent.name, emoji: agent.emoji, is_master: agent.is_master, can_search: agent.can_search },
          master: null,
          search: { used: searchQueries.length > 0, queries: searchQueries, results_count: totalSearchResults, citations },
          memory: { count: relevantMemories.length, error: memoryRetrievalError, enabled: builtTools.memoryRecallEnabled },
          tools_count: tools.length, multi_round: false,
          usage: {
            input_tokens: inputTokens, output_tokens: outputTokens,
            classifier_tokens: classifierTokens, total_tokens: totalTokens,
            messages_today: messagesToday + (assistantText && !streamError ? 1 : 0),
            messages_today_limit: limits.messages_per_day, plan,
          },
          error: streamError,
        })));
        controller.close();
      },
      cancel() { reader.cancel().catch(() => {}); },
    });

    return new Response(clientStream, { headers: SSE_HEADERS });
  } catch (error) {
    console.error("agent-chat-stream error:", error);
    return jsonResponse({ error: "Erreur serveur", message: error instanceof Error ? error.message : String(error) }, 500);
  }
});
