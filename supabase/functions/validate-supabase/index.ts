import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

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
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { supabase_url, supabase_anon_key } = await req.json();
    if (!supabase_url || !supabase_anon_key) {
      return new Response(
        JSON.stringify({ error: "URL et clé requises" }),
        {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
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
          { headers: { ...CORS, "Content-Type": "application/json" } }
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
        { headers: { ...CORS, "Content-Type": "application/json" } }
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
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
