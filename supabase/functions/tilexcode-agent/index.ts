import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const MODEL = Deno.env.get("TILEX_MODEL") || "claude-sonnet-4-6";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cors = corsHeaders(req);

  try {
    // ---- 1. Authentification de l'utilisateur (Supabase Auth) --------------
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Non authentifié. Connecte-toi d'abord." }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ---- 2. Lecture du corps de la requête ---------------------------------
    const body = await req.json().catch(() => ({}));
    const agentId: string = body.agent_id || "";
    const systemPrompt: string = body.system_prompt || "";
    const input: string = body.input || "";
    const context: string = body.context || "";

    if (!agentId || !systemPrompt) {
      return new Response(
        JSON.stringify({ error: "agent_id et system_prompt sont requis." }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ---- 3. Construction du message utilisateur ----------------------------
    const messageUtilisateur =
      (context ? "CONTEXTE :\n" + context + "\n\n" : "") +
      "DEMANDE :\n" + input;

    // ---- 4. Appel à l'API LLM (Anthropic) ----------------------------------
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Secret ANTHROPIC_API_KEY manquant. Fais `supabase secrets set`." }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const llmRep = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: messageUtilisateur }],
      }),
    });

    if (!llmRep.ok) {
      const t = await llmRep.text();
      return new Response(
        JSON.stringify({ error: "LLM erreur " + llmRep.status + " : " + t }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const llmData = await llmRep.json();
    const sortie =
      (llmData?.content || [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n") || "";

    // ---- 5. (Optionnel) Journalisation de l'analyse dans Supabase ----------
    // On réutilise la table indar_analyses (agent_id text, analyse text).
    // Décommente si tu veux historiser chaque passage d'agent.
    /*
    await supabase.from("indar_analyses").insert({
      user_id: user.id,
      agent_id: agentId,
      analyse: sortie,
    });
    */

    // ---- 6. Réponse --------------------------------------------------------
    return new Response(
      JSON.stringify({ agent_id: agentId, output: sortie }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Exception serveur : " + (e instanceof Error ? e.message : String(e)) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
