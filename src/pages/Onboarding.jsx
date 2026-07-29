import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Plug, ShieldCheck, Database, FileText, Calendar, MessageSquare, Terminal, Briefcase, Mail } from 'lucide-react';

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

  return (
    <div className="fullscreen-page">
      <div className="glass-card" style={{ maxWidth: '650px', width: '90%', textAlign: 'center', padding: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          {step === 1 && <Brain size={48} color="var(--color-neon-cyan)" />}
          {step === 2 && <Plug size={48} color="var(--color-neon-purple)" />}
          {step === 3 && <ShieldCheck size={48} color="#25c2a0" />}
          {step === 4 && <Terminal size={48} color="var(--color-neon-cyan)" />}
        </div>
        
        <h2 style={{ fontSize: '28px', marginBottom: '16px' }}>
          {step === 1 && "The Universal Memory Layer"}
          {step === 2 && "Connect Your Data"}
          {step === 3 && "Military-Grade Security"}
          {step === 4 && "Where We're Headed"}
        </h2>
        
        {step === 1 && (
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px', lineHeight: '1.6', fontSize: '16px' }}>
            AXON is a five-dollar-a-month memory layer that gives any individual using ChatGPT, Claude, Gemini, Cursor, or Perplexity one permanent, structured portrait of their goals, voice, projects, relationships, and ongoing context.
          </p>
        )}

        {step === 2 && (
          <div style={{ marginBottom: '32px' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
              Select the tools you want AXON to learn from. We'll start building your memory graph immediately.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {availableSources.map(source => (
                <div 
                  key={source.id}
                  onClick={() => toggleSource(source.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    background: connectedSources[source.id] ? `rgba(${source.color === '#ffffff' ? '255,255,255' : '188,19,254'}, 0.1)` : 'rgba(255,255,255,0.03)',
                    border: connectedSources[source.id] ? `1px solid ${source.color}` : '1px solid var(--color-border)',
                    borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ color: source.color }}>{source.icon}</div>
                  <span style={{ fontWeight: '500', flex: 1, textAlign: 'left' }}>{source.name}</span>
                  {connectedSources[source.id] && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-neon-cyan)' }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ marginBottom: '32px', textAlign: 'left', background: 'rgba(0,0,0,0.3)', padding: '24px', borderRadius: '12px' }}>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px', fontSize: '16px', textAlign: 'center' }}>
              Your brain is your most private asset. We treat it that way.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '16px', padding: '0 16px' }}>
              <li style={{ display: 'flex', gap: '12px' }}><ShieldCheck color="var(--color-neon-cyan)"/> <span><strong>Zero-Knowledge Architecture:</strong> Your memory graph is encrypted before it ever reaches our servers. We cannot read your data.</span></li>
              <li style={{ display: 'flex', gap: '12px' }}><ShieldCheck color="var(--color-neon-cyan)"/> <span><strong>Granular LLM Scoping:</strong> You choose exactly which slice of memory goes to ChatGPT vs. Claude vs. Local models.</span></li>
              <li style={{ display: 'flex', gap: '12px' }}><ShieldCheck color="var(--color-neon-cyan)"/> <span><strong>Local-First Support:</strong> Use Ollama or LM Studio? Your data never has to touch the cloud.</span></li>
            </ul>
          </div>
        )}

        {step === 4 && (
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px', lineHeight: '1.6', fontSize: '16px' }}>
            Picture opening Cursor on a Monday. The assistant already knows the architecture decision you made with Claude last Thursday, your taste in error handling, and the bug open in Linear. You prompt Gemini and the copy lands in your voice on the first pass. Your editor in Claude already has the last three chapters wired in before you type a word.
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '32px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ 
              width: '8px', height: '8px', borderRadius: '50%', 
              background: i === step ? 'var(--color-neon-cyan)' : 'var(--color-border)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        <button className="glow-btn" onClick={handleNext} style={{ width: '100%' }}>
          {step === 4 ? "Enter Dashboard" : step === 2 ? "Sync Selected Data" : "Next"}
        </button>
      </div>
    </div>
  );
}
