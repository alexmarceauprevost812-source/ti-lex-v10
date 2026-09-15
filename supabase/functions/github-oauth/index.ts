// github-oauth — connexion GitHub sans jamais coller de token.
// =====================================================================
// L'usager clique « Connecter GitHub », atterrit sur github.com, autorise,
// pis revient connecté. Le secret de l'app sort jamais du serveur, pis le
// jeton se rend jamais dans le navigateur (il vit dans github_oauth_tokens,
// une table qu'aucune policy RLS rend lisible au client).
//
// Le va-et-vient :
//   1. front  → {action:"start"}            → on répond une URL github.com
//   2. GitHub → /github-retour.html?code&state
//   3. front  → {action:"callback",code,state} → on échange le code contre
//              un jeton (avec le secret) pis on le range
//
// Le « state » est à usage unique, expire en 10 minutes, pis est attaché à
// l'usager : un code volé tout seul sert à rien.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CLIENT_ID     = Deno.env.get("GITHUB_OAUTH_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET") || "";
// Doit matcher EXACTEMENT l'URL de retour enregistrée sur github.com.
const REDIRECT_URI  = Deno.env.get("GITHUB_OAUTH_REDIRECT_URI") || "";

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

/** Un state imprévisible (256 bits), en hex. */
function nouveauState(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ghUser(token: string) {
  const r = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ti-lex-github-oauth",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!r.ok) return null;
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await sb.auth.getUser(jwt);
  if (!user) return json({ error: "Non authentifié" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "Body JSON invalide" }, 400); }
  const action = String(body.action || "");

  // ── Étape 1 : fabriquer l'URL d'autorisation ──
  if (action === "start") {
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return json({
        error: "OAuth GitHub pas configuré",
        details: "Il manque GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET ou GITHUB_OAUTH_REDIRECT_URI dans les secrets Supabase.",
      }, 500);
    }
    // Ménage des states périmés — pas besoin de cron pour si peu.
    await sb.from("github_oauth_states").delete().lt("expires_at", new Date().toISOString());

    const state = nouveauState();
    const { error } = await sb.from("github_oauth_states").insert({
      state,
      user_id: user.id,
      redirect_to: typeof body.redirect_to === "string" ? body.redirect_to : null,
    });
    if (error) return json({ error: "Impossible de démarrer la connexion: " + error.message }, 500);

    const url = "https://github.com/login/oauth/authorize"
      + `?client_id=${encodeURIComponent(CLIENT_ID)}`
      + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
      + `&state=${encodeURIComponent(state)}`;
    return json({ url });
  }

  // ── Étape 3 : échanger le code contre un jeton ──
  if (action === "callback") {
    const code  = String(body.code || "");
    const state = String(body.state || "");
    if (!code || !state) return json({ error: "code + state requis" }, 400);

    const { data: st } = await sb
      .from("github_oauth_states")
      .select("user_id, expires_at, redirect_to")
      .eq("state", state)
      .maybeSingle();

    // Usage unique : on le brûle avant même de valider, pour qu'un rejeu rate.
    await sb.from("github_oauth_states").delete().eq("state", state);

    if (!st) return json({ error: "State inconnu ou déjà utilisé" }, 400);
    if (st.user_id !== user.id) return json({ error: "State pas à toi" }, 403);
    if (new Date(st.expires_at).getTime() < Date.now()) {
      return json({ error: "Connexion expirée — recommence" }, 400);
    }

    const r = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const d = await r.json();
    // GitHub répond 200 avec {error:"bad_verification_code"} quand ça marche pas.
    if (!r.ok || d.error || !d.access_token) {
      return json({ error: "GitHub a refusé l'échange: " + (d.error_description || d.error || r.status) }, 400);
    }

    const ghu = await ghUser(d.access_token);
    if (!ghu) return json({ error: "Jeton obtenu mais GitHub refuse /user" }, 502);

    const maintenant = Date.now();
    const { error: upErr } = await sb.from("github_oauth_tokens").upsert({
      user_id: user.id,
      access_token: d.access_token,
      refresh_token: d.refresh_token ?? null,
      expires_at: d.expires_in
        ? new Date(maintenant + Number(d.expires_in) * 1000).toISOString()
        : null,
      refresh_expires_at: d.refresh_token_expires_in
        ? new Date(maintenant + Number(d.refresh_token_expires_in) * 1000).toISOString()
        : null,
      scope: d.scope ?? null,
      github_login: ghu.login,
      github_user_id: ghu.id,
      installation_id: body.installation_id ? Number(body.installation_id) : null,
      updated_at: new Date(maintenant).toISOString(),
    }, { onConflict: "user_id" });
    if (upErr) return json({ error: "Erreur sauvegarde du jeton: " + upErr.message }, 500);

    // user_connections garde juste l'affichage (pas de secret) — c'est ce que
    // pro.html lit déjà pour montrer « GitHub connecté ✓ ».
    await sb.from("user_connections").upsert({
      user_id: user.id,
      github_connected: true,
      github_username: ghu.login,
      github_avatar_url: ghu.avatar_url,
      github_connected_at: new Date(maintenant).toISOString(),
      updated_at: new Date(maintenant).toISOString(),
    }, { onConflict: "user_id" });
    await sb.from("profiles").update({ github_username: ghu.login }).eq("id", user.id);

    return json({
      ok: true,
      username: ghu.login,
      avatar_url: ghu.avatar_url,
      redirect_to: st.redirect_to,
      expire_le: d.expires_in ? new Date(maintenant + Number(d.expires_in) * 1000).toISOString() : null,
    });
  }

  // ── État de la connexion (jamais le jeton lui-même) ──
  if (action === "status") {
    const { data: tok } = await sb
      .from("github_oauth_tokens")
      .select("github_login, expires_at, installation_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const { data: uc } = await sb
      .from("user_connections")
      .select("github_connected, github_username, github_avatar_url, github_access_token")
      .eq("user_id", user.id)
      .maybeSingle();
    return json({
      connected: !!tok?.github_login || !!uc?.github_access_token,
      source: tok?.github_login ? "oauth" : (uc?.github_access_token ? "pat" : null),
      username: tok?.github_login || uc?.github_username || null,
      avatar_url: uc?.github_avatar_url || null,
      expire_le: tok?.expires_at || null,
      installation_id: tok?.installation_id || null,
    });
  }

  // ── Déconnexion : on révoque chez GitHub AVANT d'oublier de notre bord ──
  if (action === "disconnect") {
    const { data: tok } = await sb
      .from("github_oauth_tokens")
      .select("access_token")
      .eq("user_id", user.id)
      .maybeSingle();
    if (tok?.access_token && CLIENT_ID && CLIENT_SECRET) {
      try {
        await fetch(`https://api.github.com/applications/${CLIENT_ID}/token`, {
          method: "DELETE",
          headers: {
            Authorization: "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "ti-lex-github-oauth",
          },
          body: JSON.stringify({ access_token: tok.access_token }),
        });
      } catch (e) {
        // Pas bloquant : on efface pareil de notre bord.
        console.log("[github-oauth] révocation GitHub ratée:", (e as Error).message);
      }
    }
    await sb.from("github_oauth_tokens").delete().eq("user_id", user.id);
    await sb.from("user_connections").update({
      github_connected: false,
      github_username: null,
      github_avatar_url: null,
      github_connected_at: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    await sb.from("profiles").update({ github_username: null }).eq("id", user.id);
    return json({ ok: true });
  }

  return json({ error: `Action inconnue: ${action}`, attendu: ["start", "callback", "status", "disconnect"] }, 400);
});
