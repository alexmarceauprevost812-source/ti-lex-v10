// ti-lex-AL — Proxy IA securise (Anthropic chat + OpenAI images)
// Cles API cote serveur. Valide le body, limite l'usage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIMITS = { chat: 200, image: 20 };
const MAX_PROMPT_LEN = 4000;
const MAX_TOKENS_CAP = 8192;
const MAX_MESSAGES = 60;
const MAX_MSG_CHARS = 200_000;
const ALLOWED_MODELS = new Set([
  "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001",
]);
const ALLOWED_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024", "auto"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Methode non autorisee" }, 405);

  try {
    // ---- 1. Auth optionnelle ----
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

    // ---- 2. Parse + valide le body ----
    let body: any;
    try { body = await req.json(); }
    catch { return json({ error: "JSON invalide" }, 400); }

    const kind = body.kind === "image" ? "image" : "chat";

    // ---- 3. Rate limit (optionnel) ----
    if (userId !== "anonymous") {
      try {
        const sb = createClient(SUPABASE_URL, SERVICE_KEY);
        const col = kind === "image" ? "image_count" : "chat_count";
        const { data: usage } = await sb
          .from("ai_usage")
          .select(col)
          .eq("user_id", userId)
          .eq("day", new Date().toISOString().slice(0, 10))
          .maybeSingle();

        const current = (usage as any)?.[col] ?? 0;
        if (current >= LIMITS[kind]) {
          return json({ error: `Limite quotidienne atteinte (${LIMITS[kind]} ${kind})` }, 429);
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
      if (!OPENAI_KEY) return json({ error: "OPENAI_API_KEY non configuree" }, 500);

      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return json({ error: "Prompt vide" }, 400);
      if (prompt.length > MAX_PROMPT_LEN)
        return json({ error: `Prompt trop long (max ${MAX_PROMPT_LEN})` }, 400);

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
        return json({ error: msg }, r.status);
      }
      return json({ b64: data.data?.[0]?.b64_json }, 200);
    }

    // ===================== CHAT =====================
    const model = ALLOWED_MODELS.has(body.model) ? body.model : "claude-opus-4-8";

    if (!Array.isArray(body.messages) || body.messages.length === 0)
      return json({ error: "messages requis" }, 400);
    if (body.messages.length > MAX_MESSAGES)
      return json({ error: "Historique trop long" }, 400);

    const totalChars = JSON.stringify(body.messages).length;
    if (totalChars > MAX_MSG_CHARS)
      return json({ error: "Contenu trop volumineux" }, 400);

    const maxTokens = Math.min(Number(body.max_tokens) || 4096, MAX_TOKENS_CAP);

    const userKey = req.headers.get("x-anthropic-key");
    const apiKey = (userKey && userKey.startsWith("sk-ant-")) ? userKey : ANTHROPIC_KEY;
    if (!apiKey) return json({ error: "Aucune cle API configuree. Ajoute ta cle Anthropic dans les Parametres ou en secret Supabase." }, 500);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
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
    if (!r.ok) {
      try {
        const errData = await r.json();
        return json({ error: errData.error?.message || `Erreur Claude (${r.status})` }, r.status);
      } catch {
        return json({ error: `Erreur du modele (${r.status})` }, r.status);
      }
    }

    return new Response(r.body, {
      headers: {
        ...CORS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return json({ error: "Erreur serveur" }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
