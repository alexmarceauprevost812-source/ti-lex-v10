import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };
const rlClient = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnu";
}
async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const { data, error } = await rlClient.rpc("check_rate_limit", {
      p_key: key, p_max: max, p_window_seconds: windowSec,
    });
    if (error) return true;
    return data === true;
  } catch { return true; }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non supportée" }), { status: 405, headers: JSON_HEADERS });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: "Configuration manquante" }), { status: 500, headers: JSON_HEADERS });
    }
    const body = await req.json();
    const { email, password } = body;
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email et password requis" }), { status: 400, headers: JSON_HEADERS });
    }
    const ip = clientIp(req);
    const okIp = await rateLimit(`signin:ip:${ip}`, 10, 60);
    const okEmail = await rateLimit(`signin:email:${String(email).toLowerCase()}`, 5, 60);
    if (!okIp || !okEmail) {
      return new Response(JSON.stringify({ error: "Trop de tentatives", message: "Réessaie dans une minute." }),
        { status: 429, headers: { ...JSON_HEADERS, "Retry-After": "60" } });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return new Response(JSON.stringify({ error: "Erreur connexion", message: error.message }), { status: 401, headers: JSON_HEADERS });
    }
    if (!data.session) {
      return new Response(JSON.stringify({ error: "Pas de session", message: "Aucune session n'a été créée" }), { status: 401, headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({
      success: true,
      user: { id: data.user?.id, email: data.user?.email },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      },
    }), { status: 200, headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Erreur serveur", message: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: JSON_HEADERS });
  }
});
