import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, RefreshCw, Trash2, Clock, Database, ChevronRight, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/functions';
import { useAuth } from '../contexts/AuthContext';
import { DATA_SOURCES } from '../lib/logos';

// The 4 providers with a real OAuth backend (oauth-start / sync-source /
// disconnect-source Edge Functions, source_connections table). Everything
// else in DATA_SOURCES (linear, google_drive, apple_notes, obsidian) has no
// backend support yet and is honestly shown as "Coming soon" rather than a
// simulated connection.
const REAL_PROVIDER_IDS = ['gmail', 'github', 'notion', 'slack'];

function timeAgo(iso) {
  if (!iso) return 'Never';
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DataSources({ asFacet }) {
  const { user, isDemo } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState({}); // provider -> row
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState(null);
  const [banner, setBanner] = useState(null);

  const load = async () => {
    if (isDemo || !user) { setLoading(false); return; }
    // Column names must match 0001_init.sql exactly — PostgREST rejects the
    // whole select if one is unknown. There is no item_count column; the
    // per-provider totals are counted off memory_items.source_type instead.
    const [{ data }, itemRows] = await Promise.all([
      supabase
        .from('source_connections')
        .select('id, provider, status, external_account_label, last_synced_at, created_at')
        .eq('user_id', user.id),
      supabase.from('memory_items').select('source_type').eq('user_id', user.id),
    ]);
    const counts = {};
    for (const row of itemRows.data || []) {
      counts[row.source_type] = (counts[row.source_type] || 0) + 1;
    }
    setConnections(
      Object.fromEntries(
        (data || []).map((r) => [
          r.provider,
          { ...r, account_label: r.external_account_label, item_count: counts[r.provider] || 0 },
        ]),
      ),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, isDemo]);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) setBanner({ type: 'success', text: `${connected} connected — syncing your data now.` });
    if (error) setBanner({ type: 'error', text: `Connection failed: ${error}` });
    if (connected || error) {
      const t = setTimeout(() => {
        setBanner(null);
        setSearchParams((p) => { p.delete('connected'); p.delete('error'); return p; }, { replace: true });
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  const connect = async (providerId) => {
    if (isDemo) { setBanner({ type: 'error', text: 'Connect Supabase to enable real OAuth connections.' }); return; }
    setBusyProvider(providerId);
    try {
      const { url } = await callFunction('oauth-start', { method: 'GET', query: { provider: providerId } });
      window.location.href = url;
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      setBusyProvider(null);
    }
  };

  const sync = async (conn) => {
    setBusyProvider(conn.provider);
    try {
      await callFunction('sync-source', { body: { source_connection_id: conn.id } });
      await load();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
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
      setBanner({ type: 'error', text: err.message });
    } finally {
      setBusyProvider(null);
    }
  };

  const connectedCount = Object.values(connections).filter((c) => ['connected', 'syncing'].includes(c.status)).length;

  return (
    <div className={asFacet ? '' : 'page-container'}>
      {!asFacet && (
        <header className="page-header">
          <h1 className="page-title">Data Sources</h1>
          <p className="page-subtitle">
            {connectedCount > 0
              ? `${connectedCount} source${connectedCount > 1 ? 's' : ''} connected — AXON is building your memory graph.`
              : 'Connect your apps so AXON ingests and structures your knowledge automatically.'}
          </p>
        </header>
      )}

      {banner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, padding: '12px 16px', marginBottom: 20,
          background: banner.type === 'success' ? 'rgba(37,194,160,0.1)' : 'rgba(255,80,80,0.08)',
          border: `1px solid ${banner.type === 'success' ? 'rgba(37,194,160,0.3)' : 'rgba(255,80,80,0.25)'}`,
        }}>
          {banner.type === 'success' ? <CheckCircle size={16} color="#25c2a0" /> : <AlertTriangle size={16} color="#ff6b6b" />}
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{banner.text}</span>
        </div>
      )}

      <div className="source-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {DATA_SOURCES.map((source) => {
          const isReal = REAL_PROVIDER_IDS.includes(source.id);
          const conn = connections[source.id];
          const isConnected = conn && ['connected', 'syncing'].includes(conn.status);
          const isBusy = busyProvider === source.id;
          const { Logo, name, tagline, bg } = source;

          return (
            <div key={source.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', opacity: isReal ? 1 : 0.6 }}>
              <div style={{ background: bg, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Logo size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{name}</span>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>{tagline}</div>
                </div>
                {isConnected && <CheckCircle size={16} color="#25c2a0" />}
              </div>

              {isConnected && (
                <div style={{ display: 'flex', gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {conn.account_label && <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{conn.account_label}</span>}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {timeAgo(conn.last_synced_at)}</span>
                  {conn.item_count > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Database size={11} /> {conn.item_count} items</span>}
                </div>
              )}

              <div style={{ padding: '12px 14px', display: 'flex', gap: 8 }}>
                {!isReal ? (
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={12} /> Coming soon
                  </div>
                ) : !isConnected ? (
                  <button onClick={() => connect(source.id)} disabled={isBusy}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 8, border: '1px solid rgba(0,243,255,0.2)', background: 'rgba(0,243,255,0.06)', color: 'var(--color-neon-cyan)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {isBusy ? 'Redirecting…' : 'Connect'} {!isBusy && <ChevronRight size={14} />}
                  </button>
                ) : (
                  <>
                    <button onClick={() => sync(conn)} disabled={isBusy}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      <RefreshCw size={12} style={{ animation: isBusy ? 'spin 1s linear infinite' : 'none' }} />
                      {isBusy ? 'Working…' : 'Sync'}
                    </button>
                    <button onClick={() => disconnect(conn)} disabled={isBusy}
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,80,80,0.2)', background: 'rgba(255,80,80,0.06)', color: '#ff6b6b', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
