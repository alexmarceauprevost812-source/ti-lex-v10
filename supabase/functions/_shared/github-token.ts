// _shared/github-token.ts
// Jeton GitHub d'un usager : le trouve, le rafraîchit si nécessaire, le renvoie.
//
// Deux sources, dans cet ordre :
//   1. github_oauth_tokens — la connexion OAuth (GitHub App). Le jeton dure 8 h,
//      on le rafraîchit tout seul 5 minutes d'avance avec le refresh_token.
//   2. user_connections.github_access_token — l'ancien PAT collé à la main.
//      Gardé comme porte de secours le temps que tout le monde bascule.
//
// L'appelant (github-proxy, etc.) a jamais à savoir laquelle des deux a servi.

const CLIENT_ID     = Deno.env.get("GITHUB_OAUTH_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET") || "";
// On rafraîchit d'avance : un jeton qui expire pendant l'appel, c'est un 401
// pour rien.
const MARGE_MS = 5 * 60 * 1000;

export type JetonGitHub = { token: string; source: "oauth" | "pat" };

/** Échange le refresh_token contre un jeton neuf et le range. null si ça marche pas. */
async function rafraichir(
  sb: any,
  userId: string,
  refreshToken: string | null,
): Promise<string | null> {
  if (!refreshToken || !CLIENT_ID || !CLIENT_SECRET) return null;
  try {
    const r = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const d = await r.json();
    // GitHub répond 200 avec {error:"..."} quand le refresh est mort.
    if (!r.ok || d.error || !d.access_token) {
      console.log("[github-token] rafraîchissement refusé:", d.error || r.status);
      return null;
    }
    const maintenant = Date.now();
    await sb.from("github_oauth_tokens").update({
      access_token: d.access_token,
      refresh_token: d.refresh_token ?? refreshToken,
      expires_at: d.expires_in
        ? new Date(maintenant + Number(d.expires_in) * 1000).toISOString()
        : null,
      refresh_expires_at: d.refresh_token_expires_in
        ? new Date(maintenant + Number(d.refresh_token_expires_in) * 1000).toISOString()
        : null,
      updated_at: new Date(maintenant).toISOString(),
    }).eq("user_id", userId);
    return d.access_token as string;
  } catch (e) {
    console.log("[github-token] rafraîchissement planté:", (e as Error).message);
    return null;
  }
}

/** Renvoie un jeton GitHub valide pour cet usager, ou null s'il en a pas. */
export async function obtenirJetonGitHub(
  sb: any,
  userId: string,
): Promise<JetonGitHub | null> {
  const { data } = await sb
    .from("github_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.access_token) {
    // Pas de date d'expiration = jeton qui expire pas (OAuth App classique).
    const expire = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    if (!expire || expire - Date.now() > MARGE_MS) {
      return { token: data.access_token, source: "oauth" };
    }
    const neuf = await rafraichir(sb, userId, data.refresh_token);
    if (neuf) return { token: neuf, source: "oauth" };
    // Rafraîchissement raté → on essaie le PAT avant d'abandonner.
  }

  const { data: ancien } = await sb
    .from("user_connections")
    .select("github_access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (ancien?.github_access_token) {
    return { token: ancien.github_access_token, source: "pat" };
  }
  return null;
}
