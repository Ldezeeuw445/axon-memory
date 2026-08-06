import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Unlink, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { callFunction } from '../lib/functions';
import { useAuth } from '../context/AuthContext';
import { IconGoogle, IconGitHub, IconNotion, IconSlack } from '../components/BrandIcons';

const PROVIDERS = [
  { id: 'gmail', name: 'Gmail', icon: <IconGoogle size={24} />, color: '#ea4335', blurb: 'Recent inbox context.' },
  { id: 'github', name: 'GitHub', icon: <IconGitHub size={24} color="#c9d1d9" />, color: '#c9d1d9', blurb: 'Commits, PRs, issues.' },
  { id: 'notion', name: 'Notion', icon: <IconNotion size={24} />, color: '#ffffff', blurb: 'Pages and docs.' },
  { id: 'slack', name: 'Slack', icon: <IconSlack size={24} />, color: '#e01e5a', blurb: 'Channel conversations.' },
];

function timeAgo(iso) {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function DataSources() {
  const { user } = useAuth();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('source_connections').select('*').eq('user_id', user.id);
    setConnections(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (searchParams.get('connected') || searchParams.get('error')) {
      load();
      const t = setTimeout(() => setSearchParams({}, { replace: true }), 4000);
      return () => clearTimeout(t);
    }
  }, [searchParams, setSearchParams, load]);

  const connect = async (providerId) => {
    setBusyProvider(providerId);
    try {
      const { url } = await callFunction('oauth-start', { method: 'GET', query: { provider: providerId } });
      window.location.href = url;
    } catch (err) {
      alert(err.message);
      setBusyProvider(null);
    }
  };

  const sync = async (conn) => {
    setBusyProvider(conn.provider);
    try {
      await callFunction('sync-source', { body: { source_connection_id: conn.id } });
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyProvider(null);
    }
  };

  const disconnect = async (conn) => {
    if (!confirm(`Disconnect ${conn.provider}? Already-imported memories are kept.`)) return;
    setBusyProvider(conn.provider);
    try {
      await callFunction('disconnect-source', { body: { source_connection_id: conn.id } });
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyProvider(null);
    }
  };

  const connectedInfo = searchParams.get('connected');
  const errorInfo = searchParams.get('error');

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Data Sources</h1>
        <p className="page-subtitle">Connect the apps you use every day to build your autonomous memory.</p>
      </header>

      {connectedInfo && (
        <div className="glass-card" style={{ borderColor: '#25c2a0', marginBottom: 20, padding: '12px 20px', color: '#25c2a0', fontSize: 14 }}>
          {connectedInfo} connected. Hit "Sync now" to pull in your first batch of memories.
        </div>
      )}
      {errorInfo && (
        <div className="glass-card" style={{ borderColor: '#ff6b6b', marginBottom: 20, padding: '12px 20px', color: '#ff6b6b', fontSize: 14 }}>
          Connection failed ({errorInfo}). Try again, or check that OAuth credentials are configured.
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
          {PROVIDERS.map((p) => {
            const conn = connections.find((c) => c.provider === p.id);
            const status = conn?.status ?? 'disconnected';
            const isConnected = status === 'connected' || status === 'syncing';
            const busy = busyProvider === p.id;

            return (
              <div key={p.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: p.color,
                    boxShadow: isConnected ? `0 0 10px ${p.color}40` : 'none',
                  }}>
                    {p.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>{p.name}</h3>
                    <p style={{ fontSize: 13, color: isConnected ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isConnected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-neon-cyan)' }} />}
                      {status === 'syncing' ? 'Syncing…' : status === 'connected' ? (conn?.external_account_label || 'Connected') : status === 'error' ? 'Sync error' : 'Not connected'}
                    </p>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{p.blurb}</p>
                {isConnected && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Last synced {timeAgo(conn?.last_synced_at)}</p>}
                {status === 'error' && conn?.last_error && (
                  <p style={{ fontSize: 12, color: '#ff6b6b', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.4 }}>
                    {conn.last_error.length > 140 ? `${conn.last_error.slice(0, 140)}…` : conn.last_error}
                    <br />
                    <span style={{ opacity: 0.8 }}>Try "Sync now" again, or disconnect and reconnect if this keeps happening.</span>
                  </p>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
                  {!isConnected ? (
                    <button onClick={() => connect(p.id)} disabled={busy} className="glow-btn" style={{ flex: 1, background: 'transparent', border: '1px solid var(--color-border)', color: 'inherit' }}>
                      {busy ? <Loader2 size={14} className="spin" /> : 'Connect'}
                    </button>
                  ) : (
                    <>
                      <button onClick={() => sync(conn)} disabled={busy} className="glow-btn" style={{ flex: 1, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <RefreshCw size={14} /> {busy ? 'Syncing…' : 'Sync now'}
                      </button>
                      <button onClick={() => disconnect(conn)} disabled={busy} title="Disconnect" className="glow-btn" style={{ background: 'transparent', border: '1px solid var(--color-border)', padding: '6px 12px' }}>
                        <Unlink size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
