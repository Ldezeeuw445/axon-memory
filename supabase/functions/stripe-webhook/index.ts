// supabase/functions/stripe-webhook/index.ts
//
// Handles Stripe webhook events for all 4 pricing tiers (Starter/Pro/Ultra
// recurring, Lifetime Founder one-time) and keeps `profiles` in sync.
//
// Configure this function's URL as a webhook endpoint in the Stripe Dashboard
// listening for: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted, invoice.payment_failed.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { tierFromPriceId, FALLBACK_TIER, PLANS } from "../_shared/plans.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const rawBody = await req.text();

  if (!signature) {
    return new Response("Missing Stripe-Signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn("Payment failed for customer:", invoice.customer);
        // Intentionally not downgrading here — Stripe retries and will fire
        // customer.subscription.updated (past_due) / .deleted if it truly lapses.
        break;
      }
      default:
        // Unhandled event types are fine to ignore.
        break;
    }
  } catch (err) {
    console.error(`Error handling event ${event.type}:`, err);
    // Return 500 so Stripe retries the delivery.
    return new Response("Internal error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
  if (!userId) {
    console.error("checkout.session.completed with no supabase user id in metadata", session.id);
    return;
  }

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  if (session.mode === "payment") {
    // One-time purchase — currently only Lifetime Founder.
    const tier = session.metadata?.plan_tier === "lifetime_founder" ? "lifetime_founder" : null;

    if (!tier) {
      console.error("One-time checkout completed without a recognized plan_tier", session.id);
      return;
    }

    await supabase
      .from("profiles")
      .update({
        plan_tier: tier,
        plan_started_at: new Date().toISOString(),
        plan_expires_at: null, // lifetime — never expires
        stripe_customer_id: customerId,
        stripe_subscription_id: null,
        stripe_price_id: PLANS.lifetime_founder.priceId,
      })
      .eq("id", userId);
    return;
  }

  if (session.mode === "subscription") {
    const subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

    if (!subscriptionId) {
      console.error("Subscription checkout completed with no subscription id", session.id);
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0]?.price?.id ?? null;
    const tier = tierFromPriceId(priceId) ?? FALLBACK_TIER;

    await supabase
      .from("profiles")
      .update({
        plan_tier: tier,
        plan_started_at: new Date().toISOString(),
        plan_expires_at: null,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
      })
      .eq("id", userId);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price?.id ?? null;

  // A subscription past its cancellation date but not yet fully "deleted" by
  // Stripe (status transitions) is handled the same way as an active plan —
  // `customer.subscription.deleted` is what actually triggers the downgrade.
  const tier = tierFromPriceId(priceId);
  if (!tier) {
    console.error("customer.subscription.updated with unrecognized price id", priceId);
    return;
  }

  await supabase
    .from("profiles")
    .update({
      plan_tier: tier,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
    })
    .eq("stripe_customer_id", customerId);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  await supabase
    .from("profiles")
    .update({
      plan_tier: FALLBACK_TIER,
      stripe_subscription_id: null,
      stripe_price_id: null,
    })
    .eq("stripe_customer_id", customerId);
}
