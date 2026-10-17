import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, RefreshCw, Trash2, Clock, Database, ChevronRight, AlertTriangle, Info, X, Shield, Plus } from 'lucide-react';
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

// A8-1 connector contract → how a card looks. Only `healthy` earns the green
// check; everything else says what it is (spec §20: never imply a connector is
// synchronised when it has failed).
const HEALTH = {
  healthy: { label: 'Synced', color: '#25c2a0' },
  syncing: { label: 'Syncing', color: '#8ab4f8' },
  pending: { label: 'Not synced yet', color: '#8ab4f8' },
  stale: { label: 'Stale', color: '#ffb02e' },
  stuck: { label: 'Stuck', color: '#ffb02e' },
  failing: { label: 'Failing', color: '#ff6b6b' },
  unsupported: { label: 'Not supported', color: '#9aa0a6' },
  disconnected: { label: 'Disconnected', color: '#9aa0a6' },
};

function fallbackSource(provider, catalog) {
  const c = catalog.find((x) => x.provider === provider);
  return {
    id: provider,
    name: c?.name || provider,
    tagline: c?.supported ? 'Linked source' : 'No sync available yet',
    bg: '#22252b',
    Logo: ({ size }) => <Database size={size} color="#fff" />,
  };
}

function ConnectionRow({ c, busy, onSync, onDisconnect }) {
  const h = HEALTH[c.health] || HEALTH.pending;
  const [showScope, setShowScope] = useState(false);
  const canSync = c.supported && c.health !== 'disconnected';
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {c.account || 'Account'}
        </span>
        <span data-health={c.health} style={{ color: h.color, fontWeight: 700, fontSize: 11, border: `1px solid ${h.color}55`, borderRadius: 999, padding: '1px 8px' }}>
          {h.label}
        </span>
      </div>
      <div style={{ marginBottom: 4 }}>{c.summary}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <span title={c.last_success_at || ''} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> Last success: {timeAgo(c.last_success_at)}</span>
        {c.last_attempt_at && c.last_attempt_at !== c.last_success_at && (
          <span title={c.last_attempt_at}>Last attempt: {timeAgo(c.last_attempt_at)}</span>
        )}
        {c.imported?.items != null && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Database size={11} /> {c.imported.items} imported</span>}
        {c.imported?.last_run && <span>Last run: {c.imported.last_run.fetched ?? 0} found, {c.imported.last_run.stored ?? 0} new</span>}
      </div>
      {c.error && (
        <div style={{ marginTop: 6, color: '#ffb02e', wordBreak: 'break-word', userSelect: 'text' }}>
          <div style={{ fontWeight: 600 }}>
            {c.error.kind === 'auth' ? 'Access expired or revoked' : c.error.kind === 'permission' ? 'Permission missing' : 'Last sync failed'}
            {c.consecutive_failures > 1 ? ` (${c.consecutive_failures} times in a row)` : ''}
          </div>
          <div style={{ color: 'var(--color-text-secondary)' }}>{c.error.message}</div>
          <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>{c.error.action}</div>
        </div>
      )}
      <button onClick={() => setShowScope((v) => !v)}
        style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        <Shield size={11} /> {showScope ? 'Hide permissions' : 'Permissions'}
      </button>
      {showScope && (
        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5 }}>
          <div>{c.scope.explanation}</div>
          {c.scope.note && <div style={{ marginTop: 2 }}>{c.scope.note}</div>}
          <div style={{ marginTop: 2 }}>
            Granted: {c.scope.granted ? c.scope.granted.join(', ') : (c.scope.requested.length ? `requested ${c.scope.requested.join(', ')} (provider did not report the grant)` : 'set by the provider')}
          </div>
          <div style={{ marginTop: 2 }}>
            Disconnect deletes AXON's tokens{c.revoke.method === 'provider_api' ? ' and revokes the grant at the provider' : ''}; imported memories are kept.
            {c.revoke.manage_url && <> Manage at <a href={c.revoke.manage_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-neon-cyan)' }}>{new URL(c.revoke.manage_url).hostname}</a>.</>}
          </div>
        </div>
      )}
      {c.health !== 'disconnected' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {canSync && (
            <button onClick={() => onSync(c)} disabled={busy}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              <RefreshCw size={12} style={{ animation: busy ? 'spin 1s linear infinite' : 'none' }} />
              {busy ? 'Working…' : c.health === 'failing' ? 'Retry sync' : 'Sync'}
            </button>
          )}
          <button onClick={() => onDisconnect(c)} disabled={busy} aria-label={`Disconnect ${c.name}`}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,80,80,0.2)', background: 'rgba(255,80,80,0.06)', color: '#ff6b6b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Trash2 size={13} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

