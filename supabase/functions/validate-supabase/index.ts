import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const mainSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await mainSupabase.auth.getUser(token!);
    if (authError || !user) return json({ error: "Non authentifié" }, 401);

    const { supabase_url, supabase_anon_key } = await req.json();
    if (!supabase_url || !supabase_anon_key) {
      return json({ error: "URL et clé requises" }, 400);
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
        return json({ valide: false, error: "Credentials Supabase invalides" });
      }

      projectName = projectId
        ? `Projet ${projectId.slice(0, 8)}...`
        : "Projet Supabase";
    } catch {
      return json({ valide: false, error: "URL Supabase invalide ou inaccessible" });
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
        { onConflict: "user_id" },
      );

    if (dbError) throw dbError;

    return json({
      valide: true,
      project_id: projectId,
      project_name: projectName,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
