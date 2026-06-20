import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cors = corsHeaders(req);

  try {
    const mainSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await mainSupabase.auth.getUser(token!);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const rl = await checkRateLimit(getIdentifier(req, user.id), { prefix: "validate-supabase", max: 5, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl, cors);

    const { supabase_url, supabase_anon_key } = await req.json();
    if (!supabase_url || !supabase_anon_key) {
      return new Response(
        JSON.stringify({ error: "URL et clé requises" }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    let projectId: string | null = null;
    let projectName: string | null = null;

    try {
      const match = supabase_url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
      if (match) projectId = match[1];

      const testRes = await fetch(`${supabase_url}/rest/v1/`, {
        headers: {
          apikey: supabase_anon_key,
          Authorization: `Bearer ${supabase_anon_key}`,
        },
      });

      if (!testRes.ok && testRes.status !== 200 && testRes.status !== 404) {
        return new Response(
          JSON.stringify({
            valide: false,
            error: "Credentials Supabase invalides",
          }),
          { headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      projectName = projectId
        ? `Projet ${projectId.slice(0, 8)}...`
        : "Projet Supabase";
    } catch {
      return new Response(
        JSON.stringify({
          valide: false,
          error: "URL Supabase invalide ou inaccessible",
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const { error: dbError } = await mainSupabase
      .from("user_connections")
      .upsert(
        {
          user_id: user.id,
          supabase_connected: true,
          supabase_url,
          supabase_anon_key,
          supabase_project_id: projectId,
          supabase_project_name: projectName,
          supabase_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (dbError) throw dbError;

    return new Response(
      JSON.stringify({
        valide: true,
        project_id: projectId,
        project_name: projectName,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