export default function DataSources({ asFacet }) {
  const { user, isDemo } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connectors, setConnectors] = useState([]); // A8-1 contract, one per connection
  const [catalog, setCatalog] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [banner, setBanner] = useState(null);

  const load = async () => {
    if (isDemo || !user) { setLoading(false); return; }
    try {
      const res = await callFunction('connectors', { method: 'GET' });
      setConnectors(res?.connectors || []);
      setCatalog(res?.catalog || []);
      setLoadError(null);
    } catch (err) {
      // Say so rather than render an empty grid that reads as "nothing connected".
      setLoadError(err.message || 'Could not load connection status.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, isDemo]);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) setBanner({ type: 'success', text: `${connected} linked. The first sync runs now; the card shows when it has actually completed.` });
    if (error) setBanner({ type: 'error', text: `Connection failed: ${error}` });
    // A success message can time out; a failure must not.
    if (connected) {
      const t = setTimeout(() => {
        setBanner(null);
        setSearchParams((p) => { p.delete('connected'); return p; }, { replace: true });
        load();
      }, 4000);
      return () => clearTimeout(t);
    }
    if (error) {
      setSearchParams((p) => { p.delete('error'); return p; }, { replace: true });
    }
  }, [searchParams]);

  const connect = async (providerId) => {
    if (isDemo) { setBanner({ type: 'error', text: 'Connect Supabase to enable real OAuth connections.' }); return; }
    setBusyId(`new:${providerId}`);
    try {
      const { url } = await callFunction('oauth-start', { method: 'GET', query: { provider: providerId } });
      window.location.href = url;
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      setBusyId(null);
    }
  };

  const sync = async (conn) => {
    setBusyId(conn.id);
    try {
      const res = await callFunction('sync-source', { body: { source_connection_id: conn.id } });
      const fetched = res?.fetched ?? 0;
      const synced = res?.synced ?? 0;
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
          ? `${conn.name}: ${synced} new ${synced === 1 ? 'memory' : 'memories'} stored.`
          : fetched > 0
            ? `${conn.name}: ${fetched} items found, all already stored — nothing new.`
            : `${conn.name}: the provider returned no items. Check that AXON has access to the content you expect.`) + distilled,
      });
    } catch (err) {
      setBanner({ type: 'error', text: `${conn.name}: sync failed — ${err.message}` });
    } finally {
      await load();
      setBusyId(null);
    }
  };

  const disconnect = async (conn) => {
    if (!confirm(`Disconnect ${conn.name}${conn.account ? ` (${conn.account})` : ''}? AXON deletes its tokens; already-imported memories are kept.`)) return;
    setBusyId(conn.id);
    try {
      const res = await callFunction('disconnect-source', { body: { source_connection_id: conn.id } });
      setBanner({
        type: 'info',
        text: res?.revoked_at_provider
          ? `${conn.name} disconnected and access revoked at ${conn.name}.`
          : `${conn.name} disconnected; AXON's tokens are deleted.${res?.manage_url ? ` To remove the grant on ${conn.name}'s side too, visit ${res.manage_url}.` : ''}`,
      });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      await load();
      setBusyId(null);
    }
  };

  const byProvider = {};
  for (const c of connectors) (byProvider[c.provider] ||= []).push(c);
  // Every linked provider gets a card, including ones with no tile in
  // DATA_SOURCES (Outlook, Supabase): a connection the UI cannot show is a
  // connection the person cannot see failing or revoke.
  const sources = [
    ...DATA_SOURCES,
    ...Object.keys(byProvider).filter((p) => !DATA_SOURCES.some((s) => s.id === p)).map((p) => fallbackSource(p, catalog)),
  ];
  const syncedCount = connectors.filter((c) => c.synchronized).length;
  const troubleCount = connectors.filter((c) => ['failing', 'stale', 'stuck'].includes(c.health)).length;

  return (
    <div className={asFacet ? '' : 'page-container'}>
      {!asFacet && (
        <header className="page-header">
          <h1 className="page-title">Data Sources</h1>
          <p className="page-subtitle">
            {connectors.length > 0
              ? `${syncedCount} source${syncedCount === 1 ? '' : 's'} syncing normally${troubleCount ? `, ${troubleCount} need${troubleCount === 1 ? 's' : ''} attention` : ''}.`
              : 'Connect your apps so AXON ingests and structures your knowledge automatically.'}
          </p>
        </header>
      )}

      {loadError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, padding: '12px 16px', marginBottom: 20, background: BANNER_STYLES.error.bg, border: `1px solid ${BANNER_STYLES.error.border}` }}>
          <AlertTriangle size={16} color="#ff6b6b" />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 1 }}>Could not load connection status: {loadError}</span>
          <button onClick={load} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px 10px' }}>Retry</button>
        </div>
      )}

      {banner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, padding: '12px 16px', marginBottom: 20,
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

      <div className="source-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {sources.map((source) => {
          const isReal = REAL_PROVIDER_IDS.includes(source.id);
          const conns = byProvider[source.id] || [];
          const live = conns.filter((c) => c.health !== 'disconnected');
          const anySynced = live.some((c) => c.synchronized);
          const anyTrouble = live.some((c) => ['failing', 'stale', 'stuck'].includes(c.health));
          const { Logo, name, tagline, bg } = source;
          const newBusy = busyId === `new:${source.id}`;

          return (
            <div key={source.id} className="glass-card" data-provider={source.id} style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', opacity: isReal || conns.length ? 1 : 0.6 }}>
              <div style={{ background: bg, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Logo size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{name}</span>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>{tagline}</div>
                </div>
                {anyTrouble ? <AlertTriangle size={16} color="#ffb02e" /> : anySynced ? <CheckCircle size={16} color="#25c2a0" /> : null}
              </div>

              {conns.map((c) => (
                <ConnectionRow key={c.id} c={c} busy={busyId === c.id} onSync={sync} onDisconnect={disconnect} />
              ))}

              <div style={{ padding: '12px 14px', display: 'flex', gap: 8, marginTop: 'auto' }}>
                {!isReal ? (
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={12} /> {conns.length ? 'New connections not available yet' : 'Coming soon'}
                  </div>
                ) : (
                  <button onClick={() => connect(source.id)} disabled={newBusy || loading}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 8, border: '1px solid rgba(0,243,255,0.2)', background: 'rgba(0,243,255,0.06)', color: 'var(--color-neon-cyan)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {newBusy ? 'Redirecting…' : live.length ? <><Plus size={13} /> Connect another account</> : <>Connect <ChevronRight size={14} /></>}
                  </button>
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
