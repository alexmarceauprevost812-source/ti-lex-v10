// ============================================================
// supabase/functions/tilex-agent — Agent générique (Claude)
// ti-lex-AL v10. {system, message} -> {texte}. Autonome (CORS inline).
// Sert de backend aux agents du moteur multi-agents (codeur/réviseur/…).
// ============================================================

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const h = { ...cors(req), "Content-Type": "application/json" };
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erreur: "POST seulement" }), { status: 405, headers: h });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const system = typeof body.system === "string" ? body.system : "Tu es un agent utile.";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const maxTokens = Math.min(Math.max(parseInt(body.max_tokens) || 2000, 200), 4000);
    if (!message) {
      return new Response(JSON.stringify({ texte: "" }), { headers: h });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ erreur: "ANTHROPIC_API_KEY non configuree" }), { status: 500, headers: h });
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: message.slice(0, 8000) }],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      return new Response(JSON.stringify({ erreur: "Anthropic " + aiRes.status, detail: t.slice(0, 200) }), { status: 502, headers: h });
    }

    const ai = await aiRes.json();
    const texte = (ai.content ?? []).map((b: { text?: string }) => b.text ?? "").join("").trim();
    return new Response(JSON.stringify({ texte }), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ erreur: String(e) }), { status: 500, headers: h });
  }
});
