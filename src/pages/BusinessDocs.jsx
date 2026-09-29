import React, { useState, useRef } from 'react';

const docs = {
  'Vision': `AXON's vision is to become the universal, permanent AI brain for every individual and organization—a single, secure layer of structured memory that perfectly contextualizes every AI interaction, forever eliminating the friction of starting from scratch.`,
  'Mission': `To provide every AI (ChatGPT, Claude, Gemini, Copilot, etc.) with instant access to perfectly structured, token-efficient user memory, dramatically improving AI responses and empowering users to visually manage their digital mind.`,
  'Roadmap': `Year 1: Core engine, iOS + Web dashboards, top 5 integrations.\nYear 2: Open Developer API, decentralized memory options.\nYear 3: OS-level integrations, edge-computed memory compression.`,
  'API Docs': `GET /v1/context?query=x&limit=1000_tokens\nPOST /v1/memory\nGET /v1/graph/relationships\nSDKs available in Node.js, Python, Go, and Rust.`,
  'Go-to-Market': `1. Developer Adoption via API free tiers.\n2. Prosumer Viral Loop (Notion/Obsidian users).\n3. 'Powered by AXON' badge driving viral loops.`,
};

export default function BusinessDocs() {
  const [activeTab, setActiveTab] = useState('Vision');
  const tabsRef = useRef(null);

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Business Intelligence</h1>
        <p className="page-subtitle">Strategy and documentation for investors and developers.</p>
      </header>

      {/* Scrollable tab strip — great on mobile */}
      <div
        ref={tabsRef}
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          marginBottom: 16,
          paddingBottom: 2,
        }}
      >
        <style>{`.tab-strip::-webkit-scrollbar { display: none; }`}</style>
        {Object.keys(docs).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? 'rgba(0,243,255,0.12)' : 'rgba(255,255,255,0.04)',
              color: activeTab === tab ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
              border: activeTab === tab ? '1px solid rgba(0,243,255,0.3)' : '1px solid var(--color-border)',
              padding: '9px 18px',
              borderRadius: 10,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              flexShrink: 0,
              minHeight: 40,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="glass-card">
        <h2 style={{ marginBottom: 14, fontSize: 20, fontWeight: 800 }}>{activeTab}</h2>
        <div style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-line', lineHeight: 1.8, fontSize: 15 }}>
          {docs[activeTab]}
        </div>
      </div>
    </div>
  );
}
