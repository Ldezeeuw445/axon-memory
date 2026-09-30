// Bearer-token resolution shared by mcp-server, remember, and
// openapi-actions. Deliberately the SAME lookup context-pack already uses
// for `axon_live_...` keys, extended to also carry oauth_client_id/scope —
// so a token issued via OAuth to Claude, ChatGPT, or Gemini resolves to
// exactly the same user_id as a manually-created key would.
import { supabaseAdmin } from "./supabase-admin.ts";
import { sha256Hex } from "./crypto.ts";

export type ResolvedKey = {
  userId: string;
  apiKeyId: string;
  scope: string | null;
  clientLabel: string | null;
  /**
   * Whether this key was registered by an assistant going through OAuth.
   *
   * It decides whether clientLabel is worth anything as a source name. For an
   * OAuth client the name is what the client registered under — "Claude" — and
   * that is exactly the summit it should land on. For a personal key it is the
   * name of the KEY, which is "Key 1", and filing memories under a summit
   * called KEY 1 is worse than filing them as anonymous.
   */
  viaOauthClient: boolean;
};

export function bearerFromRequest(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function resolveBearerToken(req: Request): Promise<ResolvedKey | null> {
  const token = bearerFromRequest(req);
  if (!token) return null;

  const admin = supabaseAdmin();
  const keyHash = await sha256Hex(token);
  const { data } = await admin
    .from("api_keys")
    .select("id, user_id, revoked_at, oauth_client_id, scope, name")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return {
    userId: data.user_id,
    apiKeyId: data.id,
    scope: data.scope,
    clientLabel: data.name,
    viaOauthClient: !!data.oauth_client_id,
  };
}

/**
 * What to file a memory under, when a client writes one.
 *
 * Three sources, in the order they can be trusted to be meaningful:
 *
 * 1. What the caller called itself. A tool naming itself is the only party
 *    that actually knows, and it is the whole point of letting an unlisted app
 *    keep its own key — "AXE Core" becomes axe-core and gets its own summit.
 *    Trimmed and capped: it is slugged downstream but a label also reaches a
 *    summit name, and a label is whatever a client felt like sending.
 *
 * 2. The registered client name, but only for a key an assistant obtained
 *    through OAuth. There the name is what the client registered under, so
 *    "Claude" lands on Claude's summit. For a personal key the same field is
 *    the name of the KEY — "Key 1" — which as a summit would be worse than
 *    filing the memory as anonymous.
 *
 * 3. Nothing, which memory-core stores as "manual": no one said where this
 *    came from, and the map says so.
 *
 * A caller can name itself anything, including "Claude". That is self-labelling
 * inside one account, by someone holding that account's own key — mislabelling
 * their own map at worst. It is not a way to reach anybody else's.
 */
export function sourceLabelFor(
  body: { source_label?: unknown },
  resolved: { clientLabel: string | null; viaOauthClient: boolean },
): string | null {
  const claimed = typeof body?.source_label === "string" ? body.source_label.trim() : "";
  if (claimed) return claimed.slice(0, 64);
  if (resolved.viaOauthClient && resolved.clientLabel) return resolved.clientLabel;
  return null;
}
