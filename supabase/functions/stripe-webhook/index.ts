import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const PRICE_TO_PLAN: Record<string, string> = {
  "price_1TiA8fFu0d9mAEdCaIBd9Z5v": "flux",
  "price_1TiBFrFu0d9mAEdCRUY13Wvm": "surge",
  "price_1TiBbSFu0d9mAEdCAlDYgtlv": "apex",
};

function tierToPlan(
  tier?: string | null,
): "free" | "flux" | "surge" | "apex" {
  switch (tier) {
    case "apex":
    case "industriel":
    case "ultra":
      return "apex";
    case "surge":
    case "pro":
      return "surge";
    case "flux":
    case "starter":
      return "flux";
    default:
      return "free";
  }
}

const toIso = (s?: number | null) =>
  s ? new Date(s * 1000).toISOString() : null;

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      webhookSecret,
    );
  } catch (err) {
    console.error("Signature invalide:", (err as Error).message);
    return new Response("Signature invalide", { status: 400 });
  }

  try {
    switch (event.type) {
      case "product.created":
      case "product.updated": {
        const p = event.data.object as Stripe.Product;
        await db.from("products").upsert({
          id: p.id,
          active: p.active,
          name: p.name,
          description: p.description,
          image: p.images?.[0] ?? null,
          metadata: p.metadata,
        });
        break;
      }

      case "price.created":
      case "price.updated": {
        const pr = event.data.object as Stripe.Price;
        await db.from("prices").upsert({
          id: pr.id,
          product_id: typeof pr.product === "string" ? pr.product : pr.product.id,
          active: pr.active,
          currency: pr.currency,
          description: pr.nickname ?? null,
          type: pr.type,
          unit_amount: pr.unit_amount,
          interval: pr.recurring?.interval ?? null,
          interval_count: pr.recurring?.interval_count ?? null,
          trial_period_days: pr.recurring?.trial_period_days ?? null,
          metadata: pr.metadata,
        });
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId = session.customer as string | null;

        if (userId && customerId) {
          await db.from("customers").upsert({
            id: userId,
            stripe_customer_id: customerId,
          });
        }

        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          await syncSubscription(sub);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const userId = await userIdFromCustomer(inv.customer as string);
        if (userId && inv.amount_paid > 0) {
          await db.from("payment_history").insert({
            user_id: userId,
            amount_cents: inv.amount_paid,
            currency: (inv.currency ?? "cad").toUpperCase(),
            payment_type: "subscription",
            stripe_payment_id: inv.id,
            status: "completed",
            description: inv.lines?.data?.[0]?.description ?? "Abonnement",
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const userId = await userIdFromCustomer(inv.customer as string);
        if (userId) {
          await db.from("payment_history").insert({
            user_id: userId,
            amount_cents: inv.amount_due ?? 0,
            currency: (inv.currency ?? "cad").toUpperCase(),
            payment_type: "subscription",
            stripe_payment_id: inv.id,
            status: "failed",
            description: "Paiement échoué — " + (inv.lines?.data?.[0]?.description ?? "Abonnement"),
          });
          await db.from("profiles").update({ payment_status: "past_due" }).eq("id", userId);
        }
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur de traitement webhook:", err);
    return new Response("Erreur interne", { status: 500 });
  }
});

async function userIdFromCustomer(customerId: string): Promise<string | null> {
  const { data } = await db
    .from("customers")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

async function ensurePriceAndProduct(price: Stripe.Price) {
  const productId = typeof price.product === "string"
    ? price.product
    : price.product.id;

  let product: Stripe.Product | null = typeof price.product === "string"
    ? null
    : (price.product as Stripe.Product);
  if (!product) {
    try {
      product = await stripe.products.retrieve(productId);
    } catch (_e) {
      product = null;
    }
  }

  await db.from("products").upsert({
    id: productId,
    active: product?.active ?? true,
    name: product?.name ?? null,
    description: product?.description ?? null,
    image: product?.images?.[0] ?? null,
    metadata: product?.metadata ?? {},
  });

  await db.from("prices").upsert({
    id: price.id,
    product_id: productId,
    active: price.active,
    currency: price.currency,
    description: price.nickname ?? null,
    type: price.type,
    unit_amount: price.unit_amount,
    interval: price.recurring?.interval ?? null,
    interval_count: price.recurring?.interval_count ?? null,
    trial_period_days: price.recurring?.trial_period_days ?? null,
    metadata: price.metadata,
  });
}

async function syncSubscription(sub: Stripe.Subscription) {
  const userId = sub.metadata?.user_id ??
    (await userIdFromCustomer(sub.customer as string));
  if (!userId) {
    console.error("Aucun user trouvé pour la sub", sub.id);
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const now = new Date().toISOString();

  if (item?.price) {
    await ensurePriceAndProduct(item.price);
  }

  await db.from("subscriptions").upsert({
    id: sub.id,
    user_id: userId,
    status: sub.status,
    metadata: sub.metadata,
    price_id: priceId,
    quantity: item?.quantity ?? 1,
    cancel_at_period_end: sub.cancel_at_period_end,
    created: toIso(sub.created) ?? now,
    current_period_start:
      // deno-lint-ignore no-explicit-any
      toIso((sub as any).current_period_start ?? (item as any)?.current_period_start) ?? now,
    current_period_end:
      // deno-lint-ignore no-explicit-any
      toIso((sub as any).current_period_end ?? (item as any)?.current_period_end) ?? now,
    ended_at: toIso(sub.ended_at),
    cancel_at: toIso(sub.cancel_at),
    canceled_at: toIso(sub.canceled_at),
    trial_start: toIso(sub.trial_start),
    trial_end: toIso(sub.trial_end),
  });

  let tier: string | null =
    sub.metadata?.plan_id ?? item?.price?.metadata?.plan_tier ?? null;
  if (!tier && priceId) {
    if (PRICE_TO_PLAN[priceId]) {
      tier = PRICE_TO_PLAN[priceId];
    } else {
      const { data: priceRow } = await db
        .from("prices")
        .select("products(metadata)")
        .eq("id", priceId)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      tier = (priceRow as any)?.products?.metadata?.plan_tier ?? null;
    }
  }

  const active = sub.status === "active" || sub.status === "trialing";
  const newPlan = active ? tierToPlan(tier) : "free";
  await db.from("profiles").update({ plan: newPlan }).eq("id", userId);

  await db.from("subscriptions_legacy").upsert({
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: sub.customer as string,
    plan: newPlan,
    status: sub.status,
    price_id: priceId,
    current_period_start:
      toIso((sub as any).current_period_start ?? (item as any)?.current_period_start) ?? now,
    current_period_end:
      toIso((sub as any).current_period_end ?? (item as any)?.current_period_end) ?? now,
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: toIso(sub.canceled_at),
    updated_at: now,
  }, { onConflict: "user_id" });
}
