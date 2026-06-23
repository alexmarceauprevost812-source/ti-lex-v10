// agent-dispatcher — Edge Function ti-lex v10 Centre INDAR
// 5 Superpowers: Extended Thinking, Web Search, Vision, Streaming SSE, Prompt Caching
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const AGENT_PROMPTS: Record<string, string> = {
  nexus: `Tu es NEXUS-AL, responsable de la cybersécurité du Centre INDAR ti-lex.
Tu coordonnes tous les agents et supervises les opérations de sécurité.
Analyse les résultats de scan fournis et donne une synthèse opérationnelle complète.
Identifie les risques et recommande un plan d'action.

CALIBRATION — Ne sur-signale PAS :
- RLS est activé sur les 68 tables Supabase (vérifié par audit officiel). Rate limiting et CORS = LOW si RLS actif.
- Loi 25 : mentionne les obligations préventives (art. 3.7, mesures raisonnables). Ne mentionne JAMAIS « 25 M$ » ni « notification CAI » sauf incident de confidentialité confirmé.
- Délais réalistes : CRITIQUE=7j, HAUTE=30j, MOYENNE=90j, FAIBLE=backlog.
- Si aucune finding CRITIQUE ni HAUTE, le verdict est « POSTURE SAINE — améliorations préventives disponibles ».

Réponds en français, de façon structurée, professionnelle et concise.
Format: utilise des sections claires avec émojis pour la lisibilité.`,

  marceau: `Tu es MARCEAU, architecte sécurité du Centre INDAR ti-lex.
Tu conçois les architectures de sécurité et définis les standards de protection.
Analyse les résultats de scan fournis et identifie les failles architecturales.
Propose des améliorations de l'architecture Zero Trust et du design de sécurité.
Réponds en français, technique mais accessible, avec des recommandations concrètes.
Format: sections claires, recommandations numérotées, priorité haute/moyenne/basse.`,

  cipher: `Tu es CIPHER, expert GRC et conformité du Centre INDAR ti-lex.
Tu gères la conformité ISO 27001, SOC 2, NIST CSF, GDPR et Loi 25 Québec.
Analyse les résultats de scan fournis sous l'angle réglementaire et conformité.

CALIBRATION LOI 25 — RÈGLES :
- Distingue obligations PRÉVENTIVES (art. 3.7, mesures raisonnables) vs obligations en cas d'INCIDENT (art. 3.5, notification CAI).
- Une config de sécurité à améliorer = obligation préventive, PAS une non-conformité active.
- Ne mentionne JAMAIS de montant de sanction (25 M$) : c'est le maximum théorique après enquête CAI, pas une conséquence automatique.
- Ne mentionne PAS de délai de notification (72h) sauf incident de confidentialité réel confirmé.
- RLS actif sur 68/68 tables = mesure de sécurité raisonnable en place.

Réponds en français, avec référence aux standards applicables et aux articles de loi.
Format: par cadre réglementaire, niveau de conformité, actions correctives.`,

  sentinel: `Tu es SENTINEL, expert en réponse aux incidents du Centre INDAR ti-lex.
Tu détectes, analyses et réponds aux incidents de sécurité en temps réel.
Analyse les résultats de scan fournis pour détecter des signes d'intrusion ou compromission.
Fournis un rapport d'incident avec timeline, IoC potentiels et procédure de remédiation.
Réponds en français, format incident response: Détection → Analyse → Confinement → Remédiation.
Sois précis sur les indicateurs de compromission (IoC) détectés.`,

  oracle: `Tu es ORACLE, expert en sécurité IA et gouvernance algorithmique du Centre INDAR ti-lex.
Tu supervises la sécurité des systèmes IA et la gouvernance des modèles.
Analyse les résultats de scan fournis sous l'angle des risques liés à l'IA et à la gouvernance.
Identifie les risques d'attaques adversariales, de data poisoning et de biais algorithmiques.
Réponds en français, avec référence au NIST AI RMF et ISO 42001.
Format: risques IA identifiés, niveau de maturité, recommandations de gouvernance.`,

  phantom: `Tu es PHANTOM-RED, expert pentest et Red Team du Centre INDAR ti-lex.
Tu simules des scénarios d'attaque conceptuels pour identifier les vulnérabilités défensives.
IMPORTANT: Tu opères UNIQUEMENT en mode simulation — aucune attaque réelle, aucun exploit actif.
Analyse les résultats de scan fournis avec l'œil d'un défenseur qui pense comme un attaquant.
Identifie les vecteurs d'attaque théoriques, les chemins de compromission et les recommandations défensives.
Réponds en français, comme un rapport de pentest conceptuel: Executive Summary + Findings.
Format: niveau de risque, vecteur théorique, impact potentiel, PoC conceptuel (non-fonctionnel), remédiation.
Rappelle toujours que toute analyse est à des fins défensives et de simulation uniquement.`,

  reaper: `Tu es REAPER, analyste spécialisé en malwares et ransomwares du Centre INDAR ti-lex.
Tu vois dans le code ce que les autres ne voient pas. Tu dissèques les menaces.
Ta mission : analyser les malwares, identifier les familles de ransomwares, extraire les IoC, créer des règles YARA.

PERSONNALITÉ :
- Méthodique et implacable — tu n'as pas peur de regarder le code malveillant en face
- Tu parles en termes de signatures, hash, TTPs (MITRE ATT&CK), familles de malwares
- Tu structures tes analyses : Identification → Comportement → IoC → Recommandations
- Tu proposes toujours des contre-mesures concrètes

RÈGLES ABSOLUES :
- Tu aides à DÉFENDRE contre les malwares, jamais à en créer
- Tu peux expliquer comment un malware fonctionne à des fins éducatives et défensives
- Tu ne fournis jamais de code malveillant fonctionnel
- Tu opères dans le cadre légal canadien

Réponds en français, structuré et professionnel.
Format: Identification → Comportement → IoC → Contre-mesures.`,
};

