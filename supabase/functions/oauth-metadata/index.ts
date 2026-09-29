// GET /oauth-metadata?doc=authorization-server | protected-resource
// Serves RFC 8414 (Authorization Server Metadata) and RFC 9728 (Protected
// Resource Metadata) JSON. Supabase Edge Functions can't be routed at a
// literal "/.well-known/..." path (function names can't contain dots), so
// the mcp.axon-memory.com Cloudflare Worker gateway rewrites:
//   /.well-known/oauth-authorization-server -> /oauth-metadata?doc=authorization-server
//   /.well-known/oauth-protected-resource   -> /oauth-metadata?doc=protected-resource
// This is what lets any spec-compliant MCP/OAuth client (Claude included)
// auto-discover the whole flow from a single pasted URL — no manual
// client_id/secret typing required, no raw API token copy-pasting.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { APP_URL, mcpOrigin } from "../_shared/oauth.ts";

Deno.serve((req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  const url = new URL(req.url);
  const doc = url.searchParams.get("doc") ?? "authorization-server";
  const base = mcpOrigin();

  if (doc === "protected-resource") {
    return jsonResponse(
      {
        resource: base,
        authorization_servers: [base],
        bearer_methods_supported: ["header"],
        resource_documentation: `${APP_URL}/docs/mcp`,
      },
      { origin },
    );
  }

  return jsonResponse(
    {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      scopes_supported: ["memory.read", "memory.write"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      service_documentation: `${APP_URL}/docs/mcp`,
    },
    { origin },
  );
});
