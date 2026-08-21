// GET /functions/v1/oauth-callback?code=...&state=...
// Public (no user JWT — the provider hits this directly). Verified via signed `state`.
// Exchanges the code for tokens, encrypts + upserts source_connections, then
// redirects the browser back into the app.
import { handlePreflight } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { PROVIDERS, Provider, redirectUri } from "../_shared/providers.ts";
import { encryptToken, parseState } from "../_shared/crypto.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

function redirectToApp(pathAndQuery: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_URL}${pathAndQuery}` },
  });
}

async function exchangeCode(provider: Provider, code: string) {
  const cfg = PROVIDERS[provider];

  // Notion is the odd one out: its token endpoint expects HTTP Basic auth and
  // a JSON body, not the client credentials form-encoded alongside the code.
  // Sending it the same shape as Google and GitHub fails the exchange even
  // when the redirect URI and the credentials are all correct.
  const isNotion = provider === "notion";

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": isNotion ? "application/json" : "application/x-www-form-urlencoded",
  };
  let body: string;

  if (isNotion) {
    headers.Authorization = `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`;
    body = JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    });
  } else {
    body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }).toString();
  }

  const res = await fetch(cfg.tokenUrl, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);

  const json = await res.json();
  // Slack answers 200 with {ok:false,error:"..."} rather than an HTTP error, so
  // a failed exchange would otherwise sail through as success.
  if (json?.ok === false) throw new Error(`slack_${json.error ?? "unknown"}`);
  // GitHub does the same with a bare {error, error_description}, and Google
  // returns {error} on a rejected code. Without this the failure only surfaces
  // further down, where the cause is no longer visible.
  if (typeof json?.error === "string") {
    throw new Error(`${json.error}${json.error_description ? `: ${String(json.error_description).slice(0, 140)}` : ""}`);
  }
  if (!json?.access_token) throw new Error("no_access_token_in_response");
  return json;
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) return redirectToApp(`/?facet=connections&error=${encodeURIComponent(errorParam)}`);
  if (!code || !stateRaw) return redirectToApp("/?facet=connections&error=missing_params");

  // The provider now comes out of the signed state rather than the query, so
  // the callback URL can stay clean and there is nothing to cross-check.
  let userId: string;
  let provider: Provider;
  try {
    const state = await parseState(stateRaw);
    if (Date.now() - state.ts > 10 * 60 * 1000) throw new Error("state expired");
    if (!(state.provider in PROVIDERS)) throw new Error("unknown provider in state");
    userId = state.userId;
    provider = state.provider as Provider;
  } catch {
    return redirectToApp("/?facet=connections&error=invalid_state");
  }

  try {
    const tokens = await exchangeCode(provider, code);
    const accessToken = tokens.access_token as string;
    const refreshToken = (tokens.refresh_token as string) ?? null;
    const expiresIn = (tokens.expires_in as number) ?? null;

    const admin = supabaseAdmin();
    let label: string | null = null;

    // Best-effort: fetch a human-readable label for the connected account
    try {
      if (provider === "gmail") {
        const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (r.ok) label = (await r.json()).email ?? null;
      } else if (provider === "github") {
        const r = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "axon-memory" },
        });
        if (r.ok) label = (await r.json()).login ?? null;
      } else if (provider === "slack") {
        label = tokens.team?.name ?? null;
      } else if (provider === "notion") {
        label = tokens.workspace_name ?? null;
      } else if (provider === "linear") {
        // Linear names the organisation, not the person — which is the useful
        // label here, since that is what the issues belong to.
        const r = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "{ organization { name } }" }),
        });
        if (r.ok) label = (await r.json())?.data?.organization?.name ?? null;
      }
    } catch {
      // non-fatal
    }

    await admin.from("source_connections").upsert(
      {
        user_id: userId,
        provider,
        status: "connected",
        external_account_label: label,
        access_token_encrypted: await encryptToken(accessToken),
        refresh_token_encrypted: refreshToken ? await encryptToken(refreshToken) : null,
        token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        last_error: null,
      },
      { onConflict: "user_id,provider" },
    );

    return redirectToApp(`/?facet=connections&connected=${provider}`);
  } catch (err) {
    // Every failure in this block used to come back as "token_exchange_failed",
    // database writes and encryption included, which hid the actual cause.
    console.error("oauth-callback error", err);
    const reason = err instanceof Error ? err.message : String(err);
    return redirectToApp(`/?facet=connections&error=${encodeURIComponent(reason.slice(0, 180))}`);
  }
});
