import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check, Zap, Eye, EyeOff, Loader, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AI_PROVIDERS, DATA_SOURCES } from '../lib/logos';

const USE_CASES = [
  { id: 'founder', emoji: '🚀', label: 'Founder / Product', desc: 'Build and ship faster with AI that knows your roadmap' },
  { id: 'developer', emoji: '💻', label: 'Developer', desc: 'Context-aware coding across all your projects' },
  { id: 'researcher', emoji: '🔬', label: 'Researcher / Analyst', desc: 'Connect notes, papers and findings into one graph' },
  { id: 'creator', emoji: '✍️', label: 'Creator / Writer', desc: 'Never lose an idea — AXON remembers everything' },
  { id: 'business', emoji: '🏢', label: 'Business / Enterprise', desc: 'Team knowledge base that every AI tool can access' },
];

const QUICK_ADAPTERS = AI_PROVIDERS.slice(0, 3); // OpenAI, Claude, Gemini
const QUICK_SOURCES = DATA_SOURCES.filter(s => s.canConnect).slice(0, 3); // Notion, GitHub, Linear

function ProgressBar({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i < current ? 'var(--color-neon-cyan)' : 'rgba(255,255,255,0.12)', transition: 'background 0.3s' }} />
      ))}
    </div>
  );
}

function QuickConnectAdapter({ provider, onConnect }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | testing | ok | err
  const [err, setErr] = useState('');
  const { Logo, name, bg, placeholder, color } = provider;

  const handleTest = async () => {
    if (!key.trim()) return;
    setStatus('testing');
    try {
      const res = await fetch('/api/adapters/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, apiKey: key.trim() }),
      });
      const d = await res.json();
      if (d.valid) {
        setStatus('ok');
        onConnect(provider.id, key.trim());
      } else {
        setErr(d.message || 'Invalid key');
        setStatus('err');
      }
    } catch {
      setErr('Server unreachable');
      setStatus('err');
    }
  };

  if (status === 'ok') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(37,194,160,0.08)', border: '1px solid rgba(37,194,160,0.25)' }}>
        <CheckCircle size={18} color="#25c2a0" />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{name} connected</span>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: open ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Logo size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{name}</div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{provider.tagline}</div>
        </div>
        <ChevronRight size={16} color="var(--color-text-secondary)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '10px 0 8px', lineHeight: 1.5 }}>
            Get your key at{' '}
            <a href={provider.docsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--color-neon-cyan)' }}>{provider.docsLabel}</a>
          </p>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input type={showKey ? 'text' : 'password'} value={key} onChange={e => setKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && key.trim() && handleTest()}
              placeholder={placeholder} autoFocus
              style={{ width: '100%', padding: '9px 36px 9px 10px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${status === 'err' ? '#ff6b6b40' : 'var(--color-border)'}`, borderRadius: 7, color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              {showKey ? <EyeOff size={13}/> : <Eye size={13}/>}
            </button>
          </div>
          {status === 'err' && <p style={{ fontSize: 11, color: '#ff6b6b', marginBottom: 8 }}>{err}</p>}
          <button onClick={handleTest} disabled={!key.trim() || status === 'testing'}
            style={{ width: '100%', padding: '8px', borderRadius: 7, border: 'none', background: `${color}20`, color, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {status === 'testing' ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }}/> Testing…</> : 'Test & Connect'}
          </button>
        </div>
      )}
    </div>
  );
}

