import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getPlanFromPriceId(priceId: string | null): Promise<string> {
  if (!priceId) return "free";
  const { data } = await db
    .from("prices")
    .select("product_id, products(name)")
    .eq("id", priceId)
    .single();

  const name = (data?.products as any)?.name?.toLowerCase() ?? "";
  if (name.includes("starter")) return "starter";
  if (name.includes("pro")) return "pro";
  if (name.includes("industriel")) return "industriel";
  return "free";
}

async function userIdFromCustomer(
  stripeCustomerId: string,
): Promise<string | null> {
  const { data } = await db
    .from("customers")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return data?.id ?? null;
}

const toIso = (ts?: number | null) =>
  ts ? new Date(ts * 1000).toISOString() : null;

async function handleSubscriptionChange(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;
  const userId = sub.metadata?.user_id ?? (await userIdFromCustomer(customerId));
  if (!userId) {
    console.error("No user found for subscription", sub.id);
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const plan = active ? await getPlanFromPriceId(priceId) : "free";

  await db.from("profiles").update({ plan }).eq("id", userId);

  await db.from("subscriptions_legacy").upsert(
    {
      user_id: userId,
      plan,
      status: sub.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      started_at:
        toIso(
          (sub as any).current_period_start ??
            (item as any)?.current_period_start,
        ) ?? new Date().toISOString(),
      expires_at:
        toIso(
          (sub as any).current_period_end ??
            (item as any)?.current_period_end,
        ) ?? new Date().toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;
  const userId = sub.metadata?.user_id ?? (await userIdFromCustomer(customerId));
  if (!userId) return;

  await db.from("profiles").update({ plan: "free" }).eq("id", userId);

  await db.from("subscriptions_legacy").upsert(
    {
      user_id: userId,
      plan: "free",
      status: "canceled",
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const userId = await userIdFromCustomer(customerId);
  if (!userId || !invoice.amount_paid) return;

  await db.from("payment_history").insert({
    user_id: userId,
    amount_cents: invoice.amount_paid,
    currency: "CAD",
    payment_type: "subscription",
    stripe_payment_id: invoice.id,
    status: "completed",
    description: invoice.lines?.data?.[0]?.description ?? "Abonnement ti-lex",
  });
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const userId = await userIdFromCustomer(customerId);
  if (!userId) return;

  await db.from("payment_history").insert({
    user_id: userId,
    amount_cents: invoice.amount_due ?? 0,
    currency: "CAD",
    payment_type: "subscription",
    stripe_payment_id: invoice.id,
    status: "failed",
    description:
      "Paiement échoué — " +
      (invoice.lines?.data?.[0]?.description ?? "Abonnement ti-lex"),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Invalid Stripe signature:", (err as Error).message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(
          event.data.object as Stripe.Subscription,
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export const config = {
  api: { bodyParser: false },
};
