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
  };
}
