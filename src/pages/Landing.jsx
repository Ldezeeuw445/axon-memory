import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain, ArrowRight, Mail, Briefcase, Database, MessageSquare,
  ShieldCheck, Zap, Terminal, Check, ChevronDown, Lock, RefreshCw, KeyRound,
} from 'lucide-react';

const LogoGithub = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.34.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .3.2.66.79.55A10.51 10.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
  </svg>
);
const LogoOpenAI = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073z" />
  </svg>
);
const LogoAnthropic = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.5 2L13.5 12h-3l-4-10H3l5.5 14h3l5.5-14z" />
  </svg>
);
const LogoGemini = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C12 6.62742 6.62742 12 0 12C6.62742 12 12 17.3726 12 24C12 17.3726 17.3726 12 24 12C17.3726 12 12 6.62742 12 0Z" />
  </svg>
);

const SOURCES = [
  { name: 'Gmail', icon: <Mail size={22} />, color: '#ea4335' },
  { name: 'GitHub', icon: <Briefcase size={22} />, color: '#c9d1d9' },
  { name: 'Notion', icon: <Database size={22} />, color: '#ffffff' },
  { name: 'Slack', icon: <MessageSquare size={22} />, color: '#e01e5a' },
];

const DESTINATIONS = [
  { name: 'ChatGPT', icon: <LogoOpenAI />, color: '#10a37f' },
  { name: 'Claude', icon: <LogoAnthropic />, color: '#d97757' },
  { name: 'Gemini', icon: <LogoGemini />, color: '#4285f4' },
  { name: 'Cursor', icon: <Terminal size={26} />, color: '#00f3ff' },
];

const FAQS = [
  {
    q: 'What exactly does AXON send to an AI tool?',
    a: 'A single JSON "context pack": your profile, a list of connected sources, extracted entities, and a token-budgeted set of relevant memory items grouped by type. You set the token budget per request — nothing more leaves AXON than you asked for.',
  },
  {
    q: 'Can I see and delete what AXON has stored?',
    a: 'Yes. Every synced item lives in your account and is queryable from the dashboard. Disconnecting a source stops future syncs immediately; deleting your account wipes everything, including encrypted tokens, in one action.',
  },
  {
    q: 'Do you read my emails or just metadata?',
    a: 'Gmail sync is read-only and scoped to gmail.readonly — AXON never sends, deletes, or modifies anything in a connected account. Same principle for GitHub, Notion, and Slack: read access to build memory, no write access to your source apps.',
  },
  {
    q: 'What happens if I cancel?',
    a: 'You keep read access to your existing memory graph and can export or delete it. Context-pack requests and new syncing stop until you resubscribe.',
  },
];

function NavBar() {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 6vw', backdropFilter: 'blur(14px)', background: 'rgba(3,3,5,0.7)', borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Brain size={22} color="var(--color-neon-cyan)" />
        <span className="gradient-text" style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>AXON</span>
      </div>
      <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
        <a href="#how" style={{ color: 'var(--color-text-secondary)', fontSize: 14, textDecoration: 'none' }}>How it works</a>
        <a href="#pricing" style={{ color: 'var(--color-text-secondary)', fontSize: 14, textDecoration: 'none' }}>Pricing</a>
        <a href="#security" style={{ color: 'var(--color-text-secondary)', fontSize: 14, textDecoration: 'none' }}>Security</a>
        <a href="#faq" style={{ color: 'var(--color-text-secondary)', fontSize: 14, textDecoration: 'none' }}>FAQ</a>
        <Link to="/login" style={{ color: 'var(--color-text-primary)', fontSize: 14, textDecoration: 'none' }}>Sign in</Link>
        <Link to="/login" className="glow-btn" style={{ padding: '9px 20px', fontSize: 14, textDecoration: 'none' }}>Get started</Link>
      </div>
    </nav>
  );
}

function Section({ id, children, style }) {
  return (
    <section id={id} style={{ padding: '100px 6vw', maxWidth: 1200, margin: '0 auto', position: 'relative', ...style }}>
      {children}
    </section>
  );
}

