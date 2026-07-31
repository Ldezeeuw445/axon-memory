import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Search, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
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
  document:  '#00f3ff',
  goal:      '#bf6fff',
  research:  '#f59e0b',
  technical: '#10b981',
  interview: '#f97316',
  default:   '#94a3b8',
};

const REPULSION = 4000, SPRING_K = 0.05, SPRING_LEN = 130, DAMPING = 0.82;

function initPositions(nodes, W, H) {
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.3;
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0 };
  });
}

export default function MemoryGraph() {
  const { user, isDemo } = useAuth();
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 480 });
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState(DEMO_EDGES);
  const [selectedNode, setSelectedNode] = useState(null);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(null);
  const rafRef = useRef(null);
  const svgRef = useRef(null);

  // Measure container and re-init positions
  useEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.max(rect.width || 320, 280);
      const h = Math.max(rect.height || 360, 280);
      setDims({ w, h });
      setNodes(initPositions(DEMO_NODES, w, h));
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Load from Supabase
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || isDemo || !dims.w) return;
    async function load() {
      const [nodesRes, edgesRes] = await Promise.all([
        supabase.from('memory_nodes').select('id, title, type').eq('user_id', user.id).limit(80),
        supabase.from('memory_edges').select('id, source_node_id, target_node_id').eq('user_id', user.id).limit(200),
      ]);
      if (nodesRes.data?.length) {
        setNodes(initPositions(
          nodesRes.data.map(n => ({ id: n.id, title: n.title, type: n.type, x: 0, y: 0, vx: 0, vy: 0 })),
          dims.w, dims.h
        ));
        setEdges((edgesRes.data || []).map(e => ({ id: e.id, source: e.source_node_id, target: e.target_node_id })));
      }
    }
    load();
  }, [user, isDemo, dims.w]);

  // Physics loop
  useEffect(() => {
    if (!nodes.length) return;
    const { w: W, h: H } = dims;
    let running = true;
    function tick() {
      if (!running) return;
      setNodes(prev => {
        const next = prev.map(n => ({ ...n }));
        const N = next.length;
        for (let i = 0; i < N; i++) {
          for (let j = i + 1; j < N; j++) {
            const dx = next[j].x - next[i].x, dy = next[j].y - next[i].y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = REPULSION / (dist * dist);
            const fx = (dx / dist) * force, fy = (dy / dist) * force;
            next[i].vx -= fx; next[i].vy -= fy;
            next[j].vx += fx; next[j].vy += fy;
          }
        }
        for (const edge of edges) {
          const a = next.find(n => n.id === edge.source);
          const b = next.find(n => n.id === edge.target);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = SPRING_K * (dist - SPRING_LEN);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
        const cx = W / 2, cy = H / 2;
        for (const n of next) {
          n.vx += (cx - n.x) * 0.003;
          n.vy += (cy - n.y) * 0.003;
        }
        for (const n of next) {
          if (n.id === dragging) continue;
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
  }, [edges, dragging, dims]);

  const getSVGCoords = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }, [zoom]);

  const onPointerDown = (e, nodeId) => {
    e.stopPropagation();
    setDragging(nodeId);
    setSelectedNode(nodeId);
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
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

  const { w: W, h: H } = dims;

  // Node radius — larger on mobile for touch
  const isMobile = W < 500;
  const baseR = isMobile ? 13 : 10;
  const selR  = isMobile ? 17 : 14;

  return (
    <div className="page-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '16px' }}>
      <header className="page-header" style={{ marginBottom: 12 }}>
        <h1 className="page-title">Memory Graph</h1>
        <p className="page-subtitle">Visualize and explore your neural data connections.</p>
      </header>

      <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px', minHeight: isMobile ? 340 : 480 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '7px 10px', flex: 1, minWidth: 120 }}>
            <Search size={13} color="var(--color-text-secondary)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes…"
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--color-text-primary)', fontSize: 13, width: '100%' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0, display: 'flex' }}><X size={12} /></button>}
          </div>
          {/* Zoom controls */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { label: <ZoomIn size={14} />, action: () => setZoom(z => Math.min(2, z + 0.2)) },
              { label: <ZoomOut size={14} />, action: () => setZoom(z => Math.max(0.3, z - 0.2)) },
              { label: <Maximize2 size={14} />, action: () => setZoom(1) },
            ].map(({ label, action }, i) => (
              <button key={i} onClick={action} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', minWidth: 36, minHeight: 36, justifyContent: 'center' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend — hidden on very small screens */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            {Object.entries(TYPE_COLORS).filter(([k]) => k !== 'default').map(([type, color]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                {type}
              </div>
            ))}
          </div>
        )}

        {/* SVG Graph — fills remaining space */}
        <div
          ref={containerRef}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 10, background: 'rgba(0,0,0,0.25)', cursor: dragging ? 'grabbing' : 'default', minHeight: isMobile ? 260 : 360 }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {W > 0 && (
            <svg ref={svgRef} width="100%" height="100%"
              viewBox={`0 0 ${W} ${H}`}
              style={{ display: 'block', transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            >
              {edges.map(edge => {
                const a = nodes.find(n => n.id === edge.source);
                const b = nodes.find(n => n.id === edge.target);
                if (!a || !b) return null;
                const hl = highlightIds.has(edge.source) && highlightIds.has(edge.target);
                return (
                  <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={hl ? 'rgba(0,243,255,0.3)' : 'rgba(255,255,255,0.07)'}
                    strokeWidth={hl ? 1.5 : 1}
                    style={{ transition: 'stroke 0.3s' }}
                  />
                );
              })}

              {nodes.map(node => {
                const color = TYPE_COLORS[node.type] || TYPE_COLORS.default;
                const isSelected = selectedNode === node.id;
                const isHighlighted = highlightIds.has(node.id);
                const r = isSelected ? selR : baseR;
                return (
                  <g key={node.id} style={{ cursor: 'grab' }} onPointerDown={e => onPointerDown(e, node.id)}>
                    {isSelected && <circle cx={node.x} cy={node.y} r={r + 10} fill={color} opacity={0.12} />}
                    <circle cx={node.x} cy={node.y} r={r} fill={color}
                      opacity={isHighlighted ? 1 : 0.3}
                      style={{ filter: isSelected ? `drop-shadow(0 0 8px ${color})` : 'none', transition: 'opacity 0.3s' }}
                    />
                    {(isHighlighted || isSelected) && (
                      <text x={node.x} y={node.y + r + (isMobile ? 16 : 14)} textAnchor="middle"
                        fill={isSelected ? 'white' : 'rgba(255,255,255,0.7)'}
                        fontSize={isSelected ? (isMobile ? 12 : 11) : (isMobile ? 11 : 10)}
                        fontWeight={isSelected ? 700 : 500}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {node.title.length > (isMobile ? 16 : 22) ? node.title.slice(0, isMobile ? 16 : 22) + '…' : node.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {/* Selected node panel */}
          {selectedNode && (() => {
            const n = nodes.find(x => x.id === selectedNode);
            if (!n) return null;
            const connectedEdges = edges.filter(e => e.source === n.id || e.target === n.id);
            return (
              <div style={{
                position: 'absolute', top: 10, right: 10,
                background: 'rgba(8,8,18,0.94)', border: '1px solid rgba(0,243,255,0.2)',
                borderRadius: 12, padding: '14px', width: isMobile ? 160 : 210,
                backdropFilter: 'blur(10px)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: TYPE_COLORS[n.type] || TYPE_COLORS.default }} />
                  <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', marginLeft: 'auto', padding: 0, display: 'flex' }}><X size={14} /></button>
                </div>
                <p style={{ fontWeight: 700, fontSize: isMobile ? 12 : 14, marginBottom: 4, lineHeight: 1.3 }}>{n.title}</p>
                <p style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  <span style={{ color: TYPE_COLORS[n.type] }}>{n.type}</span> · {connectedEdges.length} link{connectedEdges.length !== 1 ? 's' : ''}
                </p>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
