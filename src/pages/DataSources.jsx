import React, { useState, useEffect } from 'react';
import { CheckCircle, RefreshCw, Trash2, Clock, Database, ChevronRight, ExternalLink, Eye, EyeOff, XCircle, Loader, AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { DATA_SOURCES } from '../lib/logos';

const DEMO_KEY = 'axon_sources_demo';

function useSourceStorage(user, isDemo) {
  const save = async (sourceId, token, meta) => {
    const entry = { status: 'connected', last_synced: new Date().toISOString(), ...meta };
    if (!isSupabaseConfigured || isDemo) {
      const s = JSON.parse(localStorage.getItem(DEMO_KEY) || '{}');
      s[sourceId] = entry; localStorage.setItem(DEMO_KEY, JSON.stringify(s)); return;
    }
    await supabase.from('data_sources').upsert(
      { user_id: user.id, source_id: sourceId, name: sourceId, ...entry },
      { onConflict: 'user_id,source_id' }
    );
  };
  const remove = async (sourceId) => {
    if (!isSupabaseConfigured || isDemo) {
      const s = JSON.parse(localStorage.getItem(DEMO_KEY) || '{}');
      delete s[sourceId]; localStorage.setItem(DEMO_KEY, JSON.stringify(s)); return;
    }
    await supabase.from('data_sources').delete().eq('user_id', user.id).eq('source_id', sourceId);
  };
  const load = async () => {
    if (!isSupabaseConfigured || isDemo) return JSON.parse(localStorage.getItem(DEMO_KEY) || '{}');
    const { data } = await supabase.from('data_sources').select('source_id, status, last_synced, node_count, account_name').eq('user_id', user.id);
    return Object.fromEntries((data || []).map(r => [r.source_id, r]));
  };
  return { save, remove, load };
}

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

function ConnectModal({ source, isOpen, onClose, onSuccess }) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [step, setStep] = useState('guide');
  const [errorMsg, setErrorMsg] = useState('');
  const [accountInfo, setAccountInfo] = useState(null);

  useEffect(() => {
    if (isOpen) { setToken(''); setStep('guide'); setErrorMsg(''); setAccountInfo(null); setShowToken(false); }
  }, [isOpen]);

  if (!source) return null;

  const handleTest = async () => {
    if (!token.trim()) return;
    setStep('testing');
    try {
      const res = await fetch('/api/sources/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: source.id, token: token.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setAccountInfo(data);
        setStep('success');
        setTimeout(() => {
          onSuccess(source.id, token.trim(), { account_name: data.accountName, node_count: 0 });
          onClose();
        }, 1600);
      } else {
        setErrorMsg(data.error || 'Connection failed');
        setStep('error');
      }
    } catch {
      setErrorMsg('Cannot reach AXON server — make sure the backend is running.');
      setStep('error');
    }
  };

  const { Logo, name, bg, guide, docsUrl, docsLabel, tokenLabel, tokenPlaceholder } = source;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" width="500px">
      {/* Branded header */}
      <div style={{ background: bg, borderRadius: 10, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12, margin: '-20px -20px 20px', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Logo size={24} />
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Connect {name}</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>Link your workspace to AXON</div>
        </div>
      </div>

      {step === 'guide' && (
        <>
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
              AXON will ingest and index your {name} content to build your memory graph.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {guide.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,243,255,0.15)', color: 'var(--color-neon-cyan)', fontWeight: 700, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i+1}</div>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
          {docsUrl && (
            <a href={docsUrl} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-neon-cyan)', marginBottom: 18 }}>
              <ExternalLink size={11} /> {docsLabel}
            </a>
          )}
          <button onClick={() => setStep('input')} className="btn-primary" style={{ width: '100%' }}>
            I have my token → Connect
          </button>
        </>
      )}

      {(step === 'input' || step === 'error') && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {tokenLabel || 'Access Token'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => setToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && token.trim() && handleTest()}
                placeholder={tokenPlaceholder || 'Paste your token here...'}
                autoFocus
                style={{ width: '100%', padding: '11px 40px 11px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${step === 'error' ? '#ff6b6b40' : 'var(--color-border)'}`, borderRadius: 9, color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
              />
              <button onClick={() => setShowToken(!showToken)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                {showToken ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </div>
          {step === 'error' && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.2)', marginBottom: 12, fontSize: 13, color: '#ff6b6b', alignItems: 'flex-start' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {errorMsg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep('guide')} className="btn-secondary" style={{ flex: 1 }}>← Guide</button>
            <button onClick={handleTest} disabled={!token.trim()} className="btn-primary" style={{ flex: 2 }}>
              Verify & Connect
            </button>
          </div>
        </>
      )}

      {step === 'testing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '28px 0' }}>
          <Loader size={36} color="var(--color-neon-cyan)" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ fontWeight: 600 }}>Connecting to {name}…</p>
        </div>
      )}

      {step === 'success' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 0' }}>
          <CheckCircle size={48} color="#25c2a0" />
          <p style={{ fontWeight: 700, fontSize: 18 }}>{name} Connected!</p>
          {accountInfo?.accountName && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Signed in as <strong style={{ color: 'var(--color-text-primary)' }}>{accountInfo.accountName}</strong>{accountInfo.extra ? ` · ${accountInfo.extra}` : ''}</p>
          )}
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>AXON will begin indexing your content.</p>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Modal>
  );
}

