// The app's door into AXON: the same versioned /v1 contract every AI and the
// SDK use (docs/API.md), authenticated with the person's own session. One
// rulebook for capture, recall and lifecycle, whoever is asking.
import { supabase } from './supabase';

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-v1/v1`;

export class AxonApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code || 'unknown';
    this.retryable = !!body?.error?.retryable;
  }
}

async function call(method, path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new AxonApiError(401, { error: { code: 'unauthorized', message: 'Sign in again.' } });
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AxonApiError(0, { error: { code: 'offline', message: 'No connection right now.', retryable: true } });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new AxonApiError(res.status, json);
  return json;
}

export const axon = {
  recall: (opts) => call('POST', '/recall', opts),
  capture: (body) => call('POST', '/memories', body),
  memory: (id) => call('GET', `/memories/${id}`),
  retire: (id, reason) => call('POST', `/memories/${id}/retire`, reason ? { reason } : {}),
  restore: (id) => call('POST', `/memories/${id}/restore`, {}),
  remove: (id) => call('DELETE', `/memories/${id}`),
  threads: () => call('GET', '/threads'),
  captures: () => call('GET', '/captures'),
  retryCapture: (id) => call('POST', `/captures/${id}/retry`, {}),
  connectors: () => call('GET', '/connectors'),
};

// ── Offline capture (spec §32, A2-2). A capture made without a connection is
// kept on the device in IndexedDB (lib/outbox.js: survives the tab closing,
// keeps order, stops at the first failure) with its idempotency key, and sent
// when the connection returns — never lost, never stored twice.
import { outbox } from './outbox';

const LEGACY_QKEY = 'axon.captureQueue.v1'; // the first A9 build kept the queue in localStorage
async function adoptLegacyQueue() {
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_QKEY) || '[]');
    if (!old.length) return;
    for (const item of old) if (!(await outbox.add('capture', item.body))) return;
    localStorage.removeItem(LEGACY_QKEY);
  } catch { /* nothing to adopt */ }
}

/** Keeps one capture for later. Resolves false when the device could not keep it. */
export const enqueueCapture = (body) => outbox.add('capture', body);
export const queuedCount = () => outbox.count();

/**
 * Sends what is waiting, oldest first. A capture the API refuses outright
 * (400/403/404/409/410 — it will never succeed as written) is let go so it
 * cannot block everything behind it; anything retryable or offline stops the
 * flush and waits for the next chance.
 */
export async function flushCaptureQueue() {
  await adoptLegacyQueue();
  let dropped = 0;
  const res = await outbox.flush(async (item) => {
    try { await axon.capture(item.payload); return true; } catch (e) {
      if (e.status === 0 || e.retryable || e.status === 401 || e.status === 429 || e.status >= 500) return false;
      dropped += 1; return true;
    }
  });
  return { ...res, dropped };
}
