import React, { useState } from 'react';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';

export default function SetupBanner({ message, link, linkLabel }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between',
      background: 'rgba(255, 200, 50, 0.08)', border: '1px solid rgba(255, 200, 50, 0.25)',
      borderRadius: '12px', padding: '12px 16px', marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
        <AlertTriangle size={16} color="#ffc832" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          {message}
        </span>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-neon-cyan)', fontSize: '14px', whiteSpace: 'nowrap' }}
          >
            {linkLabel || 'Learn more'} <ExternalLink size={12} />
          </a>
        )}
      </div>
      <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '2px' }}>
        <X size={14} />
      </button>
    </div>
  );
}
