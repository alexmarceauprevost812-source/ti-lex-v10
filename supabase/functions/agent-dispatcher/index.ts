// agent-dispatcher — Edge Function ti-lex v10 Centre INDAR
// Dual mode: quick-scan JSON (grid) + streaming SSE (detail panel)
// 5 Superpowers: Extended Thinking, Web Search, Vision, Streaming SSE, Prompt Caching
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { INDAR_GROUND_TRUTH, detecterContradictions } from "../_shared/indar-ground-truth.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key, p_max: max, p_window_seconds: windowSec,
  });
  if (error) return true;
  return data === true;
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnu";
}

// Agent name mapping: uppercase code → lowercase key
const AGENT_ALIASES: Record<string, string> = {
  "NEXUS-AL": "nexus",
  "MARCEAU": "marceau",
  "CIPHER": "cipher",
  "SENTINEL": "sentinel",
  "ORACLE": "oracle",
  "PHANTOM-RED": "phantom",
  "REAPER": "reaper",
};

// ── Quick-scan prompts (short, 2-3 phrases — for the grid) ──
const QUICK_PROMPTS: Record<string, string> = {
  nexus:
    "Tu es NEXUS-AL, l'orchestrateur du Centre INDAR (cybersécurité défensive). Ton pouvoir : la convergence. Tu synthétises une cible de scan en un verdict unifié, clair et priorisé. Réponds en français québécois, 2 à 4 phrases, ton posé et décisif. Termine par un niveau de risque : FAIBLE, MOYEN ou ÉLEVÉ.",
  marceau:
    "Tu es MARCEAU, le gardien de la mémoire d'INDAR. Ton pouvoir : la rétrospective. Tu compares la cible aux schémas de menaces déjà connus et signales les récurrences ou déguisements. Réponds en français québécois, 2 à 3 phrases, ton de vétéran qui a tout vu.",
  cipher:
    "Tu es CIPHER, le briseur de codes d'INDAR. Ton pouvoir : lire l'invisible. Tu détectes clés API exposées, secrets enfouis, tokens et chiffrement faible. Réponds en français québécois, 2 à 3 phrases, précis et technique. Nomme le type de secret si tu en repères un.",
  sentinel:
    "Tu es SENTINEL, la vigie d'INDAR. Ton pouvoir : l'omniprésence. Tu surveilles le périmètre, les points d'entrée et les accès exposés. Réponds en français québécois, 2 à 3 phrases, ton vigilant et factuel.",
  oracle:
    "Tu es ORACLE, le prophète d'INDAR. Ton pouvoir : la prémonition. Tu projettes les chemins d'attaque probables et indiques par où ça frapperait en premier. Réponds en français québécois, 2 à 3 phrases, ton qui anticipe.",
  phantom:
    "Tu es PHANTOM-RED, le fantôme offensif d'INDAR (red team). Ton pouvoir : penser comme l'attaquant. Tu identifies la faille qu'un adversaire viserait en premier et comment. Réponds en français québécois, 2 à 3 phrases, ton offensif mais au service de la défense.",
  reaper:
    "Tu es REAPER, l'analyste malwares d'INDAR. Ton pouvoir : la dissection. Tu identifies les signatures de malwares, les familles de ransomwares et les IoC. Réponds en français québécois, 2 à 3 phrases, ton méthodique et implacable.",
};

