// POST /mcp-oauth-consent   body: { client_id, redirect_uri, state, scope,
//   code_challenge, code_challenge_method, decision: "approve" | "deny" }
// Auth: normal Axon user JWT (the React /connect/authorize page calls this
// while the user is logged in). Issues a short-lived authorization code and
// returns the redirect_uri to send the AI tool's browser back to — the
// actual OAuth "click Approve" step.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { newAuthorizationCode, codeExpiresAt, redirectUriAllowed } from "../_shared/oauth.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405, origin });

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401, origin });

  const body = await req.json().catch(() => ({}));
  const { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method, decision } = body;

  if (!client_id || !redirect_uri) {
    return jsonResponse({ error: "invalid_request" }, { status: 400, origin });
  }

  const admin = supabaseAdmin();

  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id, redirect_uris, is_public")
    .eq("client_id", client_id)
    .maybeSingle();
  if (!client || !redirectUriAllowed(client.redirect_uris, redirect_uri)) {
    return jsonResponse({ error: "invalid_client" }, { status: 400, origin });
  }
  if (client.is_public && !code_challenge) {
    return jsonResponse({ error: "invalid_request", error_description: "PKCE code_challenge required for public clients" }, { status: 400, origin });
  }

  if (decision !== "approve") {
    const denyUrl = new URL(redirect_uri);
    denyUrl.searchParams.set("error", "access_denied");
    if (state) denyUrl.searchParams.set("state", state);
    return jsonResponse({ redirect_to: denyUrl.toString() }, { origin });
  }

  // Gate: connecting an AI assistant is an Ultra/Pro-tier ("axon_ai") feature.
  const { data: planStatus } = await admin
    .from("user_plan_status")
    .select("has_axon_ai")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!planStatus?.has_axon_ai) {
    return jsonResponse(
      { error: "upgrade_required", error_description: "Connecting an AI assistant requires the Pro plan or higher." },
      { status: 402, origin },
    );
  }

  const { plaintext, hashPromise } = newAuthorizationCode();
  const codeHash = await hashPromise;

  const { error } = await admin.from("oauth_authorization_codes").insert({
    code_hash: codeHash,
    client_id,
    user_id: auth.user.id,
    redirect_uri,
    code_challenge: code_challenge || null,
    code_challenge_method: code_challenge_method || "S256",
    scope: scope || "memory.read memory.write",
    expires_at: codeExpiresAt(),
  });

  if (error) {
    console.error("mcp-oauth-consent insert error", error);
    return jsonResponse({ error: "server_error" }, { status: 500, origin });
  }

  const successUrl = new URL(redirect_uri);
  successUrl.searchParams.set("code", plaintext);
  if (state) successUrl.searchParams.set("state", state);

  return jsonResponse({ redirect_to: successUrl.toString() }, { origin });
});
