import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { callFunction } from '../lib/functions';
import { healthTiles } from '../lib/opsHealth';

const TONE = { ok: '#25c2a0', warn: '#FFB733', bad: '#ff6b6b', idle: 'rgba(255,255,255,0.35)' };

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Owner-only view (not linked from nav) — backend (list-alerts) enforces the
// real access control by matching the caller's email against OWNER_EMAIL;
// this page just renders whatever it's allowed to see, and shows a clear
// "not authorized" state otherwise rather than a blank page.
export default function AdminAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ alerts }, ops] = await Promise.all([
        callFunction('list-alerts', { method: 'GET' }),
        // §35 health; its own failure must not hide the alerts.
        callFunction('ops-health', { method: 'GET' }).catch(() => null),
      ]);
      setAlerts(alerts);
      setHealth(ops?.health ?? null);
    } catch (err) {
      setError(err.status === 403 ? 'Not authorized.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Operations</h1>
          <p className="page-subtitle">Health over the last 24 hours, then alerts, newest first.</p>
        </div>
        <button onClick={load} disabled={loading} className="glow-btn" style={{ background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>

      {error && (
        <div className="glass-card" style={{ borderColor: '#ff6b6b', padding: '12px 20px', color: '#ff6b6b', fontSize: 14 }}>
          {error}
        </div>
      )}

      {!error && health && (
        <section aria-label="Health" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 24 }}>
          {healthTiles(health).map((t) => (
            <div key={t.key} className="glass-card" style={{ padding: '12px 14px', borderColor: t.tone === 'bad' ? 'rgba(255,107,107,0.35)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: TONE[t.tone] }} />{t.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>{t.value}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{t.sub}</div>
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
            Snapshot {timeAgo(health.generated_at)}. Auth errors, database errors and RLS refusals live in the Supabase logs; the isolation suites cover RLS on every release.
          </div>
        </section>
      )}

      {!error && !loading && alerts.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)' }}>No alerts. Everything's quiet.</p>
      )}

      {!error && alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map((a) => (
            <div key={a.id} className="glass-card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 18px' }}>
              <AlertTriangle size={18} style={{ color: '#ffb020', marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{a.alert_type}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {timeAgo(a.created_at)}{a.notified ? ' · delivered' : ' · pending delivery'}
                  </span>
                </div>
                <p style={{ fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>{a.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
