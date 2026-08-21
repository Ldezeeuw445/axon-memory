import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, RefreshCw, Trash2, Clock, Database, ChevronRight, AlertTriangle, Info, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/functions';
import { useAuth } from '../contexts/AuthContext';
import { DATA_SOURCES } from '../lib/logos';

// The providers with a real OAuth backend (oauth-start / sync-source /
// disconnect-source Edge Functions, source_connections table). Everything else
// in DATA_SOURCES (google_drive, apple_notes, obsidian) has no backend support
// yet and is honestly shown as "Coming soon" rather than a simulated
// connection. Apple Notes and Obsidian are local by nature — there is no server
// to authorise against — so they need something running on the machine rather
// than another OAuth flow.
const REAL_PROVIDER_IDS = ['gmail', 'github', 'notion', 'slack', 'linear'];

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

const BANNER_STYLES = {
  success: { bg: 'rgba(37,194,160,0.1)', border: 'rgba(37,194,160,0.3)' },
  info: { bg: 'rgba(138,180,248,0.08)', border: 'rgba(138,180,248,0.25)' },
  error: { bg: 'rgba(255,80,80,0.08)', border: 'rgba(255,80,80,0.25)' },
};

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
        .select('id, provider, status, external_account_label, last_synced_at, last_error, created_at')
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
    // A success message can time out; a failure must not. The reason a
    // connection failed was being wiped from both the banner and the URL after
    // four seconds, which left nothing to act on and nothing to report.
    if (connected) {
      const t = setTimeout(() => {
        setBanner(null);
        setSearchParams((p) => { p.delete('connected'); return p; }, { replace: true });
      }, 4000);
      return () => clearTimeout(t);
    }
    if (error) {
      // Clear it from the address bar so a refresh does not resurrect it, but
      // leave the banner up until it is dismissed.
      setSearchParams((p) => { p.delete('error'); return p; }, { replace: true });
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
      const res = await callFunction('sync-source', { body: { source_connection_id: conn.id } });
      await load();
      // Silence after a sync is indistinguishable from a sync that did nothing,
      // which is exactly how "0 memories" went unexplained. Say what happened:
      // nothing offered, nothing new, or n stored.
      const fetched = res?.fetched ?? 0;
      const synced = res?.synced ?? 0;
      // Distillation is the half that makes recall useful, and it is invisible
      // from the outside — a run that read material and concluded nothing looks
      // exactly like one that never reached the model.
      const facts = res?.facts ?? 0;
      const considered = res?.considered ?? 0;
      const distillError = res?.distill_error;
      const distilled = considered > 0
        ? ` Read ${considered} for facts${
            facts > 0 ? `, learned ${facts}.` : distillError ? ` — failed: ${distillError}` : ' — none drawn.'
          }`
        : '';
      setBanner({
        type: synced > 0 ? 'success' : 'info',
        text: (synced > 0
          ? `${conn.provider}: ${synced} new ${synced === 1 ? 'memory' : 'memories'} stored.`
          : fetched > 0
            ? `${conn.provider}: ${fetched} items found, all already stored — nothing new.`
            : `${conn.provider}: the provider returned no items. Check that AXON has access to the content you expect.`) + distilled,
      });
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
          // 'info' is its own state: a sync that found nothing is a fact
          // about the connection, not a failure, and colouring it red sends
          // people hunting for a bug that isn't there.
          background: BANNER_STYLES[banner.type ?? 'error'].bg,
          border: `1px solid ${BANNER_STYLES[banner.type ?? 'error'].border}`,
        }}>
          {banner.type === 'success'
            ? <CheckCircle size={16} color="#25c2a0" />
            : banner.type === 'info'
              ? <Info size={16} color="#8ab4f8" />
              : <AlertTriangle size={16} color="#ff6b6b" />}
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 1, userSelect: 'text' }}>{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 4, display: 'flex', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="source-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {DATA_SOURCES.map((source) => {
          const isReal = REAL_PROVIDER_IDS.includes(source.id);
          const conn = connections[source.id];
          const isConnected = conn && ['connected', 'syncing'].includes(conn.status);
          // A failed sync sets status to 'error'. That is still a connection —
          // the tokens are there and the account is linked — but it used to
          // fall through to the same branch as "never connected", so the card
          // showed Connect again and the reason in last_error was never seen.
          const hasError = conn && conn.status === 'error';
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
                {hasError && <AlertTriangle size={16} color="#ffb02e" />}
              </div>

              {hasError && (
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12 }}>
                  <div style={{ color: '#ffb02e', fontWeight: 600, marginBottom: 3 }}>Last sync failed</div>
                  <div style={{ color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
                    {conn.last_error || 'No reason recorded.'}
                  </div>
                  {conn.account_label && (
                    <div style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      Still linked to {conn.account_label} — try Sync again.
                    </div>
                  )}
                </div>
              )}

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