function ContextPackPreview() {
  return (
    <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--color-border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
        <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
          GET /functions/v1/context-pack?query=project+status
        </span>
      </div>
      <pre style={{ margin: 0, padding: '20px 22px', fontSize: 13, lineHeight: 1.7, color: '#c9d1d9', overflowX: 'auto', fontFamily: 'monospace' }}>
{`{
  "profile": { "name": "You", "role": "Founder", "plan": "standard" },
  "connected_sources": [
    { "provider": "github", "status": "connected" },
    { "provider": "notion", "status": "connected" }
  ],
  "entities": ["Axon Memory", "Q3 launch", "Stripe billing"],
  "memory": {
    "decision": [ { "title": "Went Supabase-only", "source": "notion" } ],
    "code_change": [ { "title": "OAuth state now HMAC-signed", "source": "github" } ]
  },
  "stats": { "items_returned": 14, "approx_tokens": 812 }
}`}
      </pre>
    </div>
  );
}

function FaqItem({ q, a, open, onClick }) {
  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onClick}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
          padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15, fontWeight: 600,
        }}
      >
        {q}
        <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, marginLeft: 12 }} />
      </button>
      {open && (
        <p style={{ padding: '0 24px 20px', color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.7 }}>{a}</p>
      )}
    </div>
  );
}

