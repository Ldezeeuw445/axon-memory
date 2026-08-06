import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { callFunction } from '../lib/functions';

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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { alerts } = await callFunction('list-alerts', { method: 'GET' });
      setAlerts(alerts);
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
          <h1 className="page-title">System Alerts</h1>
          <p className="page-subtitle">Cost-cap trips and other operator-facing signals, newest first.</p>
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
