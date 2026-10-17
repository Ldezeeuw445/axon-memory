// The consent screen names whoever is asking. A link used to be able to choose
// that name itself; these pin what the server decides instead.
//
// Run with:  npm test
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describeClient } from "./oauth-client.ts";

Deno.test("a registered name of 'Claude' with a stranger's redirect is not Claude", () => {
  const d = describeClient("Claude", "https://evil.example/callback");
  assertEquals(d.verified, false);
  assertEquals(d.slug, null);
  assertEquals(d.host, "evil.example");
  assertEquals(d.name, "evil.example"); // the title names where the code goes
  assertEquals(d.registeredName, "Claude"); // only in the warning
});

Deno.test("the destination decides: claude.ai is Claude whatever it registered as", () => {
  const d = describeClient("mcp-client-7f3", "https://claude.ai/api/mcp/auth_callback");
  assertEquals([d.name, d.slug, d.verified, d.local], ["Claude", "claude", true, false]);
  assertEquals(describeClient("x", "https://chatgpt.com/connector_platform_oauth_redirect").slug, "chatgpt");
});

Deno.test("a lookalike host is not a known one", () => {
  assertEquals(describeClient("Claude", "https://claude.ai.evil.example/cb").verified, false);
  assertEquals(describeClient("Claude", "https://notclaude.ai/cb").verified, false);
});

Deno.test("a local app is named as local and never verified by name alone", () => {
  const loop = describeClient("Claude Code", "http://localhost:33418/callback");
  assertEquals([loop.local, loop.verified, loop.host, loop.name], [true, false, "localhost", "Claude Code"]);
  const scheme = describeClient("Cursor", "cursor://anysphere.cursor-retrieval/oauth/callback");
  assertEquals([scheme.local, scheme.verified, scheme.host], [true, false, "cursor"]);
});

Deno.test("clients AXON seeded itself carry their own label", () => {
  const d = describeClient("whatever", "https://chat.openai.com/aip/g-abc/oauth/callback", "ChatGPT");
  assertEquals([d.name, d.slug, d.verified], ["ChatGPT", "chatgpt", true]);
});

Deno.test("an empty or broken registration still says something honest", () => {
  const d = describeClient("   ", "not a url");
  assertEquals([d.name, d.host, d.verified], ["An unnamed app", "", false]);
});
