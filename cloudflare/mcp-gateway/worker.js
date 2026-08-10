// mcp.axon-memory.com gateway
//
// Supabase Edge Function names can't contain dots, so they can't be
// addressed at literal paths like "/.well-known/oauth-authorization-server".
// This tiny Worker gives the MCP/OAuth layer a clean, spec-correct vanity
// domain by rewriting a handful of well-known paths onto the real Supabase
// function URLs. It has no logic of its own beyond routing — all auth,
// PKCE, and memory read/write happens in the Supabase functions it proxies
// to, so there is exactly one place that logic lives.
const SUPABASE_FUNCTIONS_BASE = "https://ktaditgtbubonrahyiig.supabase.co/functions/v1";

const ROUTES = [
  { match: "/.well-known/oauth-authorization-server", target: "/oauth-metadata?doc=authorization-server" },
  { match: "/.well-known/oauth-protected-resource", target: "/oauth-metadata?doc=protected-resource" },
  { match: "/register", target: "/mcp-oauth-register" },
  { match: "/authorize", target: "/mcp-oauth-authorize" },
  { match: "/token", target: "/mcp-oauth-token" },
];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    for (const route of ROUTES) {
      if (url.pathname === route.match) {
        const targetUrl = new URL(SUPABASE_FUNCTIONS_BASE + route.target);
        for (const [k, v] of url.searchParams) targetUrl.searchParams.append(k, v);
        return proxy(request, targetUrl);
      }
    }

    // Everything else (the MCP root "/" and any sub-path) -> mcp-server,
    // which is the Streamable HTTP JSON-RPC endpoint itself.
    if (url.pathname === "/" || url.pathname === "") {
      return proxy(request, new URL(SUPABASE_FUNCTIONS_BASE + "/mcp-server"));
    }

    return new Response("Not found", { status: 404 });
  },
};

async function proxy(request, targetUrl) {
  const init = {
    method: request.method,
    headers: request.headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    // Critical: mcp-oauth-authorize / mcp-oauth-consent respond with 302s that
    // send the *browser* on to app.axon-memory.com. Without "manual", the
    // Workers runtime follows redirects itself server-side and tries to fetch
    // app.axon-memory.com from inside the Worker — which is a different host
    // than this gateway proxies to and isn't guaranteed to be reachable from
    // here, so the client would get a bogus/failed response instead of the
    // 302 it actually needs to follow.
    redirect: "manual",
  };
  const resp = await fetch(targetUrl.toString(), init);
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(resp.body, { status: resp.status, headers });
}
