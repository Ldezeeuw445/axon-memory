import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import DataLandscape from '../components/DataLandscape';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import FragmentPanel from '../components/FragmentPanel';
import { DATA_SOURCES, AI_PROVIDERS } from '../lib/logos';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import MemoryLinks from '../components/app/MemoryLinks';

const TYPE_COLORS = {
  document:  '#00f3ff',
  goal:      '#bf6fff',
  research:  '#f59e0b',
  technical: '#10b981',
  interview: '#f97316',
  default:   '#94a3b8',
};

// Real memories for whichever summit is open. The panel used to render
// "Ingested snippet #1/2/3" regardless of what was stored — three invented
// rows sitting next to a live memory graph.
function useSourceMemories(sourceId, userId) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!sourceId || !userId || !isSupabaseConfigured) {
      setItems(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('memory_items')
      .select('id, title, content, content_type, occurred_at')
      .eq('user_id', userId)
      .in('source_type', sourceId === 'manual' ? ['manual', 'app'] : [sourceId])
      .order('occurred_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!cancelled) setItems(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId, userId]);

  return items;
}

export default function MemoryGraph({ asFacet }) {
  const { user } = useAuth();
  const [selectedSource, setSelectedSource] = useState(null);
  // What share of everything AXON holds came from this one source. The panel
  // said "summit height reflects how much this source has contributed" and then
  // gave no number, which is a caption rather than an answer.
  const [shares, setShares] = useState(null);
  const sourceMemories = useSourceMemories(selectedSource, user?.id);
  // Two readings of the same memory: where it comes from, and how it connects.
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'links' ? 'links' : 'sources';
  const setView = (v) => setParams((p) => { if (v === 'links') p.set('view', 'links'); else p.delete('view'); return p; }, { replace: true });

  useEffect(() => {
    if (!user || !supabase) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('memory_source_breakdown', { p_user_id: user.id });
      if (!cancelled) setShares(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isMobile = window.innerWidth < 500;

  return (
    <div className={asFacet ? "" : "page-container"} style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: asFacet ? '0' : '16px' }}>
      {!asFacet && (
        <header className="page-header" style={{ marginBottom: 12 }}>
          <h1 className="page-title">Terrain</h1>
          <p className="page-subtitle">Where your memory came from, at a glance.</p>
        </header>
      )}

      <div
        className={asFacet ? '' : 'glass-card'}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0,
          minHeight: asFacet ? 0 : (isMobile ? 340 : 480), position: 'relative',
        }}
      >
        
        <div className="ax-terrain-switch" role="group" aria-label="Terrain view">
          <button type="button" aria-pressed={view === 'sources'} onClick={() => setView('sources')}>Where it comes from</button>
          <button type="button" aria-pressed={view === 'links'} onClick={() => { setSelectedSource(null); setView('links'); }}>How it connects</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', borderRadius: asFacet ? 0 : 10, background: 'transparent' }}>
          {view === 'links' ? <MemoryLinks /> : <DataLandscape onNodeSelect={(id) => setSelectedSource(id)} />}
        </div>

        {/* Selected Source Sidebar */}
        {view === 'sources' && selectedSource && (() => {
          const sourceInfo = [...DATA_SOURCES, ...AI_PROVIDERS].find(x => x.id === selectedSource)
            || (selectedSource === 'manual' ? { name: 'You', tagline: 'What you captured yourself, here or through an AI you use.', color: '#FFB733' } : { name: selectedSource.charAt(0).toUpperCase() + selectedSource.slice(1), tagline: 'A connected source.', color: '#FFB733' });
          
          return (
            <FragmentPanel style={{
              /* Clears the header. The panel started at the same corner the
                 account name and Sign Out occupy, and the header carries a far
                 higher stacking order, so the two drew over each other. */
              position: 'absolute', top: 78, right: 16, bottom: 16,
              width: isMobile ? 'calc(100% - 32px)' : '350px',
              display: 'flex', flexDirection: 'column',
              zIndex: 20,
              overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: sourceInfo.color || TYPE_COLORS.document }} />
                  <span style={{ fontSize: 13, color: sourceInfo.color || TYPE_COLORS.document, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Where it came from</span>
                </div>
                <button onClick={() => setSelectedSource(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 4 }}><X size={20} /></button>
              </div>
              <h2 style={{ fontWeight: 700, fontSize: 24, marginBottom: 8, lineHeight: 1.3, color: 'white' }}>{sourceInfo.name}</h2>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
                {sourceInfo.tagline}
              </div>
              
              {(() => {
                const total = (shares ?? []).reduce((sum, r) => sum + Number(r.item_count || 0), 0);
                const mine = Number((shares ?? []).find((r) => r.source_type === selectedSource)?.item_count || 0);
                const pct = total ? Math.round((mine / total) * 100) : 0;
                return (
                  <div style={{ marginBottom: 24, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 28, fontWeight: 700, color: 'white', lineHeight: 1 }}>{pct}%</span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        of your memory — {mine.toLocaleString()} of {total.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: sourceInfo.color || TYPE_COLORS.document, borderRadius: 4, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 10, lineHeight: 1.5 }}>
                      Summit height is this share — the more a source contributes, the higher its peak.
                    </div>
                  </div>
                );
              })()}
              
              <div>
                <h3 style={{ fontSize: 14, color: 'white', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>Recent memories</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sourceMemories === null ? (
                    <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Settling…</span>
                  ) : sourceMemories.length === 0 ? (
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                      Nothing from here yet.
                    </span>
                  ) : (
                    sourceMemories.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                          transition: 'all 0.2s', border: '1px solid transparent'
                        }}
                        onMouseOver={ev => {
                          ev.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                          ev.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                        }}
                        onMouseOut={ev => {
                          ev.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                          ev.currentTarget.style.borderColor = 'transparent';
                        }}
                      >
                        <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: TYPE_COLORS[m.content_type] || TYPE_COLORS.default }} />
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.title || (m.content || '').slice(0, 48) || 'Untitled memory'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </FragmentPanel>
          );
        })()}
      </div>

    </div>
  );
}
