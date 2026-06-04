// ti-lex-AL — Proxy IA sécurisé (JWT + validation + rate limit)
// Garde les clés API côté serveur. Relaie le SSE Anthropic tel quel.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_MODELS = [
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];
const MAX_TOKENS_CEILING = 16384;
const DAILY_CHAT_LIMIT = 200;
const DAILY_IMAGE_LIMIT = 20;

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function extractUserId(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(atob(payloadB64));
    if (payload.sub) return payload.sub;
    // Anon key fallback: use role as identifier for shared rate limit
    if (payload.role === "anon") return "anon-shared";
    return null;
  } catch {
    return null;
  }
}

async function checkAndBumpQuota(
  userId: string,
  kind: "chat" | "image"
): Promise<{ allowed: boolean; remaining: number }> {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const col = kind === "image" ? "image_count" : "chat_count";
  const limit = kind === "image" ? DAILY_IMAGE_LIMIT : DAILY_CHAT_LIMIT;

  const { data } = await sb
    .from("ai_usage")
    .select(col)
    .eq("user_id", userId)
    .eq("day", new Date().toISOString().slice(0, 10))
    .maybeSingle();

  const current = data?.[col] ?? 0;
  if (current >= limit) return { allowed: false, remaining: 0 };

  await sb.from("ai_usage").upsert(
    {
      user_id: userId,
      day: new Date().toISOString().slice(0, 10),
      [col]: current + 1,
    },
    { onConflict: "user_id,day" }
  );

  return { allowed: true, remaining: limit - current - 1 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // JWT — extraire l'utilisateur
  const userId = extractUserId(req);
  if (!userId) return json({ error: "Authentification requise" }, 401);

  try {
    const body = await req.json();
    const kind: "chat" | "image" = body.kind === "image" ? "image" : "chat";

    // Rate limit
    const quota = await checkAndBumpQuota(userId, kind);
    if (!quota.allowed) {
      return json(
        {
          error: `Quota journalier atteint (${kind === "image" ? DAILY_IMAGE_LIMIT : DAILY_CHAT_LIMIT}/${kind === "image" ? "images" : "messages"}). Réessaie demain.`,
        },
        429
      );
    }

    if (kind === "image") {
      if (!OPENAI_KEY)
        return json({ error: "OPENAI_API_KEY non configurée" }, 500);
      const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 4000) : "";
      if (!prompt) return json({ error: "prompt requis" }, 400);
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          n: 1,
          size: body.size === "1792x1024" ? "1792x1024" : "1024x1024",
        }),
      });
      const data = await r.json();
      if (!r.ok)
        return json(
          { error: data.error?.message || "Erreur image" },
          r.status
        );
      return json({ b64: data.data?.[0]?.b64_json, remaining: quota.remaining }, 200);
    }

    // Chat — validation
    const model = ALLOWED_MODELS.includes(body.model)
      ? body.model
      : "claude-sonnet-4-6";
    const maxTokens = Math.min(
      Math.max(parseInt(body.max_tokens) || 4096, 1),
      MAX_TOKENS_CEILING
    );
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: "messages requis (array non vide)" }, 400);
    }
    if (body.messages.length > 100) {
      return json({ error: "Trop de messages (max 100)" }, 400);
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: typeof body.system === "string" ? body.system : undefined,
        stream: true,
        messages: body.messages,
        ...(body.tools ? { tools: body.tools } : {}),
      }),
    });
    if (!r.ok) return json({ error: await r.text() }, r.status);

    return new Response(r.body, {
      headers: {
        ...CORS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Remaining": String(quota.remaining),
      },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
