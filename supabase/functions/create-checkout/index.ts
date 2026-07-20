import Stripe from "https://esm.sh/stripe@18?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2026-05-27.dahlia" as Stripe.LatestApiVersion,
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const rl = await checkRateLimit(getIdentifier(req, user.id), { prefix: "create-checkout", max: 30, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl, cors);

    const { priceId } = await req.json();
    if (!priceId) {
      return new Response(JSON.stringify({ error: "priceId requis" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: existingCustomer } = await supabaseAdmin
      .from("customers")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId: string;

    if (existingCustomer?.stripe_customer_id) {
      customerId = existingCustomer.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabaseAdmin.from("customers").upsert({
        id: user.id,
        stripe_customer_id: customerId,
      });
    }

    const ADMIN_USER_ID = "d9a1985a-e106-4ea5-9ada-cac775c0b820";
    const CYBER_PLANS = ["cyber_recon", "cyber_guardian", "cyber_sentinel"];

    const PRICE_TO_PLAN: Record<string, string> = {
      "price_1Tk0ylFu0d9mAEdCMHuDGik6": "ti",
      "price_1Tk1BqFu0d9mAEdC1Ti7zHG0": "surge",
      "price_1Tk1O3Fu0d9mAEdCbKUV25kJ": "apex",
      "price_1TiA8fFu0d9mAEdCaIBd9Z5v": "flux",
      "price_1TiN0tFu0d9mAEdCVQtmwR7t": "surge",
      "price_1TiMuYFu0d9mAEdCGONgQKBH": "apex",
      "price_1TiNFrFu0d9mAEdCDOok74WK": "cyber_recon",
      "price_1TiUGRFu0d9mAEdCl3S7d8Hz": "cyber_guardian",
      "price_1TiNS9Fu0d9mAEdC3YfrwmWl": "cyber_sentinel",
    };
    const planId = PRICE_TO_PLAN[priceId] || "unknown";

    if (CYBER_PLANS.includes(planId) && user.id !== ADMIN_USER_ID) {
      return new Response(
        JSON.stringify({
          error: "Les forfaits cybersécurité ne sont pas encore disponibles. Restez à l'affût!",
        }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.headers.get("origin") || "https://ti-lex.ca"}/pro.html?checkout=success&plan=${planId}`,
      cancel_url: `${req.headers.get("origin") || "https://ti-lex.ca"}/pro.html?checkout=cancelled`,
      locale: "fr",
      metadata: { user_id: user.id, plan_id: planId },
      subscription_data: {
        metadata: { user_id: user.id, plan_id: planId },
      },
      automatic_tax: { enabled: true },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }
});
