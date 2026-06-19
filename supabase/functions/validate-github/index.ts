import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token!);
  if (authError || !user) return json({ error: "Non authentifié" }, 401);

  try {
    // DELETE = disconnect (clear Vault + metadata)
    if (req.method === "DELETE") {
      await supabase.rpc("delete_github_pat", { p_user_id: user.id });

      await supabase
        .from("user_connections")
        .update({
          github_connected: false,
          github_username: null,
          github_pat: null,
          github_avatar_url: null,
          github_connected_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      await supabase
        .from("profiles")
        .update({ github_username: null, github_pat: null })
        .eq("id", user.id);

      return json({ ok: true });
    }

    // POST = validate PAT + store in Vault
    const { pat } = await req.json();
    if (!pat) return json({ error: "PAT manquant" }, 400);

    const githubRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ti-lex-app",
      },
    });

    if (!githubRes.ok) {
      return json({
        valide: false,
        error: "PAT GitHub invalide ou expiré",
      });
    }

    const githubUser = await githubRes.json();

    // Store PAT in Vault (encrypted at rest)
    const { error: vaultErr } = await supabase.rpc("store_github_pat", {
      p_user_id: user.id,
      p_pat: pat,
    });

    if (vaultErr) {
      console.error("Vault store error:", vaultErr);
      return json({ error: "Erreur stockage sécurisé" }, 500);
    }

    // Store metadata (no PAT) in user_connections
    await supabase
      .from("user_connections")
      .upsert(
        {
          user_id: user.id,
          github_connected: true,
          github_username: githubUser.login,
          github_pat: null,
          github_avatar_url: githubUser.avatar_url,
          github_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    // Keep profiles username in sync
    await supabase
      .from("profiles")
      .update({
        github_username: githubUser.login,
        github_pat: null,
      })
      .eq("id", user.id);

    return json({
      valide: true,
      username: githubUser.login,
      avatar_url: githubUser.avatar_url,
      nom: githubUser.name,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
