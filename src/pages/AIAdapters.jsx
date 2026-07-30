import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Plug, Loader, Trash2, Eye, EyeOff } from 'lucide-react';
import Modal from '../components/Modal';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, o1, DALL·E and all OpenAI models',
    placeholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    color: '#10a37f',
    logo: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
        <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-3.99 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 3.99-2.9 6.06 6.06 0 0 0-.74-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68V11.4l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.23zm-9.66-4.12a4.47 4.47 0 0 1-.53-3.01l.14.08 4.78 2.76a.78.78 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.9a4.5 4.5 0 0 1-6.14-1.59zM2.34 7.9A4.48 4.48 0 0 1 4.7 5.93v5.7a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0L3.61 14.1A4.5 4.5 0 0 1 2.34 7.9zm16.1 3.86L12.6 8.38V6.05a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66 4.48 4.48 0 0 1-.54 1.97l-4.79-2.75a.77.77 0 0 0-.77 0zm2.01-3.01l-.14-.09-4.78-2.76a.77.77 0 0 0-.78 0L9.11 9.28V6.95a.08.08 0 0 1 .03-.06L14 4.1a4.5 4.5 0 0 1 6.14 1.58 4.47 4.47 0 0 1 .3 3.07zM8.3 12.86l-2.02-1.17a.07.07 0 0 1-.04-.05V6.08a4.5 4.5 0 0 1 7.37-3.45l-.14.08-4.78 2.76a.79.79 0 0 0-.39.68v6.71zm1.1-2.36l2.6-1.5 2.6 1.5v2.99l-2.6 1.5-2.6-1.5V10.5z"/>
      </svg>
    ),
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    description: 'Claude 3.5 Sonnet, Haiku and Opus',
    placeholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    color: '#d97706',
    logo: <span style={{ fontSize: '20px', fontWeight: 800, color: 'white' }}>Cl</span>,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 1.5 Pro, Flash and Nano',
    placeholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    color: '#4285F4',
    logo: (
      <svg width="24" height="24" viewBox="0 0 192 192" fill="none">
        <path d="M96 14.4C51.1 14.4 14.4 51.1 14.4 96s36.7 81.6 81.6 81.6 81.6-36.7 81.6-81.6S140.9 14.4 96 14.4zm0 151.2C55.7 165.6 26.4 136.3 26.4 96S55.7 26.4 96 26.4s69.6 29.3 69.6 69.6-29.3 69.6-69.6 69.6z" fill="white" opacity=".3"/>
        <path d="M96 48L48 96l48 48 48-48-48-48z" fill="white"/>
      </svg>
    ),
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'Sonar models with real-time web search',
    placeholder: 'pplx-...',
    docsUrl: 'https://www.perplexity.ai/settings/api',
    color: '#20b2aa',
    logo: <span style={{ fontSize: '20px', fontWeight: 800, color: 'white' }}>Px</span>,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'Inject AXON memory into Cursor IDE context',
    placeholder: 'sk-...',
    docsUrl: 'https://cursor.sh',
    color: '#6366f1',
    logo: <span style={{ fontSize: '20px', fontWeight: 800, color: 'white' }}>↑</span>,
  },
];

const STATUS_ICON = {
  connected: <CheckCircle size={16} color="#25c2a0" />,
  error: <XCircle size={16} color="#ff6b6b" />,
  testing: <Loader size={16} color="var(--color-neon-cyan)" style={{ animation: 'spin 1s linear infinite' }} />,
  disconnected: null,
};

const STATUS_LABEL = {
  connected: 'Connected',
  error: 'Error',
  testing: 'Testing...',
  disconnected: 'Not connected',
};