function QuickConnectSource({ source, onConnect }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('idle');
  const [err, setErr] = useState('');
  const { Logo, name, bg, tokenPlaceholder } = source;

  const handleTest = async () => {
    if (!token.trim()) return;
    setStatus('testing');
    try {
      const res = await fetch('/api/sources/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: source.id, token: token.trim() }),
      });
      const d = await res.json();
      if (d.valid) {
        setStatus('ok');
        onConnect(source.id, token.trim(), { account_name: d.accountName });
      } else {
        setErr(d.error || 'Connection failed');
        setStatus('err');
      }
    } catch {
      setErr('Server unreachable');
      setStatus('err');
    }
  };

  if (status === 'ok') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(37,194,160,0.08)', border: '1px solid rgba(37,194,160,0.25)' }}>
        <CheckCircle size={18} color="#25c2a0" />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{name} connected</span>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: open ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Logo size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{name}</div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{source.tagline}</div>
        </div>
        <ChevronRight size={16} color="var(--color-text-secondary)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '10px 0 8px', lineHeight: 1.5 }}>
            Get your token at{' '}
            <a href={source.docsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--color-neon-cyan)' }}>{source.docsLabel}</a>
          </p>
          <input type="password" value={token} onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && token.trim() && handleTest()}
            placeholder={tokenPlaceholder} autoFocus
            style={{ width: '100%', padding: '9px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 7, color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
          {status === 'err' && <p style={{ fontSize: 11, color: '#ff6b6b', marginBottom: 8 }}>{err}</p>}
          <button onClick={handleTest} disabled={!token.trim() || status === 'testing'}
            style={{ width: '100%', padding: '8px', borderRadius: 7, border: 'none', background: 'rgba(0,243,255,0.12)', color: 'var(--color-neon-cyan)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {status === 'testing' ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }}/> Connecting…</> : 'Connect'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0); // 0=welcome, 1=usecase, 2=adapters, 3=sources, 4=done
  const [name, setName] = useState('');
  const [useCase, setUseCase] = useState('');
  const [connectedAdapters, setConnectedAdapters] = useState({});
  const [connectedSources, setConnectedSources] = useState({});
  const { user } = useAuth();
  const navigate = useNavigate();

  const displayName = name || user?.user_metadata?.full_name?.split(' ')[0] || '';
  const totalConnections = Object.keys(connectedAdapters).length + Object.keys(connectedSources).length;

  const STEPS = 5;

  const next = () => setStep(s => Math.min(s + 1, STEPS - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  return (
    <div className="fullscreen-page" style={{ padding: '20px' }}>
      <div className="glass-card" style={{ maxWidth: 580, width: '100%', padding: '32px' }}>
        <ProgressBar current={step} total={STEPS} />

        {/* Step 0: Welcome + name */}
        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <img src="/app-icon-1024.png" alt="AXON" style={{ width: 80, height: 80, borderRadius: 18, marginBottom: 20, objectFit: 'cover' }} />
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }} className="gradient-text">Welcome to AXON</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
              The universal AI memory layer. Connect once, and every AI tool you use gets instant access to your knowledge.
            </p>
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 6 }}>WHAT SHOULD AXON CALL YOU?</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && next()}
                placeholder="Your first name"
                style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box', textAlign: 'center' }}
              />
            </div>
            <button onClick={next} className="btn-primary" style={{ width: '100%', fontSize: 15, padding: '13px' }}>
              {displayName ? `Let's go, ${displayName} →` : "Let's go →"}
            </button>
          </div>
        )}

        {/* Step 1: Use case */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>How will you use AXON{displayName ? `, ${displayName}` : ''}?</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 20, fontSize: 14 }}>We'll personalize your experience based on your workflow.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {USE_CASES.map(uc => (
                <button key={uc.id} onClick={() => setUseCase(uc.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${useCase === uc.id ? 'var(--color-neon-cyan)' : 'var(--color-border)'}`, background: useCase === uc.id ? 'rgba(0,243,255,0.08)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 22, width: 32, flexShrink: 0 }}>{uc.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: useCase === uc.id ? 'var(--color-neon-cyan)' : '#fff', fontWeight: 600, fontSize: 14 }}>{uc.label}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 1 }}>{uc.desc}</div>
                  </div>
                  {useCase === uc.id && <Check size={16} color="var(--color-neon-cyan)" />}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={back} className="btn-secondary" style={{ flex: 1 }}><ChevronLeft size={16} /> Back</button>
              <button onClick={next} className="btn-primary" style={{ flex: 2 }}>
                {useCase ? 'Continue →' : 'Skip for now →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Quick connect AI adapter */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Connect your AI tools</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
              AXON injects your memory into every conversation. Connect at least one to get started — you can add more later.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {QUICK_ADAPTERS.map(p => (
                <QuickConnectAdapter key={p.id} provider={p}
                  onConnect={(id, key) => setConnectedAdapters(prev => ({ ...prev, [id]: { status: 'connected' } }))} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={back} className="btn-secondary" style={{ flex: 1 }}><ChevronLeft size={16} /></button>
              <button onClick={next} className="btn-primary" style={{ flex: 2 }}>
                {Object.keys(connectedAdapters).length > 0 ? `Continue with ${Object.keys(connectedAdapters).length} adapter${Object.keys(connectedAdapters).length > 1 ? 's' : ''} →` : 'Skip for now →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Quick connect data source */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Connect a data source</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
              AXON ingests your existing knowledge — docs, repos, tasks — to build your memory graph.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {QUICK_SOURCES.map(s => (
                <QuickConnectSource key={s.id} source={s}
                  onConnect={(id, token, meta) => setConnectedSources(prev => ({ ...prev, [id]: { status: 'connected', ...meta } }))} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={back} className="btn-secondary" style={{ flex: 1 }}><ChevronLeft size={16} /></button>
              <button onClick={next} className="btn-primary" style={{ flex: 2 }}>
                {Object.keys(connectedSources).length > 0 ? `Continue →` : 'Skip for now →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }} className="gradient-text">
              {displayName ? `You're all set, ${displayName}!` : "You're all set!"}
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.7 }}>
              AXON is now active.{' '}
              {totalConnections > 0
                ? `You've connected ${totalConnections} tool${totalConnections > 1 ? 's' : ''} — your AI memory is building.`
                : 'You can connect your tools anytime from the dashboard.'}
            </p>
            {totalConnections > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
                {[...Object.keys(connectedAdapters), ...Object.keys(connectedSources)].map(id => {
                  const p = [...AI_PROVIDERS, ...DATA_SOURCES].find(x => x.id === id);
                  return p ? (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, background: 'rgba(37,194,160,0.1)', border: '1px solid rgba(37,194,160,0.25)', fontSize: 12 }}>
                      <CheckCircle size={12} color="#25c2a0" /> {p.name}
                    </div>
                  ) : null;
                })}
              </div>
            )}
            <button onClick={() => navigate('/dashboard')} className="btn-primary" style={{ width: '100%', fontSize: 16, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Zap size={18} /> Open Dashboard
            </button>
            <button onClick={back} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer' }}>
              ← Back
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
