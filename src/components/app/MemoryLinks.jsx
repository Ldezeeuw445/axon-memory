import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { buildLinkGraph, layoutLinkGraph } from '../../lib/linkGraph';
import { ago } from './ui';

/**
 * Terrain — "How it connects" (spec §37 step 13). Every dot is one of the
 * person's memories, threads or named things; every line is a stored link.
 * Read with the person's own session, so RLS decides what exists here.
 */
const GOLD = '#FFB733';
const TITANIUM = '#8E9499';
const EDGE = {
  thread: { stroke: 'rgba(142,148,153,0.28)', width: 0.8 },
  entity: { stroke: 'rgba(255,183,51,0.22)', width: 0.8 },
  supersedes: { stroke: 'rgba(255,217,138,0.85)', width: 1.2, dash: '3 3' },
  relates: { stroke: 'rgba(255,183,51,0.4)', width: 1 },
  weaves: { stroke: 'rgba(255,183,51,0.4)', width: 1 },
  contradicts: { stroke: 'rgba(142,148,153,0.7)', width: 1, dash: '1 3' },
};
const WORDS = { thread: 'same thread', entity: 'same person or thing', supersedes: 'replaced', relates: 'related', weaves: 'woven together', contradicts: 'disagree' };

async function chunked(ids, fetchChunk) {
  const out = [];
  for (let i = 0; i < ids.length; i += 80) {
    const { data } = await fetchChunk(ids.slice(i, i + 80));
    out.push(...(data || []));
  }
  return out;
}

function useLinkData(userId) {
  const [data, setData] = useState(null);
  const [issue, setIssue] = useState(null);
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    (async () => {
      try {
        const cols = 'id, title, content, project_id, superseded_by, retired_at, occurred_at, source_type';
        const [mem, proj, ents, links, rels] = await Promise.all([
          supabase.from('memory_items').select(cols).eq('user_id', userId)
            .or('project_id.not.is.null,superseded_by.not.is.null').order('occurred_at', { ascending: false }).limit(500),
          supabase.from('projects').select('id, name, colour').eq('user_id', userId),
          supabase.from('entities').select('id, name, kind').eq('user_id', userId).limit(1000),
          // Memories reached through a named thing or a relation come back in the same request.
          supabase.from('entity_links').select(`entity_id, memory_item_id, m:memory_items(${cols})`).eq('user_id', userId).limit(3000),
          supabase.from('memory_relations').select(`from_memory_id, to_memory_id, kind, f:memory_items!memory_relations_from_memory_id_fkey(${cols}), t:memory_items!memory_relations_to_memory_id_fkey(${cols})`).eq('user_id', userId).limit(2000),
        ]);
        if (mem.error) throw mem.error;
        const all = new Map((mem.data || []).map((m) => [m.id, m]));
        for (const l of links.data || []) if (l.m) all.set(l.m.id, l.m);
        for (const r of rels.data || []) { if (r.f) all.set(r.f.id, r.f); if (r.t) all.set(r.t.id, r.t); }
        const have = new Set(all.keys());
        // Anything still missing (a newer memory outside any thread) is read in one more pass.
        const missing = [...new Set([
          ...(links.data || []).map((l) => l.memory_item_id),
          ...(rels.data || []).flatMap((r) => [r.from_memory_id, r.to_memory_id]),
          ...(mem.data || []).map((m) => m.superseded_by).filter(Boolean),
        ])].filter((id) => !have.has(id));
        const extra = missing.length ? await chunked(missing.slice(0, 400), (ids) => supabase.from('memory_items').select(cols).in('id', ids)) : [];
        if (!live) return;
        setData({ memories: [...all.values(), ...extra], projects: proj.data || [], entities: ents.data || [], entityLinks: (links.data || []).map(({ entity_id, memory_item_id }) => ({ entity_id, memory_item_id })), relations: (rels.data || []).map(({ from_memory_id, to_memory_id, kind }) => ({ from_memory_id, to_memory_id, kind })) });
      } catch {
        if (live) setIssue('The links could not be read just now. Nothing about them changed.');
      }
    })();
    return () => { live = false; };
  }, [userId]);
  return { data, issue };
}

