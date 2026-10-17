import { assertEquals } from "jsr:@std/assert@1";
import { accessTokenExpired, base64UrlSha256, expiryIso, newRefreshToken, pkceRequestError, PKCE_METHODS, verifyPkce } from "./oauth.ts";

Deno.test("PKCE: only S256 is offered", () => {
  assertEquals([...PKCE_METHODS], ["S256"]);
});

Deno.test("PKCE request validation (A5-4)", () => {
  const ch = "ngF5GsXcbwljx6u133FFr3Xht9xooA_DuaX_3QwODtc"; // sha256 base64url of the verifier below
  assertEquals(pkceRequestError({ isPublic: true, challenge: ch, method: "S256" }), null);
  assertEquals(pkceRequestError({ isPublic: true, challenge: ch, method: null }), null); // default S256
  assertEquals(typeof pkceRequestError({ isPublic: true, challenge: ch, method: "plain" }), "string");
  assertEquals(typeof pkceRequestError({ isPublic: true, challenge: "", method: "S256" }), "string");
  assertEquals(typeof pkceRequestError({ isPublic: true, challenge: "short", method: "S256" }), "string");
  assertEquals(pkceRequestError({ isPublic: false, challenge: "", method: null }), null); // confidential may skip
  assertEquals(typeof pkceRequestError({ isPublic: false, challenge: ch, method: "plain" }), "string");
});

Deno.test("PKCE verification refuses plain and missing verifiers", async () => {
  const verifier = "dBjftJeZ4CVP-mJ92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const ch = await base64UrlSha256(verifier);
  assertEquals(ch, "ngF5GsXcbwljx6u133FFr3Xht9xooA_DuaX_3QwODtc"); // = node crypto base64url(sha256)
  assertEquals(await verifyPkce(verifier, ch, "S256"), true);
  assertEquals(await verifyPkce("wrong", ch, "S256"), false);
  assertEquals(await verifyPkce(verifier, verifier, "plain"), false);
  assertEquals(await verifyPkce(null, ch, "S256"), false);
  assertEquals(await verifyPkce(null, null, null, true), false); // public client without PKCE
  assertEquals(await verifyPkce(null, null, null, false), true); // confidential client
});

Deno.test("token expiry: NULL is grandfathered, past is expired (A5-5)", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  assertEquals(accessTokenExpired(null, now), false);
  assertEquals(accessTokenExpired(undefined, now), false);
  assertEquals(accessTokenExpired("2026-10-17T11:59:59Z", now), true);
  assertEquals(accessTokenExpired("2026-10-17T12:00:01Z", now), false);
  assertEquals(expiryIso(3600, now), "2026-10-17T13:00:00.000Z");
  const r = newRefreshToken();
  assertEquals(r.startsWith("axon_refresh_") && r.length === 13 + 64, true);
});