// ── Full analysis prompts (detailed — for the detail panel with streaming) ──
const FULL_PROMPTS: Record<string, string> = {
  nexus: `Tu es NEXUS-AL, responsable de la cybersécurité du Centre INDAR ti-lex.
Tu coordonnes tous les agents et supervises les opérations de sécurité.
Analyse les résultats de scan fournis et donne une synthèse opérationnelle complète.
Identifie les risques et recommande un plan d'action.

CALIBRATION — Ne sur-signale PAS :
- RLS est activé sur les 68 tables Supabase (vérifié par audit officiel). Rate limiting et CORS = LOW si RLS actif.
- Loi 25 : mentionne les obligations préventives (art. 3.7, mesures raisonnables). Ne mentionne JAMAIS « 25 M$ » ni « notification CAI » sauf incident de confidentialité confirmé.
- Délais réalistes : CRITIQUE=7j, HAUTE=30j, MOYENNE=90j, FAIBLE=backlog.
- Si aucune finding CRITIQUE ni HAUTE, le verdict est « POSTURE SAINE — améliorations préventives disponibles ».

Réponds en français, de façon structurée, professionnelle et concise.`,

  marceau: `Tu es MARCEAU, architecte sécurité du Centre INDAR ti-lex.
Tu conçois les architectures de sécurité et définis les standards de protection.
Analyse les résultats de scan fournis et identifie les failles architecturales.
Propose des améliorations de l'architecture Zero Trust et du design de sécurité.
Réponds en français, technique mais accessible, avec des recommandations concrètes.`,

  cipher: `Tu es CIPHER, expert GRC et conformité du Centre INDAR ti-lex.
Tu gères la conformité ISO 27001, SOC 2, NIST CSF, GDPR et Loi 25 Québec.
Analyse les résultats de scan fournis sous l'angle réglementaire et conformité.

CALIBRATION LOI 25 :
- Distingue obligations PRÉVENTIVES (art. 3.7) vs obligations en cas d'INCIDENT (art. 3.5).
- Ne mentionne JAMAIS de montant de sanction (25 M$).
- RLS actif sur 68/68 tables = mesure de sécurité raisonnable en place.

Réponds en français, avec référence aux standards applicables.`,

  sentinel: `Tu es SENTINEL, expert en réponse aux incidents du Centre INDAR ti-lex.
Tu détectes, analyses et réponds aux incidents de sécurité en temps réel.
Analyse les résultats de scan fournis pour détecter des signes d'intrusion ou compromission.
Réponds en français, format incident response: Détection → Analyse → Confinement → Remédiation.`,

  oracle: `Tu es ORACLE, expert en sécurité IA et gouvernance algorithmique du Centre INDAR ti-lex.
Tu supervises la sécurité des systèmes IA et la gouvernance des modèles.
Analyse les résultats de scan fournis sous l'angle des risques liés à l'IA.
Réponds en français, avec référence au NIST AI RMF et ISO 42001.`,

  phantom: `Tu es PHANTOM-RED, expert pentest et Red Team du Centre INDAR ti-lex.
Tu simules des scénarios d'attaque conceptuels pour identifier les vulnérabilités défensives.
IMPORTANT: Tu opères UNIQUEMENT en mode simulation — aucune attaque réelle, aucun exploit actif.
Réponds en français, comme un rapport de pentest conceptuel.
Rappelle toujours que toute analyse est à des fins défensives et de simulation uniquement.`,

  reaper: `Tu es REAPER, analyste spécialisé en malwares et ransomwares du Centre INDAR ti-lex.
Tu dissèques les menaces. Ta mission : analyser les malwares, identifier les familles de ransomwares, extraire les IoC, créer des règles YARA.
RÈGLES : Tu aides à DÉFENDRE contre les malwares, jamais à en créer. Tu ne fournis jamais de code malveillant fonctionnel.
Réponds en français, structuré et professionnel.
Format: Identification → Comportement → IoC → Contre-mesures.`,
};

// ── Media capabilities instructions (appended to all agent system prompts) ──
const MEDIA_INSTRUCTION = `

## CAPACITÉS MÉDIA
Quand tu trouves des images pertinentes sur le web, inclus-les dans ta réponse avec ce format exact :
[IMG]https://url-de-image.jpg|Description courte[/IMG]

Quand tu références une vidéo YouTube ou un lien web utile, utilise ce format :
[LINK]https://url-complete|Titre du lien[/LINK]

Le système affichera automatiquement ces médias. N'invente jamais d'URLs — utilise seulement des URLs réelles trouvées via la recherche web.

## GÉNÉRATION DE PAGES HTML
Quand l'utilisateur demande de créer une page web, un rapport visuel, ou un index.html, génère une page HTML complète et autonome (avec CSS inline) dans ce format exact :
[PAGE:Titre de la page]
<!DOCTYPE html>
<html>...page complète...</html>
[/PAGE]

La page sera automatiquement sauvegardée et un lien partageable sera généré. Utilise le design ti-lex : fond #0a0a0a, accent orange #ff7f27, police monospace.`;

