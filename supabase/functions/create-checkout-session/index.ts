// supabase/functions/create-checkout-session/index.ts
//
// Crée une session Stripe Checkout pour un abonnement.
// Le price_id est TOUJOURS résolu/validé côté serveur depuis la table `prices`
// de Supabase -> c'est ce qui empêche le retour du bug "No such price".
//
// Déploiement :
//   supabase functions deploy create-checkout-session
//
// Secrets requis (voir guide) : STRIPE_SECRET_KEY, SITE_URL
// (SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont injectés
//  automatiquement par Supabase dans les Edge Functions.)

import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  // apiVersion omise volontairement -> utilise la version par défaut de ton compte.
  // Tu peux la fixer plus tard si tu veux : apiVersion: "2025-xx-xx".
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
  // Pré-vol CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) Identifier l'utilisateur connecté à partir de son JWT Supabase
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

    const rl = await checkRateLimit(getIdentifier(req, user.id), { prefix: "create-checkout-session", max: 30, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl, corsHeaders);

    // 2) Lire l'input : soit un price_id direct, soit un tier ('pro' | 'ultra'…)
    const body = await req.json().catch(() => ({}));
    let priceId: string | null = body.price_id ?? null;
    const tier: string | null = body.tier ?? null;

    // Client admin (service_role) pour lire/écrire les tables de facturation
    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 3) Si on reçoit un tier, on retrouve le prix actif correspondant
    //    (produit dont metadata.plan_tier == tier)
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

    // 4) VALIDATION : le prix existe-t-il vraiment et est-il actif dans Supabase ?
    //    -> remplace le message Stripe cryptique par une erreur claire en français.
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

    // 5) Récupérer (ou créer) le Stripe Customer lié à ce user
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

    // 6) Créer la session de paiement
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        // On propage l'id user -> le webhook le relira pour activer l'abonnement
        metadata: { user_id: user.id },
      },
      success_url: `${SITE_URL}/abonnement/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/forfaits`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