export default function DataSources() {
  const { user, isDemo } = useAuth();
  const storage = useSourceStorage(user, isDemo);
  const [connected, setConnected] = useState({});
  const [syncing, setSyncing] = useState({});
  const [modal, setModal] = useState(null);

  useEffect(() => { storage.load().then(setConnected); }, []);

  const handleSuccess = async (sourceId, token, meta) => {
    await storage.save(sourceId, token, meta);
    setConnected(p => ({ ...p, [sourceId]: { status: 'connected', ...meta } }));
  };

  const handleSync = async (sourceId) => {
    setSyncing(p => ({ ...p, [sourceId]: true }));
    await new Promise(r => setTimeout(r, 1800));
    const updated = { ...connected[sourceId], last_synced: new Date().toISOString(), node_count: (connected[sourceId]?.node_count || 0) + Math.floor(Math.random() * 8 + 2) };
    await storage.save(sourceId, '', updated);
    setConnected(p => ({ ...p, [sourceId]: updated }));
    setSyncing(p => ({ ...p, [sourceId]: false }));
  };

  const handleDisconnect = async (sourceId) => {
    await storage.remove(sourceId);
    setConnected(p => { const n = { ...p }; delete n[sourceId]; return n; });
  };

  const connectedCount = Object.values(connected).filter(s => s.status === 'connected').length;

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Data Sources</h1>
        <p className="page-subtitle">
          {connectedCount > 0
            ? `${connectedCount} source${connectedCount > 1 ? 's' : ''} connected — AXON is building your memory graph.`
            : 'Connect your apps so AXON ingests and structures your knowledge automatically.'}
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {DATA_SOURCES.map(source => {
          const conn = connected[source.id];
          const isConnected = conn?.status === 'connected';
          const isSoon = !source.canConnect;
          const isSyncing = syncing[source.id];
          const { Logo, name, tagline, bg, badge } = source;

          return (
            <div key={source.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden', opacity: isSoon ? 0.65 : 1 }}>
              {/* Card header */}
              <div style={{ background: bg, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Logo size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{name}</span>
                    {badge && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: badge === 'Soon' ? 'rgba(0,0,0,0.4)' : 'rgba(0,243,255,0.2)', color: badge === 'Soon' ? 'rgba(255,255,255,0.5)' : 'var(--color-neon-cyan)', fontWeight: 700 }}>{badge}</span>}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>{tagline}</div>
                </div>
                {isConnected && <CheckCircle size={16} color="#25c2a0" />}
              </div>

              {/* Meta row */}
              {isConnected && (
                <div style={{ display: 'flex', gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {conn.account_name && <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>@{conn.account_name}</span>}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {timeAgo(conn.last_synced)}</span>
                  {conn.node_count > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Database size={11} /> {conn.node_count} nodes</span>}
                </div>
              )}

              {/* Actions */}
              <div style={{ padding: '12px 14px', display: 'flex', gap: 8 }}>
                {isSoon ? (
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={12} /> Coming soon
                  </div>
                ) : !isConnected ? (
                  <button onClick={() => setModal(source)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 8, border: '1px solid rgba(0,243,255,0.2)', background: 'rgba(0,243,255,0.06)', color: 'var(--color-neon-cyan)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    Connect <ChevronRight size={14} />
                  </button>
                ) : (
                  <>
                    <button onClick={() => handleSync(source.id)} disabled={isSyncing}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      <RefreshCw size={12} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
                      {isSyncing ? 'Syncing…' : 'Sync'}
                    </button>
                    <button onClick={() => handleDisconnect(source.id)}
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

      <ConnectModal source={modal} isOpen={!!modal} onClose={() => setModal(null)} onSuccess={handleSuccess} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
