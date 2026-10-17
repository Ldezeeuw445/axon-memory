// POST /functions/v1/disconnect-source   body: { source_connection_id: string }
// Revoke (A8-1 contract). Wipes stored tokens and marks the connection
// disconnected (soft delete: ingested memory_items are kept so nothing the
// user already has gets destroyed). Where the provider offers a token
// revocation endpoint, the grant is also revoked there, best-effort, and the
// response says whether that happened — never implying it did when it did not.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { decryptToken } from "../_shared/crypto.ts";
import { catalogEntry, revokeAtProvider } from "../_shared/connectors.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405, origin });

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });

  const { source_connection_id } = await req.json().catch(() => ({}));
  if (!source_connection_id) {
    return jsonResponse({ error: "source_connection_id required" }, { status: 400, origin });
  }

  const admin = supabaseAdmin();
  // Scoped to the caller. Someone else's id reads as "not found", and the old
  // { ok: true } for a row that was never touched is gone with it.
  const { data: conn } = await admin
    .from("source_connections")
    .select("id, provider, status, access_token_encrypted, refresh_token_encrypted")
    .eq("id", source_connection_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!conn) return jsonResponse({ error: "Connection not found" }, { status: 404, origin });

  const safeDecrypt = async (v: string | null) => {
    if (!v) return null;
    try { return await decryptToken(v); } catch { return null; }
  };
  const provider = conn.status === "disconnected"
    ? { attempted: false, revoked: false, detail: "already disconnected" }
    : await revokeAtProvider(
      conn.provider,
      await safeDecrypt(conn.access_token_encrypted),
      await safeDecrypt(conn.refresh_token_encrypted),
    );

  const { error } = await admin
    .from("source_connections")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
    })
    .eq("id", conn.id)
    .eq("user_id", auth.user.id);

  if (error) return jsonResponse({ error: error.message }, { status: 500, origin });
  const entry = catalogEntry(conn.provider);
  return jsonResponse({
    ok: true,
    tokens_deleted: true,
    imported_memories_kept: true,
    revoked_at_provider: provider.revoked,
    // When AXON could not revoke the grant itself, say where the person can.
    ...(provider.revoked ? {} : { manage_url: entry.manage_url, provider_detail: provider.detail ?? null }),
  }, { origin });
});
