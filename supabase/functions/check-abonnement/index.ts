import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLANS_VALIDES = new Set([
  "ti", "flux", "surge", "apex",
  "cyber_recon", "cyber_guardian", "cyber_shield", "cyber_sentinel", "cyber_fortress",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return new Response(
        JSON.stringify({
          autorise: false,
          raison: "non_connecte",
          message: "Connecte-toi pour utiliser ti-lex-al.",
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          autorise: false,
          raison: "non_connecte",
          message: "Session expirée. Reconnecte-toi.",
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { data: profil, error: profilError } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    if (profilError) throw profilError;

    const plan = profil?.plan || null;

    if (!plan || !PLANS_VALIDES.has(plan)) {
      return new Response(
        JSON.stringify({
          autorise: false,
          raison: "sans_abonnement",
          message: "Abonne-toi pour accéder à ti-lex-al.",
          plan: null,
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        autorise: true,
        plan,
        user_id: user.id,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        autorise: false,
        raison: "erreur_serveur",
        message: "Erreur serveur. Réessaie.",
      }),
      {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      }
    );
  }
});
