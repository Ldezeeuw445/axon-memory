// GET /functions/v1/context-pack?query=...&limit_tokens=1500
// Auth: either a normal user JWT (in-app "preview my context pack"), or an
// Axon access token (Authorization: Bearer axon_live_... — manually created
// OR issued via the OAuth/MCP connector flow, both resolve identically).
// This, mcp-server's recall_context tool, and remember all share the exact
// same read/write core (_shared/memory-core.ts) against the same
// memory_items table — that's the whole shared-memory guarantee in one file.
// Public: the read path, same callers as remember.
import { handlePublicPreflight as handlePreflight, publicJsonResponse as jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { resolveBearerToken } from "../_shared/mcp-auth.ts";
import { buildContextPack } from "../_shared/memory-core.ts";

async function resolveUser(req: Request) {
  const viaJwt = await getUserFromRequest(req);
  // No client label on the JWT path on purpose: this is the person looking at
  // their own memory in their own browser, which is not another app reading it.
  if (viaJwt) {
    return { userId: viaJwt.user.id, apiKeyId: null as string | null, clientLabel: null as string | null };
  }

  const resolved = await resolveBearerToken(req);
  if (!resolved) return null;
  return { userId: resolved.userId, apiKeyId: resolved.apiKeyId, clientLabel: resolved.clientLabel };
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  const identity = await resolveUser(req);
  if (!identity) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });

  const url = new URL(req.url);

  /*
   * Read the arguments from the body as well as the query string.
   *
   * This endpoint was documented as a GET and only ever looked at search
   * params. The app's own chat posts JSON — so every question it asked arrived
   * with the query silently dropped, the search fell back to recency, and the
   * answer came back general. It looked like it was working: a pack returned,
   * facts appeared, a recall was logged. Only context_pack_logs gave it away,
   * with a null query beside a question somebody had definitely typed.
   *
   * A caller that sends arguments should not have to know which of two places
   * this one happens to read. Search params still win, so nothing that already
   * works changes.
   */
  const body = req.method === "POST"
    ? await req.json().catch(() => ({}))
    : {};

  const pick = (name: string) => {
    const fromUrl = url.searchParams.get(name)?.trim();
    if (fromUrl) return fromUrl;
    const fromBody = body?.[name];
    return typeof fromBody === "string" && fromBody.trim() ? fromBody.trim() : null;
  };

  const query = pick("query");
  const tokenBudget = Number(url.searchParams.get("limit_tokens"))
    || (typeof body?.token_budget === "number" ? body.token_budget : undefined);
  // By key, so a caller can ask for ?project=trading-os without a lookup.
  // Absent means everything, which is the right default for a client that has
  // not said what it is working on.
  const project = pick("building");

  const admin = supabaseAdmin();
  const pack = await buildContextPack(admin, identity.userId, {
    query,
    tokenBudget,
    apiKeyId: identity.apiKeyId,
    clientLabel: identity.clientLabel,
    project,
  });

  return jsonResponse(pack, { origin });
});
