import Stripe from "https://esm.sh/stripe@18?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2026-05-27.dahlia" as Stripe.LatestApiVersion,
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const RELEVANT = new Set([
  "product.created",
  "product.updated",
  "product.deleted",
  "price.created",
  "price.updated",
  "price.deleted",
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const toTs = (n: number | null | undefined) =>
  n ? new Date(n * 1000).toISOString() : null;

async function syncSubscription(subId: string) {
  const sub = await stripe.subscriptions.retrieve(subId, {
    expand: ["items.data.price"],
  });

  const { data: cust } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("stripe_customer_id", sub.customer as string)
    .single();
  if (!cust) throw new Error(`No local customer for ${sub.customer}`);

  const item = sub.items.data[0];

  await supabaseAdmin.from("subscriptions").upsert({
    id: sub.id,
    user_id: cust.id,
    status: sub.status,
    metadata: sub.metadata,
    price_id: item.price.id,
    quantity: item.quantity ?? 1,
    cancel_at_period_end: sub.cancel_at_period_end,
    created: toTs(sub.created),
    current_period_start: toTs(
      (item as unknown as Record<string, number>).current_period_start
    ),
    current_period_end: toTs(
      (item as unknown as Record<string, number>).current_period_end
    ),
    ended_at: toTs(sub.ended_at),
    cancel_at: toTs(sub.cancel_at),
    canceled_at: toTs(sub.canceled_at),
    trial_start: toTs(sub.trial_start),
    trial_end: toTs(sub.trial_end),
  });
}

Deno.serve(async (req) => {
  const sig = req.headers.get("Stripe-Signature");
  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig!,
      Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET")!,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    return new Response(`Bad signature: ${(err as Error).message}`, {
      status: 400,
    });
  }

  if (!RELEVANT.has(event.type)) {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      case "product.created":
      case "product.updated": {
        const p = event.data.object as Stripe.Product;
        await supabaseAdmin.from("products").upsert({
          id: p.id,
          active: p.active,
          name: p.name,
          description: p.description,
          image: p.images?.[0] ?? null,
          metadata: p.metadata,
        });
        break;
      }
      case "product.deleted": {
        const p = event.data.object as Stripe.Product;
        await supabaseAdmin.from("products").delete().eq("id", p.id);
        break;
      }
      case "price.created":
      case "price.updated": {
        const pr = event.data.object as Stripe.Price;
        await supabaseAdmin.from("prices").upsert({
          id: pr.id,
          product_id: pr.product as string,
          active: pr.active,
          description: pr.nickname,
          unit_amount: pr.unit_amount,
          currency: pr.currency,
          type: pr.type,
          interval: pr.recurring?.interval ?? null,
          interval_count: pr.recurring?.interval_count ?? null,
          trial_period_days: pr.recurring?.trial_period_days ?? null,
          metadata: pr.metadata,
        });
        break;
      }
      case "price.deleted": {
        const pr = event.data.object as Stripe.Price;
        await supabaseAdmin.from("prices").delete().eq("id", pr.id);
        break;
      }
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id ?? s.metadata?.user_id;
        if (userId && s.customer) {
          await supabaseAdmin.from("customers").upsert({
            id: userId,
            stripe_customer_id: s.customer as string,
          });
        }
        if (s.mode === "subscription" && s.subscription) {
          await syncSubscription(s.subscription as string);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub.id);
        break;
      }
    }
  } catch (err) {
    console.error(err);
    return new Response(`Handler error: ${(err as Error).message}`, {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
