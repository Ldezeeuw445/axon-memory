// AES-GCM helpers for encrypting OAuth tokens at rest, and SHA-256 hashing for API keys.
// ENCRYPTION_KEY is a project secret: 32 random bytes, base64-encoded.
//   supabase secrets set ENCRYPTION_KEY=$(openssl rand -base64 32)
async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("ENCRYPTION_KEY");
  if (!raw) throw new Error("ENCRYPTION_KEY secret is not set");
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(payload: string): Promise<string> {
  const key = await getKey();
  const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newApiKey(): { plaintext: string; prefix: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 32);
  const plaintext = `axon_live_${token}`;
  return { plaintext, prefix: plaintext.slice(0, 18) };
}

// HMAC-signed anti-CSRF state for the OAuth round-trip. Without this, anyone
// could forge a `state` value pointing at a different userId and hijack the
// oauth-callback into linking their own OAuth account to a victim's Axon
// account. Signed with the same ENCRYPTION_KEY secret used for tokens.
async function getHmacKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("ENCRYPTION_KEY");
  if (!raw) throw new Error("ENCRYPTION_KEY secret is not set");
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signState(userId: string, provider: string): Promise<string> {
  const payload = JSON.stringify({ userId, provider, ts: Date.now() });
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return btoa(JSON.stringify({ payload, sig: sigB64 }));
}

export async function parseState(
  state: string,
): Promise<{ userId: string; provider: string; ts: number }> {
  const { payload, sig } = JSON.parse(atob(state));
  const key = await getHmacKey();
  const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(payload),
  );
  if (!valid) throw new Error("invalid state signature");
  return JSON.parse(payload);
}
