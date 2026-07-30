import React, { useState, useEffect } from 'react';
import { CheckCircle, RefreshCw, Trash2, Clock, Database, MessageSquare, Briefcase, Mail, FileText, Calendar } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const SOURCES = [
  { id: 'notion', name: 'Notion', description: 'Pages, databases and wikis', icon: <Database size={22} />, color: '#ffffff', bg: '#1a1a1a', badge: 'Popular' },
  { id: 'github', name: 'GitHub', description: 'Repos, PRs, issues and commits', icon: <Briefcase size={22} />, color: '#ffffff', bg: '#24292e' },
  { id: 'slack', name: 'Slack', description: 'Messages, channels and threads', icon: <MessageSquare size={22} />, color: '#fff', bg: '#4a154b' },
  { id: 'gmail', name: 'Gmail', description: 'Emails, threads and contacts', icon: <Mail size={22} />, color: '#fff', bg: '#c5221f' },
  { id: 'linear', name: 'Linear', description: 'Issues, projects and roadmaps', icon: <Calendar size={22} />, color: '#fff', bg: '#5e6ad2', badge: 'New' },
  { id: 'apple_notes', name: 'Apple Notes', description: 'Notes and checklists', icon: <FileText size={22} />, color: '#fff', bg: '#f5a623' },
  { id: 'google_drive', name: 'Google Drive', description: 'Docs, Sheets and Slides', icon: <FileText size={22} />, color: '#fff', bg: '#1a73e8', badge: 'Soon' },
  { id: 'obsidian', name: 'Obsidian', description: 'Markdown vault and graph', icon: <Database size={22} />, color: '#fff', bg: '#7c3aed', badge: 'Soon' },
];

function timeAgo(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DataSources() {
  const { user, isDemo } = useAuth();
  const [connected, setConnected] = useState({});
  const [syncing, setSyncing] = useState({});

  useEffect(() => {
    if (!isSupabaseConfigured || isDemo) {
      const demo = JSON.parse(localStorage.getItem('axon_sources_demo') || '{}');
      setConnected(demo);
      return;
    }

    supabase.from('data_sources').select('source_id, status, last_synced, node_count').eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setConnected(Object.fromEntries(data.map(d => [d.source_id, d])));
      });
  }, [user, isDemo]);

  const handleConnect = async (source) => {
    if (source.badge === 'Soon') return;

    const newEntry = { status: 'connected', last_synced: new Date().toISOString(), node_count: Math.floor(Math.random() * 200) + 20 };

    if (!isSupabaseConfigured || isDemo) {
      const demo = JSON.parse(localStorage.getItem('axon_sources_demo') || '{}');
      demo[source.id] = newEntry;
      localStorage.setItem('axon_sources_demo', JSON.stringify(demo));
      setConnected(prev => ({ ...prev, [source.id]: newEntry }));
      return;
    }

    await supabase.from('data_sources').upsert({
      user_id: user.id,
      source_id: source.id,
      name: source.name,
      ...newEntry,
    }, { onConflict: 'user_id,source_id' });
    setConnected(prev => ({ ...prev, [source.id]: newEntry }));
  };

  const handleSync = async (sourceId) => {
    setSyncing(prev => ({ ...prev, [sourceId]: true }));
    await new Promise(r => setTimeout(r, 1800)); // Simulate sync
    const updated = { ...connected[sourceId], last_synced: new Date().toISOString(), node_count: (connected[sourceId]?.node_count || 0) + Math.floor(Math.random() * 10) };

    if (!isSupabaseConfigured || isDemo) {
      const demo = JSON.parse(localStorage.getItem('axon_sources_demo') || '{}');
      demo[sourceId] = updated;
      localStorage.setItem('axon_sources_demo', JSON.stringify(demo));
    } else {
      await supabase.from('data_sources').update({ last_synced: updated.last_synced, node_count: updated.node_count }).eq('user_id', user.id).eq('source_id', sourceId);
    }

    setConnected(prev => ({ ...prev, [sourceId]: updated }));
    setSyncing(prev => ({ ...prev, [sourceId]: false }));
  };

  const handleDisconnect = async (sourceId) => {
    if (!isSupabaseConfigured || isDemo) {
      const demo = JSON.parse(localStorage.getItem('axon_sources_demo') || '{}');
      delete demo[sourceId];
      localStorage.setItem('axon_sources_demo', JSON.stringify(demo));
    } else {
      await supabase.from('data_sources').delete().eq('user_id', user.id).eq('source_id', sourceId);
    }
    setConnected(prev => { const n = { ...prev }; delete n[sourceId]; return n; });
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Data Sources</h1>
        <p className="page-subtitle">Connect your apps so AXON can ingest and structure your knowledge.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {SOURCES.map(source => {
          const conn = connected[source.id];
          const isConnected = !!conn;
          const isSoon = source.badge === 'Soon';
          const isSyncing = syncing[source.id];

          return (
            <div key={source.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', opacity: isSoon ? 0.65 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: source.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: source.color }}>
                  {source.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>{source.name}</span>
                    {source.badge && (
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: source.badge === 'Soon' ? 'rgba(255,255,255,0.08)' : 'rgba(0,243,255,0.15)', color: source.badge === 'Soon' ? 'var(--color-text-secondary)' : 'var(--color-neon-cyan)', fontWeight: 700 }}>
                        {source.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{source.description}</div>
                </div>
                {isConnected && <CheckCircle size={16} color="#25c2a0" />}
              </div>

              {isConnected && (
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--color-text-secondary)', padding: '8px 0', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {timeAgo(conn.last_synced)}
                  </div>
                  {conn.node_count > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Database size={12} />
                      {conn.node_count} nodes
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                {!isConnected ? (
                  <button
                    onClick={() => handleConnect(source)}
                    disabled={isSoon}
                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(0,243,255,0.2)', background: 'rgba(0,243,255,0.07)', color: isSoon ? 'var(--color-text-secondary)' : 'var(--color-neon-cyan)', cursor: isSoon ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '13px' }}
                  >
                    {isSoon ? 'Coming Soon' : 'Connect'}
                  </button>
                ) : (
                  <>
                    <button onClick={() => handleSync(source.id)} disabled={isSyncing}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                      <RefreshCw size={13} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
                      {isSyncing ? 'Syncing...' : 'Sync now'}
                    </button>
                    <button onClick={() => handleDisconnect(source.id)}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,80,80,0.2)', background: 'rgba(255,80,80,0.07)', color: '#ff6b6b', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
