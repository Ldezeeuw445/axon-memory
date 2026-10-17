// POST /mcp-oauth-token   (application/x-www-form-urlencoded, per RFC 6749)
//
// grant_type=authorization_code: exchanges a one-time code (+ PKCE verifier,
//   S256 only) for an access token and a refresh token.
// grant_type=refresh_token: rotates both (A5-5). The connection keeps the same
//   api_keys row, so its name, scope, revoke button and the provenance of
//   everything it captured stay attached to one identity.
//
// The access token is stored exactly like a manually-created API key (sha256
// in `api_keys`), so context-pack, mcp-server and `remember` all authenticate
// it identically. That is why Claude/ChatGPT/Gemini connected this way read
// and write the *same* memory as everything else in the account.
//
// Tokens issued before A5-5 have no expiry and keep working (grandfathered).
// Public: a standard OAuth token endpoint, called by clients we never see.
import { handlePublicPreflight as handlePreflight, publicJsonResponse as jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  ACCESS_TOKEN_TTL_S,
  expiryIso,
  KNOWN_CLIENT_NAMES,
  newRefreshToken,
  REFRESH_TOKEN_TTL_S,
  verifyPkce,
} from "../_shared/oauth.ts";
import { newApiKey, sha256Hex } from "../_shared/crypto.ts";

type Admin = ReturnType<typeof supabaseAdmin>;

async function authenticateClient(admin: Admin, clientId: string, clientSecret: string | null) {
  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, client_secret_hash, is_public")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client) return { error: "invalid_client" as const, status: 400 };
  if (!client.is_public) {
    const providedHash = clientSecret ? await sha256Hex(clientSecret) : null;
    if (!providedHash || providedHash !== client.client_secret_hash) return { error: "invalid_client" as const, status: 401 };
  }
  return { client };
}

async function newTokenSet() {
  const { plaintext, prefix } = newApiKey();
  const refresh = newRefreshToken();
  return {
    access: plaintext,
    prefix,
    accessHash: await sha256Hex(plaintext),
    refresh,
    refreshHash: await sha256Hex(refresh),
    accessExpiresAt: expiryIso(ACCESS_TOKEN_TTL_S),
    refreshExpiresAt: expiryIso(REFRESH_TOKEN_TTL_S),
  };
}

function tokenResponse(t: Awaited<ReturnType<typeof newTokenSet>>, scope: string | null, origin: string | null) {
  return jsonResponse(
    {
      access_token: t.access,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_S,
      refresh_token: t.refresh,
      scope,
    },
    { origin },
  );
}

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
  const clientId = params.get("client_id");
  const clientSecret = params.get("client_secret");
  const admin = supabaseAdmin();

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken || !clientId) return jsonResponse({ error: "invalid_request" }, { status: 400, origin });
    const auth = await authenticateClient(admin, clientId, clientSecret);
    if ("error" in auth) return jsonResponse({ error: auth.error }, { status: auth.status, origin });

    const oldHash = await sha256Hex(refreshToken);
    const { data: key } = await admin
      .from("api_keys")
      .select("id, oauth_client_id, scope, revoked_at, refresh_expires_at")
      .eq("refresh_token_hash", oldHash)
      .maybeSingle();
    if (!key || key.revoked_at || key.oauth_client_id !== clientId) {
      return jsonResponse({ error: "invalid_grant" }, { status: 400, origin });
    }
    if (key.refresh_expires_at && new Date(key.refresh_expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "invalid_grant", error_description: "refresh token expired; reconnect" }, { status: 400, origin });
    }

    const t = await newTokenSet();
    // Compare-and-swap on the old hash: two concurrent refreshes cannot both win.
    const { data: rotated, error: rotErr } = await admin
      .from("api_keys")
      .update({
        key_hash: t.accessHash,
        key_prefix: t.prefix,
        access_expires_at: t.accessExpiresAt,
        refresh_token_hash: t.refreshHash,
        refresh_expires_at: t.refreshExpiresAt,
        refreshed_at: new Date().toISOString(),
      })
      .eq("id", key.id)
      .eq("refresh_token_hash", oldHash)
      .is("revoked_at", null)
      .select("id");
    if (rotErr) {
      console.error("mcp-oauth-token refresh error", rotErr);
      return jsonResponse({ error: "server_error" }, { status: 500, origin });
    }
    if (!rotated || rotated.length !== 1) return jsonResponse({ error: "invalid_grant" }, { status: 400, origin });
    return tokenResponse(t, key.scope, origin);
  }

  if (grantType !== "authorization_code") {
    return jsonResponse({ error: "unsupported_grant_type" }, { status: 400, origin });
  }

  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");

  if (!code || !redirectUri || !clientId) {
    return jsonResponse({ error: "invalid_request" }, { status: 400, origin });
  }

  const auth = await authenticateClient(admin, clientId, clientSecret);
  if ("error" in auth) return jsonResponse({ error: auth.error }, { status: auth.status, origin });
  const client = auth.client;

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

  const pkceOk = await verifyPkce(codeVerifier, authCode.code_challenge, authCode.code_challenge_method, client.is_public !== false);
  if (!pkceOk) {
    return jsonResponse({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400, origin });
  }

  // Consume the code (single use). Conditional, so a replayed code that raced
  // the first redemption cannot mint a second token.
  const { data: consumed } = await admin
    .from("oauth_authorization_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", authCode.id)
    .is("used_at", null)
    .select("id");
  if (!consumed || consumed.length !== 1) return jsonResponse({ error: "invalid_grant" }, { status: 400, origin });

  const t = await newTokenSet();
  const friendlyName = KNOWN_CLIENT_NAMES[clientId]?.label ?? client.client_name;

  const { error: insertErr } = await admin.from("api_keys").insert({
    user_id: authCode.user_id,
    name: friendlyName,
    key_prefix: t.prefix,
    key_hash: t.accessHash,
    oauth_client_id: clientId,
    scope: authCode.scope,
    access_expires_at: t.accessExpiresAt,
    refresh_token_hash: t.refreshHash,
    refresh_expires_at: t.refreshExpiresAt,
  });
  if (insertErr) {
    console.error("mcp-oauth-token insert error", insertErr);
    return jsonResponse({ error: "server_error" }, { status: 500, origin });
  }

  return tokenResponse(t, authCode.scope, origin);
});
