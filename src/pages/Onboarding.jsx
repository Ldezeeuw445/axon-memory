import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Plug, ShieldCheck, Terminal, MessageSquare, Briefcase, Mail, FileText, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const availableSources = [
  { id: 'notion', name: 'Notion', icon: <Database size={20}/>, color: '#ffffff' },
  { id: 'linear', name: 'Linear', icon: <Database size={20}/>, color: '#5e6ad2' },
  { id: 'slack', name: 'Slack', icon: <MessageSquare size={20}/>, color: '#e01e5a' },
  { id: 'github', name: 'GitHub', icon: <Briefcase size={20}/>, color: '#ffffff' },
  { id: 'gmail', name: 'Gmail', icon: <Mail size={20}/>, color: '#ea4335' },
  { id: 'apple', name: 'Apple Notes', icon: <FileText size={20}/>, color: '#f5a623' },
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [connectedSources, setConnectedSources] = useState({});
  const { user } = useAuth();
  const navigate = useNavigate();

  const toggleSource = (id) => {
    setConnectedSources(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      navigate('/dashboard');
    }
  };

  const stepIcons = [
    <Brain size={48} color="var(--color-neon-cyan)" />,
    <Plug size={48} color="var(--color-neon-purple)" />,
    <ShieldCheck size={48} color="#25c2a0" />,
    <Terminal size={48} color="var(--color-neon-cyan)" />,
  ];

  const stepTitles = [
    'The Universal Memory Layer',
    'Connect Your Data',
    'Military-Grade Security',
    "Where We're Headed",
  ];

  return (
    <div className="fullscreen-page">
      <div className="glass-card" style={{ maxWidth: '650px', width: '90%', textAlign: 'center', padding: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          {stepIcons[step - 1]}
        </div>

        <h2 style={{ fontSize: '28px', marginBottom: '16px' }}>{stepTitles[step - 1]}</h2>

        {step === 1 && (
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px', lineHeight: '1.6', fontSize: '16px' }}>
            AXON is the <strong>Stripe for AI Memory</strong> — a single, secure layer that makes every AI tool you use smarter, forever. Connect once, benefit everywhere.
            {user && <><br /><br /><span style={{ color: 'var(--color-neon-cyan)', fontWeight: 600 }}>Welcome, {user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0]}! 👋</span></>}
          </p>
        )}

        {step === 2 && (
          <div style={{ marginBottom: '32px' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', lineHeight: '1.6' }}>
              AXON ingests from your favourite tools to build a living, structured knowledge graph. Select what to connect — all optional and changeable later.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {availableSources.map(source => (
                <button
                  key={source.id}
                  onClick={() => toggleSource(source.id)}
                  style={{
                    padding: '12px 8px', borderRadius: '12px', cursor: 'pointer', border: 'none',
                    background: connectedSources[source.id] ? 'rgba(0,243,255,0.15)' : 'rgba(255,255,255,0.05)',
                    outline: connectedSources[source.id] ? '1px solid var(--color-neon-cyan)' : '1px solid transparent',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    color: connectedSources[source.id] ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
                    transition: 'all 0.2s',
                  }}
                >
                  {source.icon}
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>{source.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
            {[
              { title: 'End-to-End Encryption', desc: 'All memory data and API keys encrypted at rest with AES-256.' },
              { title: 'Row-Level Security', desc: 'Your data is cryptographically isolated — nobody else can see it.' },
              { title: 'Zero Knowledge Sharing', desc: 'Your memory context is never shared with third parties or used to train AI models.' },
              { title: 'Full Data Portability', desc: 'Export or delete all your data at any time, instantly.' },
            ].map(item => (
              <div key={item.title} style={{ display: 'flex', gap: '12px', background: 'rgba(37,194,160,0.05)', border: '1px solid rgba(37,194,160,0.15)', borderRadius: '10px', padding: '12px 14px' }}>
                <ShieldCheck size={18} color="#25c2a0" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>{item.title}</p>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div style={{ marginBottom: '32px' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', lineHeight: '1.6' }}>
              AXON is just getting started. Here's what's coming:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
              {[
                { label: 'iOS & Android Apps', eta: 'Q3 2025', color: 'var(--color-neon-cyan)' },
                { label: 'Open Developer API', eta: 'Q4 2025', color: 'var(--color-neon-purple)' },
                { label: 'Decentralized Memory (Web3)', eta: '2026', color: '#f59e0b' },
                { label: 'OS-level Memory Integration', eta: '2026', color: '#10b981' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{item.label}</span>
                  <span style={{ fontSize: '12px', color: item.color, fontWeight: 700 }}>{item.eta}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
          {[1,2,3,4].map(s => (
            <div key={s} style={{ width: s === step ? '24px' : '8px', height: '8px', borderRadius: '4px', background: s === step ? 'var(--color-neon-cyan)' : 'rgba(255,255,255,0.2)', transition: 'all 0.3s' }} />
          ))}
        </div>

        <button onClick={handleNext} className="btn-primary" style={{ width: '100%', fontSize: '16px', padding: '14px 24px' }}>
          {step < 4 ? 'Continue →' : "Let's go →"}
        </button>

        {step < 4 && (
          <button onClick={() => navigate('/dashboard')} style={{ marginTop: '12px', background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}
