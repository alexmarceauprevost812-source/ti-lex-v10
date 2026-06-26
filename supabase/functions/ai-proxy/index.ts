// ti-lex-AL — Proxy IA securise (Anthropic chat + OpenAI images)
// Cles API cote serveur. Valide le body, limite l'usage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests, rateLimitHeaders } from "../_shared/rate-limit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const FMP_KEY = Deno.env.get("FMP_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 📈 Outils boursiers (FMP) — exécutés côté serveur, clé jamais exposée.
const FINANCE_TOOLS = [
  {
    name: "get_stock_quote",
    description:
      "Cotation boursière en temps réel d'une action (prix, variation, volume) à partir de son symbole boursier (ex: AAPL, TSLA, SHOP.TO). Utilise-le dès que l'utilisateur demande un cours, un prix d'action ou la performance d'une entreprise cotée.",
    input_schema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Symbole boursier, ex: AAPL" } },
      required: ["symbol"],
    },
  },
  {
    name: "get_company_profile",
    description:
      "Profil complet d'une entreprise cotée (secteur, industrie, PDG, nombre d'employés, description, site web) à partir de son symbole boursier.",
    input_schema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Symbole boursier, ex: AAPL" } },
      required: ["symbol"],
    },
  },
];

// Guidance ajoutée au system prompt quand les outils boursiers sont actifs.
const FINANCE_SYSTEM = `

## AIDE FINANCIÈRE
Tu peux aider l'utilisateur avec des informations boursières et financières :
- get_stock_quote → cours en temps réel (prix, variation, volume).
- get_company_profile → profil d'une entreprise cotée.
Donne des chiffres clairs et du contexte. Rappelle au besoin que ce sont des informations, pas des conseils financiers personnalisés.`;

// Validation symbole partagée (anti-injection dans l'URL FMP).
function symboleValide(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9.\-^]{1,15}$/.test(s);
}

