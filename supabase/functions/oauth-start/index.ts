// GET /functions/v1/oauth-start?provider=gmail|github|notion|slack
// Requires a valid user JWT. Redirects the browser to the provider's consent screen.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { PROVIDERS, Provider, isProviderConfigured } from "../_shared/providers.ts";
import { signState } from "../_shared/crypto.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") as Provider | null;

  /* Which connectors this deployment can actually start, asked before anybody
     presses anything.

     The check below has always refused a provider with no credentials, but only
     after the click — so the interface offered eight sources, two of which
     answered with an error the moment you chose them. Being told afterwards
     that something was never going to work is exactly the experience this
     product exists to remove, and there is no reason for it: the answer is
     known before the screen is drawn.

     Names only. Whether a client id exists is not a secret; the id itself is
     never returned. */
  if (url.searchParams.get("providers") === "list") {
    const all = Object.keys(PROVIDERS) as Provider[];
    return jsonResponse({
      configured: all.filter((p) => isProviderConfigured(p)),
      all,
    }, { origin });
  }

  if (!provider || !(provider in PROVIDERS)) {
    return jsonResponse({ error: "Unknown or missing provider" }, { status: 400, origin });
  }

  // Checked before anyone is sent anywhere. Without it a connector that has no
  // credentials in this deployment still produced a consent URL, and the
  // failure surfaced as the provider's own error page.
  if (!isProviderConfigured(provider)) {
    return jsonResponse(
      { error: `${provider} is not set up on this deployment yet.` },
      { status: 501, origin },
    );
  }

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });

  const state = await signState(auth.user.id, provider);
  const authorizeUrl = PROVIDERS[provider].authorizeUrl(state);

  return jsonResponse({ url: authorizeUrl }, { origin });
});