function useAdapterStorage(user, isDemo) {
  const STORAGE_KEY = 'axon_adapters_demo';

  const save = async (providerId, encryptedKey, status) => {
    if (!isSupabaseConfigured || isDemo) {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      existing[providerId] = { status, hasKey: true };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      return;
    }
    await supabase.from('ai_adapter_connections').upsert({
      user_id: user.id,
      provider: providerId,
      encrypted_api_key: encryptedKey,
      status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
  };

  const remove = async (providerId) => {
    if (!isSupabaseConfigured || isDemo) {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      delete existing[providerId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      return;
    }
    await supabase.from('ai_adapter_connections').delete().eq('user_id', user.id).eq('provider', providerId);
  };

  const load = async () => {
    if (!isSupabaseConfigured || isDemo) {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    }
    const { data } = await supabase.from('ai_adapter_connections').select('provider, status').eq('user_id', user.id);
    return Object.fromEntries((data || []).map(r => [r.provider, { status: r.status, hasKey: true }]));
  };

  return { save, remove, load };
}

export default function AIAdapters() {
  const { user, isDemo } = useAuth();
  const storage = useAdapterStorage(user, isDemo);
  const [statuses, setStatuses] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    storage.load().then(setStatuses);
  }, []);

  const openConnect = (provider) => {
    setActiveProvider(provider);
    setApiKey('');
    setTestResult(null);
    setShowKey(false);
    setModalOpen(true);
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/adapters/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: activeProvider.id, apiKey: apiKey.trim() }),
      });
      const data = await res.json();

      if (data.valid) {
        await storage.save(activeProvider.id, apiKey.trim(), 'connected');
        setStatuses(prev => ({ ...prev, [activeProvider.id]: { status: 'connected', hasKey: true } }));
        setTestResult({ ok: true, message: 'Connected successfully!' });
        setTimeout(() => setModalOpen(false), 1200);
      } else {
        setTestResult({ ok: false, message: data.message || 'Connection failed' });
        await storage.save(activeProvider.id, '', 'error');
        setStatuses(prev => ({ ...prev, [activeProvider.id]: { status: 'error', hasKey: false } }));
      }
    } catch (err) {
      // Backend might not be running
      setTestResult({ ok: false, message: `Cannot reach AXON server: ${err.message}. Make sure the backend is running.` });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async (providerId) => {
    await storage.remove(providerId);
    setStatuses(prev => { const n = { ...prev }; delete n[providerId]; return n; });
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">AI Adapters</h1>
        <p className="page-subtitle">Connect your AI tools so AXON can inject memory context into every conversation.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {PROVIDERS.map(provider => {
          const st = statuses[provider.id];
          const status = st?.status || 'disconnected';

          return (
            <div key={provider.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px', background: provider.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {provider.logo}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{provider.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{provider.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: status === 'connected' ? '#25c2a0' : status === 'error' ? '#ff6b6b' : 'var(--color-text-secondary)' }}>
                  {STATUS_ICON[status]}
                  <span style={{ whiteSpace: 'nowrap' }}>{STATUS_LABEL[status]}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {status === 'connected' ? (
                  <button
                    onClick={() => handleDisconnect(provider.id)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.2)', borderRadius: '8px', cursor: 'pointer', color: '#ff6b6b', fontSize: '13px', fontWeight: 600 }}
                  >
                    <Trash2 size={14} /> Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => openConnect(provider)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: 'rgba(0,243,255,0.08)', border: '1px solid rgba(0,243,255,0.2)', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-neon-cyan)', fontSize: '13px', fontWeight: 600 }}
                  >
                    <Plug size={14} /> {status === 'error' ? 'Reconnect' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={`Connect ${activeProvider?.name}`}>
        {activeProvider && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Your API key is sent to AXON's server for a one-time connection test, then stored encrypted in your database. It is never shared or used without your permission.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                API Key{' '}
                <a href={activeProvider.docsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--color-neon-cyan)', fontWeight: 400 }}>
                  Get yours →
                </a>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !testing && handleConnect()}
                  placeholder={activeProvider.placeholder}
                  style={{
                    width: '100%', padding: '10px 40px 10px 12px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)',
                    fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
                  }}
                />
                <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {testResult && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '8px',
                background: testResult.ok ? 'rgba(37,194,160,0.1)' : 'rgba(255,80,80,0.1)',
                border: `1px solid ${testResult.ok ? 'rgba(37,194,160,0.3)' : 'rgba(255,80,80,0.3)'}`,
              }}>
                {testResult.ok ? <CheckCircle size={15} color="#25c2a0" style={{ flexShrink: 0, marginTop: '1px' }} /> : <AlertCircle size={15} color="#ff6b6b" style={{ flexShrink: 0, marginTop: '1px' }} />}
                <span style={{ fontSize: '13px', color: testResult.ok ? '#25c2a0' : '#ff6b6b' }}>{testResult.message}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setModalOpen(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={handleConnect} className="btn-primary" disabled={!apiKey.trim() || testing} style={{ flex: 2 }}>
                {testing ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite', marginRight: '6px' }} /> Testing...</> : 'Test & Connect'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
