import React from 'react';
import { Database, Calendar, Mail, FileText, Smartphone, HardDrive, MessageSquare, Briefcase } from 'lucide-react';

export default function DataSources() {
  const sources = [
    { name: 'Apple Notes', status: 'Syncing...', icon: <FileText size={24}/>, color: '#f5a623' },
    { name: 'Google Keep', status: 'Connected', icon: <FileText size={24}/>, color: '#fbbc04' },
    { name: 'Google Calendar', status: 'Connected', icon: <Calendar size={24}/>, color: '#4285f4' },
    { name: 'Gmail', status: 'Connected', icon: <Mail size={24}/>, color: '#ea4335' },
    { name: 'Linear', status: 'Disconnected', icon: <Database size={24}/>, color: '#5e6ad2' },
    { name: 'Notion', status: 'Connected', icon: <Database size={24}/>, color: '#ffffff' },
    { name: 'Obsidian', status: 'Disconnected', icon: <HardDrive size={24}/>, color: '#7c3aed' },
    { name: 'Slack', status: 'Disconnected', icon: <MessageSquare size={24}/>, color: '#e01e5a' },
    { name: 'GitHub', status: 'Connected', icon: <Briefcase size={24}/>, color: '#ffffff' },
    { name: 'Local Files', status: 'Disconnected', icon: <HardDrive size={24}/>, color: '#00f3ff' },
    { name: 'iOS Health', status: 'Disconnected', icon: <Smartphone size={24}/>, color: '#ff2d55' },
  ];

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Data Sources</h1>
        <p className="page-subtitle">Connect the apps you use every day to build your autonomous memory.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
        {sources.map((source, i) => (
          <div key={i} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.3s ease' }}>
            <div style={{ 
              width: '48px', height: '48px', borderRadius: '12px', 
              background: `rgba(${source.color === '#ffffff' || source.color === '#fff' ? '255,255,255' : source.color.match(/\w\w/g).map(c=>parseInt(c,16)).join(',')}, 0.1)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: source.color,
              boxShadow: source.status === 'Connected' || source.status === 'Syncing...' ? `0 0 10px ${source.color}40` : 'none'
            }}>
              {source.icon}
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600' }}>{source.name}</h3>
              <p style={{ 
                fontSize: '14px', 
                color: source.status === 'Disconnected' ? 'var(--color-text-secondary)' : 'var(--color-neon-cyan)',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                {(source.status === 'Connected' || source.status === 'Syncing...') && (
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-neon-cyan)', display: 'inline-block' }} />
                )}
                {source.status}
              </p>
            </div>
            <button className="glow-btn" style={{
              background: source.status === 'Disconnected' ? 'transparent' : 'rgba(255,255,255,0.05)',
              border: source.status === 'Disconnected' ? '1px solid var(--color-border)' : '1px solid transparent',
              color: 'var(--color-text-primary)',
              padding: '6px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              {source.status === 'Disconnected' ? 'Connect' : 'Manage'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