function json(obj: unknown, status: number, hdrs: Record<string, string>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...hdrs, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cors = corsHeaders(req);

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  const ip = clientIp(req);
  const allowed = await rateLimit(`dispatch:${ip}`, 30, 60);
  if (!allowed) {
    return json(
      { error: "Trop de requêtes. Réessaie dans une minute." },
      429,
      { ...cors, "Retry-After": "60" },
    );
  }

  // Auth: verify user via JWT
  const authHeader = req.headers.get("Authorization");
  let userId: string | null = null;
  if (authHeader) {
    const userSb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userSb.auth.getUser();
    userId = user?.id ?? null;
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }

  // ── Detect API format ──
  // Package format:  { agent: "CIPHER", scan_target: "..." }
  // Streaming format: { agent_id: "cipher", message: "...", deep_think, web_search, ... }
  const isQuickScan = typeof rawBody.agent === "string" && !rawBody.agent_id;

  if (isQuickScan) {
    // ════════════════════════════════════════════════════════════
    // QUICK SCAN MODE — simple JSON response (for the grid)
    // ════════════════════════════════════════════════════════════
    const code = String(rawBody.agent).toUpperCase();
    const target = String(rawBody.scan_target ?? rawBody.target ?? "").slice(0, 8000);
    const agentKey = AGENT_ALIASES[code];
    const baseQuick = agentKey ? QUICK_PROMPTS[agentKey] : null;
    if (!baseQuick) return json({ error: `Agent inconnu : ${code}` }, 400, cors);
    const system = INDAR_GROUND_TRUTH + "\n\n" + baseQuick;

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 600,
          system,
          messages: [{
            role: "user",
            content: target
              ? `Cible du scan :\n${target}`
              : "Aucune cible fournie — décris en une phrase ce que tu surveillerais.",
          }],
        }),
      });
      const data = await r.json();
      const summary = (data?.content ?? [])
        .map((b: { text?: string }) => b.text || "")
        .join("")
        .trim() || "Aucune réponse générée.";

      if (userId) {
        await supabase
          .from("indar_analyses")
          .upsert({
            user_id: userId,
            agent_id: agentKey,
            analyse: summary,
            scan_count: target ? 1 : 0,
            created_at: new Date().toISOString(),
          })
          .catch(() => {});
      }

      const qViolations = detecterContradictions(summary);
      if (qViolations.length > 0) {
        console.warn(`[INDAR] ${agentKey} quick — contradictions:`, qViolations);
      }

      return json({ agent: code, summary, violations: qViolations }, 200, cors);
    } catch (e) {
      return json({ error: "Échec de l'appel à Claude", detail: String(e) }, 502, cors);
    }
  }

  // ════════════════════════════════════════════════════════════
  // STREAMING MODE — SSE response (for the detail panel)
  // 5 Superpowers: Thinking, Web Search, Vision, Streaming, Caching
  // ════════════════════════════════════════════════════════════
  const body = rawBody as {
    agent_id: string;
    message: string;
    history?: Array<{ role: string; content: string }>;
    user_id?: string;
    scan_context?: string;
    notes_context?: string;
    deep_think?: boolean;
    web_search?: boolean;
    image_base64?: string;
    image_media_type?: string;
  };

  const agentId = body.agent_id;
  const baseSystem = FULL_PROMPTS[agentId];
  if (!baseSystem) {
    return json({ error: "Agent inconnu: " + agentId }, 400, cors);
  }

  // 🔒 SÉCURITÉ : ne JAMAIS faire confiance à un user_id fourni par le client.
  // L'identité vient uniquement du JWT vérifié (Authorization). Sinon un appelant
  // pourrait usurper l'UUID d'un autre et écraser ses lignes indar_analyses (RLS contournée
  // car l'upsert utilise le service-role). On persiste donc seulement si userId vient du JWT.

  const contextParts: string[] = [];
  if (body.scan_context) {
    contextParts.push(`\n\n--- DONNÉES DE SCAN ---\n${body.scan_context}`);
  }
  if (body.notes_context) {
    contextParts.push(`\n\n--- NOTES CERVEAU ---\n${body.notes_context}`);
  }

  // Prompt Caching
  const systemBlocks: Array<{
    type: string;
    text: string;
    cache_control?: { type: string };
  }> = [
    { type: "text", text: INDAR_GROUND_TRUTH, cache_control: { type: "ephemeral" } },
    { type: "text", text: baseSystem + MEDIA_INSTRUCTION },
  ];
  if (contextParts.length > 0) {
    systemBlocks.push({ type: "text", text: contextParts.join("") });
  }

  // Vision — multimodal content
  const lastUserContent: Array<{ type: string; [key: string]: unknown }> = [];
  if (body.image_base64 && body.image_media_type) {
    lastUserContent.push({
      type: "image",
      source: { type: "base64", media_type: body.image_media_type, data: body.image_base64 },
    });
  }
  lastUserContent.push({ type: "text", text: body.message });

  const messages: Array<{ role: string; content: unknown }> = [
    ...(body.history || []).slice(-20).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: body.image_base64 ? lastUserContent : body.message },
  ];

  const anthropicHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_KEY,
    "anthropic-version": "2023-06-01",
  };
  if (body.deep_think) {
    anthropicHeaders["anthropic-beta"] = "interleaved-thinking-2025-05-14";
  }

  const anthropicPayload: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: body.deep_think ? 16000 : 4096,
    system: systemBlocks,
    messages,
    stream: true,
  };
  if (body.deep_think) {
    anthropicPayload.thinking = { type: "enabled", budget_tokens: 8000 };
  }
  if (body.web_search) {
    anthropicPayload.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }

  let aiResponse: Response;
  try {
    aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders,
      body: JSON.stringify(anthropicPayload),
    });
  } catch (e) {
    return json({ error: "AI unreachable", details: String(e) }, 502, cors);
  }

  if (!aiResponse.ok) {
    const errData = await aiResponse.text();
    return json({ error: "AI error", details: errData }, aiResponse.status, cors);
  }

  let fullReplyText = "";
  let webSearchUsed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: "meta", agent: agentId.toUpperCase(), language: "fr" })}\n\n`,
      ));

      try {
        const reader = aiResponse.body!.getReader();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);

              if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
                fullReplyText += event.delta.text;
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: "text", delta: event.delta.text })}\n\n`,
                ));
              }

              if (event.type === "content_block_start" && event.content_block?.type === "tool_use" && event.content_block.name === "web_search") {
                webSearchUsed = true;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "web_search_start" })}\n\n`));
              }

              if (event.type === "content_block_start" && event.content_block?.type === "web_search_tool_result") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "web_search_done" })}\n\n`));
              }

              if (event.type === "message_stop") {
                const violations = detecterContradictions(fullReplyText);
                if (violations.length > 0) {
                  console.warn(`[INDAR] ${agentId} — contradictions:`, violations);
                }
                if (userId && fullReplyText) {
                  await supabase.from("indar_analyses").upsert({
                    user_id: userId,
                    agent_id: agentId,
                    analyse: fullReplyText.slice(0, 10000),
                    scan_count: body.scan_context ? 1 : 0,
                    created_at: new Date().toISOString(),
                  }).catch(() => {});
                }
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: "done", web_search_used: webSearchUsed, deep_think: body.deep_think || false, violations })}\n\n`,
                ));
              }
            } catch { /* skip */ }
          }
        }
      } catch (e) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`,
        ));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
});