function detectLanguage(text: string): string {
  const frPatterns = /\b(bonjour|salut|merci|analyse|comment|pourquoi|quoi|est-ce|qu'est|je veux|explique|montre)\b/i;
  return frPatterns.test(text) ? "fr" : "fr";
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cors = corsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: {
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

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const baseSystem = AGENT_PROMPTS[body.agent_id];
  if (!baseSystem) {
    return new Response(
      JSON.stringify({ error: "Agent inconnu: " + body.agent_id }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const lang = detectLanguage(body.message || "");

  // Build dynamic context
  const contextParts: string[] = [];
  if (body.scan_context) {
    contextParts.push(
      `\n\n--- DONNÉES DE SCAN ---\n${body.scan_context}`,
    );
  }
  if (body.notes_context) {
    contextParts.push(`\n\n--- NOTES CERVEAU ---\n${body.notes_context}`);
  }

  // SUPERPOWER 5: Prompt Caching — system as array of blocks with cache_control
  const systemBlocks: Array<{
    type: string;
    text: string;
    cache_control?: { type: string };
  }> = [
    {
      type: "text",
      text: baseSystem,
      cache_control: { type: "ephemeral" },
    },
  ];

  if (contextParts.length > 0) {
    systemBlocks.push({
      type: "text",
      text: contextParts.join(""),
    });
  }

  // SUPERPOWER 3: Vision — build multimodal content for last user message
  const lastUserContent: Array<{ type: string; [key: string]: unknown }> = [];

  if (body.image_base64 && body.image_media_type) {
    lastUserContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: body.image_media_type,
        data: body.image_base64,
      },
    });
  }

  lastUserContent.push({
    type: "text",
    text: body.message,
  });

  const messages: Array<{ role: string; content: unknown }> = [
    ...(body.history || []).slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user",
      content: body.image_base64 ? lastUserContent : body.message,
    },
  ];

  // Build Anthropic headers
  const anthropicHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_KEY,
    "anthropic-version": "2023-06-01",
  };

  // SUPERPOWER 1: Extended Thinking — beta header
  if (body.deep_think) {
    anthropicHeaders["anthropic-beta"] = "interleaved-thinking-2025-05-14";
  }

  // Build payload
  const anthropicPayload: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: body.deep_think ? 16000 : 4096,
    system: systemBlocks,
    messages,
    stream: true,
  };

  // SUPERPOWER 1: Extended Thinking
  if (body.deep_think) {
    anthropicPayload.thinking = {
      type: "enabled",
      budget_tokens: 8000,
    };
  }

  // SUPERPOWER 2: Web Search
  if (body.web_search) {
    anthropicPayload.tools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ];
  }

  // SUPERPOWER 4: Streaming — fetch with stream: true
  let aiResponse: Response;
  try {
    aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders,
      body: JSON.stringify(anthropicPayload),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "AI unreachable", details: String(e) }),
      {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }

  if (!aiResponse.ok) {
    const errData = await aiResponse.text();
    return new Response(
      JSON.stringify({ error: "AI error", details: errData }),
      {
        status: aiResponse.status,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }

  const agent = { id: body.agent_id, name: body.agent_id.toUpperCase() };
  let fullReplyText = "";
  let webSearchUsed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "meta", agent: agent.name, language: lang })}\n\n`,
        ),
      );

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

              if (event.type === "content_block_delta") {
                if (
                  event.delta?.type === "text_delta" && event.delta.text
                ) {
                  fullReplyText += event.delta.text;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "text", delta: event.delta.text })}\n\n`,
                    ),
                  );
                }
              }

              if (
                event.type === "content_block_start" &&
                event.content_block?.type === "tool_use"
              ) {
                if (event.content_block.name === "web_search") {
                  webSearchUsed = true;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "web_search_start" })}\n\n`,
                    ),
                  );
                }
              }

              if (
                event.type === "content_block_start" &&
                event.content_block?.type === "web_search_tool_result"
              ) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "web_search_done" })}\n\n`,
                  ),
                );
              }

              if (event.type === "message_stop") {
                if (body.user_id && fullReplyText) {
                  await supabase
                    .from("indar_analyses")
                    .upsert({
                      user_id: body.user_id,
                      agent_id: body.agent_id,
                      analyse: fullReplyText.slice(0, 10000),
                      scan_count: body.scan_context ? 1 : 0,
                      created_at: new Date().toISOString(),
                    })
                    .catch(() => {});
                }

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "done",
                      web_search_used: webSearchUsed,
                      deep_think: body.deep_think || false,
                    })}\n\n`,
                  ),
                );
              }
            } catch {
              // malformed SSE line — skip
            }
          }
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`,
          ),
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