export default function MemoryLinks() {
  const { user } = useAuth();
  const { data, issue } = useLinkData(user?.id);
  const box = useRef(null);
  const [size, setSize] = useState({ w: 360, h: 560 });
  const [sel, setSel] = useState(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(280, Math.round(e.contentRect.width)), h: Math.max(360, Math.round(e.contentRect.height)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => (data ? buildLinkGraph(data, { maxMemories: size.w < 500 ? 110 : 170 }) : null), [data, size.w]);
  const pos = useMemo(() => (graph ? layoutLinkGraph(graph, { width: size.w, height: size.h, inset: size.w < 700 ? { top: 128, bottom: 170, left: 34, right: 34 } : { top: 110, bottom: 130, left: 90, right: 90 } }) : null), [graph, size.w, size.h]);
  const byId = useMemo(() => new Map((graph?.nodes || []).map((n) => [n.id, n])), [graph]);
  const near = useMemo(() => {
    if (!sel || !graph) return null;
    const s = new Set([sel]);
    for (const e of graph.edges) { if (e.a === sel) s.add(e.b); if (e.b === sel) s.add(e.a); }
    return s;
  }, [sel, graph]);

  const empty = graph && graph.nodes.length === 0;
  const selected = sel ? byId.get(sel) : null;
  const neighbours = selected ? graph.edges.filter((e) => e.a === sel || e.b === sel).map((e) => ({ e, other: byId.get(e.a === sel ? e.b : e.a) })) : [];

  return (
    <div ref={box} className="ax-links" style={{ position: 'absolute', inset: 0 }} onClick={(ev) => { if (ev.target === ev.currentTarget || ev.target.tagName === 'svg') setSel(null); }}>
      {issue && <div className="ax-links-note">{issue}</div>}
      {!data && !issue && <div className="ax-links-note">Settling…</div>}
      {empty && (
        <div className="ax-links-note">
          No links yet. They form when memories share a thread or a named person or thing, or when a newer memory replaces an older one.
        </div>
      )}
      {graph && pos && !empty && (
        <svg width={size.w} height={size.h} style={{ display: 'block' }} className="ax-links-svg" role="img" aria-label={`${graph.nodes.length} memories, threads and named things joined by ${graph.edges.length} links`}>
          <defs>
            <marker id="ax-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="rgba(255,217,138,0.9)" /></marker>
          </defs>
          <g>
            {graph.edges.map((e, i) => {
              const a = pos.get(e.a), b = pos.get(e.b), st = EDGE[e.kind];
              const on = !near || (near.has(e.a) && near.has(e.b));
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={st.stroke} strokeWidth={on && near ? st.width + 0.6 : st.width} strokeDasharray={st.dash} opacity={on ? 1 : 0.12} markerEnd={e.kind === 'supersedes' ? 'url(#ax-arrow)' : undefined} />;
            })}
          </g>
          <g>
            {graph.nodes.map((n) => {
              const p = pos.get(n.id);
              const on = !near || near.has(n.id);
              const isSel = sel === n.id;
              const common = { opacity: on ? 1 : 0.18, style: { cursor: 'pointer' }, onClick: (ev) => { ev.stopPropagation(); setSel(isSel ? null : n.id); } };
              if (n.type === 'thread') {
                return (
                  <g key={n.id} {...common} transform={`translate(${p.x},${p.y})`}>
                    <circle r={isSel ? 11 : 9} fill="rgba(5,7,10,0.9)" stroke={n.colour || GOLD} strokeWidth={1.4} />
                    <circle r={3} fill={n.colour || GOLD} />
                    <text y={-14} textAnchor="middle" className="ax-links-label ax-links-label-thread">{n.label}</text>
                  </g>
                );
              }
              if (n.type === 'entity') {
                return (
                  <g key={n.id} {...common} transform={`translate(${p.x},${p.y})`}>
                    <rect x={-4} y={-4} width={8} height={8} transform="rotate(45)" fill="rgba(5,7,10,0.9)" stroke={GOLD} strokeWidth={1} opacity={0.9} />
                    <text y={-9} textAnchor="middle" className="ax-links-label">{n.label}</text>
                  </g>
                );
              }
              const r = isSel ? 5.5 : 3.4;
              return <circle key={n.id} {...common} cx={p.x} cy={p.y} r={r} fill={n.superseded ? 'rgba(142,148,153,0.45)' : isSel ? '#FFD98A' : 'rgba(230,232,235,0.82)'} stroke={isSel ? GOLD : 'none'} />;
            })}
          </g>
        </svg>
      )}

      {graph && !empty && !selected && (
        <div className="ax-links-legend" aria-hidden>
          <span><i style={{ background: TITANIUM }} />thread</span>
          <span><i className="dia" />same person or thing</span>
          <span><i className="dash" />replaced by newer</span>
          <span className="ax-links-count">{graph.nodes.filter((n) => n.type === 'memory').length} memories · {graph.edges.length} links</span>
        </div>
      )}

      {selected && (
        <div className="ax-links-sheet" role="dialog" aria-label="Selected">
          <button className="ax-icon-btn" aria-label="Close" onClick={() => setSel(null)} style={{ position: 'absolute', top: 10, right: 10 }}><X size={16} /></button>
          {selected.type === 'memory' ? (
            <>
              <div className="ax-section-label" style={{ marginBottom: 6 }}>{selected.superseded ? 'Replaced memory' : 'Memory'}{selected.at ? ` · ${ago(selected.at)}` : ''}</div>
              <div className="ax-links-text">{String(selected.row.content || selected.row.title || '').slice(0, 280)}</div>
            </>
          ) : (
            <>
              <div className="ax-section-label" style={{ marginBottom: 6 }}>{selected.type === 'thread' ? 'Thread' : selected.kind || 'Named in your memories'}</div>
              <div className="ax-card-title">{selected.label}</div>
            </>
          )}
          <div className="ax-links-rel">
            {neighbours.slice(0, 6).map(({ e, other }, i) => (
              <button key={i} type="button" onClick={() => setSel(other.id)}>
                <span className="ax-meta">{selected.type !== 'memory' && other.at ? ago(other.at) : e.kind === 'supersedes' ? (e.a === sel ? 'replaces' : 'replaced by') : WORDS[e.kind]}</span>
                <span className="ax-links-rel-label">{other.label}</span>
              </button>
            ))}
            {neighbours.length > 6 && <div className="ax-meta">and {neighbours.length - 6} more</div>}
          </div>
        </div>
      )}
    </div>
  );
}
