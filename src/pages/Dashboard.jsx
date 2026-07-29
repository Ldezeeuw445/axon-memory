import React from 'react';
import { Activity, ShieldCheck, Cpu, ArrowUpRight, CopyCheck } from 'lucide-react';

function StatCard({ title, value, icon, gradient, desc }) {
  return (
    <div className="glass-card" style={{ flex: '1', minWidth: '250px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '8px' }}>{title}</p>
          <h3 style={{ fontSize: '32px', fontWeight: '700' }}>{value}</h3>
        </div>
        <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)' }}>
          {React.cloneElement(icon, { color: gradient ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)' })}
        </div>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{desc}</p>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Digital Brain Overview</h1>
        <p className="page-subtitle">Your AXON memory health and AI usage stats.</p>
      </header>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '32px' }}>
        <StatCard 
          title="Memory Health" 
          value="98%" 
          icon={<Activity />} 
          gradient 
          desc="+2% from last week. No fragmentation."
        />
        <StatCard 
          title="Token Savings" 
          value="1.2M" 
          icon={<Cpu />} 
          gradient 
          desc="Optimized context saved $14.50 this month."
        />
        <StatCard 
          title="Context Quality" 
          value="A+" 
          icon={<ShieldCheck />} 
          desc="Semantic density is optimal."
        />
        <StatCard 
          title="Duplicate Detector" 
          value="0 Issues" 
          icon={<CopyCheck />} 
          desc="Auto-deduplication running smoothly."
        />
      </div>

      <div className="glass-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Recent Memory Ingestion</h3>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }}>
           {/* Placeholder for timeline/graph preview */}
           <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
             [ Live Feed Visualization ]
             <br />
             <small style={{ marginTop: '8px', display: 'block' }}>Importing from: Notion, Slack, GitHub</small>
           </div>
        </div>
      </div>
    </div>
  );
}
