// GET /functions/v1/context-pack?query=...&limit_tokens=1500
// Auth: either a normal user JWT (in-app "preview my context pack"), or an
// Axon access token (Authorization: Bearer axon_live_... — manually created
// OR issued via the OAuth/MCP connector flow, both resolve identically).
// This, mcp-server's recall_context tool, and remember all share the exact
// same read/write core (_shared/memory-core.ts) against the same
// memory_items table — that's the whole shared-memory guarantee in one file.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { resolveBearerToken } from "../_shared/mcp-auth.ts";
import { buildContextPack } from "../_shared/memory-core.ts";

async function resolveUser(req: Request) {
  const viaJwt = await getUserFromRequest(req);
  if (viaJwt) return { userId: viaJwt.user.id, apiKeyId: null as string | null };

  const resolved = await resolveBearerToken(req);
  if (!resolved) return null;
  return { userId: resolved.userId, apiKeyId: resolved.apiKeyId };
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  const identity = await resolveUser(req);
  if (!identity) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });

  const url = new URL(req.url);
  const query = url.searchParams.get("query")?.trim() || null;
  const tokenBudget = Number(url.searchParams.get("limit_tokens")) || undefined;

  const admin = supabaseAdmin();
  const pack = await buildContextPack(admin, identity.userId, {
    query,
    tokenBudget,
    apiKeyId: identity.apiKeyId,
  });

  return jsonResponse(pack, { origin });
});
