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

// ── Offline capture queue (spec §32). A capture made without a connection is
// kept on the device, with its idempotency key, and sent when the connection
// returns — never lost, never stored twice.
const QKEY = 'axon.captureQueue.v1';
export function queuedCaptures() {
  try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; }
}
function saveQueue(q) { localStorage.setItem(QKEY, JSON.stringify(q)); }
export function enqueueCapture(body) { saveQueue([...queuedCaptures(), { body, at: new Date().toISOString() }]); }
export async function flushCaptureQueue() {
  const q = queuedCaptures();
  if (!q.length) return 0;
  const left = [];
  let sent = 0;
  for (const item of q) {
    try { await axon.capture(item.body); sent += 1; } catch (e) { if (e.retryable || e.status === 0) left.push(item); }
  }
  saveQueue(left);
  return sent;
}
