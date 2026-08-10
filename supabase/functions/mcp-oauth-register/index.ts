// POST /mcp-oauth-register — RFC 7591 Dynamic Client Registration.
// This is what makes Claude's "Add custom connector: paste a URL" flow work
// with zero manual setup on Axon's side: Claude calls this itself the first
// time a user adds the connector, gets back a client_id, and the rest of
// the OAuth dance (authorize -> approve -> token) just works.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { randomClientId, randomToken } from "../_shared/oauth.ts";
import { sha256Hex } from "../_shared/crypto.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "invalid_request" }, { status: 405, origin });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_client_metadata" }, { status: 400, origin });
  }

  const redirectUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u: unknown) => typeof u === "string") : [];
  if (redirectUris.length === 0) {
    return jsonResponse({ error: "invalid_redirect_uri", error_description: "redirect_uris is required" }, { status: 400, origin });
  }

  const clientName: string = typeof body.client_name === "string" ? body.client_name : "Unnamed MCP client";
  const tokenEndpointAuthMethod = body.token_endpoint_auth_method ?? "none"; // "none" = public client, PKCE required
  const isPublic = tokenEndpointAuthMethod === "none";

  const clientId = randomClientId();
  let clientSecretPlain: string | null = null;
  let clientSecretHash: string | null = null;
  if (!isPublic) {
    clientSecretPlain = randomToken(24);
    clientSecretHash = await sha256Hex(clientSecretPlain);
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("oauth_clients").insert({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: clientName,
    client_uri: typeof body.client_uri === "string" ? body.client_uri : null,
    logo_uri: typeof body.logo_uri === "string" ? body.logo_uri : null,
    redirect_uris: redirectUris,
    is_public: isPublic,
    created_via: "dcr",
  });

  if (error) {
    console.error("mcp-oauth-register insert error", error);
    return jsonResponse({ error: "server_error" }, { status: 500, origin });
  }

  const response: Record<string, unknown> = {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: tokenEndpointAuthMethod,
  };
  if (clientSecretPlain) {
    response.client_secret = clientSecretPlain;
    response.client_secret_expires_at = 0; // never expires
  }

  return jsonResponse(response, { status: 201, origin });
});
