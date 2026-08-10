import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

/**
 * Server-side Supabase client using the service role key.
 * This BYPASSES Row Level Security — never expose this client or its
 * key to the browser. Only import it from server/ code.
 *
 * Returns null (not a throwing error) when unconfigured, so callers
 * can degrade gracefully instead of crashing the whole API process
 * (matches the app's existing "demo mode" philosophy).
 */
export function getSupabaseAdmin() {
  if (cachedClient) return cachedClient;

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  cachedClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedClient;
}

export function isSupabaseAdminConfigured() {
  return Boolean(
    (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
