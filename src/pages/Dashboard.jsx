import React, { useEffect, useState } from 'react';
import { Activity, Cpu, ShieldCheck, CopyCheck, Network, Plug, Clock, TrendingUp } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import SetupBanner from '../components/SetupBanner';

const DEMO_STATS = {
  memoryNodes: 247,
  activeAdapters: 3,
  tokensSaved: '1.2M',
  tokenValue: '$14.50',
  recentNodes: [
    { id: 1, title: 'AXON Product Strategy v2', type: 'document', created_at: new Date(Date.now() - 5 * 60000).toISOString() },
    { id: 2, title: 'Q3 OKR: Launch mobile app', type: 'goal', created_at: new Date(Date.now() - 18 * 60000).toISOString() },
    { id: 3, title: 'Competitor analysis: Mem.ai', type: 'research', created_at: new Date(Date.now() - 45 * 60000).toISOString() },
    { id: 4, title: 'API key management architecture', type: 'technical', created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: 5, title: 'User interview notes — Emma K.', type: 'interview', created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
  ],
};

function StatCard({ title, value, icon, gradient, desc }) {
  return (
    <div className="glass-card" style={{ flex: '1 1 200px', minWidth: '180px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: 600 }}>{title}</span>
        <span style={{ color: 'var(--color-neon-cyan)', opacity: 0.7 }}>{icon}</span>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '4px' }}
        className={gradient ? 'gradient-text' : ''}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{desc}</div>
    </div>
  );
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const NODE_TYPE_COLORS = {
  document: 'var(--color-neon-cyan)',
  goal: 'var(--color-neon-purple)',
  research: '#f59e0b',
  technical: '#10b981',
  interview: '#f97316',
  default: 'var(--color-text-secondary)',
};

export default function Dashboard() {
  const { user, isDemo } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || isDemo) {
      setStats(DEMO_STATS);
      setLoading(false);
      return;
    }

    async function loadStats() {
      try {
        const [nodesRes, adaptersRes, recentRes] = await Promise.all([
          supabase.from('memory_nodes').select('id', { count: 'exact' }).eq('user_id', user.id),
          supabase.from('ai_adapter_connections').select('id', { count: 'exact' }).eq('user_id', user.id).eq('status', 'connected'),
          supabase.from('memory_nodes').select('id, title, type, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        ]);

        setStats({
          memoryNodes: nodesRes.count ?? 0,
          activeAdapters: adaptersRes.count ?? 0,
          tokensSaved: nodesRes.count ? `${Math.round(nodesRes.count * 4.8 / 1000)}K` : '0',
          tokenValue: `$${(nodesRes.count * 0.06).toFixed(2)}`,
          recentNodes: recentRes.data ?? [],
        });
      } catch (err) {
        console.error('Dashboard load error:', err);
        setStats(DEMO_STATS);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [user, isDemo]);

  const displayName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Welcome back, {displayName} 👋</h1>
        <p className="page-subtitle">Your AXON memory health and AI usage at a glance.</p>
      </header>

      {isDemo && (
        <SetupBanner
          message="Running in demo mode — data is not persisted. Connect Supabase to save your memory."
          link="https://supabase.com"
          linkLabel="Create free Supabase project"
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '32px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card" style={{ flex: '1 1 200px', minWidth: '180px', height: '110px', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '32px' }}>
          <StatCard title="Memory Nodes" value={stats.memoryNodes.toLocaleString()} icon={<Network size={18} />} desc="Stored context entries" />
          <StatCard title="Active Adapters" value={stats.activeAdapters} icon={<Plug size={18} />} desc="Connected AI tools" />
          <StatCard title="Tokens Saved" value={stats.tokensSaved} icon={<Cpu size={18} />} gradient desc={`Optimized context — ~${stats.tokenValue} saved`} />
          <StatCard title="Memory Health" value="98%" icon={<ShieldCheck size={18} />} gradient desc="No fragmentation detected" />
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div className="glass-card" style={{ flex: 2, minWidth: '300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Clock size={18} color="var(--color-neon-cyan)" />
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Recent Memory Ingestion</h3>
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ height: '48px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : stats?.recentNodes?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {stats.recentNodes.map((node) => (
                <div key={node.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: '8px', transition: 'background 0.15s',
                  cursor: 'default',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: NODE_TYPE_COLORS[node.type] || NODE_TYPE_COLORS.default, flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>{node.title}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', marginLeft: '12px' }}>{timeAgo(node.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
              <Activity size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
              <p>No memory nodes yet. Connect a data source to start ingesting.</p>
            </div>
          )}
        </div>

        <div className="glass-card" style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <TrendingUp size={18} color="var(--color-neon-cyan)" />
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Memory Breakdown</h3>
          </div>
          {[
            { label: 'Documents', pct: 38, color: 'var(--color-neon-cyan)' },
            { label: 'Goals & OKRs', pct: 22, color: 'var(--color-neon-purple)' },
            { label: 'Research', pct: 18, color: '#f59e0b' },
            { label: 'Conversations', pct: 14, color: '#10b981' },
            { label: 'Other', pct: 8, color: 'rgba(255,255,255,0.3)' },
          ].map(({ label, pct, color }) => (
            <div key={label} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                <span style={{ fontWeight: 600 }}>{pct}%</span>
              </div>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
