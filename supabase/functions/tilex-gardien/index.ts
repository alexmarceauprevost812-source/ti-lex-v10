// ============================================================================
// supabase/functions/tilex-gardien/index.ts
// Gardien de lecture (gateway honeypot) — ti-lex, Produit du Québec
//
// DÉFENSIF ET LÉGAL :
//   - Lecture autorisée (utilisateur authentifié, non abusif) → vraies données.
//   - Lecture suspecte / non autorisée → FAUSSES données (leurre) + log.
//   - Reçoit aussi les signalements d'intrusion du front (event = "report").
// Aucun code n'attaque le lecteur : on sert du faux et on journalise, point.
//
// Déploiement :
//   supabase functions deploy tilex-gardien
//   (SUPABASE_SERVICE_ROLE_KEY est fourni automatiquement au runtime)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("TILEX_ALLOWED_ORIGINS") || "")
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

// Client admin (service_role) : sert à journaliser les intrus anonymes et à
// lire le jeu de données leurre. JAMAIS exposé au client.
function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function logIntrusion(payload: Record<string, unknown>) {
  try {
    await admin().from("tilex_intrusions").insert({
      raison: String(payload.raison ?? "inconnue").slice(0, 200),
      hote: String(payload.hote ?? "").slice(0, 200),
      chemin: String(payload.chemin ?? "").slice(0, 300),
      canary: String(payload.canary ?? "").slice(0, 120),
      ua: String(payload.ua ?? "").slice(0, 400),
    });
  } catch (_e) { /* le log ne doit jamais casser la réponse */ }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const cors = corsHeadersFor(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonRep({ error: "Méthode non permise." }, 405, cors);

  try {
    const body = await req.json().catch(() => ({}));

    // ---- Mode 1 : signalement d'intrusion venant du front -----------------
    if (body.event === "report") {
      await logIntrusion(body);
      return new Response(null, { status: 204, headers: cors });
    }

    // ---- Mode 2 : gateway de lecture --------------------------------------
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();

    // Pas d'utilisateur valide → on sert le LEURRE et on journalise.
    if (!user) {
      await logIntrusion({
        raison: "lecture-non-authentifiee",
        chemin: String(body.ressource ?? ""),
        ua: req.headers.get("User-Agent") ?? "",
      });
      const { data: faux } = await admin()
        .from("tilex_leurre_data")
        .select("id, titre, contenu")
        .limit(20);
      return jsonRep({ mode: "leurre", data: faux ?? [] }, 200, cors);
    }

    // Rate limit anti-aspiration : trop de lectures en 60s → leurre + log.
    const since = new Date(Date.now() - 60000).toISOString();
    const { data: recents } = await supabase
      .from("tilex_agent_runs")
      .select("id")
      .gte("created_at", since);
    if (recents && recents.length >= 120) {
      await logIntrusion({ raison: "debit-anormal", chemin: String(body.ressource ?? "") });
      const { data: faux } = await admin()
        .from("tilex_leurre_data")
        .select("id, titre, contenu")
        .limit(20);
      return jsonRep({ mode: "leurre", data: faux ?? [] }, 200, cors);
    }

    // Utilisateur légitime → on autorise la lecture réelle.
    // (Le front lit ensuite normalement via REST/RLS, ou tu branches ici ta
    //  vraie source.) On renvoie juste le feu vert.
    return jsonRep({ mode: "reel", ok: true }, 200, cors);
  } catch (e) {
    return jsonRep(
      { error: "Exception serveur : " + (e instanceof Error ? e.message : "inconnue") },
      500,
      cors,
    );
  }
});
