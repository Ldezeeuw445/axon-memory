import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const RING_COLORS = ['var(--color-neon-cyan)', 'var(--color-neon-purple)'];

export default function MemoryGraph() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('memory_items')
      .select('id, title, content, content_type, entities, source_type, occurred_at')
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setItems(data ?? []);
        setLoading(false);
      });
  }, [user]);

  const entityNodes = useMemo(() => {
    const counts = new Map();
    for (const item of items) {
      for (const e of item.entities ?? []) {
        if (typeof e !== 'string') continue;
        counts.set(e, (counts.get(e) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count], i) => {
        const angle = (i / Math.max(counts.size, 1)) * 2 * Math.PI;
        const radius = 38;
        return {
          name,
          count,
          x: 50 + radius * Math.cos(angle),
          y: 50 + radius * Math.sin(angle),
          color: RING_COLORS[i % 2],
        };
      });
  }, [items]);

  const relatedItems = selected ? items.filter((it) => (it.entities ?? []).includes(selected)) : [];

  return (
    <div className="page-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <h1 className="page-title">Memory Graph</h1>
        <p className="page-subtitle">
          {loading ? 'Loading your memory graph…' : items.length === 0
            ? 'No memories yet — connect a data source to start building this graph.'
            : `${entityNodes.length} entities extracted from ${items.length} recent memory items.`}
        </p>
      </header>

      <div className="glass-card" style={{ flex: 1, minHeight: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: '100%', height: '100%' }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            {entityNodes.map((n, i) => (
              <line key={`l-${i}`} x1="50" y1="50" x2={n.x} y2={n.y} stroke={n.color} strokeWidth="0.3" opacity="0.5" />
            ))}
            <circle cx="50" cy="50" r="3.5" fill="#fff" style={{ filter: 'drop-shadow(0 0 6px var(--color-neon-cyan))' }} />
            {entityNodes.map((n, i) => (
              <circle
                key={`n-${i}`}
                cx={n.x} cy={n.y}
                r={Math.min(1.2 + n.count * 0.5, 4)}
                fill={n.color}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelected(n.name === selected ? null : n.name)}
              />
            ))}
          </svg>
          {entityNodes.map((n, i) => (
            <span
              key={`label-${i}`}
              onClick={() => setSelected(n.name === selected ? null : n.name)}
              style={{
                position: 'absolute', left: `${n.x}%`, top: `${n.y}%`, transform: 'translate(-50%, 6px)',
                fontSize: 11, color: n.name === selected ? '#fff' : 'var(--color-text-secondary)',
                cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: n.name === selected ? 700 : 400,
              }}
            >
              {n.name}
            </span>
          ))}
        </div>

        {!loading && entityNodes.length === 0 && (
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', background: 'var(--color-bg-card)', padding: '24px', borderRadius: '16px', backdropFilter: 'blur(8px)' }}>
            <h3 style={{ marginBottom: '8px' }}>No entities yet</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', maxWidth: '300px' }}>
              Connect a data source and sync it to start seeing people, projects, and topics AXON has extracted.
            </p>
          </div>
        )}
      </div>

      {selected && (
        <div className="glass-card" style={{ marginTop: 24, padding: 20 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>Memories referencing "{selected}"</h3>
          {relatedItems.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No items found.</p>
          ) : (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {relatedItems.slice(0, 8).map((it) => (
                <li key={it.id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{it.title || it.content_type}</p>
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{it.content?.slice(0, 140)}{it.content?.length > 140 ? '…' : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
