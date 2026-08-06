// POST /functions/v1/api-keys-create   body: { name?: string }
// Returns the plaintext key exactly once — only the hash is ever stored.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { newApiKey, sha256Hex } from "../_shared/crypto.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405, origin });

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });

  const admin = supabaseAdmin();
  // Gate: manually-created API keys (direct programmatic access) are an
  // Ultra/Lifetime-tier ("api_access") feature. The UI already hides this
  // button for lower tiers, but that's cosmetic only — this is the real
  // enforcement, so a user can't bypass the paywall by calling the endpoint
  // directly (e.g. from curl or devtools).
  const { data: planStatus } = await admin
    .from("user_plan_status")
    .select("has_api_access")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!planStatus?.has_api_access) {
    return jsonResponse(
      { error: "upgrade_required", error_description: "Creating API keys requires the Ultra plan or higher." },
      { status: 402, origin },
    );
  }

  const { name } = await req.json().catch(() => ({ name: undefined }));
  const { plaintext, prefix } = newApiKey();
  const key_hash = await sha256Hex(plaintext);

  const { data, error } = await admin
    .from("api_keys")
    .insert({ user_id: auth.user.id, name: name || "Default key", key_prefix: prefix, key_hash })
    .select("id, name, key_prefix, created_at")
    .single();

  if (error) return jsonResponse({ error: error.message }, { status: 500, origin });

  return jsonResponse({ ...data, key: plaintext }, { origin });
});
