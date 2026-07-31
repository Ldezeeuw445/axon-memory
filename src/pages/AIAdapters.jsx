import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader, Trash2, Eye, EyeOff, ExternalLink, ChevronRight, Zap } from 'lucide-react';
import Modal from '../components/Modal';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AI_PROVIDERS } from '../lib/logos';

const STORAGE_KEY = 'axon_adapters_demo';

function useStorage(user, isDemo) {
  const save = async (id, key, status, meta = {}) => {
    if (!isSupabaseConfigured || isDemo) {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      s[id] = { status, hasKey: true, ...meta };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return;
    }
    await supabase.from('ai_adapter_connections').upsert(
      { user_id: user.id, provider: id, encrypted_api_key: key, status, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,provider' }
    );
  };
  const remove = async (id) => {
    if (!isSupabaseConfigured || isDemo) {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      delete s[id]; localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return;
    }
    await supabase.from('ai_adapter_connections').delete().eq('user_id', user.id).eq('provider', id);
  };
  const load = async () => {
    if (!isSupabaseConfigured || isDemo) return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const { data } = await supabase.from('ai_adapter_connections').select('provider, status').eq('user_id', user.id);
    return Object.fromEntries((data || []).map(r => [r.provider, { status: r.status, hasKey: true }]));
  };
  return { save, remove, load };
}

function ProviderCard({ provider, status, onConnect, onDisconnect }) {
  const { Logo, name, tagline, bg, color } = provider;
  const isConnected = status === 'connected';
  const isError = status === 'error';

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: bg, padding: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Logo size={28} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{name}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>{tagline}</div>
        </div>
        {/* Status badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
          borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: isConnected ? 'rgba(37,194,160,0.25)' : isError ? 'rgba(255,80,80,0.25)' : 'rgba(0,0,0,0.3)',
          color: isConnected ? '#25c2a0' : isError ? '#ff6b6b' : 'rgba(255,255,255,0.6)',
        }}>
          {isConnected ? <><CheckCircle size={11} /> Connected</> : isError ? <><XCircle size={11} /> Error</> : <span style={{ opacity: 0.7 }}>Not connected</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '14px 16px', display: 'flex', gap: 8 }}>
        {isConnected ? (
          <>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#25c2a0' }}>
              <Zap size={14} /> Memory context active
            </div>
            <button onClick={() => onDisconnect(provider.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,80,80,0.25)', background: 'rgba(255,80,80,0.07)', color: '#ff6b6b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              <Trash2 size={13} /> Disconnect
            </button>
          </>
        ) : (
          <button onClick={() => onConnect(provider)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', borderRadius: 8, border: `1px solid ${color}40`, background: `${color}15`, color, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {isError ? 'Reconnect' : 'Connect'} <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function ConnectModal({ provider, isOpen, onClose, onSuccess }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [step, setStep] = useState('guide'); // 'guide' | 'input' | 'testing' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) { setApiKey(''); setStep('guide'); setErrorMsg(''); setShowKey(false); }
  }, [isOpen]);

  if (!provider) return null;
  const { Logo, name, bg, color, guide, docsUrl, docsLabel, tokenPlaceholder, placeholder } = provider;
  const ph = placeholder || tokenPlaceholder || 'Enter your API key...';

  const handleTest = async () => {
    if (!apiKey.trim()) return;
    setStep('testing');
    try {
      const res = await fetch('/api/adapters/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setStep('success');
        setTimeout(() => { onSuccess(provider.id, apiKey.trim(), 'connected'); onClose(); }, 1400);
      } else {
        setErrorMsg(data.message || 'Connection failed');
        setStep('error');
      }
    } catch {
      setErrorMsg('Cannot reach AXON server — make sure the backend is running.');
      setStep('error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" width="520px">
      {/* Branded header */}
      <div style={{ background: bg, borderRadius: 10, padding: '20px', display: 'flex', alignItems: 'center', gap: 14, margin: '-20px -20px 20px', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Logo size={26} />
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>Connect {name}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Secure API key connection</div>
        </div>
      </div>

      {step === 'guide' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            Follow these steps to get your API key:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {guide.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${color}25`, color, fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i+1}</div>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{step}</span>
              </div>
            ))}
          </div>
          <a href={docsUrl} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color, marginBottom: 20, textDecoration: 'none' }}>
            <ExternalLink size={12} /> {docsLabel}
          </a>
          <button onClick={() => setStep('input')} className="btn-primary" style={{ width: '100%' }}>
            I have my key → Enter it
          </button>
        </>
      )}

      {(step === 'input' || step === 'error') && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
              API KEY
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && apiKey.trim() && handleTest()}
                placeholder={ph}
                autoFocus
                style={{ width: '100%', padding: '11px 40px 11px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${step === 'error' ? '#ff6b6b50' : 'var(--color-border)'}`, borderRadius: 9, color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
              <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </div>
          {step === 'error' && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', marginBottom: 14, fontSize: 13, color: '#ff6b6b' }}>
              <XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {errorMsg}
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            🔒 Your key is sent to AXON's server for verification only, then stored encrypted. Never shared.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep('guide')} className="btn-secondary" style={{ flex: 1 }}>← Guide</button>
            <button onClick={handleTest} disabled={!apiKey.trim()} className="btn-primary" style={{ flex: 2 }}>
              Test & Connect
            </button>
          </div>
        </>
      )}

      {step === 'testing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0' }}>
          <Loader size={36} color={color} style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ fontWeight: 600 }}>Verifying your API key…</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Making a test call to {name}</p>
        </div>
      )}

      {step === 'success' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '24px 0' }}>
          <CheckCircle size={48} color="#25c2a0" />
          <p style={{ fontWeight: 700, fontSize: 18 }}>Connected!</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>AXON will now inject memory into your {name} conversations.</p>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Modal>
  );
}

export default function AIAdapters() {
  const { user, isDemo } = useAuth();
  const storage = useStorage(user, isDemo);
  const [statuses, setStatuses] = useState({});
  const [modal, setModal] = useState(null); // provider object

  useEffect(() => { storage.load().then(setStatuses); }, []);

  const handleDisconnect = async (id) => {
    await storage.remove(id);
    setStatuses(p => { const n = { ...p }; delete n[id]; return n; });
  };

  const handleSuccess = async (id, key, status) => {
    await storage.save(id, key, status);
    setStatuses(p => ({ ...p, [id]: { status, hasKey: true } }));
  };

  const connectedCount = Object.values(statuses).filter(s => s.status === 'connected').length;

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">AI Adapters</h1>
        <p className="page-subtitle">
          {connectedCount > 0
            ? `${connectedCount} adapter${connectedCount > 1 ? 's' : ''} active — AXON memory is being injected.`
            : 'Connect your AI tools so AXON injects memory context into every conversation.'}
        </p>
      </header>

      <div className="adapter-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {AI_PROVIDERS.map(provider => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            status={statuses[provider.id]?.status}
            onConnect={setModal}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      <ConnectModal
        provider={modal}
        isOpen={!!modal}
        onClose={() => setModal(null)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
