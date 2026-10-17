// node --test cloudflare/mcp-gateway/worker.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const BASE = "https://ktaditgtbubonrahyiig.supabase.co/functions/v1";
function route(path, init = {}) {
  const seen = [];
  globalThis.fetch = async (url, opts) => { seen.push({ url, opts }); return new Response("ok", { status: 200 }); };
  return worker.fetch(new Request("https://mcp.axon-memory.com" + path, init)).then((r) => ({ r, seen }));
}

test("MCP root still proxies to mcp-server with auth header intact", async () => {
  const { seen } = await route("/", { method: "POST", headers: { authorization: "Bearer x" }, body: "{}" });
  assert.equal(seen[0].url, BASE + "/mcp-server");
  assert.equal(seen[0].opts.headers.get("authorization"), "Bearer x");
  assert.equal(seen[0].opts.redirect, "manual");
});

test("OAuth routes unchanged", async () => {
  assert.equal((await route("/token", { method: "POST", body: "a=b" })).seen[0].url, BASE + "/mcp-oauth-token");
  assert.equal((await route("/.well-known/oauth-protected-resource")).seen[0].url, BASE + "/oauth-metadata?doc=protected-resource");
});

test("/health routes to the mcp-server health probe", async () => {
  assert.equal((await route("/health")).seen[0].url, BASE + "/mcp-server?health=1");
});

test("unknown paths are 404 and never proxied", async () => {
  const { r, seen } = await route("/admin");
  assert.equal(r.status, 404);
  assert.equal(seen.length, 0);
});

test("/v1/* routes to the api-v1 function with path and query intact (A7-1)", async () => {
  assert.equal((await route("/v1/memories/abc?x=1", { method: "GET" })).seen[0].url, BASE + "/api-v1/v1/memories/abc?x=1");
  const { seen } = await route("/v1/recall", { method: "POST", headers: { authorization: "Bearer k" }, body: "{}" });
  assert.equal(seen[0].url, BASE + "/api-v1/v1/recall");
  assert.equal(seen[0].opts.headers.get("authorization"), "Bearer k");
  assert.equal((await route("/v1x")).r.status, 404);
});
