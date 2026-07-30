import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Search, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const DEMO_NODES = [
  { id: '1', title: 'AXON Product Strategy', type: 'document', x: 0, y: 0, vx: 0, vy: 0 },
  { id: '2', title: 'Q3 Launch Goals', type: 'goal', x: 0, y: 0, vx: 0, vy: 0 },
  { id: '3', title: 'Competitor: Mem.ai', type: 'research', x: 0, y: 0, vx: 0, vy: 0 },
  { id: '4', title: 'API Architecture', type: 'technical', x: 0, y: 0, vx: 0, vy: 0 },
  { id: '5', title: 'User Interview — Emma', type: 'interview', x: 0, y: 0, vx: 0, vy: 0 },
  { id: '6', title: 'Stripe Integration', type: 'technical', x: 0, y: 0, vx: 0, vy: 0 },
  { id: '7', title: 'Mobile App Plans', type: 'goal', x: 0, y: 0, vx: 0, vy: 0 },
  { id: '8', title: 'Pricing Research', type: 'research', x: 0, y: 0, vx: 0, vy: 0 },
  { id: '9', title: 'Investor Deck v3', type: 'document', x: 0, y: 0, vx: 0, vy: 0 },
];

const DEMO_EDGES = [
  { id: 'e1', source: '1', target: '2' },
  { id: 'e2', source: '1', target: '3' },
  { id: 'e3', source: '1', target: '4' },
  { id: 'e4', source: '2', target: '7' },
  { id: 'e5', source: '4', target: '6' },
  { id: 'e6', source: '3', target: '8' },
  { id: 'e7', source: '5', target: '1' },
  { id: 'e8', source: '8', target: '9' },
  { id: 'e9', source: '9', target: '1' },
];

const TYPE_COLORS = {
  document: '#00f3ff',
  goal: '#bf6fff',
  research: '#f59e0b',
  technical: '#10b981',
  interview: '#f97316',
  default: '#94a3b8',
};

const W = 800, H = 520;
const REPULSION = 4000, SPRING_K = 0.05, SPRING_LEN = 140, DAMPING = 0.82;

function initPositions(nodes) {
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.32;
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0 };
  });
}

