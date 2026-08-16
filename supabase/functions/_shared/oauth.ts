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

export async function verifyPkce(
  codeVerifier: string | null | undefined,
  codeChallenge: string | null | undefined,
  method: string | null | undefined,
): Promise<boolean> {
  if (!codeChallenge) return true; // client didn't use PKCE (only allowed for confidential clients)
  if (!codeVerifier) return false;
  if ((method ?? "S256") === "plain") return codeVerifier === codeChallenge;
  return (await base64UrlSha256(codeVerifier)) === codeChallenge;
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
