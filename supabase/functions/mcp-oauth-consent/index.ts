// POST /mcp-oauth-consent   body: { client_id, redirect_uri, state, scope,
//   code_challenge, code_challenge_method, decision: "describe" | "approve" | "deny" }
// decision "describe" returns { client } (name, host, verified, logo slug) as the
// server sees it, so the consent screen never trusts the link that opened it.
// Auth: normal Axon user JWT (the React /connect/authorize page calls this
// while the user is logged in). Issues a short-lived authorization code and
// returns the redirect_uri to send the AI tool's browser back to — the
// actual OAuth "click Approve" step.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { newAuthorizationCode, codeExpiresAt, pkceRequestError, redirectUriAllowed, KNOWN_CLIENT_NAMES } from "../_shared/oauth.ts";
import { describeClient } from "../_shared/oauth-client.ts";

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
    .select("client_id, client_name, redirect_uris, is_public")
    .eq("client_id", client_id)
    .maybeSingle();
  if (!client || !redirectUriAllowed(client.redirect_uris, redirect_uri)) {
    return jsonResponse({ error: "invalid_client" }, { status: 400, origin });
  }
  // S256 only, checked again here because this is where the code is minted (A5-4).
  const pkceError = pkceRequestError({ isPublic: client.is_public !== false, challenge: code_challenge, method: code_challenge_method });
  if (pkceError) {
    return jsonResponse({ error: "invalid_request", error_description: pkceError }, { status: 400, origin });
  }

  // The consent screen asks this before it shows anything: who it is, and where
  // the code would go, decided here from the registered client and the already
  // checked redirect_uri, not from the link that opened the page. Mints nothing.
  if (decision === "describe") {
    return jsonResponse(
      { client: describeClient(client.client_name, redirect_uri, KNOWN_CLIENT_NAMES[client_id]?.label) },
      { origin },
    );
  }

  if (decision !== "approve") {
    const denyUrl = new URL(redirect_uri);
    denyUrl.searchParams.set("error", "access_denied");
    if (state) denyUrl.searchParams.set("state", state);
    return jsonResponse({ redirect_to: denyUrl.toString() }, { origin });
  }

  // Gate: connecting an AI assistant is a Pro/Power-tier ("axon_ai") feature.
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
    code_challenge_method: "S256",
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
