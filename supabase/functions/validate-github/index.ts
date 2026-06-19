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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token!);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { pat } = await req.json();
    if (!pat) {
      return new Response(JSON.stringify({ error: "PAT manquant" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const githubRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ti-lex-app",
      },
    });

    if (!githubRes.ok) {
      return new Response(
        JSON.stringify({ valide: false, error: "PAT GitHub invalide ou expiré" }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const githubUser = await githubRes.json();

    const { error: dbError } = await supabase
      .from("user_connections")
      .upsert(
        {
          user_id: user.id,
          github_connected: true,
          github_username: githubUser.login,
          github_pat: pat,
          github_avatar_url: githubUser.avatar_url,
          github_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (dbError) throw dbError;

    return new Response(
      JSON.stringify({
        valide: true,
        username: githubUser.login,
        avatar_url: githubUser.avatar_url,
        nom: githubUser.name,
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
