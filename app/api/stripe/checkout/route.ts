import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

const dbAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function authClient() {
  const cookieStore = cookies();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { cookie: cookieStore.toString() },
      },
    },
  );
}

async function getOrCreateCustomer(
  userId: string,
  email: string,
): Promise<string> {
  const { data: existing } = await dbAdmin
    .from("customers")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });

  await dbAdmin.from("customers").upsert({
    id: userId,
    stripe_customer_id: customer.id,
  });

  return customer.id;
}

export async function POST(req: NextRequest) {
  try {
    const { priceId } = await req.json();
    if (!priceId) {
      return NextResponse.json(
        { error: "priceId is required" },
        { status: 400 },
      );
    }

    const supabase = authClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const customerId = await getOrCreateCustomer(
      user.id,
      user.email ?? "",
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?success=true`,
      cancel_url: `${appUrl}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
