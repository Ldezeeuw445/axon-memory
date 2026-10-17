import { assert, assertEquals } from "jsr:@std/assert@1";
import { decide, lastState, probe, probeOnce, TARGETS } from "./uptime.ts";

const html = `<html><script type="module" src="/assets/index-BCIiqRY4.js"></script></html>`;
const health = JSON.stringify({ status: "ok", database: "ok" });
const res = (body: string, status = 200) => () => Promise.resolve(new Response(body, { status }));
const [mcp, app] = TARGETS;

Deno.test("healthy targets pass", async () => {
  assert((await probeOnce(mcp, res(health))).ok);
  assert((await probeOnce(app, res(html))).ok);
});

Deno.test("a 5xx, a broken health or a page without the bundle is down", async () => {
  assertEquals((await probeOnce(app, res("oops", 502))).reason, "status 502");
  assertEquals((await probeOnce(mcp, res(JSON.stringify({ status: "ok", database: "error" })))).reason, "database error");
  assertEquals((await probeOnce(mcp, res("<html>"))).reason, "health is not JSON");
  assertEquals((await probeOnce(app, res("<html>Cloudflare error</html>"))).reason, "page has no app bundle");
});

Deno.test("network errors are reported, not thrown", async () => {
  const p = await probeOnce(app, () => Promise.reject(new TypeError("dns failure")));
  assert(!p.ok); assertEquals(p.status, 0); assertEquals(p.reason, "dns failure");
});

Deno.test("one failure followed by success is not an outage", async () => {
  let n = 0;
  const flaky = () => Promise.resolve(n++ === 0 ? new Response("x", { status: 503 }) : new Response(html));
  assert((await probe(app, flaky, () => Promise.resolve())).ok);
});

Deno.test("down is raised once per outage, recovery once after", () => {
  const down = { name: "app", ok: false, status: 502, ms: 40, reason: "status 502" };
  const up = { name: "app", ok: true, status: 200, ms: 90 };
  assertEquals(decide([down], {}).map((a) => a.alert_type), ["uptime_down"]);
  assertEquals(decide([down], { app: "down" }), []);
  assertEquals(decide([up], { app: "down" }).map((a) => a.alert_type), ["uptime_recovered"]);
  assertEquals(decide([up], {}), []);
  assertEquals(decide([up], { app: "up" }), []);
});

Deno.test("lastState keeps the newest uptime alert per target", () => {
  const s = lastState([
    { alert_type: "uptime_recovered", metadata: { target: "app" } },
    { alert_type: "uptime_down", metadata: { target: "app" } },
    { alert_type: "uptime_down", metadata: { target: "mcp" } },
    { alert_type: "embedding_cost_cap", metadata: null },
  ]);
  assertEquals(s, { app: "up", mcp: "down" });
});
