// §35: the ops snapshot (ops_health_snapshot) as tiles a phone can read at a
// glance. Pure, so the thresholds are unit-tested. tone: ok | warn | bad | idle.
const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(x >= 0.999 ? 0 : 1)}%`);
const ms = (x) => (x == null ? '—' : x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`);
const n = (x) => (x == null ? '—' : String(x));

export function healthTiles(h) {
  if (!h) return [];
  const c = h.capture?.['24h'] || {};
  const r = h.recall?.['24h'] || {};
  const q = h.queues || {};
  const con = h.connectors || {};
  const orphans = Object.values(h.deletion?.orphans || {}).reduce((a, b) => a + (b || 0), 0);
  const billing = h.billing?.events_30d || {};
  const billingErrors = Object.entries(billing).filter(([k]) => /error|claimed/.test(k)).reduce((a, [, v]) => a + v, 0);
  return [
    { key: 'capture', label: 'Capture success', value: c.total ? pct(c.success_rate) : 'No captures', sub: c.total ? `${c.total} in 24 h · p95 ${ms(c.p95_ms)}` : 'in the last 24 h',
      tone: !c.total ? 'idle' : c.success_rate >= 0.99 ? 'ok' : c.success_rate >= 0.95 ? 'warn' : 'bad' },
    { key: 'recall_latency', label: 'Recall latency', value: r.total ? ms(r.p50_ms) : 'No recalls', sub: r.total ? `p95 ${ms(r.p95_ms)} · embed ${ms(r.embed_p50_ms)}` : 'in the last 24 h',
      tone: !r.total ? 'idle' : r.p95_ms <= 2500 ? 'ok' : r.p95_ms <= 5000 ? 'warn' : 'bad' },
    { key: 'recall_errors', label: 'Recall failures', value: r.total ? pct(r.error_rate) : '—', sub: r.total ? `${r.errors} of ${r.total} · ${r.empty} found nothing` : 'in the last 24 h',
      tone: !r.total ? 'idle' : r.error_rate <= 0.01 ? 'ok' : r.error_rate <= 0.05 ? 'warn' : 'bad' },
    { key: 'queue', label: 'Queues', value: n((q.capture_stuck || 0) + (q.outbound_http_pending || 0)), sub: `${n(q.capture_stuck)} captures stuck · ${n(q.indexing_backlog)} without embedding`,
      tone: (q.capture_stuck || 0) > 0 ? 'bad' : (q.outbound_http_pending || 0) > 50 ? 'warn' : 'ok' },
    { key: 'connectors', label: 'Connectors', value: `${n(con.connected)} / ${n(con.total)}`, sub: `${n(con.failing)} failing · ${n(con.stale_24h)} stale`,
      tone: (con.failing || 0) === 0 ? 'ok' : (con.failing || 0) <= Math.ceil((con.total || 0) / 4) ? 'warn' : 'bad' },
    { key: 'deletion', label: 'Deletion', value: orphans === 0 ? 'Clean' : `${orphans} left over`, sub: `orphaned rows across owners · ${Object.entries(h.deletion?.lifecycle_ops_7d || {}).map(([k, v]) => `${v} ${k}`).join(', ') || 'no lifecycle ops'} in 7 d`,
      tone: orphans === 0 ? 'ok' : 'bad' },
    { key: 'billing', label: 'Billing webhooks', value: n(Object.values(billing).reduce((a, b) => a + b, 0)), sub: `in 30 d · ${billingErrors} unresolved · ${n(h.billing?.attention_open)} need attention`,
      tone: billingErrors > 0 || (h.billing?.attention_open || 0) > 0 ? 'warn' : 'ok' },
    { key: 'alerts', label: 'Alerts undelivered', value: n(q.alerts_undelivered), sub: Object.entries(h.alerts_24h || {}).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(' · ') || 'none raised in 24 h',
      tone: (q.alerts_undelivered || 0) === 0 ? 'ok' : 'warn' },
  ];
}
