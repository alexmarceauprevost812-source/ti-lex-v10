import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let userId = "anonymous";

    if (token) {
      try {
        const sb = createClient(SUPABASE_URL, SERVICE_KEY);
        const { data: userData } = await sb.auth.getUser(token);
        if (userData?.user?.id) userId = userData.user.id;
      } catch (_) {}
    }

    const rl = await checkRateLimit(getIdentifier(req, userId !== "anonymous" ? userId : null), { prefix: "marceau-reflection", max: 10, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl, corsHeaders);

    let body: any;
    try { body = await req.json(); }
    catch { return json({ error: "JSON invalide" }, 400); }

    const { systemPrompt, messages } = body;
    if (!systemPrompt || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: "systemPrompt et messages requis" }, 400);
    }

    if (!ANTHROPIC_KEY) {
      return json({ error: "ANTHROPIC_API_KEY non configurée" }, 500);
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        stream: true,
        system: systemPrompt,
        messages,
      }),
    });

    if (!r.ok) {
      try {
        const errData = await r.json();
        return json({ error: errData.error?.message || `Erreur Claude (${r.status})` }, r.status);
      } catch {
        return json({ error: `Erreur du modèle (${r.status})` }, r.status);
      }
    }

    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const body2 = new ReadableStream({
      async start(ctrl) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ text: evt.delta.text })}\n\n`));
              }
            } catch {}
          }
        }
        ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
        ctrl.close();
      },
    });

    return new Response(body2, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("marceau-reflection error:", error.message);
    return json({ error: error.message || "Erreur serveur" }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
