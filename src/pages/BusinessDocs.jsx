import React, { useState } from 'react';

const docs = {
  'Vision': `AXON’s vision is to become the universal, permanent AI brain for every individual and organization—a single, secure layer of structured memory that perfectly contextualizes every AI interaction, forever eliminating the friction of starting from scratch.`,
  'Mission': `To provide every AI (ChatGPT, Claude, Gemini, Copilot, etc.) with instant access to perfectly structured, token-efficient user memory, dramatically improving AI responses and empowering users to visually manage their digital mind.`,
  'Roadmap': `Year 1: Core engine, iOS + Web dashboards, top 5 integrations.\nYear 2: Open Developer API, decentralized memory options.\nYear 3: OS-level integrations, edge-computed memory compression.`,
  'API Docs': `GET /v1/context?query=x&limit=1000_tokens\nPOST /v1/memory\nGET /v1/graph/relationships\nSDKs available in Node.js, Python, Go, and Rust.`,
  'Go-to-Market': `1. Developer Adoption via API free tiers.\n2. Prosumer Viral Loop (Notion/Obsidian users).\n3. 'Powered by AXON' badge driving viral loops.`
};

export default function BusinessDocs() {
  const [activeTab, setActiveTab] = useState('Vision');

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">AXON Business Intelligence</h1>
        <p className="page-subtitle">Embedded strategy and documentation for investors and developers.</p>
      </header>

      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px' }}>
          {Object.keys(docs).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? 'rgba(0, 243, 255, 0.1)' : 'transparent',
                color: activeTab === tab ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
                border: 'none',
                padding: '12px 16px',
                textAlign: 'left',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        
        <div className="glass-card" style={{ flex: 1 }}>
          <h2 style={{ marginBottom: '16px', fontSize: '24px' }}>{activeTab}</h2>
          <div style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-line', lineHeight: '1.6' }}>
            {docs[activeTab]}
          </div>
        </div>
      </div>
    </div>
  );
}