export default function Landing() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div style={{ overflowX: 'hidden' }}>
      <NavBar />

      {/* Hero */}
      <Section style={{ textAlign: 'center', paddingTop: '130px', paddingBottom: '60px' }}>
        <div className="orb" style={{ width: 400, height: 400, background: 'var(--color-neon-cyan)', opacity: 0.12, top: -120, left: '10%' }} />
        <div className="orb" style={{ width: 420, height: 420, background: 'var(--color-neon-purple)', opacity: 0.12, top: -80, right: '8%', animationDelay: '3s' }} />

        <div className="reveal" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999,
          border: '1px solid var(--color-border)', fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 28, position: 'relative',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-neon-cyan)' }} />
          One memory layer. Every AI you use.
        </div>

        <h1 className="reveal" style={{ fontSize: 'clamp(38px, 6.4vw, 76px)', fontWeight: 800, lineHeight: 1.08, marginBottom: 26, position: 'relative', animationDelay: '0.05s' }}>
          Stop re-explaining<br />
          <span className="gradient-text">yourself to every AI.</span>
        </h1>
        <p className="reveal" style={{ fontSize: 20, color: 'var(--color-text-secondary)', maxWidth: 660, margin: '0 auto 44px', lineHeight: 1.6, position: 'relative', animationDelay: '0.1s' }}>
          AXON connects Gmail, GitHub, Notion, and Slack into one persistent, encrypted memory graph —
          then feeds ChatGPT, Claude, Gemini, and Cursor the exact context they need, on every prompt.
          For $5 a month.
        </p>
        <div className="reveal" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', position: 'relative', animationDelay: '0.15s' }}>
          <Link to="/login" className="glow-btn" style={{ padding: '15px 34px', fontSize: 16, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Start building your brain <ArrowRight size={18} />
          </Link>
          <a href="#how" className="glow-btn" style={{ padding: '15px 34px', fontSize: 16, background: 'transparent', border: '1px solid var(--color-border)', textDecoration: 'none' }}>
            See how it works
          </a>
        </div>
      </Section>

      {/* Sources -> Brain -> Destinations */}
      <Section>
        <div className="glass-card" style={{ padding: '48px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>What you already use</span>
            <div style={{ display: 'flex', gap: 16 }}>
              {SOURCES.map((s) => (
                <div key={s.name} title={s.name} style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
                  {s.icon}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 76, height: 76, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,243,255,0.28) 0%, transparent 70%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Brain size={38} color="var(--color-neon-cyan)" />
            </div>
            <span className="gradient-text" style={{ fontSize: 13, fontWeight: 700 }}>AXON</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Where it shows up</span>
            <div style={{ display: 'flex', gap: 16 }}>
              {DESTINATIONS.map((d) => (
                <div key={d.name} title={d.name} style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: d.color }}>
                  {d.icon}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* How it works */}
      <Section id="how">
        <h2 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 12 }}>How it works</h2>
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginBottom: 56, fontSize: 16 }}>
          Three steps. No copy-pasting context ever again.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginBottom: 64 }}>
          {[
            { icon: <Database size={28} color="var(--color-neon-cyan)" />, title: 'Connect your sources', body: 'OAuth into Gmail, GitHub, Notion, and Slack. AXON encrypts every token at rest and pulls in structured memory items on a schedule you control.' },
            { icon: <Brain size={28} color="var(--color-neon-purple)" />, title: 'AXON builds your graph', body: 'Entities, projects, decisions, and relationships get extracted automatically and organized into a queryable, token-budgeted memory graph.' },
            { icon: <Zap size={28} color="var(--color-neon-cyan)" />, title: 'Every AI gets context', body: 'A single authenticated GET returns a context pack sized to fit any prompt — drop it into ChatGPT, Claude, Gemini, Cursor, or any tool that can call an API.' },
          ].map((s, i) => (
            <div key={i} className="glass-card" style={{ padding: 32 }}>
              <div style={{ marginBottom: 16 }}>{s.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{s.title}</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{s.body}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1.3fr)', gap: 40, alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--color-neon-cyan)', fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>THE ENDPOINT</p>
            <h3 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16, lineHeight: 1.3 }}>
              One request. Every AI tool speaks HTTP.
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 15, lineHeight: 1.7 }}>
              This is a real response shape from AXON's <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>context-pack</code> endpoint —
              not a mockup. Your personal API key authenticates the request; the token budget you pass in controls exactly how much comes back.
            </p>
          </div>
          <ContextPackPreview />
        </div>
      </Section>

      {/* Security */}
      <Section id="security">
        <div className="glass-card" style={{ padding: '48px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <ShieldCheck size={28} color="#25c2a0" />
            <h2 style={{ fontSize: 28, fontWeight: 800 }}>Your memory. Encrypted. Yours alone.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 28 }}>
            {[
              { icon: <Lock size={18} />, t: 'OAuth tokens are AES-encrypted at rest — never stored in plaintext.' },
              { icon: <ShieldCheck size={18} />, t: 'Row-level security in Postgres means your data is only ever queryable by you.' },
              { icon: <KeyRound size={18} />, t: 'API keys are hashed, scoped per-tool, and revocable instantly.' },
              { icon: <RefreshCw size={18} />, t: 'Every context pack is token-budgeted — you control exactly how much leaves AXON per request.' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <span style={{ color: '#25c2a0', flexShrink: 0, marginTop: 2 }}>{row.icon}</span>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{row.t}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Pricing */}
      <Section id="pricing" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>Simple, permanent pricing</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 48 }}>No per-token billing. No surprise invoices.</p>
        <div className="glass-card" style={{ maxWidth: 420, margin: '0 auto', padding: 40, border: '1px solid var(--color-neon-cyan)', boxShadow: '0 0 40px rgba(0,243,255,0.08)' }}>
          <p style={{ fontSize: 14, color: 'var(--color-neon-cyan)', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>AXON STANDARD</p>
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 56, fontWeight: 800 }}>$5</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>/month</span>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32, textAlign: 'left' }}>
            {['Unlimited structured memories', 'Gmail, GitHub, Notion, Slack sync', 'Context packs for any AI tool', 'Personal, revocable API keys'].map((f) => (
              <li key={f} style={{ display: 'flex', gap: 8, fontSize: 14 }}><Check size={16} color="var(--color-neon-cyan)" /> {f}</li>
            ))}
          </ul>
          <Link to="/login" className="glow-btn" style={{ width: '100%', display: 'block', textDecoration: 'none' }}>
            Start Building Your Brain
          </Link>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq">
        <h2 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 48 }}>Questions worth answering upfront</h2>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map((f, i) => (
            <FaqItem key={i} q={f.q} a={f.a} open={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? -1 : i)} />
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <Section style={{ textAlign: 'center', paddingTop: 40, paddingBottom: 120 }}>
        <div className="glass-card" style={{ padding: '64px 32px', position: 'relative', overflow: 'hidden' }}>
          <div className="orb" style={{ width: 300, height: 300, background: 'var(--color-neon-purple)', opacity: 0.15, top: -60, left: '50%', transform: 'translateX(-50%)' }} />
          <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16, position: 'relative' }}>Your memory shouldn't reset every time you switch tabs.</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 32, fontSize: 16, position: 'relative' }}>Five dollars a month. Four sources. Every AI you already use.</p>
          <Link to="/login" className="glow-btn" style={{ padding: '15px 40px', fontSize: 16, textDecoration: 'none', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Start Building Your Brain <ArrowRight size={18} />
          </Link>
        </div>
      </Section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--color-border)', padding: '32px 6vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={18} color="var(--color-neon-cyan)" />
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>© {new Date().getFullYear()} Axon Memory</span>
        </div>
        <a href="https://github.com/Ldezeeuw445/axon-memory" target="_blank" rel="noreferrer" style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 14 }}>
          <LogoGithub /> GitHub
        </a>
      </footer>
    </div>
  );
}
