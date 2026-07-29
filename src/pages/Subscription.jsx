import React from 'react';
import { Check } from 'lucide-react';

function PlanCard({ title, price, features, recommended, subtitle }) {
  return (
    <div className="glass-card" style={{ 
      flex: 1, 
      border: recommended ? '1px solid var(--color-neon-cyan)' : '1px solid var(--color-border)',
      position: 'relative',
      padding: '32px'
    }}>
      {recommended && (
        <div style={{
          position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--color-accent-gradient)', padding: '4px 12px', borderRadius: '12px',
          fontSize: '12px', fontWeight: 'bold'
        }}>THE UNIVERSAL BRAIN</div>
      )}
      <h3 style={{ fontSize: '24px', marginBottom: '4px' }}>{title}</h3>
      {subtitle && <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>{subtitle}</p>}
      <div style={{ marginBottom: '24px' }}>
        <span style={{ fontSize: '48px', fontWeight: '800' }}>{price}</span>
        {price !== 'Custom' && <span style={{ color: 'var(--color-text-secondary)' }}>/month</span>}
      </div>
      <ul style={{ listStyle: 'none', marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <Check size={16} color="var(--color-neon-cyan)" />
            {f}
          </li>
        ))}
      </ul>
      <button className="glow-btn" style={{ width: '100%', background: recommended ? 'var(--color-accent-gradient)' : 'rgba(255,255,255,0.1)' }}>
        {recommended ? 'Start Building Your Brain' : 'Contact Sales'}
      </button>
    </div>
  );
}

export default function Subscription() {
  return (
    <div className="page-container">
      <header className="page-header" style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto 48px auto' }}>
        <h1 className="page-title">One Subscription for Everything</h1>
        <p className="page-subtitle" style={{ fontSize: '18px', lineHeight: '1.6' }}>
          Stop paying for fragmented AI context. AXON is a five-dollar-a-month memory layer that gives you one permanent, structured portrait of who you are, everywhere.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '900px', margin: '0 auto' }}>
        <PlanCard 
          title="AXON Standard" price="$5" recommended
          subtitle="Everything you need for a permanent AI brain."
          features={[
            "Unlimited structured memories",
            "Auto-imports from Notion, Obsidian, Drive, Gmail, Slack, and Linear",
            "Adapters for ChatGPT, Claude, Gemini, Cursor, and Perplexity",
            "Local model support via Ollama",
            "Visual memory and relationship graph",
            "Real-time background sync"
          ]}
        />
        <PlanCard 
          title="Enterprise" price="Custom"
          subtitle="For teams and organizations."
          features={[
            "Team-wide knowledge graph",
            "Zero-knowledge encryption architecture",
            "Self-hosted deployment options",
            "Custom data source integrations",
            "Dedicated onboarding support",
            "SOC2 compliance tools"
          ]}
        />
      </div>
    </div>
  );
}