async function fmpFetch(endpoint: string, symbol: string): Promise<string> {
  if (!FMP_KEY) return JSON.stringify({ erreur: "Clé FMP non configurée côté serveur" });
  if (!symboleValide(symbol)) return JSON.stringify({ erreur: "Symbole invalide" });
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/${endpoint}?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`,
    );
    if (!r.ok) return JSON.stringify({ erreur: `FMP HTTP ${r.status}` });
    return JSON.stringify(await r.json());
  } catch (e: any) {
    return JSON.stringify({ erreur: e?.message || "FMP injoignable" });
  }
}

const PLANS_VALIDES = new Set([
  "ti", "flux", "surge", "apex",
  "cyber_recon", "cyber_guardian", "cyber_shield", "cyber_sentinel", "cyber_fortress",
]);

const LIMITS = { chat: 200, image: 20 };
const MAX_PROMPT_LEN = 4000;
const MAX_TOKENS_CAP = 8192;
const MAX_MESSAGES = 60;
const MAX_MSG_CHARS = 20_000_000;
const ALLOWED_MODELS = new Set([
  "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001",
]);
const ALLOWED_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024", "auto"]);

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "Methode non autorisee" }, 405, cors);

  try {
    // ---- 1. Auth obligatoire + vérification abonnement ----
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!token) {
      return json({ error: "non_connecte", message: "Connecte-toi pour utiliser ti-lex-al." }, 401, cors);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: authError } = await sb.auth.getUser(token);
    if (authError || !userData?.user?.id) {
      return json({ error: "non_connecte", message: "Session expirée. Reconnecte-toi." }, 401, cors);
    }
    const userId = userData.user.id;

    const rl = await checkRateLimit(getIdentifier(req, userId), { prefix: "ai-proxy", max: 10, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl, cors);

    const { data: profile } = await sb
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();
    const userPlan = profile?.plan || "";

    if (!PLANS_VALIDES.has(userPlan)) {
      return json({ error: "sans_abonnement", message: "Abonne-toi pour accéder à ti-lex-al." }, 403, cors);
    }

    // ---- 2. Parse + valide le body ----
    let body: any;
    try { body = await req.json(); }
    catch { return json({ error: "JSON invalide" }, 400, cors); }

    const kind = body.kind === "image" ? "image" : "chat";

    // ---- 3. Rate limit ----
    {
      try {
        const col = kind === "image" ? "image_count" : "chat_count";
        const { data: usage } = await sb
          .from("ai_usage")
          .select(col)
          .eq("user_id", userId)
          .eq("day", new Date().toISOString().slice(0, 10))
          .maybeSingle();

        const current = (usage as any)?.[col] ?? 0;
        if (current >= LIMITS[kind]) {
          return json({ error: `Limite quotidienne atteinte (${LIMITS[kind]} ${kind})` }, 429, cors);
        }

        await sb.from("ai_usage").upsert(
          {
            user_id: userId,
            day: new Date().toISOString().slice(0, 10),
            [col]: current + 1,
          },
          { onConflict: "user_id,day" },
        );
      } catch (_) {}
    }

    // ===================== IMAGE =====================
    if (kind === "image") {
      if (!OPENAI_KEY) return json({ error: "OPENAI_API_KEY non configuree" }, 500, cors);

      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return json({ error: "Prompt vide" }, 400, cors);
      if (prompt.length > MAX_PROMPT_LEN)
        return json({ error: `Prompt trop long (max ${MAX_PROMPT_LEN})` }, 400, cors);

      const size = ALLOWED_SIZES.has(body.size) ? body.size : "1024x1024";

      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data?.error?.message?.includes("safety") || data?.error?.code === "moderation_blocked"
          ? "Image refusee par la moderation."
          : "Erreur de generation d'image.";
        return json({ error: msg }, r.status, cors);
      }
      return json({ b64: data.data?.[0]?.b64_json }, 200, cors);
    }

    // ===================== CHAT =====================
    const OPUS_PLANS = new Set(["apex", "cyber_guardian", "cyber_shield", "cyber_sentinel", "cyber_fortress"]);
    const DEFAULT_FALLBACK = "claude-sonnet-4-6";
    let requestedModel = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_FALLBACK;

    if (requestedModel === "claude-opus-4-8" || requestedModel === "claude-opus-4-7") {
      if (!OPUS_PLANS.has(userPlan)) {
        requestedModel = DEFAULT_FALLBACK;
      }
    }

    const model = requestedModel;

    if (!Array.isArray(body.messages) || body.messages.length === 0)
      return json({ error: "messages requis" }, 400, cors);
    if (body.messages.length > MAX_MESSAGES)
      return json({ error: "Historique trop long" }, 400, cors);

    const totalChars = JSON.stringify(body.messages).length;
    if (totalChars > MAX_MSG_CHARS)
      return json({ error: `Contenu trop volumineux (${(totalChars / 1_000_000).toFixed(1)} Mo, max ${(MAX_MSG_CHARS / 1_000_000).toFixed(0)} Mo)` }, 400, cors);

    const maxTokens = Math.min(Number(body.max_tokens) || 4096, MAX_TOKENS_CAP);

    const userKey = req.headers.get("x-anthropic-key");
    const apiKey = (userKey && userKey.startsWith("sk-ant-")) ? userKey : ANTHROPIC_KEY;
    if (!apiKey) return json({ error: "Aucune cle API configuree. Ajoute ta cle Anthropic dans les Parametres ou en secret Supabase." }, 500, cors);

    // Build tools list
    const tools: any[] = [];
    if (body.web_search) {
      tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 });
    }
    // 📈 Outils boursiers toujours disponibles si la clé FMP est configurée :
    // AL aide financièrement de lui-même quand l'utilisateur le demande.
    if (FMP_KEY) {
      tools.push(...FINANCE_TOOLS);
    }
    if (body.tools && Array.isArray(body.tools)) {
      tools.push(...body.tools);
    }

    const hasCustomTools = tools.some((t: any) => t.type !== "web_search_20250305");
    const anthropicHeaders = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
    let systemPrompt = typeof body.system === "string" ? body.system : undefined;
    if (FMP_KEY) {
      systemPrompt = (systemPrompt || "") + FINANCE_SYSTEM;
    }

    // ── Si outils custom (finance, etc.) : boucle d'outils en streaming temps réel ──
    if (hasCustomTools) {
      return handleToolLoop(body.messages, tools, model, maxTokens, systemPrompt, anthropicHeaders, cors, sb, userId);
    }

    // ── Standard streaming (with optional web_search passthrough) ──
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        stream: true,
        messages: body.messages,
        ...(tools.length > 0 ? { tools } : {}),
      }),
    });
    if (!r.ok) {
      try {
        const errData = await r.json();
        return json({ error: errData.error?.message || `Erreur Claude (${r.status})` }, r.status, cors);
      } catch {
        return json({ error: `Erreur du modele (${r.status})` }, r.status, cors);
      }
    }

    return new Response(r.body, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("ERREUR COMPLÈTE:", {
      status: error.status,
      message: error.message,
      type: error.constructor?.name,
      headers: error.headers,
    });
    return json(
      { error: `HTTP ${error.status ?? 500}: ${error.message ?? "Erreur serveur"}` },
      error.status ?? 500,
      cors,
    );
  }
});

function json(obj: unknown, status: number, hdrs: Record<string, string>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...hdrs, "Content-Type": "application/json" },
  });
}

// ── Tool-use loop: execute custom tools server-side ──
const MAX_TOOL_LOOPS = 8;

async function handleToolLoop(
  messages: any[],
  tools: any[],
  model: string,
  maxTokens: number,
  system: string | undefined,
  headers: Record<string, string>,
  cors: Record<string, string>,
  sb: any,
  userId: string,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      let msgs = [...messages];
      let loops = 0;

      try {
        while (loops < MAX_TOOL_LOOPS) {
          loops++;
          // Streaming activé : on relaie le texte en temps réel ET on gère les outils.
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers,
            body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: msgs, tools, stream: true }),
          });

          if (!r.ok || !r.body) {
            const err = await r.text().catch(() => "Erreur Claude");
            send(JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: `⚠️ ${err}` } }));
            send("[DONE]");
            controller.close();
            return;
          }

          // Assemble les blocs de contenu au fil du flux SSE d'Anthropic.
          const reader = r.body.getReader();
          const decoder = new TextDecoder();
          const blocks: any[] = []; // index → bloc en cours d'assemblage
          let stopReason: string | null = null;
          let buf = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const d = t.slice(5).trim();
              if (!d || d === "[DONE]") continue;
              let ev: any;
              try { ev = JSON.parse(d); } catch { continue; }

              if (ev.type === "content_block_start") {
                const cb = ev.content_block || {};
                if (cb.type === "tool_use") {
                  blocks[ev.index] = { type: "tool_use", id: cb.id, name: cb.name, _json: "" };
                } else if (cb.type === "text") {
                  blocks[ev.index] = { type: "text", text: "" };
                } else {
                  blocks[ev.index] = { ...cb };
                  if (cb.type === "server_tool_use" && cb.name === "web_search") {
                    send(JSON.stringify({ type: "tool_status", tool_name: "web_search", status: "executing" }));
                  }
                }
              } else if (ev.type === "content_block_delta") {
                const b = blocks[ev.index];
                if (ev.delta?.type === "text_delta") {
                  if (b && b.type === "text") b.text += ev.delta.text;
                  // Relai temps réel vers le client (même format que le passthrough).
                  send(JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: ev.delta.text } }));
                } else if (ev.delta?.type === "input_json_delta") {
                  if (b) b._json += ev.delta.partial_json || "";
                }
              } else if (ev.type === "message_delta") {
                if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
              }
            }
          }

          // Reconstruit le contenu assistant complet pour la suite de la conversation.
          const content: any[] = [];
          for (const b of blocks) {
            if (!b) continue;
            if (b.type === "tool_use") {
              let input: any = {};
              try { input = b._json ? JSON.parse(b._json) : {}; } catch { input = {}; }
              content.push({ type: "tool_use", id: b.id, name: b.name, input });
            } else if (b.type === "text") {
              content.push({ type: "text", text: b.text });
            } else {
              content.push(b);
            }
          }

          // Anthropic demande de continuer après un outil serveur (web_search).
          if (stopReason === "pause_turn") {
            msgs = [...msgs, { role: "assistant", content }];
            continue;
          }

          const toolUseBlocks = content.filter((b: any) => b.type === "tool_use");
          if (stopReason !== "tool_use" || toolUseBlocks.length === 0) {
            send("[DONE]");
            controller.close();
            return;
          }

          // Exécute chaque outil custom côté serveur, puis relance.
          const toolResults: any[] = [];
          for (const toolBlock of toolUseBlocks) {
            send(JSON.stringify({ type: "tool_status", tool_name: toolBlock.name, status: "executing" }));
            const result = await executeCustomTool(toolBlock.name, toolBlock.input, sb, userId);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: typeof result === "string" ? result : JSON.stringify(result),
            });
          }

          msgs = [
            ...msgs,
            { role: "assistant", content },
            { role: "user", content: toolResults },
          ];
        }

        send(JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "⚠️ Limite de boucles d'outils atteinte." },
        }));
        send("[DONE]");
        controller.close();
      } catch (e: any) {
        send(JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "⚠️ " + (e?.message || "Erreur") } }));
        send("[DONE]");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

async function executeCustomTool(name: string, input: any, sb: any, userId: string): Promise<string> {
  try {
    switch (name) {
      case "get_stock_quote":
        return await fmpFetch("quote", input?.symbol);
      case "get_company_profile":
        return await fmpFetch("profile", input?.symbol);
      case "execute_sql": {
        const query = input?.query || input?.sql || "";
        if (!query) return JSON.stringify({ error: "Requête SQL vide" });
        const { data, error } = await sb.rpc("exec_realize", { p_sql: query });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ ok: true, result: data });
      }
      case "list_tables": {
        const { data, error } = await sb.rpc("exec_realize", {
          p_sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
        });
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ tables: data });
      }
      case "read_audit_events": {
        const limit = input?.limit || 10;
        const { data, error } = await sb
          .from("audit_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ events: data });
      }
      default:
        return JSON.stringify({ error: `Outil inconnu: ${name}` });
    }
  } catch (e: any) {
    return JSON.stringify({ error: e.message || "Erreur d'exécution de l'outil" });
  }
}
