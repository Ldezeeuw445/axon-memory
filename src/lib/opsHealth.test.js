import { describe, it, expect } from 'vitest';
import { healthTiles } from './opsHealth';

const base = {
  capture: { '24h': { total: 40, ok: 40, failed: 0, success_rate: 1, p95_ms: 2300 } },
  recall: { '24h': { total: 100, errors: 0, empty: 7, error_rate: 0, p50_ms: 900, p95_ms: 2100, embed_p50_ms: 600 } },
  queues: { capture_stuck: 0, indexing_backlog: 12, alerts_undelivered: 0, outbound_http_pending: 0 },
  connectors: { total: 4, connected: 4, failing: 0, stale_24h: 0 },
  deletion: { orphans: { memory_items: 0, api_keys: 0 }, lifecycle_ops_7d: { delete: 2 } },
  billing: { events_30d: { applied: 3 }, attention_open: 0 },
  alerts_24h: {},
};
const tone = (h, k) => healthTiles(h).find((t) => t.key === k).tone;

describe('healthTiles', () => {
  it('reads a healthy snapshot as all ok', () => {
    expect(healthTiles(base).every((t) => t.tone === 'ok')).toBe(true);
  });
  it('flags what §35 cares about', () => {
    expect(tone({ ...base, capture: { '24h': { total: 50, success_rate: 0.9 } } }, 'capture')).toBe('bad');
    expect(tone({ ...base, recall: { '24h': { total: 10, p95_ms: 6000, error_rate: 0 } } }, 'recall_latency')).toBe('bad');
    expect(tone({ ...base, recall: { '24h': { total: 10, p95_ms: 900, error_rate: 0.2, errors: 2 } } }, 'recall_errors')).toBe('bad');
    expect(tone({ ...base, queues: { ...base.queues, capture_stuck: 1 } }, 'queue')).toBe('bad');
    expect(tone({ ...base, deletion: { orphans: { memory_items: 3 } } }, 'deletion')).toBe('bad');
    expect(tone({ ...base, connectors: { total: 19, connected: 9, failing: 8 } }, 'connectors')).toBe('bad');
  });
  it('says idle, not ok, when there is nothing to measure', () => {
    expect(tone({ ...base, capture: { '24h': { total: 0 } }, recall: { '24h': { total: 0 } } }, 'capture')).toBe('idle');
    expect(healthTiles(null)).toEqual([]);
  });
});
