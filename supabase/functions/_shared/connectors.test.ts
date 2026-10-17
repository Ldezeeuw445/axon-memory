import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  classifyError, connectorContract, deriveHealth, redactError, revokeAtProvider, STALE_AFTER_MS, STUCK_AFTER_MS,
} from "./connectors.ts";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const base = { id: "c1", provider: "gmail", status: "connected" };

Deno.test("deriveHealth: never healthy unless the last success is recent", () => {
  assertEquals(deriveHealth({ ...base, last_synced_at: ago(60e3) }, NOW), "healthy");
  assertEquals(deriveHealth({ ...base, last_synced_at: null }, NOW), "pending");
  assertEquals(deriveHealth({ ...base, last_synced_at: ago(STALE_AFTER_MS + 1) }, NOW), "stale");
  // Failed run keeps last_synced_at (last success) — still failing, not healthy.
  assertEquals(deriveHealth({ ...base, status: "error", last_synced_at: ago(60e3) }, NOW), "failing");
  assertEquals(deriveHealth({ ...base, status: "syncing", last_attempt_at: ago(60e3) }, NOW), "syncing");
  assertEquals(deriveHealth({ ...base, status: "syncing", last_attempt_at: ago(STUCK_AFTER_MS + 1) }, NOW), "stuck");
  assertEquals(deriveHealth({ ...base, status: "disconnected", last_synced_at: ago(1) }, NOW), "disconnected");
  assertEquals(deriveHealth({ ...base, provider: "jira", last_synced_at: ago(1) }, NOW), "unsupported");
  assertEquals(deriveHealth({ ...base, provider: "made_up", last_synced_at: ago(1) }, NOW), "unsupported");
});

Deno.test("contract: synchronized only when healthy; error surfaced and redacted", () => {
  const ok = connectorContract({ ...base, last_synced_at: ago(60e3), last_fetched_count: 5, last_stored_count: 2 }, 81, NOW);
  assertEquals(ok.synchronized, true);
  assertEquals(ok.error, null);
  assertEquals(ok.imported, { items: 81, last_run: { fetched: 5, stored: 2 } });
  assertEquals(ok.scope.access, "read-only");
  assert(ok.scope.requested.includes("gmail.readonly"));
  assertEquals(ok.revoke.method, "provider_api");

  const bad = connectorContract({
    ...base, status: "error", last_synced_at: ago(60e3), consecutive_failures: 3,
    last_error: "gmail list failed: 401 Bearer ya29.a0AfH6SMBsecretsecret", last_error_at: ago(10e3),
  }, 81, NOW);
  assertEquals(bad.synchronized, false);
  assertEquals(bad.health, "failing");
  assertEquals(bad.error?.kind, "auth");
  assert(!bad.error?.message?.includes("ya29"), "token must be redacted");
  assert(bad.summary.includes("3 attempts"));
  assertEquals(bad.last_success_at, ago(60e3));

  const uns = connectorContract({ ...base, provider: "discord", status: "connected" }, 0, NOW);
  assertEquals(uns.synchronized, false);
  assertEquals(uns.supported, false);
  assert(uns.summary.includes("no sync"));

  const gone = connectorContract({ ...base, status: "disconnected", last_error: "old" }, 4, NOW);
  assertEquals(gone.revoke.available, false);
  assertEquals(gone.error, null);
  assertEquals(gone.revoke.keeps_imported_memories, true);

  const gh = connectorContract({ ...base, provider: "github", last_synced_at: ago(1) }, 1, NOW);
  assert(gh.scope.note?.includes("write"), "github repo scope breadth disclosed");
});

Deno.test("classifyError and redactError", () => {
  assertEquals(classifyError("permission not granted: gmail.readonly").kind, "permission");
  assertEquals(classifyError("gmail list failed: 403 (insufficientPermissions)").kind, "permission");
  assertEquals(classifyError("refresh failed: invalid_grant").kind, "auth");
  assertEquals(classifyError("slack failed (429): ratelimited").kind, "rate_limit");
  assertEquals(classifyError("memory_items upsert failed: x").kind, "storage");
  assertEquals(classifyError("notion failed (503): down").kind, "provider");
  assertEquals(classifyError("unsupported: jira sync is not available yet").kind, "unsupported");
  assertEquals(redactError(null), null);
  assertEquals(redactError("x ghp_abcdefABCDEF123 y"), "x [redacted] y");
  assertEquals(redactError("k " + "a".repeat(50)), "k [redacted]");
  assert((redactError("z".repeat(10) + " ".repeat(5) + "w".repeat(10) + " q".repeat(400)) ?? "").length <= 300);
});

Deno.test("revokeAtProvider: only where an API exists; reports truthfully", async () => {
  const calls: string[] = [];
  const okFetch = ((url: string) => { calls.push(String(url)); return Promise.resolve(new Response('{"ok":true}', { status: 200 })); }) as typeof fetch;
  const failFetch = (() => Promise.resolve(new Response("no", { status: 400 }))) as typeof fetch;
  assertEquals((await revokeAtProvider("gmail", "acc", "ref", okFetch)).revoked, true);
  assertEquals(calls[0], "https://oauth2.googleapis.com/revoke");
  assertEquals((await revokeAtProvider("slack", "t", null, okFetch)).revoked, true);
  assertEquals((await revokeAtProvider("linear", "t", null, failFetch)), { attempted: true, revoked: false, detail: "linear 400" });
  assertEquals((await revokeAtProvider("github", "t", null, okFetch)), { attempted: false, revoked: false, detail: "manual" });
  assertEquals((await revokeAtProvider("gmail", null, null, okFetch)).detail, "no token stored");
  const throwing = (() => Promise.reject(new Error("net down"))) as typeof fetch;
  assertEquals((await revokeAtProvider("gmail", "a", null, throwing)).revoked, false);
});
