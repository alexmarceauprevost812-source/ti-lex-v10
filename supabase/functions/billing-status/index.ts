import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "GET") return json({ error: "Methode non autorisee" }, 405, cors);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifie" }, 401, cors);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !userData?.user) {
      return json({ error: "Session invalide" }, 401, cors);
    }

    const userId = userData.user.id;

    const rl = await checkRateLimit(getIdentifier(req, userId), { prefix: "billing-status", max: 60, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl, cors);

    const { data: profile } = await sb
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    const { data: subscription } = await sb
      .from("subscriptions")
      .select("id, status, price_id, cancel_at_period_end, current_period_end")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .order("created", { ascending: false })
      .limit(1)
      .maybeSingle();

    const subscriptionActive = !!subscription &&
      (subscription.status === "active" || subscription.status === "trialing");

    let plan: string;
    if (subscriptionActive) {
      plan = profile?.plan || "free";
    } else if (profile?.plan && profile.plan !== "free") {
      plan = profile.plan;
    } else {
      plan = "free";
    }

    const { data: limits } = await sb
      .from("plan_limits")
      .select("*")
      .eq("plan", plan)
      .maybeSingle();

    return json({
      plan,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            price_id: subscription.price_id,
            cancel_at_period_end: subscription.cancel_at_period_end,
            current_period_end: subscription.current_period_end,
          }
        : null,
      limits: limits || null,
    }, 200, cors);
  } catch (err) {
    console.error("billing-status error:", (err as Error).message);
    return json({ error: (err as Error).message || "Erreur serveur" }, 500, cors);
  }
});

function json(obj: unknown, status: number, hdrs: Record<string, string>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...hdrs, "Content-Type": "application/json" },
  });
}
