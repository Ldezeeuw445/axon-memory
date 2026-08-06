// GET /functions/v1/oauth-start?provider=gmail|github|notion|slack
// Requires a valid user JWT. Redirects the browser to the provider's consent screen.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { PROVIDERS, Provider } from "../_shared/providers.ts";
import { signState } from "../_shared/crypto.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") as Provider | null;

  if (!provider || !(provider in PROVIDERS)) {
    return jsonResponse({ error: "Unknown or missing provider" }, { status: 400, origin });
  }

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });

  const state = await signState(auth.user.id, provider);
  const authorizeUrl = PROVIDERS[provider].authorizeUrl(state);

  return jsonResponse({ url: authorizeUrl }, { origin });
});
