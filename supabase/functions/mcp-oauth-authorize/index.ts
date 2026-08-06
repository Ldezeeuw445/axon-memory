// GET /mcp-oauth-authorize?client_id=...&redirect_uri=...&state=...&code_challenge=...
// Public (no Axon session here — the AI tool's browser/webview hits this
// directly). Validates the request against the registered client, then
// bounces the browser into the logged-in React app's consent screen, which
// calls mcp-oauth-consent (with the user's own JWT) to actually approve.
import { handlePreflight } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { APP_URL, redirectUriAllowed } from "../_shared/oauth.ts";

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const p = url.searchParams;
  const clientId = p.get("client_id");
  const redirectUri = p.get("redirect_uri");
  const responseType = p.get("response_type") ?? "code";

  if (!clientId || !redirectUri || responseType !== "code") {
    return redirect(`${APP_URL}/connect/error?reason=invalid_request`);
  }

  const admin = supabaseAdmin();
  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris, logo_uri")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!client) return redirect(`${APP_URL}/connect/error?reason=unknown_client`);
  if (!redirectUriAllowed(client.redirect_uris, redirectUri)) {
    return redirect(`${APP_URL}/connect/error?reason=redirect_uri_mismatch`);
  }

  // Hand everything the app needs off to the consent screen as query params.
  const forward = new URLSearchParams({
    client_id: clientId,
    client_name: client.client_name,
    redirect_uri: redirectUri,
    state: p.get("state") ?? "",
    scope: p.get("scope") ?? "memory.read memory.write",
    code_challenge: p.get("code_challenge") ?? "",
    code_challenge_method: p.get("code_challenge_method") ?? "S256",
  });

  return redirect(`${APP_URL}/connect/authorize?${forward.toString()}`);
});
