import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check, Zap, CheckCircle, Copy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { callFunction } from '../lib/functions';
import { MCP_GATEWAY_URL } from '../lib/platformClients';
import { DATA_SOURCES } from '../lib/logos';

const USE_CASES = [
  { id: 'founder', emoji: '🚀', label: 'Founder / Product', desc: 'Build and ship faster with AI that knows your roadmap' },
  { id: 'developer', emoji: '💻', label: 'Developer', desc: 'Context-aware coding across all your projects' },
  { id: 'researcher', emoji: '🔬', label: 'Researcher / Analyst', desc: 'Connect notes, papers and findings into one graph' },
  { id: 'creator', emoji: '✍️', label: 'Creator / Writer', desc: 'Never lose an idea — AXON remembers everything' },
  { id: 'business', emoji: '🏢', label: 'Business / Enterprise', desc: 'Team knowledge base that every AI tool can access' },
];

// Only the 4 providers with a real OAuth backend — no more paste-a-token
// "quick connect" simulation. Connecting here starts the same real
// oauth-start redirect as the Data Sources page.
const REAL_SOURCE_IDS = ['gmail', 'github', 'notion', 'slack'];
const QUICK_SOURCES = DATA_SOURCES.filter((s) => REAL_SOURCE_IDS.includes(s.id));

function ProgressBar({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i < current ? 'var(--color-neon-cyan)' : 'rgba(255,255,255,0.12)', transition: 'background 0.3s' }} />
      ))}
    </div>
  );
}

function ConnectSourceButton({ source, isDemo, onDemoConnect }) {
  const { Logo, name, bg, tagline } = source;
  const [connecting, setConnecting] = useState(false);

  const handleClick = async () => {
    if (isDemo) { onDemoConnect(source.id); return; }
    setConnecting(true);
    try {
      const { url } = await callFunction('oauth-start', { method: 'GET', query: { provider: source.id } });
      window.location.href = url;
    } catch (err) {
      alert(err.message);
      setConnecting(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={connecting} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Logo size={20} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{name}</div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{tagline}</div>
      </div>
      <ChevronRight size={16} color="var(--color-text-secondary)" />
      {connecting && <span style={{ fontSize: 11, color: 'var(--color-neon-cyan)' }}>Redirecting…</span>}
    </button>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0); // 0=welcome, 1=usecase, 2=ai adapters info, 3=sources, 4=done
  const [name, setName] = useState('');
  const [useCase, setUseCase] = useState('');
  const [connectedSources, setConnectedSources] = useState({});
  const [copied, setCopied] = useState(false);
  const { user, isDemo } = useAuth();
  const navigate = useNavigate();

  const displayName = name || user?.user_metadata?.full_name?.split(' ')[0] || '';

  const STEPS = 5;
  const next = () => setStep((s) => Math.min(s + 1, STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleDemoConnect = (id) => setConnectedSources((prev) => ({ ...prev, [id]: true }));
  const copyUrl = () => { navigator.clipboard.writeText(MCP_GATEWAY_URL); setCopied(true); setTimeout(() => setCopied(false), 1400); };

  return (
    <div className="fullscreen-page" style={{ padding: '20px' }}>
      <div className="glass-card" style={{ maxWidth: 580, width: '100%', padding: '32px' }}>
        <ProgressBar current={step} total={STEPS} />

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
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && next()}
                placeholder="Your first name"
                style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box', textAlign: 'center' }}
              />
            </div>
            <button onClick={next} className="btn-primary" style={{ width: '100%', fontSize: 15, padding: '13px' }}>
              {displayName ? `Let's go, ${displayName} →` : "Let's go →"}
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>How will you use AXON{displayName ? `, ${displayName}` : ''}?</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 20, fontSize: 14 }}>We'll personalize your experience based on your workflow.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {USE_CASES.map((uc) => (
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

        {/* Step 2: AI adapters — informational, not a fake key-test. Connecting
            an assistant actually happens from inside Claude/ChatGPT using this
            MCP URL, so we show that instead of simulating a paste-your-key flow. */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Connect your AI tools</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
              In Claude or ChatGPT, add AXON as a connector using this URL — you'll be asked to log in and approve, no key to copy. You can do this anytime from the AI Adapters page.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.35)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'monospace', fontSize: 12.5, marginBottom: 24 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{MCP_GATEWAY_URL}</span>
              <button onClick={copyUrl} style={{ background: 'none', border: 'none', color: 'var(--color-neon-cyan)', cursor: 'pointer', flexShrink: 0 }}>
                {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={back} className="btn-secondary" style={{ flex: 1 }}><ChevronLeft size={16} /></button>
              <button onClick={next} className="btn-primary" style={{ flex: 2 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3: real data-source OAuth connect */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Connect a data source</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
              AXON ingests your existing knowledge — mail, repos, docs — to build your memory graph. This opens a real login for that provider.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {QUICK_SOURCES.map((s) => (
                connectedSources[s.id] ? (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(37,194,160,0.08)', border: '1px solid rgba(37,194,160,0.25)' }}>
                    <CheckCircle size={18} color="#25c2a0" />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name} connected</span>
                  </div>
                ) : (
                  <ConnectSourceButton key={s.id} source={s} isDemo={isDemo} onDemoConnect={handleDemoConnect} />
                )
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={back} className="btn-secondary" style={{ flex: 1 }}><ChevronLeft size={16} /></button>
              <button onClick={next} className="btn-primary" style={{ flex: 2 }}>
                {Object.keys(connectedSources).length > 0 ? 'Continue →' : 'Skip for now →'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }} className="gradient-text">
              {displayName ? `You're all set, ${displayName}!` : "You're all set!"}
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.7 }}>
              AXON is now active. You can connect more tools anytime from the dashboard.
            </p>
            <button onClick={() => navigate('/dashboard')} className="btn-primary" style={{ width: '100%', fontSize: 16, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Zap size={18} /> Open Dashboard
            </button>
            <button onClick={back} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer' }}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
