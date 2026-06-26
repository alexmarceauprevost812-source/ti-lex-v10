// ============================================================================
// supabase/functions/tilex-admin/index.ts
// Lecture privilégiée du journal d'intrusions — ti-lex, Produit du Québec
//
// SÉCURITÉ : seul un utilisateur dont l'ID est dans TILEX_ADMIN_IDS peut lire.
//   - getUser() obligatoire
//   - ID vérifié contre l'allowlist d'admins
//   - lecture via service_role (la table est verrouillée au public)
//
// Déploiement :
//   supabase functions deploy tilex-admin
//   supabase secrets set TILEX_ADMIN_IDS=<ton-uuid-auth>[,autre-uuid...]
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("TILEX_ALLOWED_ORIGINS") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const ADMIN_IDS = (Deno.env.get("TILEX_ADMIN_IDS") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonRep(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const cors = corsHeadersFor(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonRep({ error: "Méthode non permise." }, 405, cors);

  try {
    // ---- 1. Authentification ----------------------------------------------
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonRep({ error: "Non authentifié." }, 401, cors);

    // ---- 2. Vérification admin (allowlist d'IDs) --------------------------
    if (ADMIN_IDS.length === 0 || ADMIN_IDS.indexOf(user.id) === -1) {
      return jsonRep({ error: "Accès refusé." }, 403, cors);
    }

    // ---- 3. Lecture du journal via service_role ---------------------------
    const body = await req.json().catch(() => ({}));
    const limite = Math.min(Math.max(Number(body.limite) || 200, 1), 1000);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data, error } = await admin
      .from("tilex_intrusions")
      .select("id, raison, hote, chemin, canary, ua, ip, lieu, appareil, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limite);

    if (error) return jsonRep({ error: "Lecture échouée." }, 500, cors);

    return jsonRep({ data: data ?? [] }, 200, cors);
  } catch (e) {
    return jsonRep(
      { error: "Exception serveur : " + (e instanceof Error ? e.message : "inconnue") },
      500,
      cors,
    );
  }
});
