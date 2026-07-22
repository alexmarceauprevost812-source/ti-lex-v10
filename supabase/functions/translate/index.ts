// ============================================================
// supabase/functions/translate — Traduction terrain via Claude
// ti-lex-AL v10. Texte -> Texte (Anthropic). Autonome (CORS inline).
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
    const texte = typeof body.texte === "string" ? body.texte.trim() : "";
    const source = typeof body.source === "string" ? body.source : "français québécois";
    const cible = typeof body.cible === "string" ? body.cible : "anglais";

    if (!texte) {
      return new Response(JSON.stringify({ traduction: "" }), { headers: h });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ erreur: "ANTHROPIC_API_KEY non configurée" }), { status: 500, headers: h });
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system:
          "Tu es un traducteur professionnel. Traduis fidèlement le texte de l'utilisateur " +
          "de " + source + " vers " + cible + ". Garde le sens, le ton et le registre. " +
          "Réponds UNIQUEMENT avec la traduction, sans guillemets, sans explication, sans préambule.",
        messages: [{ role: "user", content: texte.slice(0, 3000) }],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      return new Response(JSON.stringify({ erreur: "Anthropic " + aiRes.status, detail: t.slice(0, 200) }), { status: 502, headers: h });
    }

    const ai = await aiRes.json();
    const traduction = (ai.content ?? [])
      .map((b: { text?: string }) => b.text ?? "")
      .join("")
      .trim();

    return new Response(JSON.stringify({ traduction }), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ erreur: String(e) }), { status: 500, headers: h });
  }
});
