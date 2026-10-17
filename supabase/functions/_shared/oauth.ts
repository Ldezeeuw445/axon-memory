// Shared helpers for Axon Memory's MCP/OAuth connector layer (the thing that
// lets Claude/ChatGPT/Gemini/Cursor attach via a real login+approve flow
// instead of a pasted API key). Built on the same primitives already used
// for provider OAuth (crypto.ts) and API keys (sha256Hex, newApiKey).
import { sha256Hex } from "./crypto.ts";

export const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

/**
 * The MCP gateway's own origin, derived from APP_URL:
 * https://app.axon-memory.com -> https://mcp.axon-memory.com
 *
 * Lives here because it was written out three times — and the copy in
 * mcp-server did `.replace("https://", "https://mcp.")`, which keeps the
 * existing subdomain and yields https://mcp.app.axon-memory.com, a host that
 * does not resolve. That string is what a 401 hands clients as the place to
 * discover the OAuth flow, so the discovery leg was pointing into nothing.
 *
 * Localhost has no root domain to prefix, so dev is left alone.
 */
export function mcpOrigin(): string {
  try {
    const u = new URL(APP_URL);
    if (!u.hostname.includes(".")) return APP_URL;
    return `${u.protocol}//mcp.${u.hostname.split(".").slice(-2).join(".")}`;
  } catch {
    return APP_URL;
  }
}
const CODE_TTL_MS = 5 * 60 * 1000; // authorization codes are short-lived

export function randomToken(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomClientId(): string {
  // "axon_client_" + 20 url-safe chars — readable, not guessable.
  const b = crypto.getRandomValues(new Uint8Array(15));
  const b64 = btoa(String.fromCharCode(...b)).replace(/[+/=]/g, "");
  return `axon_client_${b64}`;
}

export async function base64UrlSha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * PKCE is S256 only (A5-4).
 *
 * `plain` sends the verifier itself as the challenge, so anyone who sees the
 * authorization request can redeem the code. Before turning it off, every
 * grant ever issued was checked: all 13 stored codes (2026-08-11 → 2026-10-15)
 * were S256 with a challenge, so no connected client relied on `plain`.
 *
 * Public clients (no secret) must send a challenge. Confidential clients may
 * still skip PKCE, because their client_secret authenticates the redemption,
 * and dropping that would break a pre-seeded Actions client for no gain.
 */
export const PKCE_METHODS = ["S256"] as const;

/** Why an authorization request's PKCE parameters are unacceptable, or null. */
export function pkceRequestError(
  p: { isPublic: boolean; challenge?: string | null; method?: string | null },
): string | null {
  const challenge = (p.challenge ?? "").trim();
  const method = (p.method ?? "").trim();
  if (method && method !== "S256") return "code_challenge_method must be S256 (plain is not supported)";
  if (!challenge && p.isPublic) return "PKCE code_challenge (S256) is required for public clients";
  if (challenge && !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return "code_challenge must be a base64url S256 digest";
  return null;
}

export async function verifyPkce(
  codeVerifier: string | null | undefined,
  codeChallenge: string | null | undefined,
  method: string | null | undefined,
  isPublic = true,
): Promise<boolean> {
  if (!codeChallenge) return !isPublic; // only a confidential client may skip PKCE
  if (!codeVerifier) return false;
  if ((method ?? "S256") !== "S256") return false; // plain (or anything else) is refused
  return (await base64UrlSha256(codeVerifier)) === codeChallenge;
}

/**
 * Token lifetimes (A5-5).
 *
 * Tokens issued before this existed have NULL `access_expires_at` and keep
 * working until revoked (grandfathered), so no connected client is cut off.
 * New OAuth grants get an access token that expires and a rotating refresh
 * token. Every MCP client in use (Claude, ChatGPT, Cursor) refreshes on 401.
 */
export const ACCESS_TOKEN_TTL_S = Number(Deno.env.get("OAUTH_ACCESS_TTL_SECONDS")) || 24 * 3600;
export const REFRESH_TOKEN_TTL_S = Number(Deno.env.get("OAUTH_REFRESH_TTL_SECONDS")) || 90 * 24 * 3600;

export function newRefreshToken(): string {
  return `axon_refresh_${randomToken(32)}`;
}

/** NULL = grandfathered (no expiry). */
export function accessTokenExpired(accessExpiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!accessExpiresAt) return false;
  const t = new Date(accessExpiresAt).getTime();
  return Number.isFinite(t) && t <= now;
}

export function expiryIso(ttlSeconds: number, now = Date.now()): string {
  return new Date(now + ttlSeconds * 1000).toISOString();
}

export function newAuthorizationCode(): { plaintext: string; hashPromise: Promise<string> } {
  const plaintext = `axoncode_${randomToken(24)}`;
  return { plaintext, hashPromise: sha256Hex(plaintext) };
}

export function codeExpiresAt(): string {
  return new Date(Date.now() + CODE_TTL_MS).toISOString();
}

/**
 * Some platforms (ChatGPT Custom GPT Actions) mint a unique OAuth redirect
 * URI per integration instance (e.g. https://chat.openai.com/aip/g-abc123/oauth/callback)
 * even though every instance shares the same Axon client_id/secret. A single
 * shared client can't pre-register every possible instance's exact URI, so a
 * registered entry ending in "/*" is treated as an allowed-prefix pattern.
 * Exact entries (the common case — Claude's per-install DCR, custom PKCE
 * clients) still require a byte-for-byte match.
 */
export function redirectUriAllowed(registered: string[], candidate: string): boolean {
  return registered.some((r) => {
    if (r.endsWith("/*")) return candidate.startsWith(r.slice(0, -1));
    return r === candidate;
  });
}

// A small, fixed catalogue of well-known client_ids we pre-seed for
// platforms that don't support Dynamic Client Registration (RFC 7591) yet —
// e.g. ChatGPT Custom GPT Actions and Gemini Gems both require the developer
// to paste a fixed client_id/secret into their own builder UI rather than
// letting the client register itself like Claude's MCP connector does.
export const KNOWN_CLIENT_NAMES: Record<string, { label: string; logo: string }> = {
  "axon-claude-mcp": { label: "Claude", logo: "claude" },
  "axon-chatgpt-actions": { label: "ChatGPT", logo: "chatgpt" },
  "axon-gemini-extension": { label: "Gemini", logo: "gemini" },
};