export default function MemoryGraph() {
  const { user, isDemo } = useAuth();
  const [nodes, setNodes] = useState(() => initPositions(DEMO_NODES));
  const [edges, setEdges] = useState(DEMO_EDGES);
  const [selectedNode, setSelectedNode] = useState(null);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(null);
  const rafRef = useRef(null);
  const nodesRef = useRef(nodes);
  const svgRef = useRef(null);

  // Sync ref
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // Load from Supabase
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || isDemo) return;
    async function load() {
      const [nodesRes, edgesRes] = await Promise.all([
        supabase.from('memory_nodes').select('id, title, type').eq('user_id', user.id).limit(80),
        supabase.from('memory_edges').select('id, source_node_id, target_node_id').eq('user_id', user.id).limit(200),
      ]);
      if (nodesRes.data?.length) {
        setNodes(initPositions(nodesRes.data.map(n => ({ id: n.id, title: n.title, type: n.type, x: 0, y: 0, vx: 0, vy: 0 }))));
        setEdges((edgesRes.data || []).map(e => ({ id: e.id, source: e.source_node_id, target: e.target_node_id })));
      }
    }
    load();
  }, [user, isDemo]);

  // Physics loop
  useEffect(() => {
    let running = true;

    function tick() {
      if (!running) return;
      setNodes(prev => {
        const next = prev.map(n => ({ ...n }));
        const N = next.length;

        // Repulsion
        for (let i = 0; i < N; i++) {
          for (let j = i + 1; j < N; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = REPULSION / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            next[i].vx -= fx; next[i].vy -= fy;
            next[j].vx += fx; next[j].vy += fy;
          }
        }

        // Spring attraction
        for (const edge of edges) {
          const a = next.find(n => n.id === edge.source);
          const b = next.find(n => n.id === edge.target);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = SPRING_K * (dist - SPRING_LEN);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }

        // Center gravity
        const cx = W / 2, cy = H / 2;
        for (const n of next) {
          n.vx += (cx - n.x) * 0.003;
          n.vy += (cy - n.y) * 0.003;
        }

        // Integrate + damp + boundary
        for (const n of next) {
          if (n.id === dragging) continue; // skip dragged node
          n.vx *= DAMPING; n.vy *= DAMPING;
          n.x += n.vx; n.y += n.vy;
          n.x = Math.max(40, Math.min(W - 40, n.x));
          n.y = Math.max(40, Math.min(H - 40, n.y));
        }

        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [edges, dragging]);

  const getSVGCoords = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  }, [zoom]);

  const onPointerDown = (e, nodeId) => {
    e.stopPropagation();
    setDragging(nodeId);
    setSelectedNode(nodeId);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const { x, y } = getSVGCoords(e);
    setNodes(prev => prev.map(n => n.id === dragging ? { ...n, x, y, vx: 0, vy: 0 } : n));
  };

  const onPointerUp = () => setDragging(null);

  const filteredNodes = search
    ? nodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    : nodes;

  const highlightIds = new Set(filteredNodes.map(n => n.id));

  return (
    <div className="page-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <h1 className="page-title">Memory Graph</h1>
        <p className="page-subtitle">Visualize and explore your neural data connections.</p>
      </header>

      <div className="glass-card" style={{ flex: 1, minHeight: '560px', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '6px 12px', flex: 1, minWidth: '160px', maxWidth: '300px' }}>
            <Search size={14} color="var(--color-text-secondary)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes…"
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--color-text-primary)', fontSize: '13px', width: '100%' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0 }}><X size={13} /></button>}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.2))} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><ZoomIn size={14} /></button>
            <button onClick={() => setZoom(z => Math.max(0.4, z - 0.2))} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><ZoomOut size={14} /></button>
            <button onClick={() => setZoom(1)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><Maximize2 size={14} /></button>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {Object.entries(TYPE_COLORS).filter(([k]) => k !== 'default').map(([type, color]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                {type}
              </div>
            ))}
          </div>
        </div>

        {/* SVG Graph */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: '10px', background: 'rgba(0,0,0,0.25)', cursor: dragging ? 'grabbing' : 'default' }}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
            {/* Edges */}
            {edges.map(edge => {
              const a = nodes.find(n => n.id === edge.source);
              const b = nodes.find(n => n.id === edge.target);
              if (!a || !b) return null;
              const highlight = highlightIds.has(edge.source) && highlightIds.has(edge.target);
              return (
                <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={highlight ? 'rgba(0,243,255,0.3)' : 'rgba(255,255,255,0.07)'}
                  strokeWidth={highlight ? 1.5 : 1}
                  style={{ transition: 'stroke 0.3s' }}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const color = TYPE_COLORS[node.type] || TYPE_COLORS.default;
              const isSelected = selectedNode === node.id;
              const isHighlighted = highlightIds.has(node.id);
              const r = isSelected ? 14 : 10;

              return (
                <g key={node.id} style={{ cursor: 'grab' }}
                  onPointerDown={e => onPointerDown(e, node.id)}>
                  {/* Glow */}
                  {isSelected && (
                    <circle cx={node.x} cy={node.y} r={r + 8} fill={color} opacity={0.15} />
                  )}
                  {/* Node circle */}
                  <circle cx={node.x} cy={node.y} r={r} fill={color}
                    opacity={isHighlighted ? 1 : 0.35}
                    style={{ filter: isSelected ? `drop-shadow(0 0 8px ${color})` : 'none', transition: 'r 0.2s, opacity 0.3s' }}
                  />
                  {/* Label */}
                  {(isHighlighted || isSelected) && (
                    <text x={node.x} y={node.y + r + 14} textAnchor="middle"
                      fill={isSelected ? 'white' : 'rgba(255,255,255,0.7)'}
                      fontSize={isSelected ? 11 : 10} fontWeight={isSelected ? 700 : 500}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {node.title.length > 22 ? node.title.slice(0, 22) + '…' : node.title}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Selected node detail panel */}
          {selectedNode && (() => {
            const n = nodes.find(x => x.id === selectedNode);
            if (!n) return null;
            const connectedEdges = edges.filter(e => e.source === n.id || e.target === n.id);
            return (
              <div style={{
                position: 'absolute', top: 12, right: 12, background: 'rgba(10,10,20,0.92)',
                border: '1px solid rgba(0,243,255,0.2)', borderRadius: '12px', padding: '16px',
                width: '220px', backdropFilter: 'blur(8px)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: TYPE_COLORS[n.type] || TYPE_COLORS.default, marginTop: '3px', flexShrink: 0 }} />
                  <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', marginLeft: 'auto', padding: 0 }}><X size={14} /></button>
                </div>
                <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px', lineHeight: 1.3 }}>{n.title}</p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Type: <span style={{ color: TYPE_COLORS[n.type] }}>{n.type}</span></p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{connectedEdges.length} connection{connectedEdges.length !== 1 ? 's' : ''}</p>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
