import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

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

  if (req.method !== "POST") return json({ erreur: "POST uniquement" }, 405, cors);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ erreur: "Non authentifié" }, 401, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: erreurAuth } = await supabase.auth.getUser();
  if (erreurAuth || !user) {
    return json({ erreur: "Session invalide" }, 401, cors);
  }

  const cleOpenAI = Deno.env.get("OPENAI_API_KEY");
  if (!cleOpenAI) {
    console.error("[tilex-ia-proxy] OPENAI_API_KEY absente des secrets");
    return json({ erreur: "Service indisponible" }, 500, cors);
  }

  let corps: any;
  try { corps = await req.json(); }
  catch { return json({ erreur: "JSON invalide" }, 400, cors); }

  const messages = corps.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ erreur: "messages requis" }, 400, cors);
  }

  try {
    const reponseIA = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cleOpenAI}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: corps.model || "gpt-4o",
        messages,
        max_tokens: corps.max_tokens || 1000,
      }),
    });

    if (!reponseIA.ok) {
      const detail = await reponseIA.text();
      console.error("[tilex-ia-proxy] Erreur OpenAI", reponseIA.status, detail);
      return json({ erreur: "Erreur du service IA" }, 502, cors);
    }

    const donnees = await reponseIA.json();
    return json({ resultat: donnees.choices?.[0]?.message?.content ?? "" }, 200, cors);
  } catch (e) {
    console.error("[tilex-ia-proxy] Exception", e);
    return json({ erreur: "Erreur interne" }, 500, cors);
  }
});
