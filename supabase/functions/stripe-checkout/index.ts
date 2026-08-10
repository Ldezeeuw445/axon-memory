// supabase/functions/stripe-checkout/index.ts
//
// Creates a Stripe Checkout Session for one of Axon Memory's 4 tiers.
// - starter / pro / ultra  -> recurring subscription checkout
// - lifetime_founder       -> one-time payment checkout
//
// Expects: POST { tier: "starter" | "pro" | "ultra" | "lifetime_founder" }
// Auth:    Authorization: Bearer <supabase user access token>
// Returns: { url: string }  (redirect the client to this Stripe-hosted URL)

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PLANS, isValidTier } from "../_shared/plans.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// APP_URL should point at the app's own domain (e.g. https://app.axon-memory.com).
// Falls back to the marketing site's pricing section if not configured.
const appUrl = Deno.env.get("APP_URL") ?? "https://axon-memory.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Client bound to the caller's JWT, used only to identify the user.
    const supabaseAuth = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid or expired session" }, 401);
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const tier = body?.tier;
    if (typeof tier !== "string" || !isValidTier(tier)) {
      return json({ error: "Invalid or missing 'tier'. Expected starter | pro | ultra | lifetime_founder." }, 400);
    }
    const plan = PLANS[tier];

    // Service-role client for reading/writing profiles regardless of RLS.
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return json({ error: "Profile not found for this user" }, 404);
    }

    // Reuse an existing Stripe customer, or create one and persist it.
    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: plan.mode, // "subscription" for starter/pro/ultra, "payment" for lifetime_founder
      line_items: [{ price: plan.priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id, plan_tier: plan.tier },
      // Also stamp metadata on the subscription itself, since checkout.session
      // metadata isn't automatically copied to the subscription object.
      ...(plan.mode === "subscription"
        ? { subscription_data: { metadata: { supabase_user_id: user.id, plan_tier: plan.tier } } }
        : { payment_intent_data: { metadata: { supabase_user_id: user.id, plan_tier: plan.tier } } }),
      allow_promotion_codes: true,
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("stripe-checkout error:", err);
    return json({ error: "Internal error creating checkout session" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
