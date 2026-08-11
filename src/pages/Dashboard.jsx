import React, { useEffect, useState } from 'react';
import { Activity, Cpu, ShieldCheck, CopyCheck, Network, Plug, Clock, TrendingUp } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import SetupBanner from '../components/SetupBanner';

// Shown before data arrives, when Supabase isn't configured, or when a load
// fails. Deliberately empty rather than invented: a real zero tells the truth,
// a plausible-looking 247 does not, and a memory product that displays numbers
// it made up has no business asking anyone to trust what it remembers.
const EMPTY_STATS = {
  memoryNodes: 0,
  activeAdapters: 0,
  tokensSaved: '0',
  tokenValue: '$0.00',
  contextServed: 0,
  recentNodes: [],
  breakdown: [],
};

// content_type values come from the check constraint on memory_items.
const CONTENT_TYPE_LABELS = {
  email: 'Email',
  commit: 'Commits',
  pull_request: 'Pull requests',
  issue: 'Issues',
  page: 'Pages',
  message: 'Messages',
  note: 'Notes',
};

const BREAKDOWN_COLORS = [
  'var(--color-neon-cyan)',
  'var(--color-neon-purple)',
  '#f59e0b',
  '#10b981',
  '#f97316',
  'rgba(255,255,255,0.45)',
  'rgba(255,255,255,0.3)',
];

function StatCard({ title, value, icon, gradient, desc }) {
  return (
    <div className="glass-card" style={{ flex: '1 1 160px', minWidth: '0' }}>
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

export default function Dashboard({ asFacet }) {
  const { user, isDemo } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || isDemo) {
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }

    async function loadStats() {
      try {
        const [itemsRes, sourcesRes, adaptersRes, tokenRes, recentRes, breakdownRes] = await Promise.all([
          supabase.from('memory_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('source_connections').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['connected', 'syncing']),
          supabase.from('api_keys').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('revoked_at', null),
          supabase.from('context_pack_logs').select('approx_tokens_saved').eq('user_id', user.id),
          supabase.from('memory_items').select('id, title, content_type, source_type, occurred_at').eq('user_id', user.id).order('occurred_at', { ascending: false }).limit(5),
          supabase.rpc('memory_breakdown', { p_user_id: user.id }),
        ]);

        const itemsCount = itemsRes.count ?? 0;
        const tokensSaved = (tokenRes.data || []).reduce((sum, r) => sum + (r.approx_tokens_saved || 0), 0);

        const rows = breakdownRes.data ?? [];
        const totalCounted = rows.reduce((sum, r) => sum + Number(r.item_count || 0), 0);
        const breakdown = rows.map((r, i) => ({
          label: CONTENT_TYPE_LABELS[r.content_type] ?? r.content_type,
          count: Number(r.item_count || 0),
          pct: totalCounted ? Math.round((Number(r.item_count) / totalCounted) * 100) : 0,
          color: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
        }));

        setStats({
          memoryNodes: itemsCount,
          contextServed: (tokenRes.data || []).length,
          breakdown,
          activeAdapters: (sourcesRes.count ?? 0) + (adaptersRes.count ?? 0),
          tokensSaved: tokensSaved ? `${Math.round(tokensSaved / 1000)}K` : '0',
          tokenValue: `$${(tokensSaved * 0.00001).toFixed(2)}`,
          recentNodes: (recentRes.data ?? []).map((it) => ({
            id: it.id,
            title: it.title,
            type: it.content_type || it.source_type || 'default',
            created_at: it.occurred_at,
          })),
        });
      } catch (err) {
        console.error('Dashboard load error:', err);
        setStats(EMPTY_STATS);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [user, isDemo]);

  const displayName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <div className={asFacet ? "" : "page-container"}>
      {!asFacet && (
        <header className="page-header">
          <h1 className="page-title">Welcome back, {displayName} 👋</h1>
          <p className="page-subtitle">Your AXON memory health and AI usage at a glance.</p>
        </header>
      )}

      {isDemo && (
        <SetupBanner
          message="Running in demo mode — data is not persisted. Connect Supabase to save your memory."
          link="https://supabase.com"
          linkLabel="Create free Supabase project"
        />
      )}

      {loading ? (
        <div className="stat-grid" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card" style={{ flex: '1 1 160px', minWidth: '140px', height: '100px', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : (
        <div className="stat-grid" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <StatCard title="Memory Nodes" value={stats.memoryNodes.toLocaleString()} icon={<Network size={18} />} desc="Stored context entries" />
          <StatCard title="Active Adapters" value={stats.activeAdapters} icon={<Plug size={18} />} desc="Connected AI tools" />
          <StatCard title="Tokens Saved" value={stats.tokensSaved} icon={<Cpu size={18} />} gradient desc={`Optimized context — ~${stats.tokenValue} saved`} />
          <StatCard title="Context Served" value={stats.contextServed.toLocaleString()} icon={<ShieldCheck size={18} />} gradient desc="Context packs delivered to your AI tools" />
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
          {stats.breakdown.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Nothing stored yet. Once memories arrive, this shows what kinds they are.
            </p>
          ) : (
            stats.breakdown.map(({ label, pct, count, color }) => (
              <div key={label} style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                  <span style={{ fontWeight: 600 }} title={`${count} ${count === 1 ? 'memory' : 'memories'}`}>{pct}%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))
          )}
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
