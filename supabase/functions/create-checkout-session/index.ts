import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://ti-lex-v10.vercel.app";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Session invalide" }, 401);

    const body = await req.json().catch(() => ({}));
    let priceId: string | null = body.price_id ?? null;
    const tier: string | null = body.tier ?? null;

    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!priceId && tier) {
      const { data: prices } = await adminDb
        .from("prices")
        .select("id, active, type, products!inner(metadata)")
        .eq("active", true)
        .eq("type", "recurring");

      const match = (prices ?? []).find(
        // deno-lint-ignore no-explicit-any
        (p: any) => p.products?.metadata?.plan_tier === tier,
      );
      priceId = match?.id ?? null;
    }

    if (!priceId) {
      return json(
        { error: `Aucun prix trouvé pour « ${tier ?? "(price_id manquant)"} »` },
        400,
      );
    }

    const { data: priceRow, error: priceErr } = await adminDb
      .from("prices")
      .select("id, active")
      .eq("id", priceId)
      .maybeSingle();

    if (priceErr || !priceRow || !priceRow.active) {
      return json(
        {
          error:
            "Ce prix n'existe pas (ou est inactif) dans la base. " +
            "Vérifie que tes produits Stripe sont bien synchronisés dans la table `prices`.",
        },
        400,
      );
    }

    let customerId: string;
    const { data: existing } = await adminDb
      .from("customers")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (existing?.stripe_customer_id) {
      customerId = existing.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await adminDb
        .from("customers")
        .upsert({ id: user.id, stripe_customer_id: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { user_id: user.id },
      },
      success_url: `${SITE_URL}/app.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/app.html`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
