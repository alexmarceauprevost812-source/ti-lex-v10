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

const PLAN_LIMITS: Record<string, { window: number; day: number }> = {
  free:  { window: 10,  day: 20 },
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

    const { data: profil } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    const plan = profil?.plan || null;

    if (!plan || !PLANS_VALIDES.has(plan)) {
      return json({ allowed: false, reason: "no_subscription", plan: null });
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
