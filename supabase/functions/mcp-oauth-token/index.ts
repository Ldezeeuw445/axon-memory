// POST /mcp-oauth-token   (application/x-www-form-urlencoded, per RFC 6749)
// grant_type=authorization_code -> exchanges a one-time code (+ PKCE verifier)
// for a long-lived access token. The token is stored the exact same way a
// manually-created API key is (sha256 in `api_keys`), so context-pack,
// mcp-server, and the `remember` endpoint all authenticate it identically —
// this is precisely why Claude/ChatGPT/Gemini connected this way all read
// and write the *same* memory as everything else in the account.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { verifyPkce, KNOWN_CLIENT_NAMES } from "../_shared/oauth.ts";
import { newApiKey, sha256Hex } from "../_shared/crypto.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "invalid_request" }, { status: 405, origin });

  const contentType = req.headers.get("content-type") ?? "";
  let params: URLSearchParams;
  if (contentType.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    params = new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]));
  } else {
    params = new URLSearchParams(await req.text());
  }

  const grantType = params.get("grant_type");
  if (grantType !== "authorization_code") {
    return jsonResponse({ error: "unsupported_grant_type" }, { status: 400, origin });
  }

  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const clientId = params.get("client_id");
  const codeVerifier = params.get("code_verifier");
  const clientSecret = params.get("client_secret");

  if (!code || !redirectUri || !clientId) {
    return jsonResponse({ error: "invalid_request" }, { status: 400, origin });
  }

  const admin = supabaseAdmin();

  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, client_secret_hash, is_public")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client) return jsonResponse({ error: "invalid_client" }, { status: 400, origin });

  if (!client.is_public) {
    const providedHash = clientSecret ? await sha256Hex(clientSecret) : null;
    if (!providedHash || providedHash !== client.client_secret_hash) {
      return jsonResponse({ error: "invalid_client" }, { status: 401, origin });
    }
  }

  const codeHash = await sha256Hex(code);
  const { data: authCode } = await admin
    .from("oauth_authorization_codes")
    .select("*")
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .maybeSingle();

  if (!authCode || authCode.client_id !== clientId || authCode.redirect_uri !== redirectUri) {
    return jsonResponse({ error: "invalid_grant" }, { status: 400, origin });
  }
  if (new Date(authCode.expires_at).getTime() < Date.now()) {
    return jsonResponse({ error: "invalid_grant", error_description: "code expired" }, { status: 400, origin });
  }

  const pkceOk = await verifyPkce(codeVerifier, authCode.code_challenge, authCode.code_challenge_method);
  if (!pkceOk) {
    return jsonResponse({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400, origin });
  }

  // Consume the code (single use).
  await admin.from("oauth_authorization_codes").update({ used_at: new Date().toISOString() }).eq("id", authCode.id);

  const { plaintext, prefix } = newApiKey();
  const keyHash = await sha256Hex(plaintext);
  const friendlyName = KNOWN_CLIENT_NAMES[clientId]?.label ?? client.client_name;

  const { error: insertErr } = await admin.from("api_keys").insert({
    user_id: authCode.user_id,
    name: friendlyName,
    key_prefix: prefix,
    key_hash: keyHash,
    oauth_client_id: clientId,
    scope: authCode.scope,
  });
  if (insertErr) {
    console.error("mcp-oauth-token insert error", insertErr);
    return jsonResponse({ error: "server_error" }, { status: 500, origin });
  }

  return jsonResponse(
    {
      access_token: plaintext,
      token_type: "Bearer",
      scope: authCode.scope,
      // No expiry: revocable any time from the AI Adapters page instead of
      // forcing a refresh-token dance for v1. Clients that ask for a
      // refresh_token simply won't get one — that's spec-legal.
    },
    { origin },
  );
});
