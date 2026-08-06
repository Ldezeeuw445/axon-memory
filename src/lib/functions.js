import { supabase } from './supabaseClient';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Calls a Supabase Edge Function with the current user's access token attached.
 * Throws on non-2xx responses with the server's error message when available.
 */
export async function callFunction(name, { method = 'POST', body, query } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  let url = `${FUNCTIONS_URL}/${name}`;
  if (query) url += `?${new URLSearchParams(query).toString()}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error_description || payload?.error || `${name} failed (${res.status})`);
    err.status = res.status;
    err.code = payload?.error;
    throw err;
  }
  return payload;
}
