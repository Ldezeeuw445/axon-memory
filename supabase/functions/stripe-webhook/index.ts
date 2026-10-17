// supabase/functions/stripe-webhook/index.ts
//
// Handles Stripe webhook events for all 4 pricing tiers (Starter/Pro/Power ("ultra")
// recurring, Lifetime Founder one-time) and keeps `profiles` in sync.
//
// Configure this function's URL as a webhook endpoint in the Stripe Dashboard
// listening for: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted, invoice.payment_failed.
//
// A11-3 (approved 2026-10-17): every decision goes through the tested reducer
// in _shared/billing.ts, so the webhook is
//   - idempotent: an event id is claimed in `stripe_events` before it is
//     applied; a redelivery is acknowledged and ignored. If applying fails the
//     claim is released, so Stripe's retry gets a clean second attempt;
//   - order-aware: an event older than `profiles.billing_event_at` is ignored;
//   - Lifetime-safe: no subscription event takes Lifetime away;
//   - subscription-exact: an event acts only on the profile's current
//     subscription, never on "whatever this customer has".

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decide, type BillingProfile } from "../_shared/billing.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

const HANDLED = new Set(["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"]);
const PROFILE_COLS = "id, plan_tier, stripe_customer_id, stripe_subscription_id, billing_event_at";
const iso = (unix: number) => new Date(unix * 1000).toISOString();
const ok = (extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ received: true, ...extra }), { status: 200, headers: { "Content-Type": "application/json" } });

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

  if (event.type === "invoice.payment_failed") {
    // Intentionally not downgrading here — Stripe retries and will fire
    // customer.subscription.updated (past_due) / .deleted if it truly lapses.
    console.warn("Payment failed for customer:", (event.data.object as Stripe.Invoice).customer);
    return ok();
  }
  if (!HANDLED.has(event.type)) return ok(); // unhandled types are fine to ignore

  // Claim the event id. A conflict means it was already applied: acknowledge.
  const claim = await supabase
    .from("stripe_events")
    .upsert({ id: event.id, type: event.type, created: iso(event.created) }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (claim.error) {
    console.error("stripe_events claim failed", claim.error.message);
    return new Response("Internal error", { status: 500 }); // Stripe retries
  }
  if (!claim.data || claim.data.length === 0) return ok({ duplicate: true });

  try {
    const outcome = await apply(event);
    await supabase.from("stripe_events").update({ outcome }).eq("id", event.id);
    return ok({ outcome });
  } catch (err) {
    console.error(`Error handling event ${event.type} ${event.id}:`, err);
    // Release the claim so the retry is applied, then ask Stripe to retry.
    await supabase.from("stripe_events").delete().eq("id", event.id);
    return new Response("Internal error", { status: 500 });
  }
});

async function loadProfile(event: Stripe.Event): Promise<(BillingProfile & { id: string }) | null> {
  const o = event.data.object as unknown as Record<string, any>;
  if (event.type === "checkout.session.completed") {
    const userId = o.client_reference_id ?? o.metadata?.supabase_user_id;
    if (!userId) return null;
    const { data, error } = await supabase.from("profiles").select(PROFILE_COLS).eq("id", userId).maybeSingle();
    if (error) throw new Error(`profile read failed: ${error.message}`);
    return data;
  }
  const customer = typeof o.customer === "string" ? o.customer : o.customer?.id;
  if (!customer) return null;
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLS).eq("stripe_customer_id", customer).limit(2);
  if (error) throw new Error(`profile read failed: ${error.message}`);
  if ((data ?? []).length > 1) console.warn(`more than one profile for customer ${customer}; using the first`);
  return data?.[0] ?? null;
}

/** Something a person must look at in Stripe; written to system_alerts (admin view). */
async function attention(message: string, metadata: Record<string, unknown>) {
  const { error } = await supabase.from("system_alerts").insert({ alert_type: "billing_attention", message, metadata });
  if (error) console.error("billing_attention alert failed", error.message, message);
}

async function apply(event: Stripe.Event): Promise<string> {
  const o = event.data.object as unknown as Record<string, any>;
  const profile = await loadProfile(event);

  // The reducer decides; it only needs the subscription's price for a
  // subscription checkout (one Stripe read, skipped when it cannot matter).
  const ctx: { subscriptionPriceId?: string | null } = {};
  if (event.type === "checkout.session.completed" && o.mode === "subscription" && profile && profile.plan_tier !== "lifetime_founder") {
    const subId = typeof o.subscription === "string" ? o.subscription : o.subscription?.id;
    if (subId) {
      const sub = await stripe.subscriptions.retrieve(subId);
      ctx.subscriptionPriceId = sub.items.data[0]?.price?.id ?? null;
    }
  }

  // Ids are deduped by the stripe_events claim above, so `seen` is always false here.
  const decision = decide(profile, event as unknown as Parameters<typeof decide>[1], () => false, ctx);

  if (event.type === "checkout.session.completed" && profile) {
    if (o.mode === "subscription" && profile.plan_tier === "lifetime_founder") {
      await attention(`Lifetime member ${profile.id} completed a subscription checkout; tier kept. Cancel/refund the subscription in Stripe.`, { user_id: profile.id, session: o.id, subscription: o.subscription ?? null });
    }
    if (o.mode === "payment" && decision.action === "write" && profile.stripe_subscription_id) {
      await attention(`User ${profile.id} bought Lifetime while subscription ${profile.stripe_subscription_id} was active. Cancel that subscription in Stripe.`, { user_id: profile.id, subscription: profile.stripe_subscription_id });
    }
  }

  if (decision.action === "skip") {
    console.log(`stripe-webhook ${event.type} ${event.id}: skip (${decision.reason})`);
    return `skip: ${decision.reason}`;
  }
  const { error } = await supabase.from("profiles").update(decision.patch).eq("id", profile!.id);
  if (error) throw new Error(`profile write failed: ${error.message}`);
  return `write: ${Object.keys(decision.patch).join(",")}`;
}
