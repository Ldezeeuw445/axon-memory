// GET /functions/v1/connectors            -> { connectors: ConnectorContract[] }
// GET /functions/v1/connectors?id=<uuid>  -> ConnectorContract
// The A8-1 connector runtime contract for the signed-in app. Same builder as
// GET /v1/connectors (token API), so the card and the API cannot disagree
// about whether something is synchronised. Revoke is disconnect-source.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { CATALOG, listConnectors } from "../_shared/connectors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");
  if (req.method !== "GET") return jsonResponse({ error: "GET only" }, { status: 405, origin });

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });

  const id = new URL(req.url).searchParams.get("id");
  if (id && !UUID.test(id)) return jsonResponse({ error: "id must be a uuid" }, { status: 400, origin });

  try {
    const list = await listConnectors(supabaseAdmin(), auth.user.id, id ?? undefined);
    if (id) {
      if (!list[0]) return jsonResponse({ error: "Connection not found" }, { status: 404, origin });
      return jsonResponse(list[0], { origin });
    }
    // The catalog too, so the app can explain a provider's permissions before
    // anyone connects it, and show unsupported ones as unsupported.
    const catalog = Object.entries(CATALOG).map(([provider, e]) => ({
      provider, name: e.name, supported: e.supported, explanation: e.reads,
      requested_scopes: e.requested_scopes, ...(e.grant_note ? { note: e.grant_note } : {}),
      manage_url: e.manage_url, revoke_method: e.revoke_method,
    }));
    return jsonResponse({ connectors: list, catalog }, { origin });
  } catch (err) {
    console.error("connectors:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "could not read connections" }, { status: 500, origin });
  }
});
