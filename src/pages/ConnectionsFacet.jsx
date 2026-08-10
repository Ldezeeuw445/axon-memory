import React, { useState } from 'react';
import DataSources from './DataSources';
import AIAdapters from './AIAdapters';
import { Database, Plug } from 'lucide-react';

export default function ConnectionsFacet() {
  const [activeTab, setActiveTab] = useState('sources');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('sources')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            border: 'none', cursor: 'pointer',
            padding: '8px 16px', borderRadius: '8px',
            color: activeTab === 'sources' ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
            background: activeTab === 'sources' ? 'rgba(0,243,255,0.1)' : 'transparent',
            fontWeight: activeTab === 'sources' ? 700 : 500,
            transition: 'all 0.2s'
          }}
        >
          <Database size={16} /> Data Sources
        </button>
        <button
          onClick={() => setActiveTab('adapters')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            border: 'none', cursor: 'pointer',
            padding: '8px 16px', borderRadius: '8px',
            color: activeTab === 'adapters' ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
            background: activeTab === 'adapters' ? 'rgba(0,243,255,0.1)' : 'transparent',
            fontWeight: activeTab === 'adapters' ? 700 : 500,
            transition: 'all 0.2s'
          }}
        >
          <Plug size={16} /> AI Adapters
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'sources' ? (
          <DataSources asFacet={true} />
        ) : (
          <AIAdapters asFacet={true} />
        )}
      </div>
    </div>
  );
}
