// POST /functions/v1/stripe-portal — returns a Stripe Billing Portal URL for "Manage billing".
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405, origin });

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", auth.user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return jsonResponse({ error: "No billing account yet — subscribe first" }, { status: 400, origin });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${APP_URL}/subscription`,
  });

  return jsonResponse({ url: session.url }, { origin });
});
