// ti-lex-AL — Proxy IA (Anthropic chat + OpenAI images)
// Garde les clés API côté serveur. Relaie le SSE Anthropic tel quel.

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*", // ⚠ en prod : ton domaine exact
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const kind = body.kind || "chat";

    if (kind === "image") {
      if (!OPENAI_KEY) return json({ error: "OPENAI_API_KEY non configurée" }, 500);
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: body.prompt,
          n: 1,
          size: body.size || "1024x1024",
        }),
      });
      const data = await r.json();
      if (!r.ok) return json({ error: data.error?.message || "Erreur image" }, r.status);
      return json({ b64: data.data?.[0]?.b64_json }, 200);
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model || "claude-opus-4-8",
        max_tokens: body.max_tokens || 4096,
        system: body.system,
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
      },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
