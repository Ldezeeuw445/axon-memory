import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, ShieldCheck, Terminal, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { callFunction } from '../lib/functions';
import { IconGoogle, IconGitHub, IconNotion, IconSlack } from '../components/BrandIcons';

const ROLES = ['Founder', 'Engineer', 'Product', 'Designer', 'Writer', 'Other'];

const SOURCES = [
  { id: 'gmail', name: 'Gmail', icon: <IconGoogle size={20} /> },
  { id: 'github', name: 'GitHub', icon: <IconGitHub size={20} color="#c9d1d9" /> },
  { id: 'notion', name: 'Notion', icon: <IconNotion size={20} /> },
  { id: 'slack', name: 'Slack', icon: <IconSlack size={20} /> },
];

const TOTAL_STEPS = 5;

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('');
  const [useCase, setUseCase] = useState('');
  const [saving, setSaving] = useState(false);
  const [connectBusy, setConnectBusy] = useState(null);
  const navigate = useNavigate();

  const markComplete = async () => {
    await supabase
      .from('profiles')
      .update({ role: role || null, use_case: useCase || null, onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id);
    await refreshProfile();
  };

  const handleNext = async () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
      return;
    }
    // Entering the final "connect a source" step — save profile answers now,
    // since the next action (Connect) navigates away from the SPA entirely.
    setSaving(true);
    try {
      await markComplete();
      setStep(TOTAL_STEPS);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const connectSource = async (providerId) => {
    setConnectBusy(providerId);
    try {
      const { url } = await callFunction('oauth-start', { method: 'GET', query: { provider: providerId } });
      window.location.href = url;
    } catch (err) {
      alert(err.message);
      setConnectBusy(null);
    }
  };

  const skipToApp = () => navigate('/dashboard');

  return (
    <div className="fullscreen-page">
      <div className="glass-card" style={{ maxWidth: '650px', width: '90%', textAlign: 'center', padding: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          {step === 1 && <Brain size={48} color="var(--color-neon-cyan)" />}
          {step === 2 && <Brain size={48} color="var(--color-neon-purple)" />}
          {step === 3 && <ShieldCheck size={48} color="#25c2a0" />}
          {step === 4 && <Terminal size={48} color="var(--color-neon-cyan)" />}
          {step === 5 && <Terminal size={48} color="var(--color-neon-cyan)" />}
        </div>

        <h2 style={{ fontSize: '28px', marginBottom: '16px' }}>
          {step === 1 && 'One memory. Every AI.'}
          {step === 2 && 'Tell Axon about you'}
          {step === 3 && 'Encrypted at rest'}
          {step === 4 && "Where we're headed"}
          {step === 5 && 'Connect your first source'}
        </h2>

        {step === 1 && (
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px', lineHeight: '1.6', fontSize: '16px' }}>
            Axon Memory is a permanent memory layer that gives ChatGPT, Claude, Gemini, Cursor, and everything else you use
            one shared, structured portrait of your goals, voice, projects, and context — tell one assistant something once,
            and every other assistant you connect already knows it.
          </p>
        )}

        {step === 2 && (
          <div style={{ marginBottom: '32px', textAlign: 'left' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', textAlign: 'center' }}>
              This tunes what Axon prioritizes when it builds your context.
            </p>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>I am a…</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className="glow-btn"
                  style={{
                    background: role === r ? 'var(--color-accent-gradient)' : 'rgba(255,255,255,0.05)',
                    border: role === r ? 'none' : '1px solid var(--color-border)',
                    padding: '6px 14px', fontSize: 13,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>
              What do you want Axon to remember for you?
            </label>
            <textarea
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
              placeholder="e.g. keep every AI tool I use in sync on my startup's architecture, voice, and open decisions"
              rows={3}
              style={{
                width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)',
                borderRadius: 8, padding: 12, color: 'inherit', fontFamily: 'inherit', fontSize: 14, resize: 'vertical',
              }}
            />
          </div>
        )}

        {step === 3 && (
          <div style={{ marginBottom: '32px', textAlign: 'left', background: 'rgba(0,0,0,0.3)', padding: '24px', borderRadius: '12px' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px', fontSize: '16px', textAlign: 'center' }}>
              Your memory is your most private asset. We treat it that way.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '16px', padding: '0 16px' }}>
              <li style={{ display: 'flex', gap: '12px' }}><ShieldCheck color="var(--color-neon-cyan)" style={{ flexShrink: 0 }} /> <span><strong>Encrypted source tokens:</strong> every connected account's OAuth token is AES-encrypted at rest — never stored in plaintext.</span></li>
              <li style={{ display: 'flex', gap: '12px' }}><ShieldCheck color="var(--color-neon-cyan)" style={{ flexShrink: 0 }} /> <span><strong>Row-level security:</strong> Postgres policies mean your memory is only ever queryable by you, enforced at the database layer.</span></li>
              <li style={{ display: 'flex', gap: '12px' }}><ShieldCheck color="var(--color-neon-cyan)" style={{ flexShrink: 0 }} /> <span><strong>Real login, not shared tokens:</strong> connecting Claude or ChatGPT means signing in and approving — nothing to copy, paste, or leak.</span></li>
            </ul>
          </div>
        )}

        {step === 4 && (
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px', lineHeight: '1.6', fontSize: '16px' }}>
            Picture opening Cursor on a Monday. It already knows the architecture decision you made with Claude last
            Thursday. You prompt ChatGPT and it answers in the context you already built. Next: connect the first
            thing Axon should learn from.
          </p>
        )}

        {step === 5 && (
          <div style={{ marginBottom: 28, textAlign: 'left' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 18, textAlign: 'center', fontSize: 14 }}>
              Pick one to start — you can add the rest, plus Claude, ChatGPT, and Gemini, any time from the app.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => connectSource(s.id)}
                  disabled={connectBusy !== null}
                  className="glow-btn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', justifyContent: 'flex-start',
                  }}
                >
                  {connectBusy === s.id ? <Loader2 size={18} className="spin" /> : s.icon}
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '32px' }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((i) => (
            <div key={i} style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: i === step ? 'var(--color-neon-cyan)' : 'var(--color-border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {step < TOTAL_STEPS ? (
          <button className="glow-btn" onClick={handleNext} disabled={saving} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving ? <Loader2 size={16} className="spin" /> : step === TOTAL_STEPS - 1 ? 'Connect a source' : 'Next'} <ArrowRight size={15} />
          </button>
        ) : (
          <button onClick={skipToApp} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>
            Skip for now — take me to the dashboard
          </button>
        )}
      </div>
    </div>
  );
}
