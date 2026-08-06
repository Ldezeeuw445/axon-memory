import React, { useEffect, useState } from 'react';
import { Activity, Database, Cpu, Plug } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

function StatCard({ title, value, icon, desc }) {
  return (
    <div className="glass-card" style={{ flex: 1, minWidth: 230 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 8 }}>{title}</p>
          <h3 style={{ fontSize: 32, fontWeight: 700 }}>{value}</h3>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.05)' }}>
          {React.cloneElement(icon, { color: 'var(--color-neon-cyan)' })}
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{desc}</p>
    </div>
  );
}

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ items: 0, sources: 0, tokensSaved: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [itemsCount, sourcesCount, tokenSum, recentItems] = await Promise.all([
        supabase.from('memory_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('source_connections').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['connected', 'syncing']),
        supabase.from('context_pack_logs').select('approx_tokens_saved').eq('user_id', user.id),
        supabase.from('memory_items').select('id, title, content_type, source_type, occurred_at').eq('user_id', user.id).order('occurred_at', { ascending: false }).limit(6),
      ]);

      setStats({
        items: itemsCount.count ?? 0,
        sources: sourcesCount.count ?? 0,
        tokensSaved: (tokenSum.data ?? []).reduce((sum, r) => sum + (r.approx_tokens_saved || 0), 0),
      });
      setRecent(recentItems.data ?? []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Digital Brain Overview</h1>
        <p className="page-subtitle">
          {profile?.full_name ? `Welcome back, ${profile.full_name.split(' ')[0]}.` : 'Your Axon memory health and usage stats.'}
        </p>
      </header>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard title="Memory Items" value={stats.items} icon={<Activity />} desc="Structured memories ingested across all sources." />
        <StatCard title="Connected Sources" value={stats.sources} icon={<Plug />} desc="Live data sources feeding your memory graph." />
        <StatCard title="Context Tokens Served" value={stats.tokensSaved.toLocaleString()} icon={<Cpu />} desc="Tokens delivered via context packs — what you'd otherwise re-paste." />
        <StatCard title="Plan" value={(profile?.plan_tier ?? 'starter').replace('_', ' ').toUpperCase()} icon={<Database />} desc="Current Axon Memory plan." />
      </div>

      <div className="glass-card" style={{ minHeight: 320 }}>
        <h3 style={{ marginBottom: 16, fontSize: 18 }}>Recent Memory Ingestion</h3>
        {loading ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>
        ) : recent.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
            Nothing ingested yet. Head to Data Sources and connect Gmail, GitHub, Notion, or Slack to get started.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recent.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || '(untitled)'}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{item.source_type} · {item.content_type}</p>
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', marginLeft: 12 }}>{timeAgo(item.occurred_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
