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

const PLANS_VALIDES = new Set([
  "free", "ti", "flux", "surge", "apex",
  "cyber_recon", "cyber_guardian", "cyber_shield", "cyber_sentinel", "cyber_fortress",
]);

// 👑 Administrateur / propriétaire de la plateforme — même verrou que ai-proxy.
//    Le proprio de ti-lex ne doit JAMAIS être bloqué par la garde d'abonnement
//    sur son propre projet (pas de « 10 questions gratuites épuisées », pas de
//    quota). Configurable via le secret Supabase TILEX_ADMIN_EMAIL.
const TILEX_ADMIN_EMAIL = (Deno.env.get("TILEX_ADMIN_EMAIL") || "alexmarceauprevost812@gmail.com").toLowerCase();

// Vrai si l'utilisateur est administrateur : email admin OU rôle 'admin' dans
// user_roles (le rôle DB prime si l'email n'est pas configuré). Fail-safe : la
// requête user_roles est enveloppée — une erreur ne bloque jamais l'accès admin
// déjà accordé par l'email.
async function estAdmin(supabase: any, user: any): Promise<boolean> {
  const email = (user?.email || "").toLowerCase();
  if (email && email === TILEX_ADMIN_EMAIL) return true;
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    return !!data;
  } catch (_) {
    return false;
  }
}

const PLAN_LIMITS: Record<string, { window: number; day: number }> = {
  ti:    { window: 40,  day: 80 },
  flux:  { window: 40,  day: 80 },
  surge: { window: 100, day: 200 },
  apex:  { window: 200, day: 400 },
};

function getWindow() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  let name: string, start: Date, end: Date;

  if (utcHour >= 12) {
    name = "matin";
    start = new Date(today); start.setUTCHours(12, 0, 0, 0);
    end = new Date(today); end.setUTCHours(24, 0, 0, 0);
  } else {
    name = "soir";
    start = new Date(today); start.setUTCHours(0, 0, 0, 0);
    end = new Date(today); end.setUTCHours(12, 0, 0, 0);
  }

  const diff = end.getTime() - now.getTime();
  const hLeft = Math.floor(diff / 3600000);
  const mLeft = Math.floor((diff % 3600000) / 60000);
  return { name, start, end, nextRechargeLabel: `${hLeft}h${String(mLeft).padStart(2, "0")}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ allowed: false, reason: "not_connected", plan: null });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ allowed: false, reason: "not_connected", plan: null });

    // 👑 Bypass admin : le propriétaire de la plateforme n'est jamais gaté.
    //    On répond `allowed: true` sans consommer de quota ni de bonus, pour que
    //    son agent réponde toujours sur son propre projet.
    if (await estAdmin(supabase, user)) {
      return json({
        allowed: true, reason: null, plan: "admin", admin: true,
        messages_used: 0, messages_remaining: null, messages_window: null,
      });
    }

    const { data: profil } = await supabase
      .from("profiles")
      .select("plan, bonus_messages_remaining")
      .eq("id", user.id)
      .maybeSingle();

    const plan = profil?.plan || null;

    if (!plan || !PLANS_VALIDES.has(plan)) {
      return json({ allowed: false, reason: "no_subscription", plan: null });
    }

    // Plan gratuit : pas de fenêtre récurrente — 10 questions offertes une
    // seule fois à l'inscription (profiles.bonus_messages_remaining),
    // décomptées ici. Une fois épuisées, direction les forfaits.
    if (plan === "free") {
      const bonusRemaining = profil?.bonus_messages_remaining ?? 0;
      if (bonusRemaining <= 0) {
        return json({
          allowed: false, reason: "bonus_exhausted", plan,
          messages_used: 10, messages_remaining: 0, messages_window: 10,
          message: "Tu as utilisé tes 10 questions gratuites. Choisis un forfait pour continuer.",
        });
      }
      // Décrément ATOMIQUE (compare-and-swap) : le WHERE bonus_messages_remaining
      // = valeur lue ne matche qu'UNE fois. Sous concurrence, seule la requête
      // qui gagne le CAS voit une ligne revenir via .select() ; les autres
      // matchent 0 ligne et sont refusées — impossible de dépasser le bonus
      // one-shot en envoyant des requêtes parallèles.
      const { data: maj, error: decErr } = await supabase
        .from("profiles")
        .update({ bonus_messages_remaining: bonusRemaining - 1 })
        .eq("id", user.id)
        .eq("bonus_messages_remaining", bonusRemaining)
        .select("bonus_messages_remaining");
      if (decErr || !maj || maj.length === 0) {
        // CAS perdu (course concurrente) ou plus de bonus : on refuse plutôt
        // que d'accorder à tort. Le client peut réessayer s'il reste du bonus.
        return json({
          allowed: false, reason: "bonus_exhausted", plan,
          messages_used: 10, messages_remaining: 0, messages_window: 10,
          message: "Tu as utilisé tes 10 questions gratuites. Choisis un forfait pour continuer.",
        });
      }
      const restant = maj[0].bonus_messages_remaining;
      return json({
        allowed: true, reason: null, plan, bonus: true,
        messages_used: 10 - restant, messages_remaining: restant,
        messages_window: 10,
      });
    }

    const limits = PLAN_LIMITS[plan] || { window: 200, day: 400 };
    const win = getWindow();

    const { count: windowCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "user")
      .gte("created_at", win.start.toISOString())
      .lt("created_at", win.end.toISOString());

    const used = windowCount ?? 0;
    const remaining = Math.max(0, limits.window - used);

    if (remaining <= 0) {
      return json({
        allowed: false, reason: "rate_limited", plan,
        messages_used: used, messages_remaining: 0,
        messages_window: limits.window, messages_day: limits.day,
        window: win.name, next_recharge: win.nextRechargeLabel,
        next_recharge_at: win.end.toISOString(),
      });
    }

    return json({
      allowed: true, reason: null, plan,
      messages_used: used, messages_remaining: remaining,
      messages_window: limits.window, messages_day: limits.day,
      window: win.name, next_recharge: win.nextRechargeLabel,
      next_recharge_at: win.end.toISOString(),
    });
  } catch (err) {
    console.error("[check-abonnement]", err);
    return json({ allowed: false, reason: "server_error", plan: null }, 500);
  }
});
