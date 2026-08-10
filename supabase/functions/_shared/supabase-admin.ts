// Service-role client — full DB access, bypasses RLS. Never expose to the client.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected into every
// Supabase Edge Function; no manual configuration needed.
import { createClient } from "npm:@supabase/supabase-js@2";

export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
